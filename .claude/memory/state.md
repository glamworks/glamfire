# Current state

Keep this in sync with README → **Current reality**. Update on every release.

**Version**: see `VERSION` (source of truth).

**Toolchain (live on main)**: pnpm workspace, Node ≥22, **strict TS** (tsconfig.base),
Biome 1.9.4, Vitest 2. `npm run lint` / `npx vitest run` / `pnpm -r build|typecheck` /
`node scripts/smoke.mjs` all green. Foundation `.mjs` CLI/scripts stay zero-build;
subsystem packages are TS built to `dist/` (CLI imports built JS). NOTE: two zod majors
coexist — adapters/root on zod 4, brain on zod 3 (resolve independently; standardize later).

**Works today (verified, real, human-usable)**
- `glam version`/`--version`, `glam doctor`, `glam help`.
- **`@glamfire/brain`** — sqlite-vec + FTS5 owned store, 4 record types, hybrid
  retrieval, **export→import invariant tested**. Offline hash embedder default; opt-in
  on-device transformer (fastembed). Demo: `node packages/brain/examples/demo.mjs`.
  Fully DONE (no remote dep).
- **`@glamfire/config`** — layered TOML (defaults→~/.glam→./glam.toml→env→flags) +
  provenance, zod-strict (fail-loud), secret refs (env/keychain) redacted. `glam config`
  command; wired into run/doctor/fireworks adapter. Human-verified precedence + 0 leaks.
- **`@glamfire/skills`** — self-contained skill dirs (skill.json manifest + .mjs handlers
  + neutral template + episodes + verifier), loader + `installSkills → {system,tools}`,
  example `code-explainer`. Composes onto engine contract; not yet wired to a CLI command.
- **`@glamfire/router`** + `glam route` — center/edge classifier (feature-based, non-verbalized
  confidence), declarative policy (config `routing.rules`, first-match, capability+maxUsd filter,
  cheapest survivor), escalation cascade (verify→escalate, real `escalation` step, budget-bound),
  distribution report. Wired into engine via additive `RouterHook` in `loop.ts` (omit = legacy
  behavior). `glam route "<prompt>"` = offline dry-run, no key. Fully working offline.
- **`anthropic` adapter** (Claude Messages API) + **adapter conformance suite** (same battery vs
  fireworks-glm + anthropic; "supported" = green). Registered in router registry
  (`packages/cli/src/router.mjs`). Live Claude call pending ANTHROPIC_API_KEY.
- **`together` adapter + Qwen3-Coder** — shared OpenAI-compatible core (`openai-compatible.ts`);
  fireworks-glm refactored onto it (public API unchanged). Serves GLM-5.2 (FP4) + Qwen3-Coder-Next
  (FP8). Conformance runs vs all 4 model-configs. Registered in router registry. Live pending
  TOGETHER_API_KEY. CAVEAT: Together GLM=FP4 (prefer Fireworks FP8); Qwen=dedicated endpoint.
- **Packaging (#8)** — npm pkg name **`glamfire`** (available; provides `glam` bin; self-contained
  bundle, no native deps, version inlined via Bun build plugin), 5-OS binaries (bun --compile,
  checksummed+sigstore), brew/scoop/winget manifests, CycloneDX SBOM, `.github/workflows/{ci,release}.yml`.
  Build: `bun scripts/build-npm.mjs --pack`, `build-binaries.mjs`, `verify-artifacts.mjs`.
  PUBLISH GATED on user secrets: NPM_TOKEN, HOMEBREW_TAP_DEPLOY_KEY, SCOOP_BUCKET_DEPLOY_KEY,
  WINGET_TOKEN + repos glamworks/homebrew-tap + glamworks/scoop-bucket must exist.
  KNOWN: `glam doctor` install-check shows ✗ inside compiled binary (cosmetic; npm pkg ok).
- **Memecoin (prepare-only, NOT LIVE)** — `marketing/meme-coin/`: real guarded devnet mint.mjs
  (Solana deps isolated, NOT in workspace), two-layer mainnet guard (irreversibility flag +
  interactive typed confirm), guard test, finalized spec/runbook/disclaimer. STATUS marker
  `token-status: NOT_LIVE`. Launch needs user: funded keypair, hosted metadata, treasury multisig,
  explicit authorization. NEVER advertise/launch unilaterally.
- `scripts/smoke.mjs` (drives real CLI + `glam run`/`glam config`/`glam route`); version source.

**Built, gates green, NOT yet DONE (live call pending key)**
- `glam run` + `@glamfire/engine` (plan→act→observe loop, real tools, permission gate,
  hard budget) + `@glamfire/adapters` `fireworks-glm` (Fireworks OpenAI-compat, streaming
  tool-call fragment reassembly, pricing). Verified vs real captured GLM wire fixtures +
  loopback transport through the binary. **Live GLM 5.2 round-trip pending FIREWORKS_API_KEY**
  — verify with `packages/adapters/MANUAL-VERIFY.md`, then mark DONE + tag a release.
- Neutral contract lives in `@glamfire/engine` (Task/Run/Step/ToolSpec/AdapterContract).
  Router replaces the placeholder `route_decision` in `loop.ts`; brain/skills compose into
  `RunState.system` + register `ToolSpec`s; budget ceilings live only on `Task.budget`.

**Specified, not yet built** (lock-step, no shims): `@glamfire/router` (#5),
`@glamfire/team` (#7), SDK, server mode, real binaries/packaging (#8), CI matrix.

**Router contract (from config) — Wave 3 must read these exact names**: config exposes
`routing.default` (model id) + `routing.rules[]` (top-down, first match wins). Per-rule
match: `distribution` ("center"|"edge"), `minConfidence`/`maxConfidence` [0,1], `requires`
(capability tokens), `maxUsd` (projected ceiling). Per-rule result: `candidates` (ordered
cheapest-first model ids). Capability tokens mirror engine `Capabilities`: `tool_calling`,
`parallel_tool_calls`, `json_mode`, `vision`, `streaming`, `seed`, `long_context`. Router
replaces the placeholder `route_decision` in engine `loop.ts`; emits `escalation` steps.
Real cascade/escalation needs a 2nd adapter (anthropic/openai) — pair router with one.

**User decisions (2026-06-29)**: 2nd provider = **Together AI**; 2nd open model = **Qwen3-Coder**
(`Qwen/Qwen3-Coder-Next`, Apache-2.0, FP8); **memecoin = prepare-don't-launch** (spec+mint scripts,
STATUS=NOT LIVE, user funds/approves to mint — never launch unilaterally); **packaging = I-prep,
user-holds-keys** (build binaries+npm+brew/scoop/winget manifests+CI; user adds npm token + brew tap).
CAVEAT (research/23): no US host serves BOTH GLM-5.2 + Qwen3-Coder-Next on shared serverless FP8 today
— Together serves GLM-5.2 at **FP4** (downgrade vs Fireworks FP8), Qwen3-Coder-Next needs *dedicated*
endpoint. Build Together adapter anyway (OpenAI-compat, parameterized), document caveat honestly.

**Next**: (1) FIREWORKS_API_KEY → live-verify `glam run` → release 0.1.0 (still pending user key).
(2) Together+Qwen adapter — generalize fireworks-glm into provider-parameterized OpenAI-compat adapter
({baseURL, apiKey, logical→provider model-id map}), extend conformance. (3) packaging (#8, I-prep).
(4) memecoin prepare (marketing/, Solana SPL scripts, STATUS NOT LIVE). (5) dogfood transition
(research/22) once `glam run` live-verified. (6) team Slack (#7), SDK.
