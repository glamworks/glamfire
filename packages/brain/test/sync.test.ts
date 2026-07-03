import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Brain, type MemoryRecord, scanTree, sha256 } from '../src/index.js';
import { def } from './helpers.js';

// The flat-file layer, driven for real: a file-backed Brain writes every record
// through to a markdown tree, `syncFiles` reconciles human edits by content hash
// (file-wins for sources, newest-wins for summaries, conflicts surfaced), and the
// whole index is disposable (see rebuild.test.ts for the headline invariant).

let dir: string;
let root: string; // the brain/ markdown tree
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'glamfire-sync-'));
  root = join(dir, 'brain');
  dbPath = join(dir, 'brain.sqlite');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const open = () => Brain.open(dbPath, { filesRoot: root });

function fileFor(brain: Brain, id: string): { path: string; text: string } {
  const hit = scanTree(root)
    .map((f) => ({ path: f.relPath, text: f.text }))
    .find((f) => f.text.startsWith(`---\nid: ${id}\n`));
  return def(hit);
}

describe('write-through: the markdown tree is the durable half of every write', () => {
  it('creates one readable markdown file per record, in the right directory', async () => {
    const brain = open();
    const fact = await brain.addFact({
      content: 'The workhorse model is GLM 5.2 on Fireworks.',
      provenance: { source: 'SPEC.md' },
      tags: ['routing'],
      sharing: 'team',
    });
    const doc = await brain.addDocument({
      title: 'Onboarding',
      content: 'Welcome. We deploy on Fridays.',
      provenance: { source: 'wiki' },
    });
    const note = await brain.addFact({
      content: 'Summary: deploys are weekly.',
      provenance: { source: 'synthesis' },
      derivedFrom: [{ id: doc.id }],
    });
    const ptr = await brain.addPointer({
      target: 'https://github.com/glamworks/glamfire/issues/36',
      provenance: { source: 'github' },
    });
    const ep = await brain.addEpisode({
      content: 'Ran a summarization; verified output.',
      provenance: { source: 'run-log' },
    });

    expect(fileFor(brain, fact.id).path).toMatch(/^facts[/\\]/);
    expect(fileFor(brain, doc.id).path).toMatch(/^sources[/\\]/);
    expect(fileFor(brain, note.id).path).toMatch(/^notes[/\\]/); // derived ⇒ summary ⇒ notes/
    expect(fileFor(brain, ptr.id).path).toMatch(/^pointers[/\\]/);
    expect(fileFor(brain, ep.id).path).toMatch(/^episodes[/\\]/);

    // The file is real, readable markdown with the sharing/truth classification.
    const text = fileFor(brain, fact.id).text;
    expect(text).toContain('truth: source');
    expect(text).toContain('sharing: team');
    expect(text).toContain('The workhorse model is GLM 5.2 on Fireworks.');

    // The summary auto-captured a derived_from hash of its source's content.
    expect(def(brain.get(note.id)).derivedFrom).toEqual([
      { id: doc.id, hash: sha256(doc.content) },
    ]);

    // Update rewrites the file; delete removes it.
    await brain.update(fact.id, { content: 'GLM 5.2 stays the default workhorse.' });
    expect(fileFor(brain, fact.id).text).toContain('stays the default');
    const factPath = join(root, fileFor(brain, fact.id).path);
    brain.delete(fact.id);
    expect(existsSync(factPath)).toBe(false);
    brain.close();
  });

  it('a git-ignore guards the disposable index dir', () => {
    const brain = open();
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.index/');
    brain.close();
  });
});

describe('glam brain sync semantics (content hashes, never mtimes)', () => {
  it('file edited by a human → file wins, index re-embedded', async () => {
    const brain = open();
    const fact = await brain.addFact({
      content: 'Standup is at 9am.',
      provenance: { source: 'wiki' },
    });
    const before = def(brain.embeddingFor(fact.id));
    const { path, text } = fileFor(brain, fact.id);
    writeFileSync(join(root, path), text.replace('Standup is at 9am.', 'Standup moved to 10am.'));

    const report = await brain.syncFiles();
    expect(report.updatedFromFiles).toBe(1);
    expect(report.conflicts).toEqual([]);
    expect(def(brain.get(fact.id)).content).toBe('Standup moved to 10am.');
    // Re-embedded for real.
    expect(Array.from(def(brain.embeddingFor(fact.id)))).not.toEqual(Array.from(before));
    // And the file was canonicalized (frontmatter `updated` bumped).
    expect(fileFor(brain, fact.id).text).toContain('Standup moved to 10am.');
    brain.close();
  });

  it('file deleted by a human → record tombstoned from the index', async () => {
    const brain = open();
    const fact = await brain.addFact({ content: 'ephemeral', provenance: { source: 's' } });
    rmSync(join(root, fileFor(brain, fact.id).path));
    const report = await brain.syncFiles();
    expect(report.tombstoned).toBe(1);
    expect(brain.get(fact.id)).toBeNull();
    brain.close();
  });

  it('plain markdown dropped into the tree is adopted as a record (external-writer path)', async () => {
    const brain = open();
    writeFileSync(
      join(root, 'facts', 'from-claude-code.md'),
      '# Session learning\n\nThe glamfire smoke test drives the real CLI.\n',
    );
    const report = await brain.syncFiles();
    expect(report.imported).toBe(1);
    const adopted = def(brain.list({ type: 'fact' })[0]);
    expect(adopted.title).toBe('Session learning');
    expect(adopted.content).toBe('The glamfire smoke test drives the real CLI.');
    expect(adopted.provenance.source).toBe('file:facts/from-claude-code.md');
    expect(adopted.sharing).toBe('personal'); // nothing becomes team-shared by omission
    // The file gained canonical frontmatter in place.
    expect(readFileSync(join(root, 'facts', 'from-claude-code.md'), 'utf8')).toContain(
      `id: ${adopted.id}`,
    );
    // Retrieval reaches it through the rebuilt index.
    const q = await brain.query('what does the smoke test drive?');
    expect(def(q.results[0]).recordId).toBe(adopted.id);
    brain.close();
  });

  it('first sync exports pre-existing SQLite-resident records into the tree (migration)', async () => {
    // A legacy, non-file-backed store (the pre-flat-file world).
    const legacy = Brain.open(dbPath);
    await legacy.addFact({
      content: 'I predate the markdown tree.',
      provenance: { source: 'old' },
    });
    await legacy.addDocument({
      title: 'Legacy doc',
      content: 'Chunked content from the SQLite-only era.',
      provenance: { source: 'old' },
    });
    legacy.close();

    const brain = open();
    const report = await brain.syncFiles();
    expect(report.exported).toBe(2);
    const tree = scanTree(root);
    expect(tree.length).toBe(2);
    expect(tree.some((f) => f.text.includes('I predate the markdown tree.'))).toBe(true);
    // INDEX.md and log.md were generated.
    expect(readFileSync(join(root, 'INDEX.md'), 'utf8')).toContain('Legacy doc');
    expect(readFileSync(join(root, 'log.md'), 'utf8')).toMatch(/export .*id=/);
    brain.close();
  });

  it('both sides changed on a source → the human file wins, DB version surfaced as *.conflict.md', async () => {
    const brain = open();
    const fact = await brain.addFact({
      content: 'Original truth.',
      provenance: { source: 'human' },
    });
    // Diverge: DB updated through a NON-file-backed handle (no write-through)…
    brain.close();
    const bare = Brain.open(dbPath);
    await bare.update(fact.id, { content: 'Database-side edit.' });
    bare.close();
    // …while the human edits the file.
    const reopened = open();
    const { path, text } = fileFor(reopened, fact.id);
    writeFileSync(join(root, path), text.replace('Original truth.', 'Human file edit.'));

    const report = await reopened.syncFiles();
    expect(report.conflicts.length).toBe(1);
    const c = def(report.conflicts[0]);
    expect(c.resolution).toBe('file-wins');
    expect(def(reopened.get(fact.id)).content).toBe('Human file edit.');
    // The losing DB version is preserved, surfaced, never silently merged.
    const conflictText = readFileSync(join(root, c.conflictPath), 'utf8');
    expect(conflictText).toContain('Database-side edit.');
    expect(readFileSync(join(root, 'log.md'), 'utf8')).toContain('conflict');
    reopened.close();
  });

  it('both sides changed on a summary → newest wins (it is regenerable), loser preserved', async () => {
    const brain = open();
    const src = await brain.addFact({ content: 'source fact', provenance: { source: 's' } });
    const note = await brain.addFact({
      content: 'Old summary.',
      provenance: { source: 'synthesis' },
      derivedFrom: [{ id: src.id }],
    });
    brain.close();
    const bare = Brain.open(dbPath);
    await bare.update(note.id, { content: 'DB summary (older).' });
    bare.close();
    const reopened = open();
    const { path, text } = fileFor(reopened, note.id);
    // The file edit happens after the DB edit → file mtime is newest → file wins.
    writeFileSync(join(root, path), text.replace('Old summary.', 'File summary (newest).'));
    const report = await reopened.syncFiles();
    const c = def(report.conflicts[0]);
    expect(c.truth).toBe('summary');
    expect(c.resolution).toBe('file-wins');
    expect(def(reopened.get(note.id)).content).toBe('File summary (newest).');
    expect(readFileSync(join(root, c.conflictPath), 'utf8')).toContain('DB summary (older).');
    reopened.close();
  });

  it('a file with untrusted frontmatter is reported and skipped, never guessed', async () => {
    const brain = open();
    writeFileSync(
      join(root, 'facts', 'broken.md'),
      '---\nid: broken-1\ntype: nonsense\ntruth: source\nsharing: personal\nprovenance:\n  source: s\n---\n\nbody\n',
    );
    const report = await brain.syncFiles();
    expect(report.errors.length).toBe(1);
    expect(def(report.errors[0]).message).toContain('type');
    expect(brain.count()).toBe(0);
    brain.close();
  });

  it('sync is idempotent: a second run with no edits changes nothing', async () => {
    const brain = open();
    await brain.addFact({ content: 'stable', provenance: { source: 's' } });
    await brain.syncFiles();
    const report = await brain.syncFiles();
    expect(report).toMatchObject({
      exported: 0,
      imported: 0,
      updatedFromFiles: 0,
      updatedFromDb: 0,
      tombstoned: 0,
      conflicts: [],
      errors: [],
      records: 1,
    });
    brain.close();
  });
});

describe('schema migration', () => {
  it('opens a v1 (pre-flat-file) store in place, defaulting truth/sharing safely', async () => {
    // Build a genuine v1 store: v1 schema DDL + a v1-shaped record row.
    const Database = (await import('better-sqlite3')).default;
    const { load: loadVec } = await import('sqlite-vec');
    const db = new Database(dbPath);
    loadVec(db);
    db.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE records (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT, content TEXT NOT NULL,
        scope TEXT NOT NULL, provenance TEXT NOT NULL, metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL, text TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding float[256]);
      CREATE VIRTUAL TABLE fts_chunks USING fts5(text, tokenize='porter unicode61');
    `);
    const setMeta = db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
    setMeta.run('schema_version', '1');
    setMeta.run('embedder_id', 'hash-fh-v1-d256');
    setMeta.run('embedder_dim', '256');
    setMeta.run('created_at', String(Date.now()));
    db.prepare(
      `INSERT INTO records(id, type, title, content, scope, provenance, metadata, created_at, updated_at)
       VALUES ('v1-rec', 'fact', NULL, 'a v1-era fact', 'private', '{"source":"old"}', '{}', 1, 1)`,
    ).run();
    db.prepare(
      "INSERT INTO chunks(record_id, ordinal, text) VALUES ('v1-rec', 0, 'a v1-era fact')",
    ).run();
    db.close();

    const brain = Brain.open(dbPath);
    const rec: MemoryRecord = def(brain.get('v1-rec'));
    expect(rec.truth).toBe('source');
    expect(rec.sharing).toBe('personal');
    expect(rec.tags).toEqual([]);
    expect(rec.derivedFrom).toEqual([]);
    brain.close();
  });

  it('imports a v1-era JSONL export (no truth/sharing fields) with safe defaults', async () => {
    const header = {
      glamfire_brain_export: 1,
      formatVersion: 1,
      embedder: { id: 'hash-fh-v1-d256', dim: 256 },
      exportedAt: new Date().toISOString(),
      counts: { records: 1, chunks: 1 },
    };
    const oldRecord = {
      record: {
        id: 'old-1',
        type: 'fact',
        title: null,
        content: 'exported before the flat-file era',
        scope: 'project',
        provenance: { source: 'old-export' },
        metadata: {},
        createdAt: 1,
        updatedAt: 2,
      },
      chunks: [{ ordinal: 0, text: 'exported before the flat-file era', embedding: '' }],
    };
    const brain = Brain.open(dbPath);
    const jsonl = `${JSON.stringify(header)}\n${JSON.stringify(oldRecord)}\n`;
    await brain.import(jsonl, { regenerate: true });
    const rec = def(brain.get('old-1'));
    expect(rec.truth).toBe('source');
    expect(rec.sharing).toBe('personal');
    expect(rec.createdAt).toBe(1); // provenance timestamps preserved exactly
    brain.close();
  });
});
