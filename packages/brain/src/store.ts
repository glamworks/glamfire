// The owned context store (SPEC §5.2): embedded SQLite + sqlite-vec, a single portable
// file, zero external services on Mac/Windows/Linux. Four first-class record types with
// provenance, hybrid retrieval (vector + keyword + recency + provenance), and a tested
// export/import ownership invariant. No remote dependency is required to read your context.
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { load as loadVec } from 'sqlite-vec';
import { chunkText, estimateTokens } from './chunk.js';
import { type Embedder, HashEmbedder } from './embedder.js';
import {
  FileFormatError,
  type IndexEntry,
  adoptionDefaults,
  appendLog,
  ensureTree,
  parseRecordFile,
  recordRelPath,
  scanTree,
  serializeRecordFile,
  sha256,
  writeIndex,
  writeRecordFile,
} from './files.js';
import {
  EXPORT_FORMAT_VERSION,
  type ExportHeader,
  type ExportedRecord,
  decodeVector,
  encodeVector,
} from './serialize.js';
import {
  type ChunkOptions,
  ChunkOptionsSchema,
  type DerivedFrom,
  type DocumentInput,
  DocumentInputSchema,
  type EpisodeInput,
  EpisodeInputSchema,
  type FactInput,
  FactInputSchema,
  type ListFilter,
  type MemoryRecord,
  type PointerInput,
  PointerInputSchema,
  type Provenance,
  ProvenanceSchema,
  type QueryResult,
  type RecordType,
  type Scope,
  type ScoredChunk,
  type Sharing,
  type Truth,
  type UpdatePatch,
  UpdatePatchSchema,
} from './types.js';

// v2 adds the flat-file layer: truth/sharing/tags/derived_from columns on records
// and the sync_state table (file path + content hash per record). v1 stores are
// migrated in place on open.
const SCHEMA_VERSION = 2;

/** Tunable hybrid-retrieval weights. All defaults are sane and reviewable. */
export interface HybridWeights {
  vector: number;
  keyword: number;
  recency: number;
  provenance: number;
  /** Half-life (days) for the recency decay. */
  recencyHalfLifeDays: number;
  /** How many candidates to pull from each retrieval arm before re-ranking. */
  candidatePool: number;
  /** Trust multiplier per record type (durability/authority prior). */
  typeTrust: Record<RecordType, number>;
  /** Optional per-source trust overrides. */
  sourceTrust: Record<string, number>;
}

export const DEFAULT_WEIGHTS: HybridWeights = {
  vector: 0.55,
  keyword: 0.25,
  recency: 0.1,
  provenance: 0.1,
  recencyHalfLifeDays: 30,
  candidatePool: 50,
  typeTrust: { fact: 0.9, document: 0.6, episode: 0.7, pointer: 0.5 },
  sourceTrust: {},
};

export interface BrainOptions {
  /** Embedding backend. Default: offline deterministic `HashEmbedder`. */
  embedder?: Embedder;
  /** Hybrid retrieval weights (merged over defaults). */
  weights?: Partial<HybridWeights>;
  /**
   * Root of the flat-file markdown tree (research/31). When set, the markdown is
   * authoritative and every write goes through to a record file — SQLite is just
   * the rebuildable index. When unset, the store behaves as a pure SQLite brain
   * (the pre-flat-file behavior, still fully supported).
   */
  filesRoot?: string;
}

/** One reconciliation conflict, surfaced (never silently merged). */
export interface SyncConflict {
  id: string;
  path: string;
  truth: Truth;
  /** How it was resolved: sources keep the file; summaries keep the newest side. */
  resolution: 'file-wins' | 'db-wins';
  /** Where the losing version was preserved. */
  conflictPath: string;
}

/** What `syncFiles` did, in numbers a human (and the smoke test) can check. */
export interface SyncReport {
  /** DB-resident records exported to new markdown files (the migration path). */
  exported: number;
  /** New markdown files imported into the index (incl. adopted plain markdown). */
  imported: number;
  /** Records updated from edited files (file wins). */
  updatedFromFiles: number;
  /** Files rewritten from DB-side changes (write-through catch-up). */
  updatedFromDb: number;
  /** Records tombstoned because their file was deleted. */
  tombstoned: number;
  /** Files whose frontmatter could not be trusted; listed, skipped, never guessed. */
  errors: { path: string; message: string }[];
  conflicts: SyncConflict[];
  /** Total records in the tree+index after the sync. */
  records: number;
}

export interface QueryOptions {
  /** Max ranked results to return (default 10). */
  limit?: number;
  /** Token budget for the packed context block (default 2048). */
  tokenBudget?: number;
  /** Restrict to one or more scopes. */
  scope?: Scope | Scope[];
  /** Per-query weight overrides. */
  weights?: Partial<HybridWeights>;
}

interface RecordRow {
  id: string;
  type: RecordType;
  title: string | null;
  content: string;
  scope: Scope;
  truth: Truth;
  sharing: Sharing;
  tags: string;
  derived_from: string;
  provenance: string;
  metadata: string;
  created_at: number;
  updated_at: number;
}

interface SyncStateRow {
  record_id: string;
  path: string;
  hash: string;
  synced_at: number;
}

interface ChunkForWrite {
  text: string;
  vec: Float32Array;
}

function toBigInt(v: number | bigint): bigint {
  return typeof v === 'bigint' ? v : BigInt(v);
}

function vecToBytes(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Chunking options for a record: `metadata.chunking` when present, else defaults. */
function chunkOptionsFor(rec: MemoryRecord): ChunkOptions {
  const parsed = ChunkOptionsSchema.safeParse(rec.metadata.chunking ?? {});
  return parsed.success ? parsed.data : ChunkOptionsSchema.parse({});
}

/** Build a safe FTS5 MATCH expression from free text (OR of quoted tokens). */
function buildFtsQuery(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  if (!tokens || tokens.length === 0) return null;
  const unique = Array.from(new Set(tokens));
  return unique.map((t) => `"${t}"`).join(' OR ');
}

function rowToRecord(row: RecordRow): MemoryRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    scope: row.scope,
    truth: row.truth,
    sharing: row.sharing,
    tags: JSON.parse(row.tags) as string[],
    derivedFrom: JSON.parse(row.derived_from) as DerivedFrom[],
    provenance: JSON.parse(row.provenance) as Provenance,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fill in the flat-file fields for records from older exports/stores. Additive and
 * lossless: old JSONL exports import unchanged, gaining safe defaults
 * (`truth: source` unless derived, `sharing: personal` — nothing becomes team-shared
 * by omission).
 */
function normalizeRecord(rec: MemoryRecord): MemoryRecord {
  const derivedFrom = rec.derivedFrom ?? [];
  return {
    ...rec,
    truth: rec.truth ?? (derivedFrom.length > 0 ? 'summary' : 'source'),
    sharing: rec.sharing ?? 'personal',
    tags: rec.tags ?? [],
    derivedFrom,
  };
}

export class Brain {
  private readonly db: Database.Database;
  readonly embedder: Embedder;
  readonly weights: HybridWeights;
  /** Root of the authoritative markdown tree, when this brain is file-backed. */
  readonly filesRoot: string | null;

  private constructor(
    db: Database.Database,
    embedder: Embedder,
    weights: HybridWeights,
    filesRoot: string | null,
  ) {
    this.db = db;
    this.embedder = embedder;
    this.weights = weights;
    this.filesRoot = filesRoot;
  }

  /**
   * Open (or create) a brain at `path`. Use `:memory:` for an ephemeral store. The store
   * is bound to its embedder on first write; reopening with an incompatible embedder
   * fails loudly rather than silently corrupting retrieval.
   */
  static open(path: string, opts: BrainOptions = {}): Brain {
    const embedder = opts.embedder ?? new HashEmbedder();
    const weights: HybridWeights = {
      ...DEFAULT_WEIGHTS,
      ...opts.weights,
      typeTrust: { ...DEFAULT_WEIGHTS.typeTrust, ...opts.weights?.typeTrust },
      sourceTrust: { ...DEFAULT_WEIGHTS.sourceTrust, ...opts.weights?.sourceTrust },
    };
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    loadVec(db);
    Brain.ensureSchema(db, embedder);
    const filesRoot = opts.filesRoot ?? null;
    if (filesRoot !== null) ensureTree(filesRoot);
    return new Brain(db, embedder, weights, filesRoot);
  }

  private static ensureSchema(db: Database.Database, embedder: Embedder): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        scope TEXT NOT NULL,
        truth TEXT NOT NULL DEFAULT 'source',
        sharing TEXT NOT NULL DEFAULT 'personal',
        tags TEXT NOT NULL DEFAULT '[]',
        derived_from TEXT NOT NULL DEFAULT '[]',
        provenance TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_record ON chunks(record_id);
      CREATE TABLE IF NOT EXISTS sync_state (
        record_id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        hash TEXT NOT NULL,
        synced_at INTEGER NOT NULL
      );
    `);
    // Migrate v1 stores in place: the new columns are additive with safe defaults.
    const cols = new Set(
      (db.pragma('table_info(records)') as { name: string }[]).map((c) => c.name),
    );
    const added: string[] = [];
    if (!cols.has('truth'))
      added.push("ALTER TABLE records ADD COLUMN truth TEXT NOT NULL DEFAULT 'source'");
    if (!cols.has('sharing'))
      added.push("ALTER TABLE records ADD COLUMN sharing TEXT NOT NULL DEFAULT 'personal'");
    if (!cols.has('tags'))
      added.push("ALTER TABLE records ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
    if (!cols.has('derived_from'))
      added.push("ALTER TABLE records ADD COLUMN derived_from TEXT NOT NULL DEFAULT '[]'");
    for (const sql of added) db.exec(sql);
    db.prepare(
      "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(SCHEMA_VERSION));
    const existingDim = db.prepare("SELECT value FROM meta WHERE key = 'embedder_dim'").get() as
      | { value: string }
      | undefined;
    if (existingDim === undefined) {
      // Fresh store: create the embedder-dimensioned vector + FTS tables and record meta.
      db.exec(
        `CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding float[${embedder.dim}]);
         CREATE VIRTUAL TABLE fts_chunks USING fts5(text, tokenize='porter unicode61');`,
      );
      const setMeta = db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
      setMeta.run('embedder_id', embedder.id);
      setMeta.run('embedder_dim', String(embedder.dim));
      setMeta.run('created_at', String(Date.now()));
    } else {
      const storedDim = Number(existingDim.value);
      if (storedDim !== embedder.dim) {
        throw new Error(
          `brain store dimension mismatch: store=${storedDim}, embedder "${embedder.id}"=${embedder.dim}`,
        );
      }
      const storedId = (
        db.prepare("SELECT value FROM meta WHERE key = 'embedder_id'").get() as { value: string }
      ).value;
      if (storedId !== embedder.id) {
        throw new Error(
          `brain store embedder mismatch: store="${storedId}", supplied="${embedder.id}". Vectors from a different embedder are not comparable; re-import with regenerate to switch embedders.`,
        );
      }
    }
  }

  /** Persist a record plus its embedded chunks atomically. */
  private writeRecord(rec: MemoryRecord, chunks: ChunkForWrite[]): void {
    const insRecord = this.db.prepare(
      `INSERT INTO records(id, type, title, content, scope, truth, sharing, tags, derived_from,
                           provenance, metadata, created_at, updated_at)
       VALUES (@id, @type, @title, @content, @scope, @truth, @sharing, @tags, @derived_from,
               @provenance, @metadata, @created_at, @updated_at)`,
    );
    const insChunk = this.db.prepare(
      'INSERT INTO chunks(record_id, ordinal, text) VALUES (?, ?, ?)',
    );
    const insVec = this.db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (?, ?)');
    const insFts = this.db.prepare('INSERT INTO fts_chunks(rowid, text) VALUES (?, ?)');
    const tx = this.db.transaction(() => {
      insRecord.run({
        id: rec.id,
        type: rec.type,
        title: rec.title,
        content: rec.content,
        scope: rec.scope,
        truth: rec.truth,
        sharing: rec.sharing,
        tags: JSON.stringify(rec.tags),
        derived_from: JSON.stringify(rec.derivedFrom),
        provenance: JSON.stringify(rec.provenance),
        metadata: JSON.stringify(rec.metadata),
        created_at: rec.createdAt,
        updated_at: rec.updatedAt,
      });
      chunks.forEach((c, ordinal) => {
        const info = insChunk.run(rec.id, ordinal, c.text);
        const seq = toBigInt(info.lastInsertRowid);
        insVec.run(seq, vecToBytes(c.vec));
        insFts.run(seq, c.text);
      });
    });
    tx();
  }

  // --- flat-file write-through + sync-state bookkeeping --------------------------

  /** Read the sync-state row (file path + hash at last sync) for a record. */
  private syncStateFor(id: string): SyncStateRow | undefined {
    return this.db.prepare('SELECT * FROM sync_state WHERE record_id = ?').get(id) as
      | SyncStateRow
      | undefined;
  }

  private setSyncState(id: string, path: string, hash: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_state(record_id, path, hash, synced_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(record_id) DO UPDATE SET path = excluded.path, hash = excluded.hash,
           synced_at = excluded.synced_at`,
      )
      .run(id, path, hash, Date.now());
  }

  private clearSyncState(id: string): void {
    this.db.prepare('DELETE FROM sync_state WHERE record_id = ?').run(id);
  }

  /**
   * Write a record's markdown file (the durable, authoritative half) after a DB
   * write. Keeps the file path stable across edits: an existing sync-state path
   * wins over the recomputed slug so human-visible filenames never churn.
   */
  private writeThrough(rec: MemoryRecord): void {
    if (this.filesRoot === null) return;
    const relPath = this.syncStateFor(rec.id)?.path ?? recordRelPath(rec);
    const { hash } = writeRecordFile(this.filesRoot, relPath, rec);
    this.setSyncState(rec.id, relPath, hash);
  }

  private removeThrough(id: string): void {
    if (this.filesRoot === null) return;
    const state = this.syncStateFor(id);
    if (state !== undefined) {
      rmSync(join(this.filesRoot, state.path), { force: true });
      this.clearSyncState(id);
    }
  }

  /**
   * Fill missing `derivedFrom.hash` values from sources present in this store, so
   * summaries carry a verifiable link to the exact source content they were derived
   * from (`glam brain lint` uses it to flag stale summaries).
   */
  private resolveDerivedHashes(derivedFrom: DerivedFrom[]): DerivedFrom[] {
    return derivedFrom.map((d) => {
      if (d.hash !== undefined) return d;
      const source = this.get(d.id);
      return source === null ? d : { ...d, hash: sha256(source.content) };
    });
  }

  private async embedChunks(texts: string[]): Promise<ChunkForWrite[]> {
    const vecs = await this.embedder.embed(texts);
    return texts.map((text, i) => {
      const vec = vecs[i];
      if (vec === undefined) throw new Error('embedder returned fewer vectors than inputs');
      if (vec.length !== this.embedder.dim) {
        throw new Error(
          `embedder "${this.embedder.id}" produced dim ${vec.length}, expected ${this.embedder.dim}`,
        );
      }
      return { text, vec };
    });
  }

  private buildRecord(
    type: RecordType,
    parsed: {
      id?: string | undefined;
      title?: string | undefined;
      content: string;
      scope: Scope;
      truth?: Truth | undefined;
      sharing: Sharing;
      tags: string[];
      derivedFrom: DerivedFrom[];
      provenance: Provenance;
      metadata: Record<string, unknown>;
    },
  ): MemoryRecord {
    const now = Date.now();
    const derivedFrom = this.resolveDerivedHashes(parsed.derivedFrom);
    return {
      id: parsed.id ?? crypto.randomUUID(),
      type,
      title: parsed.title ?? null,
      content: parsed.content,
      scope: parsed.scope,
      truth: parsed.truth ?? (derivedFrom.length > 0 ? 'summary' : 'source'),
      sharing: parsed.sharing,
      tags: parsed.tags,
      derivedFrom,
      provenance: parsed.provenance,
      metadata: parsed.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Add a single durable fact. */
  async addFact(input: FactInput): Promise<MemoryRecord> {
    const p = FactInputSchema.parse(input);
    const rec = this.buildRecord('fact', p);
    const chunks = await this.embedChunks([rec.content]);
    this.writeRecord(rec, chunks);
    this.writeThrough(rec);
    return rec;
  }

  /** Ingest a document: chunked, each chunk embedded and retrievable, attributed to the parent. */
  async addDocument(input: DocumentInput): Promise<MemoryRecord> {
    const p = DocumentInputSchema.parse(input);
    // Persist non-default chunking in metadata so a rebuild from markdown re-chunks
    // the same way (the flat-file tree stores content, not chunk boundaries).
    const metadata =
      p.chunking !== undefined ? { ...p.metadata, chunking: p.chunking } : p.metadata;
    const rec = this.buildRecord('document', { ...p, metadata });
    const texts = chunkText(rec.content, chunkOptionsFor(rec));
    if (texts.length === 0) throw new Error('document produced no chunks');
    const chunks = await this.embedChunks(texts);
    this.writeRecord(rec, chunks);
    this.writeThrough(rec);
    return rec;
  }

  /** Log an interaction/run as an episode, reusable as few-shot context. */
  async addEpisode(input: EpisodeInput): Promise<MemoryRecord> {
    const p = EpisodeInputSchema.parse(input);
    const rec = this.buildRecord('episode', p);
    const chunks = await this.embedChunks([rec.content]);
    this.writeRecord(rec, chunks);
    this.writeThrough(rec);
    return rec;
  }

  /** Store a pointer to an external resource (URL/ticket/dashboard). */
  async addPointer(input: PointerInput): Promise<MemoryRecord> {
    const p = PointerInputSchema.parse(input);
    const content = p.content ?? p.target;
    const metadata = { ...p.metadata, target: p.target };
    const provenance: Provenance =
      p.provenance.uri === undefined ? { ...p.provenance, uri: p.target } : p.provenance;
    const rec = this.buildRecord('pointer', { ...p, content, provenance, metadata });
    const chunks = await this.embedChunks([rec.content]);
    this.writeRecord(rec, chunks);
    this.writeThrough(rec);
    return rec;
  }

  /**
   * The generic writer for external sources (migration imports, Claude Code
   * adoption, team pulls): upsert one complete record — id, provenance, and
   * timestamps preserved exactly — replacing any existing version, re-chunking and
   * re-embedding its content, and writing through to the markdown tree.
   */
  async upsert(record: MemoryRecord): Promise<MemoryRecord> {
    const rec = normalizeRecord(record);
    ProvenanceSchema.parse(rec.provenance);
    await this.reindexRecord(rec);
    this.writeThrough(rec);
    return rec;
  }

  /** (Re)index one complete record: replace any existing row, re-chunk, re-embed. */
  private async reindexRecord(rec: MemoryRecord): Promise<void> {
    const texts =
      rec.type === 'document' ? chunkText(rec.content, chunkOptionsFor(rec)) : [rec.content];
    if (texts.length === 0) throw new Error('record produced no chunks');
    const chunks = await this.embedChunks(texts);
    const tx = this.db.transaction(() => {
      if (this.get(rec.id) !== null) {
        this.deleteChunks(rec.id);
        this.db.prepare('DELETE FROM records WHERE id = ?').run(rec.id);
      }
    });
    tx();
    this.writeRecord(rec, chunks);
  }

  /** Fetch a record by id. */
  get(id: string): MemoryRecord | null {
    const row = this.db.prepare('SELECT * FROM records WHERE id = ?').get(id) as
      | RecordRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  /** List records, optionally filtered by type/scope. */
  list(filter: ListFilter = {}): MemoryRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.type) {
      clauses.push('type = ?');
      params.push(filter.type);
    }
    if (filter.scope) {
      clauses.push('scope = ?');
      params.push(filter.scope);
    }
    if (filter.truth) {
      clauses.push('truth = ?');
      params.push(filter.truth);
    }
    if (filter.sharing) {
      clauses.push('sharing = ?');
      params.push(filter.sharing);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM records ${where} ORDER BY created_at ASC ${limit}`)
      .all(...params) as RecordRow[];
    return rows.map(rowToRecord);
  }

  /** Count records (optionally by type). */
  count(type?: RecordType): number {
    if (type) {
      return (
        this.db.prepare('SELECT COUNT(*) AS n FROM records WHERE type = ?').get(type) as {
          n: number;
        }
      ).n;
    }
    return (this.db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n;
  }

  private deleteChunks(recordId: string): void {
    const seqs = this.db.prepare('SELECT seq FROM chunks WHERE record_id = ?').all(recordId) as {
      seq: number;
    }[];
    const delVec = this.db.prepare('DELETE FROM vec_chunks WHERE rowid = ?');
    const delFts = this.db.prepare('DELETE FROM fts_chunks WHERE rowid = ?');
    for (const { seq } of seqs) {
      delVec.run(toBigInt(seq));
      delFts.run(toBigInt(seq));
    }
    this.db.prepare('DELETE FROM chunks WHERE record_id = ?').run(recordId);
  }

  /** Delete a record and all of its chunks/vectors (and its markdown file). */
  delete(id: string): boolean {
    const tx = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM records WHERE id = ?').get(id);
      if (existing === undefined) return false;
      this.deleteChunks(id);
      this.db.prepare('DELETE FROM records WHERE id = ?').run(id);
      return true;
    });
    const removed = tx() as boolean;
    if (removed) this.removeThrough(id);
    return removed;
  }

  /** Update a record. Changing `content` re-chunks and re-embeds. */
  async update(id: string, patch: UpdatePatch): Promise<MemoryRecord> {
    const p = UpdatePatchSchema.parse(patch);
    const current = this.get(id);
    if (current === null) throw new Error(`no record with id "${id}"`);
    if (p.provenance) ProvenanceSchema.parse(p.provenance);
    const next: MemoryRecord = {
      ...current,
      title: p.title !== undefined ? p.title : current.title,
      content: p.content ?? current.content,
      scope: p.scope ?? current.scope,
      truth: p.truth ?? current.truth,
      sharing: p.sharing ?? current.sharing,
      tags: p.tags ?? current.tags,
      derivedFrom:
        p.derivedFrom !== undefined
          ? this.resolveDerivedHashes(p.derivedFrom)
          : current.derivedFrom,
      provenance: p.provenance ?? current.provenance,
      metadata: p.metadata ?? current.metadata,
      updatedAt: Date.now(),
    };
    const contentChanged = p.content !== undefined && p.content !== current.content;

    // Re-embed outside the transaction (async), then swap atomically.
    let chunks: ChunkForWrite[] | null = null;
    if (contentChanged) {
      const texts =
        next.type === 'document' ? chunkText(next.content, chunkOptionsFor(next)) : [next.content];
      chunks = await this.embedChunks(texts);
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE records SET title=@title, content=@content, scope=@scope, truth=@truth,
             sharing=@sharing, tags=@tags, derived_from=@derived_from,
             provenance=@provenance, metadata=@metadata, updated_at=@updated_at WHERE id=@id`,
        )
        .run({
          id: next.id,
          title: next.title,
          content: next.content,
          scope: next.scope,
          truth: next.truth,
          sharing: next.sharing,
          tags: JSON.stringify(next.tags),
          derived_from: JSON.stringify(next.derivedFrom),
          provenance: JSON.stringify(next.provenance),
          metadata: JSON.stringify(next.metadata),
          updated_at: next.updatedAt,
        });
      if (chunks !== null) {
        this.deleteChunks(next.id);
        const insChunk = this.db.prepare(
          'INSERT INTO chunks(record_id, ordinal, text) VALUES (?, ?, ?)',
        );
        const insVec = this.db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (?, ?)');
        const insFts = this.db.prepare('INSERT INTO fts_chunks(rowid, text) VALUES (?, ?)');
        chunks.forEach((c, ordinal) => {
          const info = insChunk.run(next.id, ordinal, c.text);
          const seq = toBigInt(info.lastInsertRowid);
          insVec.run(seq, vecToBytes(c.vec));
          insFts.run(seq, c.text);
        });
      }
    });
    tx();
    this.writeThrough(next);
    return next;
  }

  /**
   * Hybrid retrieval: vector similarity + keyword (FTS5/BM25) + recency + provenance,
   * re-ranked into a single score, then packed to a token budget with full attribution.
   */
  async query(text: string, opts: QueryOptions = {}): Promise<QueryResult> {
    const w: HybridWeights = {
      ...this.weights,
      ...opts.weights,
      typeTrust: { ...this.weights.typeTrust, ...opts.weights?.typeTrust },
      sourceTrust: { ...this.weights.sourceTrust, ...opts.weights?.sourceTrust },
    };
    const limit = opts.limit ?? 10;
    const tokenBudget = opts.tokenBudget ?? 2048;
    const scopes =
      opts.scope === undefined ? null : Array.isArray(opts.scope) ? opts.scope : [opts.scope];

    const qvecs = await this.embedder.embed([text]);
    const qvec = qvecs[0];
    if (qvec === undefined) throw new Error('failed to embed query');

    // Vector arm.
    const vrows = this.db
      .prepare(
        'SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? AND k = ? ORDER BY distance',
      )
      .all(vecToBytes(qvec), w.candidatePool) as { rowid: number; distance: number }[];

    // Keyword arm.
    const ftsQuery = buildFtsQuery(text);
    const krows: { rowid: number; score: number }[] = ftsQuery
      ? (this.db
          .prepare(
            'SELECT rowid, bm25(fts_chunks) AS score FROM fts_chunks WHERE fts_chunks MATCH ? ORDER BY score LIMIT ?',
          )
          .all(ftsQuery, w.candidatePool) as { rowid: number; score: number }[])
      : [];

    // Normalize keyword scores (BM25: lower is better → flip and min-max to [0,1]).
    const kwNorm = new Map<number, number>();
    if (krows.length > 0) {
      const rel = krows.map((r) => -r.score);
      const min = Math.min(...rel);
      const max = Math.max(...rel);
      const span = max - min;
      krows.forEach((r, i) => {
        kwNorm.set(r.rowid, span > 0 ? ((rel[i] ?? min) - min) / span : 1);
      });
    }

    const vecSim = new Map<number, number>();
    for (const r of vrows) {
      // Unit vectors → L2 distance d relates to cosine sim s by d^2 = 2(1-s).
      const sim = 1 - (r.distance * r.distance) / 2;
      vecSim.set(r.rowid, Math.min(1, Math.max(0, sim)));
    }

    const candidateSeqs = new Set<number>([...vecSim.keys(), ...kwNorm.keys()]);
    if (candidateSeqs.size === 0) {
      return { query: text, results: [], packed: [], context: '', usedTokens: 0, tokenBudget };
    }

    const placeholders = Array.from(candidateSeqs, () => '?').join(',');
    const joined = this.db
      .prepare(
        `SELECT c.seq AS seq, c.ordinal AS ordinal, c.text AS text,
                r.id AS id, r.type AS type, r.title AS title, r.scope AS scope,
                r.provenance AS provenance, r.updated_at AS updated_at
         FROM chunks c JOIN records r ON r.id = c.record_id
         WHERE c.seq IN (${placeholders})`,
      )
      .all(...Array.from(candidateSeqs)) as {
      seq: number;
      ordinal: number;
      text: string;
      id: string;
      type: RecordType;
      title: string | null;
      scope: Scope;
      provenance: string;
      updated_at: number;
    }[];

    const now = Date.now();
    const halfLifeMs = w.recencyHalfLifeDays * 86_400_000;
    const scored: ScoredChunk[] = [];
    for (const row of joined) {
      if (scopes !== null && !scopes.includes(row.scope)) continue;
      const provenance = JSON.parse(row.provenance) as Provenance;
      const vector = vecSim.get(row.seq) ?? 0;
      const keyword = kwNorm.get(row.seq) ?? 0;
      const ageMs = Math.max(0, now - row.updated_at);
      const recency = 0.5 ** (ageMs / halfLifeMs);
      const sourceTrust = w.sourceTrust[provenance.source] ?? 1;
      const provenanceScore = Math.min(1, Math.max(0, w.typeTrust[row.type] * sourceTrust));
      const score =
        w.vector * vector +
        w.keyword * keyword +
        w.recency * recency +
        w.provenance * provenanceScore;
      scored.push({
        recordId: row.id,
        type: row.type,
        chunkOrdinal: row.ordinal,
        text: row.text,
        title: row.title,
        scope: row.scope,
        provenance,
        score,
        components: { vector, keyword, recency, provenance: provenanceScore },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    // Token-budget-aware packing, highest-ranked first.
    const packed: ScoredChunk[] = [];
    let usedTokens = 0;
    for (const hit of results) {
      const entry = formatEntry(packed.length + 1, hit);
      const tokens = estimateTokens(entry);
      if (usedTokens + tokens > tokenBudget) break;
      packed.push(hit);
      usedTokens += tokens;
    }
    const context = packed.map((hit, i) => formatEntry(i + 1, hit)).join('\n\n');

    return { query: text, results, packed, context, usedTokens, tokenBudget };
  }

  /** Serialize the entire store to JSONL (header line + one line per record). */
  export(): string {
    const records = this.list();
    const getChunks = this.db.prepare(
      'SELECT seq, ordinal, text FROM chunks WHERE record_id = ? ORDER BY ordinal ASC',
    );
    const getVec = this.db.prepare('SELECT embedding FROM vec_chunks WHERE rowid = ?');
    let chunkCount = 0;
    const lines: string[] = [];
    const body: string[] = [];
    for (const rec of records) {
      const chunkRows = getChunks.all(rec.id) as { seq: number; ordinal: number; text: string }[];
      const exportedChunks = chunkRows.map((c) => {
        const vecRow = getVec.get(toBigInt(c.seq)) as { embedding: Buffer } | undefined;
        if (vecRow === undefined) throw new Error(`missing vector for chunk seq ${c.seq}`);
        const buf = vecRow.embedding;
        const vec = new Float32Array(
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        );
        chunkCount += 1;
        return { ordinal: c.ordinal, text: c.text, embedding: encodeVector(vec) };
      });
      const exported: ExportedRecord = { record: rec, chunks: exportedChunks };
      body.push(JSON.stringify(exported));
    }
    const header: ExportHeader = {
      glamfire_brain_export: 1,
      formatVersion: EXPORT_FORMAT_VERSION,
      embedder: { id: this.embedder.id, dim: this.embedder.dim },
      exportedAt: new Date().toISOString(),
      counts: { records: records.length, chunks: chunkCount },
    };
    lines.push(JSON.stringify(header));
    lines.push(...body);
    return `${lines.join('\n')}\n`;
  }

  /**
   * Import a JSONL export into this store. By default embeddings round-trip exactly; pass
   * `{ regenerate: true }` to re-embed from text with this store's embedder (required when
   * importing across embedder backends). The store should be empty for a clean import.
   */
  async import(jsonl: string, opts: { regenerate?: boolean } = {}): Promise<{ records: number }> {
    const lines = jsonl.split('\n').filter((l) => l.trim().length > 0);
    const headerLine = lines[0];
    if (headerLine === undefined) throw new Error('empty export');
    const header = JSON.parse(headerLine) as ExportHeader;
    if (header.glamfire_brain_export !== 1) throw new Error('not a glamfire brain export');
    if (header.embedder.dim !== this.embedder.dim) {
      throw new Error(
        `export dim ${header.embedder.dim} != store dim ${this.embedder.dim}; cannot import`,
      );
    }
    const regenerate = opts.regenerate ?? false;
    if (!regenerate && header.embedder.id !== this.embedder.id) {
      throw new Error(
        `export embedder "${header.embedder.id}" != store embedder "${this.embedder.id}"; import with { regenerate: true } to switch backends`,
      );
    }

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const parsed = JSON.parse(line) as ExportedRecord;
      // Old exports predate truth/sharing/tags/derived_from: normalize with safe
      // defaults so the JSONL round-trip invariant holds across format generations.
      const rec = normalizeRecord(parsed.record);
      let chunks: ChunkForWrite[];
      if (regenerate) {
        chunks = await this.embedChunks(parsed.chunks.map((c) => c.text));
      } else {
        chunks = parsed.chunks.map((c) => {
          const vec = decodeVector(c.embedding);
          if (vec.length !== this.embedder.dim) {
            throw new Error(`imported vector dim ${vec.length} != store dim ${this.embedder.dim}`);
          }
          return { text: c.text, vec };
        });
      }
      this.writeRecord(rec, chunks);
      this.writeThrough(rec);
      imported += 1;
    }
    return { records: imported };
  }

  /** Read the raw stored embedding for a record's chunk (for verification/inspection). */
  embeddingFor(recordId: string, ordinal = 0): Float32Array | null {
    const row = this.db
      .prepare('SELECT seq FROM chunks WHERE record_id = ? AND ordinal = ?')
      .get(recordId, ordinal) as { seq: number } | undefined;
    if (row === undefined) return null;
    const vecRow = this.db
      .prepare('SELECT embedding FROM vec_chunks WHERE rowid = ?')
      .get(toBigInt(row.seq)) as { embedding: Buffer } | undefined;
    if (vecRow === undefined) return null;
    const buf = vecRow.embedding;
    return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }

  // --- flat-file sync + rebuild (research/31: markdown is the brain) -------------

  /**
   * Reconcile the markdown tree with the SQLite index (`glam brain sync`).
   *
   * Semantics (research/31 §5): content hashes, never mtimes, drive change
   * detection. Files win for `truth: source` records; newest wins only for
   * regenerable `truth: summary` records. Conflicts are surfaced — the losing
   * version is preserved next to the file as `*.conflict.md` and logged — never
   * silently merged. DB-resident records with no file yet are exported (the
   * migration path); plain markdown dropped into the tree is adopted as records.
   * Regenerates INDEX.md and appends to log.md.
   */
  async syncFiles(): Promise<SyncReport> {
    const root = this.filesRoot;
    if (root === null) {
      throw new Error('this brain is not file-backed; open it with { filesRoot } to sync');
    }
    ensureTree(root);
    const report: SyncReport = {
      exported: 0,
      imported: 0,
      updatedFromFiles: 0,
      updatedFromDb: 0,
      tombstoned: 0,
      errors: [],
      conflicts: [],
      records: 0,
    };
    const events: string[] = [];
    const seen = new Set<string>();

    for (const f of scanTree(root)) {
      let parsed: ReturnType<typeof parseRecordFile>;
      try {
        parsed = parseRecordFile(f.text, f.relPath);
      } catch (err) {
        if (err instanceof FileFormatError) {
          report.errors.push({ path: f.relPath, message: err.message });
          events.push(`error ${err.message}`);
          continue;
        }
        throw err;
      }

      // Plain markdown without frontmatter: adopt it as a record (the generic
      // external-writer path — humans, scripts, or another agent's memory export).
      if (parsed.kind === 'adopt') {
        const d = adoptionDefaults(f.dir);
        const mtime = Math.round(statSync(join(root, f.relPath)).mtimeMs);
        const rec: MemoryRecord = {
          id: crypto.randomUUID(),
          type: d.type,
          title: parsed.title,
          content: parsed.content,
          scope: 'private',
          truth: d.truth,
          sharing: 'personal',
          tags: [],
          derivedFrom: [],
          provenance: { source: `file:${f.relPath.replace(/\\/g, '/')}` },
          metadata: {},
          createdAt: mtime,
          updatedAt: mtime,
        };
        await this.reindexRecord(rec);
        const { hash } = writeRecordFile(root, f.relPath, rec);
        this.setSyncState(rec.id, f.relPath, hash);
        seen.add(rec.id);
        report.imported += 1;
        events.push(`adopt ${f.relPath} id=${rec.id}`);
        continue;
      }

      const fileRec = parsed.record;
      const state = this.syncStateFor(fileRec.id);
      // Duplicate id (two live files claiming the same record): surfaced, skipped.
      if (state !== undefined && state.path !== f.relPath && existsSync(join(root, state.path))) {
        const message = `${f.relPath}: duplicate id ${fileRec.id} (already at ${state.path})`;
        report.errors.push({ path: f.relPath, message });
        events.push(`error ${message}`);
        continue;
      }
      seen.add(fileRec.id);
      const dbRec = this.get(fileRec.id);
      const fileHash = sha256(f.text);

      if (dbRec === null) {
        // New file (or a record the index lost): the markdown is authoritative.
        await this.reindexRecord(fileRec);
        const { hash } = writeRecordFile(root, f.relPath, fileRec);
        this.setSyncState(fileRec.id, f.relPath, hash);
        report.imported += 1;
        events.push(`import ${f.relPath} id=${fileRec.id}`);
        continue;
      }

      const dbHash = sha256(serializeRecordFile(dbRec));
      const base = state?.hash;
      const fileChanged = base === undefined ? fileHash !== dbHash : fileHash !== base;
      const dbChanged = base === undefined ? fileHash !== dbHash : dbHash !== base;

      if (!fileChanged && !dbChanged) {
        if (state === undefined || state.path !== f.relPath) {
          this.setSyncState(fileRec.id, f.relPath, fileHash);
        }
        continue;
      }
      if (fileChanged && !dbChanged) {
        // File edited, index untouched since last sync → file wins.
        const next: MemoryRecord = { ...fileRec, updatedAt: Date.now() };
        await this.reindexRecord(next);
        const { hash } = writeRecordFile(root, f.relPath, next);
        this.setSyncState(next.id, f.relPath, hash);
        report.updatedFromFiles += 1;
        events.push(`update-from-file ${f.relPath} id=${next.id}`);
        continue;
      }
      if (dbChanged && !fileChanged) {
        // Index written without write-through (e.g. a non-file-backed writer):
        // catch the file up.
        const { hash } = writeRecordFile(root, f.relPath, dbRec);
        this.setSyncState(dbRec.id, f.relPath, hash);
        report.updatedFromDb += 1;
        events.push(`update-from-db ${f.relPath} id=${dbRec.id}`);
        continue;
      }

      // Both sides changed → conflict. Never silently merged.
      const conflictPath = f.relPath.replace(/\.md$/, '.conflict.md');
      const fileMtime = Math.round(statSync(join(root, f.relPath)).mtimeMs);
      const fileWins =
        fileRec.truth === 'source' || dbRec.truth === 'source'
          ? true // human-edited source files are never overwritten
          : fileMtime >= dbRec.updatedAt; // summaries are regenerable: newest wins
      if (fileWins) {
        writeRecordFile(root, conflictPath, dbRec);
        await this.reindexRecord(fileRec);
        const { hash } = writeRecordFile(root, f.relPath, fileRec);
        this.setSyncState(fileRec.id, f.relPath, hash);
      } else {
        writeFileSync(join(root, conflictPath), f.text);
        const { hash } = writeRecordFile(root, f.relPath, dbRec);
        this.setSyncState(dbRec.id, f.relPath, hash);
      }
      const conflict: SyncConflict = {
        id: fileRec.id,
        path: f.relPath,
        truth: fileRec.truth,
        resolution: fileWins ? 'file-wins' : 'db-wins',
        conflictPath,
      };
      report.conflicts.push(conflict);
      events.push(
        `conflict ${f.relPath} id=${fileRec.id} resolved=${conflict.resolution} loser=${conflictPath}`,
      );
    }

    // DB records with no file: tombstone if the file was deleted, export if the
    // record predates the flat-file tree (first-sync migration, requirement of
    // research/31 — this is also the path external SQLite-resident data rides).
    for (const rec of this.list()) {
      if (seen.has(rec.id)) continue;
      const state = this.syncStateFor(rec.id);
      if (state !== undefined) {
        this.delete(rec.id); // also clears sync state; file is already gone
        report.tombstoned += 1;
        events.push(`tombstone id=${rec.id} (${state.path} deleted)`);
      } else {
        this.writeThrough(rec);
        report.exported += 1;
        const path = this.syncStateFor(rec.id)?.path ?? recordRelPath(rec);
        events.push(`export ${path} id=${rec.id}`);
      }
    }

    report.records = this.regenerateIndex(root);
    events.push(
      `sync exported=${report.exported} imported=${report.imported} ` +
        `updated-from-files=${report.updatedFromFiles} updated-from-db=${report.updatedFromDb} ` +
        `tombstoned=${report.tombstoned} conflicts=${report.conflicts.length} ` +
        `errors=${report.errors.length} records=${report.records}`,
    );
    appendLog(root, events);
    return report;
  }

  /** Regenerate INDEX.md from the index; returns the record count. */
  private regenerateIndex(root: string): number {
    const entries: IndexEntry[] = this.list().map((rec) => ({
      record: rec,
      relPath: this.syncStateFor(rec.id)?.path ?? recordRelPath(rec),
    }));
    writeIndex(root, entries);
    return entries.length;
  }

  /**
   * THE flat-file invariant (research/31, tested in test/rebuild.test.ts and the
   * smoke test): delete the SQLite file and reconstruct the entire index —
   * records, chunks, vectors, FTS — losslessly from the markdown tree. The
   * database is a disposable index; the markdown is the brain.
   */
  static async rebuildFromFiles(
    root: string,
    dbPath: string,
    opts: BrainOptions = {},
  ): Promise<{ brain: Brain; report: SyncReport }> {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
    mkdirSync(dirname(dbPath), { recursive: true });
    const brain = Brain.open(dbPath, { ...opts, filesRoot: root });
    const report = await brain.syncFiles();
    return { brain, report };
  }

  /** Close the underlying database. */
  close(): void {
    this.db.close();
  }
}

function formatEntry(index: number, hit: ScoredChunk): string {
  const parts: string[] = [hit.type];
  if (hit.title) parts.push(hit.title);
  parts.push(`source: ${hit.provenance.source}`);
  if (hit.provenance.uri) parts.push(hit.provenance.uri);
  return `[${index}] (${parts.join(' · ')})\n${hit.text}`;
}
