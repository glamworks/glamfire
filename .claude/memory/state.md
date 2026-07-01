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
- **Engine edit/run tools (dogfood M1)** — `write_file`/`edit_file` (cwd-scoped, lexical +
  symlink-escape defense, `write`=ask→deny) + `run_command` (no-shell spawn, allowlist before
  spawn, `exec`=DENY by default even with asker; opt-in `glam run --allow-exec` → ask, needs
  `--yes`; 30s timeout, 256KiB cap, credential env stripped). read→edit→run-to-green proven
  through loop offline. KNOWN LIMIT: no OS-level network-egress isolation in pure Node
  (credential-stripping is the honest partial measure; real isolation = container/namespace).
- **Dogfood harness**: `scripts/dogfood.mjs` (drives real glam + gates; no key→exit 1, never
  fakes) + `docs/DOGFOODING.md` (staged M0–M5, reversible). M0/M1 ready pending Fireworks key.
- `scripts/smoke.mjs` (drives real CLI + `glam run`/`glam config`/`glam route`); version source.

**DONE — live-verified vs real GLM 5.2 on Fireworks (2026-07-01, v0.1.0)**
- `glam run` + `@glamfire/engine` (plan→act→observe loop, real tools, permission gate,
  hard budget) + `@glamfire/adapters` `fireworks-glm`. **Real Fireworks call observed**:
  calculator tool round-trip → `20` (status done), pure text (done), `--max-usd 0.001`
  → output truncated + `budget_exhausted`. TWO blockers found+fixed via the first live
  call: (1) internal pricing-tier name `standard` was sent raw as wire `service_tier`
  (Fireworks accepts only `auto|default|flex|priority`) → HTTP 400; now translated
  internal→wire (standard omits) in `fireworks-glm.ts` `fireworksWireServiceTier()`.
  (2) the "hard" budget ceiling did NOT stop a terminal text-only turn (returned `done`
  past `--max-usd`); `loop.ts` now post-spend-checks every turn + caps each turn's
  `max_tokens` by remaining budget (`budgetCappedConfig`). See [[gotchas]] service_tier.
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

**DONE since (all on main, verified, 204 tests)**: Together+Qwen adapter, packaging (#8),
memecoin prep, engine edit/run tools, dogfood harness. Closed issues: #4 #5 #6 #8 #12 (#10 RFC realized).

**Next (the headline)**: FIREWORKS_API_KEY is LIVE (`~/.config/.env`; `set -a; . ~/.config/.env;
set +a`). `glam run` live-verified → **v0.1.0 tagged**. NOW: (1) run dogfood M0/M1 via
`scripts/dogfood.mjs` on a real good-first-issue, gates green, AI commits tagged w/ model id.
(2) close capability gap w/ worker-built engine tools (code search grep/glob, git ops, subagent
orchestration) safely extending allowlist. (3) self-hosting CI gate (glamfire-on-glamfire, fail
loud). (4) flip one dev category to glamfire w/ measured success/cost, Claude Code fallback.
**Publish (blocked on USER)**: add repo secrets NPM_TOKEN + brew/scoop/winget deploy keys +
create glamworks/homebrew-tap + glamworks/scoop-bucket → tag publishes everywhere.

**Next (key-independent, lock-step, when ready)**: team Slack surface (#7, live needs Slack token),
`@glamfire/sdk` (typed API over engine/brain/router/skills), server/daemon mode, Docker. Open
issues remaining: #1 (north star), #2 #3 #9 (live-call pending key), #7 (team), #11 (quickstart docs), #13 (join us).
