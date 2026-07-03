// Policy engine: first-match-wins, capability filtering, projected-budget
// filtering, cheapest-survivor selection, and the default fallback.

import type { RoutingConfig } from '@glamfire/config';
import type { AdapterRuntimeConfig, RouteClassification } from '@glamfire/engine';
import { describe, expect, it } from 'vitest';
import { estimateUsage } from '../src/cost.js';
import { PolicyError, evaluatePolicy, isLocalDescriptor } from '../src/policy.js';
import { ModelRegistry, descriptorFromAdapter } from '../src/registry.js';
import { descriptor, fullCaps, scriptedAdapter } from './helpers.js';

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

// --- local / self-host routing (issue #25): $0 pricing + local_only floor ----

/** A registry descriptor served by the REAL `local` adapter id. */
function localDescriptor(modelId: string, over: Parameters<typeof fullCaps>[0] = {}) {
  const adapter = scriptedAdapter({
    id: 'local',
    ratePerMillion: 0, // the real marginal price of owned hardware
    capabilities: fullCaps(over),
  });
  const config: AdapterRuntimeConfig = { model: modelId };
  return descriptorFromAdapter(adapter, config);
}

function mixedRegistry(): ModelRegistry {
  return new ModelRegistry()
    .add(descriptor('cheap-hosted', { ratePerMillion: 1 }))
    .add(descriptor('frontier', { ratePerMillion: 30 }))
    .add(
      // A small local model with a floor-level capability surface: no parallel
      // tool calls, no JSON mode, 32K context (no long_context).
      localDescriptor('qwen3:0.6b', {
        parallelToolCalls: false,
        jsonMode: false,
        seed: false,
        contextWindow: 32_768,
        maxOutputTokens: 8_192,
      }),
    );
}

describe('evaluatePolicy — local/self-host candidates', () => {
  it('identifies local descriptors by the real adapter id', () => {
    expect(isLocalDescriptor(localDescriptor('m'))).toBe(true);
    expect(isLocalDescriptor(descriptor('m', { ratePerMillion: 1 }))).toBe(false);
  });

  it('an explicitly listed local model wins on price ($0), keeping hosted escalation', () => {
    const routing: RoutingConfig = {
      default: 'cheap-hosted',
      rules: [
        {
          distribution: 'center',
          requires: ['tool_calling'],
          candidates: ['qwen3:0.6b', 'cheap-hosted', 'frontier'],
        },
      ],
    };
    const sel = evaluatePolicy(routing, center, mixedRegistry(), { estimate });
    expect(sel.chosen.id).toBe('qwen3:0.6b');
    expect(sel.projectedUsd).toBe(0);
    // The anti-quality-cliff design: hosted models stay in the cascade so a
    // failed verification escalates local -> hosted (research/04 cascade).
    expect(sel.cascade.map((d) => d.id)).toEqual(['qwen3:0.6b', 'cheap-hosted', 'frontier']);
  });

  it('the capability floor keeps a small local model out of demanding rules', () => {
    const routing: RoutingConfig = {
      default: 'cheap-hosted',
      rules: [
        {
          distribution: 'center',
          requires: ['parallel_tool_calls', 'long_context'],
          candidates: ['qwen3:0.6b', 'cheap-hosted'],
        },
      ],
    };
    const sel = evaluatePolicy(routing, center, mixedRegistry(), { estimate });
    // The 0.6b model does NOT silently win: its declared floor lacks the
    // required capabilities, so the hosted model is chosen.
    expect(sel.chosen.id).toBe('cheap-hosted');
    const localEval = sel.evaluations[0]?.candidates.find((c) => c.id === 'qwen3:0.6b');
    expect(localEval?.missing).toEqual(
      expect.arrayContaining(['parallel_tool_calls', 'long_context']),
    );
  });

  it('local_only excludes hosted candidates and says so in the trace', () => {
    const routing: RoutingConfig = {
      default: 'qwen3:0.6b',
      rules: [
        {
          distribution: 'center',
          requires: ['tool_calling'],
          candidates: ['cheap-hosted', 'qwen3:0.6b'],
        },
      ],
    };
    const sel = evaluatePolicy(routing, center, mixedRegistry(), { estimate, localOnly: true });
    expect(sel.chosen.id).toBe('qwen3:0.6b');
    expect(sel.cascade.map((d) => d.id)).toEqual(['qwen3:0.6b']);
    const hostedEval = sel.evaluations[0]?.candidates.find((c) => c.id === 'cheap-hosted');
    expect(hostedEval?.excludedByLocalOnly).toBe(true);
    expect(hostedEval?.note).toMatch(/local_only/);
  });

  it('local_only NEVER silently falls back to a hosted default — it fails loud', () => {
    const routing: RoutingConfig = {
      default: 'cheap-hosted',
      rules: [{ distribution: 'edge', requires: [], candidates: ['frontier'] }],
    };
    expect(() =>
      evaluatePolicy(routing, center, mixedRegistry(), { estimate, localOnly: true }),
    ).toThrow(/local_only routing is set/);
  });

  it('routing.localOnly from config is honored, and opts override wins', () => {
    const routing: RoutingConfig = {
      default: 'qwen3:0.6b',
      localOnly: true,
      rules: [
        {
          distribution: 'center',
          requires: ['tool_calling'],
          candidates: ['cheap-hosted', 'qwen3:0.6b'],
        },
      ],
    };
    const fromConfig = evaluatePolicy(routing, center, mixedRegistry(), { estimate });
    expect(fromConfig.cascade.map((d) => d.id)).toEqual(['qwen3:0.6b']);
    const overridden = evaluatePolicy(routing, center, mixedRegistry(), {
      estimate,
      localOnly: false,
    });
    // Explicit opts.localOnly=false beats the config flag; hosted competes again.
    expect(overridden.cascade.map((d) => d.id)).toEqual(['qwen3:0.6b', 'cheap-hosted']);
  });
});
