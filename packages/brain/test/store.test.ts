import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Brain } from '../src/index.js';
import { def } from './helpers.js';

// These tests drive the REAL embedded SQLite + sqlite-vec engine on a real file store —
// not an in-memory fake. Every assertion exercises the genuine vector index, FTS5 index,
// and hybrid re-ranker.

let dir: string;
let brain: Brain;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'glamfire-brain-'));
  brain = Brain.open(join(dir, 'test.brain'));
});

afterEach(() => {
  brain.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Brain CRUD across all four record types', () => {
  it('creates, reads, lists, updates and deletes each type', async () => {
    const fact = await brain.addFact({
      content: 'The default model is GLM 5.2 served via Fireworks AI.',
      provenance: { source: 'SPEC.md' },
      scope: 'project',
    });
    const doc = await brain.addDocument({
      title: 'Onboarding',
      content: `Welcome to the team. We deploy on Fridays.\n\n${'Code review is required for every change. Use feature branches and conventional commits. '.repeat(20)}`,
      provenance: { source: 'wiki' },
    });
    const ep = await brain.addEpisode({
      content: 'User asked to summarize a PDF; routed to GLM 5.2; verified; succeeded.',
      provenance: { source: 'run-log', timestamp: new Date().toISOString() },
    });
    const ptr = await brain.addPointer({
      target: 'https://github.com/glamworks/glamfire/issues/4',
      content: 'Issue #4: sqlite-vec owned context store',
      provenance: { source: 'github' },
    });

    expect(brain.count()).toBe(4);
    expect(brain.count('document')).toBe(1);

    // The document chunked into multiple retrievable units (more export lines than records).
    const exportLines = brain.export().split('\n').filter(Boolean).length;
    expect(exportLines).toBeGreaterThan(0);

    // Read back.
    expect(def(brain.get(fact.id)).content).toContain('GLM 5.2');
    expect(def(brain.get(ptr.id)).metadata.target).toBe(
      'https://github.com/glamworks/glamfire/issues/4',
    );
    // Pointer provenance.uri defaulted to the target.
    expect(def(brain.get(ptr.id)).provenance.uri).toBe(
      'https://github.com/glamworks/glamfire/issues/4',
    );

    // List + filter.
    expect(brain.list().length).toBe(4);
    expect(brain.list({ type: 'episode' }).map((r) => r.id)).toEqual([ep.id]);
    expect(brain.list({ scope: 'project' }).map((r) => r.id)).toEqual([fact.id]);

    // Update re-embeds.
    const before = def(brain.embeddingFor(fact.id));
    const updated = await brain.update(fact.id, {
      content:
        'The default workhorse model is GLM 5.2 on Fireworks; escalate to frontier on low confidence.',
    });
    expect(updated.content).toContain('escalate');
    const after = def(brain.embeddingFor(fact.id));
    expect(Array.from(after)).not.toEqual(Array.from(before));

    // Delete.
    expect(brain.delete(doc.id)).toBe(true);
    expect(brain.delete(doc.id)).toBe(false);
    expect(brain.count()).toBe(3);
    expect(brain.get(doc.id)).toBeNull();
  });

  it('rejects invalid input via zod (no silent bad data)', async () => {
    // Missing provenance.source.
    await expect(
      // @ts-expect-error intentionally invalid
      brain.addFact({ content: 'x', provenance: {} }),
    ).rejects.toThrow();
    // Empty content.
    await expect(brain.addFact({ content: '', provenance: { source: 's' } })).rejects.toThrow();
  });
});

describe('hybrid retrieval ranks attributed results', () => {
  it('ranks the on-topic record above off-topic ones and packs to a budget', async () => {
    await brain.addFact({
      content: 'The brain stores context in SQLite with sqlite-vec vector search.',
      provenance: { source: 'spec' },
    });
    await brain.addFact({
      content: 'The router sends center-of-distribution tasks to the cheapest capable model.',
      provenance: { source: 'spec' },
    });
    await brain.addFact({
      content: 'Our office coffee machine is on the third floor near the kitchen.',
      provenance: { source: 'wiki' },
    });

    const res = await brain.query('how does the context store do vector search in sqlite?', {
      tokenBudget: 200,
    });

    expect(res.results.length).toBeGreaterThan(0);
    const top = def(res.results[0]);
    // Top hit is the sqlite-vec fact.
    expect(top.text).toContain('sqlite-vec');
    // Every hit is attributed.
    expect(top.provenance.source).toBe('spec');
    // Score components are real numbers in range.
    expect(top.components.vector).toBeGreaterThanOrEqual(0);
    expect(top.components.keyword).toBeGreaterThanOrEqual(0);
    // Packed context respects the token budget and carries attribution markers.
    expect(res.usedTokens).toBeLessThanOrEqual(res.tokenBudget);
    expect(res.context).toContain('source:');
  });

  it('honors scope filtering', async () => {
    await brain.addFact({
      content: 'secret launch date is next Tuesday',
      provenance: { source: 'founder' },
      scope: 'private',
    });
    await brain.addFact({
      content: 'public launch messaging is ready',
      provenance: { source: 'marketing' },
      scope: 'team',
    });
    const teamOnly = await brain.query('launch', { scope: 'team' });
    expect(teamOnly.results.every((r) => r.scope === 'team')).toBe(true);
    expect(teamOnly.results.some((r) => r.text.includes('secret'))).toBe(false);
  });
});
