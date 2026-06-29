# 10 — Tech Stack: Validating a TS Monorepo for a World-Class Agentic OSS CLI + Server + Team Harness (June 2026)

> Scope: critique the proposed stack (TypeScript monorepo, pnpm workspaces, Node 20+/Bun, distributed via npm + standalone single-file binaries) and recommend ONE concrete stack with rationale. All version/landscape claims verified against June 2026 sources (see **Sources**).

## TL;DR

The proposed direction is sound, but two details need updating for mid-2026:

1. **"Node 20+" is stale.** As of June 2026, **Node.js 24 is Active LTS** (EOL Apr 2028), Node 22 is in **Maintenance LTS** (EOL Apr 2027), and Node 26 is Current (enters LTS Oct 2026). Target **Node 24 LTS** as the baseline, not Node 20.
2. **Runtime: pick Node 24 as the production target, treat Bun as an optional accelerator** for dev/test and as the **binary compiler** — not as the mandatory production runtime. Bun 1.3 is production-grade for many workloads but still carries documented risk for *long-running* (72h+) server processes, which is exactly the profile of a team harness/daemon.

Recommended stack (full rationale at the end):

| Concern | Pick |
|---|---|
| Monorepo | **pnpm workspaces + Turborepo** |
| Runtime (prod) | **Node.js 24 LTS** (engines `>=22`) |
| Runtime (dev/test accelerator + binaries) | **Bun 1.3** |
| Build/bundle | **tsdown** (Rolldown) for libs/CLI; **Bun `--compile`** for binaries |
| Test | **Vitest 3** (primary); `bun test` optional for hot inner loops |
| Lint/format | **Biome 2.x** (single tool); ESLint only for type-aware gaps if needed |
| Config & validation | **Zod 4** (`zod`), `zod/mini` where bundle size matters |
| Versioning/release | **Changesets** |
| CI | **GitHub Actions**, OS×Node matrix, `pnpm` + Turbo remote cache |

---

## 1. Monorepo tooling: pnpm workspaces vs Turborepo vs Nx

### The layers
These are **not** mutually exclusive — they solve different layers:
- **pnpm/npm/yarn workspaces** = package install + linking (the dependency graph, hardlinked store, hoisting policy).
- **Turborepo / Nx / Moon** = task orchestration on top (which task depends on which, caching task outputs, running in dependency order with max parallelism).

So the real choice is **what orchestrator to layer on pnpm workspaces**.

### pnpm workspaces (the install layer)
- Content-addressed global store with hardlinks → fastest, most disk-efficient installs; strict by default (no phantom deps).
- Auto-switches to **frozen-lockfile** mode in CI for reproducible builds.
- This is the consensus install layer for TS monorepos in 2026; both Turborepo and Nx sit happily on top.

### Turborepo
- Single `turbo.json`, low learning curve, no new workspace model imposed.
- Local + remote caching; **free zero-config Vercel Remote Cache** (also self-hostable / S3-compatible via the OpenAPI cache spec).
- Weakness vs Nx: cache `inputs` are flat lists (no composable `namedInputs`), so exclusions get repeated per target.
- 2026 benchmark: a single-machine CI build took ~25m32s vs Nx ~21m56s (~16% slower) — Turbo is slightly behind on raw graph scheduling but materially simpler.

### Nx
- Full build system: composable `namedInputs`, architectural boundary enforcement (module boundaries / tags), generators, plugin ecosystem, **Nx Cloud** with distributed task execution (DTE) and affected-graph CI.
- Wins when you have **many teams, multiple app types, enforced boundaries, or CI cost high enough** that graph-aware `affected` + distributed execution pay for the added concepts.
- Cost: more configuration surface, more "Nx way" lock-in.

### Recommendation for glamfire
**pnpm workspaces + Turborepo.** glamfire is an OSS project that wants contributor-friendly, low-ceremony tooling. A single `turbo.json`, free/self-hostable remote cache, and a shallow learning curve matter more than Nx's enterprise graph features. The industry-consensus 60–80% CI reduction from task caching is achievable with Turbo. Revisit Nx only if the repo grows to many independently-released apps with strict cross-team boundaries.

---

## 2. Runtime: Bun vs Node 24/26

### June 2026 reality
- **Node.js 24 = Active LTS** (ships npm 11, newer V8, **stable built-in TS type-stripping**); Node 22 = Maintenance LTS; Node 26 = Current. → Baseline on **Node 24**.
- **Bun 1.3** = ~98% npm compatibility, native TS, `Bun.serve`, `bun install` (6–9x faster), `bun test`, `--compile`. Now stewarded with heavy involvement from **Anthropic** (memory/stability fixes landing through 2026).

### Where Bun wins
- **Startup latency**: ~8ms cold start vs ~18ms Node 24 — meaningful for a CLI invoked thousands of times.
- **Install speed** (6–9x) and **dev-loop speed**.
- **HTTP throughput** 2–3x in synthetic benches (smaller — low double-digit % — in real apps with DB/JSON/middleware).
- **Single-file binary compilation** (see §3/§9) is far more mature than Node's SEA.

### Where Node still wins (and why it matters here)
- **Long-running stability.** Documented caveat: processes running **72h+** are where V8's battle-tested GC is more proven; Bun has had a class of long-running memory/hang issues (e.g. fixes shipped in 1.1.13 reducing baseline memory and fixing long-process hangs). A **team harness with a persistent server/daemon** is precisely this profile.
- **Native C++ addon** edge cases.
- 15 years of ecosystem hardening; the safest default for the part users can't easily restart.

### Recommendation for glamfire (hybrid, deliberate)
- **Production server/daemon → Node.js 24 LTS.** Set `engines.node >= 22` (allow 22/24/26) so npm-installed users on Maintenance LTS still work.
- **Dev + test + install acceleration → Bun 1.3** (optional, opt-in; never required to build).
- **Standalone binaries → Bun `--compile`** (best-in-class today).
- **Author against Node APIs / Web-standard APIs**, avoid Bun-only globals in shipped code so the same source runs under both runtimes. This keeps the lowest-risk path: Bun's DX where it's cheap, Node's hardening where it's load-bearing.

---

## 3. Build / bundling: tsup vs tsdown vs unbuild

| Tool | Engine | Weekly DL (early 2026) | Status |
|---|---|---|---|
| **tsup** | esbuild | ~6M | Safe, huge community; esbuild's dev pace has slowed |
| **tsdown** | **Rolldown** | ~500k, fast-growing | Emerging perf leader; **official Rolldown/VoidZero project**, pre-1.0 (~v0.22) |
| **unbuild** | Rollup/mkdist | ~3M | UnJS/Nuxt ecosystem; unique **stub mode** |

### Key facts
- **tsdown** is the elegant library bundler powered by **Rolldown**, maintained by **VoidZero Inc.** (Evan You's company). It is positioned to back **Rolldown-Vite Library Mode**, and Evan You has signaled it as the **long-term path forward**. Build speeds **3–10x** over esbuild-based flows for many-entry / complex-graph libs. Migration from tsup is near-frictionless (rename config + change import).
- Caveat: still **pre-1.0** (~v0.22.x) — expect occasional breaking changes; pin versions.
- **unbuild**'s stub mode (develop a lib without a watch process) is genuinely unique but ties you to the UnJS worldview.
- **tsup** remains the zero-risk choice if you want maximum stability over raw speed.

### Recommendation for glamfire
**tsdown** for packages and the CLI bundle — it's the future-aligned, fastest option and pairs naturally with a Vite/Rolldown-leaning ecosystem; pin the version given pre-1.0 status. Keep **tsup as the documented fallback** if a tsdown breaking change bites mid-release. For the **distributed standalone binaries**, bundling is handled by **Bun `--compile`** (§9), not tsdown.

---

## 4. Test: Vitest vs bun test vs node:test

- **Vitest 3** — recommended default for 2026: Vite-powered, HMR watch (~40ms affected re-runs), UI mode, browser mode, deepest mocking/snapshot ergonomics, biggest ecosystem. Cost: pulls in Vite as a dev dependency.
- **bun test** — fastest by a wide margin (e.g. 0.08s vs Vitest ~0.9s on small suites), Jest-compatible API, zero-config, same runtime runs code + tests. Gaps: **no UI mode, no inline snapshots**, some Jest features missing.
- **node:test** — stable since Node 18, zero install, but no HMR watch, TS needs an external loader, coverage experimental. Good for tiny zero-dep utilities, weak as a primary harness.

### Recommendation for glamfire
**Vitest 3 as the primary runner** (rich mocking, snapshots, watch UX needed for an agentic harness with lots of I/O and tool mocks). Optionally allow **`bun test`** for hot, server-side, dependency-light packages where its speed shines — but don't fragment the suite; keep Vitest authoritative for CI.

---

## 5. Lint / format: Biome vs ESLint+Prettier (and Oxlint)

### 2026 state
- **Biome 2.x** (current ~v2.3, codename "Biotype" line): single Rust binary replacing ESLint **and** Prettier. ~423 lint rules, a real **plugin system**, an import organizer that handles barrel files, and **type-aware linting via Biome's own inference engine** (e.g. `noFloatingPromises` **without** needing the TypeScript compiler installed). Roughly **10–100x** faster than ESLint, ~25x faster than the ESLint+Prettier combo.
- **Oxlint** (OXC): ~2x faster than Biome on lint, ~50–100x faster than ESLint; in 2026 added **type-aware rules via `tsgo`** (TS 7 Go port) and multi-file analysis. Strong as a *fast lint pass alongside ESLint* in legacy repos.
- **ESLint + Prettier**: still the safest choice when you depend on **framework-specific plugins** (`eslint-plugin-react-hooks`, `next`), bespoke custom rules, or the deepest type-aware TS rule coverage that Biome's engine doesn't yet match.

### Recommendation for glamfire
**Biome 2.x as the single lint+format tool.** A backend/CLI/server TS codebase (not a React app) is Biome's sweet spot: one dependency, one config, near-instant CI, format + lint + import-sort unified. This is ideal for an OSS project (lower contributor friction, no ESLint-config bikeshedding). Add a narrowly-scoped **ESLint** pass **only if** a needed type-aware rule has no Biome equivalent. Oxlint is a reasonable future swap but Biome's all-in-one DX wins for greenfield today.

---

## 6. Typed config & validation: Zod 4 vs Valibot vs ArkType

### 2026 landscape
- **Zod 4** (stable since May 2025) — the ergonomic default. Big wins over v3: ~**14x** faster string / **7x** array / **6.5x** object parsing, and a massive tsc improvement (~175 type instantiations vs ~25,000 in v3). Ships **`zod/mini`** (~1.9KB gzip, tree-shakable) for size-sensitive contexts, built-in **`.toJSONSchema()`**, and **Standard Schema** support (interop with the whole validator ecosystem). Subpath versioning (`zod/v4`) enables incremental migration.
  - Nuance: some micro-benchmarks show specific Zod 4 paths slower than expected vs v3 in isolated cases; in aggregate v4 is dramatically faster. ArkType/Valibot still win raw throughput.
- **Valibot** — modular, best-in-class **tree-shaking / bundle size** (e.g. login schema ~1.37KB vs Zod standard ~17.7KB; even `zod/mini` ~6.88KB). Best when shipping validators to constrained/edge/browser targets.
- **ArkType** — **fastest runtime** (JIT-compiled; ~1.4x faster than Valibot, ~1.7x faster than Zod 4 on a nested-object bench), TS-syntax-native schemas. Smallest `node_modules`, medium build size (bundles a JIT). Steeper mental model.

### Recommendation for glamfire
**Zod 4** as the primary schema/validation/config library: best ecosystem integration (tRPC, MCP tool schemas, JSON-Schema export for tool definitions and agent I/O), best DX, and now genuinely fast with v4. Use **`zod/mini`** in any package shipped to the browser or where the binary/bundle size is sensitive. The **Standard Schema** support means glamfire can accept user-provided schemas in Valibot/ArkType too without coupling. Reserve ArkType/Valibot for proven hot-path or extreme-bundle cases only.

---

## 7. Versioning / release: Changesets

- **Changesets** has the best monorepo support of the release tools (vs semantic-release, release-it). Contributors add a changeset file declaring patch/minor/major intent per package; the **changeset-bot** enforces a changeset on PRs; the **Changesets GitHub Action** aggregates them into a "Version Packages" PR (bumps + changelogs) and, on merge, publishes to npm.
- Pairs cleanly with Turborepo/pnpm because the explicit, per-PR changeset files force a conscious decision about which packages a change affects — ideal for OSS where many contributors touch the repo.
- Use with **npm provenance** (`--provenance` / OIDC) for supply-chain trust on published packages.

### Recommendation
**Changesets**, with the bot + GitHub Action, publishing to npm with provenance. This is the de-facto standard for OSS TS monorepos in 2026 and the right fit.

---

## 8. CI: GitHub Actions

### Best-practice shape (2026)
- **Order matters:** install `pnpm/action-setup` **before** `actions/setup-node` so setup-node can find the pnpm store; then `actions/setup-node` with `cache: pnpm`.
- **Matrix:** OS × Node — e.g. `{ ubuntu-latest, macos-latest, windows-latest } × { 22, 24 }` (+ `26` allowed-failure to catch Current early). Use `include`/`exclude` to prune low-value combos. This directly validates the cross-platform (Mac/Win/Linux) promise.
- **Caching:** `cache: pnpm` (built on `actions/cache`); pnpm uses **frozen-lockfile** automatically in CI. Layer **Turborepo remote cache** (Vercel free tier or self-hosted/S3) so unchanged packages skip rebuild/retest — the 60–80% CI-time reduction lever. Warm-cache installs ~40s vs cold ~1m20s.
- **Release job:** separate workflow running the Changesets Action on `main`, with npm OIDC/provenance.
- **Binary build job:** matrix over targets using `bun build --compile --target=...` (cross-compile, §9), uploading artifacts / attaching to GitHub Releases.

### Recommendation
**GitHub Actions** with the above shape: pnpm-first setup, OS×Node matrix, `cache: pnpm` + Turbo remote cache, Changesets release workflow, and a separate cross-compile binary-release workflow.

---

## 9. Distribution: npm + standalone single-file binaries

- **npm**: publish the CLI + libs via Changesets with provenance. Engines `>=22` so Node 22/24/26 users install cleanly; runs on Node 24 by default.
- **Standalone binaries**: **Bun `--compile`** is production-ready in 2026 and **cross-compiles** (build Linux/macOS/Windows targets from one host) into a single self-contained file embedding the Bun runtime + code + npm deps — no Node required on the user's machine. This is materially ahead of **Node SEA**, which remains "active development," CommonJS-single-script-oriented, and not yet stable for this use case.
- Net: **npm install for the Node-native path; Bun-compiled binaries for the zero-prereq download path.** Author to Node/Web-standard APIs so the same source serves both.

---

## Key takeaways for glamfire

1. **Update the baseline from "Node 20+" to Node 24 LTS** (engines `>=22`). Node 20 is near end of relevance; 24 is Active LTS through Apr 2028 with stable TS type-stripping and npm 11.
2. **Hybrid runtime, deliberately scoped:** Node 24 runs the long-lived server/daemon (proven GC for 72h+ processes); Bun 1.3 accelerates install/dev/test and **compiles the binaries**. Don't make Bun the mandatory production runtime for the persistent harness yet.
3. **pnpm workspaces + Turborepo** — contributor-friendly, free/self-hostable remote cache, low ceremony. Nx only if the repo later needs enterprise graph/boundary features.
4. **tsdown** for bundling (Rolldown/VoidZero, future-aligned, fast) — pin it (pre-1.0); keep tsup as fallback. **Bun `--compile`** for binaries.
5. **Vitest 3** as the authoritative test runner; `bun test` allowed for hot dependency-light packages.
6. **Biome 2.x** as the single lint+format tool — perfect for a backend/CLI TS codebase and OSS contributor experience; ESLint only to plug specific type-aware gaps.
7. **Zod 4** (with `zod/mini` for size-sensitive/edge code) — best DX + ecosystem (tRPC, MCP tool schemas, JSON-Schema export, Standard Schema interop). Reserve ArkType/Valibot for proven hot paths.
8. **Changesets** + bot + GitHub Action + npm provenance for releases.
9. **GitHub Actions**: pnpm-before-setup-node, OS×Node matrix (validates Mac/Win/Linux), `cache: pnpm` + Turbo remote cache, dedicated cross-compile binary-release job.

### One concrete recommended stack

> **pnpm workspaces + Turborepo** monorepo, **TypeScript**, targeting **Node.js 24 LTS** in production (`engines: >=22`) with **Bun 1.3** as an opt-in dev/test/install accelerator and the **binary compiler** (`bun build --compile`). Bundle libs/CLI with **tsdown** (Rolldown). Test with **Vitest 3**. Lint+format with **Biome 2.x**. Validate/config with **Zod 4** (`zod/mini` where bytes matter). Release with **Changesets** (+ bot, GitHub Action, npm provenance). CI on **GitHub Actions** with an OS×Node matrix and pnpm + Turborepo remote caching.

**Why this stack:** it optimizes for the three things that matter for a world-class OSS agentic harness — (a) **trustworthy production stability** for a long-lived server (Node 24 LTS where it's load-bearing), (b) **fast, frictionless contributor and CI experience** (pnpm+Turbo caching, Biome one-tool lint/format, Vitest, Bun-accelerated dev), and (c) **clean cross-platform distribution** (npm for Node users + Bun-compiled single-file binaries for everyone else). It is future-aligned (Rolldown/tsdown, Biome, Zod 4) without betting the production daemon on the least-proven pieces.

---

## Sources

- Nx vs Turborepo (official): https://nx.dev/docs/guides/adopting-nx/nx-vs-turborepo
- Monorepo 2026: Turborepo vs Nx vs Bazel — daily.dev: https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-teams/
- Turborepo vs Nx vs Moon 2026 (caching & CI speed) — PkgPulse: https://www.pkgpulse.com/guides/turborepo-vs-nx-vs-moon-build-tools-2026
- Monorepo Tools 2026 (Turborepo/Nx/Lerna/pnpm) — DevToolBox: https://viadreams.cc/en/blog/monorepo-tools-2026/
- Turborepo vs Nx 2026 — PkgPulse: https://www.pkgpulse.com/guides/turborepo-vs-nx-monorepo-2026
- pnpm Continuous Integration docs: https://pnpm.io/continuous-integration
- Bun vs Node.js 2026 (Strapi): https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide
- Bun vs Node.js 2026 production-ready (Pickuma): https://pickuma.com/posts/bun-vs-nodejs-2026-production-runtime/
- Bun Runtime Production Guide 2026 (byteiota): https://byteiota.com/bun-runtime-production-guide-2026-speed-vs-stability/
- Deno 2 vs Node 22 vs Bun 1.2 (Dev Note): https://devstarsj.github.io/2026/04/01/deno-2-vs-nodejs-22-vs-bun-12-javascript-runtime-comparison-2026/
- Node.js previous releases (release schedule): https://nodejs.org/en/about/previous-releases
- Node.js endoflife.date: https://endoflife.date/nodejs
- Node 22 vs Node 24 in 2026 — PkgPulse: https://www.pkgpulse.com/guides/nodejs-22-vs-nodejs-24-2026
- Bun v1.3.13 blog: https://bun.com/blog/bun-v1.3.13
- Bun 1.1.13 memory fixes (The Register): https://www.theregister.com/2026/04/21/anthropics_bun_1113_released_with_memory_fixes/
- Anthropic memory fixes in Bun 1.1.13 (DevClass): https://www.devclass.com/ci-cd/2026/04/22/anthropic-bakes-memory-fixes-into-bun-1113-as-developers-complain-of-leaks/5218433
- tsup vs tsdown vs unbuild 2026 — PkgPulse: https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026
- tsdown guide (official): https://tsdown.dev/guide/
- tsdown migrate-from-tsup: https://tsdown.dev/guide/migrate-from-tsup
- tsdown GitHub (Rolldown): https://github.com/rolldown/tsdown
- Node.js Build Tools 2026 (tsup/esbuild/Rolldown/Rollup) — HireNodeJS: https://www.hirenodejs.com/blog/nodejs-build-tools-tsup-esbuild-rolldown-2026
- Bun test vs Vitest vs Jest benchmarks 2026 — PkgPulse: https://www.pkgpulse.com/guides/bun-test-vs-vitest-vs-jest-test-runner-benchmark-2026
- bun:test vs node:test vs Vitest 2026 — PkgPulse: https://www.pkgpulse.com/guides/bun-test-vs-node-test-vs-vitest-zero-config-2026
- Biome vs ESLint vs Oxlint 2026 — PkgPulse: https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026
- Biome vs ESLint+Prettier 2026 — PkgPulse: https://www.pkgpulse.com/blog/biome-vs-eslint-prettier-linting-2026
- Faster type-aware lint: Biome vs Oxlint (solberg.is): https://www.solberg.is/fast-type-aware-linting
- OXC benchmarks: https://oxc.rs/docs/guide/benchmarks
- Zod v4 release notes (official): https://zod.dev/v4
- Zod v4 available — InfoQ: https://www.infoq.com/news/2025/08/zod-v4-available/
- Zod vs Valibot vs ArkType 2026 (Pockit): https://pockit.tools/blog/zod-valibot-arktype-comparison-2026/
- Valibot vs Zod v4 2026 — PkgPulse: https://www.pkgpulse.com/guides/valibot-vs-zod-v4-typescript-validator-2026
- Zod vs ArkType 2026 — PkgPulse: https://www.pkgpulse.com/guides/zod-vs-arktype-2026
- Zod 4 vs Valibot vs ArkType teardown (DEV): https://dev.to/gabrielanhaia/zod-4-vs-valibot-vs-arktype-a-type-system-teardown-4lha
- Changesets GitHub: https://github.com/changesets/changesets
- Changesets versioning (Vercel Academy): https://vercel.com/academy/production-monorepos/changesets-versioning
- semantic-release vs changesets vs release-it 2026 — PkgPulse: https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026
- actions/setup-node: https://github.com/actions/setup-node
- GitHub Actions matrix builds (OneUptime, 2026): https://oneuptime.com/blog/post/2026-02-02-github-actions-matrix-builds/view
- GitHub Actions monorepo CI/CD 2026 (DEV): https://dev.to/pockit_tools/github-actions-in-2026-the-complete-guide-to-monorepo-cicd-and-self-hosted-runners-1jop
- Bun single-file executable docs: https://bun.com/docs/bundler/executables
- Bun cross-compile binaries (Mamezou): https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/
- Node.js Single Executable Applications docs: https://nodejs.org/api/single-executable-applications.html
