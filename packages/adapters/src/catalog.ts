// The evergreen model/provider catalog — glamfire's single source of truth for
// "which open-weight models do respected US-hosted providers serve, at what
// price, at what quantization" (research/25-provider-landscape-2026-07,
// research/25-registry-seed.json, research/23).
//
// Everything price-shaped in the harness derives from this table:
//   - the adapters' pricing rows (fireworks-glm, together, anthropic) are looked
//     up here via `catalogPriceRow`, so the router registry's cost model and the
//     `glam models` landscape view can never drift apart;
//   - `glam models` renders it (and `glam models --refresh` diffs live provider
//     model-list APIs against it, reporting price drops explicitly).
//
// HONESTY RULES for this file:
//   - every entry carries `asOf` (the date its numbers were verified against
//     `sourceUrl`) — prices in this market decay in weeks, which is exactly why
//     `glam models --refresh` exists;
//   - no invented numbers: a price a provider does not publish is `null`, never
//     a guess (nulls render as "—" and sort last);
//   - quantization is a deployment property, not an API field (research/23 §3),
//     so it is recorded per provider×model and surfaced as a routing caveat
//     (e.g. Together serves GLM-5.2 at FP4 — a real downgrade vs Fireworks FP8).

import { type Capability, GLM_DEFAULT_MODEL, capabilitySchema } from '@glamfire/config';
import { z } from 'zod';

/**
 * Providers the landscape view tracks. A superset of the providers with wired
 * adapters: the catalog is the *market* view, so it may list a respected host
 * (e.g. DeepInfra as the FP4 cost floor) before glamfire ships an adapter for
 * it. The router only ever routes to models with real adapters — unwired
 * entries are informational and say so in `notes`.
 */
export const CATALOG_PROVIDERS = [
  'fireworks',
  'together',
  'deepinfra',
  'mistral',
  'anthropic',
] as const;
export type CatalogProvider = (typeof CATALOG_PROVIDERS)[number];

export const catalogEntrySchema = z.strictObject({
  /** Logical model name (family id, provider-neutral). */
  model: z.string().min(1),
  provider: z.enum(CATALOG_PROVIDERS),
  /** Provider-specific model id / endpoint slug used on the wire. */
  endpoint: z.string().min(1),
  /** USD per 1M input tokens (null = provider publishes no serverless price). */
  usdPerMInput: z.number().positive().nullable(),
  /** USD per 1M cached-input tokens (null = not published; never guessed). */
  usdPerMCachedInput: z.number().nonnegative().nullable(),
  /** USD per 1M output tokens (null = provider publishes no serverless price). */
  usdPerMOutput: z.number().positive().nullable(),
  /** Served quantization for this provider×model, or null when unverified. */
  quant: z.string().min(1).nullable(),
  /** Context window in thousands of tokens. */
  contextK: z.number().int().positive(),
  /** Capability tokens (the @glamfire/config routing contract vocabulary). */
  capabilities: z.array(capabilitySchema),
  /** Weights license as stated by the model card / provider ("closed" = API-only). */
  license: z.string().min(1),
  /** ISO date the prices/specs were verified against `sourceUrl`. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrl: z.string().url(),
  /** Honesty caveats: quant downgrades, dedicated-endpoint-only, unwired, etc. */
  notes: z.string().optional(),
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

const caps = (...tokens: Capability[]): Capability[] => tokens;

/**
 * The built-in catalog. Seeded from research/25-registry-seed.json and
 * research/23, with every price re-verified against the provider's live
 * pricing page / model API on the `asOf` date. Where the seed and a live
 * source disagreed, the live source won (e.g. Together's GLM-5.2 model page
 * lists FP4 at 256K — recorded as such despite an fp8 placeholder in the seed).
 * Qwen 3.7 Plus is deliberately absent: its weights are licensed/closed
 * (research/23 §1), so it fails the open-weight bar this catalog exists to map.
 */
export const BUILTIN_CATALOG: CatalogEntry[] = [
  // --- Fireworks (default provider; FP8 quality baseline) --------------------
  {
    model: 'glm-5.2',
    provider: 'fireworks',
    endpoint: GLM_DEFAULT_MODEL,
    usdPerMInput: 1.4,
    usdPerMCachedInput: 0.14,
    usdPerMOutput: 4.4,
    quant: 'FP8',
    contextK: 1024,
    capabilities: caps(
      'tool_calling',
      'parallel_tool_calls',
      'json_mode',
      'streaming',
      'seed',
      'long_context',
    ),
    license: 'MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://docs.fireworks.ai/serverless/pricing',
    notes:
      'DEFAULT WORKHORSE (and the most expensive open model here). 753B MoE; ' +
      '#1 open model on AA Intelligence Index. Priority tier $1.75/$5.50, ' +
      'fast tier $2.10/$6.60, batch 50% off. Together matches list price at ' +
      'higher throughput but serves FP4.',
  },
  {
    model: 'deepseek-v4-pro',
    provider: 'fireworks',
    endpoint: 'accounts/fireworks/models/deepseek-v4-pro',
    usdPerMInput: 1.74,
    usdPerMCachedInput: 0.145,
    usdPerMOutput: 3.48,
    quant: 'FP8',
    contextK: 1024,
    capabilities: caps('tool_calling', 'json_mode', 'streaming', 'long_context'),
    license: 'MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://docs.fireworks.ai/serverless/pricing',
    notes:
      'Primary DeepSeek host — adapter wired and live-verified (parallel tool ' +
      'calls + seed, real glam run round-trip). 1.6T total / 49B active; 384K ' +
      'max output; batch 50% off. First-party DeepSeek API is cheaper but ' +
      'China-hosted (excluded by default).',
  },
  {
    model: 'deepseek-v4-flash',
    provider: 'fireworks',
    endpoint: 'accounts/fireworks/models/deepseek-v4-flash',
    usdPerMInput: 0.14,
    usdPerMCachedInput: 0.028,
    usdPerMOutput: 0.28,
    quant: 'FP8',
    contextK: 1024,
    capabilities: caps('tool_calling', 'json_mode', 'long_context'),
    license: 'MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://docs.fireworks.ai/serverless/pricing',
    notes:
      'Budget tier — adapter wired and live-verified (real cache-hit run at ' +
      '$0.028/1M cached). 284B total / 13B active MoE; 384K max output. Batch ' +
      '= 50% of serverless. No Fireworks priority tier — requesting it fails loud.',
  },
  {
    model: 'minimax-m3',
    provider: 'fireworks',
    endpoint: 'accounts/fireworks/models/minimax-m3',
    usdPerMInput: 0.3,
    usdPerMCachedInput: null,
    usdPerMOutput: 1.2,
    quant: 'FP8',
    contextK: 1024,
    capabilities: caps('tool_calling', 'json_mode', 'vision', 'long_context'),
    license: 'open-weights (MiniMax license)',
    asOf: '2026-07-03',
    sourceUrl: 'https://docs.fireworks.ai/serverless/pricing',
    notes:
      'Released 2026-06-01; multimodal (text/image/video in); MiniMax Sparse ' +
      'Attention; strong agentic + office-doc workflows. No glamfire adapter ' +
      'wired yet.',
  },
  {
    model: 'kimi-k2.7-code',
    provider: 'fireworks',
    endpoint: 'accounts/fireworks/models/kimi-k2p7-code',
    usdPerMInput: 0.95,
    usdPerMCachedInput: null,
    usdPerMOutput: 4.0,
    quant: 'FP8',
    contextK: 256,
    capabilities: caps('tool_calling', 'json_mode', 'long_context'),
    license: 'Modified MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://docs.fireworks.ai/serverless/pricing',
    notes:
      'Released 2026-06-12; 1T total / 32B active; ~30% fewer reasoning tokens ' +
      'than K2.6; best-in-class agentic coding stamina. K2.6 same price on ' +
      'Fireworks. No glamfire adapter wired yet.',
  },
  // --- Together AI (second provider; wired adapter) --------------------------
  {
    model: 'glm-5.2',
    provider: 'together',
    endpoint: 'zai-org/GLM-5.2',
    usdPerMInput: 1.4,
    usdPerMCachedInput: 0.26,
    usdPerMOutput: 4.4,
    quant: 'FP4',
    contextK: 256,
    capabilities: caps(
      'tool_calling',
      'parallel_tool_calls',
      'json_mode',
      'streaming',
      'seed',
      'long_context',
    ),
    license: 'MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://www.together.ai/models/glm-52',
    notes:
      'Failover route for the default workhorse; fastest measured GLM-5.2 ' +
      'serverless throughput (374.6 t/s, Artificial Analysis). CAVEAT: served ' +
      'at FP4 — a real quantization downgrade vs the Fireworks FP8 baseline ' +
      '(research/23 §2). Prefer Fireworks for GLM quality.',
  },
  {
    model: 'qwen3-coder-next',
    provider: 'together',
    endpoint: 'Qwen/Qwen3-Coder-Next',
    usdPerMInput: 0.11,
    usdPerMCachedInput: 0.011,
    usdPerMOutput: 0.8,
    quant: 'FP8',
    contextK: 262,
    capabilities: caps(
      'tool_calling',
      'parallel_tool_calls',
      'json_mode',
      'streaming',
      'seed',
      'long_context',
    ),
    license: 'Apache-2.0',
    asOf: '2026-07-03',
    sourceUrl: 'https://pricepertoken.com/pricing-page/model/qwen-qwen3-coder-next',
    notes:
      'Cheap/fast coding-agent second tier (80B total / 3B active, ' +
      'non-thinking, RL-tuned for coding agents). CAVEAT: Together serves it ' +
      'via a DEDICATED endpoint, not serverless — the price shown is Qwen’s ' +
      'reference serverless list price; a dedicated deployment bills by ' +
      'deployment, verify against the live invoice (research/23 §1).',
  },
  {
    model: 'deepseek-v4-pro',
    provider: 'together',
    endpoint: 'deepseek-ai/DeepSeek-V4-Pro',
    usdPerMInput: 1.74,
    usdPerMCachedInput: 0.2,
    usdPerMOutput: 3.48,
    quant: 'FP4/FP8',
    contextK: 512,
    capabilities: caps('tool_calling', 'json_mode', 'streaming', 'long_context'),
    license: 'MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://www.together.ai/models/deepseek-v4-pro',
    notes:
      'Cross-family fallback host — adapter wired (live call pending ' +
      'TOGETHER_API_KEY). FP4+FP8 mixed precision at 512K (vs 1M FP8 on ' +
      'Fireworks). Launch blog said $2.10/$4.40; the live model page price ' +
      'shown here wins — reconcile against the first real invoice.',
  },
  // --- DeepInfra (FP4 cost floor; no adapter wired) ---------------------------
  {
    model: 'kimi-k2.6',
    provider: 'deepinfra',
    endpoint: 'moonshotai/Kimi-K2.6',
    usdPerMInput: 0.75,
    usdPerMCachedInput: 0.15,
    usdPerMOutput: 3.5,
    quant: 'FP4',
    contextK: 256,
    capabilities: caps('tool_calling', 'json_mode', 'long_context'),
    license: 'Modified MIT',
    asOf: '2026-07-03',
    sourceUrl: 'https://deepinfra.com/blog/kimi-k2-6-pricing-guide-deployment-tradeoffs',
    notes:
      'Budget route — DeepInfra is the FP4 cost floor of the landscape: lower ' +
      'quality bar and lower throughput (~40 t/s class). Use only where FP4 ' +
      'quality is acceptable. No glamfire adapter wired yet.',
  },
  // --- Mistral (only non-Chinese open flagship; no adapter wired) -------------
  {
    model: 'mistral-large-2512',
    provider: 'mistral',
    endpoint: 'mistral-large-2512',
    usdPerMInput: null,
    usdPerMCachedInput: null,
    usdPerMOutput: null,
    quant: 'FP8',
    contextK: 256,
    capabilities: caps('tool_calling', 'json_mode', 'vision', 'long_context'),
    license: 'Apache-2.0',
    asOf: '2026-07-03',
    sourceUrl: 'https://mistral.ai/news/mistral-3/',
    notes:
      '675B / 41B-active MoE; the only non-Chinese open flagship — the ' +
      'compliance alternative when Chinese-origin weights are excluded. Also ' +
      'on Azure AI Foundry. Serverless price not published yet (null, not ' +
      'guessed) — pick it up via `glam models --refresh` once listed. No ' +
      'glamfire adapter wired yet.',
  },
  // --- Anthropic (closed frontier — the escalation tier, not the cheap path) --
  {
    model: 'claude-opus-4-8',
    provider: 'anthropic',
    endpoint: 'claude-opus-4-8',
    usdPerMInput: 5,
    usdPerMCachedInput: 0.5,
    usdPerMOutput: 25,
    quant: 'native',
    contextK: 1000,
    capabilities: caps(
      'tool_calling',
      'parallel_tool_calls',
      'json_mode',
      'vision',
      'streaming',
      'long_context',
    ),
    license: 'closed',
    asOf: '2026-07-03',
    sourceUrl: 'https://platform.claude.com/docs/en/pricing',
    notes:
      'Frontier escalation target on low confidence; not part of the ' +
      'cheapest-capable ordering. Cache reads bill at ~0.1x input.',
  },
  {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    endpoint: 'claude-sonnet-4-6',
    usdPerMInput: 3,
    usdPerMCachedInput: 0.3,
    usdPerMOutput: 15,
    quant: 'native',
    contextK: 1000,
    capabilities: caps(
      'tool_calling',
      'parallel_tool_calls',
      'json_mode',
      'vision',
      'streaming',
      'long_context',
    ),
    license: 'closed',
    asOf: '2026-07-03',
    sourceUrl: 'https://platform.claude.com/docs/en/pricing',
    notes: 'Mid-tier frontier escalation candidate (see glam.example.toml routing).',
  },
  {
    model: 'claude-haiku-4-5',
    provider: 'anthropic',
    endpoint: 'claude-haiku-4-5',
    usdPerMInput: 1,
    usdPerMCachedInput: 0.1,
    usdPerMOutput: 5,
    quant: 'native',
    contextK: 200,
    capabilities: caps(
      'tool_calling',
      'parallel_tool_calls',
      'json_mode',
      'vision',
      'streaming',
      'long_context',
    ),
    license: 'closed',
    asOf: '2026-07-03',
    sourceUrl: 'https://platform.claude.com/docs/en/pricing',
    notes: 'Cheapest frontier tier; 200K context.',
  },
];

/** Validate one entry (fail loud — used by tests and the refresh cache load). */
export function validateCatalogEntry(entry: unknown): CatalogEntry {
  return catalogEntrySchema.parse(entry);
}

/** Stable identity of an entry within a catalog. */
export function catalogKey(entry: Pick<CatalogEntry, 'provider' | 'endpoint'>): string {
  return `${entry.provider}\u0000${entry.endpoint}`;
}

/** Look up an entry by provider + provider-specific model id. */
export function catalogEntry(
  provider: CatalogProvider,
  endpoint: string,
  entries: CatalogEntry[] = BUILTIN_CATALOG,
): CatalogEntry | undefined {
  return entries.find((e) => e.provider === provider && e.endpoint === endpoint);
}

/** USD-per-1M price row shape the adapters price with. */
export interface CatalogPriceRow {
  input: number;
  cached: number;
  output: number;
}

/**
 * The adapters' pricing hook into the catalog: return the published price row
 * for a provider×model, failing loud when the catalog has no entry or no
 * published price — an adapter must never price with invented numbers.
 * A missing cached-input rate falls back to the full input rate (an honest
 * upper bound: never *under*-reports cost).
 */
export function catalogPriceRow(provider: CatalogProvider, endpoint: string): CatalogPriceRow {
  const entry = catalogEntry(provider, endpoint);
  if (!entry) {
    throw new Error(
      `no catalog entry for ${provider} model "${endpoint}" — add it to packages/adapters/src/catalog.ts (the single source of truth for pricing)`,
    );
  }
  if (entry.usdPerMInput === null || entry.usdPerMOutput === null) {
    throw new Error(
      `catalog entry for ${provider} model "${endpoint}" has no published price (asOf ${entry.asOf}, see ${entry.sourceUrl}) — it cannot back an adapter's pricing`,
    );
  }
  return {
    input: entry.usdPerMInput,
    cached: entry.usdPerMCachedInput ?? entry.usdPerMInput,
    output: entry.usdPerMOutput,
  };
}

// --- refresh support: merge + price diff -------------------------------------

/** Override base entries by (provider, endpoint); unknown keys are appended. */
export function mergeCatalogs(base: CatalogEntry[], overrides: CatalogEntry[]): CatalogEntry[] {
  const byKey = new Map(base.map((e) => [catalogKey(e), e]));
  for (const o of overrides) byKey.set(catalogKey(o), o);
  return [...byKey.values()];
}

/** One observed price movement between two catalog snapshots. */
export interface PriceChange {
  provider: CatalogProvider;
  model: string;
  endpoint: string;
  field: 'input' | 'cachedInput' | 'output';
  /** USD per 1M tokens before/after. `was` null = newly published price. */
  was: number | null;
  now: number;
  direction: 'down' | 'up' | 'new';
  /** The asOf date the old price carried (what "since" means in the report). */
  sinceAsOf: string;
}

const PRICE_FIELDS = [
  ['usdPerMInput', 'input'],
  ['usdPerMCachedInput', 'cachedInput'],
  ['usdPerMOutput', 'output'],
] as const;

/**
 * Diff two catalog snapshots and report every price movement. Entries present
 * only on one side are ignored (availability changes are reported separately
 * by the refresh flow); a price going from null -> number is reported as
 * `new` (a provider started publishing it), and number -> null is ignored
 * (never "unlearn" a price from a partial API response).
 */
export function diffCatalogs(before: CatalogEntry[], after: CatalogEntry[]): PriceChange[] {
  const byKey = new Map(before.map((e) => [catalogKey(e), e]));
  const changes: PriceChange[] = [];
  for (const next of after) {
    const prev = byKey.get(catalogKey(next));
    if (!prev) continue;
    for (const [prop, field] of PRICE_FIELDS) {
      const was = prev[prop];
      const now = next[prop];
      if (now === null || was === now) continue;
      changes.push({
        provider: next.provider,
        model: next.model,
        endpoint: next.endpoint,
        field,
        was,
        now,
        direction: was === null ? 'new' : now < was ? 'down' : 'up',
        sinceAsOf: prev.asOf,
      });
    }
  }
  return changes;
}
