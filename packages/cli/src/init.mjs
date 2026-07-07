// `glam init` — scaffold a starter AGENTS.md at the project root (issue #42).
//
// AGENTS.md is the open convention for a project's standing agent contract —
// the markdown a team keeps at the repo root so any coding agent (glamfire,
// Claude Code, opencode, Cursor, …) starts from the same project ground truth.
// `glam run` reads it into the run context automatically; this command writes a
// honest, minimal starter so a fresh project has one to edit.
//
// Real and full-stack: writes a real file to disk (no dry-run-only stub). It
// refuses to clobber an existing AGENTS.md (or, with --force, overwrites after
// backing up to AGENTS.md.bak). CLAUDE.md is never touched here — it remains the
// legacy fallback `glam run` reads when no AGENTS.md exists.

import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CODES, color, useColor } from './ui.mjs';

const { DIM, FLAME, GREEN, YELLOW } = CODES;

const INIT_HELP = `glam init — scaffold a starter AGENTS.md at the project root.

Usage: glam init [options]

AGENTS.md is the open convention for a project's standing agent contract: the
markdown any coding agent reads for project ground truth. \`glam run\` loads it
into the run context automatically (falling back to CLAUDE.md when no AGENTS.md
exists). This command writes a minimal, honest starter you can edit.

Options:
  --force            Overwrite an existing AGENTS.md (backs up the old one to
                     AGENTS.md.bak first). Without --force, an existing file is
                     left untouched and the command exits 0.
  --path <path>      Where to write AGENTS.md (default: ./AGENTS.md, relative
                     to the cwd).
  -h, --help         Show this help

Exit codes:
  0  done          the file exists / was written
  1  error         write failed
  2  usage error   bad flags
`;

const STARTER = `# AGENTS.md

> Standing instructions for any coding agent working in this repo. glamfire
> reads this file into every run's context automatically (CLAUDE.md is used as
> a fallback when this file is absent). Edit it to match your project.

## Project

<!-- One paragraph: what this project is and what it is not. -->

## How to work here

- Read the relevant code before changing it; do not guess at structure.
- Make real, end-to-end changes — no stubs, no mocks standing in for behavior.
- Run the gates before calling anything done: build, lint, type, tests, smoke.
- Leave the tree clean: remove temp files, dead branches, scratch dirs.

## Conventions

<!-- Coding style, naming, commit message format, branch naming. -->

## Things to know

<!-- Non-obvious facts a fresh agent would get wrong without being told. -->
`;

function parseArgs(args) {
  const opts = { force: false, path: 'AGENTS.md' };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = () => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`option ${a} requires a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--path':
        opts.path = next();
        break;
      default:
        throw new Error(`unknown option "${a}"`);
    }
  }
  return opts;
}

export async function cmdInit(argv, { version }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam init: ${err.message}\nRun \`glam init --help\`.\n`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    process.stdout.write(INIT_HELP);
    return;
  }

  const useColorOut = useColor(process.stdout);
  const target = resolve(process.cwd(), opts.path);
  const rel = opts.path;

  process.stdout.write(
    `${color(useColorOut, FLAME, `glamfire ${version}`)} ${color(useColorOut, DIM, '· init')}\n`,
  );

  if (existsSync(target)) {
    if (!opts.force) {
      process.stdout.write(
        `${color(useColorOut, YELLOW, 'exists')} · ${rel} already present — left untouched.\nEdit it directly, or re-run with --force to overwrite (the old file is backed up first).\n`,
      );
      return;
    }
    const backup = `${target}.bak`;
    try {
      renameSync(target, backup);
    } catch (err) {
      process.stderr.write(`glam init: could not back up existing ${rel}: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(color(useColorOut, DIM, `backed up existing file → ${rel}.bak\n`));
  }

  try {
    writeFileSync(target, STARTER, 'utf8');
  } catch (err) {
    process.stderr.write(`glam init: could not write ${rel}: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${color(useColorOut, GREEN, 'wrote')} · ${rel} — a starter AGENTS.md.\n${color(useColorOut, DIM, `Edit it to match your project; \`glam run\` will load it into every run's context.\n`)}`,
  );
}
