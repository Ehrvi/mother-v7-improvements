/**
 * FaultTreeViewer.tsx — Fault tree analysis (AND/OR gates)
 * Endpoint: GET /fault-tree/:structureId
 */
import { useShmsFaultTree } from '@/hooks/useShmsApi';

export default function FaultTreeViewer({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsFaultTree(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />;
  const trees = (data?.trees ?? []) as any[];

  function renderNode(node: any, depth = 0): React.ReactNode {
    if (!node) return null;
    const indent = depth * 24;
    const gateColor = node.gate === 'AND' ? 'var(--shms-blue)' : node.gate === 'OR' ? 'var(--shms-orange)' : 'var(--shms-text-secondary)';
    return (
      <div key={node.id ?? Math.random()} style={{ paddingLeft: indent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          {node.gate && <span className="shms-badge" style={{ background: gateColor, color: 'white', borderColor: 'transparent', fontSize: 9 }}>{node.gate}</span>}
          <span style={{ fontSize: 'var(--shms-fs-sm)', fontWeight: node.children ? 600 : 400 }}>{node.name ?? node.label ?? node.id}</span>
          {node.probability !== undefined && (
            <span className="mono" style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginLeft: 'auto' }}>
              P={typeof node.probability === 'number' ? node.probability.toExponential(2) : node.probability}
            </span>
          )}
        </div>
        {node.children?.map((c: any) => renderNode(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">🌳 Árvore de Falhas (FTA)</span></div>
      {trees.length === 0 ? (
        <div className="shms-empty"><div className="shms-empty__text">Nenhuma árvore de falhas disponível</div></div>
      ) : (
        <div className="shms-card">
          <div className="shms-card__body" style={{ maxHeight: 500, overflowY: 'auto' }}>
            {trees.map((tree: any, i: number) => (
              <div key={i}>{renderNode(tree)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
