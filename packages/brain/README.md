# @glamfire/brain

The open brain — local-first, portable, **owned** context and memory (SPEC §5.2).

**The markdown is the brain; SQLite is the index.** Knowledge lives as one readable
markdown file per record (YAML frontmatter) in a flat `brain/` tree you can grep, edit,
and commit to git; a single SQLite file (`sqlite-vec` vectors + FTS5) is a **derived,
disposable index** — delete it and `Brain.rebuildFromFiles` / `glam brain rebuild`
reconstructs it losslessly. Zero external services on macOS, Windows, and Linux. Four
first-class record types, hybrid retrieval, and **two tested ownership invariants**:
JSONL export → import, and markdown tree → full index rebuild.

## Quick start

```ts
import { Brain } from '@glamfire/brain';

const brain = Brain.open('./team.brain'); // or ':memory:'

await brain.addFact({
  content: 'The default model is GLM 5.2 on Fireworks AI.',
  provenance: { source: 'SPEC.md' },
  scope: 'project',
});
await brain.addDocument({ title: 'Onboarding', content: longText, provenance: { source: 'wiki' } });
await brain.addEpisode({ content: 'Routed a summarize task to GLM 5.2; verified.', provenance: { source: 'run-log' } });
await brain.addPointer({ target: 'https://github.com/glamworks/glamfire/issues/4', provenance: { source: 'github' } });

const res = await brain.query('how does retrieval work?', { tokenBudget: 1024 });
console.log(res.context); // attributed, token-budgeted context block

const portable = brain.export(); // JSONL — human-readable, model-neutral
```

Run the live demo against the built `dist`:

```bash
pnpm --filter @glamfire/brain build
node packages/brain/examples/demo.mjs
```

## Memory model

Every record carries **provenance** (`source` required), a **scope**
(`private` / `project` / `team`), a **truth** classification (`source` = ground truth
vs `summary` = regenerable synthesis with `derivedFrom` span links + content hashes),
a **sharing** classification (`personal` / `team`, default `personal`), and **tags**.
Nothing is ever uploaded.

| Type | Meaning |
|---|---|
| `Fact` | one durable piece of knowledge |
| `Document` | ingested source, chunked + embedded; chunks are the retrievable unit, attributed to the parent |
| `Episode` | a logged interaction/run, reusable as few-shot context |
| `Pointer` | a reference to an external resource (URL/ticket/dashboard) |

All inputs are validated with **zod** — bad data never reaches the store.

## Retrieval

Hybrid and re-ranked into a single score, then packed to a token budget with full
attribution:

```
score = wVec·vector + wKw·keyword + wRec·recency + wProv·provenance
```

- **vector** — cosine similarity via `sqlite-vec` KNN over normalized embeddings
- **keyword** — FTS5 / BM25, min-max normalized
- **recency** — exponential decay (configurable half-life)
- **provenance** — per-type trust prior (facts > episodes > documents > pointers),
  with optional per-source overrides

Weights are configurable per store and per query (`DEFAULT_WEIGHTS`).

## Embedding backend

The store is **embedder-agnostic** (`Embedder` interface). The **default is
`HashEmbedder`** — a deterministic, fully-offline, zero-dependency embedder using the
signed feature-hashing trick (standard NLP, cf. scikit-learn's `HashingVectorizer`).
This was a deliberate choice: it needs **no model download, no API key, no network**,
is **identical on every machine**, and is **regenerable from text alone** — the purest
expression of the SPEC §5.2 ownership guarantee ("no opaque embedding that can't be
regenerated, no remote dependency required to read your own context"). It also makes
the export/import round-trip bit-exact and CI hermetic.

For **dense transformer recall**, a real opt-in backend is provided
(`createFastEmbedEmbedder`, BGE-small via `fastembed` — ONNX on-device, no API key). It
is intentionally **not** a hard dependency (keeps the default install lean and offline
and avoids pulling native `onnxruntime`); enable it explicitly:

```bash
pnpm add fastembed
```
```ts
import { Brain, createFastEmbedEmbedder } from '@glamfire/brain';
const brain = Brain.open('./team.brain', { embedder: await createFastEmbedEmbedder() });
```

A store is bound to its embedder (id + dim) on first write and refuses to open with an
incompatible one. To switch backends, re-import with `{ regenerate: true }`.

## Ownership invariant (the headline)

`brain.export()` serializes the **entire** store to JSONL: a header line plus one line
per record, every human-relevant field in plain JSON; chunk embeddings travel as base64
float32 so the round-trip is bit-exact (and are fully regenerable from text). `import()`
reconstructs it into a fresh store. The invariant is covered by
`test/export-import.test.ts`: seed → export → fresh store → import → records, provenance,
and embeddings are identical, and embeddings also **regenerate** deterministically.

## Cross-platform notes

- `better-sqlite3` ships prebuilt binaries; `sqlite-vec` ships per-platform packages for
  darwin-x64, darwin-arm64, linux-x64, linux-arm64, and windows-x64 — covering all three
  target OSes. No system SQLite or build toolchain is required for the default install.
- The store file is a single portable file; copy it and it travels with your project.

## The flat-file tree (research/31)

Open a brain with `{ filesRoot: 'brain' }` and every write goes through to markdown:

```
brain/
  INDEX.md        # generated catalog — one line per record
  log.md          # append-only sync/conflict/tombstone log
  sources/        # truth: source documents (ingested, immutable ground truth)
  facts/          # durable atomic facts
  notes/          # truth: summary — regenerable syntheses with derived_from links
  pointers/       # external references
  episodes/       # logged runs
  .index/         # the disposable SQLite index (gitignored)
```

`brain.syncFiles()` (CLI: `glam brain sync`) reconciles by **content hash, never
mtime**: human-edited files win for `truth: source`; newest wins only for regenerable
summaries; conflicts are surfaced as `*.conflict.md` and logged, never silently
merged. Plain markdown dropped into the tree is **adopted** as a record — the generic
import path for any external source (including a Claude Code memory export).
`lintTree()` (CLI: `glam brain lint`) flags stale summaries (a `derived_from` source
whose content hash changed), broken frontmatter, and personal-data heuristics in
`sharing: team` records.

**The headline invariant** (`test/rebuild.test.ts` + smoke): delete
`.index/brain.sqlite`, run `glam brain rebuild`, and every record, timestamp, chunk,
and (deterministic) embedding is reconstructed from the markdown alone.

## Status

Implemented and tested (real SQLite + sqlite-vec engine, not a fake). Built in lock-step
with the rest of the harness — see [`../../SPEC.md`](../../SPEC.md) §5.2.
