// Distribution-report math: center/edge split, always-frontier baseline, and
// dollars saved by routing.

import { describe, expect, it } from 'vitest';
import { type DecisionRecord, buildReport, formatReport } from '../src/report.js';

function rec(over: Partial<DecisionRecord>): DecisionRecord {
  return {
    model: 'm',
    distribution: 'center',
    confidence: 0.8,
    score: 0.2,
    projectedUsd: 0.001,
    baselineUsd: 0.03,
    escalated: false,
    ...over,
  };
}

describe('buildReport', () => {
  it('counts center/edge and computes savings vs always-frontier (projected)', () => {
    const r = buildReport([
      rec({ distribution: 'center', projectedUsd: 0.001, baselineUsd: 0.03 }),
      rec({ distribution: 'center', projectedUsd: 0.001, baselineUsd: 0.03 }),
      rec({ distribution: 'edge', projectedUsd: 0.03, baselineUsd: 0.03, model: 'frontier' }),
    ]);
    expect(r.decisions).toBe(3);
    expect(r.center).toBe(2);
    expect(r.edge).toBe(1);
    expect(r.centerPct).toBeCloseTo(66.67, 1);
    expect(r.baselineUsd).toBeCloseTo(0.09, 10);
    expect(r.effectiveUsd).toBeCloseTo(0.032, 10);
    expect(r.savedUsd).toBeCloseTo(0.058, 10);
    expect(r.savedPct).toBeCloseTo(64.44, 1);
    expect(r.actuals).toBe(false);
  });

  it('uses actuals when present and flags an all-actual report', () => {
    const r = buildReport([
      rec({ projectedUsd: 0.001, baselineUsd: 0.03, actualUsd: 0.0008 }),
      rec({ projectedUsd: 0.001, baselineUsd: 0.03, actualUsd: 0.0012, escalated: true }),
    ]);
    expect(r.actuals).toBe(true);
    expect(r.effectiveUsd).toBeCloseTo(0.002, 10);
    expect(r.escalations).toBe(1);
    expect(r.savedUsd).toBeCloseTo(0.058, 10);
  });

  it('handles an empty ledger without dividing by zero', () => {
    const r = buildReport([]);
    expect(r.decisions).toBe(0);
    expect(r.centerPct).toBe(0);
    expect(r.savedPct).toBe(0);
    expect(r.actuals).toBe(false);
  });

  it('formats a readable block', () => {
    const text = formatReport(buildReport([rec({})]));
    expect(text).toContain('distribution report');
    expect(text).toContain('saved by routing');
  });
});
