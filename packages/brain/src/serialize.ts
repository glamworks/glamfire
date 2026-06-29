// The portable export/import format (SPEC §5.2 ownership invariant).
//
// The store serializes to JSONL: a header line followed by one line per record. Every
// field a human cares about — content, title, scope, provenance, metadata, timestamps —
// is plain readable JSON. Chunk embeddings travel as base64-encoded float32 bytes so the
// round-trip is bit-exact; they are an optimization, never a lock-in: any importer can
// drop them and regenerate from `text` with the named embedder. The format is documented,
// versioned, and model-neutral. Portability is a tested invariant, not a flag.
import type { MemoryRecord } from './types.js';

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportHeader {
  glamfire_brain_export: number;
  formatVersion: number;
  embedder: { id: string; dim: number };
  exportedAt: string;
  counts: { records: number; chunks: number };
}

export interface ExportedChunk {
  ordinal: number;
  text: string;
  /** base64 of the float32 little-endian embedding bytes (length dim*4). */
  embedding: string;
}

export interface ExportedRecord {
  record: MemoryRecord;
  chunks: ExportedChunk[];
}

/** Encode a vector to base64 (little-endian float32 bytes). */
export function encodeVector(vec: Float32Array): string {
  const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
  return Buffer.from(bytes).toString('base64');
}

/** Decode a base64 float32 vector back to a Float32Array. */
export function decodeVector(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  // Copy into an aligned buffer so the Float32Array view is always valid.
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}
