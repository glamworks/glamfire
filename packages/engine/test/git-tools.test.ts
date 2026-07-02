// Tests for the read-only git inspection tools — real behavior against a real,
// hermetic temp git repository (no network, no API key). The whole suite skips
// gracefully if `git` is not on PATH.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ToolError,
  type ToolSpec,
  builtinTools,
  defaultPolicy,
  gate,
  gitDiffTool,
  gitLogTool,
  gitShowTool,
  gitStatusTool,
} from '@glamfire/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** True when a usable `git` binary is on PATH. */
function hasGit(): boolean {
  const r = spawnSync('git', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

const GIT_AVAILABLE = hasGit();
// Skip the whole suite (cleanly) when git is unavailable; it is present in CI.
const describeGit = GIT_AVAILABLE ? describe : describe.skip;

/** Run git in `cwd` for test setup (fails loudly — this is not under test). */
function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    // Deterministic identity/branch so the repo is reproducible on any machine.
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

interface StatusResult {
  branch: string;
  changes: { status: string; path: string }[];
  clean: boolean;
}

describeGit('read-only git tools (real temp repo)', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'glamfire-git-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.name', 'Test');
    git(dir, 'config', 'user.email', 'test@example.com');
    writeFileSync(join(dir, 'a.txt'), 'first line\n', 'utf8');
    git(dir, 'add', 'a.txt');
    git(dir, 'commit', '-q', '-m', 'initial commit');
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('git_status reports a clean tree on the right branch', async () => {
    const out = (await gitStatusTool.handler({}, { cwd: dir })) as StatusResult;
    expect(out.branch).toBe('main');
    expect(out.clean).toBe(true);
    expect(out.changes).toEqual([]);
  });

  it('git_status reports a dirty tree after an edit', async () => {
    writeFileSync(join(dir, 'a.txt'), 'first line\nsecond line\n', 'utf8');
    const out = (await gitStatusTool.handler({}, { cwd: dir })) as StatusResult;
    expect(out.clean).toBe(false);
    expect(out.changes.some((c) => c.path === 'a.txt' && c.status.includes('M'))).toBe(true);
  });

  it('git_diff shows the unstaged edit, then the staged diff after add', async () => {
    const unstaged = (await gitDiffTool.handler({}, { cwd: dir })) as {
      diff: string;
      truncated: boolean;
    };
    expect(unstaged.diff).toContain('+second line');
    expect(unstaged.truncated).toBe(false);

    // Nothing staged yet.
    const stagedEmpty = (await gitDiffTool.handler({ staged: true }, { cwd: dir })) as {
      diff: string;
    };
    expect(stagedEmpty.diff).toBe('');

    git(dir, 'add', 'a.txt');
    const staged = (await gitDiffTool.handler({ staged: true }, { cwd: dir })) as { diff: string };
    expect(staged.diff).toContain('+second line');
  });

  it('git_diff caps output at maxBytes and reports truncation', async () => {
    const out = (await gitDiffTool.handler({ staged: true, maxBytes: 8 }, { cwd: dir })) as {
      diff: string;
      truncated: boolean;
    };
    expect(out.truncated).toBe(true);
    expect(Buffer.byteLength(out.diff, 'utf8')).toBeLessThanOrEqual(8);
  });

  it('git_log returns commits newest first', async () => {
    // Commit the staged change so there are two commits.
    git(dir, 'commit', '-q', '-m', 'add second line');
    const out = (await gitLogTool.handler({}, { cwd: dir })) as {
      commits: { hash: string; subject: string }[];
    };
    expect(out.commits.length).toBe(2);
    expect(out.commits[0]?.subject).toBe('add second line');
    expect(out.commits[1]?.subject).toBe('initial commit');
    expect(out.commits[0]?.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('git_log honors maxCount', async () => {
    const out = (await gitLogTool.handler({ maxCount: 1 }, { cwd: dir })) as {
      commits: { hash: string; subject: string }[];
    };
    expect(out.commits.length).toBe(1);
    expect(out.commits[0]?.subject).toBe('add second line');
  });

  it('git_show returns diffstat output for HEAD', async () => {
    const out = (await gitShowTool.handler({ ref: 'HEAD' }, { cwd: dir })) as {
      ref: string;
      output: string;
      truncated: boolean;
    };
    expect(out.ref).toBe('HEAD');
    expect(out.output).toContain('add second line');
    expect(out.output).toContain('a.txt');
    // --stat output, not a full patch: no diff body markers.
    expect(out.output).not.toContain('+second line');
  });

  it('rejects option-injection / traversal in pathspec', async () => {
    await expect(
      gitStatusTool.handler({ pathspec: '--output=/tmp/x' }, { cwd: dir }),
    ).rejects.toBeInstanceOf(ToolError);
    await expect(
      gitDiffTool.handler({ pathspec: '../escape' }, { cwd: dir }),
    ).rejects.toBeInstanceOf(ToolError);
    await expect(gitLogTool.handler({ pathspec: '-n99' }, { cwd: dir })).rejects.toBeInstanceOf(
      ToolError,
    );
  });

  it('rejects unsafe refs (leading dash, "..", bad chars)', async () => {
    await expect(
      gitShowTool.handler({ ref: '--upload-pack=x' }, { cwd: dir }),
    ).rejects.toBeInstanceOf(ToolError);
    await expect(gitShowTool.handler({ ref: 'HEAD~1..HEAD' }, { cwd: dir })).rejects.toBeInstanceOf(
      ToolError,
    );
    await expect(gitShowTool.handler({ ref: 'a b; rm -rf' }, { cwd: dir })).rejects.toBeInstanceOf(
      ToolError,
    );
    await expect(gitShowTool.handler({ ref: '' }, { cwd: dir })).rejects.toBeInstanceOf(ToolError);
  });

  it('a non-git directory yields a clean tool error (not a crash)', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'glamfire-nogit-'));
    try {
      await expect(gitStatusTool.handler({}, { cwd: plain })).rejects.toBeInstanceOf(ToolError);
      await expect(gitLogTool.handler({}, { cwd: plain })).rejects.toBeInstanceOf(ToolError);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('git tools are wired into builtinTools() as read-permission tools', () => {
  it('registers git_status/git_diff/git_log/git_show and the gate admits them unattended', () => {
    const reg = builtinTools();
    const p = defaultPolicy();
    for (const name of ['git_status', 'git_diff', 'git_log', 'git_show']) {
      const tool = reg.get(name);
      expect(tool?.permission).toBe('read');
      expect(gate(p, tool as ToolSpec, {}).admitted).toBe(true);
    }
  });
});
