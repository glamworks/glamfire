// Project instructions ingestion (issue #42, SPEC §5.2 "own your context").
//
// The harness reads the project's standing instructions — the markdown contract
// a team keeps at the repo root for any coding agent — into the run context so
// every model, on every run, starts from the same project ground truth instead
// of a generic system prompt. The open convention is `AGENTS.md`; `CLAUDE.md`
// is the legacy fallback so a brownfield repo with only a Claude Code contract
// is picked up unchanged. The file is read-only: glamfire never modifies it.
//
// This module is deliberately dependency-free and config-agnostic: it searches
// upward from the given cwd for the first matching file, the same way config
// discovery finds `glam.toml`. The CLI composes the loaded text into the engine
// system prompt alongside the brain's recall block.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/** The filenames consulted, in preference order. */
export const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md'] as const;

/** The filename that was loaded. */
export type InstructionFile = (typeof INSTRUCTION_FILES)[number];

/** A loaded project-instructions file. */
export interface ProjectInstructions {
  /** The instructions text, verbatim (whitespace trimmed). */
  text: string;
  /** Which convention file was found. */
  file: InstructionFile;
  /** Absolute path to the file that was loaded. */
  path: string;
}

/**
 * Search `cwd` and each ancestor for `name`. Returns the first existing path,
 * or null when none is found up to (and including) the filesystem root. Mirrors
 * the upward-discovery shape `findProjectConfig` uses for `glam.toml`.
 */
function findUpward(cwd: string, name: string): string | null {
  let dir = cwd;
  const { root } = parse(dir);
  for (let depth = 0; depth < 64; depth += 1) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Load the project's standing instructions: the first `AGENTS.md` found
 * searching upward from `cwd`, falling back to the first `CLAUDE.md`. Returns
 * null when neither is present — an empty-handed state, never an error.
 *
 * `AGENTS.md` is preferred at every depth: a repo with both an `AGENTS.md` and
 * a `CLAUDE.md` (even a nearer `CLAUDE.md`) loads the `AGENTS.md`, because the
 * open convention is the contract glamfire honors first.
 */
export function loadProjectInstructions(cwd: string): ProjectInstructions | null {
  for (const file of INSTRUCTION_FILES) {
    const path = findUpward(cwd, file);
    if (path !== null) {
      const text = readFileSync(path, 'utf8').trim();
      if (text === '') continue; // an empty file is not instructions; keep looking
      return { text, file, path };
    }
  }
  return null;
}

/**
 * Frame the loaded instructions for the model: a labeled block, clearly marked
 * as the project's standing contract (not glamfire's own system text), so the
 * model treats it as authoritative project context and a human reading the
 * transcript can trace it back to the source file.
 */
export function formatInstructionsBlock(instructions: ProjectInstructions): string {
  return `# Project instructions (${instructions.file})\n\n${instructions.text}`;
}
