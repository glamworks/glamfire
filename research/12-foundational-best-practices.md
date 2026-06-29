# 12 — Foundational Best-Practices Framework for the glamfire TypeScript Stack

> Scope: opinionated, concrete engineering conventions for **glamfire** — an OSS, cross-platform (macOS/Windows/Linux) AI agentic harness built as a **TypeScript monorepo** (pnpm workspaces, Node 20+/Bun, distributed via npm + standalone single-file binaries).
> Date: June 2026. This document is meant to be the canonical "how we build" reference that every other package in the repo inherits from.

---

## 1. Repo layout — a pnpm monorepo that scales

### The two-bucket rule

Split everything into **deployable/shippable things** vs **reusable libraries**. This is the single most important structural decision and it pays off forever:

- `apps/` — things you ship or run. Each has its own entry point, build, and release surface.
- `packages/` — internal libraries consumed by `apps/` (and by each other). These have a public API surface and are the unit of versioning.

This distinction makes it instantly obvious what is meant to be published/deployed vs what is internal plumbing.

### Recommended glamfire tree

```
glamfire/
├── pnpm-workspace.yaml          # workspace globs + catalog (single source of dep versions)
├── package.json                 # root: private:true, only dev tooling + scripts
├── tsconfig.base.json           # the strict base every package extends
├── tsconfig.json                # root solution file (references only)
├── .changeset/                  # changeset files + config.json
├── .github/
│   ├── CODEOWNERS
│   └── workflows/{ci.yml,release.yml}
├── apps/
│   ├── cli/                     # @glamfire/cli — the user-facing binary (bin entry)
│   └── server/                  # @glamfire/server — long-running agent host / daemon
├── packages/
│   ├── core/                    # @glamfire/core — agent loop, orchestration (no I/O deps)
│   ├── tools/                   # @glamfire/tools — built-in agent tools
│   ├── providers/               # @glamfire/providers — LLM provider adapters
│   ├── config/                  # @glamfire/config — config loading/validation (zod)
│   ├── logger/                  # @glamfire/logger — shared pino setup + redaction
│   ├── errors/                  # @glamfire/errors — typed error taxonomy + Result helpers
│   └── protocol/                # @glamfire/protocol — shared types/schemas (CLI<->server)
├── tooling/                     # @glamfire/tsconfig, @glamfire/eslint-config (config-as-packages)
└── e2e/                         # cross-package smoke/golden tests (the "thin slice" suite)
```

### Naming & conventions

- **Scope everything**: `@glamfire/*`. Prevents collisions, signals "internal," makes refactors greppable.
- **Folder name == unscoped package name** (`packages/core` ⇒ `@glamfire/core`). Zero cognitive overhead.
- **Dependency direction is one-way**: `apps/* → packages/*`, and within packages, keep `core` dependency-free of I/O (no pino, no fs). Pure logic in `core`; side effects pushed to the edges (`apps`, `providers`). This keeps `core` trivially testable and is what makes the "thin vertical slice" philosophy (§10) cheap.
- **`workspace:*` protocol** for all internal deps — pnpm rewrites these to real versions on publish.
- **pnpm `catalog:`** for third-party versions. Define versions once in `pnpm-workspace.yaml` and reference `catalog:` in each package, so every package uses the same `zod`, `pino`, `typescript`, etc. This eliminates version drift across the monorepo — the most common and most annoying class of monorepo bug.
- **Config-as-packages** (`tooling/`): publish your `tsconfig` and `eslint-config` as internal packages so every package extends the same base by name, not by relative `../../..` paths.
- Add a build-graph tool (**Turborepo or Nx**) on top of pnpm *only when* build times hurt — they add caching + `--filter`-by-changed-since-git. pnpm's native `--filter ...[origin/main]` covers you until then. Don't adopt prematurely.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tooling/*"
  - "e2e"
catalog:
  typescript: ^5.8.0
  zod: ^3.24.0
  pino: ^9.6.0
  neverthrow: ^8.1.0
  vitest: ^3.0.0
```

---

## 2. Strict TypeScript — the non-negotiable tsconfig

In 2026 the strict flags below are not optional; they catch real bugs that cost real time. The most important one TypeScript still does **not** turn on under `strict: true` is `noUncheckedIndexedAccess` — turn it on explicitly.

### Recommended `tsconfig.base.json`

```jsonc
{
  "compilerOptions": {
    // --- Type safety ---
    "strict": true,                       // umbrella: noImplicitAny, strictNullChecks, etc.
    "noUncheckedIndexedAccess": true,     // arr[i] / obj[key] is T | undefined — catches real bugs
    "noImplicitOverride": true,           // must write `override` explicitly
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,   // {a?: T} ≠ {a: T | undefined}; strict but correct
    "noPropertyAccessFromIndexSignature": true,

    // --- Modules / ESM-first ---
    "module": "nodenext",                 // apps/libs shipped to Node: real ESM/CJS resolution
    "moduleResolution": "nodenext",       // honors package.json "exports"/"imports", needs extensions
    "verbatimModuleSyntax": true,         // forces `import type`; predictable ESM/CJS emit, no elision surprises
    "isolatedModules": true,              // safe for esbuild/swc/Bun single-file transpilers
    "resolveJsonModule": true,
    "esModuleInterop": true,

    // --- Emit / target ---
    "target": "es2023",
    "lib": ["es2023"],
    "moduleDetection": "force",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,                 // don't typecheck node_modules .d.ts — big speedup, standard
    "incremental": true
  }
}
```

### Notes & the `bundler` vs `nodenext` decision

- **`nodenext` for anything Node executes or that you publish to npm** (the glamfire `cli`, `server`, and all `packages/*`). It enforces correct ESM import syntax (extensions on relative imports, correct `import type`) and matches what Node actually does at runtime. This is the safest default for a tool distributed via npm.
- **`bundler` only for code that always goes through a bundler** (e.g. a future web dashboard/Vite app). `bundler` never requires file extensions on relative imports and supports `exports`/`imports`, but it lies about Node's real resolution, so don't use it for shipped Node packages.
- **`verbatimModuleSyntax: true`** is the modern replacement for `importsNotUsedAsValues`/`isolatedModules`-era flags. It forbids ambiguous imports and forces `import type { X }` for type-only imports, which (a) prevents accidental runtime imports of type-only modules and (b) keeps single-file binary builds (Bun/esbuild) honest. Pair it with the ESLint rule `@typescript-eslint/consistent-type-imports` set to auto-fix.
- **ESM-first**: set `"type": "module"` in every `package.json`. If a consumer needs CJS, ship dual output via tsup/unbuild rather than authoring CJS.
- Each package has its own `tsconfig.json` that `extends: "../../tsconfig.base.json"` and sets `rootDir`/`outDir` + `references` to its workspace deps (TypeScript project references = fast incremental builds + enforced dependency graph).

---

## 3. Error handling — typed errors, Result at the boundaries, never throw strings

### Principles

1. **Never `throw` a string or a bare object.** Always throw (or wrap) an `Error` subclass — strings have no stack, no `cause`, no `instanceof`.
2. **A typed error taxonomy.** Define a base `GlamfireError` with a stable, machine-readable `code` and a `kind` discriminant. Subtype per domain (`ConfigError`, `ProviderError`, `ToolExecutionError`, `ProtocolError`). Consumers switch on `code`, never on message strings.
3. **Always chain causes.** Use the native `cause` option (`new ProviderError("call failed", { cause: err })`). It preserves the original stack and is printed by Node's error formatter. Never swallow the original error.
4. **Result types at fallible boundaries; exceptions for truly exceptional/programmer errors.** Use **`neverthrow`** `Result<T, E>` / `ResultAsync<T, E>` for *expected* failures (network call, parse, tool invocation, user input). Reserve `throw` for invariant violations / bugs that should crash. This makes the unhappy path part of the type signature, so the compiler forces callers to handle it — TypeScript otherwise never makes you handle a thrown error.

### Concrete pattern

```ts
// @glamfire/errors
export type ErrorCode =
  | "CONFIG_INVALID" | "PROVIDER_UNAVAILABLE" | "TOOL_FAILED" | "PROTOCOL_MISMATCH";

export class GlamfireError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}
export class ProviderError extends GlamfireError {
  constructor(message: string, opts?: { cause?: unknown }) { super("PROVIDER_UNAVAILABLE", message, opts); }
}

// neverthrow at the boundary
import { ResultAsync, ok, err } from "neverthrow";
export function callProvider(req: Req): ResultAsync<Resp, ProviderError> {
  return ResultAsync.fromPromise(doFetch(req), (e) => new ProviderError("call failed", { cause: e }));
}
```

- Use **`eslint-plugin-neverthrow`** to fail CI if a `Result` is constructed but never `.match()`/`.unwrapOr()`/`_unsafeUnwrap()`-ed — this prevents silently dropped errors, the main failure mode of Result types.
- `isOk()` / `isErr()` act as type guards so the value/error is narrowed without `await`.
- **At the very top of the CLI/server** (and only there), convert any escaped throw or `err` into a clean exit: print a user-facing message keyed off `code`, log the full `cause` chain at debug level, set a non-zero exit code. Internal layers never `console.error` and exit.

---

## 4. Structured logging — pino, JSON, redaction, correlation IDs

Use **pino** — it's the fastest Node logger and is built for structured (JSON) logging with child loggers, redaction, and low overhead. A single shared `@glamfire/logger` package owns the config so the CLI and server log identically.

### Rules

- **JSON logs always in production / to files / when piped**; pretty (`pino-pretty`) only for an interactive TTY. Detect with `process.stdout.isTTY`. JSON is what makes logs greppable and aggregatable (Loki/OTel/CloudWatch); pretty is purely a dev nicety.
- **Levels**: `trace` (wire-level), `debug` (developer detail), `info` (lifecycle: started, finished, request handled), `warn` (recoverable/degraded), `error` (operation failed), `fatal` (process is dying). Default the CLI to `warn`/`info`, expose `--log-level` / `GLAMFIRE_LOG_LEVEL`, and bump to `debug`/`trace` with `-v`/`-vv`.
- **Redaction is mandatory, configured once.** Use pino's `redact` (built on `fast-redact`, ~2% overhead) to censor known secret paths: `authorization`, `*.apiKey`, `*.token`, `password`, `set-cookie`, `env.*_KEY`, `*.OPENAI_API_KEY`, etc. Redaction is a safety net, not a license to log secrets — never deliberately log a secret value (§5). Prefer an allowlist of what you log over a denylist of what you redact.
- **Correlation IDs**: every agent run/session gets a `runId` (and per-request `requestId` in the server). Attach via a **child logger** (`logger.child({ runId })`) and propagate through `AsyncLocalStorage` so every log line in that run carries the ID automatically — this is what lets you trace one agent turn across the CLI → server → provider hops.
- **OTel-ready**: in 2026, wire `@opentelemetry/instrumentation-pino` so logs auto-carry `trace_id`/`span_id` when running under the server. Optional for the CLI, valuable for the daemon.
- **Logs go to stderr for a CLI**, never stdout. stdout is reserved for the program's actual output (so it stays pipeable / parseable). This is critical for an agentic CLI whose stdout may be consumed by another tool.

```ts
// @glamfire/logger
import pino from "pino";
export const logger = pino({
  level: process.env.GLAMFIRE_LOG_LEVEL ?? "info",
  redact: {
    paths: ["authorization","*.apiKey","*.token","password","set-cookie","headers.authorization","*.OPENAI_API_KEY","*.ANTHROPIC_API_KEY"],
    censor: "[REDACTED]",
  },
  ...(process.stderr.isTTY ? { transport: { target: "pino-pretty", options: { destination: 2 } } } : {}),
}, pino.destination(2)); // 2 = stderr
```

---

## 5. Secrets handling — env discipline, never log, OS keychain, dotenvx

### Layered model (most-preferred first)

1. **OS keychain** for a CLI's long-lived user secrets (API keys). On macOS use the Keychain (`security`), Windows Credential Manager, Linux Secret Service (libsecret). The cross-platform Node binding is **keytar**-style; since keytar is unmaintained, prefer a maintained fork/equivalent or shell out to the native `security`/`cmdkey`/`secret-tool`. Secrets live in the OS vault, never in a dotfile. This is the right default for `glamfire login` storing a provider key.
2. **`dotenvx`** for project/dev secrets and CI. dotenvx is the secure successor to dotenv from the same author: it **encrypts** `.env` with AES-256 + a Secp256k1 keypair, so you can safely commit `.env` (ciphertext) while the private key (`DOTENV_PRIVATE_KEY`) is stored separately — e.g. in the OS keychain, not in shell history. Run via `dotenvx run -- glamfire ...`.
3. **Plain process env** in production / containers — injected by the orchestrator, never written to disk.

### Discipline

- **`.env` is git-ignored; `.env.example` (keys only, no values) is committed.** With dotenvx, the *encrypted* `.env` may be committed but `.env.keys` is always ignored.
- **Validate env at startup** with a zod schema (`@glamfire/config`) so a missing/invalid key fails fast with a clear message instead of an `undefined` deep in a request.
- **Never log secrets.** Reinforced by §4 redaction, but the real rule is: don't put secrets in log calls at all, don't put them in error messages, and scrub them from any provider-request dump. Mark secret-bearing config fields as `brand`ed/`Secret<string>` types whose `toString()`/`toJSON()` returns `[REDACTED]`.
- **No secrets in CLI args** (they leak into `ps`/shell history) — read from env/keychain/stdin.
- Run **`gitleaks`/secret-scanning in CI** (and as a pre-commit hook) to block accidental commits.

---

## 6. Semantic versioning + version-in-output

- Follow **SemVer**: MAJOR (breaking), MINOR (feature, backward-compatible), PATCH (fix). For a `0.x` agent harness, treat MINOR as the "may break" lever and document it.
- **`glamfire --version` must print version *and* build provenance**: `1.4.2 (commit 9f3a1c2, built 2026-06-29, node 20.14.0)`. Why this matters:
  - **Reproducible bug reports** — a user pastes one line and you know *exactly* the bits they ran, including pre-release/nightly builds that share a SemVer.
  - **Supply-chain verification** — the commit hash ties the running binary back to a specific, auditable source commit (vital for a standalone single-file binary that bypasses npm's integrity metadata).
  - **Distinguishing builds** — npm version + git SHA disambiguates two binaries that report the same SemVer (e.g. a hotfix rebuild).
- **How**: inject at build time. Read `package.json` version, and `git describe --tags --always --dirty` (gracefully falls back to a short hash when no tag is reachable, and the `--dirty` suffix flags uncommitted local builds). Bake both into a generated `version.ts` / define-replace (`esbuild --define:__GLAMFIRE_BUILD__=...`) so the value is frozen into the single-file binary where no `.git` exists at runtime.
- Also surface it in `glamfire doctor` output and in the User-Agent of provider calls.

---

## 7. Conventional Commits → Changesets → automated releases

### Commits

- Adopt **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `feat!:`/`BREAKING CHANGE:`). Enforce with **commitlint** + a Husky `commit-msg` hook. This gives a parseable history and a clear breaking-change signal.

### Versioning & releases: Changesets (recommended over semantic-release for this monorepo)

- Use **Changesets**. It's purpose-built for monorepos with multiple publishable packages and has the most mature **independent versioning** story: one PR can bump different packages by different amounts, and a single changeset file declares the intent + changelog entry.
- **Why Changesets over commit-driven semantic-release here**: glamfire publishes several packages (`@glamfire/core`, `tools`, `cli`, …). semantic-release infers the bump purely from commit messages; Changesets *decouples* the release intent from commits — a contributor adds a `.changeset/*.md` describing what changed and which packages bump. The **changesets bot** then comments on each PR with exactly which packages will release and at what versions, which is far clearer for an OSS project with outside contributors.
- **Flow**:
  1. PR includes a changeset (`pnpm changeset`) → CI checks one exists for any `packages/*` change.
  2. Merge to `main` → the **Changesets GitHub Action** opens/updates a "Version Packages" PR that bumps versions + writes CHANGELOGs.
  3. Merge that PR → the action runs `pnpm changeset publish` to npm, tags releases, and a follow-on job builds + attaches the **standalone single-file binaries** (Bun/`pkg`/`node --sea`) to the GitHub Release.
- You still get Conventional Commits' benefits (clean history, commitlint gate); Changesets owns the version math. The two are complementary, not competing.

---

## 8. PR gates — everything green, required, owned

### Required status checks (branch protection on `main`)

Every PR must pass, and these are marked **required** so they cannot be merged red:

- **Lint** — ESLint (typescript-eslint, `eslint-plugin-neverthrow`, import ordering) + Prettier check.
- **Typecheck** — `tsc --build --noEmit` across the whole workspace (project references).
- **Test** — `vitest run` (unit) + the e2e/smoke suite (§9).
- **Build** — every package builds *and* the single-file CLI binary builds on all three OSes (matrix: ubuntu/macos/windows).
- **Changeset present** — for any change touching `packages/*` (`changeset status`).
- **Secret scan** — gitleaks.

Other discipline:

- **Run only what changed** with pnpm `--filter '...[origin/main]'` (and Turbo/Nx cache later) to keep CI fast, but the *full* matrix must run before merge to `main`.
- **CODEOWNERS** — `/.github/CODEOWNERS` requires review from the owning team per path (e.g. `/packages/providers/ @glamfire/providers-team`, `/apps/cli/ @glamfire/cli-team`). Combined with "require review from Code Owners" branch protection, this guarantees the right eyes on each subsystem.
- **No `|| true`, no `--skip`, no `xfail` to get green.** A flaky/broken gate gets fixed at the root, not bypassed — a worked-around gate is a trap that fails later on a user's time.
- Squash-merge with the PR title as a Conventional Commit so `main` history stays clean.

---

## 9. Smoke tests & regression discipline

### What a smoke test is

A **smoke test** is a tiny, fast, breadth-first check that the system *boots and does the one most important thing* — "does it light up without smoke?" For glamfire: `glamfire --version` exits 0 and prints a version; `glamfire run "say hi"` with a stubbed-at-the-edge provider completes one full agent turn and prints a result; the server starts, answers `/health`, and shuts down cleanly. Smoke tests run on every PR and every release candidate, before any deeper suite.

### Golden / snapshot tests for CLI output

- **Golden (snapshot) tests** capture the CLI's stdout/stderr/exit-code for a fixed input and diff future runs against the committed "golden" file. They are the cheapest way to lock CLI UX and catch accidental output regressions (help text, table formatting, JSON shape).
- Use **Vitest snapshots** (or committed golden files under `e2e/__golden__/`). Run the *built binary* (or `node dist/cli.js`), not the TS source, so you test what ships.
- **Normalize non-determinism** before snapshotting: scrub the version/commit line, timestamps, durations, temp paths, and absolute home dirs — otherwise snapshots churn. A small `normalize()` helper keeps goldens stable.
- Snapshot the **machine-readable mode** too: `glamfire run --json` output is a contract; golden-test its schema so downstream tool consumers don't break.

### Regression discipline

- **Every bug fix ships with a failing-first test** that reproduces it (red → green). This is what stops the same regression twice.
- Keep a dedicated `e2e/regressions/` folder; name tests after the issue (`issue-412-empty-tool-args.test.ts`).
- Treat snapshot updates as **reviewable diffs** — a changed golden in a PR must be intentional and explained, never blind `--update`.

---

## 10. Development philosophy — no shims/mocks, only full-stack mini-features

**Build thin vertical slices that exercise the whole stack, instead of mocking the layers between.**

### What this means concretely

- A new capability is delivered as a **mini-feature that runs end-to-end**: CLI command → core agent loop → tool/provider call → result rendered → exit code. Even the first commit of a feature touches every layer, just narrowly.
- **Mock only the irreducible outer edge** — the third-party HTTP boundary (the actual LLM API), and even there prefer a **recorded/replayed** real response (e.g. captured fixtures / a local fake server) over a hand-written `jest.mock`. Everything *inside* glamfire is real: real config loading, real serialization, real error propagation, real logging.
- **No internal-boundary mocks.** Don't mock `@glamfire/core` when testing the CLI, or mock the provider package when testing core. Wire the real packages together.

### Why this catches integration bugs early

- **Mocks encode your assumptions, not reality.** A mock of the provider layer asserts how you *think* it behaves; the real layer asserts how it *actually* behaves. Most painful bugs live in the seams — serialization mismatches, ESM/CJS interop, `verbatimModuleSyntax` import errors, env not loaded, an error `cause` chain that gets flattened, a Result that's silently dropped at a boundary. **Mocked tests pass while the seam is broken.**
- A vertical slice fails *the moment* two real layers disagree, on your machine, in a 5-second test — instead of in a user's terminal after release.
- It keeps **`core` pure and I/O at the edges** (§1) honest: if a slice is hard to wire without mocks, that's a design smell telling you a dependency points the wrong way.
- It compounds with §9: each mini-feature *is* a smoke/golden test, so the smoke suite grows organically and always reflects real user paths.

> Rule of thumb: if a test passes but you can't ship the feature from it, the test mocked the wrong thing.

---

## 11. Human end-user verification — proving a release actually works

Automated gates prove the code is internally consistent; they do **not** prove a human can install and use the release. Before shipping a CLI release, do real-user verification:

### Dogfooding

- The team uses the **installed** glamfire (from npm / the binary) for its own daily work, *not* `pnpm dev` off the branch. Dogfooding surfaces install-path bugs (missing `bin` shebang, ESM resolution at runtime, missing `files` in `package.json`, broken `postinstall`) that never appear in the repo.
- Cut **nightly/`next`-tag prereleases** so dogfooding happens continuously, not just at release time.

### Pre-release manual QA checklist (run on macOS, Windows, Linux)

- [ ] **Clean install works**: `npm i -g @glamfire/cli@next` in a *fresh* environment (container/VM with no repo, no dev deps) — and the standalone binary runs on a machine with **no Node installed**.
- [ ] `glamfire --version` prints the expected SemVer **+ commit + build date**, and the commit matches the tag.
- [ ] `glamfire --help` renders; every advertised command exists.
- [ ] **First-run / onboarding** works from zero: `glamfire login` stores a key in the OS keychain; no secret is printed or logged.
- [ ] The **primary happy path** runs end-to-end against a *real* provider and produces sane output.
- [ ] `--json` output is valid and matches the documented schema.
- [ ] Logs go to **stderr**, stdout is clean/pipeable, secrets are redacted (grep the logs for the key — must be `[REDACTED]`).
- [ ] Exit codes correct: `0` success, non-zero on error; a forced error prints a friendly message (not a raw stack) with the `cause` available at `-v`.
- [ ] Uninstall is clean.

### Release gating

- Promote `next` → `latest` only after the checklist passes on all three OSes and at least one full dogfood day with no new install-path issues.
- Keep the checklist in the repo (`/docs/release-checklist.md`) and require a signed-off copy linked in the release PR. "Done" = builds clean, all gates green for real, version bumped, merged to main, **and installed where the user runs it** — so the user tests off a trustworthy build, not a branch with caveats.

---

## Key takeaways for glamfire

1. **Two buckets**: `apps/` (ship/run) vs `packages/` (libraries); scope everything `@glamfire/*`, pin third-party versions once via **pnpm `catalog:`**, keep `core` pure with I/O at the edges.
2. **One strict `tsconfig.base.json`**: `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `exactOptionalPropertyTypes`, **`nodenext`** module resolution for everything shipped to Node (reserve `bundler` for future web UI), ESM-first.
3. **Typed errors + Result at the boundary**: `GlamfireError` taxonomy with stable `code`s, always chain `cause`, **neverthrow** `Result`/`ResultAsync` for expected failures, `throw` only for bugs; lint with `eslint-plugin-neverthrow`. Never throw strings.
4. **pino, JSON, redacted, correlated**: one shared logger, JSON in prod / pretty on TTY, mandatory secret redaction, `runId` via child loggers + `AsyncLocalStorage`, **logs to stderr** so stdout stays a clean machine contract.
5. **Secrets**: OS keychain for the CLI's user keys, **dotenvx** (encrypted `.env`) for dev/CI, plain env in prod; validate env with zod at startup; never log/arg secrets; gitleaks in CI.
6. **Version-in-output**: `--version` prints SemVer **+ commit (git describe --dirty) + build date**, baked in at build time so single-file binaries carry provenance.
7. **Conventional Commits + Changesets**: commitlint gate for history, Changesets owns multi-package version math + the release PR + npm publish + binary attach.
8. **PR gates all green & required**: lint, typecheck, test, cross-OS build, changeset, secret-scan; CODEOWNERS per subsystem; **never** `|| true`/`--skip` to fake green.
9. **Smoke + golden tests**: fast breadth-first boot checks + normalized snapshot tests of the *built* CLI output (incl. `--json`); every bug fix ships a failing-first regression test.
10. **No internal mocks — thin vertical slices**: every feature runs CLI→core→provider end-to-end; mock only the outer HTTP edge (prefer recorded real responses). Seams break loudly in 5s, not on a user's machine.
11. **Human verification before ship**: dogfood the *installed* artifact, run a cross-OS manual QA checklist (clean install, no-Node binary, version provenance, onboarding, secret redaction, exit codes), promote `next`→`latest` only after it all passes.

---

## Sources

- TSConfig Cheat Sheet (Total TypeScript): https://www.totaltypescript.com/tsconfig-cheat-sheet
- TypeScript TSConfig Reference: https://www.typescriptlang.org/tsconfig/
- TypeScript — Choosing Compiler Options (Modules): https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html
- TypeScript — `moduleResolution`: https://www.typescriptlang.org/tsconfig/moduleResolution.html
- How to Set Up TypeScript with Every Major Framework (2026), PkgPulse: https://www.pkgpulse.com/guides/how-to-set-up-typescript-with-every-framework
- neverthrow (GitHub): https://github.com/supermacro/neverthrow
- neverthrow — Error Handling Best Practices (wiki): https://github.com/supermacro/neverthrow/wiki/Error-Handling-Best-Practices
- Error Handling with Result Types (typescript.tv): https://typescript.tv/best-practices/error-handling-with-result-types/
- Practically Safe TypeScript Using Neverthrow (Sölberg): https://www.solberg.is/neverthrow
- MDN — Error.prototype.cause: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
- pino — redaction docs: https://github.com/pinojs/pino/blob/main/docs/redaction.md
- A Complete Guide to Pino Logging in Node.js (Better Stack): https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/
- Node.js Structured Logging in Production: Pino, Correlation IDs, Log Aggregation (dev.to): https://dev.to/axiom_agent/nodejs-structured-logging-in-production-pino-correlation-ids-and-log-aggregation-262m
- Structured Logging with Pino 9 + OTel in Node.js (1xAPI, 2026): https://1xapi.com/blog/structured-logging-nodejs-pino-opentelemetry-2026
- dotenvx (GitHub): https://github.com/dotenvx/dotenvx
- dotenvx — Encrypt secrets with the CLI: https://dotenvx.com/docs/secrets-with-cli
- A Small Hardening Trick for .env.local: dotenvx + OS Keychain (dev.to): https://dev.to/ustun/a-small-hardening-trick-for-envlocal-dotenvx-os-keychain-2533
- Best dotenv Alternatives for 2026 (Keyway): https://keyway.sh/articles/dotenv-alternatives
- Semantic Versioning 2.0.0: https://semver.org/
- git-describe documentation: https://git-scm.com/docs/git-describe
- Add git commit hash to version output (dapr/cli #599): https://github.com/dapr/cli/issues/599
- Conventional Commits specification: https://www.conventionalcommits.org/
- Changesets (GitHub): https://github.com/changesets/changesets
- The Ultimate Guide to NPM Release Automation: semantic-release vs Release Please vs Changesets: https://oleksiipopov.com/blog/npm-release-automation/
- semantic-release vs changesets vs release-it (2026), PkgPulse: https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026
- pnpm Workspaces docs: https://pnpm.io/workspaces
- pnpm Catalogs — Managing Monorepo Packages (sambaiz-net): https://www.sambaiz.net/en/article/568/
- Mastering pnpm Workspaces (Glen Thomas, 2025): https://blog.glen-thomas.com/software%20engineering/2025/10/02/mastering-pnpm-workspaces-complete-guide-to-monorepo-management.html
- GitHub Docs — About code owners (CODEOWNERS): https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- GitHub Docs — About protected branches / required status checks: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- Vitest — Snapshot testing: https://vitest.dev/guide/snapshot
- gitleaks (GitHub): https://github.com/gitleaks/gitleaks
