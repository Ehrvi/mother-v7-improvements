/**
 * DGMPanel — C202 Sprint 3 UX/UI
 * Painel de controle do DGM Loop com historico de versoes por run e ciclo
 *
 * Exibe: runs recentes, fitness scores, versoes C202-R001..., changelog
 * Permite: iniciar novo run, ver detalhes, exportar changelog
 *
 * Base: arXiv:2505.22954 Darwin Gödel Machine + Semantic Versioning 2.0.0
 */

import React, { useState, useCallback } from 'react';

interface DGMRun {
  runId: string;
  version: string;
  cycle: string;
  fitnessScore: number;
  success: boolean;
  phase: string;
  reason?: string;
  commitHash?: string;
  deployedAt?: string;
  timestamp: string;
  sandboxResult?: {
    passed: boolean;
    testsRun: number;
    testsPassed: number;
  };
  cryptographicProof?: string;
}

interface DGMPanelProps {
  runs?: DGMRun[];
  currentCycle?: string;
  currentVersion?: string;
  onTriggerRun?: () => Promise<void>;
  onViewRun?: (runId: string) => void;
  isRunning?: boolean;
}

type TabId = 'runs' | 'changelog' | 'config';

export const DGMPanel: React.FC<DGMPanelProps> = ({
  runs = [],
  currentCycle = 'C202',
  currentVersion = 'v83.0',
  onTriggerRun,
  onViewRun,
  isRunning = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('runs');
  const [selectedRun, setSelectedRun] = useState<DGMRun | null>(null);
  const [triggering, setTriggering] = useState(false);

  const handleTriggerRun = useCallback(async () => {
    if (!onTriggerRun || triggering || isRunning) return;
    setTriggering(true);
    try {
      await onTriggerRun();
    } finally {
      setTriggering(false);
    }
  }, [onTriggerRun, triggering, isRunning]);

  const successRuns = runs.filter(r => r.success);
  const avgFitness = successRuns.length > 0
    ? successRuns.reduce((s, r) => s + r.fitnessScore, 0) / successRuns.length
    : 0;

  const generateChangelog = (): string => {
    if (runs.length === 0) return '# Changelog\n\nNenhum run registrado ainda.';
    const lines = [`# MOTHER ${currentVersion} — Ciclo ${currentCycle} Changelog\n`];
    const grouped: Record<string, DGMRun[]> = {};
    runs.forEach(r => {
      if (!grouped[r.cycle]) grouped[r.cycle] = [];
      grouped[r.cycle].push(r);
    });
    Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).forEach(([cycle, cycleRuns]) => {
      lines.push(`\n## ${cycle}\n`);
      cycleRuns.forEach(r => {
        const icon = r.success ? '✓' : '✗';
        lines.push(`- ${icon} **${r.runId}** (${r.version}) — fitness=${r.fitnessScore.toFixed(4)} — ${r.phase}`);
        if (r.reason) lines.push(`  > ${r.reason}`);
        if (r.commitHash) lines.push(`  > commit: \`${r.commitHash.slice(0, 8)}\``);
      });
    });
    return lines.join('\n');
  };

  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2d2d4e',
      borderRadius: '12px',
      overflow: 'hidden',
      color: '#e0e0ff',
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #2d2d4e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(74, 158, 255, 0.05)',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#4a9eff' }}>DGM Loop Panel</div>
          <div style={{ color: '#6060a0', fontSize: '10px', marginTop: '2px' }}>
            {currentCycle} · {runs.length} runs · {successRuns.length} sucesso
          </div>
        </div>
        <button
          onClick={handleTriggerRun}
          disabled={triggering || isRunning || !onTriggerRun}
          style={{
            background: (triggering || isRunning) ? '#2d2d4e' : '#4a9eff',
            color: (triggering || isRunning) ? '#6060a0' : '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            cursor: (triggering || isRunning) ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: '12px',
            transition: 'all 0.2s',
          }}
        >
          {triggering || isRunning ? '⟳ Rodando...' : '▶ Novo Run'}
        </button>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderBottom: '1px solid #2d2d4e',
      }}>
        {[
          { label: 'Total', value: String(runs.length), color: '#a0a0c0' },
          { label: 'Sucesso', value: String(successRuns.length), color: '#4aff9e' },
          { label: 'Falhas', value: String(runs.length - successRuns.length), color: '#ff6060' },
          { label: 'Avg Fit', value: avgFitness > 0 ? avgFitness.toFixed(3) : 'N/A', color: '#ffa04a' },
        ].map(stat => (
          <div key={stat.label} style={{
            padding: '8px 12px',
            textAlign: 'center',
            borderRight: '1px solid #2d2d4e',
          }}>
            <div style={{ color: stat.color, fontWeight: 700, fontSize: '14px' }}>{stat.value}</div>
            <div style={{ color: '#4040a0', fontSize: '9px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2d2d4e' }}>
        {(['runs', 'changelog', 'config'] as TabId[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              background: activeTab === tab ? 'rgba(74, 158, 255, 0.1)' : 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #4a9eff' : '2px solid transparent',
              color: activeTab === tab ? '#4a9eff' : '#6060a0',
              cursor: 'pointer',
              padding: '8px',
              fontSize: '11px',
              fontWeight: activeTab === tab ? 700 : 400,
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>

        {/* Runs tab */}
        {activeTab === 'runs' && (
          <div>
            {runs.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#4040a0' }}>
                Nenhum run registrado. Clique em "Novo Run" para iniciar.
              </div>
            ) : (
              runs.slice().reverse().map(run => (
                <div
                  key={run.runId}
                  onClick={() => { setSelectedRun(selectedRun?.runId === run.runId ? null : run); onViewRun?.(run.runId); }}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #1a1a2e',
                    cursor: 'pointer',
                    background: selectedRun?.runId === run.runId ? 'rgba(74, 158, 255, 0.08)' : 'none',
                    borderLeft: `3px solid ${run.success ? '#4aff9e' : '#ff6060'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: run.success ? '#4aff9e' : '#ff6060', fontWeight: 700 }}>
                        {run.runId}
                      </span>
                      <span style={{ color: '#6060a0', marginLeft: '8px', fontSize: '10px' }}>
                        {run.version}
                      </span>
                    </div>
                    <div style={{ color: '#ffa04a', fontSize: '11px' }}>
                      {run.fitnessScore.toFixed(4)}
                    </div>
                  </div>
                  <div style={{ color: '#6060a0', fontSize: '10px', marginTop: '3px' }}>
                    {run.phase} · {new Date(run.timestamp).toLocaleTimeString()}
                    {run.reason && ` · ${run.reason}`}
                  </div>

                  {/* Expanded detail */}
                  {selectedRun?.runId === run.runId && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '6px',
                      fontSize: '10px',
                    }}>
                      {run.sandboxResult && (
                        <div style={{ marginBottom: '4px' }}>
                          Sandbox: {run.sandboxResult.testsPassed}/{run.sandboxResult.testsRun} testes
                          <span style={{ color: run.sandboxResult.passed ? '#4aff9e' : '#ff6060', marginLeft: '6px' }}>
                            {run.sandboxResult.passed ? '✓ PASS' : '✗ FAIL'}
                          </span>
                        </div>
                      )}
                      {run.commitHash && (
                        <div style={{ color: '#a0a0c0' }}>
                          Commit: <code>{run.commitHash.slice(0, 12)}</code>
                        </div>
                      )}
                      {run.cryptographicProof && (
                        <div style={{ color: '#4040a0', marginTop: '4px' }}>
                          Proof: <code>{run.cryptographicProof.slice(0, 20)}...</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Changelog tab */}
        {activeTab === 'changelog' && (
          <div style={{ padding: '14px' }}>
            <pre style={{
              color: '#a0a0c0',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              margin: 0,
              lineHeight: 1.6,
            }}>
              {generateChangelog()}
            </pre>
          </div>
        )}

        {/* Config tab */}
        {activeTab === 'config' && (
          <div style={{ padding: '14px' }}>
            <ConfigRow label="Ciclo" value={currentCycle} />
            <ConfigRow label="Versao" value={currentVersion} />
            <ConfigRow label="MCC Threshold" value="0.8500" />
            <ConfigRow label="Fitness Gate" value="0.8000" />
            <ConfigRow label="Sandbox Timeout" value="30s" />
            <ConfigRow label="Max Proposals" value="3" />
            <ConfigRow label="Dry Run" value={process.env.DGM_DRY_RUN === 'true' ? 'SIM' : 'NAO'} />
            <div style={{ marginTop: '12px', color: '#4040a0', fontSize: '10px' }}>
              Base: arXiv:2505.22954 Darwin Gödel Machine + Cohen (1988) MCC
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ConfigRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #1a1a2e',
  }}>
    <span style={{ color: '#6060a0' }}>{label}</span>
    <span style={{ color: '#e0e0ff', fontWeight: 700 }}>{value}</span>
  </div>
);

export default DGMPanel;
