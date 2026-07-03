#!/usr/bin/env node
// adopt-claude-code.mjs — seed the project brain from existing Claude Code state.
//
// The brownfield reality (issue #29): this machine has been running Claude Code
// with default config, so its knowledge lives in Claude Code's own files. This
// script discovers that state and imports it into the project's glamfire brain
// (.glam/brain.db) so `glam run` recalls it from the very first task.
//
// What it imports (read-only — Claude Code files are never modified):
//   - <repo>/CLAUDE.md and ~/.claude/CLAUDE.md      (operating instructions)
//   - <repo>/.claude/memory/*.md                    (project memory)
//   - ~/.claude/projects/<slug>/memory/*.md         (Claude Code auto-memory)
//
// Idempotent: each file maps to a stable record id (cc:<relative-path>); on
// re-run, unchanged files are skipped, changed files update the same record.
// This is the hand-run seed of `glam adopt claude-code` (#29) — the product
// command grows from here (transcripts, settings hooks, live watch).
//
// Usage: node scripts/adopt-claude-code.mjs [--dry-run]

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

// Claude Code's per-project dir slug: absolute path with '/' and '.' → '-'.
const projectSlug = root.replaceAll('/', '-').replaceAll('.', '-');
const home = homedir();

/** @returns {{id: string, title: string, path: string, source: string}[]} */
function discover() {
  const found = [];
  const add = (path, source) => {
    if (!existsSync(path)) return;
    found.push({
      id: `cc:${path.startsWith(home) ? `~${path.slice(home.length)}` : path}`,
      title: `claude-code: ${basename(dirname(path))}/${basename(path)}`,
      path,
      source,
    });
  };

  add(join(root, 'CLAUDE.md'), 'claude-code project instructions');
  add(join(home, '.claude', 'CLAUDE.md'), 'claude-code global instructions');

  const mdDir = (dir, source) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.md')) add(join(dir, f), source);
    }
  };
  mdDir(join(root, '.claude', 'memory'), 'claude-code project memory');
  mdDir(join(home, '.claude', 'projects', projectSlug, 'memory'), 'claude-code auto-memory');
  return found;
}

const files = discover();
if (files.length === 0) {
  console.log('adopt-claude-code: no Claude Code state found on this machine — nothing to import.');
  process.exit(0);
}

// scripts/ is not a workspace package, so resolve the brain through the repo
// tree directly (same build the CLI uses from a workspace install).
const { Brain } = await import(
  new URL('../packages/brain/dist/index.js', import.meta.url).href
);
const storePath = join(root, '.glam', 'brain.db');
mkdirSync(dirname(storePath), { recursive: true });
const brain = Brain.open(storePath);

let imported = 0;
let updated = 0;
let unchanged = 0;
try {
  for (const f of files) {
    const content = readFileSync(f.path, 'utf8').trim();
    if (content === '') continue;
    const existing = brain.get(f.id);
    const action =
      existing === null ? 'import' : existing.content === content ? 'skip' : 'update';
    console.log(`  ${action.padEnd(6)} ${f.id}  (${content.length} chars, ${f.source})`);
    if (dryRun) continue;
    if (action === 'import') {
      await brain.addDocument({
        id: f.id,
        title: f.title,
        content,
        scope: 'project',
        provenance: {
          source: f.source,
          uri: f.path,
          timestamp: new Date().toISOString(),
          note: 'imported by scripts/adopt-claude-code.mjs (issue #29 seed)',
        },
        metadata: { kind: 'claude-code-import', truth: 'source' },
      });
      imported++;
    } else if (action === 'update') {
      await brain.update(f.id, { content });
      updated++;
    } else {
      unchanged++;
    }
  }
} finally {
  brain.close();
}

console.log(
  `${dryRun ? '[dry-run] ' : ''}adopt-claude-code: ${files.length} files discovered — ` +
    `${imported} imported, ${updated} updated, ${unchanged} unchanged → ${storePath}`,
);
