// Text chunking + token estimation for ingestion and budget-aware packing.
import type { ChunkOptions } from './types.js';

/**
 * Rough token estimate (~4 chars/token). Deliberately provider-neutral: the budget is a
 * portable approximation, not a model-specific tokenizer, so the store stays model-agnostic.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Split text into overlapping chunks bounded by `maxChars`. Splits on paragraph then
 * sentence boundaries where possible; falls back to hard slicing for very long runs.
 * Short text returns a single chunk. Overlap preserves cross-boundary context.
 */
export function chunkText(text: string, opts: ChunkOptions): string[] {
  const maxChars = opts.maxChars;
  const overlap = Math.min(opts.overlapChars, Math.max(0, maxChars - 1));
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  // Segment into paragraphs, then sentences, so we cut on natural boundaries.
  const segments: string[] = [];
  for (const para of trimmed.split(/\n{2,}/)) {
    const p = para.trim();
    if (p.length === 0) continue;
    if (p.length <= maxChars) {
      segments.push(p);
      continue;
    }
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      const s = sentence.trim();
      if (s.length === 0) continue;
      if (s.length <= maxChars) {
        segments.push(s);
      } else {
        // Hard-slice an over-long sentence.
        for (let i = 0; i < s.length; i += maxChars) segments.push(s.slice(i, i + maxChars));
      }
    }
  }

  // Greedily pack segments into chunks up to maxChars, with character overlap between chunks.
  const chunks: string[] = [];
  let current = '';
  for (const seg of segments) {
    const candidate = current.length === 0 ? seg : `${current}\n\n${seg}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current.length > 0) chunks.push(current);
      if (seg.length <= maxChars) {
        const tail = current.length > overlap ? current.slice(current.length - overlap) : current;
        current = overlap > 0 && current.length > 0 ? `${tail}\n\n${seg}` : seg;
        if (current.length > maxChars) current = seg;
      } else {
        for (let i = 0; i < seg.length; i += maxChars) chunks.push(seg.slice(i, i + maxChars));
        current = '';
      }
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
