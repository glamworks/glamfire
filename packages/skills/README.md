# @glamfire/skills

Open skills — portable, model-agnostic capability packs (SPEC §5.5).

A **skill** is the portable "how to do X" that travels across models unchanged — the
opposite of a system prompt hand-tuned to one lab. A skill bundles a model-neutral
instruction/prompt template, the tools it needs, example episodes (few-shot), and an
optional verifier. Skills are loaded from disk, validated, and **installed into the
engine**: they contribute their instruction into `RunState.system` and register their
`ToolSpec`s, so any model — GLM, Claude, GPT, a local model — gets the capability
through its adapter.

Skills are **shareable between teams**: a skill is a self-contained directory you can
copy, commit, or publish. It depends only on Node and `@glamfire/engine`'s neutral
tool contract — never on this package being built, and never on a specific model.

## A skill on disk

```
code-explainer/
  skill.json     # the manifest (validated with zod)
  skill.mjs      # ES module exporting tool handlers + (optional) verifier
  template.md    # model-neutral instruction (referenced by instructionPath)
```

The handler module is a plain ES module so the directory is importable directly,
with no build step — that is what makes a skill portable between teams and machines.

## Manifest format (`skill.json`)

| Field             | Type                         | Notes |
| ----------------- | ---------------------------- | ----- |
| `name`            | string (kebab-case)          | **required** — skill id. |
| `version`         | string (semver)              | **required** — `MAJOR.MINOR.PATCH`. |
| `description`     | string                       | **required** — one line. |
| `module`          | string (relative path)       | ES module with handlers/verifier. Required if `tools` or a function `verifier` are declared. |
| `instruction`     | string                       | Inline model-neutral instruction. |
| `instructionPath` | string (relative path)       | File holding the instruction (e.g. `template.md`). One of `instruction`/`instructionPath` is **required**. |
| `tools`           | array of tool declarations   | See below. Default `[]`. |
| `episodes`        | array of `{goal, response, note?}` | Few-shot examples folded into the system text. |
| `verifier`        | string                       | Name of an exported verifier function `(output, ctx?) => VerifierResult`. |
| `rubric`          | `{ criteria: [...] }`        | Declarative, model-free verifier (used if `verifier` is absent). |

**Tool declaration** (becomes an engine `ToolSpec`):

| Field         | Type                    | Notes |
| ------------- | ----------------------- | ----- |
| `name`        | string (identifier)     | Tool name the model calls. |
| `description` | string                  | What the tool does. |
| `permission`  | `read`\|`write`\|`network`\|`exec` | Engine permission class. Default `exec` (least trust). |
| `parameters`  | JSON-Schema object      | Arguments schema (model-neutral; re-emitted per model by the adapter). |
| `handler`     | string                  | Name of the async function exported by `module`. |

**Rubric criterion** (`rubric.criteria[]`): `{ description, must?, mustNot? }` where
`must`/`mustNot` are regexes the output must / must not match. A rubric is fully
deterministic and provider-independent.

## Usage

```ts
import { loadSkill, discoverSkills, installSkills } from '@glamfire/skills';
import { ToolRegistry, runTask } from '@glamfire/engine';

const skill = await loadSkill('packages/skills/examples/code-explainer');
// or: const skills = await discoverSkills('./skills');

const { system, tools } = installSkills([skill]);

const registry = new ToolRegistry();
for (const t of tools) registry.register(t);

const run = await runTask({
  task: { goal: 'Explain this code', inputs: { source }, budget: { maxSteps: 6 } },
  adapter, config, cwd: process.cwd(),
  system,           // <- the skill's model-neutral instruction contribution
  tools: registry,  // <- the skill's tools, available to any model
});

// Optionally gate / escalate on the skill's verifier:
const verdict = await skill.verifier?.(run.output, { task });
```

## Try it

```bash
pnpm --filter @glamfire/skills build
node packages/skills/examples/demo.mjs
```

The demo loads the example skill, prints the resolved system + tools a model would
receive, runs the skill's real tool, and runs its verifier on a sample output.

**Status:** implemented and tested — manifest format, loader, installer, the rubric
and function verifiers, and the `code-explainer` example skill are real and exercised
end-to-end against the engine loop. See [`../../SPEC.md`](../../SPEC.md) §5.5 and the
repo `README.md` → *Current reality*.
