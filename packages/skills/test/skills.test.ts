// Real tests for @glamfire/skills. Nothing is mocked: we load the shipped
// example skill from disk, validate its manifest, install it, and drive the
// REAL engine loop (runTask) with the skill's real tool — the only scripted
// thing is the model's turn sequence (as in engine/test/loop.test.ts). We also
// exercise the real verifier and the manifest-validation error path.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ModelTurnResult,
  type RunState,
  type StreamEvent,
  type StreamingAdapter,
  ToolRegistry,
  type Usage,
  runTask,
} from '@glamfire/engine';
import {
  type LoadedSkill,
  SkillConflictError,
  SkillManifestError,
  discoverSkills,
  installSkills,
  loadSkill,
  parseManifest,
  runRubric,
} from '@glamfire/skills';
import { afterAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '..', 'examples');
const codeExplainerDir = join(examplesDir, 'code-explainer');

// A small, real piece of source the skill will explain.
const SAMPLE_SOURCE = [
  'export function parseConfig(text) {',
  '  const lines = text.split("\\n");',
  '  return Object.fromEntries(lines.map((l) => l.split("=")));',
  '}',
  '',
  'export class Loader {}',
].join('\n');

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
    pricing: (u: Usage) => (u.inputTokens + u.outputTokens) / 1_000_000,
    stream: async (_s: RunState, _e: (ev: StreamEvent) => void) => next(),
    complete: async (_s: RunState) => next(),
  };
}

function registryOf(skill: LoadedSkill): ToolRegistry {
  const reg = new ToolRegistry();
  for (const t of skill.tools) reg.register(t);
  return reg;
}

const tmpDirs: string[] = [];
async function tempSkill(manifest: unknown, extra: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'glam-skill-'));
  tmpDirs.push(dir);
  await writeFile(join(dir, 'skill.json'), JSON.stringify(manifest), 'utf8');
  for (const [name, content] of Object.entries(extra)) {
    await writeFile(join(dir, name), content, 'utf8');
  }
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('loading the example skill from disk', () => {
  it('validates the manifest and resolves the instruction, tools, and verifier', async () => {
    const skill = await loadSkill(codeExplainerDir);
    expect(skill.name).toBe('code-explainer');
    expect(skill.version).toBe('1.0.0');
    // Instruction came from template.md (instructionPath), not inline.
    expect(skill.instruction).toContain('outline_code');
    expect(skill.instruction).toContain('Summary:');
    // Tool handler resolved from skill.mjs into a real ToolSpec.
    expect(skill.tools).toHaveLength(1);
    const tool = skill.tools[0];
    expect(tool?.name).toBe('outline_code');
    expect(tool?.permission).toBe('read');
    expect(typeof tool?.handler).toBe('function');
    // Verifier resolved from the module.
    expect(typeof skill.verifier).toBe('function');
    expect(skill.episodes).toHaveLength(1);
  });

  it('discovers the skill from the examples directory', async () => {
    const skills = await discoverSkills(examplesDir);
    expect(skills.map((s) => s.name)).toContain('code-explainer');
  });

  it('runs the resolved tool handler for real', async () => {
    const skill = await loadSkill(codeExplainerDir);
    const out = (await skill.tools[0]?.handler(
      { code: SAMPLE_SOURCE },
      { cwd: process.cwd() },
    )) as {
      symbols: { name: string }[];
      symbolCount: number;
    };
    expect(out.symbolCount).toBe(2);
    expect(out.symbols.map((s) => s.name)).toEqual(['parseConfig', 'Loader']);
  });
});

describe('installing skills into the engine contract', () => {
  it('composes a model-neutral system contribution and the tool specs', async () => {
    const skill = await loadSkill(codeExplainerDir);
    const install = installSkills([skill]);
    expect(install.system).toContain('## Skill: code-explainer (v1.0.0)');
    expect(install.system).toContain('Tools: outline_code');
    expect(install.system).toContain('Worked examples:');
    // The instruction text is folded in verbatim.
    expect(install.system).toContain('Call the `outline_code` tool');
    expect(install.tools).toHaveLength(1);
    expect(install.tools[0]?.name).toBe('outline_code');
  });

  it('prepends a base system when provided', async () => {
    const skill = await loadSkill(codeExplainerDir);
    const install = installSkills([skill], { baseSystem: 'BASE-ENGINE-PROMPT' });
    expect(install.system.startsWith('BASE-ENGINE-PROMPT')).toBe(true);
    expect(install.system).toContain('## Skill: code-explainer');
  });

  it('throws an actionable error on a tool-name collision between skills', async () => {
    const skill = await loadSkill(codeExplainerDir);
    expect(() => installSkills([skill, skill])).toThrow(SkillConflictError);
    try {
      installSkills([skill, skill]);
    } catch (err) {
      expect((err as Error).message).toMatch(/outline_code/);
    }
  });
});

describe('end-to-end: a model uses the installed skill through runTask', () => {
  it('drives plan->act->observe with the skill tool, then verifies the output', async () => {
    const skill = await loadSkill(codeExplainerDir);
    const install = installSkills([skill]);

    // The model: turn 1 calls the skill's tool; turn 2 writes the explanation.
    const explanation =
      'Summary: parseConfig turns "key=value" lines into an object.\n' +
      '- parseConfig(text): splits text into lines and builds an object from key=value ' +
      'pairs. Input: a string. Output: a record. Risk: a line without "=" yields an ' +
      'undefined value.\n' +
      '- Loader: an empty class, currently a placeholder.';
    const adapter = scriptedAdapter([
      turn({
        toolCalls: [
          {
            id: 'c1',
            name: 'outline_code',
            arguments: { code: SAMPLE_SOURCE, language: 'javascript' },
          },
        ],
        finishReason: 'tool_calls',
      }),
      turn({ text: explanation, finishReason: 'stop' }),
    ]);

    const task = {
      goal: 'Explain the provided source code.',
      inputs: { source: SAMPLE_SOURCE },
      budget: { maxSteps: 6, maxUSD: 1 },
    };

    const run = await runTask({
      task,
      adapter,
      tools: registryOf(skill),
      config: { model: 'scripted-1' },
      cwd: process.cwd(),
      system: install.system,
    });

    expect(run.status).toBe('done');
    // The REAL skill tool executed and outlined the source.
    const toolResult = run.steps.find((s) => s.type === 'tool_result');
    expect(toolResult?.type === 'tool_result' && toolResult.ok).toBe(true);
    if (toolResult?.type === 'tool_result') {
      expect((toolResult.result as { symbolCount: number }).symbolCount).toBe(2);
    }

    // The REAL skill verifier accepts the grounded explanation.
    const verdict = await skill.verifier?.(run.output, { task });
    expect(verdict?.passed).toBe(true);
    expect(verdict?.score).toBe(1);
  });

  it('the verifier rejects a hand-wavy answer that names no real symbol', async () => {
    const skill = await loadSkill(codeExplainerDir);
    const task = { goal: 'x', inputs: { source: SAMPLE_SOURCE }, budget: {} };
    const verdict = await skill.verifier?.('It does some stuff, probably fine.', { task });
    expect(verdict?.passed).toBe(false);
    expect(verdict?.detail).toMatch(/failed/);
  });
});

describe('manifest validation (actionable errors)', () => {
  it('parseManifest reports field-level issues', () => {
    expect(() => parseManifest({ name: 'Bad Name', version: 'nope' })).toThrow(SkillManifestError);
    try {
      parseManifest({ name: 'Bad Name', version: 'nope', description: '' }, 'demo.json');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('demo.json');
      expect(msg).toMatch(/name/);
      expect(msg).toMatch(/version/);
    }
  });

  it('rejects a manifest with tools but no module', () => {
    expect(() =>
      parseManifest({
        name: 'no-module',
        version: '1.0.0',
        description: 'x',
        instruction: 'do x',
        tools: [{ name: 'foo', description: 'd', handler: 'foo' }],
      }),
    ).toThrow(/module/);
  });

  it('loadSkill fails when a handler is not exported by the module', async () => {
    const dir = await tempSkill(
      {
        name: 'broken',
        version: '1.0.0',
        description: 'references a missing handler',
        module: './skill.mjs',
        instruction: 'do the thing',
        tools: [{ name: 'thing', description: 'd', handler: 'doesNotExist' }],
      },
      { 'skill.mjs': 'export function present() {}\n' },
    );
    await expect(loadSkill(dir)).rejects.toThrow(/not an exported function/);
  });

  it('loadSkill fails with an actionable error on malformed JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'glam-skill-'));
    tmpDirs.push(dir);
    await writeFile(join(dir, 'skill.json'), '{ not json', 'utf8');
    await expect(loadSkill(dir)).rejects.toThrow(/not valid JSON/);
  });
});

describe('rubric verifier (declarative, model-free)', () => {
  it('passes when all must/mustNot criteria hold and fails otherwise', () => {
    const rubric = {
      criteria: [
        { description: 'has a summary', must: 'Summary:' },
        { description: 'no TODO left', mustNot: 'TODO' },
      ],
    };
    const good = runRubric(rubric, 'Summary: all done.');
    expect(good.passed).toBe(true);
    expect(good.score).toBe(1);

    const bad = runRubric(rubric, 'TODO: write the summary');
    expect(bad.passed).toBe(false);
    expect(bad.score).toBe(0);
    expect(bad.detail).toMatch(/criteria failed/);
  });

  it('a manifest rubric becomes the skill verifier when no function is named', async () => {
    const dir = await tempSkill({
      name: 'rubric-skill',
      version: '0.1.0',
      description: 'rubric-only verifier',
      instruction: 'produce a summary',
      rubric: { criteria: [{ description: 'has summary', must: 'Summary:' }] },
    });
    const skill = await loadSkill(dir);
    expect(typeof skill.verifier).toBe('function');
    const verdict = await skill.verifier?.('Summary: ok');
    expect(verdict?.passed).toBe(true);
  });
});
