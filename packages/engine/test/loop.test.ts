// Tests for the plan->act->observe loop. The stochastic model is the only thing
// scripted (a deterministic sequence of recorded model turns); everything else
// is the REAL engine: the real tool registry, the real calculator tool, the
// real permission gate, and the real budget ceiling.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

/**
 * Like `scriptedAdapter`, but records the `maxTokens` the engine put on
 * `state.config` for each turn — this is exactly what the OpenAI-compatible
 * adapter forwards as the wire `max_tokens`. Lets the tests assert the
 * budget-derived per-turn output cap (Part B).
 */
function capturingAdapter(
  turns: ModelTurnResult[],
  seen: Array<number | undefined>,
  over: { maxOutputTokens?: number } = {},
): StreamingAdapter {
  const base = scriptedAdapter(turns);
  const record = (state: RunState): void => {
    seen.push(state.config.maxTokens);
  };
  return {
    ...base,
    capabilities: { ...base.capabilities, maxOutputTokens: over.maxOutputTokens ?? 1000 },
    stream: async (state: RunState, onEvent: (ev: StreamEvent) => void) => {
      record(state);
      return base.stream(state, onEvent);
    },
    complete: async (state: RunState) => {
      record(state);
      return base.complete(state);
    },
  };
}

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

// The budget ceiling must be genuinely HARD: honest status on every terminal
// path, and a per-turn output cap so a single turn cannot blow past the budget.
// Regression for a live GLM run where `--max-usd 0.001` produced a full essay
// costing $0.0123 yet still reported `done`.
describe('hard budget ceiling — honest status + per-turn output cap', () => {
  it('reports budget_exhausted (not done) when a single terminal turn overspends', async () => {
    // One text-only final turn, $0.002 at $1/M, against a $0.001 ceiling.
    const adapter = scriptedAdapter([
      turn({
        text: 'here is a full 2000-word essay about routing ...',
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 2000 },
        finishReason: 'stop',
      }),
    ]);
    const run = await runTask({
      task: {
        goal: 'Write a 2000-word essay about routing.',
        budget: { maxUSD: 0.001, maxSteps: 8 },
      },
      adapter,
      tools: new ToolRegistry(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    // Previously this path returned `done`; the post-spend check now makes it honest.
    expect(run.status).toBe('budget_exhausted');
    const final = run.steps.at(-1);
    expect(final?.type === 'final' && final.reason).toBe('budget_exhausted');
    // The best-so-far answer is still preserved on the run.
    expect(run.output).toContain('essay');
  });

  it('caps a turn max_tokens by the remaining USD budget and then trips the ceiling', async () => {
    const seen: Array<number | undefined> = [];
    const adapter = capturingAdapter(
      [
        turn({
          text: 'truncated',
          usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 600 },
          finishReason: 'length',
        }),
      ],
      seen,
    );
    const run = await runTask({
      task: { goal: 'essay', budget: { maxUSD: 0.0005, maxSteps: 8 } },
      adapter,
      tools: new ToolRegistry(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    // outRate is $1/M => $1e-6/token; floor(0.0005 / 1e-6) = 500 output tokens.
    expect(seen[0]).toBe(500);
    // 600 output tokens * $1/M = $0.0006 > $0.0005 => honest budget_exhausted.
    expect(run.status).toBe('budget_exhausted');
  });

  it('leaves max_tokens uncapped on a comfortable budget and finishes done', async () => {
    const seen: Array<number | undefined> = [];
    const adapter = capturingAdapter(
      [
        turn({
          text: 'a full, complete answer',
          usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 400 },
          finishReason: 'stop',
        }),
      ],
      seen,
    );
    const run = await runTask({
      task: { goal: 'what is glamfire', budget: { maxUSD: 1, maxSteps: 8 } },
      adapter,
      tools: new ToolRegistry(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    // Budget cap (1e6 tokens) is far above the ceiling => config left untouched.
    expect(seen[0]).toBeUndefined();
    expect(run.status).toBe('done');
    expect(run.output).toBe('a full, complete answer');
  });

  it('never raises a configured max_tokens above its configured value on a large budget', async () => {
    const seen: Array<number | undefined> = [];
    const adapter = capturingAdapter(
      [
        turn({
          text: 'ok',
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
          finishReason: 'stop',
        }),
      ],
      seen,
      { maxOutputTokens: 5000 },
    );
    const run = await runTask({
      task: { goal: 'x', budget: { maxUSD: 1, maxSteps: 8 } },
      adapter,
      tools: new ToolRegistry(),
      config: { model: 'scripted-1', maxTokens: 800 },
      cwd: process.cwd(),
    });
    // min(configured 800, huge budget cap) = 800 => the configured value stands.
    expect(seen[0]).toBe(800);
    expect(run.status).toBe('done');
  });

  it('caps max_tokens by the remaining token budget when maxTokens is set', async () => {
    const seen: Array<number | undefined> = [];
    const adapter = capturingAdapter(
      [
        turn({
          text: 'ok',
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
          finishReason: 'stop',
        }),
      ],
      seen,
    );
    const run = await runTask({
      task: { goal: 'x', budget: { maxTokens: 300, maxSteps: 8 } },
      adapter,
      tools: new ToolRegistry(),
      config: baseConfig,
      cwd: process.cwd(),
    });
    // Remaining token budget (300) is below the adapter's max output (1000) => cap 300.
    expect(seen[0]).toBe(300);
    expect(run.status).toBe('done');
  });
});

// The dogfooding M1 cycle (research/22): read a file, propose an edit, run a
// command, iterate — all through the REAL engine, gate, and tools. The model is
// the only scripted piece. No provider call, no key needed.
describe('dogfood edit -> run loop (M1, key-independent)', () => {
  let dir: string;
  // A seeded bug: subtraction where addition is intended.
  const buggy = 'module.exports = (a, b) => a - b;\n';
  const fixed = 'module.exports = (a, b) => a + b;\n';
  // A real test command: requires the edited module and asserts 2 + 3 === 5.
  const checkScript =
    "const add = require('./add.js'); if (add(2, 3) !== 5) { process.exit(1); } process.stdout.write('PASS');";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'glamfire-m1-'));
    writeFileSync(join(dir, 'add.js'), buggy, 'utf8');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('denies the edit and the command by default (least privilege), leaving the file untouched', async () => {
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [{ id: 'r1', name: 'read_file', arguments: { path: 'add.js' } }],
        finishReason: 'tool_calls',
      }),
      turn({
        toolCalls: [
          {
            id: 'e1',
            name: 'edit_file',
            arguments: { path: 'add.js', old_string: 'a - b', new_string: 'a + b' },
          },
        ],
        finishReason: 'tool_calls',
      }),
      turn({
        toolCalls: [
          {
            id: 'x1',
            name: 'run_command',
            arguments: { command: 'node', args: ['-e', checkScript] },
          },
        ],
        finishReason: 'tool_calls',
      }),
      turn({ text: 'I was not permitted to edit or run.', finishReason: 'stop' }),
    ]);

    const run = await runTask({
      // No asker, no exec override: defaults stay least-privilege.
      task: { goal: 'fix the add bug', budget: { maxSteps: 8 } },
      adapter,
      tools: builtinTools(),
      config: baseConfig,
      cwd: dir,
    });

    const results = run.steps.filter((s) => s.type === 'tool_result');
    const editResult = results.find((s) => s.type === 'tool_result' && s.name === 'edit_file');
    const execResult = results.find((s) => s.type === 'tool_result' && s.name === 'run_command');
    // The edit was an `ask` (write) with no asker -> denied.
    expect(editResult?.type === 'tool_result' && editResult.ok).toBe(false);
    expect(editResult?.type === 'tool_result' && String(editResult.result)).toMatch(/denied/);
    // The command was `exec` -> denied by policy outright.
    expect(execResult?.type === 'tool_result' && execResult.ok).toBe(false);
    expect(execResult?.type === 'tool_result' && String(execResult.result)).toMatch(
      /denied by policy/,
    );
    // The real file on disk is unchanged.
    expect(readFileSync(join(dir, 'add.js'), 'utf8')).toBe(buggy);
  });

  it('closes the read -> edit -> run cycle with approval, iterating to green for real', async () => {
    const adapter = scriptedAdapter([
      // 1. Read the buggy file.
      turn({
        toolCalls: [{ id: 'r1', name: 'read_file', arguments: { path: 'add.js' } }],
        finishReason: 'tool_calls',
      }),
      // 2. Run the test first; it fails (exit 1) — the model observes red.
      turn({
        toolCalls: [
          {
            id: 'x1',
            name: 'run_command',
            arguments: { command: 'node', args: ['-e', checkScript] },
          },
        ],
        finishReason: 'tool_calls',
      }),
      // 3. Apply the fix.
      turn({
        toolCalls: [
          {
            id: 'e1',
            name: 'edit_file',
            arguments: { path: 'add.js', old_string: 'a - b', new_string: 'a + b' },
          },
        ],
        finishReason: 'tool_calls',
      }),
      // 4. Re-run the test; now it passes.
      turn({
        toolCalls: [
          {
            id: 'x2',
            name: 'run_command',
            arguments: { command: 'node', args: ['-e', checkScript] },
          },
        ],
        finishReason: 'tool_calls',
      }),
      turn({ text: 'Fixed: add(2,3) now returns 5. Tests green.', finishReason: 'stop' }),
    ]);

    const run = await runTask({
      task: { goal: 'fix the add bug and prove the test passes', budget: { maxSteps: 10 } },
      adapter,
      tools: builtinTools(),
      config: baseConfig,
      cwd: dir,
      // A human approves writes; exec is explicitly enabled for run_command only.
      policy: defaultPolicy({ asker: () => true, toolOverrides: { run_command: 'ask' } }),
    });

    expect(run.status).toBe('done');
    // The edit really happened on disk.
    expect(readFileSync(join(dir, 'add.js'), 'utf8')).toBe(fixed);

    const execResults = run.steps.filter(
      (s) => s.type === 'tool_result' && s.name === 'run_command',
    );
    expect(execResults).toHaveLength(2);
    // First run (before the fix) exits non-zero...
    const first = execResults[0];
    expect(first?.type === 'tool_result' && (first.result as { exitCode: number }).exitCode).toBe(
      1,
    );
    // ...the second run (after the fix) exits zero and prints PASS — iterated to green.
    const second = execResults[1];
    if (second?.type === 'tool_result') {
      const r = second.result as { exitCode: number; stdout: string };
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toBe('PASS');
    }
  });
});
