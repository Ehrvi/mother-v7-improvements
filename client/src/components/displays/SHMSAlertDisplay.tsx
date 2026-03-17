/**
 * SHMSAlertDisplay — G-Trust Sentinel Alert Management
 *
 * Shows P1-P4 priority alarms based on IEC 62682:2014.
 * Uses synthetic data per user request.
 */
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { T } from '@/lib/shmsHelpers';

export default function SHMSAlertDisplay() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/shms/v2/dashboard/all', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      
      let allAlerts = [];
      if (json.alerts) {
        allAlerts = json.alerts;
      } else if (json.structures) {
        for (const s of json.structures) {
          for (let i = 0; i < (s.activeAlerts ?? 0); i++) {
            allAlerts.push({
              id: `${s.structureId}-alert-${i}`,
              severity: s.overallStatus === 'RED' ? 'critical' : 'warning',
              msg: `Alerta detectado pelo sistema experto em ${s.structureName} — sensor ${s.sensors[i]?.sensorId ?? '?'}`,
              sensor: s.sensors[i]?.sensorId ?? 'Desconhecido',
              struct: s.structureName,
              ts: s.timestamp || new Date().toISOString(),
            });
          }
        }
      }
      setAlerts(allAlerts);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const sevStyle = (sev: string) => {
    if (sev === 'critical') return { bg: T.redBg, border: T.redBorder, color: T.red, icon: XCircle, label: 'P1 - Crítico' };
    if (sev === 'warning') return { bg: T.yellowBg, border: T.yellowBorder, color: T.yellow, icon: AlertTriangle, label: 'P2 - Atenção' };
    return { bg: T.blueBg, border: T.blueBorder, color: T.blue, icon: ShieldAlert, label: 'P4 - Info' };
  };

  if (error) return <div className="p-8 text-red-400">Erro: {error}</div>;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto" style={{ background: 'var(--void-deepest, oklch(6% 0.02 280))' }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" style={{ color: T.yellow }} />
            Gestão de Alarmes
          </h2>
          <p className="text-sm" style={{ color: T.muted }}>
            IEC 62682:2014 · Sistema de Prioridade P1-P4
          </p>
        </div>
        <div className="flex gap-2">
          {['P1', 'P2', 'P3', 'P4'].map(p => (
            <div key={p} className="px-3 py-1 text-xs font-bold rounded" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.dim }}>
              {p}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="divide-y" style={{ borderColor: T.border }}>
          {alerts.map(a => {
            const st = sevStyle(a.severity);
            const Icon = st.icon;
            return (
              <div key={a.id} className="p-4 flex gap-4 hover:bg-white/5 transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                    <span className="text-xs flex items-center gap-1" style={{ color: T.dim }}>
                      <Clock className="w-3 h-3" /> {new Date(a.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-2" style={{ color: T.text }}>{a.msg}</p>
                  <div className="flex gap-3 text-xs" style={{ color: T.muted }}>
                    <span className="font-mono">ID: {a.id}</span>
                    <span>Estrutura: {a.struct}</span>
                    <span>Sensor: {a.sensor}</span>
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
