// `glam usage` — inspect the local, owned usage ledger (~/.glam/usage.jsonl).
//
// Fully offline: reads the ledger and the layered config, never a provider.
// Shows totals, breakdowns by day/model/provider, and monthly budget status
// (config `[usage] monthlyBudgetUsd` / `warnAtPct`).

import { ConfigError, loadConfig } from '@glamfire/config';
import { aggregate, budgetStatus, parseSince, readLedger } from './ledger.mjs';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const FLAME = '\x1b[38;5;208m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

function color(on, code, s) {
  return on ? `${code}${s}${RESET}` : s;
}

const USAGE_HELP = `glam usage — spend and token usage from the local ledger (offline).

Usage: glam usage [options]

Options:
  --since <when>   Only include runs since: YYYY-MM-DD, <N>d (days), <N>h (hours)
  --json           Emit structured JSON (totals, breakdowns, budget, records)
  -h, --help       Show this help

Every \`glam run\` appends one record to ~/.glam/usage.jsonl — your data, local,
portable, greppable. Configure budget alerts in glam.toml:

  [usage]
  monthlyBudgetUsd = 25.0   # soft monthly budget (alerting only)
  warnAtPct = 80            # warn when month-to-date spend crosses this %

No API key required; nothing leaves your machine.
`;

function parseArgs(args) {
  const opts = { json: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--since': {
        const v = args[i + 1];
        if (v === undefined) throw new Error('option --since requires a value');
        i += 1;
        opts.since = parseSince(v);
        opts.sinceRaw = v;
        break;
      }
      default:
        throw new Error(`unknown option "${a}"`);
    }
  }
  return opts;
}

function fmtUSD(n) {
  return `$${n.toFixed(n > 0 && n < 0.01 ? 6 : 4)}`;
}

function fmtTokens(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n.toLocaleString('en-US');
}

/** Render a fixed-width table: rows of [label, runs, tokens, cost]. */
function table(out, title, rows, useColor) {
  out.write(`${color(useColor, BOLD, title)}\n`);
  const label = Math.max(5, ...rows.map((r) => r.key.length));
  out.write(color(useColor, DIM, `  ${' '.repeat(label)}  runs      tokens        cost\n`));
  for (const r of rows) {
    out.write(
      `  ${r.key.padEnd(label)}  ${String(r.runs).padStart(4)}  ${fmtTokens(r.tokens).padStart(10)}  ${fmtUSD(r.costUsd).padStart(10)}\n`,
    );
  }
  out.write('\n');
}

/** A 24-cell budget bar, e.g. [██████░░░░...] 62% of $10.00. */
export function budgetBar(status, useColor = false) {
  const width = 24;
  const filled = Math.max(0, Math.min(width, Math.round((status.pct / 100) * width)));
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const code = status.level === 'over' ? RED : status.level === 'warn' ? YELLOW : DIM;
  const label =
    `${fmtUSD(status.spentUsd)} of ${fmtUSD(status.budgetUsd)} this month ` +
    `(${status.pct.toFixed(1)}%, warn at ${status.warnAtPct}%)`;
  return `${color(useColor, code, `[${bar}]`)} ${label}`;
}

export async function cmdUsage(argv, { version }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam usage: ${err.message}\nRun \`glam usage --help\`.\n`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    process.stdout.write(USAGE_HELP);
    return;
  }

  // Layered config for the budget keys. Invalid config fails loud (SPEC §6).
  let glamConfig;
  try {
    glamConfig = loadConfig({ cwd: process.cwd(), env: process.env }).config;
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`glam usage: ${err.message}\n`);
      if (err.file) process.stderr.write(`\nOffending file: ${err.file}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const { records, skipped, path } = readLedger({ since: opts.since });
  const agg = aggregate(records);
  // Budget is always month-to-date over the FULL ledger, independent of --since.
  const allRecords = opts.since === undefined ? records : readLedger({}).records;
  const budget = budgetStatus(glamConfig.usage, allRecords);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        { glamfire: version, ledger: path, skipped, ...agg, budget, records },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const out = process.stdout;
  const useColor = out.isTTY === true;
  out.write(
    `${color(useColor, FLAME, `glamfire ${version}`)} ${color(useColor, DIM, '· usage')}\n`,
  );
  out.write(color(useColor, DIM, `  ledger: ${path}\n`));
  if (opts.sinceRaw) out.write(color(useColor, DIM, `  since: ${opts.sinceRaw}\n`));
  if (skipped > 0) {
    process.stderr.write(`glam usage: warning: ${skipped} corrupt ledger line(s) skipped\n`);
  }
  out.write('\n');

  if (records.length === 0) {
    out.write('No usage recorded yet. Run `glam run "<prompt>"` and spend will appear here.\n');
    if (budget) out.write(`\nbudget: ${budgetBar(budget, useColor)}\n`);
    return;
  }

  const t = agg.totals;
  out.write(
    `${color(useColor, BOLD, 'totals')}  runs: ${t.runs}   ` +
      `tokens: in ${fmtTokens(t.inputTokens)} (cached ${fmtTokens(t.cachedInputTokens)}) · ` +
      `out ${fmtTokens(t.outputTokens)}   cost: ${fmtUSD(t.costUsd)}   ` +
      `escalations: ${t.escalations}\n\n`,
  );

  table(out, 'by day', agg.byDay, useColor);
  table(out, 'by model', agg.byModel, useColor);
  table(out, 'by provider', agg.byProvider, useColor);
  // Requests metered by the `glam serve` proxy break down by client label —
  // which agent (Claude Code, opencode, curl, …) spent what.
  if (agg.byClient.length > 0) table(out, 'by client (via glam serve)', agg.byClient, useColor);

  if (budget) {
    out.write(`budget: ${budgetBar(budget, useColor)}\n`);
    if (budget.level === 'over') {
      out.write(color(useColor, RED, 'monthly budget EXCEEDED\n'));
    } else if (budget.level === 'warn') {
      out.write(color(useColor, YELLOW, `over ${budget.warnAtPct}% of the monthly budget\n`));
    }
  } else {
    out.write(
      color(
        useColor,
        DIM,
        'no monthly budget set — add [usage] monthlyBudgetUsd to glam.toml for alerts\n',
      ),
    );
  }
}
