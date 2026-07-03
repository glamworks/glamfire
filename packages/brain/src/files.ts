// The flat-file markdown knowledge tree (research/31-flat-file-knowledge.md).
//
// **The markdown is the brain; SQLite is the index.** Every record is one readable
// markdown file with YAML frontmatter under `brain/`: `sources/` (truth: source
// documents), `facts/`, `notes/` (truth: summary — regenerable syntheses),
// `pointers/`, `episodes/`, plus a generated `INDEX.md` catalog and an append-only
// `log.md`. This module is the pure codec + tree layer: serialize/parse records
// to/from files, content hashing for change detection, tree scanning, and the
// INDEX/log generators. Sync semantics live in `store.ts` (`Brain.syncFiles`).
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import {
  type DerivedFrom,
  DerivedFromSchema,
  type MemoryRecord,
  ProvenanceSchema,
  type RecordType,
  RecordTypeSchema,
  ScopeSchema,
  SharingSchema,
  type Truth,
  TruthSchema,
} from './types.js';

/** The record directories inside a brain tree. Order = INDEX.md section order. */
export const RECORD_DIRS = ['sources', 'facts', 'notes', 'pointers', 'episodes'] as const;
export type RecordDir = (typeof RECORD_DIRS)[number];

/** Where the rebuildable SQLite index lives inside a tree (gitignored). */
export const INDEX_DB_RELPATH = join('.index', 'brain.sqlite');

/** sha256 hex of a string (LF-normalized). Content hashes, never mtimes. */
export function sha256(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** Which directory a record belongs in: summaries live in notes/, sources by type. */
export function recordDir(rec: Pick<MemoryRecord, 'type' | 'truth'>): RecordDir {
  if (rec.truth === 'summary') return 'notes';
  switch (rec.type) {
    case 'document':
      return 'sources';
    case 'fact':
      return 'facts';
    case 'pointer':
      return 'pointers';
    case 'episode':
      return 'episodes';
  }
}

/** Filesystem-safe slug from a title/content, for readable filenames. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'record';
}

/** Deterministic relative path for a record: `<dir>/<slug>-<id8>.md`. */
export function recordRelPath(rec: MemoryRecord): string {
  const base = rec.title ?? rec.content.slice(0, 60);
  const idTag =
    rec.id
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toLowerCase() || sha256(rec.id).slice(0, 8);
  return join(recordDir(rec), `${slugify(base)}-${idTag}.md`);
}

// --- frontmatter schema (Zod-validated, mirrors MemoryRecord) -----------------

const FrontmatterSchema = z
  .object({
    id: z.string().min(1),
    type: RecordTypeSchema,
    truth: TruthSchema,
    sharing: SharingSchema,
    scope: ScopeSchema.default('private'),
    title: z.string().optional(),
    tags: z.array(z.string().min(1)).default([]),
    provenance: ProvenanceSchema,
    derived_from: z.array(DerivedFromSchema).default([]),
    metadata: z.record(z.unknown()).default({}),
    created: z.string().optional(),
    updated: z.string().optional(),
  })
  .strict();

/** Raised when a file has frontmatter that cannot be trusted. Never guessed around. */
export class FileFormatError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'FileFormatError';
    this.path = path;
  }
}

function compactDerived(d: DerivedFrom): Record<string, string> {
  const out: Record<string, string> = { id: d.id };
  if (d.span !== undefined) out.span = d.span;
  if (d.hash !== undefined) out.hash = d.hash;
  return out;
}

/**
 * Serialize a record to its canonical markdown file: YAML frontmatter (stable key
 * order), a `# title` heading when titled, then the content verbatim. The output is
 * deterministic — the same record always produces the same bytes — so a sha256 of
 * this string is the record's file-level change signal.
 */
export function serializeRecordFile(rec: MemoryRecord): string {
  const fm: Record<string, unknown> = {
    id: rec.id,
    type: rec.type,
    truth: rec.truth,
    sharing: rec.sharing,
    scope: rec.scope,
  };
  if (rec.title !== null) fm.title = rec.title;
  if (rec.tags.length > 0) fm.tags = rec.tags;
  fm.provenance = { ...rec.provenance };
  if (rec.derivedFrom.length > 0) fm.derived_from = rec.derivedFrom.map(compactDerived);
  if (Object.keys(rec.metadata).length > 0) fm.metadata = rec.metadata;
  fm.created = new Date(rec.createdAt).toISOString();
  fm.updated = new Date(rec.updatedAt).toISOString();
  const head = `---\n${YAML.stringify(fm)}---\n\n`;
  const heading = rec.title !== null && !rec.title.includes('\n') ? `# ${rec.title}\n\n` : '';
  return `${head}${heading}${rec.content}\n`;
}

/** What `parseRecordFile` returns for a plain markdown file with no frontmatter. */
export interface AdoptableFile {
  kind: 'adopt';
  /** Title from a leading `# heading`, if any. */
  title: string | null;
  /** Body with the leading heading (if promoted to title) removed. */
  content: string;
}

export interface ParsedRecordFile {
  kind: 'record';
  record: MemoryRecord;
}

/**
 * Parse a markdown file back into a record. Files that start with a `---` YAML
 * fence must carry valid frontmatter (a `FileFormatError` is thrown otherwise —
 * bad metadata is surfaced, never guessed). Files without a fence are returned as
 * `adopt` candidates: any external source (a human, Claude Code, a script) can drop
 * plain markdown into the tree and `glam brain sync` will adopt it as a record.
 */
export function parseRecordFile(raw: string, path: string): ParsedRecordFile | AdoptableFile {
  const text = raw.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) {
    const m = text.match(/^#[ \t]+(.+)\n+/);
    const title = m?.[1]?.trim() ?? null;
    const content = (m ? text.slice(m[0].length) : text).replace(/\n$/, '');
    if (content.trim().length === 0) throw new FileFormatError(path, 'file has no content');
    return { kind: 'adopt', title, content };
  }
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) throw new FileFormatError(path, 'unterminated frontmatter fence');
  let fmRaw: unknown;
  try {
    fmRaw = YAML.parse(text.slice(4, end + 1));
  } catch (err) {
    throw new FileFormatError(path, `invalid YAML frontmatter: ${(err as Error).message}`);
  }
  const parsed = FrontmatterSchema.safeParse(fmRaw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new FileFormatError(
      path,
      `invalid frontmatter: ${issue ? `${issue.path.join('.')} — ${issue.message}` : parsed.error.message}`,
    );
  }
  const fm = parsed.data;
  let body = text.slice(end + 5);
  if (body.startsWith('\n')) body = body.slice(1);
  const title = fm.title ?? null;
  if (title !== null && body.startsWith(`# ${title}\n\n`)) {
    body = body.slice(`# ${title}\n\n`.length);
  }
  const content = body.replace(/\n$/, '');
  if (content.length === 0) throw new FileFormatError(path, 'record file has no content');
  const created = fm.created !== undefined ? Date.parse(fm.created) : Date.now();
  const updated = fm.updated !== undefined ? Date.parse(fm.updated) : Date.now();
  if (Number.isNaN(created)) throw new FileFormatError(path, `invalid created: "${fm.created}"`);
  if (Number.isNaN(updated)) throw new FileFormatError(path, `invalid updated: "${fm.updated}"`);
  return {
    kind: 'record',
    record: {
      id: fm.id,
      type: fm.type,
      title,
      content,
      scope: fm.scope,
      truth: fm.truth,
      sharing: fm.sharing,
      tags: fm.tags,
      derivedFrom: fm.derived_from,
      provenance: fm.provenance,
      metadata: fm.metadata,
      createdAt: created,
      updatedAt: updated,
    },
  };
}

/** Defaults used when adopting a plain markdown file dropped into a record dir. */
export function adoptionDefaults(dir: RecordDir): { type: RecordType; truth: Truth } {
  switch (dir) {
    case 'sources':
      return { type: 'document', truth: 'source' };
    case 'facts':
      return { type: 'fact', truth: 'source' };
    case 'notes':
      return { type: 'fact', truth: 'summary' };
    case 'pointers':
      return { type: 'pointer', truth: 'source' };
    case 'episodes':
      return { type: 'episode', truth: 'source' };
  }
}

// --- tree I/O ------------------------------------------------------------------

export interface TreeFile {
  /** Path relative to the tree root, e.g. `facts/deploy-window-0198fa2c.md`. */
  relPath: string;
  /** Which record directory it was found under. */
  dir: RecordDir;
  /** Raw file text (LF-normalized). */
  text: string;
}

/** Ensure the tree skeleton exists (record dirs + .gitignore for the index). */
export function ensureTree(root: string): void {
  for (const dir of RECORD_DIRS) mkdirSync(join(root, dir), { recursive: true });
  const gi = join(root, '.gitignore');
  if (!existsSync(gi)) {
    writeFileSync(
      gi,
      '# The SQLite index is derived and rebuildable (glam brain rebuild) — never commit it.\n.index/\n',
    );
  }
}

/** Scan the tree for record files. Skips `*.conflict.md` (surfaced conflict copies). */
export function scanTree(root: string): TreeFile[] {
  const out: TreeFile[] = [];
  for (const dir of RECORD_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    const entries = readdirSync(abs, { recursive: true, withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md') || e.name.endsWith('.conflict.md')) continue;
      const absFile = join(e.parentPath, e.name);
      const relPath = absFile.slice(root.length + 1);
      out.push({ relPath, dir, text: readFileSync(absFile, 'utf8').replace(/\r\n/g, '\n') });
    }
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

/** Write a record file (creating directories), returning its canonical text + hash. */
export function writeRecordFile(
  root: string,
  relPath: string,
  rec: MemoryRecord,
): { text: string; hash: string } {
  const text = serializeRecordFile(rec);
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return { text, hash: sha256(text) };
}

// --- generated INDEX.md + append-only log.md ------------------------------------

export interface IndexEntry {
  record: MemoryRecord;
  relPath: string;
}

/** Generate the INDEX.md catalog (Karpathy's index.md): one line per record. */
export function generateIndex(entries: IndexEntry[]): string {
  const byDir = new Map<RecordDir, IndexEntry[]>();
  for (const e of entries) {
    const dir = (e.relPath.split(/[/\\]/)[0] ?? recordDir(e.record)) as RecordDir;
    const list = byDir.get(dir) ?? [];
    list.push(e);
    byDir.set(dir, list);
  }
  const lines: string[] = [
    '# Brain index',
    '',
    `${entries.length} record${entries.length === 1 ? '' : 's'} · generated by \`glam brain sync\` — do not edit by hand.`,
    '',
  ];
  for (const dir of RECORD_DIRS) {
    const list = byDir.get(dir);
    if (list === undefined || list.length === 0) continue;
    lines.push(`## ${dir}`, '');
    list.sort((a, b) => a.relPath.localeCompare(b.relPath));
    for (const { record: r, relPath } of list) {
      const label = r.title ?? `${r.content.slice(0, 60).replace(/\s+/g, ' ')}…`;
      const bits: string[] = [r.type, r.truth, r.sharing, r.scope];
      if (r.tags.length > 0) bits.push(`tags: ${r.tags.join(', ')}`);
      bits.push(`updated ${new Date(r.updatedAt).toISOString().slice(0, 10)}`);
      lines.push(`- [${label}](${relPath.replace(/\\/g, '/')}) — ${bits.join(' · ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** Write INDEX.md at the tree root. Returns the generated text. */
export function writeIndex(root: string, entries: IndexEntry[]): string {
  const text = generateIndex(entries);
  writeFileSync(join(root, 'INDEX.md'), text);
  return text;
}

/** Append unix-parseable lines to log.md: `- <ISO> <event> …`. */
export function appendLog(root: string, events: string[]): void {
  if (events.length === 0) return;
  const logPath = join(root, 'log.md');
  const ts = new Date().toISOString();
  const lines = events.map((e) => `- ${ts} ${e}\n`).join('');
  if (!existsSync(logPath)) {
    writeFileSync(
      logPath,
      `# Brain log\n\nAppend-only. One line per sync/lint/conflict event.\n\n${lines}`,
    );
    return;
  }
  appendFileSync(logPath, lines);
}
