// `glam models` — the evergreen model/provider landscape view (SPEC §5.3/§5.4).
//
// Renders the shared catalog (packages/adapters/src/catalog.ts — the single
// source of truth the adapters price from), so a human can see at a glance
// which open-weight models the respected US-hosted providers serve, at what
// price and quantization, and how fresh each number is (`asOf`). Prices in
// this market decay in weeks; `glam models --refresh` pulls CURRENT numbers
// from the providers' machine-readable model APIs where they exist, diffs them
// against the catalog, reports movements explicitly ("↓ was X now Y"), and
// caches the refreshed view under ~/.glam/cache/models.json. Where a provider
// publishes no machine-readable prices (Fireworks, Anthropic) the command says
// so plainly — it never fakes freshness.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BUILTIN_CATALOG,
  TOGETHER_DEFAULT_BASE_URL,
  diffCatalogs,
  mergeCatalogs,
  validateCatalogEntry,
} from '@glamfire/adapters';
import { FIREWORKS_DEFAULT_BASE_URL, capabilitySchema } from '@glamfire/config';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const FLAME = '\x1b[38;5;208m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

function color(on, code, s) {
  return on ? `${code}${s}${RESET}` : s;
}

export const CAPABILITY_TOKENS = capabilitySchema.options;

const CAP_ABBREV = {
  tool_calling: 'tools',
  parallel_tool_calls: 'par',
  json_mode: 'json',
  vision: 'vis',
  streaming: 'str',
  seed: 'seed',
  long_context: 'long',
};

const MODELS_HELP = `glam models — the live model/provider landscape (prices, quant, context, caps).

Usage: glam models [options]

Renders the built-in catalog of top open-weight models across respected
US-hosted inference providers (plus the Claude escalation tier), with USD/1M
prices, served quantization, context window, capability tokens, and the date
each price was last verified (asOf). The router's cost model derives from the
same catalog, so what you see here is what routing decisions use.

Options:
  --refresh              Fetch CURRENT prices/availability from provider model
                         APIs (Together prices; Fireworks availability — it
                         publishes no machine-readable prices), report price
                         changes ("↓ was X now Y"), and cache the result under
                         ~/.glam/cache/models.json. Needs the provider API key
                         in the environment; degrades honestly without one.
  --capable <a,b,...>    Only show models declaring ALL listed capability
                         tokens (${CAPABILITY_TOKENS.join(', ')})
  --sort price           Sort cheapest-first (by $/1M input + output;
                         unpublished prices sort last)
  --json                 Print the structured catalog as JSON
  -h, --help             Show this help
`;

export function parseArgs(args) {
  const opts = { json: false, refresh: false, capable: [], sort: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = () => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`option ${a} requires a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--refresh':
        opts.refresh = true;
        break;
      case '--capable':
        opts.capable = next()
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      case '--sort':
        opts.sort = next();
        break;
      default:
        throw new Error(`unknown option "${a}"`);
    }
  }
  for (const token of opts.capable) {
    if (!CAPABILITY_TOKENS.includes(token)) {
      throw new Error(
        `unknown capability "${token}" — valid tokens: ${CAPABILITY_TOKENS.join(', ')}`,
      );
    }
  }
  if (opts.sort !== null && opts.sort !== 'price') {
    throw new Error(`unknown sort "${opts.sort}" — supported: price`);
  }
  return opts;
}

/** Entries declaring ALL required capability tokens. */
export function filterCapable(entries, tokens) {
  if (tokens.length === 0) return entries;
  return entries.filter((e) => tokens.every((t) => e.capabilities.includes(t)));
}

/** Blended $/1M (input + output) used by `--sort price`; null prices sort last. */
export function blendedPrice(entry) {
  if (entry.usdPerMInput === null || entry.usdPerMOutput === null) return null;
  return entry.usdPerMInput + entry.usdPerMOutput;
}

export function sortEntries(entries, mode) {
  if (mode !== 'price') return entries;
  return [...entries].sort((a, b) => {
    const pa = blendedPrice(a);
    const pb = blendedPrice(b);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });
}

// --- cache (~/.glam/cache/models.json) ---------------------------------------

export const CACHE_VERSION = 1;

export function cachePath(env) {
  const home = env.HOME || env.USERPROFILE || homedir();
  return join(home, '.glam', 'cache', 'models.json');
}

/** Load the refreshed-catalog cache; invalid/missing -> null (never crashes). */
export function loadCache(env) {
  try {
    const raw = JSON.parse(readFileSync(cachePath(env), 'utf8'));
    if (raw?.version !== CACHE_VERSION || !Array.isArray(raw.entries)) return null;
    if (typeof raw.refreshedAt !== 'string') return null;
    return { refreshedAt: raw.refreshedAt, entries: raw.entries.map(validateCatalogEntry) };
  } catch {
    return null;
  }
}

export function saveCache(env, entries, refreshedAt) {
  const file = cachePath(env);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ version: CACHE_VERSION, refreshedAt, entries }, null, 2)}\n`,
  );
  return file;
}

/**
 * The catalog a human sees: the built-in table, overridden by any cached
 * refresh that is NEWER than the built-in data (a stale cache from before the
 * shipped catalog's asOf dates must not shadow fresher built-in numbers).
 */
export function effectiveCatalog(env, builtin = BUILTIN_CATALOG) {
  const cache = loadCache(env);
  if (!cache) return { entries: builtin, cache: null };
  const newestBuiltin = builtin.reduce((max, e) => (e.asOf > max ? e.asOf : max), '');
  if (cache.refreshedAt.slice(0, 10) < newestBuiltin) return { entries: builtin, cache: null };
  return { entries: mergeCatalogs(builtin, cache.entries), cache };
}

// --- rendering ----------------------------------------------------------------

const usd = (v) => (v === null ? '—' : `$${v.toFixed(2)}`);

export function formatTable(entries, { useColor = false } = {}) {
  const rows = entries.map((e) => [
    e.model,
    e.provider,
    usd(e.usdPerMInput),
    usd(e.usdPerMOutput),
    e.quant ?? '—',
    `${e.contextK}K`,
    e.capabilities.map((c) => CAP_ABBREV[c] ?? c).join(','),
    e.asOf,
  ]);
  const header = ['MODEL', 'PROVIDER', '$IN/1M', '$OUT/1M', 'QUANT', 'CTX', 'CAPS', 'AS-OF'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells, dim) =>
    color(useColor && dim, DIM, cells.map((c, i) => c.padEnd(widths[i])).join('  '));
  return [line(header, true), ...rows.map((r) => line(r, false))].join('\n');
}

export function formatChange(change, useColor = false) {
  const arrow =
    change.direction === 'down'
      ? color(useColor, GREEN, '↓')
      : change.direction === 'up'
        ? color(useColor, RED, '↑')
        : '+';
  const was = change.was === null ? 'unpublished' : `$${change.was}`;
  return (
    `  ${arrow} ${change.model} @ ${change.provider} ${change.field}: ` +
    `was ${was} now $${change.now} (since ${change.sinceAsOf})`
  );
}

// --- refresh: live provider model APIs ----------------------------------------

const FETCH_TIMEOUT_MS = 20_000;

async function fetchJson(url, headers, fetchImpl) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/**
 * A refreshed Together price is applied only when it is plausibly in the same
 * unit (USD per 1M tokens) as the catalog value: a >50x jump either way is
 * almost certainly a unit change in the provider API, and applying it would
 * poison the cost model. Skipped with an explicit notice instead — never fake.
 */
function plausible(oldValue, newValue) {
  if (oldValue === null || oldValue === 0) return true;
  const ratio = newValue / oldValue;
  return ratio > 1 / 50 && ratio < 50;
}

/**
 * Refresh the catalog against live provider APIs. Pure-ish and injectable
 * (fetchImpl, today) so the diff/degradation logic is unit-testable offline.
 * Returns { entries, changes, notices, refreshedProviders } — entries is the
 * full updated catalog, changes the explicit price movements.
 */
export async function refreshCatalog(entries, env, { fetchImpl = fetch, today } = {}) {
  const asOf = today ?? new Date().toISOString().slice(0, 10);
  const notices = [];
  const refreshedProviders = [];
  const updated = entries.map((e) => ({ ...e, capabilities: [...e.capabilities] }));

  // --- Together: /v1/models carries machine-readable pricing ($/1M). ---------
  if (env.TOGETHER_API_KEY) {
    try {
      const body = await fetchJson(
        `${TOGETHER_DEFAULT_BASE_URL}/models`,
        { Authorization: `Bearer ${env.TOGETHER_API_KEY}` },
        fetchImpl,
      );
      const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const byId = new Map(list.map((m) => [m.id, m]));
      let touched = 0;
      for (const e of updated) {
        if (e.provider !== 'together') continue;
        const live = byId.get(e.endpoint);
        if (!live) {
          notices.push(
            `together: ${e.endpoint} not in the live /v1/models list (dedicated-endpoint models are not listed serverless) — kept built-in data`,
          );
          continue;
        }
        const input = live.pricing?.input;
        const output = live.pricing?.output;
        if (typeof input === 'number' && typeof output === 'number' && input > 0 && output > 0) {
          if (plausible(e.usdPerMInput, input) && plausible(e.usdPerMOutput, output)) {
            e.usdPerMInput = input;
            e.usdPerMOutput = output;
            e.asOf = asOf;
            e.sourceUrl = `${TOGETHER_DEFAULT_BASE_URL}/models`;
            touched += 1;
          } else {
            notices.push(
              `together: live price for ${e.endpoint} ($${input}/$${output}) is >50x off the catalog value — looks like an API unit change; NOT applied`,
            );
          }
        } else {
          notices.push(
            `together: no pricing fields for ${e.endpoint} in /v1/models — kept built-in data`,
          );
        }
        if (typeof live.context_length === 'number' && live.context_length > 0) {
          e.contextK = Math.round(live.context_length / 1000);
        }
      }
      refreshedProviders.push('together');
      notices.push(`together: refreshed ${touched} model price(s) from the live /v1/models API`);
    } catch (err) {
      notices.push(`together: refresh failed (${err.message}) — kept built-in data`);
    }
  } else {
    notices.push(
      'together: TOGETHER_API_KEY not set — prices not refreshed (kept built-in, asOf unchanged)',
    );
  }

  // --- Fireworks: /v1/models has NO pricing fields (verified 2026-07-03) — ---
  // availability + context are machine-readable, prices are page-only.
  if (env.FIREWORKS_API_KEY) {
    try {
      const body = await fetchJson(
        `${FIREWORKS_DEFAULT_BASE_URL}/models`,
        { Authorization: `Bearer ${env.FIREWORKS_API_KEY}` },
        fetchImpl,
      );
      const byId = new Map((body?.data ?? []).map((m) => [m.id, m]));
      const seen = [];
      for (const e of updated) {
        if (e.provider !== 'fireworks') continue;
        const live = byId.get(e.endpoint);
        if (live) {
          seen.push(e.endpoint);
          if (typeof live.context_length === 'number' && live.context_length > 0) {
            e.contextK = Math.round(live.context_length / 1000);
          }
        }
      }
      refreshedProviders.push('fireworks');
      notices.push(
        `fireworks: availability confirmed live for ${seen.length} model(s)${seen.length > 0 ? ` (${seen.map((s) => s.split('/').pop()).join(', ')})` : ''}; Fireworks publishes NO machine-readable prices — price asOf unchanged, verify https://docs.fireworks.ai/serverless/pricing`,
      );
    } catch (err) {
      notices.push(`fireworks: refresh failed (${err.message}) — kept built-in data`);
    }
  } else {
    notices.push(
      'fireworks: FIREWORKS_API_KEY not set — availability not confirmed (kept built-in)',
    );
  }

  notices.push(
    'anthropic/deepinfra/mistral: no machine-readable pricing endpoint wired — ' +
      'built-in data kept (see each entry sourceUrl)',
  );

  const changes = diffCatalogs(entries, updated);
  return { entries: updated, changes, notices, refreshedProviders };
}

// --- the command ----------------------------------------------------------------

export async function cmdModels(argv, { version, env = process.env, fetchImpl = fetch }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam models: ${err.message}\nRun \`glam models --help\`.\n`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    process.stdout.write(MODELS_HELP);
    return;
  }

  const useColor = process.stdout.isTTY === true;
  const { entries: current, cache } = effectiveCatalog(env);
  let entries = current;
  let refreshResult = null;

  if (opts.refresh) {
    refreshResult = await refreshCatalog(current, env, { fetchImpl });
    if (refreshResult.refreshedProviders.length === 0) {
      process.stderr.write(
        `glam models: nothing could be refreshed — no provider API key available.\nSet FIREWORKS_API_KEY and/or TOGETHER_API_KEY in the environment, or read the\nbuilt-in catalog (asOf dates show when each price was last verified):\n${refreshResult.notices.map((n) => `  · ${n}`).join('\n')}\n`,
      );
      process.exitCode = 1;
      return;
    }
    entries = refreshResult.entries;
    const file = saveCache(env, entries, new Date().toISOString());
    refreshResult.cacheFile = file;
  }

  const visible = sortEntries(filterCapable(entries, opts.capable), opts.sort);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version,
          source: refreshResult ? 'refresh' : cache ? 'cache' : 'builtin',
          refreshedAt: refreshResult ? new Date().toISOString() : (cache?.refreshedAt ?? null),
          changes: refreshResult?.changes ?? [],
          notices: refreshResult?.notices ?? [],
          entries: visible,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const out = process.stdout;
  const sourceNote = refreshResult
    ? 'refreshed just now'
    : cache
      ? `cache refreshed ${cache.refreshedAt.slice(0, 10)}`
      : 'built-in catalog';
  out.write(
    `${color(useColor, FLAME, `glamfire ${version}`)} ${color(useColor, DIM, `· model landscape (${sourceNote}; USD per 1M tokens)`)}\n\n`,
  );
  if (visible.length === 0) {
    out.write(`no models match --capable ${opts.capable.join(',')}\n`);
    return;
  }
  out.write(`${formatTable(visible, { useColor })}\n`);

  const noted = visible.filter((e) => e.notes);
  if (noted.length > 0) {
    out.write(`\n${color(useColor, DIM, 'notes')}\n`);
    for (const e of noted) {
      out.write(`  ${e.model} @ ${e.provider}: ${color(useColor, DIM, e.notes)}\n`);
    }
  }

  if (refreshResult) {
    out.write(`\n${color(useColor, DIM, 'refresh')}\n`);
    if (refreshResult.changes.length === 0) {
      out.write('  no price changes vs the previous catalog\n');
    } else {
      for (const change of refreshResult.changes) {
        out.write(`${formatChange(change, useColor)}\n`);
      }
    }
    for (const n of refreshResult.notices) {
      out.write(`  · ${n}\n`);
    }
    out.write(`  cached -> ${refreshResult.cacheFile}\n`);
  }
}
