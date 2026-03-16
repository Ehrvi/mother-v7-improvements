/**
 * DgmTest — Pagina dedicada para testes DGM com relatorio completo
 *
 * Permite:
 * 1. Configurar benchmark queries (custom ou padrao)
 * 2. Rodar 1 geracao DGM com sandbox + provas cientificas
 * 3. Visualizar resultados em 4 tabs com detalhes completos
 * 4. Ver historico de runs anteriores
 *
 * Scientific basis: Darwin Gödel Machine (arXiv:2505.22954, Zhang et al. 2025)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

/* ── Types ── */

interface VariantInfo {
  id: string;
  parentId: string;
  generation: number;
  accuracy: number;
  childrenCount: number;
  strategy: string;
  isCompiled: boolean;
  createdAt: string;
  proofHash: string;
  diagnosisHash?: string;
  modificationHash?: string;
  benchmarkHash?: string;
  sandboxHash?: string;
  sandboxPassed?: boolean;
  sandboxType?: string;
}

interface ScientificProof {
  reproducibility: {
    valid: boolean;
    parentProofHash: string;
    modificationHash: string;
    childProofHash: string;
    recomputedChildHash: string;
    hashesMatch: boolean;
  };
  empiricalGain: {
    valid: boolean;
    parentAccuracy: number;
    childAccuracy: number;
    delta: number;
    verdict: 'improvement' | 'neutral' | 'regression';
    parentResolvedCount: number;
    childResolvedCount: number;
    benchmarkSize: number;
  };
  integrity: {
    valid: boolean;
    safetyGatePassed: boolean;
    safetyHash: string;
    sandboxPassed: boolean;
    sandboxHash: string;
    sandboxOutput: string;
    sandboxDurationMs: number;
    preApplyValidation: boolean;
  };
  overallValid: boolean;
  timestamp: string;
}

interface TestResult {
  generation: {
    generation: number;
    childrenIds: string[];
    childrenCompiledIds: string[];
    archiveSize: number;
    bestAccuracy: number;
    generationHash: string;
    timestamp: string;
    scientificProofs: ScientificProof[];
  };
  archive: {
    size: number;
    variants: VariantInfo[];
    bestVariantId: string | null;
    bestAccuracy: number;
    initialAccuracy: number;
    archiveHash: string;
  };
  tree: Array<{
    id: string;
    parentId: string;
    generation: number;
    accuracy: number;
    children: string[];
  }>;
  elapsedMs: number;
  timestamp: string;
}

type TabId = 'report' | 'proofs' | 'hashes' | 'tree' | 'log';

/* ── Component ── */

export default function DgmTest() {
  const navigate = useNavigate();
  const [customQueries, setCustomQueries] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('report');
  const [error, setError] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<Array<{ result: TestResult; startedAt: string }>>([]);

  const testMutation = trpc.mother.dgmTestRun.useMutation({
    onSuccess: (data) => {
      const r = data as TestResult;
      setResult(r);
      setError(null);
      setRunHistory(prev => [{ result: r, startedAt: r.timestamp }, ...prev].slice(0, 10));
    },
    onError: (err) => {
      setError(err.message);
      setResult(null);
    },
  });

  const handleRun = () => {
    const queries = customQueries.trim()
      ? customQueries.split('\n').filter(q => q.trim()).map((q, i) => ({
          id: `custom-${String(i + 1).padStart(3, '0')}`,
          query: q.trim(),
          expectedMinQuality: 50,
          category: 'custom',
        }))
      : [];

    testMutation.mutate({
      benchmarkQueries: queries.length > 0 ? queries : undefined,
      selfImproveSize: 1,
    });
  };

  const isRunning = testMutation.isPending;
  const proofs = result?.generation.scientificProofs ?? [];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#08081a',
      color: '#e0e0ff',
      fontFamily: 'monospace',
    }}>
      {/* Top bar */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid #2d2d4e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(139, 92, 246, 0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none', border: '1px solid #2d2d4e', borderRadius: '6px',
              color: '#6060a0', cursor: 'pointer', padding: '4px 10px', fontSize: '12px',
            }}
          >
            &#x2190; Home
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#8b5cf6' }}>
              DGM Test Lab
            </div>
            <div style={{ color: '#4040a0', fontSize: '10px' }}>
              Darwin Gödel Machine (arXiv:2505.22954) — Sandbox + Provas Científicas SHA-256
            </div>
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={isRunning}
          style={{
            background: isRunning ? '#2d2d4e' : 'linear-gradient(135deg, #8b5cf6, #4a9eff)',
            color: isRunning ? '#6060a0' : '#fff',
            border: 'none', borderRadius: '8px', padding: '10px 24px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '14px',
            boxShadow: isRunning ? 'none' : '0 2px 16px rgba(139, 92, 246, 0.4)',
          }}
        >
          {isRunning ? 'Executando DGM...' : 'Rodar Teste DGM'}
        </button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 54px)' }}>

        {/* Left panel: Config + Run History */}
        <div style={{
          width: '280px',
          borderRight: '1px solid #2d2d4e',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          {/* Benchmark config */}
          <div style={{ padding: '14px' }}>
            <Label>Benchmark Queries</Label>
            <textarea
              value={customQueries}
              onChange={e => setCustomQueries(e.target.value)}
              placeholder={"1 query por linha\nEx: O que é DGM?\nEx: Como funciona o fitness?\n\n(vazio = benchmark padrão)"}
              disabled={isRunning}
              rows={6}
              style={{
                width: '100%', background: '#0f0f1a', border: '1px solid #2d2d4e',
                borderRadius: '6px', color: '#e0e0ff', padding: '8px',
                fontFamily: 'monospace', fontSize: '11px', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: '8px', fontSize: '10px', color: '#4040a0' }}>
              Pipeline: Diagnose &#x2192; Modify &#x2192; Safety &#x2192; Fitness &#x2192; <strong style={{ color: '#8b5cf6' }}>Sandbox</strong> &#x2192; Apply &#x2192; Benchmark
            </div>
          </div>

          {/* Running indicator */}
          {isRunning && (
            <div style={{
              margin: '0 14px', padding: '12px', borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.08)', border: '1px solid #8b5cf640',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '18px', marginBottom: '6px' }}>&#x21BB;</div>
              <div style={{ fontSize: '11px', color: '#8b5cf6' }}>Executando pipeline DGM...</div>
              <div style={{ fontSize: '9px', color: '#4040a0', marginTop: '4px' }}>~3-5 min (chamadas LLM reais)</div>
            </div>
          )}

          {/* Run history */}
          <div style={{ padding: '14px', borderTop: '1px solid #2d2d4e', marginTop: '8px' }}>
            <Label>Historico de Runs</Label>
            {runHistory.length === 0 ? (
              <div style={{ fontSize: '10px', color: '#4040a0', padding: '8px 0' }}>
                Nenhum run executado ainda
              </div>
            ) : (
              runHistory.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setResult(h.result); setActiveTab('report'); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: result === h.result ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.02)',
                    border: result === h.result ? '1px solid #8b5cf640' : '1px solid #2d2d4e',
                    borderRadius: '6px', padding: '8px', marginBottom: '4px',
                    cursor: 'pointer', color: '#e0e0ff', fontFamily: 'monospace', fontSize: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4a9eff' }}>Run #{runHistory.length - i}</span>
                    <span style={{ color: '#ffa04a' }}>{(h.result.archive.bestAccuracy * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ color: '#4040a0', marginTop: '2px' }}>
                    {h.result.archive.size} variantes | {h.result.generation.scientificProofs.length} provas | {(h.result.elapsedMs / 1000).toFixed(0)}s
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Error */}
          {error && (
            <div style={{
              margin: '14px', padding: '12px 16px', borderRadius: '8px',
              background: 'rgba(255, 96, 96, 0.1)', border: '1px solid #ff606040',
              color: '#ff6060', fontSize: '12px',
            }}>
              Erro: {error}
            </div>
          )}

          {/* Empty state */}
          {!result && !isRunning && !error && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: '#4040a0',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x1F9EC;</div>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>DGM Test Lab</div>
                <div style={{ fontSize: '11px', maxWidth: '400px', lineHeight: 1.6 }}>
                  Clique em <strong style={{ color: '#8b5cf6' }}>Rodar Teste DGM</strong> para executar
                  1 geracao completa com sandbox isolado e provas cientificas SHA-256.
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Stats bar */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                borderBottom: '1px solid #2d2d4e',
              }}>
                {[
                  { label: 'Variantes', value: String(result.archive.size), color: '#a0a0c0' },
                  { label: 'Filhos', value: String(result.generation.childrenIds.length), color: '#4a9eff' },
                  { label: 'Compilados', value: String(result.generation.childrenCompiledIds.length), color: '#4aff9e' },
                  { label: 'Best Acc', value: `${(result.archive.bestAccuracy * 100).toFixed(1)}%`, color: '#ffa04a' },
                  { label: 'Provas', value: `${proofs.filter(p => p.overallValid).length}/${proofs.length}`, color: proofs.every(p => p.overallValid) ? '#4aff9e' : '#ff6060' },
                  { label: 'Tempo', value: `${(result.elapsedMs / 1000).toFixed(0)}s`, color: '#8b5cf6' },
                ].map(stat => (
                  <div key={stat.label} style={{
                    padding: '10px 8px', textAlign: 'center',
                    borderRight: '1px solid #2d2d4e',
                  }}>
                    <div style={{ color: stat.color, fontWeight: 700, fontSize: '16px' }}>{stat.value}</div>
                    <div style={{ color: '#4040a0', fontSize: '10px' }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #2d2d4e' }}>
                {([
                  { id: 'report' as TabId, label: 'Relatorio' },
                  { id: 'proofs' as TabId, label: `Provas Cientificas (${proofs.length})` },
                  { id: 'hashes' as TabId, label: 'SHA-256 Hashes' },
                  { id: 'tree' as TabId, label: 'Arvore Evolutiva' },
                  { id: 'log' as TabId, label: 'Log Completo' },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1, background: activeTab === tab.id ? 'rgba(139, 92, 246, 0.1)' : 'none',
                      border: 'none',
                      borderBottom: activeTab === tab.id ? '2px solid #8b5cf6' : '2px solid transparent',
                      color: activeTab === tab.id ? '#8b5cf6' : '#6060a0',
                      cursor: 'pointer', padding: '10px 8px', fontSize: '11px',
                      fontWeight: activeTab === tab.id ? 700 : 400,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: '16px 20px' }}>

                {/* Report tab */}
                {activeTab === 'report' && (
                  <div>
                    <SectionTitle>Resultado da Geracao</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <InfoCard label="Geracao" value={String(result.generation.generation)} />
                      <InfoCard label="Archive" value={`${result.generation.archiveSize} variantes`} />
                      <InfoCard label="Best Accuracy" value={`${(result.generation.bestAccuracy * 100).toFixed(1)}%`} />
                      <InfoCard label="Filhos" value={`${result.generation.childrenIds.length} gerados, ${result.generation.childrenCompiledIds.length} compilados`} />
                      <InfoCard label="Tempo" value={`${(result.elapsedMs / 1000).toFixed(1)}s`} />
                      <InfoCard label="Sandbox" value={result.archive.variants.some(v => v.sandboxPassed) ? 'PASSED' : result.archive.variants.length > 1 ? 'BLOCKED (correto)' : 'N/A'} color={result.archive.variants.some(v => v.sandboxPassed) ? '#4aff9e' : '#ffa04a'} />
                    </div>

                    <SectionTitle>Variantes no Archive</SectionTitle>
                    {result.archive.variants.map(v => (
                      <div key={v.id} style={{
                        padding: '12px', marginBottom: '8px',
                        background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                        borderLeft: `3px solid ${v.accuracy >= 0.8 ? '#4aff9e' : v.accuracy >= 0.5 ? '#ffa04a' : '#ff6060'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#4a9eff', fontWeight: 700, fontSize: '13px' }}>{v.id}</span>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {v.sandboxPassed !== undefined && (
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                                background: v.sandboxPassed ? 'rgba(74, 255, 158, 0.15)' : 'rgba(255, 96, 96, 0.15)',
                                color: v.sandboxPassed ? '#4aff9e' : '#ff6060',
                              }}>
                                SANDBOX {v.sandboxPassed ? 'OK' : 'FAIL'}
                              </span>
                            )}
                            <span style={{ color: '#ffa04a', fontWeight: 700 }}>{(v.accuracy * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        <div style={{ color: '#6060a0', fontSize: '10px', marginTop: '4px' }}>
                          Gen {v.generation} | Parent: {v.parentId || '(root)'} | {v.strategy.slice(0, 100)}
                        </div>
                        <div style={{ color: '#4040a0', fontSize: '9px', marginTop: '2px' }}>
                          proof: {v.proofHash.slice(0, 24)}...
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Scientific Proofs tab */}
                {activeTab === 'proofs' && (
                  <div>
                    {proofs.length === 0 ? (
                      <div style={{
                        padding: '40px', textAlign: 'center', color: '#6060a0',
                        background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                      }}>
                        <div style={{ fontSize: '24px', marginBottom: '12px' }}>&#x1F50D;</div>
                        <div style={{ fontSize: '13px', marginBottom: '8px' }}>Nenhuma prova cientifica gerada</div>
                        <div style={{ fontSize: '11px', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>
                          Isso acontece quando o sandbox bloqueia todas as modificacoes (correto!) ou
                          nenhum filho foi compilado. O pipeline esta funcionando — rejeitou codigo invalido
                          antes de aplicar.
                        </div>
                      </div>
                    ) : (
                      proofs.map((proof, i) => (
                        <div key={i} style={{
                          marginBottom: '20px',
                          border: `1px solid ${proof.overallValid ? '#4aff9e30' : '#ff606030'}`,
                          borderRadius: '10px', overflow: 'hidden',
                        }}>
                          {/* Proof header */}
                          <div style={{
                            padding: '12px 16px',
                            background: proof.overallValid ? 'rgba(74, 255, 158, 0.05)' : 'rgba(255, 96, 96, 0.05)',
                            borderBottom: '1px solid #2d2d4e',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#e0e0ff' }}>
                              Prova Cientifica #{i + 1}
                            </span>
                            <span style={{
                              padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                              background: proof.overallValid ? 'rgba(74, 255, 158, 0.15)' : 'rgba(255, 96, 96, 0.15)',
                              color: proof.overallValid ? '#4aff9e' : '#ff6060',
                            }}>
                              {proof.overallValid ? 'VALIDA' : 'INVALIDA'}
                            </span>
                          </div>

                          <div style={{ padding: '16px' }}>
                            {/* Proof 1 */}
                            <ProofBlock
                              num="1"
                              title="REPRODUTIBILIDADE"
                              subtitle="Hash chain deterministico parent → child (Schmidhuber, 2007)"
                              valid={proof.reproducibility.valid}
                              rows={[
                                ['Parent Proof Hash', proof.reproducibility.parentProofHash],
                                ['Modification Hash', proof.reproducibility.modificationHash],
                                ['Child Proof Hash', proof.reproducibility.childProofHash],
                                ['Recomputed Hash', proof.reproducibility.recomputedChildHash],
                                ['Deterministico', proof.reproducibility.hashesMatch ? 'SIM' : 'NAO'],
                              ]}
                            />

                            {/* Proof 2 */}
                            <ProofBlock
                              num="2"
                              title="GANHO EMPIRICO"
                              subtitle="Before/after benchmark comparison (Zhang et al., 2025)"
                              valid={proof.empiricalGain.valid}
                              rows={[
                                ['Parent Accuracy', `${(proof.empiricalGain.parentAccuracy * 100).toFixed(1)}% (${proof.empiricalGain.parentResolvedCount}/${proof.empiricalGain.benchmarkSize} resolved)`],
                                ['Child Accuracy', `${(proof.empiricalGain.childAccuracy * 100).toFixed(1)}% (${proof.empiricalGain.childResolvedCount}/${proof.empiricalGain.benchmarkSize} resolved)`],
                                ['Delta', `${proof.empiricalGain.delta >= 0 ? '+' : ''}${(proof.empiricalGain.delta * 100).toFixed(1)} percentage points`],
                                ['Veredicto', proof.empiricalGain.verdict.toUpperCase()],
                              ]}
                              highlight={proof.empiricalGain.verdict === 'improvement' ? '#4aff9e' : proof.empiricalGain.verdict === 'neutral' ? '#ffa04a' : '#ff6060'}
                            />

                            {/* Proof 3 */}
                            <ProofBlock
                              num="3"
                              title="INTEGRIDADE"
                              subtitle="Anti-objective-hacking via sandbox + safety gate (Sakana AI)"
                              valid={proof.integrity.valid}
                              rows={[
                                ['Safety Gate', proof.integrity.safetyGatePassed ? 'PASSED' : 'FAILED'],
                                ['Safety Hash', proof.integrity.safetyHash],
                                ['Sandbox', proof.integrity.sandboxPassed ? 'PASSED' : 'FAILED'],
                                ['Sandbox Hash', proof.integrity.sandboxHash],
                                ['Sandbox Duration', `${proof.integrity.sandboxDurationMs}ms`],
                                ['Pre-Apply Validation', proof.integrity.preApplyValidation ? 'SIM (antes do commit)' : 'NAO'],
                              ]}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Hashes tab */}
                {activeTab === 'hashes' && (
                  <div>
                    <SectionTitle>Archive Hash (SHA-256)</SectionTitle>
                    <HashRow label="archiveHash" value={result.archive.archiveHash} />
                    <HashRow label="generationHash" value={result.generation.generationHash} />

                    <SectionTitle>Proof Hashes por Variante</SectionTitle>
                    {result.archive.variants.map(v => (
                      <div key={v.id} style={{
                        padding: '12px', marginBottom: '10px',
                        background: 'rgba(139, 92, 246, 0.04)', borderRadius: '8px',
                        border: '1px solid #2d2d4e',
                      }}>
                        <div style={{ color: '#8b5cf6', fontWeight: 700, marginBottom: '8px', fontSize: '12px' }}>
                          {v.id} <span style={{ color: '#4040a0', fontWeight: 400 }}>(Gen {v.generation})</span>
                        </div>
                        <HashRow label="proofHash" value={v.proofHash} />
                        {v.diagnosisHash && <HashRow label="diagnosisHash" value={v.diagnosisHash} />}
                        {v.modificationHash && <HashRow label="modificationHash" value={v.modificationHash} />}
                        {v.benchmarkHash && <HashRow label="benchmarkHash" value={v.benchmarkHash} />}
                        {v.sandboxHash && <HashRow label="sandboxHash" value={v.sandboxHash} />}
                        {v.sandboxPassed !== undefined && (
                          <div style={{ marginTop: '4px', fontSize: '10px' }}>
                            <span style={{ color: '#6060a0' }}>sandbox: </span>
                            <span style={{ color: v.sandboxPassed ? '#4aff9e' : '#ff6060', fontWeight: 700 }}>
                              {v.sandboxPassed ? 'PASSED' : 'FAILED'}
                            </span>
                            {v.sandboxType && <span style={{ color: '#4040a0' }}> ({v.sandboxType})</span>}
                          </div>
                        )}
                      </div>
                    ))}

                    <SectionTitle>Proof Chain</SectionTitle>
                    <div style={{
                      padding: '12px', background: 'rgba(139, 92, 246, 0.04)',
                      borderRadius: '8px', border: '1px solid #2d2d4e',
                      fontSize: '10px', wordBreak: 'break-all', color: '#a0a0c0', lineHeight: 2,
                    }}>
                      {result.archive.variants.map((v, i) => (
                        <span key={v.id}>
                          {i > 0 && <span style={{ color: '#8b5cf6' }}> &#x2192; </span>}
                          <span style={{ color: '#4a9eff' }}>{v.id.slice(0, 16)}</span>
                          <span style={{ color: '#4040a0' }}>:{v.proofHash.slice(0, 12)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tree tab */}
                {activeTab === 'tree' && (
                  <div>
                    <SectionTitle>Arvore Evolutiva</SectionTitle>
                    {result.tree.map(node => {
                      const indent = node.generation * 32;
                      return (
                        <div key={node.id} style={{
                          marginLeft: `${indent}px`,
                          padding: '8px 12px', marginBottom: '6px',
                          background: 'rgba(255,255,255,0.02)', borderRadius: '6px',
                          borderLeft: `3px solid ${(node.accuracy ?? 0) >= 0.8 ? '#4aff9e' : '#ffa04a'}`,
                        }}>
                          {node.generation > 0 && <span style={{ color: '#6060a0' }}>&#x2514;&#x2192; </span>}
                          <span style={{ color: '#4a9eff', fontWeight: 700 }}>{node.id}</span>
                          <span style={{ color: '#6060a0', marginLeft: '10px', fontSize: '11px' }}>
                            gen={node.generation} | acc={((node.accuracy ?? 0) * 100).toFixed(1)}% | children={node.children?.length ?? 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Log tab */}
                {activeTab === 'log' && (
                  <div>
                    <SectionTitle>JSON Completo (para debug/auditoria)</SectionTitle>
                    <pre style={{
                      background: '#0a0a16', border: '1px solid #2d2d4e',
                      borderRadius: '8px', padding: '14px',
                      fontSize: '10px', color: '#a0a0c0',
                      overflowX: 'auto', whiteSpace: 'pre-wrap',
                      maxHeight: '600px', overflowY: 'auto',
                    }}>
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ── Subcomponents ── */

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    color: '#6060a0', fontSize: '10px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: '6px',
  }}>
    {children}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    color: '#8b5cf6', fontWeight: 700, fontSize: '12px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginTop: '16px', marginBottom: '8px', paddingBottom: '4px',
    borderBottom: '1px solid #2d2d4e',
  }}>
    {children}
  </div>
);

const InfoCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{
    padding: '10px 12px', background: 'rgba(255,255,255,0.02)',
    borderRadius: '6px', border: '1px solid #2d2d4e',
  }}>
    <div style={{ color: '#4040a0', fontSize: '10px', marginBottom: '2px' }}>{label}</div>
    <div style={{ color: color ?? '#e0e0ff', fontWeight: 700, fontSize: '13px' }}>{value}</div>
  </div>
);

const HashRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ marginBottom: '4px', fontSize: '10px' }}>
    <span style={{ color: '#6060a0' }}>{label}: </span>
    <code style={{
      color: '#4aff9e', background: 'rgba(74, 255, 158, 0.05)',
      padding: '1px 4px', borderRadius: '3px', wordBreak: 'break-all',
    }}>
      {value}
    </code>
  </div>
);

const ProofBlock: React.FC<{
  num: string;
  title: string;
  subtitle: string;
  valid: boolean;
  rows: Array<[string, string]>;
  highlight?: string;
}> = ({ num, title, subtitle, valid, rows, highlight }) => (
  <div style={{
    marginBottom: '14px', padding: '12px',
    background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
    borderLeft: `3px solid ${valid ? '#4aff9e' : '#ff6060'}`,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
      <div>
        <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '12px' }}>{num}. {title}</span>
        <span style={{ color: '#4040a0', fontSize: '9px', marginLeft: '8px' }}>{subtitle}</span>
      </div>
      <span style={{
        color: valid ? '#4aff9e' : '#ff6060', fontSize: '10px', fontWeight: 700,
      }}>
        {valid ? 'VALIDO' : 'INVALIDO'}
      </span>
    </div>
    {rows.map(([label, value]) => (
      <div key={label} style={{
        display: 'flex', justifyContent: 'space-between', padding: '3px 0',
        fontSize: '10px', borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}>
        <span style={{ color: '#6060a0', flexShrink: 0 }}>{label}</span>
        <span style={{
          color: highlight && label === 'Veredicto' ? highlight :
                 value.length > 24 ? '#4aff9e' : '#e0e0ff',
          fontWeight: label === 'Veredicto' || label === 'Deterministico' ? 700 : 400,
          maxWidth: '65%', wordBreak: 'break-all', textAlign: 'right',
          fontFamily: value.length > 24 ? 'monospace' : 'inherit',
          fontSize: value.length > 48 ? '9px' : '10px',
        }}>
          {value}
        </span>
      </div>
    ))}
  </div>
);
