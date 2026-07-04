import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Brain, lintTree } from '../src/index.js';
import { def } from './helpers.js';

// `glam brain lint` over a real tree: staleness (summaries whose derived_from
// sources changed), untrusted frontmatter, and personal-data heuristics in
// team-classified records — the known failure modes of flat-file memory at scale.

let dir: string;
let root: string;
let dbPath: string;
let brain: Brain;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'glamfire-lint-'));
  root = join(dir, 'brain');
  dbPath = join(dir, 'brain.sqlite');
  brain = Brain.open(dbPath, { filesRoot: root });
});

afterEach(() => {
  brain.close();
  rmSync(dir, { recursive: true, force: true });
});

function codes(report: ReturnType<typeof lintTree>): string[] {
  return report.findings.map((f) => f.code);
}

describe('glam brain lint', () => {
  it('passes clean on a healthy synced tree', async () => {
    const src = await brain.addDocument({
      title: 'Deploys',
      content: 'We deploy on Fridays.',
      provenance: { source: 'wiki' },
    });
    await brain.addFact({
      content: 'Summary: weekly deploys.',
      provenance: { source: 'synthesis' },
      derivedFrom: [{ id: src.id }],
    });
    await brain.syncFiles();
    const report = lintTree(root);
    expect(report.findings).toEqual([]);
    expect(report.errors).toBe(0);
    expect(report.records).toBe(2);
  });

  it('flags a stale summary when its derived_from source content changed', async () => {
    const src = await brain.addDocument({
      title: 'Deploys',
      content: 'We deploy on Fridays.',
      provenance: { source: 'wiki' },
    });
    await brain.addFact({
      content: 'Summary: weekly deploys on Fridays.',
      provenance: { source: 'synthesis' },
      derivedFrom: [{ id: src.id }],
    });
    await brain.syncFiles();
    expect(lintTree(root).errors).toBe(0);

    // The source changes; the summary is now stale — lint must say so.
    await brain.update(src.id, { content: 'We deploy DAILY now.' });
    await brain.syncFiles();
    const report = lintTree(root);
    const stale = def(report.findings.find((f) => f.code === 'stale-summary'));
    expect(stale.level).toBe('error');
    expect(stale.message).toContain(src.id);
  });

  it('flags summaries pointing at sources that are not in the tree', async () => {
    await brain.addFact({
      content: 'Summary of nothing.',
      provenance: { source: 'synthesis' },
      truth: 'summary',
      derivedFrom: [{ id: 'no-such-record', hash: 'abc' }],
    });
    await brain.syncFiles();
    expect(codes(lintTree(root))).toContain('broken-link');
  });

  it('flags personal data in team-classified records (secrets error, paths warn)', async () => {
    await brain.addFact({
      content: 'Our deploy key is sk-live-abcdefghijklmnop1234 — do not share.',
      provenance: { source: 'chat' },
      sharing: 'team',
    });
    await brain.addFact({
      content: 'Config lives at /Users/sam/.glam/config.toml on my machine.',
      provenance: { source: 'chat' },
      sharing: 'team',
    });
    // The same content classified personal is nobody's business: no findings.
    await brain.addFact({
      content: 'My other key is sk-live-qrstuvwxyz9876543210.',
      provenance: { source: 'chat' },
      sharing: 'personal',
    });
    await brain.syncFiles();
    const report = lintTree(root);
    const secret = def(
      report.findings.find((f) => f.code === 'personal-data-in-team' && f.level === 'error'),
    );
    expect(secret.message).toContain('API key');
    const path = def(
      report.findings.find((f) => f.code === 'personal-data-in-team' && f.level === 'warn'),
    );
    expect(path.message).toContain('home path');
    // Exactly the two team records were flagged.
    expect(report.findings.filter((f) => f.code === 'personal-data-in-team').length).toBe(2);
  });

  it('flags files with missing or untrusted frontmatter', async () => {
    await brain.syncFiles(); // creates the tree skeleton
    writeFileSync(join(root, 'facts', 'dropped-in.md'), '# Raw note\n\nNo frontmatter yet.\n');
    writeFileSync(
      join(root, 'facts', 'broken.md'),
      '---\nid: b1\ntype: fact\ntruth: maybe\nsharing: personal\nprovenance:\n  source: s\n---\n\nx\n',
    );
    const report = lintTree(root);
    expect(codes(report)).toContain('missing-frontmatter');
    expect(codes(report)).toContain('frontmatter');
    expect(def(report.findings.find((f) => f.code === 'frontmatter')).level).toBe('error');
  });

  it('flags an out-of-date INDEX.md after unsynced writes', async () => {
    await brain.addFact({ content: 'first', provenance: { source: 's' } });
    await brain.syncFiles();
    expect(codes(lintTree(root))).not.toContain('index-stale');
    // A write-through happens without a sync: the file exists, INDEX.md lags.
    await brain.addFact({
      content: 'second, not yet in the index page',
      provenance: { source: 's' },
    });
    expect(codes(lintTree(root))).toContain('index-stale');
  });
});
