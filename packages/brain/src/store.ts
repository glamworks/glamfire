// The owned context store (SPEC §5.2): embedded SQLite + sqlite-vec, a single portable
// file, zero external services on Mac/Windows/Linux. Four first-class record types with
// provenance, hybrid retrieval (vector + keyword + recency + provenance), and a tested
// export/import ownership invariant. No remote dependency is required to read your context.
import Database from 'better-sqlite3';
import { load as loadVec } from 'sqlite-vec';
import { chunkText, estimateTokens } from './chunk.js';
import { type Embedder, HashEmbedder } from './embedder.js';
import {
  EXPORT_FORMAT_VERSION,
  type ExportHeader,
  type ExportedRecord,
  decodeVector,
  encodeVector,
} from './serialize.js';
import {
  ChunkOptionsSchema,
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
  type UpdatePatch,
  UpdatePatchSchema,
} from './types.js';

const SCHEMA_VERSION = 1;

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
  provenance: string;
  metadata: string;
  created_at: number;
  updated_at: number;
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
    provenance: JSON.parse(row.provenance) as Provenance,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class Brain {
  private readonly db: Database.Database;
  readonly embedder: Embedder;
  readonly weights: HybridWeights;

  private constructor(db: Database.Database, embedder: Embedder, weights: HybridWeights) {
    this.db = db;
    this.embedder = embedder;
    this.weights = weights;
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
    return new Brain(db, embedder, weights);
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
    `);
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
      setMeta.run('schema_version', String(SCHEMA_VERSION));
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
      `INSERT INTO records(id, type, title, content, scope, provenance, metadata, created_at, updated_at)
       VALUES (@id, @type, @title, @content, @scope, @provenance, @metadata, @created_at, @updated_at)`,
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
      provenance: Provenance;
      metadata: Record<string, unknown>;
    },
  ): MemoryRecord {
    const now = Date.now();
    return {
      id: parsed.id ?? crypto.randomUUID(),
      type,
      title: parsed.title ?? null,
      content: parsed.content,
      scope: parsed.scope,
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
    return rec;
  }

  /** Ingest a document: chunked, each chunk embedded and retrievable, attributed to the parent. */
  async addDocument(input: DocumentInput): Promise<MemoryRecord> {
    const p = DocumentInputSchema.parse(input);
    const rec = this.buildRecord('document', p);
    const chunkOpts = ChunkOptionsSchema.parse(p.chunking ?? {});
    const texts = chunkText(rec.content, chunkOpts);
    if (texts.length === 0) throw new Error('document produced no chunks');
    const chunks = await this.embedChunks(texts);
    this.writeRecord(rec, chunks);
    return rec;
  }

  /** Log an interaction/run as an episode, reusable as few-shot context. */
  async addEpisode(input: EpisodeInput): Promise<MemoryRecord> {
    const p = EpisodeInputSchema.parse(input);
    const rec = this.buildRecord('episode', p);
    const chunks = await this.embedChunks([rec.content]);
    this.writeRecord(rec, chunks);
    return rec;
  }

  /** Store a pointer to an external resource (URL/ticket/dashboard). */
  async addPointer(input: PointerInput): Promise<MemoryRecord> {
    const p = PointerInputSchema.parse(input);
    const content = p.content ?? p.target;
    const metadata = { ...p.metadata, target: p.target };
    const provenance: Provenance =
      p.provenance.uri === undefined ? { ...p.provenance, uri: p.target } : p.provenance;
    const rec = this.buildRecord('pointer', {
      id: p.id,
      title: p.title,
      content,
      scope: p.scope,
      provenance,
      metadata,
    });
    const chunks = await this.embedChunks([rec.content]);
    this.writeRecord(rec, chunks);
    return rec;
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

  /** Delete a record and all of its chunks/vectors. Returns true if a record was removed. */
  delete(id: string): boolean {
    const tx = this.db.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM records WHERE id = ?').get(id);
      if (existing === undefined) return false;
      this.deleteChunks(id);
      this.db.prepare('DELETE FROM records WHERE id = ?').run(id);
      return true;
    });
    return tx() as boolean;
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
      provenance: p.provenance ?? current.provenance,
      metadata: p.metadata ?? current.metadata,
      updatedAt: Date.now(),
    };
    const contentChanged = p.content !== undefined && p.content !== current.content;

    // Re-embed outside the transaction (async), then swap atomically.
    let chunks: ChunkForWrite[] | null = null;
    if (contentChanged) {
      const texts =
        next.type === 'document'
          ? chunkText(next.content, ChunkOptionsSchema.parse({}))
          : [next.content];
      chunks = await this.embedChunks(texts);
    }
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE records SET title=@title, content=@content, scope=@scope,
             provenance=@provenance, metadata=@metadata, updated_at=@updated_at WHERE id=@id`,
        )
        .run({
          id: next.id,
          title: next.title,
          content: next.content,
          scope: next.scope,
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
      const rec = parsed.record;
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
