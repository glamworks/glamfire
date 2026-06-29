// `glam run` — drive the open engine against a real Fireworks/GLM-5.2 call.
//
// Loads provider config, selects the fireworks-glm adapter with the default GLM
// model, runs the plan->act->observe loop, streams the model output, dispatches
// tool calls through the permission gate, and prints a run header (version +
// active adapter/model, SPEC §9) plus a final token/cost summary.

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createFireworksGlmAdapter, resolveFireworksConfig } from '@glamfire/adapters';
import { ConfigError, loadConfig } from '@glamfire/config';
import { builtinTools, defaultPolicy, runTask } from '@glamfire/engine';
import { PolicyError, explainDecision } from '@glamfire/router';
import { buildModelRegistry, buildRouter } from './router.mjs';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const FLAME = '\x1b[38;5;208m';

function color(on, code, s) {
  return on ? `${code}${s}${RESET}` : s;
}

const RUN_HELP = `glam run — run a task against GLM 5.2 on Fireworks.

Usage: glam run "<task prompt>" [options]

Options:
  --file <path>          Add a file's contents as task input (repeatable)
  --model <id>           Override the model id (default: GLM 5.2 on Fireworks)
  --effort <high|max>    GLM reasoning effort (default: high)
  --tier <tier>          Fireworks service tier: standard|priority|fast|background
  --temperature <n>      Sampling temperature (default: 0.2)
  --max-usd <n>          Hard cost ceiling in USD (default: 0.50)
  --max-tokens <n>       Hard token ceiling
  --max-steps <n>        Max plan->act->observe iterations (default: 8)
  --no-stream            Use a single non-streaming completion
  --show-thinking        Stream the model's reasoning tokens (dimmed)
  --explain              Print the routing decision (distribution, confidence, why)
  --yes                  Auto-approve "ask" tool permissions (else denied)
  --allow-exec           Enable the run_command tool (exec, denied by default).
                         Still requires approval: pair with --yes to run commands.
  --json                 Print the full structured step log as JSON at the end
  -h, --help             Show this help

The model is chosen by the cost-aware router from your routing policy (center work
defaults to GLM 5.2 on Fireworks). Passing --model bypasses routing for that run.
See \`glam route "<prompt>"\` for an offline routing preview.

Requires FIREWORKS_API_KEY. Run \`glam doctor\` to check your environment.
`;

function parseArgs(args) {
  const opts = {
    files: [],
    stream: true,
    showThinking: false,
    explain: false,
    yes: false,
    allowExec: false,
    json: false,
  };
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
      case '--model':
        opts.model = next();
        break;
      case '--effort':
        opts.effort = next();
        break;
      case '--tier':
        opts.tier = next();
        break;
      case '--temperature':
        opts.temperature = Number(next());
        break;
      case '--max-usd':
        opts.maxUSD = Number(next());
        break;
      case '--max-tokens':
        opts.maxTokens = Number(next());
        break;
      case '--max-steps':
        opts.maxSteps = Number(next());
        break;
      case '--no-stream':
        opts.stream = false;
        break;
      case '--show-thinking':
        opts.showThinking = true;
        break;
      case '--explain':
      case '--route':
        opts.explain = true;
        break;
      case '--yes':
        opts.yes = true;
        break;
      case '--allow-exec':
        opts.allowExec = true;
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

function fmtUSD(n) {
  return `$${n.toFixed(n < 0.01 ? 6 : 4)}`;
}

export async function cmdRun(argv, { version }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam run: ${err.message}\nRun \`glam run --help\`.\n`);
    process.exitCode = 2;
    return;
  }

  if (opts.help) {
    process.stdout.write(RUN_HELP);
    return;
  }
  if (!opts.goal) {
    process.stderr.write('glam run: a task prompt is required.\nRun `glam run --help`.\n');
    process.exitCode = 2;
    return;
  }

  const useColor = process.stdout.isTTY === true;

  // Load the layered config (defaults < ~/.glam/config.toml < ./glam.toml < env),
  // then resolve the Fireworks provider slice through it. CLI flags (overrides)
  // win over env, which wins over the config files (SPEC §6 precedence).
  let config;
  let glamConfig;
  try {
    const loaded = loadConfig({ cwd: process.cwd(), env: process.env });
    glamConfig = loaded.config;
    const overrides = {};
    if (opts.model !== undefined) overrides.model = opts.model;
    if (opts.effort !== undefined) overrides.reasoningEffort = opts.effort;
    if (opts.tier !== undefined) overrides.serviceTier = opts.tier;
    if (opts.temperature !== undefined) overrides.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) overrides.maxTokens = opts.maxTokens;
    config = resolveFireworksConfig(process.env, overrides, { config: loaded.config });
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`glam run: ${err.message}\n`);
      if (err.file) process.stderr.write(`\nOffending file: ${err.file}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`glam run: ${err.message}\n`);
    if (!process.env.FIREWORKS_API_KEY) {
      process.stderr.write(
        '\nSet FIREWORKS_API_KEY to call GLM 5.2 on Fireworks, then retry.\n' +
          'Get a key at https://fireworks.ai and run `glam doctor` to verify.\n',
      );
    }
    process.exitCode = 1;
    return;
  }

  // Gather inputs from files (scoped read by the user, before the run).
  const inputs = {};
  for (const f of opts.files) {
    try {
      inputs[basename(f)] = readFileSync(resolve(f), 'utf8');
    } catch (err) {
      process.stderr.write(`glam run: cannot read --file ${f}: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
  }

  const budget = { maxSteps: opts.maxSteps ?? 8, maxUSD: opts.maxUSD ?? 0.5 };
  if (opts.maxTokens !== undefined) budget.maxTokens = opts.maxTokens;

  const task = { goal: opts.goal, budget };
  if (Object.keys(inputs).length > 0) task.inputs = inputs;

  const adapter = createFireworksGlmAdapter(config);
  const runtimeConfig = {
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    serviceTier: config.serviceTier,
    temperature: config.temperature,
  };
  if (config.maxTokens !== undefined) runtimeConfig.maxTokens = config.maxTokens;
  if (config.seed !== undefined) runtimeConfig.seed = config.seed;

  // Least-privilege by default: writes ask (denied without --yes) and exec is
  // denied outright. --allow-exec promotes ONLY run_command from deny to ask, so
  // it still needs an approval (--yes) to actually run a command. The gate, not
  // the model, makes every one of these decisions.
  const policyOverrides = {};
  if (opts.yes) policyOverrides.asker = () => true;
  if (opts.allowExec) policyOverrides.toolOverrides = { run_command: 'ask' };
  const policy = defaultPolicy(policyOverrides);

  // --- cost-aware routing (SPEC §5.3) ---
  // An explicit --model override bypasses routing for that run (the user asked
  // for a specific model); otherwise the router selects from the routing policy
  // and may escalate to a stronger model on a failed verification.
  const out = process.stdout;
  let router;
  let decision;
  if (opts.model === undefined) {
    try {
      const registry = buildModelRegistry(glamConfig, process.env);
      router = buildRouter(glamConfig, registry);
      decision = router.decide(task); // pure preview for the header/--explain
    } catch (err) {
      if (err instanceof PolicyError) {
        process.stderr.write(`glam run: ${err.message}\n`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  }

  // --- run header (SPEC §9) ---
  out.write(`${color(useColor, FLAME, `glamfire ${version}`)} ${color(useColor, DIM, '· run')}\n`);
  const chosenModel = decision ? decision.selection.chosen.id : config.model;
  out.write(`  adapter: ${adapter.id}   model: ${chosenModel}\n`);
  if (decision) {
    const c = decision.classification;
    out.write(
      color(
        useColor,
        DIM,
        `  routing: ${c.distribution} (score ${c.score.toFixed(2)}, confidence ${c.confidence.toFixed(2)}) → ${chosenModel}\n`,
      ),
    );
  } else {
    out.write(color(useColor, DIM, '  routing: explicit --model override (router bypassed)\n'));
  }
  out.write(
    `  effort: ${config.reasoningEffort}   tier: ${config.serviceTier}   ` +
      `budget: ${fmtUSD(budget.maxUSD)} / ${budget.maxSteps} steps\n\n`,
  );

  if (opts.explain && decision) {
    out.write(`${color(useColor, DIM, explainDecision(decision))}\n\n`);
  }

  let streamedTextThisTurn = false;
  const onToken = (ev) => {
    if (ev.kind === 'text') {
      out.write(ev.delta);
      streamedTextThisTurn = true;
    } else if (ev.kind === 'reasoning' && opts.showThinking) {
      process.stderr.write(color(useColor, DIM, ev.delta));
    }
  };

  const onStep = (step) => {
    if (step.type === 'model_turn') {
      // Non-streaming path doesn't fire onToken; print the text here.
      if (!opts.stream && step.text) out.write(step.text);
      if (streamedTextThisTurn || step.text) out.write('\n');
      streamedTextThisTurn = false;
    } else if (step.type === 'tool_call') {
      const args = JSON.stringify(step.arguments);
      out.write(color(useColor, DIM, `  → ${step.name}(${args})  [${step.permission}]\n`));
    } else if (step.type === 'tool_result') {
      const status = step.ok ? 'ok' : 'error';
      let detail = '';
      if (step.ok && step.result && typeof step.result === 'object' && 'bytes' in step.result) {
        detail = ` (${step.result.bytes} bytes)`;
      } else if (!step.ok) {
        detail = ` — ${String(step.result).slice(0, 120)}`;
      }
      out.write(color(useColor, DIM, `  ← ${step.name} ${status}${detail}\n`));
    }
  };

  let run;
  try {
    run = await runTask({
      task,
      adapter,
      tools: builtinTools(),
      config: runtimeConfig,
      cwd: process.cwd(),
      policy,
      stream: opts.stream,
      onStep,
      onToken,
      // The router (when not bypassed by --model) selects the model and drives
      // verification/escalation; the engine still owns the loop + budget.
      ...(router ? { router } : {}),
    });
  } catch (err) {
    process.stderr.write(`\nglam run: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  // --- final summary ---
  const u = run.usage;
  const total = u.inputTokens + u.outputTokens;
  out.write(`\n${color(useColor, DIM, '──')}\n`);
  if (run.status === 'budget_exhausted') {
    out.write(color(useColor, BOLD, 'stopped: budget/step ceiling reached\n'));
  } else if (run.status === 'error') {
    out.write(color(useColor, BOLD, 'stopped: engine error\n'));
  }
  out.write(
    `tokens: in ${u.inputTokens} (cached ${u.cachedInputTokens}) · out ${u.outputTokens} ` +
      `(${total} total)   cost: ${fmtUSD(run.costUSD)}   ` +
      `steps: ${run.steps.length}   status: ${run.status}\n`,
  );

  if (opts.json) {
    out.write(
      `${JSON.stringify({ status: run.status, usage: run.usage, costUSD: run.costUSD, steps: run.steps }, null, 2)}\n`,
    );
  }

  process.exitCode = run.status === 'error' ? 1 : 0;
}
