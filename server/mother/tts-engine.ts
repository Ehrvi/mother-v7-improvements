/**
 * TTS Engine — server/mother/tts-engine.ts
 * MOTHER v99.0 | Ciclo C216 | NC-TTS-001
 *
 * Text-to-Speech engine using OpenAI TTS API (tts-1, tts-1-hd).
 * Enables MOTHER to generate audio responses, SHMS voice alerts,
 * and narrated reports.
 *
 * Scientific basis:
 * - Wang et al. (2023) "Neural Codec Language Models are Zero-Shot Text to Speech Synthesizers"
 *   arXiv:2301.02111 — VALL-E neural TTS
 * - Shen et al. (2023) "NaturalSpeech 2: Latent Diffusion Models are Natural and Zero-Shot Speech Synthesizers"
 *   arXiv:2304.09116 — diffusion-based TTS
 * - OpenAI TTS API Documentation (2024) — tts-1, tts-1-hd models
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface TTSRequest {
  text: string;
  voice?: TTSVoice;
  model?: TTSModel;
  format?: TTSFormat;
  speed?: number;           // 0.25 to 4.0 (default: 1.0)
  outputPath?: string;      // Local file path to save audio
}

export interface TTSResult {
  success: boolean;
  audioPath?: string;       // Local file path
  audioBuffer?: Buffer;     // Raw audio bytes
  durationEstimateMs?: number;  // Estimated audio duration
  characters: number;
  model: string;
  voice: string;
  error?: string;
  processingMs: number;
}

const TTS_API_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_CHARS = 4096;  // OpenAI TTS limit

// Voice characteristics for selection guidance
const VOICE_PROFILES: Record<TTSVoice, { gender: string; tone: string; useCase: string }> = {
  alloy: { gender: 'neutral', tone: 'balanced', useCase: 'general purpose' },
  echo: { gender: 'male', tone: 'deep', useCase: 'narration, reports' },
  fable: { gender: 'male', tone: 'expressive', useCase: 'storytelling' },
  onyx: { gender: 'male', tone: 'authoritative', useCase: 'technical, professional' },
  nova: { gender: 'female', tone: 'energetic', useCase: 'alerts, notifications' },
  shimmer: { gender: 'female', tone: 'soft', useCase: 'calm, instructional' },
};

/**
 * Detect if a query requests TTS/audio generation.
 */
export function detectTTSRequest(query: string): {
  isTTSRequest: boolean;
  text?: string;
  voice?: TTSVoice;
} {
  const ttsPatterns = [
    /(?:gerar|criar|produzir|sintetizar)\s+(?:áudio|audio|voz|narração|narration)/i,
    /(?:falar|dizer|narrar|ler em voz alta)/i,
    /text.to.speech|TTS|síntese\s+de\s+voz/i,
    /(?:convert|transformar).*(?:texto|text).*(?:áudio|audio|voz|speech)/i,
  ];

  for (const pattern of ttsPatterns) {
    if (pattern.test(query)) {
      // Try to extract voice preference
      let voice: TTSVoice | undefined;
      const voiceMatch = query.match(/\b(alloy|echo|fable|onyx|nova|shimmer)\b/i);
      if (voiceMatch) voice = voiceMatch[1].toLowerCase() as TTSVoice;

      return { isTTSRequest: true, voice };
    }
  }

  return { isTTSRequest: false };
}

/**
 * Generate speech from text using OpenAI TTS API.
 */
export async function generateSpeech(request: TTSRequest): Promise<TTSResult> {
  const start = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'OPENAI_API_KEY not configured',
      characters: 0,
      model: request.model ?? 'tts-1',
      voice: request.voice ?? 'onyx',
      processingMs: Date.now() - start,
    };
  }

  const text = request.text.slice(0, MAX_CHARS);
  const voice = request.voice ?? 'onyx';
  const model = request.model ?? 'tts-1';
  const format = request.format ?? 'mp3';
  const speed = Math.min(4.0, Math.max(0.25, request.speed ?? 1.0));

  const payload = JSON.stringify({ model, input: text, voice, response_format: format, speed });

  try {
    const audioBuffer = await callTTSAPI(payload, apiKey);

    // Save to file if path provided
    let audioPath: string | undefined;
    if (request.outputPath) {
      const dir = path.dirname(request.outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(request.outputPath, audioBuffer);
      audioPath = request.outputPath;
    } else {
      // Save to temp file
      audioPath = `/tmp/mother-tts-${Date.now()}.${format}`;
      fs.writeFileSync(audioPath, audioBuffer);
    }

    // Estimate duration: ~150 words/min, ~5 chars/word
    const wordCount = text.split(/\s+/).length;
    const durationEstimateMs = (wordCount / 150) * 60 * 1000;

    return {
      success: true,
      audioPath,
      audioBuffer,
      durationEstimateMs,
      characters: text.length,
      model,
      voice,
      processingMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      characters: text.length,
      model,
      voice,
      processingMs: Date.now() - start,
    };
  }
}

async function callTTSAPI(payload: string, apiKey: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.openai.com',
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`TTS API error ${res.statusCode}: ${buffer.toString('utf-8')}`));
        } else {
          resolve(buffer);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Generate SHMS voice alert.
 */
export async function generateSHMSVoiceAlert(
  sensorId: string,
  alertLevel: 'INFO' | 'WARNING' | 'CRITICAL',
  message: string
): Promise<TTSResult> {
  const voiceByLevel: Record<string, TTSVoice> = {
    INFO: 'alloy',
    WARNING: 'nova',
    CRITICAL: 'onyx',
  };

  const alertText = `Alerta SHMS. ${alertLevel === 'CRITICAL' ? 'CRÍTICO. ' : ''}Sensor ${sensorId}. ${message}`;

  return generateSpeech({
    text: alertText,
    voice: voiceByLevel[alertLevel] ?? 'onyx',
    model: alertLevel === 'CRITICAL' ? 'tts-1-hd' : 'tts-1',
    format: 'mp3',
    outputPath: `/tmp/shms-alert-${sensorId}-${Date.now()}.mp3`,
  });
}

/**
 * Generate TTS capability description for system prompt.
 */
export function generateTTSDescription(): string {
  return [
    '## NC-TTS-001: TEXT-TO-SPEECH DISPONÍVEL',
    'MOTHER pode gerar áudio a partir de texto via OpenAI TTS.',
    `Vozes disponíveis: ${Object.keys(VOICE_PROFILES).join(', ')}`,
    'Modelos: tts-1 (rápido), tts-1-hd (alta qualidade)',
    'Formatos: mp3, wav, opus, aac, flac',
    'Limite: 4096 caracteres por chamada',
  ].join('\n');
}
