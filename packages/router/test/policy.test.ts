// Policy engine: first-match-wins, capability filtering, projected-budget
// filtering, cheapest-survivor selection, and the default fallback.

import type { RoutingConfig } from '@glamfire/config';
import type { RouteClassification } from '@glamfire/engine';
import { describe, expect, it } from 'vitest';
import { estimateUsage } from '../src/cost.js';
import { PolicyError, evaluatePolicy } from '../src/policy.js';
import { ModelRegistry } from '../src/registry.js';
import { fullCaps } from './helpers.js';
import { descriptor } from './helpers.js';

const estimate = estimateUsage({ goal: 'a representative prompt of modest size' });

function registry(): ModelRegistry {
  return new ModelRegistry()
    .add(descriptor('cheap', { ratePerMillion: 1 }))
    .add(descriptor('mid', { ratePerMillion: 5 }))
    .add(descriptor('frontier', { ratePerMillion: 30 }))
    .add(
      descriptor('vision-only', { ratePerMillion: 2, capabilities: fullCaps({ vision: true }) }),
    );
}

const center: RouteClassification = { distribution: 'center', score: 0.2, confidence: 0.9 };
const edge: RouteClassification = { distribution: 'edge', score: 0.8, confidence: 0.4 };

describe('evaluatePolicy', () => {
  it('first matching rule wins (top-to-bottom)', () => {
    const routing: RoutingConfig = {
      default: 'frontier',
      rules: [
        { distribution: 'center', requires: [], candidates: ['mid', 'cheap'] },
        { distribution: 'center', requires: [], candidates: ['frontier'] },
      ],
    };
    const sel = evaluatePolicy(routing, center, registry(), { estimate });
    expect(sel.ruleIndex).toBe(0);
    // Cheapest survivor of rule #0, even though 'mid' is listed first.
    expect(sel.chosen.id).toBe('cheap');
  });

  it('filters candidates by required capabilities, then picks cheapest survivor', () => {
    const routing: RoutingConfig = {
      default: 'frontier',
      rules: [{ distribution: 'edge', requires: ['vision'], candidates: ['cheap', 'vision-only'] }],
    };
    const sel = evaluatePolicy(routing, edge, registry(), { estimate });
    // 'cheap' lacks vision and is filtered out despite being cheaper.
    expect(sel.chosen.id).toBe('vision-only');
    const cheapEval = sel.evaluations[0]?.candidates.find((c) => c.id === 'cheap');
    expect(cheapEval?.missing).toContain('vision');
  });

  it('filters candidates exceeding the rule maxUsd ceiling', () => {
    const routing: RoutingConfig = {
      default: 'cheap',
      rules: [
        { distribution: 'edge', requires: [], maxUsd: 0.0001, candidates: ['frontier', 'cheap'] },
      ],
    };
    const sel = evaluatePolicy(routing, edge, registry(), { estimate });
    // 'frontier' projects over the ceiling; 'cheap' survives.
    expect(sel.chosen.id).toBe('cheap');
    const frontierEval = sel.evaluations[0]?.candidates.find((c) => c.id === 'frontier');
    expect(frontierEval?.overBudget).toBe(true);
  });

  it('builds the cascade as eligible survivors, cheapest-first', () => {
    const routing: RoutingConfig = {
      default: 'frontier',
      rules: [{ distribution: 'edge', requires: [], candidates: ['frontier', 'cheap', 'mid'] }],
    };
    const sel = evaluatePolicy(routing, edge, registry(), { estimate });
    expect(sel.cascade.map((d) => d.id)).toEqual(['cheap', 'mid', 'frontier']);
  });

  it('falls back to routing.default when no rule matches', () => {
    const routing: RoutingConfig = {
      default: 'cheap',
      rules: [{ distribution: 'edge', requires: [], candidates: ['frontier'] }],
    };
    const sel = evaluatePolicy(routing, center, registry(), { estimate });
    expect(sel.ruleIndex).toBe(-1);
    expect(sel.chosen.id).toBe('cheap');
  });

  it('falls back when a matched rule has no eligible candidate', () => {
    const routing: RoutingConfig = {
      default: 'frontier',
      rules: [{ distribution: 'center', requires: ['vision'], candidates: ['cheap', 'mid'] }],
    };
    // Neither 'cheap' nor 'mid' has vision -> no survivor -> default.
    const sel = evaluatePolicy(routing, center, registry(), { estimate });
    expect(sel.ruleIndex).toBe(-1);
    expect(sel.chosen.id).toBe('frontier');
  });

  it('marks unregistered candidate ids as unavailable (honest gap)', () => {
    const routing: RoutingConfig = {
      default: 'cheap',
      rules: [{ distribution: 'center', requires: [], candidates: ['no-adapter-yet', 'cheap'] }],
    };
    const sel = evaluatePolicy(routing, center, registry(), { estimate });
    const missing = sel.evaluations[0]?.candidates.find((c) => c.id === 'no-adapter-yet');
    expect(missing?.available).toBe(false);
    expect(sel.chosen.id).toBe('cheap');
  });

  it('throws when routing.default has no wired adapter', () => {
    const routing: RoutingConfig = { default: 'ghost', rules: [] };
    expect(() => evaluatePolicy(routing, center, registry(), { estimate })).toThrow(PolicyError);
  });
});
