import { trpc } from '@/lib/trpc';

export function useCreatorGuard() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const isCreator = Boolean((user as { isCreator?: boolean } | null)?.isCreator);
  return { isCreator, isLoading, user };
}
