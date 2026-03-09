/**
 * MOTHER v43.0 — DGM Lineage Dashboard
 *
 * Visualizes the evolutionary tree of the Darwin Gödel Machine (DGM) archive.
 * Each node represents a generation, colored by fitness score.
 * Parent → Child relationships show the evolutionary lineage.
 *
 * Scientific basis:
 * - Darwin Gödel Machine (Sakana AI, arXiv:2505.22954)
 * - "The DGM archive provides a transparent, traceable lineage of every change."
 * - Huxley-Gödel Machine (Wang et al., arXiv:2510.21614)
 */

import { useState, useCallback } from 'react';
import Tree from 'react-d3-tree';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, GitBranch, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// D3 tree node type
interface TreeNode {
  name: string;
  attributes?: Record<string, string | number>;
  children?: TreeNode[];
  nodeDatum?: {
    fitnessScore?: number | null;
    generationId?: string;
    createdAt?: string;
    codeSnapshotLength?: number;
  };
}

// Build a D3-compatible tree from flat dgm_archive entries
function buildTree(entries: Array<{
  id: number;
  generationId: string;
  parentId: string | null;
  fitnessScore: number | null;
  benchmarkResults: string | null;
  createdAt: Date | string;
  codeSnapshotLength: number;
}>): TreeNode {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create all nodes first
  for (const entry of entries) {
    const fitness = entry.fitnessScore ?? 0;
    const fitnessLabel = fitness > 0 ? `★ ${fitness.toFixed(2)}` : 'No score';
    const date = new Date(entry.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const node: TreeNode = {
      name: entry.generationId.slice(0, 8) + '...',
      attributes: {
        'Fitness': fitnessLabel,
        'Code': `${Math.round(entry.codeSnapshotLength / 1024)}KB`,
        'Data': date,
      },
      children: [],
      nodeDatum: {
        fitnessScore: entry.fitnessScore,
        generationId: entry.generationId,
        createdAt: date,
        codeSnapshotLength: entry.codeSnapshotLength,
      },
    };
    nodeMap.set(entry.generationId, node);
  }

  // Build tree structure
  for (const entry of entries) {
    const node = nodeMap.get(entry.generationId)!;
    if (entry.parentId && nodeMap.has(entry.parentId)) {
      const parent = nodeMap.get(entry.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // If multiple roots, wrap in a virtual root
  if (roots.length === 0) {
    return { name: 'MOTHER DGM', children: [] };
  }
  if (roots.length === 1) {
    return roots[0];
  }
  return {
    name: 'MOTHER DGM',
    attributes: { 'Gerações': roots.length.toString() },
    children: roots,
  };
}

// Custom node renderer for the tree
function CustomNode({ nodeDatum }: { nodeDatum: any }) {
  const fitness = nodeDatum?.fitnessScore ?? 0;
  const isRoot = nodeDatum?.name === 'MOTHER DGM';

  // Color by fitness: red (0) → yellow (0.5) → green (1)
  const getColor = (f: number) => {
    if (f <= 0) return '#6b7280'; // gray
    if (f < 0.4) return '#ef4444'; // red
    if (f < 0.7) return '#f59e0b'; // yellow
    return '#10b981'; // green
  };

  const color = isRoot ? '#8b5cf6' : getColor(fitness);
  const radius = isRoot ? 20 : 14;

  return (
    <g>
      <circle r={radius} fill={color} stroke="#1f2937" strokeWidth={2} opacity={0.9} />
      {fitness > 0 && (
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize:'10px', fill: 'white', fontWeight: 'bold' }}
        >
          {fitness.toFixed(1)}
        </text>
      )}
      <text
        textAnchor="start"
        x={radius + 4}
        y={-8}
        style={{ fontSize: '10px', fill: '#e5e7eb', fontFamily: 'monospace' }}
      >
        {nodeDatum.name}
      </text>
      {nodeDatum.attributes?.Data && (
        <text
          textAnchor="start"
          x={radius + 4}
          y={6}
          style={{ fontSize:'10px', fill: '#9ca3af' }}
        >
          {nodeDatum.attributes.Data}
        </text>
      )}
    </g>
  );
}

export default function DgmLineage() {
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.mother.dgmLineage.useQuery({ limit: 200 });

  const handleNodeClick = useCallback((nodeDatum: any) => {
    setSelectedNode(nodeDatum);
  }, []);

  const treeData = data?.entries ? buildTree(data.entries) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <GitBranch className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">DGM Lineage Dashboard</h1>
              <p className="text-sm text-gray-400">Darwin Gödel Machine — Árvore Evolutiva</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      {data && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400">Total de Gerações</span>
              </div>
              <p className="text-2xl font-bold text-white mt-1">{data.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400">Raízes (Origens)</span>
              </div>
              <p className="text-2xl font-bold text-white mt-1">{data.rootCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400">Fitness Máximo</span>
              </div>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {data.maxFitness > 0 ? data.maxFitness.toFixed(3) : '—'}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-gray-400">Fitness Médio</span>
              </div>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                {data.avgFitness > 0 ? data.avgFitness.toFixed(3) : '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="flex h-[calc(100vh-200px)]">
        {/* Tree Visualization */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Brain className="w-12 h-12 text-purple-400 animate-pulse mx-auto mb-3" />
                <p className="text-gray-400">Carregando árvore evolutiva...</p>
              </div>
            </div>
          )}

          {!isLoading && data?.total === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md">
                <GitBranch className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-300 mb-2">
                  Nenhuma Geração Registrada
                </h3>
                <p className="text-gray-500 text-sm mb-4">
                  O arquivo DGM ainda não possui gerações. Execute o loop evolutivo
                  usando o endpoint <code className="bg-gray-800 px-1 rounded">supervisor.evolve</code> para
                  iniciar a evolução.
                </p>
                <Badge variant="outline" className="border-purple-500 text-purple-400">
                  Darwin Gödel Machine — Pronto para Evoluir
                </Badge>
              </div>
            </div>
          )}

          {!isLoading && treeData && data && data.total > 0 && (
            <Tree
              data={treeData}
              orientation="vertical"
              translate={{ x: window.innerWidth / 2 - 150, y: 60 }}
              separation={{ siblings: 1.5, nonSiblings: 2 }}
              nodeSize={{ x: 180, y: 100 }}
              renderCustomNodeElement={(rd3tProps) => (
                <CustomNode
                  nodeDatum={rd3tProps.nodeDatum}
                />
              )}
              onNodeClick={(node) => handleNodeClick(node.data)}
              pathClassFunc={() => 'stroke-gray-600 stroke-1 fill-none'}
              svgClassName="bg-gray-950"
              zoom={0.8}
              zoomable
              draggable
            />
          )}
        </div>

        {/* Side Panel — Node Details */}
        {selectedNode && (
          <div className="w-72 border-l border-gray-800 bg-gray-900 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Detalhes da Geração</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-500 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Generation ID</p>
                <p className="text-sm font-mono text-purple-300 break-all mt-1">
                  {selectedNode.nodeDatum?.generationId || selectedNode.name}
                </p>
              </div>

              {selectedNode.nodeDatum?.fitnessScore != null && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Fitness Score</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                      style={{ width: '100%' }}
                    >
                      <div
                        className="h-2 rounded-full bg-white/30"
                        style={{
                          width: `${(1 - (selectedNode.nodeDatum.fitnessScore || 0)) * 100}%`,
                          marginLeft: `${(selectedNode.nodeDatum.fitnessScore || 0) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xl font-bold text-green-400 mt-1">
                    {selectedNode.nodeDatum.fitnessScore.toFixed(4)}
                  </p>
                </div>
              )}

              {selectedNode.nodeDatum?.createdAt && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Criado em</p>
                  <p className="text-sm text-gray-300 mt-1">{selectedNode.nodeDatum.createdAt}</p>
                </div>
              )}

              {selectedNode.nodeDatum?.codeSnapshotLength && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Tamanho do Código</p>
                  <p className="text-sm text-gray-300 mt-1">
                    {Math.round(selectedNode.nodeDatum.codeSnapshotLength / 1024)} KB
                  </p>
                </div>
              )}

              {selectedNode.attributes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Atributos</p>
                  {Object.entries(selectedNode.attributes).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-gray-800">
                      <span className="text-xs text-gray-400">{key}</span>
                      <span className="text-xs text-gray-200">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 p-3 bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Base Científica</p>
              <p className="text-xs text-gray-400">
                Darwin Gödel Machine (Sakana AI, 2025) — cada nó representa uma mutação
                do código-fonte avaliada por fitness empírico.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="fixed bottom-4 left-6 flex items-center gap-4 bg-gray-900/90 backdrop-blur border border-gray-800 rounded-lg px-4 py-2">
        <span className="text-xs text-gray-500">Fitness:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-gray-500" />
          <span className="text-xs text-gray-400">Sem score</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs text-gray-400">&lt; 0.4</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-xs text-gray-400">0.4 – 0.7</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs text-gray-400">&gt; 0.7</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-xs text-gray-400">Raiz</span>
        </div>
      </div>
    </div>
  );
}
