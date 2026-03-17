import { predictStructuralBehavior } from '../server/shms/digital-twin-engine-c205';
import { it, expect } from 'vitest';

it('returns warning and status=not_implemented for unknown structure', async () => {
  const result = await predictStructuralBehavior('UNKNOWN-999', 24);
  expect(result.status).toBe('not_implemented');
  expect(result.warning).toContain('C207');
  expect(result.predictions).toEqual([]);
});
