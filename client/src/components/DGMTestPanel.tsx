/**
 * DGMTestPanel — Botão de teste DGM com relatório completo e proof hashes SHA-256
 *
 * Permite ao usuário:
 * 1. Digitar queries customizadas ou usar benchmark padrão
 * 2. Rodar 1 geração DGM com um clique
 * 3. Ver relatório completo: variantes, hashes, árvore evolutiva
 *
 * Scientific basis: Darwin Gödel Machine (arXiv:2505.22954)
 */

import React, { useState } from 'react';
import { trpc } from '../lib/trpc';

interface BenchmarkQuery {
  id: string;
  query: string;
  expectedMinQuality?: number;
  category?: string;
}

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

type TabId = 'report' | 'proofs' | 'hashes' | 'tree';

export const DGMTestPanel: React.FC = () => {
  const [customQuery, setCustomQuery] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('report');
  const [error, setError] = useState<string | null>(null);

  const testMutation = trpc.mother.dgmTestRun.useMutation({
    onSuccess: (data) => {
      setResult(data as TestResult);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      setResult(null);
    },
  });

  const handleRun = () => {
    const queries: BenchmarkQuery[] = customQuery.trim()
      ? customQuery.split('\n').filter(q => q.trim()).map((q, i) => ({
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

  return (
    <div style={{
      background: '#0f0f1a',
      border: '1px solid #2d2d4e',
      borderRadius: '12px',
      overflow: 'hidden',
      color: '#e0e0ff',
      fontFamily: 'monospace',
      fontSize: '12px',
      maxWidth: '700px',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #2d2d4e',
        background: 'linear-gradient(135deg, rgba(74, 158, 255, 0.08), rgba(139, 92, 246, 0.08))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#8b5cf6' }}>
              DGM Test Runner
            </div>
            <div style={{ color: '#6060a0', fontSize: '10px', marginTop: '2px' }}>
              Darwin Gödel Machine (arXiv:2505.22954) — SHA-256 Proof Hashes
            </div>
          </div>
          <button
            onClick={handleRun}
            disabled={isRunning}
            style={{
              background: isRunning ? '#2d2d4e' : 'linear-gradient(135deg, #8b5cf6, #4a9eff)',
              color: isRunning ? '#6060a0' : '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              transition: 'all 0.3s',
              boxShadow: isRunning ? 'none' : '0 2px 12px rgba(139, 92, 246, 0.3)',
            }}
          >
            {isRunning ? 'Rodando DGM...' : 'Rodar Teste DGM'}
          </button>
        </div>

        {/* Query input */}
        <div style={{ marginTop: '12px' }}>
          <textarea
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Queries customizadas (1 por linha) — deixe vazio para benchmark padrão"
            disabled={isRunning}
            rows={2}
            style={{
              width: '100%',
              background: '#1a1a2e',
              border: '1px solid #2d2d4e',
              borderRadius: '6px',
              color: '#e0e0ff',
              padding: '8px 10px',
              fontFamily: 'monospace',
              fontSize: '11px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Running indicator */}
      {isRunning && (
        <div style={{
          padding: '16px',
          textAlign: 'center',
          color: '#8b5cf6',
          borderBottom: '1px solid #2d2d4e',
        }}>
          <div style={{ fontSize: '20px', marginBottom: '8px', animation: 'spin 1s linear infinite' }}>
            &#x21BB;
          </div>
          <div style={{ fontSize: '12px' }}>Executando DGM outer loop...</div>
          <div style={{ fontSize: '10px', color: '#6060a0', marginTop: '4px' }}>
            Diagnose &#x2192; Modify &#x2192; Safety &#x2192; Fitness &#x2192; Benchmark &#x2192; Archive
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(255, 96, 96, 0.1)',
          borderBottom: '1px solid #2d2d4e',
          color: '#ff6060',
        }}>
          Erro: {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Stats bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            borderBottom: '1px solid #2d2d4e',
          }}>
            {[
              { label: 'Variantes', value: String(result.archive.size), color: '#a0a0c0' },
              { label: 'Filhos', value: String(result.generation.childrenIds.length), color: '#4a9eff' },
              { label: 'Compilados', value: String(result.generation.childrenCompiledIds.length), color: '#4aff9e' },
              { label: 'Best Acc', value: `${(result.archive.bestAccuracy * 100).toFixed(1)}%`, color: '#ffa04a' },
              { label: 'Tempo', value: `${(result.elapsedMs / 1000).toFixed(0)}s`, color: '#8b5cf6' },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '8px 6px',
                textAlign: 'center',
                borderRight: '1px solid #2d2d4e',
              }}>
                <div style={{ color: stat.color, fontWeight: 700, fontSize: '14px' }}>{stat.value}</div>
                <div style={{ color: '#4040a0', fontSize: '10px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2d2d4e' }}>
            {([
              { id: 'report' as TabId, label: 'Relatorio' },
              { id: 'proofs' as TabId, label: 'Provas Cientificas' },
              { id: 'hashes' as TabId, label: 'Hashes' },
              { id: 'tree' as TabId, label: 'Arvore' },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  background: activeTab === tab.id ? 'rgba(139, 92, 246, 0.1)' : 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #8b5cf6' : '2px solid transparent',
                  color: activeTab === tab.id ? '#8b5cf6' : '#6060a0',
                  cursor: 'pointer',
                  padding: '8px',
                  fontSize: '11px',
                  fontWeight: activeTab === tab.id ? 700 : 400,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>

            {/* Report tab */}
            {activeTab === 'report' && (
              <div style={{ padding: '14px' }}>
                <SectionTitle>Resultado da Geracao</SectionTitle>
                <InfoRow label="Geracao" value={String(result.generation.generation)} />
                <InfoRow label="Archive size" value={String(result.generation.archiveSize)} />
                <InfoRow label="Melhor accuracy" value={`${(result.generation.bestAccuracy * 100).toFixed(1)}%`} />
                <InfoRow label="Filhos gerados" value={String(result.generation.childrenIds.length)} />
                <InfoRow label="Filhos compilados" value={String(result.generation.childrenCompiledIds.length)} />
                <InfoRow label="Tempo execucao" value={`${(result.elapsedMs / 1000).toFixed(1)}s`} />

                <SectionTitle>Variantes no Archive</SectionTitle>
                {result.archive.variants.map(v => (
                  <div key={v.id} style={{
                    padding: '8px',
                    marginBottom: '6px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px',
                    borderLeft: `3px solid ${v.accuracy >= 0.8 ? '#4aff9e' : v.accuracy >= 0.5 ? '#ffa04a' : '#ff6060'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#4a9eff', fontWeight: 700 }}>{v.id}</span>
                      <span style={{ color: '#ffa04a' }}>{(v.accuracy * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ color: '#6060a0', fontSize: '10px', marginTop: '2px' }}>
                      Gen {v.generation} | Parent: {v.parentId || '(root)'} | {v.strategy.slice(0, 80)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scientific Proofs tab */}
            {activeTab === 'proofs' && (
              <div style={{ padding: '14px' }}>
                {result.generation.scientificProofs.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6060a0' }}>
                    Nenhuma prova gerada (nenhum filho compilado nesta geracao)
                  </div>
                ) : (
                  result.generation.scientificProofs.map((proof, i) => (
                    <div key={i} style={{
                      marginBottom: '16px',
                      border: `1px solid ${proof.overallValid ? '#4aff9e40' : '#ff606040'}`,
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}>
                      {/* Header */}
                      <div style={{
                        padding: '10px 14px',
                        background: proof.overallValid ? 'rgba(74, 255, 158, 0.05)' : 'rgba(255, 96, 96, 0.05)',
                        borderBottom: '1px solid #2d2d4e',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span style={{ fontWeight: 700, color: proof.overallValid ? '#4aff9e' : '#ff6060' }}>
                          Prova Cientifica #{i + 1}
                        </span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                          background: proof.overallValid ? 'rgba(74, 255, 158, 0.15)' : 'rgba(255, 96, 96, 0.15)',
                          color: proof.overallValid ? '#4aff9e' : '#ff6060',
                        }}>
                          {proof.overallValid ? 'VALIDA' : 'INVALIDA'}
                        </span>
                      </div>

                      <div style={{ padding: '12px 14px' }}>
                        {/* Proof 1: Reprodutibilidade */}
                        <ProofSection
                          title="1. REPRODUTIBILIDADE"
                          subtitle="Hash chain deterministico parent→child"
                          valid={proof.reproducibility.valid}
                          details={[
                            { label: 'Parent Hash', value: proof.reproducibility.parentProofHash },
                            { label: 'Modification Hash', value: proof.reproducibility.modificationHash },
                            { label: 'Child Hash', value: proof.reproducibility.childProofHash },
                            { label: 'Recomputed Hash', value: proof.reproducibility.recomputedChildHash },
                            { label: 'Deterministico', value: proof.reproducibility.hashesMatch ? 'SIM' : 'NAO' },
                          ]}
                        />

                        {/* Proof 2: Ganho Empírico */}
                        <ProofSection
                          title="2. GANHO EMPIRICO"
                          subtitle="Before/after benchmark comparison"
                          valid={proof.empiricalGain.valid}
                          details={[
                            { label: 'Parent Accuracy', value: `${(proof.empiricalGain.parentAccuracy * 100).toFixed(1)}% (${proof.empiricalGain.parentResolvedCount}/${proof.empiricalGain.benchmarkSize})` },
                            { label: 'Child Accuracy', value: `${(proof.empiricalGain.childAccuracy * 100).toFixed(1)}% (${proof.empiricalGain.childResolvedCount}/${proof.empiricalGain.benchmarkSize})` },
                            { label: 'Delta', value: `${proof.empiricalGain.delta >= 0 ? '+' : ''}${(proof.empiricalGain.delta * 100).toFixed(1)}pp` },
                            { label: 'Veredicto', value: proof.empiricalGain.verdict.toUpperCase() },
                          ]}
                          verdictColor={proof.empiricalGain.verdict === 'improvement' ? '#4aff9e' : proof.empiricalGain.verdict === 'neutral' ? '#ffa04a' : '#ff6060'}
                        />

                        {/* Proof 3: Integridade */}
                        <ProofSection
                          title="3. INTEGRIDADE"
                          subtitle="Anti-objective-hacking (sandbox + safety gate)"
                          valid={proof.integrity.valid}
                          details={[
                            { label: 'Safety Gate', value: proof.integrity.safetyGatePassed ? 'PASSED' : 'FAILED' },
                            { label: 'Safety Hash', value: proof.integrity.safetyHash },
                            { label: 'Sandbox', value: proof.integrity.sandboxPassed ? 'PASSED' : 'FAILED' },
                            { label: 'Sandbox Hash', value: proof.integrity.sandboxHash },
                            { label: 'Sandbox Duration', value: `${proof.integrity.sandboxDurationMs}ms` },
                            { label: 'Pre-Apply Validation', value: proof.integrity.preApplyValidation ? 'SIM (antes do commit)' : 'NAO' },
                          ]}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Proof Hashes tab */}
            {activeTab === 'hashes' && (
              <div style={{ padding: '14px' }}>
                <SectionTitle>Archive Hash (SHA-256)</SectionTitle>
                <HashBlock label="archiveHash" value={result.archive.archiveHash} />

                <SectionTitle>Generation Hash</SectionTitle>
                <HashBlock label="generationHash" value={result.generation.generationHash} />

                <SectionTitle>Proof Hashes por Variante</SectionTitle>
                {result.archive.variants.map(v => (
                  <div key={v.id} style={{
                    padding: '10px',
                    marginBottom: '8px',
                    background: 'rgba(139, 92, 246, 0.05)',
                    borderRadius: '6px',
                    border: '1px solid #2d2d4e',
                  }}>
                    <div style={{ color: '#8b5cf6', fontWeight: 700, marginBottom: '6px' }}>
                      {v.id} (Gen {v.generation})
                    </div>
                    <HashBlock label="proofHash" value={v.proofHash} />
                    {v.diagnosisHash && <HashBlock label="diagnosisHash" value={v.diagnosisHash} />}
                    {v.modificationHash && <HashBlock label="modificationHash" value={v.modificationHash} />}
                    {v.benchmarkHash && <HashBlock label="benchmarkHash" value={v.benchmarkHash} />}
                    {v.sandboxHash && <HashBlock label="sandboxHash" value={v.sandboxHash} />}
                    {v.sandboxPassed !== undefined && (
                      <div style={{ fontSize: '10px', marginTop: '2px' }}>
                        <span style={{ color: '#6060a0' }}>sandbox: </span>
                        <span style={{ color: v.sandboxPassed ? '#4aff9e' : '#ff6060', fontWeight: 700 }}>
                          {v.sandboxPassed ? 'PASSED' : 'FAILED'}
                        </span>
                        {v.sandboxType && <span style={{ color: '#4040a0' }}> ({v.sandboxType})</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tree tab */}
            {activeTab === 'tree' && (
              <div style={{ padding: '14px' }}>
                <SectionTitle>Arvore Evolutiva</SectionTitle>
                {result.tree.map(node => {
                  const indent = node.generation * 24;
                  const arrow = node.generation > 0 ? '\u2514\u2192 ' : '';
                  return (
                    <div key={node.id} style={{
                      marginLeft: `${indent}px`,
                      padding: '6px 8px',
                      marginBottom: '4px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '4px',
                      borderLeft: `2px solid ${node.accuracy >= 0.8 ? '#4aff9e' : '#ffa04a'}`,
                    }}>
                      <span style={{ color: '#6060a0' }}>{arrow}</span>
                      <span style={{ color: '#4a9eff', fontWeight: 700 }}>{node.id}</span>
                      <span style={{ color: '#6060a0', marginLeft: '8px', fontSize: '10px' }}>
                        gen={node.generation} acc={((node.accuracy ?? 0) * 100).toFixed(1)}% children={node.children?.length ?? 0}
                      </span>
                    </div>
                  );
                })}

                <SectionTitle>Proof Chain</SectionTitle>
                <div style={{
                  padding: '10px',
                  background: 'rgba(139, 92, 246, 0.05)',
                  borderRadius: '6px',
                  border: '1px solid #2d2d4e',
                  fontSize: '10px',
                  wordBreak: 'break-all',
                  color: '#a0a0c0',
                  lineHeight: 1.8,
                }}>
                  {result.archive.variants.map((v, i) => (
                    <span key={v.id}>
                      {i > 0 && <span style={{ color: '#8b5cf6' }}> &#x2192; </span>}
                      <span style={{ color: '#4a9eff' }}>{v.id.slice(0, 12)}</span>
                      <span style={{ color: '#4040a0' }}>:{v.proofHash.slice(0, 12)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !isRunning && !error && (
        <div style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: '#4040a0',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>&#x1F9EC;</div>
          <div>Clique em <strong style={{ color: '#8b5cf6' }}>Rodar Teste DGM</strong> para executar</div>
          <div style={{ fontSize: '10px', marginTop: '4px' }}>
            1 geracao completa com proof hashes SHA-256
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Subcomponents ── */

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    color: '#8b5cf6',
    fontWeight: 700,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: '12px',
    marginBottom: '6px',
    paddingBottom: '4px',
    borderBottom: '1px solid #2d2d4e',
  }}>
    {children}
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  }}>
    <span style={{ color: '#6060a0' }}>{label}</span>
    <span style={{ color: '#e0e0ff', fontWeight: 700 }}>{value}</span>
  </div>
);

const HashBlock: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    marginBottom: '4px',
    fontSize: '10px',
  }}>
    <span style={{ color: '#6060a0' }}>{label}: </span>
    <code style={{
      color: '#4aff9e',
      background: 'rgba(74, 255, 158, 0.05)',
      padding: '1px 4px',
      borderRadius: '3px',
      wordBreak: 'break-all',
    }}>
      {value}
    </code>
  </div>
);

const ProofSection: React.FC<{
  title: string;
  subtitle: string;
  valid: boolean;
  details: Array<{ label: string; value: string }>;
  verdictColor?: string;
}> = ({ title, subtitle, valid, details, verdictColor }) => (
  <div style={{
    marginBottom: '12px',
    padding: '10px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
    borderLeft: `3px solid ${valid ? '#4aff9e' : '#ff6060'}`,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
      <div>
        <span style={{ color: '#e0e0ff', fontWeight: 700, fontSize: '11px' }}>{title}</span>
        <span style={{ color: '#4040a0', fontSize: '9px', marginLeft: '8px' }}>{subtitle}</span>
      </div>
      <span style={{
        color: valid ? '#4aff9e' : '#ff6060',
        fontSize: '10px', fontWeight: 700,
      }}>
        {valid ? 'VALIDO' : 'INVALIDO'}
      </span>
    </div>
    {details.map(d => (
      <div key={d.label} style={{
        display: 'flex', justifyContent: 'space-between', padding: '2px 0',
        fontSize: '10px',
      }}>
        <span style={{ color: '#6060a0' }}>{d.label}</span>
        <span style={{
          color: verdictColor && d.label === 'Veredicto' ? verdictColor :
                 d.value.length > 20 ? '#4aff9e' : '#e0e0ff',
          fontWeight: d.label === 'Veredicto' || d.label === 'Deterministico' ? 700 : 400,
          maxWidth: '400px', wordBreak: 'break-all', textAlign: 'right',
          fontFamily: d.value.length > 20 ? 'monospace' : 'inherit',
          fontSize: d.value.length > 40 ? '9px' : '10px',
        }}>
          {d.value}
        </span>
      </div>
    ))}
  </div>
);

export default DGMTestPanel;
