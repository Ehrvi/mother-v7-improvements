import { classifyQuery } from '../server/mother/intelligence';
import { it, expect } from 'vitest';

it('philosophy query returns philosophy category', () => {
  const r = classifyQuery('Discuss the ethics of utilitarianism and free will');
  expect(r.category).toBe('philosophy');
});

it('natural_science query returns natural_science category', () => {
  const r = classifyQuery('Explain the process of photosynthesis and cell biology');
  expect(r.category).toBe('natural_science');
});

it('economics query returns economics category', () => {
  const r = classifyQuery('Analyze inflation and monetary policy impacts');
  expect(r.category).toBe('economics');
});

it('health_care query returns health_care category', () => {
  const r = classifyQuery('Explain the immune system response to an epidemic');
  expect(r.category).toBe('health_care');
});
