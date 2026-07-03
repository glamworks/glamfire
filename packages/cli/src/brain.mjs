// `glam brain` — the owned context store as flat markdown (research/31, issue #36).
//
// The markdown tree is the brain; SQLite is a rebuildable index. Records live as
// readable markdown files with YAML frontmatter under `<dir>/` (sources/, facts/,
// notes/, pointers/, episodes/ + generated INDEX.md and log.md); the index sits at
// `<dir>/.index/brain.sqlite` and can be deleted at any time — `glam brain rebuild`
// reconstructs it losslessly from the markdown. Fully offline: the default embedder
// is deterministic and local; no API key, nothing leaves your machine.
//
// @glamfire/brain carries a native SQLite module, so it is loaded lazily via a
// computed specifier: the bundled single-file CLI stays native-free, and running
// `glam brain` there fails honestly with instructions instead of a broken bundle.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const FLAME = '\x1b[38;5;208m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

function color(on, code, s) {
  return on ? `${code}${s}${RESET}` : s;
}

const BRAIN_HELP = `glam brain — your knowledge as flat markdown; SQLite is just a disposable index.

Usage: glam brain <subcommand> [options]

Subcommands:
  add <type> "<content>"  Add a record. Types: fact, document, pointer, episode,
                          note (a derived summary — lives in notes/)
  list                    List records in the index (offline)
  query "<text>"          Hybrid retrieval (vector+keyword+recency+provenance, offline)
  sync                    Reconcile markdown tree <-> index: export DB-only records,
                          import/adopt files, resolve edits by content hash
  lint                    Tree health: stale summaries, broken/missing frontmatter,
                          personal data in team-classified records
  rebuild                 Reconstruct the ENTIRE index from the markdown tree
                          (delete <dir>/.index/brain.sqlite first — you lose nothing)

Options:
  --dir <path>            Brain tree root (default: $GLAM_BRAIN_DIR or ./brain)
  --title <t>             Record title (also written as the # heading)
  --tags <a,b,c>          Comma-separated tags
  --scope <s>             private | project | team (default private)
  --sharing <s>           personal | team classification (default personal)
  --truth <t>             source | summary (defaults: note=summary, others=source)
  --source <s>            Provenance source (default "cli")
  --uri <u>               Provenance URI
  --derived-from <id[#span]>  Link a summary to a source record (repeatable)
  --target <url>          Pointer target (required for: add pointer)
  --type <t>              Filter for list: fact | document | episode | pointer
  --json                  Structured JSON output
  -h, --help              Show this help

The tree is plain markdown — grep it, edit it, commit it to git. Human edits are
picked up by \`glam brain sync\` (files win for sources; newest wins for regenerable
summaries; conflicts are preserved as *.conflict.md, never silently merged).
`;

/**
 * Lazy-load @glamfire/brain without letting bundlers inline its native deps.
 * The `new Function` indirection is deliberate: Bun's bundler constant-folds a
 * plain `import(variable)` and would drag better-sqlite3 (a native module) into
 * the single-file npm bundle, breaking it. This way the workspace CLI loads the
 * real package and the standalone bundle fails honestly with instructions.
 */
async function loadBrain() {
  const importNow = new Function('s', 'return import(s)');
  try {
    return await importNow('@glamfire/brain');
  } catch (err) {
    const detail = err?.message ?? String(err);
    throw new Error(
      `glam brain needs @glamfire/brain (a native SQLite module) which is not part of the bundled standalone CLI yet. Run from a glamfire checkout: git clone https://github.com/glamworks/glamfire && pnpm install && pnpm build (${detail})`,
    );
  }
}

function parseArgs(args) {
  const opts = { json: false, derivedFrom: [], positional: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const need = (name) => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`option ${name} requires a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--dir':
        opts.dir = need('--dir');
        break;
      case '--title':
        opts.title = need('--title');
        break;
      case '--tags':
        opts.tags = need('--tags')
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        break;
      case '--scope':
        opts.scope = need('--scope');
        break;
      case '--sharing':
        opts.sharing = need('--sharing');
        break;
      case '--truth':
        opts.truth = need('--truth');
        break;
      case '--source':
        opts.source = need('--source');
        break;
      case '--uri':
        opts.uri = need('--uri');
        break;
      case '--target':
        opts.target = need('--target');
        break;
      case '--type':
        opts.type = need('--type');
        break;
      case '--derived-from': {
        const raw = need('--derived-from');
        const [id, span] = raw.split('#', 2);
        if (!id) throw new Error('--derived-from requires a record id');
        opts.derivedFrom.push(span === undefined ? { id } : { id, span });
        break;
      }
      default:
        if (a.startsWith('-')) throw new Error(`unknown option "${a}"`);
        opts.positional.push(a);
    }
  }
  return opts;
}

function brainDir(opts) {
  return resolve(opts.dir ?? process.env.GLAM_BRAIN_DIR ?? join(process.cwd(), 'brain'));
}

async function openBrain(mod, dir) {
  mkdirSync(join(dir, '.index'), { recursive: true });
  return mod.Brain.open(join(dir, '.index', 'brain.sqlite'), { filesRoot: dir });
}

function header(out, useColor, version, sub, dir) {
  out.write(
    `${color(useColor, FLAME, `glamfire ${version}`)} ${color(useColor, DIM, `· brain ${sub}`)}\n`,
  );
  out.write(color(useColor, DIM, `  tree: ${dir}\n\n`));
}

async function cmdAdd(mod, opts, dir) {
  const [, kind, content] = opts.positional;
  const kinds = ['fact', 'document', 'pointer', 'episode', 'note'];
  if (kind === undefined || !kinds.includes(kind)) {
    throw new Error(`add needs a type (${kinds.join(' | ')}) — run \`glam brain --help\``);
  }
  if (content === undefined && !(kind === 'pointer' && opts.target !== undefined)) {
    throw new Error(`add ${kind} needs content: glam brain add ${kind} "<content>"`);
  }
  const brain = await openBrain(mod, dir);
  try {
    const base = {
      ...(opts.title !== undefined && { title: opts.title }),
      ...(opts.scope !== undefined && { scope: opts.scope }),
      ...(opts.sharing !== undefined && { sharing: opts.sharing }),
      ...(opts.truth !== undefined && { truth: opts.truth }),
      ...(opts.tags !== undefined && { tags: opts.tags }),
      ...(opts.derivedFrom.length > 0 && { derivedFrom: opts.derivedFrom }),
      provenance: {
        source: opts.source ?? 'cli',
        ...(opts.uri !== undefined && { uri: opts.uri }),
      },
    };
    let rec;
    if (kind === 'fact') rec = await brain.addFact({ ...base, content });
    else if (kind === 'document') rec = await brain.addDocument({ ...base, content });
    else if (kind === 'episode') rec = await brain.addEpisode({ ...base, content });
    else if (kind === 'note') {
      rec = await brain.addFact({ ...base, truth: opts.truth ?? 'summary', content });
    } else {
      if (opts.target === undefined) throw new Error('add pointer requires --target <url>');
      rec = await brain.addPointer({
        ...base,
        target: opts.target,
        ...(content !== undefined && { content }),
      });
    }
    const relPath = mod.recordRelPath(rec);
    return { rec, relPath };
  } finally {
    brain.close();
  }
}

function fmtRecordLine(rec) {
  const label = rec.title ?? rec.content.slice(0, 56).replace(/\s+/g, ' ');
  return `${rec.id.slice(0, 8)}  ${rec.type.padEnd(8)} ${rec.truth.padEnd(7)} ${rec.sharing.padEnd(8)} ${rec.scope.padEnd(7)} ${label}`;
}

export async function cmdBrain(argv, { version }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam brain: ${err.message}\nRun \`glam brain --help\`.\n`);
    process.exitCode = 2;
    return;
  }
  const sub = opts.positional[0];
  if (opts.help || sub === undefined) {
    process.stdout.write(BRAIN_HELP);
    return;
  }

  const out = process.stdout;
  const useColor = out.isTTY === true;
  const dir = brainDir(opts);

  const subs = ['add', 'list', 'query', 'sync', 'lint', 'rebuild'];
  if (!subs.includes(sub)) {
    process.stderr.write(
      `glam brain: unknown subcommand "${sub}". Expected one of: ${subs.join(', ')}.\n`,
    );
    process.exitCode = 2;
    return;
  }

  const mod = await loadBrain();

  if (sub === 'add') {
    let added;
    try {
      added = await cmdAdd(mod, opts, dir);
    } catch (err) {
      // zod validation errors carry `issues`; render them as one honest line each.
      if (Array.isArray(err?.issues)) {
        for (const issue of err.issues) {
          const at = issue.path?.length ? `${issue.path.join('.')}: ` : '';
          process.stderr.write(`glam brain: invalid input — ${at}${issue.message}\n`);
        }
        process.stderr.write('Run `glam brain --help` for accepted values.\n');
        process.exitCode = 2;
        return;
      }
      throw err;
    }
    const { rec, relPath } = added;
    if (opts.json) {
      out.write(`${JSON.stringify({ glamfire: version, record: rec, file: relPath }, null, 2)}\n`);
      return;
    }
    header(out, useColor, version, 'add', dir);
    out.write(`  ${color(useColor, BOLD, 'added')} ${rec.type} ${rec.id}\n`);
    out.write(`  file: ${join(dir, relPath)}\n`);
    out.write(color(useColor, DIM, '  (run `glam brain sync` to refresh INDEX.md and log.md)\n'));
    return;
  }

  if (sub === 'list') {
    const brain = await openBrain(mod, dir);
    try {
      const records = brain.list(opts.type !== undefined ? { type: opts.type } : {});
      if (opts.json) {
        out.write(`${JSON.stringify({ glamfire: version, records }, null, 2)}\n`);
        return;
      }
      header(out, useColor, version, 'list', dir);
      if (records.length === 0) {
        out.write('No records yet. Try: glam brain add fact "the deploy window is Friday"\n');
        return;
      }
      out.write(
        color(useColor, DIM, '  id        type     truth   sharing  scope   title/content\n'),
      );
      for (const rec of records) out.write(`  ${fmtRecordLine(rec)}\n`);
      out.write(`\n${records.length} record${records.length === 1 ? '' : 's'}\n`);
    } finally {
      brain.close();
    }
    return;
  }

  if (sub === 'query') {
    const text = opts.positional[1];
    if (text === undefined) {
      process.stderr.write('glam brain: query needs text: glam brain query "<text>"\n');
      process.exitCode = 2;
      return;
    }
    const brain = await openBrain(mod, dir);
    try {
      const res = await brain.query(text);
      if (opts.json) {
        out.write(`${JSON.stringify({ glamfire: version, ...res }, null, 2)}\n`);
        return;
      }
      header(out, useColor, version, 'query', dir);
      if (res.results.length === 0) {
        out.write('No hits.\n');
        return;
      }
      for (const [i, hit] of res.results.entries()) {
        out.write(
          `  ${color(useColor, BOLD, `[${i + 1}]`)} ${hit.score.toFixed(3)} ${hit.type} ${hit.recordId.slice(0, 8)} ${color(useColor, DIM, `(source: ${hit.provenance.source})`)}\n`,
        );
        out.write(`      ${hit.text.slice(0, 120).replace(/\s+/g, ' ')}\n`);
      }
    } finally {
      brain.close();
    }
    return;
  }

  if (sub === 'sync') {
    const brain = await openBrain(mod, dir);
    let report;
    try {
      report = await brain.syncFiles();
    } finally {
      brain.close();
    }
    if (opts.json) {
      out.write(`${JSON.stringify({ glamfire: version, ...report }, null, 2)}\n`);
    } else {
      header(out, useColor, version, 'sync', dir);
      out.write(
        `  exported ${report.exported} · imported ${report.imported} · ` +
          `updated-from-files ${report.updatedFromFiles} · updated-from-db ${report.updatedFromDb} · ` +
          `tombstoned ${report.tombstoned}\n`,
      );
      for (const c of report.conflicts) {
        out.write(
          color(
            useColor,
            YELLOW,
            `  conflict: ${c.path} (${c.truth}) → ${c.resolution}; losing version kept at ${c.conflictPath}\n`,
          ),
        );
      }
      for (const e of report.errors) {
        out.write(color(useColor, RED, `  error: ${e.message}\n`));
      }
      out.write(
        `  ${report.records} record${report.records === 1 ? '' : 's'} · INDEX.md regenerated\n`,
      );
    }
    if (report.errors.length > 0) process.exitCode = 1;
    return;
  }

  if (sub === 'lint') {
    const report = mod.lintTree(dir);
    if (opts.json) {
      out.write(`${JSON.stringify({ glamfire: version, ...report }, null, 2)}\n`);
    } else {
      header(out, useColor, version, 'lint', dir);
      for (const f of report.findings) {
        const code = f.level === 'error' ? RED : YELLOW;
        out.write(
          `  ${color(useColor, code, f.level.padEnd(5))} ${f.code.padEnd(22)} ${f.path}: ${f.message}\n`,
        );
      }
      out.write(
        `${report.findings.length === 0 ? '  clean — ' : '\n  '}${report.records} record${report.records === 1 ? '' : 's'}, ${report.errors} error${report.errors === 1 ? '' : 's'}, ${report.warnings} warning${report.warnings === 1 ? '' : 's'}\n`,
      );
    }
    if (report.errors > 0) process.exitCode = 1;
    return;
  }

  // rebuild — THE invariant: the SQLite index is disposable, the markdown is not.
  const dbPath = join(dir, '.index', 'brain.sqlite');
  mkdirSync(join(dir, '.index'), { recursive: true });
  const { brain, report } = await mod.Brain.rebuildFromFiles(dir, dbPath);
  brain.close();
  if (opts.json) {
    out.write(`${JSON.stringify({ glamfire: version, index: dbPath, ...report }, null, 2)}\n`);
  } else {
    header(out, useColor, version, 'rebuild', dir);
    out.write(
      `  rebuilt ${join('.index', 'brain.sqlite')} from ${report.records} markdown record${report.records === 1 ? '' : 's'} — nothing lost\n`,
    );
    for (const e of report.errors) out.write(color(useColor, RED, `  error: ${e.message}\n`));
  }
  if (report.errors.length > 0) process.exitCode = 1;
}
