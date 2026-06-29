#!/usr/bin/env node
// A real, runnable demo of @glamfire/brain against the BUILT dist.
//   pnpm --filter @glamfire/brain build   (or: pnpm -r build)
//   node packages/brain/examples/demo.mjs
//
// It creates a real SQLite + sqlite-vec store on disk, ingests facts/docs/episode/pointer,
// runs a hybrid query, prints attributed results, and exports the whole brain to JSONL —
// the same way a human would kick the tires.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../dist/index.js';

const dir = mkdtempSync(join(tmpdir(), 'glamfire-brain-demo-'));
const storePath = join(dir, 'team.brain');
const brain = Brain.open(storePath);

console.log(`store file: ${storePath}`);
console.log(`embedder:   ${brain.embedder.id} (dim ${brain.embedder.dim}, offline)\n`);

await brain.addFact({
  content:
    'glamfire defaults to GLM 5.2 on Fireworks AI and escalates to frontier on low confidence.',
  provenance: { source: 'SPEC.md', author: 'glamworks' },
  scope: 'project',
});
await brain.addFact({
  content: 'The brain stores owned context in embedded SQLite with sqlite-vec vector search.',
  provenance: { source: 'SPEC.md' },
  scope: 'project',
});
await brain.addDocument({
  title: 'Ownership guarantee',
  content:
    'You own your context. The entire store exports to human-readable JSONL and imports back ' +
    'into a fresh store with content, provenance, and embeddings intact. No proprietary lock-in, ' +
    'no opaque embedding that cannot be regenerated, no remote dependency required to read your ' +
    'own context. Portability is a tested invariant, not a feature flag.',
  provenance: { source: 'docs/ownership.md' },
  scope: 'team',
});
await brain.addEpisode({
  content: 'A user asked to summarize a long PDF; the router chose GLM 5.2; the verifier passed.',
  provenance: { source: 'run-2026-06-29', timestamp: new Date().toISOString() },
});
await brain.addPointer({
  target: 'https://github.com/glamworks/glamfire/issues/4',
  content: 'Issue #4 — sqlite-vec owned context store + export/import invariant',
  provenance: { source: 'github' },
});

console.log(`ingested ${brain.count()} records:`);
for (const r of brain.list()) {
  console.log(`  - ${r.type.padEnd(8)} ${(r.title ?? r.content).slice(0, 56)}`);
}

const question = 'how does glamfire keep my context portable and owned?';
console.log(`\nquery: "${question}"\n`);
const res = await brain.query(question, { limit: 3, tokenBudget: 220 });
res.results.forEach((hit, i) => {
  const c = hit.components;
  console.log(
    `  #${i + 1} score=${hit.score.toFixed(3)} ` +
      `[vec=${c.vector.toFixed(2)} kw=${c.keyword.toFixed(2)} rec=${c.recency.toFixed(2)} prov=${c.provenance.toFixed(2)}]`,
  );
  console.log(`      ${hit.type} · source: ${hit.provenance.source}`);
  console.log(`      ${hit.text.slice(0, 80)}${hit.text.length > 80 ? '…' : ''}`);
});

console.log(`\npacked context (${res.usedTokens}/${res.tokenBudget} tokens):`);
console.log(
  res.context
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n'),
);

const exportPath = join(dir, 'team.brain.jsonl');
const jsonl = brain.export();
writeFileSync(exportPath, jsonl);
const lines = jsonl.split('\n').filter(Boolean);
console.log(`\nexported ${lines.length - 1} records to ${exportPath} (${jsonl.length} bytes)`);

// Prove portability: import into a fresh store and re-query.
const restored = Brain.open(join(dir, 'restored.brain'));
const imp = await restored.import(jsonl);
const back = await restored.query(question, { limit: 1 });
console.log(
  `re-imported ${imp.records} records into a fresh store; top hit still: "${back.results[0]?.text.slice(0, 48)}…"`,
);

brain.close();
restored.close();
rmSync(dir, { recursive: true, force: true });
console.log('\ndone — your brain is portable, attributed, and rip-out-able.');
