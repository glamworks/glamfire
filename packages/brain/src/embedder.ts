// Embedding backends for the brain.
//
// The store is embedder-agnostic: any `Embedder` plugs in unchanged. The DEFAULT is a
// real, deterministic, fully-offline embedder (`HashEmbedder`) so the brain has *zero*
// remote dependency by default and the export/import round-trip is bit-exact and
// regenerable — the purest expression of the SPEC §5.2 ownership guarantee ("no opaque
// embedding that can't be regenerated, no remote dependency required to read your own
// context"). A real transformer backend (FastEmbed/BGE) is available as a documented,
// opt-in plug-in — see `embedder-fastembed.ts`.

/** A pluggable embedding model. `id` is recorded in the store + export header. */
export interface Embedder {
  /** Stable identifier (includes the dimensionality) recorded with the store. */
  readonly id: string;
  /** Output dimensionality. Locked into the store on first write. */
  readonly dim: number;
  /** Embed a batch of texts into L2-normalized vectors of length `dim`. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** FNV-1a 32-bit hash with a seed, used for the feature-hashing trick. */
function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** L2-normalize in place; returns the same array. A zero vector is left as zeros. */
export function l2normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
  }
  return v;
}

/** Extract features from text: word unigrams, word bigrams, and intra-word char 4-grams. */
function features(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const feats: string[] = [];
  let prev: string | undefined;
  for (const w of words) {
    feats.push(`w:${w}`);
    if (prev !== undefined) feats.push(`b:${prev}_${w}`);
    if (w.length > 4) {
      const padded = `^${w}$`;
      for (let j = 0; j + 4 <= padded.length; j++) feats.push(`c:${padded.slice(j, j + 4)}`);
    }
    prev = w;
  }
  return feats;
}

export interface HashEmbedderOptions {
  /** Vector dimensionality (default 256). */
  dim?: number;
}

/**
 * Deterministic, offline, zero-dependency embedder using the signed feature-hashing
 * trick (a standard NLP technique, cf. scikit-learn's HashingVectorizer). Texts that
 * share words / bigrams / sub-word n-grams land near each other in cosine space. It is
 * fully regenerable from text alone, identical on every machine, and needs no model
 * download, no API key, and no network — so the owned context store truly answers to
 * you, not a vendor.
 */
export class HashEmbedder implements Embedder {
  readonly dim: number;
  readonly id: string;

  constructor(opts: HashEmbedderOptions = {}) {
    this.dim = opts.dim ?? 256;
    this.id = `hash-fh-v1-d${this.dim}`;
  }

  embed(texts: string[]): Promise<Float32Array[]> {
    const out = texts.map((text) => {
      const v = new Float32Array(this.dim);
      for (const f of features(text)) {
        const bucket = fnv1a(f, 0x811c9dc5) % this.dim;
        const sign = (fnv1a(f, 0x9e3779b1) & 1) === 0 ? 1 : -1;
        v[bucket] = (v[bucket] ?? 0) + sign;
      }
      return l2normalize(v);
    });
    return Promise.resolve(out);
  }
}
