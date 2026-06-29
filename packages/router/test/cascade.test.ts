// The escalation cascade, proven END-TO-END through the REAL engine loop. Two
// real in-test adapters (a cheap one that returns a bad answer, a frontier one
// that returns a good answer) are registered; the Router drives `runTask`, the
// rubric verifier fails the cheap output, and the engine escalates — emitting a
// real `escalation` step — then accepts the frontier answer.

import type { RoutingConfig } from '@glamfire/config';
import { type Run, type Step, runTask } from '@glamfire/engine';
import { describe, expect, it } from 'vitest';
import { ModelRegistry } from '../src/registry.js';
import { Router } from '../src/router.js';
import { rubricVerifier } from '../src/verify.js';
import { scriptedAdapter, turn } from './helpers.js';

// Build descriptors that carry their own scripted turns (cheap = bad, frontier = good).
function registryWithScripts(): ModelRegistry {
  const cheap = scriptedAdapter({
    id: 'adapter:cheap-model',
    ratePerMillion: 1,
    turns: [turn({ text: 'a hasty WRONG answer', finishReason: 'stop' })],
  });
  const frontier = scriptedAdapter({
    id: 'adapter:frontier-model',
    ratePerMillion: 30,
    turns: [turn({ text: 'the ESCALATED-CORRECT answer', finishReason: 'stop' })],
  });
  const reg = new ModelRegistry();
  reg.add({
    id: 'cheap-model',
    adapter: cheap,
    config: { model: 'cheap-model' },
    capabilities: cheap.capabilities,
    pricing: cheap.pricing,
  });
  reg.add({
    id: 'frontier-model',
    adapter: frontier,
    config: { model: 'frontier-model' },
    capabilities: frontier.capabilities,
    pricing: frontier.pricing,
  });
  return reg;
}

const routing: RoutingConfig = {
  default: 'cheap-model',
  // No distribution condition -> matches any task; both models eligible.
  rules: [{ requires: [], candidates: ['cheap-model', 'frontier-model'] }],
};

// The verifier demands the marker only the frontier model produces.
const verifier = rubricVerifier([
  { description: 'must contain the correct marker', must: 'ESCALATED-CORRECT' },
]);

describe('escalation cascade through the real engine loop', () => {
  it('runs cheap first, fails verification, escalates to frontier, accepts it', async () => {
    const router = new Router({ registry: registryWithScripts(), routing, verifier });

    const run: Run = await runTask({
      task: { goal: 'do a thing', budget: { maxSteps: 6, maxUSD: 1 } },
      // adapter/config are placeholders; the router overrides them via select().
      adapter: scriptedAdapter({ id: 'unused', ratePerMillion: 0, turns: [turn({})] }),
      config: { model: 'unused' },
      tools: { list: () => [], get: () => undefined } as never,
      cwd: process.cwd(),
      router,
      stream: false,
    });

    expect(run.status).toBe('done');
    expect(run.output).toBe('the ESCALATED-CORRECT answer');

    const types = run.steps.map((s: Step) => s.type);
    expect(types).toContain('route_decision');
    expect(types).toContain('escalation');

    const route = run.steps.find((s) => s.type === 'route_decision');
    expect(route?.type === 'route_decision' && route.model).toBe('cheap-model');
    expect(route?.type === 'route_decision' && route.distribution).toBeDefined();

    const esc = run.steps.find((s) => s.type === 'escalation');
    if (esc?.type === 'escalation') {
      expect(esc.from).toBe('cheap-model');
      expect(esc.to).toBe('frontier-model');
      expect(esc.trigger).toContain('verifier failed');
    }

    // Exactly one failed verification (cheap) then one passing verification (frontier).
    const verifications = run.steps.filter((s) => s.type === 'verification');
    expect(verifications.length).toBe(2);
    expect(verifications[0]?.type === 'verification' && verifications[0].passed).toBe(false);
    expect(verifications[1]?.type === 'verification' && verifications[1].passed).toBe(true);

    // The distribution report reflects the escalation + real spend.
    const report = router.report();
    expect(report.decisions).toBe(1);
    expect(report.escalations).toBe(1);
    expect(report.effectiveUsd).toBeCloseTo(run.costUSD, 10);
    expect(report.baselineUsd).toBeGreaterThan(0);
  });

  it('does NOT escalate when the cheap answer already passes verification', async () => {
    const passVerifier = rubricVerifier([{ description: 'non-empty', must: '\\S' }]);
    const router = new Router({ registry: registryWithScripts(), routing, verifier: passVerifier });

    const run = await runTask({
      task: { goal: 'do a thing', budget: { maxSteps: 6, maxUSD: 1 } },
      adapter: scriptedAdapter({ id: 'unused', ratePerMillion: 0, turns: [turn({})] }),
      config: { model: 'unused' },
      tools: { list: () => [], get: () => undefined } as never,
      cwd: process.cwd(),
      router,
      stream: false,
    });

    expect(run.output).toBe('a hasty WRONG answer');
    expect(run.steps.some((s) => s.type === 'escalation')).toBe(false);
    expect(router.report().escalations).toBe(0);
  });

  it('declines escalation when the budget cannot afford the stronger model', async () => {
    const router = new Router({ registry: registryWithScripts(), routing, verifier });

    const run = await runTask({
      // Budget too small to afford the frontier projection -> escalation declined.
      task: { goal: 'do a thing', budget: { maxSteps: 6, maxUSD: 0.0005 } },
      adapter: scriptedAdapter({ id: 'unused', ratePerMillion: 0, turns: [turn({})] }),
      config: { model: 'unused' },
      tools: { list: () => [], get: () => undefined } as never,
      cwd: process.cwd(),
      router,
      stream: false,
    });

    // Verifier still ran and failed, but no stronger model was affordable.
    expect(run.steps.some((s) => s.type === 'escalation')).toBe(false);
    const verifications = run.steps.filter((s) => s.type === 'verification');
    expect(verifications.length).toBe(1);
    expect(verifications[0]?.type === 'verification' && verifications[0].passed).toBe(false);
    expect(run.output).toBe('a hasty WRONG answer');
  });
});
