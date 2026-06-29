// Tests for the plan->act->observe loop. The stochastic model is the only thing
// scripted (a deterministic sequence of recorded model turns); everything else
// is the REAL engine: the real tool registry, the real calculator tool, the
// real permission gate, and the real budget ceiling.

import {
  type ModelTurnResult,
  type RunState,
  type StreamEvent,
  type StreamingAdapter,
  ToolRegistry,
  type ToolSpec,
  type Usage,
  builtinTools,
  defaultPolicy,
  runTask,
} from '@glamfire/engine';
import { describe, expect, it } from 'vitest';

function turn(partial: Partial<ModelTurnResult>): ModelTurnResult {
  return {
    text: '',
    reasoning: '',
    toolCalls: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
    finishReason: 'stop',
    ...partial,
  };
}

/** A deterministic adapter that replays a fixed sequence of model turns. */
function scriptedAdapter(turns: ModelTurnResult[]): StreamingAdapter {
  let i = 0;
  const next = (): ModelTurnResult => {
    const t = turns[Math.min(i, turns.length - 1)] as ModelTurnResult;
    i += 1;
    return t;
  };
  return {
    id: 'scripted',
    capabilities: {
      contextWindow: 1000,
      maxOutputTokens: 1000,
      toolCalling: true,
      parallelToolCalls: true,
      jsonMode: true,
      vision: false,
      streaming: true,
      seed: false,
    },
    encodeRequest: () => ({ url: '', headers: {}, body: {} }),
    decodeResponse: () => next(),
    // $1 per 1M tokens, flat — keeps budget math easy to reason about in tests.
    pricing: (u: Usage) => (u.inputTokens + u.outputTokens) / 1_000_000,
    stream: async (_state: RunState, _onEvent: (ev: StreamEvent) => void) => next(),
    complete: async (_state: RunState) => next(),
  };
}

const baseConfig = { model: 'scripted-1' };

describe('plan -> act -> observe loop', () => {
  it('dispatches a real tool and feeds the result back to the model', async () => {
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [{ id: 'c1', name: 'calculator', arguments: { expression: '(2 + 3) * 4' } }],
        finishReason: 'tool_calls',
      }),
      turn({ text: 'The result is 20.', finishReason: 'stop' }),
    ]);

    const run = await runTask({
      task: { goal: 'compute (2 + 3) * 4', budget: { maxSteps: 5, maxUSD: 1 } },
      adapter,
      tools: builtinTools(),
      config: baseConfig,
      cwd: process.cwd(),
    });

    expect(run.status).toBe('done');
    expect(run.output).toBe('The result is 20.');

    const toolResult = run.steps.find((s) => s.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type === 'tool_result') {
      expect(toolResult.ok).toBe(true);
      // The REAL calculator executed and produced 20.
      expect((toolResult.result as { result: number }).result).toBe(20);
    }

    const types = run.steps.map((s) => s.type);
    expect(types).toEqual([
      'route_decision',
      'model_turn',
      'tool_call',
      'tool_result',
      'model_turn',
      'final',
    ]);
  });

  it('records a route_decision step naming the adapter and model', async () => {
    const adapter = scriptedAdapter([turn({ text: 'hi', finishReason: 'stop' })]);
    const run = await runTask({
      task: { goal: 'hi', budget: {} },
      adapter,
      tools: new ToolRegistry(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    const rd = run.steps[0];
    expect(rd?.type).toBe('route_decision');
    if (rd?.type === 'route_decision') {
      expect(rd.adapter).toBe('scripted');
      expect(rd.model).toBe('scripted-1');
    }
  });

  it('denies an exec-class tool by default and never runs its handler', async () => {
    let ran = false;
    const dangerTool: ToolSpec = {
      name: 'shell',
      description: 'run a shell command',
      permission: 'exec',
      parameters: { type: 'object', properties: { cmd: { type: 'string' } } },
      handler: async () => {
        ran = true;
        return { ok: true };
      },
    };
    const tools = new ToolRegistry().register(dangerTool);
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [{ id: 'c1', name: 'shell', arguments: { cmd: 'rm -rf /' } }],
        finishReason: 'tool_calls',
      }),
      turn({ text: 'understood, I will not.', finishReason: 'stop' }),
    ]);

    const run = await runTask({
      task: { goal: 'delete everything', budget: { maxSteps: 5 } },
      adapter,
      tools,
      config: baseConfig,
      cwd: process.cwd(),
    });

    expect(ran).toBe(false);
    const call = run.steps.find((s) => s.type === 'tool_call');
    expect(call?.type === 'tool_call' && call.permission).toBe('deny');
    const result = run.steps.find((s) => s.type === 'tool_result');
    expect(result?.type === 'tool_result' && result.ok).toBe(false);
    expect(result?.type === 'tool_result' && String(result.result)).toMatch(/denied by policy/);
  });

  it('runs an "ask" tool when an asker approves it', async () => {
    let ran = false;
    const writeTool: ToolSpec = {
      name: 'save',
      description: 'save a note',
      permission: 'write',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        ran = true;
        return { saved: true };
      },
    };
    const adapter = scriptedAdapter([
      turn({ toolCalls: [{ id: 'c1', name: 'save', arguments: {} }], finishReason: 'tool_calls' }),
      turn({ text: 'saved.', finishReason: 'stop' }),
    ]);
    const run = await runTask({
      task: { goal: 'save a note', budget: { maxSteps: 5 } },
      adapter,
      tools: new ToolRegistry().register(writeTool),
      config: baseConfig,
      cwd: process.cwd(),
      policy: defaultPolicy({ asker: () => true }),
    });
    expect(ran).toBe(true);
    expect(run.status).toBe('done');
  });

  it('enforces the USD budget as a hard ceiling', async () => {
    // One turn spends 1,000,000 output tokens => $1.00 at $1/M; ceiling is $0.50.
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [{ id: 'c1', name: 'calculator', arguments: { expression: '1+1' } }],
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000 },
        finishReason: 'tool_calls',
      }),
      turn({ text: 'should never get here', finishReason: 'stop' }),
    ]);
    const run = await runTask({
      task: { goal: 'spendy', budget: { maxUSD: 0.5, maxSteps: 10 } },
      adapter,
      tools: builtinTools(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    expect(run.status).toBe('budget_exhausted');
    expect(run.costUSD).toBeGreaterThanOrEqual(0.5);
    const final = run.steps.at(-1);
    expect(final?.type === 'final' && final.reason).toBe('budget_exhausted');
  });

  it('caps runaway loops with maxSteps', async () => {
    // The model always asks for another tool call; only maxSteps stops it.
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [{ id: 'c1', name: 'calculator', arguments: { expression: '1+1' } }],
        finishReason: 'tool_calls',
      }),
    ]);
    const run = await runTask({
      task: { goal: 'loop forever', budget: { maxSteps: 3, maxUSD: 100 } },
      adapter,
      tools: builtinTools(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    expect(run.status).toBe('budget_exhausted');
    const final = run.steps.at(-1);
    expect(final?.type === 'final' && final.reason).toBe('max_steps');
    expect(run.steps.filter((s) => s.type === 'model_turn')).toHaveLength(3);
  });

  it('reports unknown tools back to the model as an error observation', async () => {
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [{ id: 'c1', name: 'no_such_tool', arguments: {} }],
        finishReason: 'tool_calls',
      }),
      turn({ text: 'ok', finishReason: 'stop' }),
    ]);
    const run = await runTask({
      task: { goal: 'x', budget: { maxSteps: 5 } },
      adapter,
      tools: builtinTools(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    const result = run.steps.find((s) => s.type === 'tool_result');
    expect(result?.type === 'tool_result' && result.ok).toBe(false);
    expect(result?.type === 'tool_result' && String(result.result)).toMatch(/unknown tool/);
  });
});
