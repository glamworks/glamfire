import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Brain, type MemoryRecord } from '../src/index.js';
import { def } from './helpers.js';

// THE flat-file invariant (research/31, issue #36): the markdown tree is the brain;
// SQLite is a disposable index. Delete the .sqlite file, run `glam brain rebuild`,
// and the index is reconstructed losslessly — every record field, every timestamp,
// every chunk, every (deterministic) embedding, full retrieval. This is the
// flat-file sibling of the export/import ownership invariant.

let dir: string;
let root: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'glamfire-rebuild-'));
  root = join(dir, 'brain');
  dbPath = join(dir, 'brain.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function normalize(records: MemoryRecord[]): MemoryRecord[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

async function seed(brain: Brain): Promise<void> {
  await brain.addFact({
    content: 'glamfire keeps your context local-first and portable.',
    provenance: { source: 'SPEC.md', author: 'glamworks' },
    scope: 'project',
    sharing: 'team',
    tags: ['ownership'],
  });
  const doc = await brain.addDocument({
    title: 'Ownership',
    content: `You own your context.\n\n${'No proprietary lock-in. No opaque embeddings. '.repeat(30)}`,
    provenance: { source: 'docs/ownership.md' },
    chunking: { maxChars: 200, overlapChars: 20 },
  });
  await brain.addFact({
    content: 'Summary: the ownership doc promises portability with no lock-in.',
    provenance: { source: 'synthesis' },
    derivedFrom: [{ id: doc.id, span: 'chunk:0' }],
  });
  await brain.addEpisode({
    content: 'Routed a summarization task to GLM 5.2 and verified the output.',
    provenance: { source: 'run-2026-07-03' },
  });
  await brain.addPointer({
    target: 'https://github.com/glamworks/glamfire/issues/36',
    content: 'Issue #36: flat-file knowledge base',
    provenance: { source: 'github' },
  });
}

describe('delete the .sqlite → rebuild reconstructs the index losslessly', () => {
  it('every record, timestamp, embedding, and query result survives', async () => {
    const brain = Brain.open(dbPath, { filesRoot: root });
    await seed(brain);
    const original = normalize(brain.list());
    const originalExport = brain.export();
    const originalEmbeddings = new Map(
      original.map((r) => [r.id, Array.from(def(brain.embeddingFor(r.id)))]),
    );
    const originalQuery = await brain.query('how do I keep my context portable?');
    brain.close();

    // The catastrophe the invariant is for: the index is gone.
    rmSync(dbPath);
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    expect(existsSync(dbPath)).toBe(false);

    const { brain: rebuilt, report } = await Brain.rebuildFromFiles(root, dbPath);
    expect(report.imported).toBe(5);
    expect(report.errors).toEqual([]);
    expect(report.conflicts).toEqual([]);

    // Records: field-for-field identical, including ids and epoch-ms timestamps.
    expect(normalize(rebuilt.list())).toEqual(original);

    // Embeddings: the default embedder is deterministic, so vectors are bit-equal —
    // including the custom-chunked document (chunking persisted via metadata).
    for (const rec of original) {
      expect(Array.from(def(rebuilt.embeddingFor(rec.id)))).toEqual(originalEmbeddings.get(rec.id));
    }

    // The whole export (records + chunk texts + vectors) matches, modulo the
    // exportedAt stamp in the header line.
    const stripHeader = (jsonl: string) => jsonl.split('\n').slice(1).join('\n');
    expect(stripHeader(rebuilt.export())).toBe(stripHeader(originalExport));

    // And retrieval over the rebuilt index behaves identically.
    const q = await rebuilt.query('how do I keep my context portable?');
    expect(q.results.map((r) => [r.recordId, r.chunkOrdinal])).toEqual(
      originalQuery.results.map((r) => [r.recordId, r.chunkOrdinal]),
    );
    rebuilt.close();
  });

  it('rebuild also recovers from a corrupted index file', async () => {
    const brain = Brain.open(dbPath, { filesRoot: root });
    await seed(brain);
    const original = normalize(brain.list());
    brain.close();

    const { writeFileSync } = await import('node:fs');
    writeFileSync(dbPath, 'this is not a sqlite database');
    const { brain: rebuilt } = await Brain.rebuildFromFiles(root, dbPath);
    expect(normalize(rebuilt.list())).toEqual(original);
    rebuilt.close();
  });
});
