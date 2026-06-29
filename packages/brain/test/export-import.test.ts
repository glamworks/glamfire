import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Brain, type MemoryRecord } from '../src/index.js';
import { def } from './helpers.js';

// The headline ownership invariant (SPEC §5.2): the entire store exports to a documented,
// human-readable, model-neutral format and imports back into a fresh store with content,
// provenance, AND embeddings intact. Portability is a tested invariant, not a flag.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'glamfire-export-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seed(brain: Brain): Promise<void> {
  await brain.addFact({
    content: 'glamfire keeps your context local-first and portable.',
    provenance: { source: 'SPEC.md', author: 'glamworks' },
    scope: 'project',
  });
  await brain.addDocument({
    title: 'Ownership',
    content: `You own your context. The store exports to JSONL and imports back.\n\n${'No proprietary lock-in. No opaque embeddings. '.repeat(15)}`,
    provenance: { source: 'docs/ownership.md' },
    scope: 'team',
  });
  await brain.addEpisode({
    content: 'Routed a summarization task to GLM 5.2 and verified the output.',
    provenance: { source: 'run-2026-06-29' },
  });
  await brain.addPointer({
    target: 'https://github.com/glamworks/glamfire',
    content: 'glamfire repository',
    provenance: { source: 'github' },
  });
}

/** Stable ordering by id so two stores' record sets compare deterministically. */
function normalize(records: MemoryRecord[]): MemoryRecord[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

describe('export → import ownership invariant', () => {
  it('round-trips content, provenance, and embeddings bit-exactly into a fresh store', async () => {
    const src = Brain.open(join(dir, 'src.brain'));
    await seed(src);
    const original = normalize(src.list());
    const jsonl = src.export();

    // The export is real JSONL: a header line plus one line per record, all valid JSON.
    const lines = jsonl.split('\n').filter(Boolean);
    const header = JSON.parse(def(lines[0]));
    expect(header.glamfire_brain_export).toBe(1);
    expect(header.embedder.id).toBe(src.embedder.id);
    expect(header.counts.records).toBe(4);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();

    // Import into a brand-new, empty store.
    const dst = Brain.open(join(dir, 'dst.brain'));
    expect(dst.count()).toBe(0);
    const result = await dst.import(jsonl);
    expect(result.records).toBe(4);

    // Records are identical (content + provenance + metadata + scope + timestamps + id).
    const imported = normalize(dst.list());
    expect(imported).toEqual(original);

    // Embeddings round-trip bit-exactly for every record's first chunk.
    for (const rec of original) {
      const a = def(src.embeddingFor(rec.id));
      const b = def(dst.embeddingFor(rec.id));
      expect(Array.from(b)).toEqual(Array.from(a));
    }

    // And the imported store is fully queryable on its own.
    const q = await dst.query('how does glamfire keep my context portable?');
    expect(q.results.length).toBeGreaterThan(0);
    expect(def(q.results[0]).provenance.source).toBeTruthy();

    src.close();
    dst.close();
  });

  it('regenerates embeddings from text deterministically (no remote service required)', async () => {
    const src = Brain.open(join(dir, 's2.brain'));
    await seed(src);
    const jsonl = src.export();
    const ids = src.list().map((r) => r.id);

    // Import with regenerate: embeddings are recomputed from text, not copied.
    const regen = Brain.open(join(dir, 'r2.brain'));
    await regen.import(jsonl, { regenerate: true });

    // Deterministic embedder ⇒ regenerated vectors equal the originals.
    for (const id of ids) {
      const a = def(src.embeddingFor(id));
      const b = def(regen.embeddingFor(id));
      expect(Array.from(b)).toEqual(Array.from(a));
    }
    src.close();
    regen.close();
  });

  it('refuses an import whose embedder dimension does not match the store', async () => {
    const src = Brain.open(join(dir, 's3.brain'));
    await src.addFact({ content: 'hi', provenance: { source: 's' } });
    const jsonl = src.export();
    src.close();

    // Open a store with a different-dimension embedder and try to import: must fail loudly.
    const { HashEmbedder } = await import('../src/embedder.js');
    const dst = Brain.open(join(dir, 'd3.brain'), { embedder: new HashEmbedder({ dim: 128 }) });
    await expect(dst.import(jsonl)).rejects.toThrow(/dim/);
    dst.close();
  });
});
