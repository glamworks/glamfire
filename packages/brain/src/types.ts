// Record model and validation for @glamfire/brain (SPEC §5.2).
// Four first-class, queryable record types — each carries provenance and a scope.
// All inputs are validated with zod so bad data never reaches the store.
import { z } from 'zod';

/** Visibility / sharing scope for a record. Nothing is ever uploaded regardless. */
export const ScopeSchema = z.enum(['private', 'project', 'team']);
export type Scope = z.infer<typeof ScopeSchema>;

/** The four first-class record types. */
export const RecordTypeSchema = z.enum(['fact', 'document', 'episode', 'pointer']);
export type RecordType = z.infer<typeof RecordTypeSchema>;

/**
 * Source-vs-summary, first-class (research/31). `source` records are ground truth
 * (ingested docs, observed facts, raw episodes); `summary` records are regenerable
 * syntheses derived from sources and live in `notes/` in the flat-file tree.
 */
export const TruthSchema = z.enum(['source', 'summary']);
export type Truth = z.infer<typeof TruthSchema>;

/**
 * Personal/team sharing classification (research/30 §5.1). `personal` records never
 * leave the machine; `team` records are candidates for the git-shared team tree.
 * Default is always `personal` — nothing is team-shared unless said so explicitly.
 */
export const SharingSchema = z.enum(['personal', 'team']);
export type Sharing = z.infer<typeof SharingSchema>;

/**
 * A span link from a summary back to the source records it was derived from.
 * `hash` is the sha256 (hex) of the source record's content at derivation time so
 * `glam brain lint` can detect stale summaries; the writer fills it automatically
 * when the source is present in the store.
 */
export const DerivedFromSchema = z
  .object({
    id: z.string().min(1, 'derived_from.id is required'),
    /** Optional span within the source, e.g. "chunk:3" or "L10-L42". */
    span: z.string().optional(),
    /** sha256 hex of the source record's content at derivation time. */
    hash: z.string().optional(),
  })
  .strict();
export type DerivedFrom = z.infer<typeof DerivedFromSchema>;

/**
 * Where a record came from. `source` is required: every record is attributable.
 * Retrieval always returns provenance so a human can trust (or distrust) a result.
 */
export const ProvenanceSchema = z
  .object({
    source: z.string().min(1, 'provenance.source is required'),
    uri: z.string().optional(),
    author: z.string().optional(),
    timestamp: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** A stored record, normalized across all four types. `content` is the searchable text. */
export interface MemoryRecord {
  id: string;
  type: RecordType;
  title: string | null;
  content: string;
  scope: Scope;
  truth: Truth;
  sharing: Sharing;
  tags: string[];
  derivedFrom: DerivedFrom[];
  provenance: Provenance;
  metadata: Record<string, unknown>;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

const baseInput = {
  id: z.string().min(1).optional(),
  title: z.string().optional(),
  scope: ScopeSchema.default('private'),
  /** Defaults to `summary` when `derivedFrom` is given, else `source`. */
  truth: TruthSchema.optional(),
  sharing: SharingSchema.default('personal'),
  tags: z.array(z.string().min(1)).default([]),
  derivedFrom: z.array(DerivedFromSchema).default([]),
  provenance: ProvenanceSchema,
  metadata: z.record(z.unknown()).default({}),
};

/** Chunking controls for documents (and any long content). */
export const ChunkOptionsSchema = z
  .object({
    maxChars: z.number().int().positive().default(800),
    overlapChars: z.number().int().min(0).default(120),
  })
  .strict();
export type ChunkOptions = z.infer<typeof ChunkOptionsSchema>;

/** A single durable fact (one fact per record). */
export const FactInputSchema = z
  .object({ ...baseInput, content: z.string().min(1, 'fact content is required') })
  .strict();
export type FactInput = z.input<typeof FactInputSchema>;

/** An ingested source document — chunked and embedded for retrieval. */
export const DocumentInputSchema = z
  .object({
    ...baseInput,
    content: z.string().min(1, 'document content is required'),
    chunking: ChunkOptionsSchema.optional(),
  })
  .strict();
export type DocumentInput = z.input<typeof DocumentInputSchema>;

/** A logged interaction/run, reusable as few-shot context. */
export const EpisodeInputSchema = z
  .object({ ...baseInput, content: z.string().min(1, 'episode content is required') })
  .strict();
export type EpisodeInput = z.input<typeof EpisodeInputSchema>;

/** A reference to an external resource (URL, ticket, dashboard). */
export const PointerInputSchema = z
  .object({
    ...baseInput,
    target: z.string().min(1, 'pointer target is required'),
    content: z.string().optional(),
  })
  .strict();
export type PointerInput = z.input<typeof PointerInputSchema>;

/** Patch for an existing record. Changing `content` triggers re-chunk + re-embed. */
export const UpdatePatchSchema = z
  .object({
    title: z.string().nullable().optional(),
    content: z.string().min(1).optional(),
    scope: ScopeSchema.optional(),
    truth: TruthSchema.optional(),
    sharing: SharingSchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    derivedFrom: z.array(DerivedFromSchema).optional(),
    provenance: ProvenanceSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type UpdatePatch = z.infer<typeof UpdatePatchSchema>;

/** Filter for listing records. */
export interface ListFilter {
  type?: RecordType;
  scope?: Scope;
  truth?: Truth;
  sharing?: Sharing;
  limit?: number;
}

/** A scored, attributed retrieval hit (one chunk, traced to its record). */
export interface ScoredChunk {
  recordId: string;
  type: RecordType;
  chunkOrdinal: number;
  text: string;
  title: string | null;
  scope: Scope;
  provenance: Provenance;
  score: number;
  components: {
    vector: number;
    keyword: number;
    recency: number;
    provenance: number;
  };
}

/** The result of a hybrid query: ranked hits plus a token-budgeted, attributed context block. */
export interface QueryResult {
  query: string;
  results: ScoredChunk[];
  packed: ScoredChunk[];
  context: string;
  usedTokens: number;
  tokenBudget: number;
}
