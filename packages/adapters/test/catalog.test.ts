// The evergreen model/provider catalog — schema discipline, honesty rules, and
// the single-source-of-truth guarantee: adapter pricing derives from these
// rows, so the numbers `glam models` shows can never drift from what the
// router's cost model actually charges with.

import {
  BUILTIN_CATALOG,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  catalogEntry,
  catalogKey,
  catalogPriceRow,
  createAnthropicAdapter,
  createFireworksGlmAdapter,
  createTogetherAdapter,
  diffCatalogs,
  isSelfHostProvider,
  mergeCatalogs,
  resolveAnthropicConfig,
  resolveFireworksConfig,
  resolveTogetherConfig,
  validateCatalogEntry,
} from '@glamfire/adapters';
import { GLM_DEFAULT_MODEL } from '@glamfire/config';
import type { Usage } from '@glamfire/engine';
import { describe, expect, it } from 'vitest';

describe('built-in catalog schema (honesty rules)', () => {
  it('every entry validates against the strict schema', () => {
    for (const entry of BUILTIN_CATALOG) {
      expect(() => validateCatalogEntry(entry)).not.toThrow();
    }
  });

  it('entries are unique by (provider, endpoint)', () => {
    const keys = BUILTIN_CATALOG.map(catalogKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry carries a real asOf date and an https source URL', () => {
    for (const entry of BUILTIN_CATALOG) {
      expect(entry.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(entry.asOf))).toBe(false);
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('hosted prices are positive when published, null otherwise; self-host is exactly $0', () => {
    for (const entry of BUILTIN_CATALOG) {
      if (isSelfHostProvider(entry.provider)) {
        // $0 is the REAL marginal token price of owned hardware — and it must
        // be exactly 0, never a positive number glamfire invented.
        expect(entry.usdPerMInput).toBe(0);
        expect(entry.usdPerMOutput).toBe(0);
        continue;
      }
      for (const price of [entry.usdPerMInput, entry.usdPerMOutput]) {
        if (price !== null) expect(price).toBeGreaterThan(0);
      }
      // input and output are published together or not at all.
      expect(entry.usdPerMInput === null).toBe(entry.usdPerMOutput === null);
    }
  });

  it('rejects a hosted entry claiming $0 (schema-level honesty guard)', () => {
    const fireworksGlm = catalogEntry('fireworks', GLM_DEFAULT_MODEL);
    expect(() =>
      validateCatalogEntry({ ...fireworksGlm, usdPerMInput: 0, usdPerMCachedInput: 0 }),
    ).toThrow(/cannot publish \$0/);
  });

  it('lists the self-host tier: ollama/vllm/lmstudio venues, DwarfStar-DS4, Ornith sizes', () => {
    expect(catalogEntry('ollama', 'http://localhost:11434/v1')).toBeDefined();
    expect(catalogEntry('vllm', 'http://localhost:8000/v1')).toBeDefined();
    expect(catalogEntry('lmstudio', 'http://localhost:1234/v1')).toBeDefined();

    const ds4 = catalogEntry('dwarfstar', 'http://127.0.0.1:8000/v1');
    expect(ds4).toBeDefined();
    expect(ds4?.model).toBe('deepseek-v4-flash'); // same brain as the hosted budget tier
    expect(ds4?.contextK).toBe(100); // practical cap, not the 1M hosted window
    expect(ds4?.notes).toMatch(/BETA/);
    expect(ds4?.notes).toMatch(/NOT independently verified/);
    expect(ds4?.notes).toMatch(/96–128 GB/);

    for (const size of ['9B', '35B']) {
      const ornith = catalogEntry('vllm', `deepreinforce-ai/Ornith-1.0-${size}`);
      expect(ornith).toBeDefined();
      expect(ornith?.license).toBe('MIT');
      expect(ornith?.notes).toMatch(/[Vv]endor-benchmarked ONLY/);
    }
    // Deliberately absent: 397B (8×80GB is not a user path) and 31B (no checkpoint).
    expect(BUILTIN_CATALOG.some((e) => e.endpoint.includes('Ornith-1.0-397B'))).toBe(false);
    expect(BUILTIN_CATALOG.some((e) => e.endpoint.includes('Ornith-1.0-31B'))).toBe(false);
  });

  it('covers the landscape the seed requires (workhorse, second tier, escalation)', () => {
    expect(catalogEntry('fireworks', GLM_DEFAULT_MODEL)).toBeDefined();
    expect(catalogEntry('together', TOGETHER_GLM_MODEL)).toBeDefined();
    expect(catalogEntry('together', TOGETHER_QWEN_MODEL)).toBeDefined();
    expect(catalogEntry('fireworks', 'accounts/fireworks/models/deepseek-v4-pro')).toBeDefined();
    expect(catalogEntry('together', 'deepseek-ai/DeepSeek-V4-Pro')).toBeDefined();
    expect(catalogEntry('anthropic', 'claude-opus-4-8')).toBeDefined();
  });

  it('records the Together GLM FP4 quantization downgrade honestly', () => {
    const together = catalogEntry('together', TOGETHER_GLM_MODEL);
    const fireworks = catalogEntry('fireworks', GLM_DEFAULT_MODEL);
    expect(together?.quant).toBe('FP4');
    expect(fireworks?.quant).toBe('FP8');
  });

  it('excludes closed-weight Qwen Plus (research/23: licensed, not open)', () => {
    expect(BUILTIN_CATALOG.some((e) => e.endpoint.includes('qwen3p7-plus'))).toBe(false);
  });
});

describe('catalogPriceRow (fail-loud lookup)', () => {
  it('returns the published row for a known model', () => {
    const row = catalogPriceRow('fireworks', GLM_DEFAULT_MODEL);
    expect(row).toEqual({ input: 1.4, cached: 0.14, output: 4.4 });
  });

  it('throws for an unknown model instead of inventing prices', () => {
    expect(() => catalogPriceRow('fireworks', 'accounts/fireworks/models/nope')).toThrow(
      /no catalog entry/,
    );
  });

  it('throws for an entry with no published price (mistral-large-2512)', () => {
    expect(() => catalogPriceRow('mistral', 'mistral-large-2512')).toThrow(/no published price/);
  });
});

describe('single source of truth: adapters price from the catalog', () => {
  const usage: Usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 };

  it('fireworks-glm standard tier == catalog row', () => {
    const config = resolveFireworksConfig({ FIREWORKS_API_KEY: 'test-key' });
    const adapter = createFireworksGlmAdapter(config);
    const row = catalogPriceRow('fireworks', GLM_DEFAULT_MODEL);
    expect(adapter.pricing(usage)).toBeCloseTo(row.input + row.output, 9);
    const cachedUsage: Usage = {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    };
    expect(adapter.pricing(cachedUsage)).toBeCloseTo(row.cached, 9);
  });

  it('together adapter (GLM + Qwen) == catalog rows', () => {
    for (const model of [TOGETHER_GLM_MODEL, TOGETHER_QWEN_MODEL]) {
      const config = resolveTogetherConfig({ TOGETHER_API_KEY: 'test-key' }, { model });
      const adapter = createTogetherAdapter(config);
      const row = catalogPriceRow('together', model);
      expect(adapter.pricing(usage)).toBeCloseTo(row.input + row.output, 9);
    }
  });

  it('anthropic adapter (current generation) == catalog rows', () => {
    for (const model of ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] as const) {
      const config = resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'test-key' }, { model });
      const adapter = createAnthropicAdapter(config);
      const row = catalogPriceRow('anthropic', model);
      expect(adapter.pricing(usage)).toBeCloseTo(row.input + row.output, 9);
    }
  });
});

describe('mergeCatalogs', () => {
  it('overrides by (provider, endpoint) and appends unknown entries', () => {
    const base = BUILTIN_CATALOG;
    const override = {
      ...(catalogEntry('fireworks', GLM_DEFAULT_MODEL) as (typeof base)[number]),
      usdPerMOutput: 4.0,
      asOf: '2026-08-01',
    };
    const merged = mergeCatalogs(base, [override]);
    expect(merged.length).toBe(base.length);
    expect(catalogEntry('fireworks', GLM_DEFAULT_MODEL, merged)?.usdPerMOutput).toBe(4.0);

    const novel = { ...override, endpoint: 'accounts/fireworks/models/brand-new' };
    expect(mergeCatalogs(base, [novel]).length).toBe(base.length + 1);
  });
});

describe('diffCatalogs (price-movement reporting)', () => {
  const before = BUILTIN_CATALOG;

  it('reports a price drop with direction=down and the old asOf', () => {
    const after = mergeCatalogs(before, [
      {
        ...(catalogEntry('together', TOGETHER_GLM_MODEL) as (typeof before)[number]),
        usdPerMOutput: 4.2,
        asOf: '2026-08-01',
      },
    ]);
    const changes = diffCatalogs(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      provider: 'together',
      field: 'output',
      was: 4.4,
      now: 4.2,
      direction: 'down',
      sinceAsOf: '2026-07-03',
    });
  });

  it('reports an increase as direction=up', () => {
    const after = mergeCatalogs(before, [
      {
        ...(catalogEntry('together', TOGETHER_GLM_MODEL) as (typeof before)[number]),
        usdPerMInput: 1.6,
      },
    ]);
    expect(diffCatalogs(before, after)[0]).toMatchObject({ direction: 'up', was: 1.4, now: 1.6 });
  });

  it('reports a newly published price as direction=new', () => {
    const after = mergeCatalogs(before, [
      {
        ...(catalogEntry('mistral', 'mistral-large-2512') as (typeof before)[number]),
        usdPerMInput: 0.9,
        usdPerMOutput: 2.7,
      },
    ]);
    const changes = diffCatalogs(before, after);
    expect(changes.map((c) => c.direction)).toEqual(['new', 'new']);
    expect(changes[0]?.was).toBeNull();
  });

  it('never "unlearns" a price (number -> null is ignored) and ignores identical rows', () => {
    expect(diffCatalogs(before, before)).toHaveLength(0);
    const after = mergeCatalogs(before, [
      {
        ...(catalogEntry('together', TOGETHER_GLM_MODEL) as (typeof before)[number]),
        usdPerMOutput: null,
      },
    ]);
    expect(diffCatalogs(before, after)).toHaveLength(0);
  });
});
