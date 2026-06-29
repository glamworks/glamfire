import { describe, expect, it } from 'vitest';
import { HashEmbedder } from '../src/embedder.js';
import { def, dot } from './helpers.js';

describe('HashEmbedder', () => {
  it('is deterministic across instances (regenerable, offline)', async () => {
    const a = new HashEmbedder();
    const b = new HashEmbedder();
    const [va] = await a.embed(['the quick brown fox jumps']);
    const [vb] = await b.embed(['the quick brown fox jumps']);
    expect(Array.from(def(va))).toEqual(Array.from(def(vb)));
  });

  it('produces L2-normalized vectors of the declared dimension', async () => {
    const e = new HashEmbedder({ dim: 128 });
    expect(e.dim).toBe(128);
    expect(e.id).toBe('hash-fh-v1-d128');
    const v = def((await e.embed(['hello world this is a test sentence']))[0]);
    expect(v.length).toBe(128);
    let norm = 0;
    for (const x of v) norm += x * x;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it('places lexically similar texts closer than unrelated ones', async () => {
    const e = new HashEmbedder();
    const [cats, kittens, finance] = await e.embed([
      'cats are small domestic feline animals kept as pets',
      'kittens are baby cats and feline pets',
      'quarterly revenue and interest rates moved the bond market',
    ]);
    expect(dot(def(cats), def(kittens))).toBeGreaterThan(dot(def(cats), def(finance)));
  });
});
