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
  /** Stream tokens (true) or use a single non-streaming completion (false). */
  stream?: boolean;
  /** Called with every recorded step as it happens. */
  onStep?: (step: Step) => void;
  /** Called with streamed token events during a model turn. */
  onToken?: (ev: StreamEvent) => void;
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
  const { task, adapter, tools, config, cwd } = opts;
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

  // Honest: direct default-adapter selection. The center/edge router is a
  // separate subsystem; when it lands it replaces this single decision.
  emit({
    type: 'route_decision',
    adapter: adapter.id,
    model: config.model,
    reason: 'direct default-adapter selection (center/edge router not yet wired)',
  });

  const messages: NeutralMessage[] = [{ role: 'user', content: composeFirstMessage(task) }];

  for (let iteration = 0; ; iteration += 1) {
    if (iteration >= maxSteps) {
      return finish(run.output, 'max_steps', 'budget_exhausted');
    }
    // Hard budget ceiling, checked before spending on another turn.
    const exhausted = budgetExhausted(run, task);
    if (exhausted) {
      return finish(run.output, 'budget_exhausted', 'budget_exhausted');
    }

    const state: RunState = { system, task, messages, tools: tools.list(), config };

    let result: ModelTurnResult;
    try {
      result = useStream
        ? await adapter.stream(state, (ev: StreamEvent) => onToken(ev))
        : await adapter.complete(state);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return finish(`engine error: ${msg}`, 'error', 'error');
    }

    const cost = adapter.pricing(result.usage);
    run.usage = addUsage(run.usage, result.usage);
    run.costUSD += cost;

    emit({
      type: 'model_turn',
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

    if (result.toolCalls.length === 0) {
      return finish(result.text, 'stop', 'done');
    }

    // We just spent tokens; enforce the ceiling before doing any more work.
    if (budgetExhausted(run, task)) {
      return finish(result.text, 'budget_exhausted', 'budget_exhausted');
    }

    for (const call of result.toolCalls) {
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

function budgetExhausted(run: Run, task: Task): boolean {
  const { maxUSD, maxTokens } = task.budget;
  if (maxUSD !== undefined && run.costUSD >= maxUSD) return true;
  if (maxTokens !== undefined) {
    const total = run.usage.inputTokens + run.usage.outputTokens;
    if (total >= maxTokens) return true;
  }
  return false;
}
