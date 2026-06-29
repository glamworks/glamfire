// Tests for the built-in tools and the permission gate — all real behavior.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ToolError,
  type ToolSpec,
  calculatorTool,
  defaultPolicy,
  gate,
  readFileTool,
} from '@glamfire/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('calculator tool (safe, no eval)', () => {
  const run = (expression: string) =>
    calculatorTool.handler({ expression }, { cwd: process.cwd() }) as Promise<{ result: number }>;

  it('evaluates precedence and parentheses', async () => {
    expect((await run('(2 + 3) * 4')).result).toBe(20);
    expect((await run('2 + 3 * 4')).result).toBe(14);
    expect((await run('10 / 4')).result).toBe(2.5);
    expect((await run('-3 + 5')).result).toBe(2);
    expect((await run('2 * (3 + (4 - 1))')).result).toBe(12);
    expect((await run('17 % 5')).result).toBe(2);
  });

  it('rejects division by zero and malformed input', async () => {
    await expect(run('1 / 0')).rejects.toBeInstanceOf(ToolError);
    await expect(run('2 +')).rejects.toBeInstanceOf(ToolError);
    await expect(run('2 ** 3')).rejects.toBeInstanceOf(ToolError);
    await expect(run('drop table')).rejects.toBeInstanceOf(ToolError);
  });
});

describe('read_file tool (cwd sandbox)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'glamfire-tools-'));
    writeFileSync(join(dir, 'note.txt'), 'hello glamfire', 'utf8');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads a file inside the sandbox', async () => {
    const out = (await readFileTool.handler({ path: 'note.txt' }, { cwd: dir })) as {
      content: string;
      bytes: number;
    };
    expect(out.content).toBe('hello glamfire');
    expect(out.bytes).toBe(14);
  });

  it('rejects paths that escape the sandbox', async () => {
    await expect(
      readFileTool.handler({ path: '../../../etc/passwd' }, { cwd: dir }),
    ).rejects.toThrow(/escapes the sandbox/);
  });

  it('rejects an absolute path outside the sandbox', async () => {
    await expect(readFileTool.handler({ path: '/etc/hosts' }, { cwd: dir })).rejects.toThrow(
      /escapes the sandbox/,
    );
  });

  it('reports a missing file', async () => {
    await expect(readFileTool.handler({ path: 'nope.txt' }, { cwd: dir })).rejects.toThrow(
      /no such file/,
    );
  });
});

describe('permission gate (least-privilege defaults)', () => {
  const mk = (permission: ToolSpec['permission']): ToolSpec => ({
    name: `t-${permission}`,
    description: '',
    permission,
    parameters: {},
    handler: async () => ({}),
  });

  it('allows reads, asks on write/network, denies exec', () => {
    const p = defaultPolicy();
    expect(gate(p, mk('read'), {}).admitted).toBe(true);
    expect(gate(p, mk('exec'), {}).verdict).toBe('deny');
    expect(gate(p, mk('exec'), {}).admitted).toBe(false);
    // ask defaults to deny with no asker wired.
    expect(gate(p, mk('write'), {}).verdict).toBe('ask');
    expect(gate(p, mk('write'), {}).admitted).toBe(false);
  });

  it('honors an asker for ask verdicts', () => {
    const p = defaultPolicy({ asker: () => true });
    expect(gate(p, mk('write'), {}).admitted).toBe(true);
    expect(gate(p, mk('network'), {}).admitted).toBe(true);
  });

  it('lets a per-tool override win over the class default', () => {
    const p = defaultPolicy({ toolOverrides: { 't-exec': 'allow' } });
    expect(gate(p, mk('exec'), {}).admitted).toBe(true);
  });
});
