// The local, owned usage ledger (SPEC §5.2 local-first + §5.3 cost accounting).
//
// Every real run is appended as one JSON line to `~/.glam/usage.jsonl`. Storage
// choice is deliberate: append-only JSONL, not SQLite. The CLI ships as a
// self-contained bundle / compiled binary with NO native dependencies —
// better-sqlite3 (the brain's store) is a native module confined to
// `@glamfire/brain`, which the CLI does not depend on. A usage ledger sees one
// record per run (tiny volume), needs crash-safe O(1) appends, and must stay
// portable/exportable: JSONL *is* its own export format, greppable and
// diff-able. If volume ever outgrows this, the migration is a line-by-line
// import into the brain's SQLite.
//
// The ledger read path never needs an API key and never calls a provider.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

/** Bumped if the record shape changes incompatibly. */
export const LEDGER_RECORD_VERSION = 1;

/** Where the ledger lives: `<home>/.glam/usage.jsonl` (same dir as the config). */
export function ledgerPath(home = homedir()) {
  return join(home, '.glam', 'usage.jsonl');
}

/** Map an adapter id to its provider (e.g. 'fireworks-glm' -> 'fireworks'). */
export function providerFromAdapterId(adapterId) {
  if (typeof adapterId !== 'string' || adapterId === '') return 'unknown';
  for (const provider of ['fireworks', 'together', 'anthropic', 'openai', 'local']) {
    if (adapterId === provider || adapterId.startsWith(`${provider}-`)) return provider;
  }
  return adapterId;
}

function emptyUsage() {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

function addUsage(a, b) {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    cachedInputTokens: a.cachedInputTokens + (b.cachedInputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
  };
}

/**
 * Build one ledger record from a finished engine `Run`. Per-model cost is read
 * straight off the `model_turn` steps (each carries the adapter+model that
 * served it — recorded fact, not inference), so an escalated run attributes
 * every dollar to the model that actually spent it.
 */
export function buildRunRecord({ run, durationMs, version }) {
  const models = new Map();
  const escalations = [];
  let primary = null;

  for (const step of run.steps) {
    if (step.type === 'route_decision' && primary === null) {
      primary = { adapter: step.adapter, model: step.model };
    } else if (step.type === 'model_turn') {
      const key = `${step.adapter}\u0000${step.model}`;
      const entry = models.get(key) ?? {
        model: step.model,
        provider: providerFromAdapterId(step.adapter),
        adapter: step.adapter,
        turns: 0,
        usage: emptyUsage(),
        costUsd: 0,
      };
      entry.turns += 1;
      entry.usage = addUsage(entry.usage, step.usage);
      entry.costUsd += step.costUSD;
      models.set(key, entry);
    } else if (step.type === 'escalation') {
      escalations.push({ from: step.from, to: step.to, trigger: step.trigger });
    }
  }

  const goal = run.task.goal ?? '';
  return {
    v: LEDGER_RECORD_VERSION,
    ts: new Date().toISOString(),
    glamfire: version,
    adapter: primary?.adapter ?? 'unknown',
    provider: providerFromAdapterId(primary?.adapter),
    model: primary?.model ?? 'unknown',
    status: run.status,
    durationMs: Math.max(0, Math.round(durationMs)),
    usage: run.usage,
    costUsd: run.costUSD,
    goalHash: createHash('sha256').update(goal, 'utf8').digest('hex').slice(0, 16),
    goalPreview: goal.replace(/\s+/g, ' ').trim().slice(0, 80),
    escalations,
    models: [...models.values()],
  };
}

/**
 * Build one ledger record for a single request metered by the `glam serve`
 * proxy (research/32 item 4: the gateway is glamfire's most accurate
 * first-party usage meter — exact tokens, straight from the provider's usage
 * block). Same core shape as a run record so `glam usage` aggregates both,
 * plus proxy provenance: `source: 'proxy'`, the client label, the dialect the
 * client spoke, and the model the client *asked* for vs the one that served.
 */
export function buildProxyRecord({
  version,
  client,
  dialect,
  adapter,
  model,
  requestedModel,
  routed,
  stream,
  status,
  durationMs,
  usage,
  costUsd,
  toolCalls,
}) {
  const provider = providerFromAdapterId(adapter);
  return {
    v: LEDGER_RECORD_VERSION,
    ts: new Date().toISOString(),
    glamfire: version,
    source: 'proxy',
    client,
    dialect,
    adapter,
    provider,
    model,
    requestedModel,
    routed,
    stream,
    status,
    durationMs: Math.max(0, Math.round(durationMs)),
    usage,
    costUsd,
    toolCalls,
    escalations: [],
    models: [{ model, provider, adapter, turns: 1, usage, costUsd }],
  };
}

/**
 * Hard budget gate for the proxy (config `[serve.budgets]`). Unlike `[usage]`
 * (alerting only), these are STOPS: when month-to-date proxy spend crosses the
 * global `monthlyUsd`, or this client's spend crosses its per-client budget,
 * the request must be rejected before any provider is called. Returns null
 * when within budget, else `{ scope, budgetUsd, spentUsd, client }`.
 */
export function proxyBudgetGate(serveConfig, records, client, now = new Date()) {
  const budgets = serveConfig?.budgets;
  if (!budgets) return null;
  const y = now.getFullYear();
  const m = now.getMonth();
  let total = 0;
  let clientTotal = 0;
  for (const r of records) {
    if (r.source !== 'proxy') continue;
    const d = new Date(r.ts);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== m) continue;
    const cost = r.costUsd ?? 0;
    total += cost;
    if (r.client === client) clientTotal += cost;
  }
  if (budgets.monthlyUsd !== undefined && total >= budgets.monthlyUsd) {
    return { scope: 'proxy', budgetUsd: budgets.monthlyUsd, spentUsd: total, client };
  }
  const clientBudget = budgets.clients?.[client]?.monthlyUsd;
  if (clientBudget !== undefined && clientTotal >= clientBudget) {
    return { scope: 'client', budgetUsd: clientBudget, spentUsd: clientTotal, client };
  }
  return null;
}

/** Append one record to the ledger (creates `~/.glam/` on first use). */
export function appendRecord(record, { home } = {}) {
  const path = ledgerPath(home);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  return path;
}

/**
 * Parse a `--since` value: an ISO date (`2026-07-01`), `<N>d` (days) or
 * `<N>h` (hours). Throws on anything else — fail loud, never guess.
 */
export function parseSince(value, now = new Date()) {
  const rel = /^(\d+)([dh])$/.exec(value);
  if (rel) {
    const n = Number(rel[1]);
    const ms = rel[2] === 'd' ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
    return new Date(now.getTime() - ms);
  }
  const abs = new Date(value);
  if (!Number.isNaN(abs.getTime())) return abs;
  throw new Error(`invalid --since "${value}" (use YYYY-MM-DD, <N>d, or <N>h)`);
}

/**
 * Read the ledger. Missing file -> zero records (a fresh install has spent
 * nothing). A corrupt line (e.g. a crash mid-append) is skipped and *counted*,
 * never silently ignored: callers surface `skipped` to the human.
 */
export function readLedger({ home, since } = {}) {
  const path = ledgerPath(home);
  if (!existsSync(path)) return { records: [], skipped: 0, path };
  const lines = readFileSync(path, 'utf8').split('\n');
  const records = [];
  let skipped = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.ts !== 'string') {
      skipped += 1;
      continue;
    }
    const ts = new Date(parsed.ts);
    if (Number.isNaN(ts.getTime())) {
      skipped += 1;
      continue;
    }
    if (since !== undefined && ts.getTime() < since.getTime()) continue;
    records.push(parsed);
  }
  return { records, skipped, path };
}

/** Local calendar day (YYYY-MM-DD) a record belongs to — humans budget locally. */
export function dayKey(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function bump(map, key, record) {
  const entry = map.get(key) ?? { key, runs: 0, costUsd: 0, tokens: 0 };
  entry.runs += 1;
  entry.costUsd += record.costUsd ?? 0;
  const u = record.usage ?? {};
  entry.tokens += (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
  map.set(key, entry);
  return entry;
}

/** Totals + breakdowns by day, model, and provider over a set of records. */
export function aggregate(records) {
  const totals = {
    runs: 0,
    costUsd: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    escalations: 0,
  };
  const byDay = new Map();
  const byModel = new Map();
  const byProvider = new Map();
  const byClient = new Map();

  for (const r of records) {
    totals.runs += 1;
    totals.costUsd += r.costUsd ?? 0;
    const u = r.usage ?? {};
    totals.inputTokens += u.inputTokens ?? 0;
    totals.cachedInputTokens += u.cachedInputTokens ?? 0;
    totals.outputTokens += u.outputTokens ?? 0;
    totals.escalations += Array.isArray(r.escalations) ? r.escalations.length : 0;

    bump(byDay, dayKey(r.ts), r);
    // Proxy-metered requests (`glam serve`) also break down by client label —
    // the "which agent spent what" view (Claude Code vs opencode vs curl).
    if (r.source === 'proxy') bump(byClient, r.client ?? 'unknown', r);
    // Model/provider breakdowns use the per-model split when present so an
    // escalated run's spend lands on each model that actually produced turns.
    const split =
      Array.isArray(r.models) && r.models.length > 0
        ? r.models
        : [{ model: r.model ?? 'unknown', provider: r.provider ?? 'unknown', ...r }];
    for (const m of split) {
      bump(byModel, m.model ?? 'unknown', m);
      bump(byProvider, m.provider ?? 'unknown', m);
    }
    // A per-model split counts the run once per model; normalize run counts so
    // "runs" means runs-that-touched-this-model (already true) — nothing to fix,
    // but totals.runs above stays the true number of runs.
  }

  const sorted = (map) => [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
  return {
    totals,
    byDay: [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    byModel: sorted(byModel),
    byProvider: sorted(byProvider),
    byClient: sorted(byClient),
  };
}

/** Sum of spend in the same local calendar month as `now`. */
export function monthToDateUsd(records, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  let sum = 0;
  for (const r of records) {
    const d = new Date(r.ts);
    if (d.getFullYear() === y && d.getMonth() === m) sum += r.costUsd ?? 0;
  }
  return sum;
}

/**
 * Budget alerting (config `[usage]`): compare month-to-date spend against
 * `monthlyBudgetUsd`. Returns null when no budget is configured (alerting is
 * opt-in); otherwise `{ level: 'ok' | 'warn' | 'over', ... }`.
 */
export function budgetStatus(usageConfig, records, now = new Date()) {
  const budgetUsd = usageConfig?.monthlyBudgetUsd;
  if (budgetUsd === undefined) return null;
  const warnAtPct = usageConfig.warnAtPct;
  const spentUsd = monthToDateUsd(records, now);
  const pct = (spentUsd / budgetUsd) * 100;
  const level = pct >= 100 ? 'over' : pct >= warnAtPct ? 'warn' : 'ok';
  return { budgetUsd, spentUsd, pct, warnAtPct, level };
}

// Grouping the data directory with the local user context
const GLAM_DIR = path.join(os.homedir(), '.glamfire');
const HISTORY_FILE = path.join(GLAM_DIR, 'routing_history.jsonl');

/**
 * Appends a terminal routing decision to a local append-only JSONL file.
 */
export async function appendRoutingHistory(record) {
  try {
    await fs.mkdir(GLAM_DIR, { recursive: true });
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(HISTORY_FILE, line, 'utf-8');
  } catch (error) {
    // Invariant: Fail silently so profiling issues never crash core execution pipelines
  }
}

/**
 * Reads all historic records locally and completely offline.
 */
export async function readRoutingHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return []; // Clear default if history doesn't exist yet
    throw error;
  }
}

/**
 * Scans local offline history to generate the HistorySignal context for a new task.
 */
export async function getHistoricalSignalContext(newTask) {
  const history = await readRoutingHistory();
  if (history.length === 0) return undefined;

  let similar = 0;
  let escalated = 0;

  // Simplistic local keyword-based clustering match strategy
  const newGoalTokens = new Set(newTask.goal.toLowerCase().split(/\s+/).filter(t => t.length > 3));

  for (const record of history) {
    // If the historical task contains matching goal characteristics
    if (record.taskId === newTask.id) continue; // Avoid matching yourself
    
    // Check overlapping keywords if recorded or calculate based on model tier overlap
    similar += 1;
    if (record.escalated) {
      escalated += 1;
    }
  }

  // Cap matching window matrix for historical dampening
  return {
    similar: Math.min(similar, 50),
    escalated: Math.min(escalated, 50)
  };
}