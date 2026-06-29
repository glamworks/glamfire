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
  provenance: Provenance;
  metadata: Record<string, unknown>;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

const baseInput = {
  id: z.string().min(1).optional(),
  title: z.string().optional(),
  scope: ScopeSchema.default('private'),
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
    provenance: ProvenanceSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type UpdatePatch = z.infer<typeof UpdatePatchSchema>;

/** Filter for listing records. */
export interface ListFilter {
  type?: RecordType;
  scope?: Scope;
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
