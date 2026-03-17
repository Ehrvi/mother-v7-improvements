import { trpc } from '@/lib/trpc';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectsPanel() {
  const { data: proposals, isLoading } = trpc.mother.dgmPendingProposals.useQuery();
  const resolveMutation = trpc.mother.dgmResolveProposal.useMutation();

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <h2 className="text-sm font-semibold">DGM Proposals Dashboard</h2>
        <p className="text-xs text-[var(--color-fg-muted)]">Creator only · {proposals?.length ?? 0} proposals</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
        {proposals?.map(p => (
          <Card key={p.id} className="p-4 border-[var(--color-border-base)]">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-medium">{p.title}</p>
              <Badge variant="outline">pending</Badge>
            </div>
            <p className="text-xs text-[var(--color-fg-muted)] line-clamp-2 mb-3">{p.summary}</p>
            <div className="flex gap-2">
              <button
                onClick={() => resolveMutation.mutate({ proposalId: p.id, approved: true })}
                className="text-xs px-3 py-1 rounded-lg bg-[var(--color-accent-green)] text-white">
                Approve
              </button>
              <button
                onClick={() => resolveMutation.mutate({ proposalId: p.id, approved: false })}
                className="text-xs px-3 py-1 rounded-lg border border-[var(--color-border-base)] text-[var(--color-fg-muted)]">
                Reject
              </button>
            </div>
          </Card>
        ))}
        {!isLoading && (!proposals || proposals.length === 0) && (
          <div className="text-center py-12 text-sm text-[var(--color-fg-subtle)]">
            No pending proposals
          </div>
        )}
      </div>
    </div>
  );
}
