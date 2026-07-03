// `glam brain lint` — Karpathy's third operation (research/31 §5), run over the
// authoritative markdown tree, no database required:
//
//   1. frontmatter integrity — files whose metadata cannot be trusted;
//   2. summary staleness — `truth: summary` records whose `derived_from` sources are
//      missing, changed since derivation (hash mismatch), or unverifiable;
//   3. sharing hygiene — personal-data heuristics (secrets, emails, home paths) in
//      records classified `sharing: team`;
//   4. tree hygiene — misfiled records and a stale INDEX.md.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FileFormatError,
  generateIndex,
  parseRecordFile,
  recordDir,
  scanTree,
  sha256,
} from './files.js';
import type { MemoryRecord } from './types.js';

export type LintLevel = 'error' | 'warn';

export interface LintFinding {
  level: LintLevel;
  /** Stable machine-readable code, e.g. `stale-summary`, `personal-data-in-team`. */
  code: string;
  /** Path relative to the tree root ('' for tree-level findings). */
  path: string;
  message: string;
}

export interface LintReport {
  findings: LintFinding[];
  errors: number;
  warnings: number;
  /** Records successfully parsed (adoptable plain-markdown files count too). */
  records: number;
}

/**
 * Personal-data heuristics for team-classified records. Secret-shaped strings are
 * errors (they must never reach a team tree); emails and user home paths are
 * warnings (frequently fine, always worth a look before a git push).
 */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'API key', re: /\b(?:sk|pk|rk)-[A-Za-z0-9][A-Za-z0-9-_]{15,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'credential assignment',
    re: /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[^\s'"]{8,}/i,
  },
];

const WARN_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'email address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'user home path', re: /(?:\/Users\/|\/home\/|C:\\Users\\)[A-Za-z0-9._-]+/ },
];

function scanPersonalData(rec: MemoryRecord, path: string, findings: LintFinding[]): void {
  if (rec.sharing !== 'team') return;
  const text = [rec.title ?? '', rec.content, JSON.stringify(rec.metadata)].join('\n');
  for (const { name, re } of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m !== null) {
      findings.push({
        level: 'error',
        code: 'personal-data-in-team',
        path,
        message: `team-classified record contains a ${name} ("${String(m[0]).slice(0, 12)}…") — redact it or set sharing: personal`,
      });
    }
  }
  for (const { name, re } of WARN_PATTERNS) {
    const m = text.match(re);
    if (m !== null) {
      findings.push({
        level: 'warn',
        code: 'personal-data-in-team',
        path,
        message: `team-classified record contains a ${name} ("${String(m[0])}") — verify it belongs in team knowledge`,
      });
    }
  }
}

/** Lint a brain tree. Pure filesystem reads; works with or without an index DB. */
export function lintTree(root: string): LintReport {
  const findings: LintFinding[] = [];
  const parsedById = new Map<string, { record: MemoryRecord; path: string }>();
  const entries: { record: MemoryRecord; relPath: string }[] = [];
  let records = 0;

  const files = scanTree(root);
  for (const f of files) {
    try {
      const parsed = parseRecordFile(f.text, f.relPath);
      records += 1;
      if (parsed.kind === 'adopt') {
        findings.push({
          level: 'warn',
          code: 'missing-frontmatter',
          path: f.relPath,
          message: 'plain markdown without frontmatter — run `glam brain sync` to adopt it',
        });
        continue;
      }
      const rec = parsed.record;
      const dup = parsedById.get(rec.id);
      if (dup !== undefined) {
        findings.push({
          level: 'error',
          code: 'duplicate-id',
          path: f.relPath,
          message: `duplicate id ${rec.id} (also at ${dup.path})`,
        });
        continue;
      }
      parsedById.set(rec.id, { record: rec, path: f.relPath });
      entries.push({ record: rec, relPath: f.relPath });
      const expectedDir = recordDir(rec);
      if (!f.relPath.startsWith(expectedDir)) {
        findings.push({
          level: 'warn',
          code: 'misfiled',
          path: f.relPath,
          message: `${rec.truth} ${rec.type} belongs under ${expectedDir}/`,
        });
      }
      if (rec.truth === 'summary' && rec.derivedFrom.length === 0) {
        findings.push({
          level: 'warn',
          code: 'summary-unsourced',
          path: f.relPath,
          message: 'summary has no derived_from links — its claims cannot be verified',
        });
      }
      scanPersonalData(rec, f.relPath, findings);
    } catch (err) {
      if (err instanceof FileFormatError) {
        findings.push({
          level: 'error',
          code: 'frontmatter',
          path: f.relPath,
          message: err.message,
        });
        continue;
      }
      throw err;
    }
  }

  // Staleness pass: every summary's derived_from targets must exist and their
  // content hashes must still match the hash captured at derivation time.
  for (const { record: rec, path } of parsedById.values()) {
    for (const d of rec.derivedFrom) {
      const source = parsedById.get(d.id);
      if (source === undefined) {
        findings.push({
          level: 'error',
          code: 'broken-link',
          path,
          message: `derived_from source ${d.id} is not in the tree`,
        });
        continue;
      }
      if (d.hash === undefined) {
        findings.push({
          level: 'warn',
          code: 'unverifiable-summary',
          path,
          message: `derived_from ${d.id} has no content hash — staleness cannot be checked`,
        });
        continue;
      }
      if (sha256(source.record.content) !== d.hash) {
        findings.push({
          level: 'error',
          code: 'stale-summary',
          path,
          message: `source ${d.id} (${source.path}) changed since this summary was derived — regenerate it`,
        });
      }
    }
  }

  // INDEX.md drift.
  const indexPath = join(root, 'INDEX.md');
  if (files.length > 0) {
    const want = generateIndex(entries);
    const have = existsSync(indexPath)
      ? readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n')
      : null;
    if (have !== want) {
      findings.push({
        level: 'warn',
        code: 'index-stale',
        path: 'INDEX.md',
        message:
          have === null
            ? 'INDEX.md is missing — run `glam brain sync`'
            : 'INDEX.md is out of date — run `glam brain sync`',
      });
    }
  }

  return {
    findings,
    errors: findings.filter((f) => f.level === 'error').length,
    warnings: findings.filter((f) => f.level === 'warn').length,
    records,
  };
}
