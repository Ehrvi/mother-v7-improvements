/**
 * SHMSDashboardDisplay — G-Trust Sentinel primary display
 *
 * Uses synthetic data per user request while software is in development.
 * Shows KPI grid, structure list with SVG Health Rings and risk indicators.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Activity, AlertTriangle, Radio, Shield, ArrowRight } from 'lucide-react';
import { T, icoldColor, riskColor, riskLabel, HealthRing } from '@/lib/shmsHelpers';

export default function SHMSDashboardDisplay() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/shms/v2/dashboard/all', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (error) return <div className="p-8 text-red-400">Erro: {error}</div>;
  if (!data) return <div className="p-8 animate-pulse text-white/50">Carregando telemetria...</div>;

  const totalSensors = data.structures?.reduce((acc: number, s: any) => acc + (s.sensors?.length || 0), 0) || 0;
  const avgHealth = Math.round(data.avgHealthScore || 80);
  const mqttText = data.mqttConnected ? 'Conectado' : 'Desconectado';

  const SHMS_KPIS = [
    { icon: Activity, label: 'Sensores Ativos', value: totalSensors, color: T.green },
    { icon: Shield, label: 'Health Index Global', value: `${avgHealth}%`, color: T.green },
    { icon: AlertTriangle, label: 'Alertas Críticos', value: data.activeAlerts || 0, color: data.activeAlerts > 0 ? T.red : T.text },
    { icon: Radio, label: 'MQTT Status', value: mqttText, color: data.mqttConnected ? T.blue : T.red },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto" style={{ background: 'var(--void-deepest, oklch(6% 0.02 280))' }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, oklch(55% 0.20 195), oklch(45% 0.18 220))' }}>
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: T.text }}>G-Trust Sentinel</h1>
            <p className="text-xs" style={{ color: T.dim }}>SHMS · Monitoramento de Ativos Geotécnicos</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/shms')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: T.blueBg, border: `1px solid ${T.blueBorder}`, color: T.blue }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = T.blue)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = T.blueBorder)}
        >
          Dashboard Legacy <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-5">
        {SHMS_KPIS.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-xl p-4 transition-all" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4" style={{ color }} />
              <span className="text-xs font-medium" style={{ color: T.muted }}>{label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Structure Grid */}
      <div className="px-6 pb-6 flex-1">
        <h3 className="text-sm font-semibold mb-4" style={{ color: T.text }}>Estruturas Monitoradas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.structures.map((s: any) => {
            const rc = riskColor(s.risk);
            return (
              <div key={s.id} className="rounded-xl p-4 flex gap-4 transition-all cursor-pointer hover:border-blue-500/50"
                  style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                <HealthRing value={s.health} status={s.status} />
                <div>
                  <div className="text-sm font-bold" style={{ color: T.text }}>{s.name}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold"
                          style={{ background: `${rc}20`, border: `1px solid ${rc}50`, color: rc }}>
                      {riskLabel(s.risk)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: T.blueBg, color: T.blue }}>
                      Nível {s.level}
                    </span>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {s.sensors.map((type: string) => (
                      <span key={type} className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.dim }}>
                        {type.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
