// server/mother/shms-cognitive-bridge.ts
// C314: SHMS Cognitive Bridge — Connect sensor data to MOTHER's cognitive pipeline
// Base: GeoMCP (arXiv:2603.01022); Sun et al. (2025) SHM with ML

import { createLogger } from '../_core/logger';
const log = createLogger('SHMSCognitiveBridge');

export interface SensorReading {
  timestamp: string; // ISO 8601
  value: number;
  unit: 'kPa' | 'mm' | '°C' | 'g' | 'deg' | 'mV';
}

export interface SHMSAnalysisRequest {
  sensorId: string;
  dataType: 'Piezometer' | 'Inclinometer' | 'StrainGauge' | 'Accelerometer' | 'Thermometer';
  recentReadings: SensorReading[];
  context: {
    location: string;
    projectName?: string;
    lastMaintenance?: string;
    weather?: string;
    alertThresholds?: { warning: number; critical: number };
  };
}

export interface SHMSAnalysisResult {
  sensorId: string;
  alertLevel: 'GREEN' | 'YELLOW' | 'RED';
  diagnosis: string;
  trend: 'stable' | 'increasing' | 'decreasing' | 'anomalous';
  recommendations: string[];
  confidence: number; // 0-1
  analysisTime: number; // ms
  cognitiveResponse: string; // Full MOTHER response
}

/**
 * C314: Analyze sensor data using MOTHER's cognitive pipeline
 * This is the bridge between raw sensor data and MOTHER's intelligence
 */
export async function analyzeSensorData(
  request: SHMSAnalysisRequest
): Promise<SHMSAnalysisResult> {
  const startTime = Date.now();
  
  log.info('SHMS cognitive analysis requested', { 
    sensorId: request.sensorId, 
    dataType: request.dataType,
    readingCount: request.recentReadings.length 
  });
  
  // Compute basic statistics for context
  const values = request.recentReadings.map(r => r.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const latest = values[values.length - 1];
  const trend = computeTrend(values);
  
  // Build cognitive prompt
  const cognitivePrompt = buildCognitivePrompt(request, { mean, max, min, latest, trend });
  
  try {
    // Call MOTHER's core pipeline
    const { processQuery } = await import('./core');
    
    const result = await processQuery({
      query: cognitivePrompt,
      userId: 'shms-bridge',
      metadata: {
        isComplex: true,
        domain: 'shms',
        source: 'sensor-data',
        sensorId: request.sensorId
      }
    });
    
    // Parse the cognitive response to extract structured data
    const parsed = parseCognitiveResponse(result.response || result.content || '');
    
    const analysisResult: SHMSAnalysisResult = {
      sensorId: request.sensorId,
      alertLevel: parsed.alertLevel,
      diagnosis: parsed.diagnosis,
      trend: trend,
      recommendations: parsed.recommendations,
      confidence: parsed.confidence,
      analysisTime: Date.now() - startTime,
      cognitiveResponse: result.response || result.content || ''
    };
    
    log.info('SHMS cognitive analysis completed', {
      sensorId: request.sensorId,
      alertLevel: analysisResult.alertLevel,
      analysisTime: analysisResult.analysisTime
    });
    
    return analysisResult;
    
  } catch (error) {
    log.error('SHMS cognitive analysis failed', { error, sensorId: request.sensorId });
    
    // Fallback: rule-based analysis
    return fallbackRuleBasedAnalysis(request, { mean, max, min, latest, trend }, startTime);
  }
}

function buildCognitivePrompt(
  request: SHMSAnalysisRequest,
  stats: { mean: number; max: number; min: number; latest: number; trend: string }
): string {
  const thresholds = request.context.alertThresholds;
  const thresholdInfo = thresholds 
    ? `Limiares de alerta: Atenção=${thresholds.warning}, Crítico=${thresholds.critical}.`
    : 'Limiares de alerta: não definidos.';
  
  return `ANÁLISE GEOTÉCNICA SHMS — DADOS DE SENSOR EM TEMPO REAL

Sensor: ${request.sensorId} | Tipo: ${request.dataType} | Local: ${request.context.location}
Projeto: ${request.context.projectName || 'N/A'} | Clima: ${request.context.weather || 'N/A'}
Última manutenção: ${request.context.lastMaintenance || 'N/A'}
${thresholdInfo}

Estatísticas das últimas ${request.recentReadings.length} leituras:
- Valor atual: ${stats.latest.toFixed(3)} ${request.recentReadings[0]?.unit || ''}
- Média: ${stats.mean.toFixed(3)} | Máx: ${stats.max.toFixed(3)} | Mín: ${stats.min.toFixed(3)}
- Tendência: ${stats.trend}

Leituras recentes (JSON):
${JSON.stringify(request.recentReadings.slice(-10), null, 2)}

Com base nos dados acima e no seu conhecimento de geotecnia e monitoramento estrutural, forneça:
1. NÍVEL DE ALERTA: VERDE (normal), AMARELO (atenção) ou VERMELHO (crítico)
2. DIAGNÓSTICO: Identifique tendências, anomalias ou padrões preocupantes
3. CONFIANÇA: Sua confiança na análise (0-100%)
4. RECOMENDAÇÕES: Ações imediatas se necessário

Responda de forma estruturada e objetiva.`;
}

function computeTrend(values: number[]): 'stable' | 'increasing' | 'decreasing' | 'anomalous' {
  if (values.length < 3) return 'stable';
  
  const recentHalf = values.slice(Math.floor(values.length / 2));
  const earlyHalf = values.slice(0, Math.floor(values.length / 2));
  
  const recentMean = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
  const earlyMean = earlyHalf.reduce((a, b) => a + b, 0) / earlyHalf.length;
  
  const changePercent = Math.abs((recentMean - earlyMean) / earlyMean) * 100;
  
  // Check for anomaly (sudden spike)
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
  const lastValue = values[values.length - 1];
  if (Math.abs(lastValue - mean) > 3 * stdDev) return 'anomalous';
  
  if (changePercent < 2) return 'stable';
  return recentMean > earlyMean ? 'increasing' : 'decreasing';
}

function parseCognitiveResponse(response: string): {
  alertLevel: 'GREEN' | 'YELLOW' | 'RED';
  diagnosis: string;
  recommendations: string[];
  confidence: number;
} {
  const upper = response.toUpperCase();
  
  let alertLevel: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
  if (upper.includes('VERMELHO') || upper.includes('CRÍTICO') || upper.includes('RED')) {
    alertLevel = 'RED';
  } else if (upper.includes('AMARELO') || upper.includes('ATENÇÃO') || upper.includes('YELLOW')) {
    alertLevel = 'YELLOW';
  }
  
  // Extract confidence
  const confMatch = response.match(/confiança[:\s]+(\d+)%/i) || response.match(/confidence[:\s]+(\d+)%/i);
  const confidence = confMatch ? parseInt(confMatch[1]) / 100 : 0.7;
  
  // Extract recommendations
  const recommendations: string[] = [];
  const recPattern = new RegExp("recomenda.{0,20}[:\\s]+([\\s\\S]*?)(?:\\n\\n|\\n#|$)", "i");
  const recSection = response.match(recPattern);
  if (recSection) {
    const lines = recSection[1].split('\n').filter((l: string) => l.trim().length > 10);
    recommendations.push(...lines.slice(0, 3).map((l: string) => l.replace(/^[-*\d.]\s*/, '').trim()));
  }
  
  return {
    alertLevel,
    diagnosis: response.slice(0, 500),
    recommendations: recommendations.length > 0 ? recommendations : ['Monitorar continuamente', 'Verificar calibração do sensor'],
    confidence
  };
}

function fallbackRuleBasedAnalysis(
  request: SHMSAnalysisRequest,
  stats: { mean: number; max: number; min: number; latest: number; trend: string },
  startTime: number
): SHMSAnalysisResult {
  const thresholds = request.context.alertThresholds;
  let alertLevel: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
  
  if (thresholds) {
    if (stats.latest >= thresholds.critical) alertLevel = 'RED';
    else if (stats.latest >= thresholds.warning) alertLevel = 'YELLOW';
  } else if (stats.trend === 'anomalous') {
    alertLevel = 'YELLOW';
  }
  
  return {
    sensorId: request.sensorId,
    alertLevel,
    diagnosis: `Análise rule-based (fallback): valor atual ${stats.latest.toFixed(3)}, tendência ${stats.trend}`,
    trend: stats.trend as 'stable' | 'increasing' | 'decreasing' | 'anomalous',
    recommendations: ['Verificar dados manualmente', 'Consultar engenheiro geotécnico'],
    confidence: 0.5,
    analysisTime: Date.now() - startTime,
    cognitiveResponse: 'Fallback rule-based analysis (cognitive pipeline unavailable)'
  };
}

export { computeTrend, parseCognitiveResponse };
