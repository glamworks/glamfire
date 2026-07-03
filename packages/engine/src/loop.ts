// The plan -> act -> observe loop (SPEC §5.1). Given a Task, an adapter, and a
// tool registry, the engine drives turns: model_turn -> parse tool_calls ->
// permission gate -> dispatch -> tool_result -> loop, until the model emits a
// final answer or a hard ceiling (budget / max-steps) is hit. Every step is
// recorded in order so the Run is fully replayable.

import { type PermissionPolicy, defaultPolicy, gate } from './permissions.js';
import type { ToolRegistry } from './tools.js';
import {
  type AdapterRuntimeConfig,
  type FinalReason,
  type ModelTurnResult,
  type NeutralMessage,
  type RouteClassification,
  type RouterHook,
  type Run,
  type RunState,
  type Step,
  type StreamEvent,
  type StreamingAdapter,
  type Task,
  addUsage,
  emptyUsage,
} from './types.js';

const DEFAULT_SYSTEM =
  'You are glamfire, an open, model-agnostic agent. Work the task using the ' +
  'available tools when they help. Call a tool only when you need its result; ' +
  'when you have enough to answer, stop calling tools and give the final answer ' +
  'directly. Be concise and correct.';

const DEFAULT_MAX_STEPS = 8;

/** Distributes `Omit` over each member of a union (preserves the discriminant). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A step without the engine-assigned `index`/`ts`. */
type StepInput = DistributiveOmit<Step, 'index' | 'ts'>;

export interface RunOptions {
  task: Task;
  adapter: StreamingAdapter;
  tools: ToolRegistry;
  config: AdapterRuntimeConfig;
  /** Sandbox filesystem root for tool handlers. */
  cwd: string;
  /** System prompt; defaults to the engine's neutral system text. */
  system?: string;
  /** Permission policy; defaults to least-privilege. */
  policy?: PermissionPolicy;
  /**
   * Cost-aware router (SPEC §5.3). When provided, it picks the initial model
   * (overriding `adapter`/`config`) and may escalate to a stronger model after a
   * failed verification. When omitted, the engine runs `adapter`/`config`
   * directly and emits a plain `route_decision` step (legacy behavior).
   */
  router?: RouterHook;
  /** Stream tokens (true) or use a single non-streaming completion (false). */
  stream?: boolean;
  /** Called with every recorded step as it happens. */
  onStep?: (step: Step) => void;
  /** Called with streamed token events during a model turn. */
  onToken?: (ev: StreamEvent) => void;
  /**
   * Cooperative cancellation (SIGINT on the CLI). When aborted, the in-flight
   * provider request is really cancelled (the signal reaches the adapter's HTTP
   * layer) and the run finishes with status `interrupted` — accounting for every
   * completed turn, never a fake `done`.
   */
  signal?: AbortSignal;
}

function composeFirstMessage(task: Task): string {
  const parts = [task.goal];
  if (task.constraints && task.constraints.length > 0) {
    parts.push(`\nConstraints:\n${task.constraints.map((c) => `- ${c}`).join('\n')}`);
  }
  if (task.inputs) {
    for (const [name, value] of Object.entries(task.inputs)) {
      parts.push(`\n[input: ${name}]\n${value}`);
    }
  }
  return parts.join('\n');
}

export async function runTask(opts: RunOptions): Promise<Run> {
  const { task, tools, cwd } = opts;
  // The active model can change mid-run when the router escalates; the engine
  // keeps owning the loop, budget, and permissions regardless.
  let activeAdapter: StreamingAdapter = opts.adapter;
  let activeConfig: AdapterRuntimeConfig = opts.config;
  const policy = opts.policy ?? defaultPolicy();
  const system = opts.system ?? DEFAULT_SYSTEM;
  const useStream = opts.stream ?? true;
  const maxSteps = task.budget.maxSteps ?? DEFAULT_MAX_STEPS;
  const onToken = opts.onToken ?? (() => {});

  const run: Run = {
    task,
    steps: [],
    usage: emptyUsage(),
    costUSD: 0,
    status: 'running',
    output: '',
  };

  const emit = (step: StepInput): void => {
    const full = { ...step, index: run.steps.length, ts: Date.now() } as Step;
    run.steps.push(full);
    opts.onStep?.(full);
  };

  const finish = (text: string, reason: FinalReason, status: Run['status']): Run => {
    run.output = text;
    run.status = status;
    emit({ type: 'final', text, reason });
    return run;
  };

  // Routing decision (SPEC §5.3). With a router hook the cheapest capable model
  // is chosen from the declarative policy and its classification is logged; with
  // no router we fall back to the directly-supplied default adapter.
  let routeReason = 'direct default-adapter selection (center/edge router not wired)';
  let classification: RouteClassification | undefined;
  if (opts.router) {
    const selection = opts.router.select(task);
    activeAdapter = selection.adapter;
    activeConfig = selection.config;
    routeReason = selection.reason;
    classification = selection.classification;
  }
  emit({
    type: 'route_decision',
    adapter: activeAdapter.id,
    model: activeConfig.model,
    reason: routeReason,
    ...(classification
      ? {
          distribution: classification.distribution,
          confidence: classification.confidence,
          score: classification.score,
        }
      : {}),
  });

  const messages: NeutralMessage[] = [{ role: 'user', content: composeFirstMessage(task) }];

  const signal = opts.signal;

  for (let iteration = 0; ; iteration += 1) {
    // Cooperative cancellation, honored before spending on another turn.
    if (signal?.aborted) {
      return finish(run.output, 'interrupted', 'interrupted');
    }
    if (iteration >= maxSteps) {
      return finish(run.output, 'max_steps', 'budget_exhausted');
    }
    // Hard budget ceiling, checked before spending on another turn.
    const exhausted = budgetExhausted(run, task);
    if (exhausted) {
      return finish(run.output, 'budget_exhausted', 'budget_exhausted');
    }

    // Cap this turn's output tokens by the remaining budget so a single turn
    // cannot blow past maxUSD/maxTokens (SPEC §5.1 hard ceiling). Derived per
    // iteration from the (shrinking) remaining budget; never mutates the shared
    // active config.
    const turnConfig = budgetCappedConfig(activeConfig, activeAdapter, run, task);

    const state: RunState = {
      system,
      task,
      messages,
      tools: tools.list(),
      config: turnConfig,
      ...(signal ? { signal } : {}),
    };

    let result: ModelTurnResult;
    try {
      result = useStream
        ? await activeAdapter.stream(state, (ev: StreamEvent) => onToken(ev))
        : await activeAdapter.complete(state);
    } catch (err) {
      // An abort mid-request is a user interrupt, not an engine failure: the
      // adapter's fetch rejects when the signal fires. Report it honestly.
      if (signal?.aborted) {
        return finish(run.output, 'interrupted', 'interrupted');
      }
      const msg = err instanceof Error ? err.message : String(err);
      return finish(`engine error: ${msg}`, 'error', 'error');
    }

    const cost = activeAdapter.pricing(result.usage);
    run.usage = addUsage(run.usage, result.usage);
    run.costUSD += cost;

    emit({
      type: 'model_turn',
      adapter: activeAdapter.id,
      model: activeConfig.model,
      text: result.text,
      reasoning: result.reasoning,
      toolCalls: result.toolCalls,
      usage: result.usage,
      costUSD: cost,
      finishReason: result.finishReason,
    });

    messages.push({
      role: 'assistant',
      content: result.text,
      reasoning: result.reasoning,
      toolCalls: result.toolCalls,
    });

    // Post-spend ceiling, enforced on EVERY turn (including a terminal
    // text-only answer). This is what makes the ceiling honest: a final turn
    // that pushed cumulative spend over the budget reports `budget_exhausted`,
    // not `done`. Runs before the terminal branch and the tool-dispatch path,
    // so it subsumes the per-path checks.
    if (budgetExhausted(run, task)) {
      return finish(result.text, 'budget_exhausted', 'budget_exhausted');
    }

    if (result.toolCalls.length === 0) {
      // The model produced a final answer. Offer it to the router for
      // verification + possible escalation to a stronger model (SPEC §5.3). The
      // engine still owns the loop: an escalation just swaps the active model and
      // continues, so the budget ceiling keeps bounding the whole cascade.
      if (opts.router?.review) {
        const review = await opts.router.review({
          task,
          output: result.text,
          run,
          currentModel: activeConfig.model,
        });
        if (review.verification) {
          emit({
            type: 'verification',
            passed: review.verification.passed,
            detail: review.verification.detail,
          });
        }
        if (review.escalation) {
          emit({
            type: 'escalation',
            from: review.escalation.from,
            to: review.escalation.to,
            trigger: review.escalation.trigger,
          });
          activeAdapter = review.escalation.adapter;
          activeConfig = review.escalation.config;
          // Keep the best-so-far answer in case the cascade later runs out of
          // budget or candidates before producing a better one.
          run.output = result.text;
          const why = review.verification?.detail ?? review.escalation.trigger;
          messages.push({
            role: 'user',
            content: `That answer did not pass verification: ${why}. Reconsider carefully and provide a corrected, complete final answer.`,
          });
          continue;
        }
      }
      return finish(result.text, 'stop', 'done');
    }

    for (const call of result.toolCalls) {
      // Stop dispatching tools the moment the user interrupts — no orphaned
      // side effects after Ctrl-C. Completed turns stay fully accounted.
      if (signal?.aborted) {
        return finish(run.output || result.text, 'interrupted', 'interrupted');
      }
      const tool = tools.get(call.name);
      if (!tool) {
        emit({
          type: 'tool_call',
          callId: call.id,
          name: call.name,
          arguments: call.arguments,
          permission: 'deny',
        });
        const reason = `unknown tool "${call.name}"`;
        emit({ type: 'tool_result', callId: call.id, name: call.name, ok: false, result: reason });
        messages.push({
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: `Error: ${reason}`,
        });
        continue;
      }

      const verdict = gate(policy, tool, call.arguments);
      emit({
        type: 'tool_call',
        callId: call.id,
        name: call.name,
        arguments: call.arguments,
        permission: verdict.verdict,
      });

      if (!verdict.admitted) {
        emit({
          type: 'tool_result',
          callId: call.id,
          name: call.name,
          ok: false,
          result: verdict.reason,
        });
        messages.push({
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: `Permission denied: ${verdict.reason}`,
        });
        continue;
      }

      try {
        const output = await tool.handler(call.arguments, { cwd });
        emit({ type: 'tool_result', callId: call.id, name: call.name, ok: true, result: output });
        messages.push({
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: JSON.stringify(output),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: 'tool_result', callId: call.id, name: call.name, ok: false, result: msg });
        messages.push({ role: 'tool', callId: call.id, name: call.name, content: `Error: ${msg}` });
      }
    }
  }
}

/**
 * Cap a turn's `max_tokens` by the budget still available, so no single turn
 * can massively overspend before the post-spend ceiling can catch it (SPEC
 * §5.1). Returns a per-turn config copy — never mutates the shared active
 * config, so the cap is recomputed against the shrinking budget each iteration.
 *
 * The cap only bites when it would fall below the ceiling that would otherwise
 * apply (the configured `maxTokens`, or the adapter's advertised max output);
 * with a comfortable budget the config is returned untouched, leaving normal
 * runs exactly as before.
 */
function budgetCappedConfig(
  config: AdapterRuntimeConfig,
  adapter: StreamingAdapter,
  run: Run,
  task: Task,
): AdapterRuntimeConfig {
  const { maxUSD, maxTokens } = task.budget;
  let cap = Number.POSITIVE_INFINITY;

  if (maxUSD !== undefined) {
    // $/output-token, derived from the adapter's own pricing (no new API): price
    // one million output tokens and divide back down.
    const outRate =
      adapter.pricing({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000 }) /
      1_000_000;
    if (outRate > 0) {
      const remainingUSD = Math.max(0, maxUSD - run.costUSD);
      cap = Math.min(cap, Math.floor(remainingUSD / outRate));
    }
  }
  if (maxTokens !== undefined) {
    const remainingTokens = maxTokens - (run.usage.inputTokens + run.usage.outputTokens);
    cap = Math.min(cap, remainingTokens);
  }

  // Neither budget dimension is set (or maxUSD with a free model and no token
  // cap): nothing to cap by.
  if (!Number.isFinite(cap)) return config;

  // The ceiling the turn would otherwise be bounded by. If the budget cap is at
  // or above it, the budget does not bite — leave the wire untouched.
  const ceiling = config.maxTokens ?? adapter.capabilities.maxOutputTokens;
  if (cap >= ceiling) return config;

  // The budget bites. Send a positive max_tokens (floor of 1) so the model is
  // truncated and the post-spend check then trips `budget_exhausted`.
  return { ...config, maxTokens: Math.max(1, cap) };
}

function budgetExhausted(run: Run, task: Task): boolean {
  const { maxUSD, maxTokens } = task.budget;
  if (maxUSD !== undefined && run.costUSD >= maxUSD) return true;
  if (maxTokens !== undefined) {
    const total = run.usage.inputTokens + run.usage.outputTokens;
    if (total >= maxTokens) return true;
  }
  return false;
}
