// Memory in the loop (issue #27): unit tests for the pure packing/cap and
// episode-shaping logic, plus a REAL-store regression test — an episode written
// through the actual @glamfire/brain SQLite store is recalled by a later query.
// No mocks anywhere: the store test uses the real embedder, real sqlite-vec.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Brain } from '@glamfire/brain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECALL_PREAMBLE,
  brainStorePath,
  buildEpisode,
  composeSystem,
  estimateTokens,
  formatRecallEntry,
  packRecall,
} from '../src/memory.mjs';

function hit(overrides = {}) {
  return {
    recordId: 'rec-0001',
    type: 'episode',
    chunkOrdinal: 0,
    text: 'Task: teach the codename\nOutcome: done',
    title: 'run: teach the codename',
    scope: 'project',
    provenance: { source: 'glam run', timestamp: '2026-07-03T00:00:00.000Z' },
    score: 0.9,
    components: { vector: 1, keyword: 1, recency: 1, provenance: 1 },
    ...overrides,
  };
}

describe('brainStorePath (project-scoped by default)', () => {
  it('defaults to <project>/.glam/brain.db next to the discovered glam.toml', () => {
    const p = brainStorePath({
      memory: {},
      projectConfigPath: '/proj/glam.toml',
      cwd: '/proj/nested',
    });
    expect(p).toBe(join('/proj', '.glam', 'brain.db'));
  });

  it('falls back to the cwd when no project config was discovered', () => {
    const p = brainStorePath({ memory: {}, projectConfigPath: null, cwd: '/work' });
    expect(p).toBe(join('/work', '.glam', 'brain.db'));
  });

  it('honors a [memory] store override (relative to cwd, absolute kept)', () => {
    // Use platform-absolute paths so the assertion holds on Windows too:
    // `path.resolve` (used by brainStorePath) treats a bare `/w` as drive-relative
    // on win32 and prepends the current drive, which would break a naive join.
    const cwdAbs = resolve(tmpdir(), 'w');
    const storeAbs = resolve(tmpdir(), 'abs', 'team.brain');
    expect(
      brainStorePath({
        memory: { store: 'shared/team.brain' },
        projectConfigPath: null,
        cwd: cwdAbs,
      }),
    ).toBe(join(cwdAbs, 'shared', 'team.brain'));
    expect(
      brainStorePath({ memory: { store: storeAbs }, projectConfigPath: null, cwd: cwdAbs }),
    ).toBe(storeAbs);
  });
});

describe('packRecall (hard token cap + provenance framing)', () => {
  it('returns an empty block for zero hits — an empty brain is not an error', () => {
    expect(packRecall([], { tokenBudget: 1200 })).toEqual({ block: '', packed: [], usedTokens: 0 });
  });

  it('frames recalled memories with the preamble, record ids, and sources', () => {
    const { block, packed } = packRecall([hit()], { tokenBudget: 1200 });
    expect(packed).toHaveLength(1);
    expect(block.startsWith(RECALL_PREAMBLE)).toBe(true);
    expect(block).toContain('id rec-0001');
    expect(block).toContain('source: glam run');
    expect(block).toContain('memory 1');
    expect(block).toContain('Task: teach the codename');
  });

  it('enforces the token cap as a HARD ceiling, preamble included', () => {
    const hits = Array.from({ length: 10 }, (_, i) =>
      hit({ recordId: `rec-${i}`, text: 'x'.repeat(400) }),
    );
    const budget = 300;
    const { packed, usedTokens } = packRecall(hits, { tokenBudget: budget });
    expect(usedTokens).toBeLessThanOrEqual(budget);
    expect(packed.length).toBeGreaterThan(0);
    expect(packed.length).toBeLessThan(10);
    // One more entry would have burst the budget.
    const next = formatRecallEntry(packed.length + 1, hits[packed.length]);
    expect(usedTokens + estimateTokens(next)).toBeGreaterThan(budget);
  });

  it('keeps rank order (highest-scored first)', () => {
    const hits = [hit({ recordId: 'first' }), hit({ recordId: 'second' })];
    const { block } = packRecall(hits, { tokenBudget: 1200 });
    expect(block.indexOf('id first')).toBeLessThan(block.indexOf('id second'));
  });

  it('yields an empty block when even one entry cannot fit', () => {
    const { block, packed } = packRecall([hit({ text: 'x'.repeat(4000) })], { tokenBudget: 100 });
    expect(block).toBe('');
    expect(packed).toHaveLength(0);
  });
});

describe('composeSystem', () => {
  it('appends the recall block under the base system prompt', () => {
    expect(composeSystem('base', 'recall')).toBe('base\n\nrecall');
  });
  it('leaves the base prompt untouched with no recall', () => {
    expect(composeSystem('base', '')).toBe('base');
  });
});

describe('buildEpisode (structured capture from the real step log shape)', () => {
  const run = {
    task: { goal: 'fix the flaky test', budget: { maxUSD: 0.5 } },
    status: 'done',
    output: 'Fixed by pinning the seed.',
    costUSD: 0.0123,
    usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 100 },
    steps: [
      {
        type: 'route_decision',
        model: 'accounts/fireworks/models/glm-5p2',
        adapter: 'fireworks-glm',
        reason: 'center rule matched',
      },
      {
        type: 'model_turn',
        model: 'accounts/fireworks/models/glm-5p2',
        adapter: 'fireworks-glm',
      },
      {
        type: 'tool_call',
        name: 'read_file',
        permission: 'allow',
        arguments: { path: 'test/flaky.test.ts' },
      },
      {
        type: 'tool_call',
        name: 'edit_file',
        permission: 'allow',
        arguments: { path: 'src/seed.ts' },
      },
      { type: 'tool_call', name: 'write_file', permission: 'deny', arguments: { path: 'x' } },
      { type: 'verification', passed: false, detail: 'rubric miss' },
      { type: 'escalation', from: 'glm-5p2', to: 'claude-sonnet-4-5', trigger: 'verify failed' },
      { type: 'model_turn', model: 'claude-sonnet-4-5', adapter: 'anthropic' },
      { type: 'final', text: 'Fixed by pinning the seed.', reason: 'stop' },
    ],
  };

  it('captures task, outcome, decisions, files touched, models, and cost', () => {
    const ep = buildEpisode({
      goal: 'fix the flaky test',
      run,
      adapterId: 'fireworks-glm',
      recalledCount: 2,
      version: '9.9.9',
      durationMs: 1234,
    });
    expect(ep.content).toContain('Task: fix the flaky test');
    expect(ep.content).toContain('Outcome: done');
    expect(ep.content).toContain('accounts/fireworks/models/glm-5p2, claude-sonnet-4-5');
    expect(ep.content).toContain('$0.012300');
    expect(ep.content).toContain('escalated glm-5p2 → claude-sonnet-4-5 (verify failed)');
    expect(ep.content).toContain('verification failed: rubric miss');
    expect(ep.content).toContain('Files touched: src/seed.ts');
    expect(ep.content).toContain('Files read: test/flaky.test.ts');
    // A DENIED write never counts as a touched file.
    expect(ep.metadata.filesTouched).toEqual(['src/seed.ts']);
    expect(ep.content).toContain('Answer:\nFixed by pinning the seed.');
    expect(ep.scope).toBe('project');
    expect(ep.provenance.source).toBe('glam run');
    expect(ep.provenance.note).toContain('9.9.9');
    expect(ep.metadata.status).toBe('done');
    expect(ep.metadata.recalled).toBe(2);
    expect(ep.metadata.models).toEqual(['accounts/fireworks/models/glm-5p2', 'claude-sonnet-4-5']);
  });

  it('truncates a very long answer but never the task', () => {
    const long = { ...run, output: 'y'.repeat(5000) };
    const ep = buildEpisode({
      goal: 'g'.repeat(300),
      run: long,
      adapterId: 'fireworks-glm',
      recalledCount: 0,
      version: '9.9.9',
      durationMs: 1,
    });
    expect(ep.content).toContain('g'.repeat(300));
    expect(ep.content.length).toBeLessThan(5000);
    expect(ep.title.length).toBeLessThanOrEqual(90);
  });
});

describe('regression: episode write → real store → later query recalls it', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'glam-memory-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('a run episode persisted via addEpisode is recalled by a related query', async () => {
    const store = join(dir, 'brain.db');
    const run = {
      task: { goal: '', budget: {} },
      status: 'done',
      output: 'Acknowledged: the release codename is copper-falcon-77.',
      costUSD: 0.002,
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 },
      steps: [
        {
          type: 'model_turn',
          model: 'accounts/fireworks/models/glm-5p2',
          adapter: 'fireworks-glm',
        },
        { type: 'final', text: 'ok', reason: 'stop' },
      ],
    };
    const episode = buildEpisode({
      goal: "Remember: the release codename is 'copper-falcon-77'",
      run,
      adapterId: 'fireworks-glm',
      recalledCount: 0,
      version: '0.0.0-test',
      durationMs: 10,
    });

    const brain = Brain.open(store);
    const written = await brain.addEpisode(episode);
    brain.close();

    // Reopen from disk — persistence, not cache — and retrieve.
    const reopened = Brain.open(store);
    const result = await reopened.query('what is the release codename?', {
      limit: 6,
      tokenBudget: 1200,
    });
    const { block, packed } = packRecall(result.results, { tokenBudget: 1200 });
    reopened.close();

    expect(packed.length).toBeGreaterThan(0);
    expect(packed[0].recordId).toBe(written.id);
    expect(block).toContain('copper-falcon-77');
    expect(block).toContain(`id ${written.id}`);
    expect(block).toContain('source: glam run');
  });
});
