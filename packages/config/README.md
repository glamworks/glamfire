# @glamfire/config

The single, typed, **layered, zod-validated** configuration for glamfire
([SPEC §6](../../SPEC.md#6-configuration)). One schema drives the CLI, the
adapters, and the router. Secrets never live in the config — only *references* to
where a credential is resolved from (env var or OS keychain).

**Status:** working end-to-end. `glam config` prints it (redacted, with
provenance); `glam run` and the `fireworks-glm` adapter resolve through it.

## Layers (lowest → highest precedence)

```
built-in defaults  <  ~/.glam/config.toml  <  ./glam.toml  <  env vars  <  CLI flags
     (always)            (user)               (project,         (GLAM_* /        (overrides)
                                               searched upward)   *_BASE_URL)
```

Each leaf value records the layer that set it (**provenance**), so `glam config`
can show you exactly *why* a value is what it is.

```ts
import { loadConfig } from '@glamfire/config';

const { config, provenance, sources } = loadConfig({
  cwd: process.cwd(),
  env: process.env,
  overrides: { model: 'accounts/fireworks/models/glm-4p6' }, // CLI flags
});

config.run.effort;          // "high"
provenance['run.effort'];   // "default" | "user" | "project" | "env" | "override"
sources.project;            // absolute path to ./glam.toml, or null
```

On invalid config, `loadConfig` throws an actionable `ConfigError` naming the
**file**, the **field**, and **what was expected** — it never silently falls back.

## Secrets (SPEC §8)

A provider declares *where* its key comes from; the value lives in the env/keychain,
never in the file, logs, or the brain store. Resolution returns a `Secret` whose
`toString`/`toJSON` are `[REDACTED]`; the plaintext is reachable only via
`.reveal()` at the provider boundary.

```ts
import { resolveProviderCredential } from '@glamfire/config';

const key = resolveProviderCredential(config, 'fireworks', process.env);
String(key);     // "[REDACTED]"
key?.reveal();   // the actual key — only at the HTTP boundary
```

Credential references:

```toml
credential = { env = "FIREWORKS_API_KEY" }                                   # env var
credential = { keychain = { service = "glamfire", account = "anthropic" } }  # OS keychain
```

The OS keychain is read for real per platform: macOS `security`, Linux
`secret-tool` (libsecret), Windows Credential Manager (Win32 `CredRead`).

## Environment-variable layer

These env vars feed the *config* env layer (above the files, below CLI flags):

| Env var | Config path |
| --- | --- |
| `GLAM_MODEL` | `model` |
| `GLAM_EFFORT` | `run.effort` |
| `GLAM_TIER` | `run.tier` |
| `GLAM_TEMPERATURE` | `run.temperature` |
| `GLAM_MAX_USD` | `run.budget.maxUsd` |
| `GLAM_MAX_TOKENS` | `run.budget.maxTokens` |
| `GLAM_MAX_STEPS` | `run.budget.maxSteps` |
| `FIREWORKS_BASE_URL` | `providers.fireworks.baseUrl` |
| `ANTHROPIC_BASE_URL` | `providers.anthropic.baseUrl` |
| `OPENAI_BASE_URL` | `providers.openai.baseUrl` |
| `GLAM_LOCAL_BASE_URL` | `providers.local.baseUrl` |

(The `fireworks-glm` adapter additionally honors `FIREWORKS_API_KEY`,
`FIREWORKS_MODEL`, `FIREWORKS_REASONING_EFFORT`, `FIREWORKS_SERVICE_TIER`,
`FIREWORKS_TEMPERATURE` for its provider slice.)

## Routing policy — the `@glamfire/router` contract

The routing policy is declarative config so a team's cost posture is explicit and
reviewable (SPEC §5.3). The router (when wired) reads these **stable field names**:

```toml
[routing]
default = "accounts/fireworks/models/glm-5p2"   # used when no rule matches

[[routing.rules]]                                # evaluated top-to-bottom; first match wins
distribution = "center"                          # "center" | "edge"
candidates = ["accounts/fireworks/models/glm-5p2"]   # ordered cheapest-first

[[routing.rules]]
distribution = "edge"
minConfidence = 0.0                              # inclusive [0,1]
maxConfidence = 0.5                              # inclusive [0,1]
requires = ["tool_calling", "long_context"]      # capability tokens the candidate must declare
maxUsd = 2.0                                      # skip this rule above this projected spend
candidates = ["claude-sonnet-4-5", "accounts/fireworks/models/glm-5p2"]
```

Capability tokens: `tool_calling`, `parallel_tool_calls`, `json_mode`, `vision`,
`streaming`, `seed`, `long_context` (mirroring `@glamfire/engine`'s `Capabilities`).
The router selects a matching rule, filters `candidates` by `requires` + `maxUsd`,
and picks the cheapest survivor.

## Schema surface

`version`, `model`, `providers.{fireworks,anthropic,openai,local}`, `routing`,
`permissions`, `sandbox`, `run`. See the full annotated example in
[`glam.example.toml`](../../glam.example.toml) and the zod source in
[`src/schema.ts`](src/schema.ts). The schema is **strict**: an unrecognized key
(a typo) is a loud, actionable error.

## Try it

```bash
glam config            # resolved config, redacted, with per-value provenance
glam config --json     # same, machine-readable (secrets still redacted)
glam doctor            # reports which config files were discovered (issue #12)
```
