// `glam run` — drive the open engine against a real Fireworks/GLM-5.2 call.
//
// Loads provider config, selects the fireworks-glm adapter with the default GLM
// model, runs the plan->act->observe loop, streams the model output, dispatches
// tool calls through the permission gate, and prints a run header (version +
// serving provider/model family, SPEC §9) plus a final token/cost summary.

import { readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import {
  catalogEntry,
  createFireworksGlmAdapter,
  createLocalAdapter,
  resolveFireworksConfig,
  resolveLocalConfig,
} from '@glamfire/adapters';
import { ConfigError, loadConfig } from '@glamfire/config';
import { DEFAULT_SYSTEM, builtinTools, defaultPolicy, runTask } from '@glamfire/engine';
import { PolicyError, explainDecision } from '@glamfire/router';
import {
  appendRecord,
  budgetStatus,
  buildRunRecord,
  providerFromAdapterId,
  readLedger,
} from './ledger.mjs';
import { brainStorePath, buildEpisode, composeSystem, openBrain, packRecall } from './memory.mjs';
import { buildModelRegistry, buildRouter, isLocalModel } from './router.mjs';
import { CODES, color, useColor } from './ui.mjs';
import { getHistoricalSignalContext, appendRoutingHistory } from './ledger.mjs';

const { DIM, BOLD, FLAME, YELLOW } = CODES;

const RUN_HELP = `glam run — run a task against GLM 5.2 on Fireworks.

Usage: glam run "<task prompt>" [options]

Options:
  --file <path>          Add a file's contents as task input (repeatable)
  --model <id>           Override the model id (default: GLM 5.2 on Fireworks).
                         A model listed under providers.local.models runs
                         against your own OpenAI-compatible server (Ollama,
                         vLLM, LM Studio, DwarfStar/DS4) at $0/token.
  --local                Route ONLY to self-host models from providers.local
                         (privacy/offline mode). Fails loud — never silently
                         falls back to a hosted provider.
  --effort <high|max>    GLM reasoning effort (default: high)
  --tier <tier>          Fireworks service tier: standard|priority|fast|background
  --temperature <n>      Sampling temperature (default: 0.2)
  --max-usd <n>          Hard cost ceiling in USD (default: 0.50)
  --max-tokens <n>       Hard token ceiling
  --max-steps <n>        Max plan->act->observe iterations (default: 8)
  --no-stream            Use a single non-streaming completion
  --no-memory            Skip brain recall + episode capture for this run
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

Memory is in the loop (SPEC §5.2): each run recalls relevant records from the
project's local brain store (.glam/brain.db — offline hybrid retrieval, hard
token cap, full provenance) and writes a structured episode back afterward so
future runs remember. The run header shows what was recalled. Disable with
--no-memory, \`[memory] enabled = false\` in glam.toml, or GLAM_MEMORY=false.

Exit codes (stable — safe to script against):
  0    done          the task finished within its ceilings
  1    error         provider/engine error
  2    usage error   bad flags or a missing prompt
  3    budget stop   a --max-usd / --max-tokens / --max-steps ceiling was reached
  130  interrupted   stopped by Ctrl-C (128 + SIGINT)

Requires FIREWORKS_API_KEY. Run \`glam doctor\` to check your environment.
`;

function parseArgs(args) {
  const opts = {
    files: [],
    stream: true,
    memory: true,
    showThinking: false,
    explain: false,
    yes: false,
    allowExec: false,
    json: false,
    local: false,
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
    // A numeric option value must actually be a number — a silent NaN here
    // would disable the budget ceiling, which is never acceptable.
    const nextNumber = () => {
      const raw = next();
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`option ${a} expects a number, got "${raw}"`);
      return n;
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
        opts.temperature = nextNumber();
        break;
      case '--max-usd':
        opts.maxUSD = nextNumber();
        break;
      case '--max-tokens':
        opts.maxTokens = nextNumber();
        break;
      case '--max-steps':
        opts.maxSteps = nextNumber();
        break;
      case '--no-stream':
        opts.stream = false;
        break;
      case '--no-memory':
        opts.memory = false;
        break;
      case '--local':
        opts.local = true;
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
        // Reject ANY unknown flag (single- or double-dash) instead of silently
        // folding it into the prompt text.
        if (a.startsWith('-') && a !== '-') throw new Error(`unknown option "${a}"`);
        positional.push(a);
    }
  }
  opts.goal = positional.join(' ').trim();
  return opts;
}

function fmtUSD(n) {
  return `$${n.toFixed(n < 0.01 ? 6 : 4)}`;
}

/**
 * The documented, stable exit-code scheme for `glam run` (issue #23):
 *   0 done · 1 error · 2 usage error · 3 budget/step ceiling · 130 interrupted.
 * A budget stop must be distinguishable from `done` by scripts/CI — a run that
 * hit its ceiling is NOT a success exit.
 */
export function exitCodeForStatus(status) {
  switch (status) {
    case 'error':
      return 1;
    case 'budget_exhausted':
      return 3;
    case 'interrupted':
      return 130; // 128 + SIGINT, the unix convention
    default:
      return 0; // done
  }
}

/**
 * The run-header provider/model line (issue #24): show the provider actually
 * serving the model and the model family from the catalog — never the shared
 * adapter's internal id (a DeepSeek run must not read "fireworks-glm").
 */
export function providerModelHeader(adapter, modelId) {
  const provider = adapter?.provider ?? providerFromAdapterId(adapter?.id);
  const family = catalogEntry(provider, modelId)?.model;
  const model = family && family !== modelId ? `${family} (${modelId})` : modelId;
  return `  provider: ${provider}   model: ${model}\n`;
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

  const useColorOut = useColor(process.stdout);

  // Load the layered config (defaults < ~/.glam/config.toml < ./glam.toml < env),
  // then resolve the relevant provider slice through it. CLI flags (overrides)
  // win over env, which wins over the config files (SPEC §6 precedence).
  //
  // Self-host paths (a --model listed under providers.local.models, or --local /
  // routing.localOnly) resolve the LOCAL provider slice and require NO hosted
  // API key — a fully local run works on a laptop with no key at all.
  let config; // Fireworks slice (hosted paths)
  let localConfig; // local slice (self-host paths)
  let glamConfig;
  let configSources;
  let localOnly = false;
  let hostedResolution = false;
  try {
    const loaded = loadConfig({ cwd: process.cwd(), env: process.env });
    glamConfig = loaded.config;
    configSources = loaded.sources;
    localOnly = opts.local || glamConfig.routing.localOnly;
    const localDirect = opts.model !== undefined && isLocalModel(glamConfig, opts.model);
    // --local promises "nothing leaves this machine" — a hosted --model
    // alongside it is a contradiction we refuse loudly, never silently ignore.
    if (opts.local && opts.model !== undefined && !localDirect) {
      process.stderr.write(
        `glam run: --local conflicts with --model "${opts.model}": that model is not listed under providers.local.models. Drop --local, or use a local model id.\n`,
      );
      process.exitCode = 2;
      return;
    }
    if (localDirect || (localOnly && opts.model === undefined)) {
      const overrides = {};
      if (opts.model !== undefined) overrides.model = opts.model;
      if (opts.temperature !== undefined) overrides.temperature = opts.temperature;
      if (opts.maxTokens !== undefined) overrides.maxTokens = opts.maxTokens;
      localConfig = resolveLocalConfig(process.env, overrides, { config: glamConfig });
    } else {
      hostedResolution = true;
      const overrides = {};
      if (opts.model !== undefined) overrides.model = opts.model;
      if (opts.effort !== undefined) overrides.reasoningEffort = opts.effort;
      if (opts.tier !== undefined) overrides.serviceTier = opts.tier;
      if (opts.temperature !== undefined) overrides.temperature = opts.temperature;
      if (opts.maxTokens !== undefined) overrides.maxTokens = opts.maxTokens;
      config = resolveFireworksConfig(process.env, overrides, { config: loaded.config });
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`glam run: ${err.message}\n`);
      if (err.file) process.stderr.write(`\nOffending file: ${err.file}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`glam run: ${err.message}\n`);
    if (hostedResolution && !process.env.FIREWORKS_API_KEY) {
      process.stderr.write(
        '\nSet FIREWORKS_API_KEY to call GLM 5.2 on Fireworks, then retry.\n' +
          'Get a key at https://fireworks.ai and run `glam doctor` to verify.\n' +
          'Or run fully local: list your served model under providers.local.models\n' +
          'and pass --model <that id> (or --local). No API key needed.\n',
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

  // --- memory in the loop: retrieval BEFORE the run (SPEC §5.2, issue #27) ----
  // Query the project's brain with the task and pack the top hits (hard token
  // cap, provenance + record ids) into the system context. Project-scoped store
  // by default; an empty store recalls zero — honest, never an error. The brain
  // stays open so the episode is written back after the run.
  const memCfg = glamConfig.memory;
  const mem = {
    enabled: opts.memory && memCfg.enabled,
    off: !opts.memory ? '--no-memory' : !memCfg.enabled ? 'config' : null,
    brain: null,
    store: null,
    totalRecords: 0,
    recalled: 0,
    recallTokens: 0,
    block: '',
    episodeId: null,
  };
  if (mem.enabled) {
    mem.store = brainStorePath({
      memory: memCfg,
      projectConfigPath: configSources.project,
      cwd: process.cwd(),
    });
    try {
      const opened = await openBrain(mem.store);
      if (opened.available) {
        mem.brain = opened.brain;
        mem.totalRecords = opened.brain.count();
        if (mem.totalRecords > 0) {
          const result = await opened.brain.query(opts.goal, {
            limit: memCfg.recallLimit,
            tokenBudget: memCfg.recallTokenBudget,
          });
          const packed = packRecall(result.results, { tokenBudget: memCfg.recallTokenBudget });
          mem.block = packed.block;
          mem.recalled = packed.packed.length;
          mem.recallTokens = packed.usedTokens;
        }
      } else {
        mem.enabled = false;
        mem.off = 'unavailable';
        mem.unavailableReason = opened.reason;
      }
    } catch (err) {
      // A broken store must not make runs impossible — but it is reported
      // loudly, never swallowed, and nothing is recalled or written.
      mem.enabled = false;
      mem.off = 'error';
      mem.unavailableReason = err.message;
      process.stderr.write(`glam run: warning: memory unavailable: ${err.message}\n`);
      mem.brain = null;
    }
  }
  const system = composeSystem(DEFAULT_SYSTEM, mem.block);

  let adapter;
  let runtimeConfig;
  if (localConfig !== undefined) {
    adapter = createLocalAdapter(localConfig);
    runtimeConfig = { model: localConfig.model, temperature: localConfig.temperature };
    if (localConfig.maxTokens !== undefined) runtimeConfig.maxTokens = localConfig.maxTokens;
    if (localConfig.seed !== undefined) runtimeConfig.seed = localConfig.seed;
  } else {
    adapter = createFireworksGlmAdapter(config);
    runtimeConfig = {
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      serviceTier: config.serviceTier,
      temperature: config.temperature,
    };
    if (config.maxTokens !== undefined) runtimeConfig.maxTokens = config.maxTokens;
    if (config.seed !== undefined) runtimeConfig.seed = config.seed;
  }

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
  let registry;
  let decision;
  if (opts.model === undefined) {
    try {
      const registry = buildModelRegistry(glamConfig, process.env);
      // 🔹 ADDED: Pull historical similarity match matrices completely offline
      const historyContext = await getHistoricalSignalContext(task);
      const routerSignals = historyContext ? { history: historyContext } : undefined;
      // Update buildRouter to accept hooks and signals (we'll ensure router.mjs forwards these)
      router = buildRouter(glamConfig, registry, {
        signals: routerSignals,
        onTaskComplete: async (record) => {
          await appendRoutingHistory(record);
        }
      });
      // Under local_only routing, hosted candidates are structurally ineligible
      // (the policy fails LOUD rather than fall back to a hosted model), so no
      // hosted key is required to build the registry: the dry-run placeholder
      // key can never reach a provider.
      registry = buildModelRegistry(
        glamConfig,
        process.env,
        localOnly ? { allowDryRunKey: true } : {},
      );
      router = buildRouter(glamConfig, registry, localOnly ? { localOnly: true } : {});
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
  out.write(
    `${color(useColorOut, FLAME, `glamfire ${version}`)} ${color(useColorOut, DIM, '· run')}\n`,
  );
  const chosenModel = decision ? decision.selection.chosen.id : (localConfig ?? config).model;
  const chosenAdapter = decision ? decision.selection.chosen.adapter : adapter;
  out.write(providerModelHeader(chosenAdapter, chosenModel));
  if (decision) {
    const c = decision.classification;
    const localTag = localOnly ? ', local-only' : '';
    out.write(
      color(
        useColorOut,
        DIM,
        `  routing: ${c.distribution} (score ${c.score.toFixed(2)}, confidence ${c.confidence.toFixed(2)}${localTag}) → ${chosenModel}\n`,
      ),
    );
  } else {
    out.write(color(useColorOut, DIM, '  routing: explicit --model override (router bypassed)\n'));
  }
  if (localConfig !== undefined) {
    const declared = `$${localConfig.usdPerMInput}/$${localConfig.usdPerMOutput} per 1M`;
    out.write(
      `  endpoint: ${localConfig.baseUrl}   price: ${declared} (self-host, declared)   ` +
        `budget: ${fmtUSD(budget.maxUSD)} / ${budget.maxSteps} steps\n`,
    );
  } else {
    out.write(
      `  effort: ${config.reasoningEffort}   tier: ${config.serviceTier}   ` +
        `budget: ${fmtUSD(budget.maxUSD)} / ${budget.maxSteps} steps\n`,
    );
  }
  // Memory is visible on every run (SPEC §9 honesty): what was recalled, from
  // where — or exactly why memory is off. Zero recalls from an empty store is a
  // normal, honest state.
  const storeDisplay = mem.store
    ? relative(process.cwd(), mem.store).startsWith('..')
      ? mem.store
      : relative(process.cwd(), mem.store)
    : null;
  if (mem.enabled) {
    const recallNote =
      mem.totalRecords === 0
        ? 'store empty — recalled 0'
        : `recalled ${mem.recalled} of ${mem.totalRecords} records (~${mem.recallTokens} tokens)`;
    out.write(`  memory: ${recallNote} · ${storeDisplay}\n\n`);
  } else if (mem.off === 'unavailable' || mem.off === 'error') {
    out.write(`  memory: unavailable — ${mem.unavailableReason}\n\n`);
  } else {
    out.write(`  memory: off (${mem.off})\n\n`);
  }

  if (opts.explain && decision) {
    out.write(`${color(useColorOut, DIM, explainDecision(decision))}\n\n`);
  }

  let streamedTextThisTurn = false;
  const onToken = (ev) => {
    if (ev.kind === 'text') {
      out.write(ev.delta);
      streamedTextThisTurn = true;
    } else if (ev.kind === 'reasoning' && opts.showThinking) {
      process.stderr.write(color(useColorOut, DIM, ev.delta));
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
      out.write(color(useColorOut, DIM, `  → ${step.name}(${args})  [${step.permission}]\n`));
    } else if (step.type === 'tool_result') {
      const status = step.ok ? 'ok' : 'error';
      let detail = '';
      if (step.ok && step.result && typeof step.result === 'object' && 'bytes' in step.result) {
        detail = ` (${step.result.bytes} bytes)`;
      } else if (!step.ok) {
        detail = ` — ${String(step.result).slice(0, 120)}`;
      }
      out.write(color(useColorOut, DIM, `  ← ${step.name} ${status}${detail}\n`));
    }
  };

  // --- clean Ctrl-C (SIGINT) handling -----------------------------------------
  // First Ctrl-C: abort cooperatively — the in-flight provider request is really
  // cancelled (AbortSignal reaches the adapter's fetch), the engine finishes with
  // status `interrupted`, and the summary below reports the honest cost of every
  // COMPLETED turn. Second Ctrl-C: force-quit with the conventional 130.
  const controller = new AbortController();
  const onSigint = () => {
    if (controller.signal.aborted) process.exit(130);
    process.stderr.write(
      `\n${color(useColorOut, YELLOW, 'interrupted')} — stopping (Ctrl-C again to force quit)\n`,
    );
    controller.abort();
  };
  process.on('SIGINT', onSigint);

  let run;
  const startedAt = Date.now();
  try {
    run = await runTask({
      task,
      adapter,
      tools: builtinTools(),
      config: runtimeConfig,
      cwd: process.cwd(),
      policy,
      system,
      stream: opts.stream,
      onStep,
      onToken,
      signal: controller.signal,
      // The router (when not bypassed by --model) selects the model and drives
      // verification/escalation; the engine still owns the loop + budget.
      ...(router ? { router } : {}),
    });
  } catch (err) {
    process.stderr.write(`\nglam run: ${err.message}\n`);
    process.exitCode = 1;
    mem.brain?.close();
    return;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }

  // --- final summary ---
  const u = run.usage;
  const total = u.inputTokens + u.outputTokens;
  out.write(`\n${color(useColorOut, DIM, '──')}\n`);
  if (run.status === 'budget_exhausted') {
    out.write(color(useColorOut, BOLD, 'stopped: budget/step ceiling reached (exit 3)\n'));
  } else if (run.status === 'interrupted') {
    out.write(color(useColorOut, BOLD, 'stopped: interrupted by Ctrl-C\n'));
    out.write(
      color(
        useColorOut,
        DIM,
        'cost below covers completed turns; a turn cancelled mid-flight may still bill the provider a few tokens.\n',
      ),
    );
  } else if (run.status === 'error') {
    out.write(color(useColorOut, BOLD, 'stopped: engine error\n'));
  }
  out.write(
    `tokens: in ${u.inputTokens} (cached ${u.cachedInputTokens}) · out ${u.outputTokens} ` +
      `(${total} total)   cost: ${fmtUSD(run.costUSD)}   ` +
      `steps: ${run.steps.length}   status: ${run.status}\n`,
  );

  // Usage honesty for self-host servers (SPEC §5.4, research/27): some local
  // servers omit token usage from responses. Say so explicitly rather than
  // presenting silent zeros as measured counts — numbers are never invented.
  const unreportedTurns = (a) =>
    a && typeof a.turnsWithoutUsage === 'number' ? a.turnsWithoutUsage : 0;
  const turnsWithoutUsage = router
    ? (registry?.all() ?? []).reduce((n, d) => n + unreportedTurns(d.adapter), 0)
    : unreportedTurns(adapter);
  if (turnsWithoutUsage > 0) {
    out.write(
      color(
        useColorOut,
        YELLOW,
        `note: the local server reported NO token usage for ${turnsWithoutUsage} turn(s) — the token counts above exclude those turns (glamfire never invents numbers).\n`,
      ),
    );
  }

  // --- memory in the loop: episode capture AFTER the run (SPEC §5.2) ---------
  // Persist a structured episode — task, outcome, decisions, files touched,
  // models, cost — so future runs recall this one. A write failure never
  // corrupts the run result, but it is reported loudly — never swallowed.
  if (mem.brain !== null) {
    try {
      const episode = buildEpisode({
        goal: opts.goal,
        run,
        adapterId: adapter.id,
        recalledCount: mem.recalled,
        version,
        durationMs: Date.now() - startedAt,
      });
      const record = await mem.brain.addEpisode(episode);
      mem.episodeId = record.id;
      out.write(
        color(
          useColorOut,
          DIM,
          `memory: recalled ${mem.recalled} · episode ${record.id.slice(0, 8)} saved → ${storeDisplay}\n`,
        ),
      );
    } catch (err) {
      process.stderr.write(`glam run: warning: could not save episode to memory: ${err.message}\n`);
    } finally {
      mem.brain.close();
    }
  }

  // --- usage ledger (monitoring, usage & billing) ---
  // Every real run is appended to the local, owned ledger (~/.glam/usage.jsonl)
  // so `glam usage` can show real spend. A ledger-write failure never corrupts
  // the run result, but it is reported loudly — never swallowed.
  try {
    const record = buildRunRecord({ run, durationMs: Date.now() - startedAt, version });
    const ledgerFile = appendRecord(record);
    // `useColorOut` (the resolved boolean), not the imported `useColor` function:
    // the function is always truthy, which forced ANSI into piped output.
    out.write(color(useColorOut, DIM, `recorded to ${ledgerFile} — see \`glam usage\`\n`));
    // Monthly budget alerting (config [usage]): warn when this run pushed
    // month-to-date spend over warnAtPct% (or past 100%) of monthlyBudgetUsd.
    const { records } = readLedger({});
    const budgetState = budgetStatus(glamConfig.usage, records);
    if (budgetState && budgetState.level !== 'ok') {
      const pct = budgetState.pct.toFixed(1);
      const line =
        budgetState.level === 'over'
          ? `monthly budget EXCEEDED: ${fmtUSD(budgetState.spentUsd)} of ${fmtUSD(budgetState.budgetUsd)} (${pct}%)`
          : `monthly budget warning: ${fmtUSD(budgetState.spentUsd)} of ${fmtUSD(budgetState.budgetUsd)} (${pct}%, warn at ${budgetState.warnAtPct}%)`;
      // NOTE: `useColorOut`, not the `useColor` function — passing the function
      // (always truthy) forced ANSI codes into piped output (fixed with #23/#24).
      process.stderr.write(`${color(useColorOut, BOLD, `glam run: ${line}`)}\n`);
    }
  } catch (err) {
    process.stderr.write(`glam run: warning: could not record usage: ${err.message}\n`);
  }

  if (opts.json) {
    const memoryReport = {
      enabled: mem.enabled,
      ...(mem.off ? { off: mem.off } : {}),
      store: mem.store,
      recalled: mem.recalled,
      totalRecords: mem.totalRecords,
      episodeId: mem.episodeId,
    };
    out.write(
      `${JSON.stringify({ status: run.status, usage: run.usage, costUSD: run.costUSD, memory: memoryReport, steps: run.steps }, null, 2)}\n`,
    );
  }

  // The documented scheme (issue #23): 0 done, 1 error, 2 usage (set at parse
  // time above), 3 budget/step ceiling, 130 interrupted (128+SIGINT).
  process.exitCode = exitCodeForStatus(run.status);
}
