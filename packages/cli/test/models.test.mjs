// `glam models` unit/regression tests: arg parsing, capability filtering,
// price sorting, cache precedence, and the --refresh diff/degradation logic —
// exercised with a real temp HOME and an injected fetch that replays REAL
// provider API shapes (captured from the live Fireworks/Together model APIs).

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN_CATALOG, catalogEntry } from '@glamfire/adapters';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  blendedPrice,
  cachePath,
  effectiveCatalog,
  filterCapable,
  formatChange,
  loadCache,
  parseArgs,
  refreshCatalog,
  saveCache,
  sortEntries,
} from '../src/models.mjs';

const GLM_FW = 'accounts/fireworks/models/glm-5p2';

describe('parseArgs', () => {
  it('parses the full option surface', () => {
    const opts = parseArgs([
      '--json',
      '--refresh',
      '--capable',
      'vision,tool_calling',
      '--sort',
      'price',
    ]);
    expect(opts).toMatchObject({
      json: true,
      refresh: true,
      capable: ['vision', 'tool_calling'],
      sort: 'price',
    });
  });

  it('rejects unknown options, capabilities, and sort modes', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/);
    expect(() => parseArgs(['--capable', 'flying'])).toThrow(/unknown capability "flying"/);
    expect(() => parseArgs(['--sort', 'vibes'])).toThrow(/unknown sort/);
    expect(() => parseArgs(['--capable'])).toThrow(/requires a value/);
  });
});

describe('filterCapable', () => {
  it('requires ALL listed tokens', () => {
    const vision = filterCapable(BUILTIN_CATALOG, ['vision']);
    expect(vision.length).toBeGreaterThan(0);
    for (const e of vision) expect(e.capabilities).toContain('vision');

    const visionAndSeed = filterCapable(BUILTIN_CATALOG, ['vision', 'seed']);
    expect(visionAndSeed).toHaveLength(0); // no catalog model declares both today
  });

  it('empty token list is a no-op', () => {
    expect(filterCapable(BUILTIN_CATALOG, [])).toBe(BUILTIN_CATALOG);
  });
});

describe('sortEntries --sort price', () => {
  it('sorts cheapest-first by blended $/1M with unpublished prices last', () => {
    const sorted = sortEntries(BUILTIN_CATALOG, 'price');
    const prices = sorted.map(blendedPrice);
    const published = prices.filter((p) => p !== null);
    expect(published).toEqual([...published].sort((a, b) => a - b));
    // nulls (mistral, unpublished) sink to the end
    expect(prices.at(-1)).toBeNull();
    // self-host venues ($0 marginal price on owned hardware) sort first
    expect(blendedPrice(sorted[0])).toBe(0);
    // the cheapest PAID hosted model today is deepseek-v4-flash ($0.14+$0.28)
    const firstPaid = sorted.find((e) => (blendedPrice(e) ?? 0) > 0);
    expect(firstPaid.model).toBe('deepseek-v4-flash');
  });

  it('no sort mode preserves catalog order', () => {
    expect(sortEntries(BUILTIN_CATALOG, null)).toBe(BUILTIN_CATALOG);
  });
});

describe('cache precedence (~/.glam/cache/models.json)', () => {
  let home;
  let env;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'glam-models-test-'));
    env = { HOME: home, USERPROFILE: home };
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('no cache -> built-in catalog', () => {
    const { entries, cache } = effectiveCatalog(env);
    expect(cache).toBeNull();
    expect(entries).toBe(BUILTIN_CATALOG);
  });

  it('a NEWER cache overrides built-in entries by (provider, endpoint)', () => {
    const updated = {
      ...catalogEntry('fireworks', GLM_FW),
      usdPerMOutput: 4.2,
      asOf: '2027-01-01',
    };
    saveCache(env, [updated], '2027-01-01T00:00:00.000Z');
    const { entries, cache } = effectiveCatalog(env);
    expect(cache).not.toBeNull();
    expect(catalogEntry('fireworks', GLM_FW, entries)?.usdPerMOutput).toBe(4.2);
    // non-overridden entries still come from the built-in catalog
    expect(entries.length).toBe(BUILTIN_CATALOG.length);
  });

  it('a STALE cache (older than the shipped catalog) is ignored', () => {
    const stale = { ...catalogEntry('fireworks', GLM_FW), usdPerMOutput: 9.9 };
    saveCache(env, [stale], '2020-01-01T00:00:00.000Z');
    const { entries, cache } = effectiveCatalog(env);
    expect(cache).toBeNull();
    expect(catalogEntry('fireworks', GLM_FW, entries)?.usdPerMOutput).toBe(4.4);
  });

  it('a corrupt or invalid cache file is ignored, never crashes', () => {
    mkdirSync(join(home, '.glam', 'cache'), { recursive: true });
    writeFileSync(cachePath(env), 'not json at all {');
    expect(loadCache(env)).toBeNull();
    writeFileSync(cachePath(env), JSON.stringify({ version: 99, entries: [], refreshedAt: 'x' }));
    expect(loadCache(env)).toBeNull();
    expect(effectiveCatalog(env).entries).toBe(BUILTIN_CATALOG);
  });

  it('saveCache round-trips through loadCache', () => {
    const file = saveCache(env, BUILTIN_CATALOG, '2027-02-02T00:00:00.000Z');
    expect(readFileSync(file, 'utf8')).toContain('glm-5p2');
    const cache = loadCache(env);
    expect(cache.refreshedAt).toBe('2027-02-02T00:00:00.000Z');
    expect(cache.entries.length).toBe(BUILTIN_CATALOG.length);
  });
});

// Real wire shapes: Together /v1/models returns an array of models carrying
// `pricing` in USD per 1M tokens; Fireworks /v1/models returns {data:[...]}
// with context_length but NO pricing fields (verified live 2026-07-03).
function fakeFetch(routes) {
  return async (url) => {
    for (const [needle, body] of routes) {
      if (String(url).includes(needle)) {
        return { ok: true, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

describe('refreshCatalog', () => {
  const TODAY = '2026-08-15';

  it('updates Together prices from the live API and reports the drop explicitly', async () => {
    const env = { TOGETHER_API_KEY: 'tk' };
    const fetchImpl = fakeFetch([
      [
        'api.together.xyz/v1/models',
        [
          {
            id: 'zai-org/GLM-5.2',
            context_length: 256000,
            pricing: { hint: 'per 1M tokens', input: 1.2, output: 4.0 },
          },
        ],
      ],
    ]);
    const result = await refreshCatalog(BUILTIN_CATALOG, env, { fetchImpl, today: TODAY });
    expect(result.refreshedProviders).toEqual(['together']);
    const glm = catalogEntry('together', 'zai-org/GLM-5.2', result.entries);
    expect(glm.usdPerMInput).toBe(1.2);
    expect(glm.usdPerMOutput).toBe(4.0);
    expect(glm.asOf).toBe(TODAY);

    const drops = result.changes.filter((c) => c.direction === 'down');
    expect(drops.map((c) => [c.field, c.was, c.now])).toEqual([
      ['input', 1.4, 1.2],
      ['output', 4.4, 4.0],
    ]);
    expect(drops[0].sinceAsOf).toBe('2026-07-03');
    // the human-readable report carries the arrow + was/now/since
    expect(formatChange(drops[0])).toContain('was $1.4 now $1.2 (since 2026-07-03)');
  });

  it('refuses an implausible price (unit change) instead of poisoning the cost model', async () => {
    const env = { TOGETHER_API_KEY: 'tk' };
    const fetchImpl = fakeFetch([
      [
        'api.together.xyz/v1/models',
        [{ id: 'zai-org/GLM-5.2', pricing: { input: 0.0000014, output: 0.0000044 } }],
      ],
    ]);
    const result = await refreshCatalog(BUILTIN_CATALOG, env, { fetchImpl, today: TODAY });
    const glm = catalogEntry('together', 'zai-org/GLM-5.2', result.entries);
    expect(glm.usdPerMInput).toBe(1.4); // untouched
    expect(result.notices.some((n) => n.includes('unit change'))).toBe(true);
    expect(result.changes).toHaveLength(0);
  });

  it('Fireworks: confirms availability + context but NEVER fakes a price refresh', async () => {
    const env = { FIREWORKS_API_KEY: 'fk' };
    const fetchImpl = fakeFetch([
      ['api.fireworks.ai/inference/v1/models', { data: [{ id: GLM_FW, context_length: 1048576 }] }],
    ]);
    const result = await refreshCatalog(BUILTIN_CATALOG, env, { fetchImpl, today: TODAY });
    expect(result.refreshedProviders).toEqual(['fireworks']);
    const glm = catalogEntry('fireworks', GLM_FW, result.entries);
    expect(glm.contextK).toBe(1049); // real machine-readable field applied
    expect(glm.usdPerMInput).toBe(1.4); // prices untouched…
    expect(glm.asOf).toBe('2026-07-03'); // …and asOf NOT bumped (no fake freshness)
    expect(result.notices.some((n) => n.includes('NO machine-readable prices'))).toBe(true);
  });

  it('no keys -> zero refreshed providers and honest notices for every provider', async () => {
    const result = await refreshCatalog(
      BUILTIN_CATALOG,
      {},
      { fetchImpl: fakeFetch([]), today: TODAY },
    );
    expect(result.refreshedProviders).toEqual([]);
    expect(result.changes).toHaveLength(0);
    expect(result.notices.join('\n')).toMatch(/TOGETHER_API_KEY not set/);
    expect(result.notices.join('\n')).toMatch(/FIREWORKS_API_KEY not set/);
  });

  it('an API failure degrades to built-in data with a notice, never a crash', async () => {
    const env = { TOGETHER_API_KEY: 'tk' };
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const result = await refreshCatalog(BUILTIN_CATALOG, env, { fetchImpl, today: TODAY });
    expect(result.refreshedProviders).toEqual([]);
    expect(result.notices.some((n) => n.includes('refresh failed'))).toBe(true);
    expect(catalogEntry('together', 'zai-org/GLM-5.2', result.entries).usdPerMInput).toBe(1.4);
  });
});
