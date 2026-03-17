import { vi, it, expect, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);

vi.mock('../server/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    $client: {
      query: mockQuery,
    },
  }),
}));

beforeEach(() => {
  mockQuery.mockClear();
  mockQuery.mockResolvedValue([{ affectedRows: 1 }]);
});

it('rejectProposal updates both update_proposals and self_proposals tables', async () => {
  const { rejectProposal } = await import('../server/mother/update-proposals');
  const result = await rejectProposal(42, 'test@test.com', 'test reason');
  expect(result).toBeTruthy();
  const calls: string[] = mockQuery.mock.calls.map((c: any[]) => c[0] as string);
  const hasUpdateProposals = calls.some((sql: string) => sql.includes('update_proposals'));
  const hasSelfProposals = calls.some((sql: string) => sql.includes('self_proposals'));
  expect(hasUpdateProposals).toBe(true);
  expect(hasSelfProposals).toBe(true);
});
