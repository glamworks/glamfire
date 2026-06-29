// Tool registry + real, sandboxed built-in tools. Tools are declared once in
// neutral form (JSON-Schema args + a handler) and become available to every
// model through its adapter (SPEC §5.1).

import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
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
    const path = args.path;
    if (typeof path !== 'string' || path.length === 0) {
      throw new ToolError('argument "path" must be a non-empty string');
    }
    const root = resolve(ctx.cwd);
    const target = isAbsolute(path) ? resolve(path) : resolve(root, path);
    const rel = relative(root, target);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new ToolError(`path "${path}" escapes the sandbox (${root})`);
    }
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

/** A registry pre-loaded with the built-in tools. */
export function builtinTools(): ToolRegistry {
  return new ToolRegistry().register(readFileTool).register(calculatorTool);
}
