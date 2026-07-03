// Unit + regression tests for the usage ledger (packages/cli/src/ledger.mjs):
// record building from a real engine Run shape, JSONL write/read round-trip,
// corrupt-line honesty, --since filtering, aggregation, and budget thresholds.

import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  aggregate,
  appendRecord,
  budgetStatus,
  buildRunRecord,
  dayKey,
  ledgerPath,
  monthToDateUsd,
  parseSince,
  providerFromAdapterId,
  readLedger,
} from '../src/ledger.mjs';

/** A Run in the exact shape `runTask` returns, with an escalation mid-run. */
function escalatedRun() {
  const usage = (outTokens) => ({
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: outTokens,
  });
  return {
    task: { goal: 'summarize the report\nand be brief', budget: { maxUSD: 1 } },
    status: 'done',
    usage: { inputTokens: 200, cachedInputTokens: 40, outputTokens: 300 },
    costUSD: 0.005,
    output: 'strong answer',
    steps: [
      {
        type: 'route_decision',
        index: 0,
        ts: 1,
        adapter: 'fireworks-glm',
        model: 'glm-5p2',
        reason: 'cheapest',
      },
      {
        type: 'model_turn',
        index: 1,
        ts: 2,
        adapter: 'fireworks-glm',
        model: 'glm-5p2',
        text: 'weak',
        reasoning: '',
        toolCalls: [],
        usage: usage(100),
        costUSD: 0.001,
        finishReason: 'stop',
      },
      {
        type: 'escalation',
        index: 2,
        ts: 3,
        from: 'glm-5p2',
        to: 'claude-sonnet-4-5',
        trigger: 'verification failed',
      },
      {
        type: 'model_turn',
        index: 3,
        ts: 4,
        adapter: 'anthropic',
        model: 'claude-sonnet-4-5',
        text: 'strong',
        reasoning: '',
        toolCalls: [],
        usage: usage(200),
        costUSD: 0.004,
        finishReason: 'stop',
      },
      { type: 'final', index: 4, ts: 5, text: 'strong answer', reason: 'stop' },
    ],
  };
}

describe('buildRunRecord', () => {
  it('attributes cost per model, records escalations, and hashes the goal', () => {
    const record = buildRunRecord({ run: escalatedRun(), durationMs: 1234.6, version: '9.9.9' });
    expect(record.v).toBe(1);
    expect(record.glamfire).toBe('9.9.9');
    expect(record.adapter).toBe('fireworks-glm');
    expect(record.provider).toBe('fireworks');
    expect(record.model).toBe('glm-5p2');
    expect(record.status).toBe('done');
    expect(record.durationMs).toBe(1235);
    expect(record.costUsd).toBeCloseTo(0.005, 10);
    expect(record.goalHash).toMatch(/^[0-9a-f]{16}$/);
    // Newlines collapse in the preview; the raw goal is never stored verbatim beyond 80 chars.
    expect(record.goalPreview).toBe('summarize the report and be brief');

    expect(record.escalations).toEqual([
      { from: 'glm-5p2', to: 'claude-sonnet-4-5', trigger: 'verification failed' },
    ]);

    // Per-model split: each escalation step carries its own model + cost.
    expect(record.models).toHaveLength(2);
    const glm = record.models.find((m) => m.model === 'glm-5p2');
    const claude = record.models.find((m) => m.model === 'claude-sonnet-4-5');
    expect(glm.costUsd).toBeCloseTo(0.001, 10);
    expect(glm.provider).toBe('fireworks');
    expect(glm.turns).toBe(1);
    expect(claude.costUsd).toBeCloseTo(0.004, 10);
    expect(claude.provider).toBe('anthropic');
  });

  it('same goal -> same hash; different goal -> different hash', () => {
    const a = buildRunRecord({ run: escalatedRun(), durationMs: 1, version: 'v' });
    const b = buildRunRecord({ run: escalatedRun(), durationMs: 1, version: 'v' });
    const other = escalatedRun();
    other.task.goal = 'something else entirely';
    const c = buildRunRecord({ run: other, durationMs: 1, version: 'v' });
    expect(a.goalHash).toBe(b.goalHash);
    expect(a.goalHash).not.toBe(c.goalHash);
  });
});

describe('providerFromAdapterId', () => {
  it('maps adapter ids to providers', () => {
    expect(providerFromAdapterId('fireworks-glm')).toBe('fireworks');
    expect(providerFromAdapterId('anthropic')).toBe('anthropic');
    expect(providerFromAdapterId('together')).toBe('together');
    expect(providerFromAdapterId(undefined)).toBe('unknown');
  });
});

describe('ledger write/read round-trip', () => {
  let home;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'glam-ledger-test-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('appends JSONL under <home>/.glam and reads it back', () => {
    const record = buildRunRecord({ run: escalatedRun(), durationMs: 10, version: 'v' });
    const path = appendRecord(record, { home });
    expect(path).toBe(ledgerPath(home));
    appendRecord(record, { home });

    const { records, skipped } = readLedger({ home });
    expect(skipped).toBe(0);
    expect(records).toHaveLength(2);
    expect(records[0].costUsd).toBeCloseTo(0.005, 10);
    expect(records[0].models).toHaveLength(2);
  });

  it('missing ledger file reads as zero records (fresh install)', () => {
    const { records, skipped } = readLedger({ home });
    expect(records).toEqual([]);
    expect(skipped).toBe(0);
  });

  it('skips and COUNTS corrupt lines (crash mid-append) instead of failing', () => {
    const record = buildRunRecord({ run: escalatedRun(), durationMs: 10, version: 'v' });
    appendRecord(record, { home });
    appendFileSync(ledgerPath(home), '{"v":1,"ts":"2026-07-0', 'utf8'); // torn write
    const { records, skipped } = readLedger({ home });
    expect(records).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('filters records by --since', () => {
    mkdirSync(join(home, '.glam'), { recursive: true });
    const mk = (ts, costUsd) => `${JSON.stringify({ v: 1, ts, costUsd, usage: {} })}\n`;
    writeFileSync(
      ledgerPath(home),
      mk('2026-01-15T12:00:00.000Z', 1) + mk('2026-07-01T12:00:00.000Z', 2),
    );
    const all = readLedger({ home });
    expect(all.records).toHaveLength(2);
    const recent = readLedger({ home, since: new Date('2026-06-01T00:00:00Z') });
    expect(recent.records).toHaveLength(1);
    expect(recent.records[0].costUsd).toBe(2);
  });
});

describe('parseSince', () => {
  const now = new Date('2026-07-03T12:00:00Z');
  it('parses relative days and hours', () => {
    expect(parseSince('7d', now).toISOString()).toBe('2026-06-26T12:00:00.000Z');
    expect(parseSince('6h', now).toISOString()).toBe('2026-07-03T06:00:00.000Z');
  });
  it('parses absolute dates and rejects garbage loudly', () => {
    expect(parseSince('2026-07-01', now).getTime()).toBe(new Date('2026-07-01').getTime());
    expect(() => parseSince('yesterday-ish', now)).toThrow(/invalid --since/);
  });
});

describe('aggregate', () => {
  it('computes totals and per-day/model/provider breakdowns with escalation split', () => {
    const r1 = buildRunRecord({ run: escalatedRun(), durationMs: 10, version: 'v' });
    const r2 = {
      v: 1,
      ts: r1.ts,
      provider: 'fireworks',
      model: 'glm-5p2',
      costUsd: 0.002,
      usage: { inputTokens: 50, cachedInputTokens: 0, outputTokens: 50 },
      escalations: [],
      models: [
        {
          model: 'glm-5p2',
          provider: 'fireworks',
          turns: 1,
          costUsd: 0.002,
          usage: { inputTokens: 50, cachedInputTokens: 0, outputTokens: 50 },
        },
      ],
    };
    const agg = aggregate([r1, r2]);
    expect(agg.totals.runs).toBe(2);
    expect(agg.totals.costUsd).toBeCloseTo(0.007, 10);
    expect(agg.totals.escalations).toBe(1);
    expect(agg.totals.inputTokens).toBe(250);
    expect(agg.totals.outputTokens).toBe(350);

    // by model: glm got 0.001 (run 1 split) + 0.002 (run 2); claude got 0.004.
    const glm = agg.byModel.find((m) => m.key === 'glm-5p2');
    const claude = agg.byModel.find((m) => m.key === 'claude-sonnet-4-5');
    expect(glm.costUsd).toBeCloseTo(0.003, 10);
    expect(glm.runs).toBe(2);
    expect(claude.costUsd).toBeCloseTo(0.004, 10);

    const fw = agg.byProvider.find((p) => p.key === 'fireworks');
    const an = agg.byProvider.find((p) => p.key === 'anthropic');
    expect(fw.costUsd).toBeCloseTo(0.003, 10);
    expect(an.costUsd).toBeCloseTo(0.004, 10);

    expect(agg.byDay).toHaveLength(1);
    expect(agg.byDay[0].key).toBe(dayKey(r1.ts));
    expect(agg.byDay[0].costUsd).toBeCloseTo(0.007, 10);
  });
});

describe('budget thresholds', () => {
  const now = new Date('2026-07-03T12:00:00');
  const rec = (costUsd, ts = '2026-07-02T10:00:00') => ({ v: 1, ts, costUsd, usage: {} });

  it('is null when no monthly budget is configured (alerting is opt-in)', () => {
    expect(budgetStatus({ warnAtPct: 80 }, [rec(5)], now)).toBeNull();
  });

  it('only counts the current local month', () => {
    const records = [rec(3), rec(100, '2026-06-30T10:00:00')];
    expect(monthToDateUsd(records, now)).toBeCloseTo(3, 10);
  });

  it('reports ok / warn / over across the warnAtPct and 100% thresholds', () => {
    const cfg = { monthlyBudgetUsd: 10, warnAtPct: 80 };
    expect(budgetStatus(cfg, [rec(5)], now).level).toBe('ok');
    const warn = budgetStatus(cfg, [rec(8)], now);
    expect(warn.level).toBe('warn'); // exactly at the threshold warns
    expect(warn.pct).toBeCloseTo(80, 10);
    expect(budgetStatus(cfg, [rec(6), rec(5)], now).level).toBe('over');
    expect(budgetStatus(cfg, [rec(10)], now).level).toBe('over'); // 100% is over
  });
});
