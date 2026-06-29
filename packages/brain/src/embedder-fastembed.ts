// Optional real transformer embedding backend (BGE / FlagEmbedding via `fastembed`).
//
// This is a *real* dense embedding path: ONNX models run locally on-device, no API key,
// no per-query network call. The model weights are fetched once on first use and cached
// locally; thereafter the store is regenerable fully offline. It is intentionally an
// opt-in plug-in rather than a hard dependency so the default install stays lean,
// offline, and free of native onnxruntime / supply-chain weight — install it explicitly
// when you want dense semantic recall:
//
//     pnpm add fastembed
//
// Then:  const brain = Brain.open(path, { embedder: await createFastEmbedEmbedder() });
import { type Embedder, l2normalize } from './embedder.js';

/** Minimal shape of the parts of `fastembed` we use, so this file type-checks without it installed. */
interface FastEmbedModule {
  EmbeddingModel: Record<string, string>;
  FlagEmbedding: {
    init(opts: { model?: string; cacheDir?: string; maxLength?: number }): Promise<{
      embed(documents: string[], batchSize?: number): AsyncGenerator<number[][]>;
    }>;
  };
}

export interface FastEmbedOptions {
  /** A key of fastembed's `EmbeddingModel` enum. Default: `BGESmallENV15` (384 dims). */
  model?: string;
  /** Where to cache the downloaded ONNX weights. */
  cacheDir?: string;
  /** Output dimensionality of the chosen model (default 384, matching BGE-small). */
  dim?: number;
}

/**
 * Create a real transformer embedder backed by `fastembed`. Throws a precise, actionable
 * error if the optional package is not installed — never silently degrades.
 */
export async function createFastEmbedEmbedder(opts: FastEmbedOptions = {}): Promise<Embedder> {
  // Non-literal specifier: keeps TypeScript from hard-resolving the optional dependency.
  const specifier = 'fastembed';
  let mod: FastEmbedModule;
  try {
    mod = (await import(specifier)) as FastEmbedModule;
  } catch {
    throw new Error(
      "FastEmbedEmbedder requires the optional 'fastembed' package. Install it with `pnpm add fastembed` to enable dense transformer embeddings.",
    );
  }
  const modelKey = opts.model ?? 'BGESmallENV15';
  const modelName = mod.EmbeddingModel[modelKey];
  if (modelName === undefined) {
    throw new Error(`Unknown fastembed model "${modelKey}".`);
  }
  const dim = opts.dim ?? 384;
  const initOpts: { model: string; cacheDir?: string } = { model: modelName };
  if (opts.cacheDir !== undefined) initOpts.cacheDir = opts.cacheDir;
  const model = await mod.FlagEmbedding.init(initOpts);
  const id = `fastembed-${modelKey}-d${dim}`;

  return {
    id,
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const out: Float32Array[] = [];
      for await (const batch of model.embed(texts, 32)) {
        for (const vec of batch) out.push(l2normalize(Float32Array.from(vec)));
      }
      return out;
    },
  };
}
