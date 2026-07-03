// launch.test.mjs — drive the REAL `glam launch` logic over real sockets.
// No mocks: a real `glam serve` is spawned (port 0, ephemeral) over real
// sockets, and a real fake-`claude` script (on disk, exec'd by Node) records
// the argv + env it actually received. The only thing swapped is the `claude`
// binary itself (a temp script that exits 0 and writes what it saw to a file).
//
// Mirrors proxy-server.test.mjs style: real local upstream, real sockets.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLaunchEnv, runLaunch } from '../src/launch.mjs';

const VERSION = '0.0.0-test';
const cli = join(process.cwd(), 'packages', 'cli', 'src', 'index.mjs');

// --- a fake `claude` binary: a temp Node script that records argv + env ------
// `spawnClaude` is the absolute path to this script; runLaunch execs it for real
// (real spawn, real env, real exit) so we assert what the child ACTUALLY saw,
// not what the parent passed.
function makeFakeClaude(recordingDir) {
  mkdirSync(recordingDir, { recursive: true });
  const scriptPath = join(recordingDir, 'fake-claude.mjs');
  const recordPath = join(recordingDir, 'claude-saw.json');
  // The script writes { argv, env subset, cwd } and exits 0. Run via
  // `node scriptPath ...passthrough` so no executable bit is needed.
  writeFileSync(
    scriptPath,
    `import { writeFileSync } from 'node:fs';
const record = {
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
  ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  ANTHROPIC_CUSTOM_MODEL_OPTION: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION,
  ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME,
  ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION,
  ANTHROPIC_SMALL_FAST_MODEL: process.env.ANTHROPIC_SMALL_FAST_MODEL,
};
writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(record, null, 2) + '\\n');
`,
  );
  return { scriptPath, recordPath };
}

function readRecord(recordPath) {
  return JSON.parse(readFileSync(recordPath, 'utf8'));
}

// --- spawn a real `glam serve` on an ephemeral port (the "pre-existing" one) -
function startServe({ home, env, token }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'serve', '--port', '0', '--token', token], {
      env: { ...env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        child.kill('SIGKILL');
      } catch {}
      reject(new Error(`serve did not start in time:\n${out}`));
    }, 20000);
    const onChunk = (c) => {
      out += String(c);
      const m = out.match(/listening: (http:\/\/[^\s]+)/);
      if (m && !done) {
        done = true;
        clearTimeout(timer);
        resolve({ child, url: m[1], output: () => out });
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('exit', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error(`serve exited before listening:\n${out}`));
    });
  });
}

let workDir;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'glam-launch-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// Capture stdout/stderr into strings for assertion.
function makeStreams() {
  const chunks = { out: '', err: '' };
  const stdout = {
    isTTY: false,
    write: (s) => {
      chunks.out += String(s);
      return true;
    },
    on() {},
    removeListener() {},
    off() {},
  };
  const stderr = {
    isTTY: false,
    write: (s) => {
      chunks.err += String(s);
      return true;
    },
    on() {},
    removeListener() {},
    off() {},
  };
  return { stdout, stderr, chunks };
}

describe('buildLaunchEnv (pure)', () => {
  it('sets every required var with the friendly name and id', () => {
    const env = buildLaunchEnv({ serveUrl: 'http://127.0.0.1:4114', token: 'tok-123' });
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:4114');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('tok-123');
    expect(env.ANTHROPIC_MODEL).toBe('glm-5.2');
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION).toBe('glm-5.2');
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME).toBe('GLM 5.2 (via glamfire)');
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION).toContain('GLM 5.2');
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe('glm-5.2');
  });

  it('merges over baseEnv without clobbering unrelated vars', () => {
    const env = buildLaunchEnv({
      serveUrl: 'http://127.0.0.1:9999',
      token: 't',
      baseEnv: { PATH: '/usr/bin', HOME: '/h', FIREWORKS_API_KEY: 'k' },
    });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.FIREWORKS_API_KEY).toBe('k');
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:9999');
  });

  it('honors caller-supplied model id / display name overrides', () => {
    const env = buildLaunchEnv({
      serveUrl: 'http://h',
      token: 't',
      modelId: 'custom-id',
      displayName: 'Custom Display',
    });
    expect(env.ANTHROPIC_MODEL).toBe('custom-id');
    expect(env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME).toBe('Custom Display');
  });
});

describe('integration selection', () => {
  it('unknown integration → exit 2 + did-you-mean for a close typo', async () => {
    const { stdout, stderr, chunks } = makeStreams();
    const code = await runLaunch(['claud'], {
      version: VERSION,
      stdout,
      stderr,
      spawnClaude: '/nope',
    });
    expect(code).toBe(2);
    expect(chunks.err).toContain('not yet supported');
    expect(chunks.err).toContain('Did you mean `glam launch claude`');
  });

  it('garbage integration → exit 2, no misleading suggestion', async () => {
    const { stdout, stderr, chunks } = makeStreams();
    const code = await runLaunch(['bogus'], {
      version: VERSION,
      stdout,
      stderr,
      spawnClaude: '/nope',
    });
    expect(code).toBe(2);
    expect(chunks.err).toContain('not yet supported');
    expect(chunks.err).toContain('Supported integrations: claude');
  });

  it('missing integration → exit 2', async () => {
    const { stdout, stderr, chunks } = makeStreams();
    const code = await runLaunch([], { version: VERSION, stdout, stderr, spawnClaude: '/nope' });
    expect(code).toBe(2);
    expect(chunks.err).toContain('missing integration name');
  });

  it('--help lists claude and documents the env vars + auto-serve', async () => {
    const { stdout, stderr, chunks } = makeStreams();
    const code = await runLaunch(['--help'], { version: VERSION, stdout, stderr });
    expect(code).toBe(0);
    expect(chunks.out).toContain('claude');
    expect(chunks.out).toContain('ANTHROPIC_BASE_URL');
    expect(chunks.out).toContain('ANTHROPIC_CUSTOM_MODEL_OPTION_NAME');
    expect(chunks.out).toContain('auto-starts');
  });

  it('a bare arg after the integration (no --) is a usage error', async () => {
    const { stdout, stderr, chunks } = makeStreams();
    const code = await runLaunch(['claude', '-p', 'hi'], {
      version: VERSION,
      stdout,
      stderr,
      spawnClaude: '/nope',
    });
    expect(code).toBe(2);
    expect(chunks.err).toContain('unexpected argument');
    expect(chunks.err).toContain('use `--`');
  });
});

describe('serve-down path: auto-starts glam serve, parses token+url, tears down', () => {
  it('spawns serve, execs the fake claude with the honest env, kills serve on exit', async () => {
    const home = join(workDir, 'home-down');
    mkdirSync(join(home, '.glam'), { recursive: true });
    const rec = makeFakeClaude(workDir);
    const { stdout, stderr, chunks } = makeStreams();
    // Use --port 0 so we never collide with a real 4114 anywhere.
    const code = await runLaunch(['claude', '--port', '0', '--', '-p', 'hi'], {
      version: VERSION,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FIREWORKS_API_KEY: 'test-key-launch-down',
        // Ensure no stale GLAM_SERVE_TOKEN leaks in from the test runner env.
        GLAM_SERVE_TOKEN: '',
      },
      stdout,
      stderr,
      spawnClaude: rec.scriptPath,
    });

    expect(code).toBe(0);
    // Banner shows started-by-us.
    expect(chunks.out).toContain('started by glamfire');
    // The fake claude actually received the honest env block.
    const saw = readRecord(rec.recordPath);
    expect(saw.ANTHROPIC_BASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(saw.ANTHROPIC_AUTH_TOKEN.length).toBeGreaterThanOrEqual(8);
    expect(saw.ANTHROPIC_MODEL).toBe('glm-5.2');
    expect(saw.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME).toBe('GLM 5.2 (via glamfire)');
    expect(saw.ANTHROPIC_SMALL_FAST_MODEL).toBe('glm-5.2');
    // Passthrough args reached the child verbatim.
    expect(saw.argv).toEqual(['-p', 'hi']);
    // Teardown: the serve WE started must be gone after claude exits.
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 1000);
    try {
      await fetch(`${saw.ANTHROPIC_BASE_URL}/healthz`, { signal: ctrl.signal });
      throw new Error('serve was still reachable after launch returned (teardown failed)');
    } catch (err) {
      if (err.message.includes('still reachable')) throw err;
      // Connection refused / aborted = serve is down. Good.
    }
  }, 30000);
});

describe('serve-up path: reuses a running serve, no second spawn, no kill', () => {
  it('reuses the pre-existing serve via GLAM_SERVE_TOKEN and leaves it running', async () => {
    const home = join(workDir, 'home-up');
    mkdirSync(join(home, '.glam'), { recursive: true });
    const token = 'reuse-token-abc123';
    const started = await startServe({
      home,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FIREWORKS_API_KEY: 'test-key-launch-up',
      },
      token,
    });
    try {
      const rec = makeFakeClaude(join(workDir, 'up'));
      const { stdout, stderr, chunks } = makeStreams();
      // Derive the port the pre-existing serve actually bound (ephemeral).
      const port = String(started.url).match(/:(\d+)$/)[1];
      const code = await runLaunch(['claude', '--port', port, '--', '--model', 'foo'], {
        version: VERSION,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FIREWORKS_API_KEY: 'test-key-launch-up',
          GLAM_SERVE_TOKEN: token,
        },
        stdout,
        stderr,
        spawnClaude: rec.scriptPath,
      });

      expect(code).toBe(0);
      expect(chunks.out).toContain('reused');
      expect(chunks.out).not.toContain('started by glamfire');
      const saw = readRecord(rec.recordPath);
      expect(saw.ANTHROPIC_BASE_URL).toBe(started.url);
      expect(saw.ANTHROPIC_AUTH_TOKEN).toBe(token);
      expect(saw.argv).toEqual(['--model', 'foo']);
      // The pre-existing serve must still be alive after launch returned.
      expect(started.child.exitCode).toBeNull();
      expect(started.child.killed).toBe(false);
    } finally {
      try {
        started.child.kill('SIGKILL');
      } catch {}
    }
  }, 30000);

  it('serve up but GLAM_SERVE_TOKEN unset → exit 1 with a clear export hint', async () => {
    const home = join(workDir, 'home-up-notoken');
    mkdirSync(join(home, '.glam'), { recursive: true });
    const token = 'notoken-token-xyz';
    const started = await startServe({
      home,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FIREWORKS_API_KEY: 'test-key-launch-notoken',
      },
      token,
    });
    try {
      const { stdout, stderr, chunks } = makeStreams();
      const port = String(started.url).match(/:(\d+)$/)[1];
      const code = await runLaunch(['claude', '--port', port], {
        version: VERSION,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FIREWORKS_API_KEY: 'test-key-launch-notoken',
          // GLAM_SERVE_TOKEN deliberately unset.
          GLAM_SERVE_TOKEN: '',
        },
        stdout,
        stderr,
        spawnClaude: '/nope',
      });
      expect(code).toBe(1);
      expect(chunks.err).toContain('GLAM_SERVE_TOKEN is not set');
      expect(chunks.err).toContain('export GLAM_SERVE_TOKEN');
      // Pre-existing serve untouched.
      expect(started.child.exitCode).toBeNull();
    } finally {
      try {
        started.child.kill('SIGKILL');
      } catch {}
    }
  }, 30000);
});

describe('passthrough args', () => {
  it('everything after -- reaches claude verbatim, including --model and --help', async () => {
    const home = join(workDir, 'home-pass');
    mkdirSync(join(home, '.glam'), { recursive: true });
    const rec = makeFakeClaude(join(workDir, 'pass'));
    const { stdout, stderr } = makeStreams();
    const code = await runLaunch(
      ['claude', '--port', '0', '--', '--model', 'foo', '--help', '-p', 'x'],
      {
        version: VERSION,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FIREWORKS_API_KEY: 'test-key-launch-pass',
          GLAM_SERVE_TOKEN: '',
        },
        stdout,
        stderr,
        spawnClaude: rec.scriptPath,
      },
    );
    expect(code).toBe(0);
    const saw = readRecord(rec.recordPath);
    expect(saw.argv).toEqual(['--model', 'foo', '--help', '-p', 'x']);
  }, 30000);

  it('no args after -- → claude receives an empty argv', async () => {
    const home = join(workDir, 'home-noargs');
    mkdirSync(join(home, '.glam'), { recursive: true });
    const rec = makeFakeClaude(join(workDir, 'noargs'));
    const { stdout, stderr } = makeStreams();
    const code = await runLaunch(['claude', '--port', '0', '--'], {
      version: VERSION,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FIREWORKS_API_KEY: 'test-key-launch-noargs',
        GLAM_SERVE_TOKEN: '',
      },
      stdout,
      stderr,
      spawnClaude: rec.scriptPath,
    });
    expect(code).toBe(0);
    const saw = readRecord(rec.recordPath);
    expect(saw.argv).toEqual([]);
  }, 30000);
});
