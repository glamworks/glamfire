// `glam route "<prompt>"` — the offline routing dry-run (SPEC §5.3).
//
// Classifies a prompt (center vs edge + confidence), resolves the declarative
// routing policy to a chosen model, and prints the decision plus a distribution
// report — all WITHOUT calling any provider. Fully verifiable with no API key,
// so a human can inspect exactly how a task would be routed and why.

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ConfigError, loadConfig } from '@glamfire/config';
import { PolicyError, explainDecision, formatReport } from '@glamfire/router';
import { buildModelRegistry, buildRouter } from './router.mjs';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const FLAME = '\x1b[38;5;208m';

function color(on, code, s) {
  return on ? `${code}${s}${RESET}` : s;
}

const ROUTE_HELP = `glam route — show how a task would be routed (offline, no provider call).

Usage: glam route "<task prompt>" [options]

Classifies the prompt center vs edge, resolves the declarative routing policy to
the cheapest capable model, and prints the decision + a distribution report.
Needs no API key — nothing is sent to any provider.

Options:
  --file <path>          Add a file's contents as task input (repeatable)
  --output-tokens <n>    Assumed completion length for cost projection (default 600)
  --json                 Print the structured decision + report as JSON
  -h, --help             Show this help
`;

function parseArgs(args) {
  const opts = { files: [], json: false };
  const positional = [];
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
      case '--file':
        opts.files.push(next());
        break;
      case '--output-tokens':
        opts.outputTokens = Number(next());
        break;
      case '--json':
        opts.json = true;
        break;
      default:
        if (a.startsWith('--')) throw new Error(`unknown option "${a}"`);
        positional.push(a);
    }
  }
  opts.goal = positional.join(' ').trim();
  return opts;
}

export async function cmdRoute(argv, { version }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam route: ${err.message}\nRun \`glam route --help\`.\n`);
    process.exitCode = 2;
    return;
  }

  if (opts.help) {
    process.stdout.write(ROUTE_HELP);
    return;
  }
  if (!opts.goal) {
    process.stderr.write('glam route: a task prompt is required.\nRun `glam route --help`.\n');
    process.exitCode = 2;
    return;
  }

  const useColor = process.stdout.isTTY === true;

  let loaded;
  try {
    loaded = loadConfig({ cwd: process.cwd(), env: process.env });
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`glam route: ${err.message}\n`);
      if (err.file) process.stderr.write(`\nOffending file: ${err.file}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`glam route: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  // Gather file inputs (they feed the classifier's length/code signals).
  const inputs = {};
  for (const f of opts.files) {
    try {
      inputs[basename(f)] = readFileSync(resolve(f), 'utf8');
    } catch (err) {
      process.stderr.write(`glam route: cannot read --file ${f}: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
  }

  const task = { goal: opts.goal, budget: {} };
  if (Object.keys(inputs).length > 0) task.inputs = inputs;

  let registry;
  let router;
  let decision;
  try {
    registry = buildModelRegistry(loaded.config, process.env, { allowDryRunKey: true });
    const routerOpts = {};
    if (opts.outputTokens !== undefined && Number.isFinite(opts.outputTokens)) {
      routerOpts.outputTokens = opts.outputTokens;
    }
    router = buildRouter(loaded.config, registry, routerOpts);
    // select() resolves the decision AND records it in the distribution report.
    router.select(task);
    decision = router.lastRouteDecision();
  } catch (err) {
    if (err instanceof PolicyError) {
      process.stderr.write(`glam route: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`glam route: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const report = router.report();

  if (opts.json) {
    const c = decision.classification;
    const s = decision.selection;
    process.stdout.write(
      `${JSON.stringify(
        {
          classification: {
            distribution: c.distribution,
            score: c.score,
            confidence: c.confidence,
            threshold: c.threshold,
            contributions: c.contributions,
          },
          chosen: s.chosen.id,
          ruleIndex: s.ruleIndex,
          reason: s.reason,
          cascade: s.cascade.map((d) => d.id),
          projectedUsd: s.projectedUsd,
          baselineUsd: decision.baselineUsd,
          report,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const out = process.stdout;
  out.write(
    `${color(useColor, FLAME, `glamfire ${version}`)} ${color(useColor, DIM, '· route (dry-run, no provider call)')}\n`,
  );
  out.write(`  task: ${opts.goal}\n\n`);
  out.write(`${explainDecision(decision)}\n\n`);
  out.write(`${formatReport(report)}\n`);
}
