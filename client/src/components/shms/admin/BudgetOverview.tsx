/** BudgetOverview.tsx • Endpoint: GET /bank/:structureId */
import { useShmsBank } from '@/hooks/useShmsApi';
export default function BudgetOverview({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsBank(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  const d = data as any ?? {};
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">💰 Orçamento & Reconciliação</span></div>
      <div className="shms-card"><div className="shms-card__body">
        <pre style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--shms-font-mono)' }}>
          {JSON.stringify(d, null, 2)}
        </pre>
      </div></div>
    </div>
  );
}
