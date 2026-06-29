// Tests for the built-in tools and the permission gate — all real behavior.

import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CommandPolicy,
  ToolError,
  type ToolSpec,
  calculatorTool,
  createRunCommandTool,
  defaultCommandPolicy,
  defaultPolicy,
  editFileTool,
  gate,
  readFileTool,
  writeFileTool,
} from '@glamfire/engine';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describe('write_file tool (cwd sandbox, write-classed)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'glamfire-write-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is classified write so the gate asks (deny by default)', () => {
    expect(writeFileTool.permission).toBe('write');
    expect(gate(defaultPolicy(), writeFileTool, { path: 'a', content: 'b' }).admitted).toBe(false);
  });

  it('creates a new file (and missing parent dirs) inside the sandbox', async () => {
    const out = (await writeFileTool.handler(
      { path: 'sub/dir/hello.txt', content: 'hi there' },
      { cwd: dir },
    )) as { path: string; bytes: number };
    expect(out.bytes).toBe(8);
    expect(readFileSync(join(dir, 'sub/dir/hello.txt'), 'utf8')).toBe('hi there');
  });

  it('overwrites an existing file', async () => {
    writeFileSync(join(dir, 'f.txt'), 'old', 'utf8');
    await writeFileTool.handler({ path: 'f.txt', content: 'new' }, { cwd: dir });
    expect(readFileSync(join(dir, 'f.txt'), 'utf8')).toBe('new');
  });

  it('rejects path traversal and absolute escapes', async () => {
    await expect(
      writeFileTool.handler({ path: '../escape.txt', content: 'x' }, { cwd: dir }),
    ).rejects.toThrow(/escapes the sandbox/);
    await expect(
      writeFileTool.handler({ path: '/tmp/evil.txt', content: 'x' }, { cwd: dir }),
    ).rejects.toThrow(/escapes the sandbox/);
  });

  it('rejects a write that escapes via an in-sandbox symlink', async () => {
    // `dir/link` -> the system tmp root (outside the sandbox).
    const outside = mkdtempSync(join(tmpdir(), 'glamfire-outside-'));
    try {
      symlinkSync(outside, join(dir, 'link'), 'dir');
      await expect(
        writeFileTool.handler({ path: 'link/pwned.txt', content: 'x' }, { cwd: dir }),
      ).rejects.toThrow(/escapes the sandbox/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects writing over a directory and oversized content', async () => {
    await expect(writeFileTool.handler({ path: '.', content: 'x' }, { cwd: dir })).rejects.toThrow(
      /escapes the sandbox/,
    );
    const huge = 'a'.repeat(1024 * 1024 + 1);
    await expect(
      writeFileTool.handler({ path: 'big.txt', content: huge }, { cwd: dir }),
    ).rejects.toThrow(/too large/);
  });
});

describe('edit_file tool (exact unique replacement)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'glamfire-edit-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is classified write', () => {
    expect(editFileTool.permission).toBe('write');
  });

  it('replaces a unique occurrence for real', async () => {
    writeFileSync(join(dir, 'code.ts'), 'const answer = 41;\n', 'utf8');
    const out = (await editFileTool.handler(
      { path: 'code.ts', old_string: '41', new_string: '42' },
      { cwd: dir },
    )) as { replacements: number };
    expect(out.replacements).toBe(1);
    expect(readFileSync(join(dir, 'code.ts'), 'utf8')).toBe('const answer = 42;\n');
  });

  it('fails when the match is not found', async () => {
    writeFileSync(join(dir, 'f.txt'), 'hello', 'utf8');
    await expect(
      editFileTool.handler({ path: 'f.txt', old_string: 'xyz', new_string: 'q' }, { cwd: dir }),
    ).rejects.toThrow(/not found/);
  });

  it('fails when the match is not unique', async () => {
    writeFileSync(join(dir, 'f.txt'), 'a a a', 'utf8');
    await expect(
      editFileTool.handler({ path: 'f.txt', old_string: 'a', new_string: 'b' }, { cwd: dir }),
    ).rejects.toThrow(/matches 3 times/);
  });

  it('fails on a missing file and a no-op edit', async () => {
    await expect(
      editFileTool.handler({ path: 'nope.txt', old_string: 'a', new_string: 'b' }, { cwd: dir }),
    ).rejects.toThrow(/no such file/);
    writeFileSync(join(dir, 'f.txt'), 'a', 'utf8');
    await expect(
      editFileTool.handler({ path: 'f.txt', old_string: 'a', new_string: 'a' }, { cwd: dir }),
    ).rejects.toThrow(/identical/);
  });

  it('treats old_string literally, not as a regex', async () => {
    writeFileSync(join(dir, 'f.txt'), 'value = a.b;\n', 'utf8');
    await editFileTool.handler({ path: 'f.txt', old_string: 'a.b', new_string: 'c' }, { cwd: dir });
    expect(readFileSync(join(dir, 'f.txt'), 'utf8')).toBe('value = c;\n');
  });

  it('refuses to edit outside the sandbox', async () => {
    await expect(
      editFileTool.handler(
        { path: '../../etc/hosts', old_string: 'x', new_string: 'y' },
        { cwd: dir },
      ),
    ).rejects.toThrow(/escapes the sandbox/);
  });
});

describe('run_command tool (exec-classed sandbox)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'glamfire-exec-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is classified exec so the gate denies it by default', () => {
    const tool = createRunCommandTool();
    expect(tool.permission).toBe('exec');
    const v = gate(defaultPolicy(), tool, { command: 'node' });
    expect(v.verdict).toBe('deny');
    expect(v.admitted).toBe(false);
    // Even with an asker wired, a deny verdict is not negotiable.
    expect(gate(defaultPolicy({ asker: () => true }), tool, { command: 'node' }).admitted).toBe(
      false,
    );
  });

  it('runs an allowlisted command and captures stdout + exit code', async () => {
    const tool = createRunCommandTool();
    const out = (await tool.handler(
      { command: 'node', args: ['-e', 'process.stdout.write("ok")'] },
      { cwd: dir },
    )) as { exitCode: number; stdout: string };
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('ok');
  });

  it('reports a non-zero exit without throwing (an observation, not a tool error)', async () => {
    const tool = createRunCommandTool();
    const out = (await tool.handler(
      { command: 'node', args: ['-e', 'process.exit(3)'] },
      { cwd: dir },
    )) as { exitCode: number };
    expect(out.exitCode).toBe(3);
  });

  it('rejects a command that is not on the allowlist BEFORE spawning', async () => {
    const tool = createRunCommandTool();
    await expect(tool.handler({ command: 'rm', args: ['-rf', '/'] }, { cwd: dir })).rejects.toThrow(
      /not on the allowlist/,
    );
  });

  it('rejects a program with path separators (no absolute-binary execution)', async () => {
    const tool = createRunCommandTool({ allowlist: ['/bin/sh'] as unknown as string[] });
    await expect(
      tool.handler({ command: '/bin/sh', args: ['-c', 'echo hi'] }, { cwd: dir }),
    ).rejects.toThrow(/no path separators/);
  });

  it('does not interpret shell metacharacters (no injection)', async () => {
    const tool = createRunCommandTool();
    // If a shell ran this, `&& echo HACKED` would chain a second command and
    // print HACKED. With shell:false it is just an inert extra argv entry that
    // node ignores, so stdout is exactly what the script wrote.
    const out = (await tool.handler(
      { command: 'node', args: ['-e', "process.stdout.write('clean')", '&& echo HACKED'] },
      { cwd: dir },
    )) as { stdout: string };
    expect(out.stdout).toBe('clean');
    expect(out.stdout).not.toContain('HACKED');
  });

  it('enforces a timeout and kills the child', async () => {
    const tool = createRunCommandTool({ timeoutMs: 200 });
    const out = (await tool.handler(
      { command: 'node', args: ['-e', 'setTimeout(() => {}, 10000)'] },
      { cwd: dir },
    )) as { timedOut: boolean };
    expect(out.timedOut).toBe(true);
  });

  it('caps captured output', async () => {
    const tool = createRunCommandTool({ maxOutputBytes: 64 });
    const out = (await tool.handler(
      { command: 'node', args: ['-e', 'process.stdout.write("z".repeat(10000))'] },
      { cwd: dir },
    )) as { stdout: string; truncated: boolean };
    expect(out.truncated).toBe(true);
    expect(out.stdout.length).toBeLessThanOrEqual(64);
  });

  it('strips credential-shaped env vars from the child by default', async () => {
    const tool = createRunCommandTool();
    process.env.GLAMFIRE_TEST_SECRET_TOKEN = 'super-secret';
    try {
      const out = (await tool.handler(
        {
          command: 'node',
          args: ['-e', 'process.stdout.write(String(process.env.GLAMFIRE_TEST_SECRET_TOKEN))'],
        },
        { cwd: dir },
      )) as { stdout: string };
      expect(out.stdout).toBe('undefined');
    } finally {
      process.env.GLAMFIRE_TEST_SECRET_TOKEN = undefined;
    }
  });

  it('exposes a least-privilege default policy', () => {
    const p: CommandPolicy = defaultCommandPolicy();
    expect(p.allowNetwork).toBe(false);
    expect(p.allowlist).toContain('node');
    expect(p.allowlist).not.toContain('rm');
    expect(p.timeoutMs).toBeGreaterThan(0);
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
