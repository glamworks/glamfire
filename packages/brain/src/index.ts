// @glamfire/brain — the open brain (SPEC §5.2): local-first, portable, owned context.
//
//   import { Brain } from '@glamfire/brain';
//   const brain = Brain.open('./team.brain');
//   await brain.addFact({ content: '...', provenance: { source: '...' } });
//   const hits = await brain.query('what did we decide about X?');
//   const portable = brain.export();   // JSONL — your brain, rip-out-able
//
// The default embedder is fully offline and deterministic. For dense transformer recall,
// `pnpm add fastembed` and pass `await createFastEmbedEmbedder()` as the embedder.
export { Brain, DEFAULT_WEIGHTS } from './store.js';
export type { BrainOptions, QueryOptions, HybridWeights } from './store.js';
export { HashEmbedder } from './embedder.js';
export type { Embedder, HashEmbedderOptions } from './embedder.js';
export { createFastEmbedEmbedder } from './embedder-fastembed.js';
export type { FastEmbedOptions } from './embedder-fastembed.js';
export { chunkText, estimateTokens } from './chunk.js';
export {
  encodeVector,
  decodeVector,
  EXPORT_FORMAT_VERSION,
} from './serialize.js';
export type { ExportHeader, ExportedRecord, ExportedChunk } from './serialize.js';
export {
  ScopeSchema,
  RecordTypeSchema,
  ProvenanceSchema,
  FactInputSchema,
  DocumentInputSchema,
  EpisodeInputSchema,
  PointerInputSchema,
  ChunkOptionsSchema,
  UpdatePatchSchema,
} from './types.js';
export type {
  Scope,
  RecordType,
  Provenance,
  MemoryRecord,
  FactInput,
  DocumentInput,
  EpisodeInput,
  PointerInput,
  UpdatePatch,
  ListFilter,
  ScoredChunk,
  QueryResult,
  ChunkOptions,
} from './types.js';
