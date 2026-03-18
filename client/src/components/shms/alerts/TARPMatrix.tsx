/** TARPMatrix.tsx • Endpoint: GET /tarp/:structureId */
import { useShmsTARP } from '@/hooks/useShmsApi';
export default function TARPMatrix({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsTARP(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  const matrix = data?.matrix as any;
  const compliance = data?.compliance as any;
  const activations = (data?.activeActivations ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📊 Matriz TARP</span></div>
      <div className="shms-grid-2">
        <div className="shms-kpi">
          <div className="shms-kpi__label">Compliance</div>
          <div className="shms-kpi__value" style={{ color: compliance?.compliant ? 'var(--shms-green)' : 'var(--shms-red)' }}>
            {compliance?.compliant ? '✅ Conforme' : '⚠ Não conforme'}
          </div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Ativações</div>
          <div className="shms-kpi__value">{activations.length}</div>
        </div>
      </div>
      {matrix && (
        <div className="shms-card" style={{ marginTop: 'var(--shms-sp-4)' }}><div className="shms-card__body">
          <pre style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--shms-font-mono)' }}>
            {JSON.stringify(matrix, null, 2)}
          </pre>
        </div></div>
      )}
    </div>
  );
}
