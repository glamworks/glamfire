// Tool registry + real, sandboxed built-in tools. Tools are declared once in
// neutral form (JSON-Schema args + a handler) and become available to every
// model through its adapter (SPEC §5.1).

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import type { ToolContext, ToolSpec } from './types.js';

/** A keyed collection of tools available to a run. */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolSpec>();

  register(tool: ToolSpec): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name);
  }

  list(): ToolSpec[] {
    return [...this.tools.values()];
  }
}

/** Thrown by a tool handler to return a recoverable error observation. */
export class ToolError extends Error {}

// --- filesystem sandbox (SPEC §5.1, §8) ------------------------------------
//
// Every filesystem tool resolves its path through `sandboxPath`. Path + content
// are treated as untrusted model output (§8 prompt-injection). Two layers of
// defense:
//   1. Lexical: reject `..` traversal and absolute paths outside the cwd root.
//   2. Symlink: resolve the real path of the deepest existing ancestor and
//      re-append the missing tail, so an in-sandbox symlink that points outside
//      the root (e.g. `root/link -> /etc`, then `link/passwd`) is rejected too.
// Returns the validated absolute path to operate on.

/** Real path of `target`, resolving symlinks on the deepest existing ancestor. */
function realResolved(target: string): string {
  const tail: string[] = [];
  let cur = target;
  for (;;) {
    try {
      const real = realpathSync(cur);
      return tail.length > 0 ? resolve(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return target; // reached fs root; nothing existed
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

/** Validate an untrusted path stays inside the run's cwd sandbox. */
function sandboxPath(rawPath: unknown, cwd: string): string {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new ToolError('argument "path" must be a non-empty string');
  }
  if (rawPath.includes('\0')) {
    throw new ToolError('path must not contain a NUL byte');
  }
  const root = resolve(cwd);
  const target = isAbsolute(rawPath) ? resolve(rawPath) : resolve(root, rawPath);
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new ToolError(`path "${rawPath}" escapes the sandbox (${root})`);
  }
  // Symlink-escape defense: compare against the real (symlink-resolved) root.
  const realRoot = realResolved(root);
  const realTarget = realResolved(target);
  const realRel = relative(realRoot, realTarget);
  if (realRel.startsWith('..') || isAbsolute(realRel)) {
    throw new ToolError(`path "${rawPath}" escapes the sandbox via a symlink (${root})`);
  }
  return target;
}

/**
 * read_file — reads a UTF-8 text file, scoped to the run's cwd sandbox.
 * Paths that escape the sandbox (via `..` or an absolute path outside cwd)
 * are rejected. Classified `read`: runs unattended under the default policy.
 */
export const readFileTool: ToolSpec = {
  name: 'read_file',
  description:
    'Read a UTF-8 text file from the working directory. Returns the file contents. ' +
    'The path must be inside the working directory.',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file, relative to the working directory.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>, ctx: ToolContext) => {
    const path = args.path as string;
    const target = sandboxPath(path, ctx.cwd);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(target);
    } catch {
      throw new ToolError(`no such file: ${path}`);
    }
    if (!stat.isFile()) {
      throw new ToolError(`not a regular file: ${path}`);
    }
    const maxBytes = 256 * 1024;
    if (stat.size > maxBytes) {
      throw new ToolError(`file too large (${stat.size} bytes > ${maxBytes} limit)`);
    }
    return { path, bytes: stat.size, content: readFileSync(target, 'utf8') };
  },
};

/**
 * calculator — evaluates a basic arithmetic expression deterministically.
 * Supports + - * / %, parentheses, unary minus, and decimal numbers. No
 * `eval`: a tiny shunting-yard parser, so it is safe and reproducible.
 * Classified `read` (pure, no side effects).
 */
export const calculatorTool: ToolSpec = {
  name: 'calculator',
  description:
    'Evaluate a basic arithmetic expression and return the numeric result. ' +
    'Supports + - * / %, parentheses, and decimals, e.g. "(2 + 3) * 4".',
  permission: 'read',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The arithmetic expression to evaluate.',
      },
    },
    required: ['expression'],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>) => {
    const expr = args.expression;
    if (typeof expr !== 'string' || expr.trim().length === 0) {
      throw new ToolError('argument "expression" must be a non-empty string');
    }
    const result = evalArithmetic(expr);
    return { expression: expr, result };
  },
};

// --- safe arithmetic (shunting-yard, no eval) ------------------------------

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'paren'; v: '(' | ')' };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i] as string;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j] as string)) j += 1;
      const slice = input.slice(i, j);
      const v = Number(slice);
      if (!Number.isFinite(v)) throw new ToolError(`invalid number "${slice}"`);
      tokens.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ t: 'paren', v: c });
      i += 1;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%') {
      tokens.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    throw new ToolError(`unexpected character "${c}" in expression`);
  }
  return tokens;
}

function evalArithmetic(input: string): number {
  const tokens = tokenize(input);
  const output: Tok[] = [];
  const ops: Tok[] = [];
  // Handle unary minus by tracking whether a value can appear next.
  let expectValue = true;
  for (const tok of tokens) {
    if (tok.t === 'num') {
      output.push(tok);
      expectValue = false;
    } else if (tok.t === 'op') {
      if (tok.v === '-' && expectValue) {
        // unary minus -> push 0 then treat as binary subtraction
        output.push({ t: 'num', v: 0 });
      }
      while (ops.length > 0) {
        const top = ops[ops.length - 1] as Tok;
        if (top.t === 'op' && (PRECEDENCE[top.v] as number) >= (PRECEDENCE[tok.v] as number)) {
          output.push(ops.pop() as Tok);
        } else break;
      }
      ops.push(tok);
      expectValue = true;
    } else if (tok.v === '(') {
      ops.push(tok);
      expectValue = true;
    } else {
      // ')'
      let matched = false;
      while (ops.length > 0) {
        const top = ops.pop() as Tok;
        if (top.t === 'paren' && top.v === '(') {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) throw new ToolError('unbalanced parentheses');
      expectValue = false;
    }
  }
  while (ops.length > 0) {
    const top = ops.pop() as Tok;
    if (top.t === 'paren') throw new ToolError('unbalanced parentheses');
    output.push(top);
  }

  const stack: number[] = [];
  for (const tok of output) {
    if (tok.t === 'num') {
      stack.push(tok.v);
    } else if (tok.t === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new ToolError('malformed expression');
      let r: number;
      switch (tok.v) {
        case '+':
          r = a + b;
          break;
        case '-':
          r = a - b;
          break;
        case '*':
          r = a * b;
          break;
        case '/':
          if (b === 0) throw new ToolError('division by zero');
          r = a / b;
          break;
        case '%':
          if (b === 0) throw new ToolError('division by zero');
          r = a % b;
          break;
        default:
          throw new ToolError(`unknown operator "${tok.v}"`);
      }
      stack.push(r);
    }
  }
  if (stack.length !== 1) throw new ToolError('malformed expression');
  return stack[0] as number;
}

// ---------------------------------------------------------------------------
// write_file — create/overwrite a UTF-8 file, scoped to the cwd sandbox.
// Classified `write`: the gate asks (and defaults to deny) before it runs, so a
// model can never silently mutate the workspace. Path + content are untrusted.
// ---------------------------------------------------------------------------

const MAX_WRITE_BYTES = 1024 * 1024; // 1 MiB cap on a single write.

export const writeFileTool: ToolSpec = {
  name: 'write_file',
  description:
    'Create or overwrite a UTF-8 text file in the working directory. Missing parent ' +
    'directories are created. The path must be inside the working directory. Returns ' +
    'the path and number of bytes written.',
  permission: 'write',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file, relative to the working directory.',
      },
      content: {
        type: 'string',
        description: 'Full UTF-8 contents to write (replaces any existing file).',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>, ctx: ToolContext) => {
    const content = args.content;
    if (typeof content !== 'string') {
      throw new ToolError('argument "content" must be a string');
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_WRITE_BYTES) {
      throw new ToolError(`content too large (${bytes} bytes > ${MAX_WRITE_BYTES} limit)`);
    }
    const target = sandboxPath(args.path, ctx.cwd);
    // Reject writing over an existing directory.
    try {
      if (statSync(target).isDirectory()) {
        throw new ToolError(`path "${args.path as string}" is a directory`);
      }
    } catch (err) {
      if (err instanceof ToolError) throw err;
      // ENOENT — target does not exist yet, which is fine for a create.
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    return { path: args.path, bytes };
  },
};

// ---------------------------------------------------------------------------
// edit_file — apply a single exact old->new replacement to an existing file,
// like a real code editor. The match must be unique: zero matches is an error,
// multiple matches is an error (the model must add surrounding context). Same
// sandbox scope + `write` permission as write_file.
// ---------------------------------------------------------------------------

const MAX_EDIT_BYTES = 256 * 1024; // mirror read_file's cap on the source.

export const editFileTool: ToolSpec = {
  name: 'edit_file',
  description:
    'Edit an existing UTF-8 text file by replacing an exact unique string. ' +
    '`old_string` must appear exactly once in the file (add surrounding context to ' +
    'disambiguate); it is replaced with `new_string`. Fails if the file does not ' +
    'exist, the match is missing, or the match is not unique. The path must be inside ' +
    'the working directory.',
  permission: 'write',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file, relative to the working directory.',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to find. Must match exactly once.',
      },
      new_string: {
        type: 'string',
        description: 'The text to replace it with.',
      },
    },
    required: ['path', 'old_string', 'new_string'],
    additionalProperties: false,
  },
  handler: async (args: Record<string, unknown>, ctx: ToolContext) => {
    const oldStr = args.old_string;
    const newStr = args.new_string;
    if (typeof oldStr !== 'string' || oldStr.length === 0) {
      throw new ToolError('argument "old_string" must be a non-empty string');
    }
    if (typeof newStr !== 'string') {
      throw new ToolError('argument "new_string" must be a string');
    }
    if (oldStr === newStr) {
      throw new ToolError('"old_string" and "new_string" are identical (no-op edit)');
    }
    const target = sandboxPath(args.path, ctx.cwd);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(target);
    } catch {
      throw new ToolError(`no such file: ${args.path as string}`);
    }
    if (!stat.isFile()) {
      throw new ToolError(`not a regular file: ${args.path as string}`);
    }
    if (stat.size > MAX_EDIT_BYTES) {
      throw new ToolError(`file too large (${stat.size} bytes > ${MAX_EDIT_BYTES} limit)`);
    }
    const before = readFileSync(target, 'utf8');
    // Count occurrences with a plain (non-regex) scan so the search string is
    // treated literally — untrusted input must never be compiled as a pattern.
    let count = 0;
    let from = before.indexOf(oldStr);
    while (from !== -1) {
      count += 1;
      from = before.indexOf(oldStr, from + oldStr.length);
    }
    if (count === 0) {
      throw new ToolError(`"old_string" not found in ${args.path as string}`);
    }
    if (count > 1) {
      throw new ToolError(
        `"old_string" matches ${count} times in ${args.path as string}; add surrounding context to make it unique`,
      );
    }
    const after = before.replace(oldStr, newStr);
    const bytes = Buffer.byteLength(after, 'utf8');
    if (bytes > MAX_WRITE_BYTES) {
      throw new ToolError(`result too large (${bytes} bytes > ${MAX_WRITE_BYTES} limit)`);
    }
    writeFileSync(target, after, 'utf8');
    return { path: args.path, replacements: 1, bytes };
  },
};

// ---------------------------------------------------------------------------
// run_command — execute an allowlisted program under a sandbox policy. This is
// the highest-risk tool, so it is defense-in-depth:
//   * Classified `exec` -> denied by default at the permission gate (loop.ts);
//     it only reaches this handler when the policy/asker explicitly admits it.
//   * No shell: the program + args are passed to `spawn` with shell:false, so
//     model-supplied strings can never be interpreted as shell syntax (no
//     injection). The program name is matched against an explicit allowlist
//     BEFORE spawn; anything off the list is rejected.
//   * cwd-scoped, with a wall-clock timeout, a captured-output cap, and an env
//     stripped of credential-shaped variables (least privilege, §8).
// ---------------------------------------------------------------------------

/** Sandbox policy for `run_command`. All bounds are enforced before/around spawn. */
export interface CommandPolicy {
  /** Program names (argv[0]) that may run. Matched exactly; no path separators. */
  allowlist: string[];
  /** Wall-clock timeout in milliseconds; the child is killed when it elapses. */
  timeoutMs: number;
  /** Cap on combined stdout+stderr bytes captured; output past it is truncated. */
  maxOutputBytes: number;
  /**
   * When false (default), credential-shaped env vars (API keys/tokens/secrets)
   * are stripped from the child's environment — defense in depth, since true
   * network isolation needs an OS sandbox (containers/namespaces, research/21).
   */
  allowNetwork: boolean;
}

/** A conservative, read-only-leaning default allowlist (dev/test/build commands). */
export const DEFAULT_COMMAND_ALLOWLIST: readonly string[] = [
  'node',
  'npm',
  'pnpm',
  'npx',
  'git',
  'ls',
  'cat',
  'echo',
  'pwd',
  'true',
];

/** Least-privilege default command policy. */
export function defaultCommandPolicy(overrides?: Partial<CommandPolicy>): CommandPolicy {
  return {
    allowlist: [...DEFAULT_COMMAND_ALLOWLIST],
    timeoutMs: 30_000,
    maxOutputBytes: 256 * 1024,
    allowNetwork: false,
    ...overrides,
  };
}

const SECRET_ENV_RE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|FIREWORKS|OPENAI|ANTHROPIC)/i;

/** Build the child environment, stripping credentials unless network is granted. */
function sandboxEnv(allowNetwork: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!allowNetwork) {
    for (const key of Object.keys(env)) {
      if (SECRET_ENV_RE.test(key)) delete env[key];
    }
  }
  return env;
}

interface CommandOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
}

function execInSandbox(
  program: string,
  argv: string[],
  policy: CommandPolicy,
  cwd: string,
): Promise<CommandOutcome> {
  return new Promise((resolveOutcome, rejectOutcome) => {
    const started = Date.now();
    const child = spawn(program, argv, {
      cwd,
      shell: false, // no shell -> no injection
      env: sandboxEnv(policy.allowNetwork),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let captured = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const collect = (which: 'out' | 'err') => (chunk: Buffer) => {
      const remaining = policy.maxOutputBytes - captured;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      let text: string;
      if (chunk.length > remaining) {
        text = chunk.subarray(0, remaining).toString('utf8');
        truncated = true;
      } else {
        text = chunk.toString('utf8');
      }
      captured += Buffer.byteLength(text, 'utf8');
      if (which === 'out') stdout += text;
      else stderr += text;
    };

    child.stdout.on('data', collect('out'));
    child.stderr.on('data', collect('err'));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, policy.timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectOutcome(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveOutcome({
        stdout,
        stderr,
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        truncated,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * Build a `run_command` tool bound to a sandbox policy. Provide an allowlist /
 * timeout / output cap to override the least-privilege defaults.
 */
export function createRunCommandTool(overrides?: Partial<CommandPolicy>): ToolSpec {
  const policy = defaultCommandPolicy(overrides);
  return {
    name: 'run_command',
    description: `Run an allowlisted program (e.g. test/build/git commands) in the working directory and return its exit code, stdout, and stderr. Provide the program name and an array of arguments separately — there is no shell. Allowed programs: ${policy.allowlist.join(', ')}.`,
    permission: 'exec',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Program to run (must be on the allowlist; no path separators).',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Arguments passed literally to the program (no shell expansion).',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    handler: async (args: Record<string, unknown>, ctx: ToolContext) => {
      const program = args.command;
      if (typeof program !== 'string' || program.length === 0) {
        throw new ToolError('argument "command" must be a non-empty string');
      }
      // Allowlist + shape checks run BEFORE any spawn (defense in depth).
      if (program.includes('/') || program.includes('\\')) {
        throw new ToolError('command must be a bare program name (no path separators)');
      }
      if (!policy.allowlist.includes(program)) {
        throw new ToolError(
          `command "${program}" is not on the allowlist (${policy.allowlist.join(', ')})`,
        );
      }
      const rawArgs = args.args ?? [];
      if (!Array.isArray(rawArgs) || !rawArgs.every((a) => typeof a === 'string')) {
        throw new ToolError('argument "args" must be an array of strings');
      }
      const argv = rawArgs as string[];

      let outcome: CommandOutcome;
      try {
        outcome = await execInSandbox(program, argv, policy, resolve(ctx.cwd));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ToolError(`failed to start "${program}": ${msg}`);
      }
      return {
        command: program,
        args: argv,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        timedOut: outcome.timedOut,
        truncated: outcome.truncated,
        durationMs: outcome.durationMs,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
      };
    },
  };
}

/** A standalone `run_command` tool with the default sandbox policy. */
export const runCommandTool: ToolSpec = createRunCommandTool();

/**
 * A registry pre-loaded with the built-in tools. The edit/exec tools are always
 * registered, but the permission gate keeps them least-privilege by default:
 * `write_file`/`edit_file` are `write` (ask -> deny without approval) and
 * `run_command` is `exec` (denied unless the policy explicitly admits it).
 * Pass a `command` policy to tune the allowlist / timeout / output cap.
 */
export function builtinTools(opts?: { command?: Partial<CommandPolicy> }): ToolRegistry {
  return new ToolRegistry()
    .register(readFileTool)
    .register(calculatorTool)
    .register(writeFileTool)
    .register(editFileTool)
    .register(createRunCommandTool(opts?.command));
}
