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
  **PUBLISHING NOW LIVE (v0.2.1+)**: npm + Homebrew tap + Scoop bucket publish on every `v*`
  tag; winget submits a PR to microsoft/winget-pkgs (windows job, wingetcreate). All secrets set.
  FIXED (v0.4.0): `glam doctor` install-check inside compiled binary — context-aware
  detectInstall() recognizes the /$bunfs standalone mount and reports honestly.
- **Memecoin (prepare-only, NOT LIVE)** — `marketing/meme-coin/`: real guarded devnet mint.mjs
  (Solana deps isolated, NOT in workspace), two-layer mainnet guard (irreversibility flag +
  interactive typed confirm), guard test, finalized spec/runbook/disclaimer. STATUS marker
  `token-status: NOT_LIVE`. Launch needs user: funded keypair, hosted metadata, treasury multisig,
  explicit authorization. NEVER advertise/launch unilaterally.
- **Engine code-search tools (v0.2.0)** — `list_files` (glob) + `search_files` (grep),
  both `read`-permission, cwd-scoped, reuse the existing `sandboxPath` symlink-escape guard,
  skip node_modules/.git/dist, capped results, zero new deps (fs recursion + glob→RegExp).
  Registered in `builtinTools()`, reachable from `glam run`, dispatch `[allow]` (no --yes).
  Live-verified vs GLM 5.2 (found budgetExhausted at loop.ts:355). Unlocks M3 navigation.
- **Engine git READ tools (v0.3.0)** — `git_status`/`git_diff`/`git_log`/`git_show`, read-only,
  reuse `execInSandbox` (no shell, fixed argv, credential-env stripped, 10s timeout, output cap),
  injection-guarded (pathspec after `--`, ref regex `^[\w./~^@{}-]+$`, leading-`-` rejected). NO
  write/commit/push git (stays with orchestrator, §7). Registered in builtinTools, `[allow]`,
  live-verified vs GLM 5.2. Next tool mini-feature: subagent orchestration (not yet built — honest).
- **Self-hosting CI gate (v0.2.0)** — `.github/workflows/ci.yml` job `self-hosting` drives
  `scripts/dogfood.mjs --stage read` (glamfire-on-glamfire) then asserts smoke+tests green;
  fail-loud. **ACTIVE**: FIREWORKS_API_KEY repo secret set → runs live GLM in CI, confirmed green
  (run 28552478908). Absent→clear skip notice, never fake pass.
- **bump-version.mjs fix (v0.2.0)** — v0.1.0 bump wrote package.json via raw JSON.stringify,
  expanding `workspaces` to multiline (Biome rejects) → lint failure on main. Root-caused:
  bump script now runs `biome format --write package.json`. GOTCHA: any script writing
  package.json via JSON.stringify must re-format via Biome or lint breaks.
- **Engine edit/run tools (dogfood M1)** — `write_file`/`edit_file` (cwd-scoped, lexical +
  symlink-escape defense, `write`=ask→deny) + `run_command` (no-shell spawn, allowlist before
  spawn, `exec`=DENY by default even with asker; opt-in `glam run --allow-exec` → ask, needs
  `--yes`; 30s timeout, 256KiB cap, credential env stripped). read→edit→run-to-green proven
  through loop offline. KNOWN LIMIT: no OS-level network-egress isolation in pure Node
  (credential-stripping is the honest partial measure; real isolation = container/namespace).
- **Dogfood harness**: `scripts/dogfood.mjs` (drives real glam + gates; no key→exit 1, never
  fakes) + `docs/DOGFOODING.md` (staged M0–M5, reversible). **M0+M1 PROVEN (2026-07-01, v0.1.0)**
  live vs GLM 5.2: M0 = glam run read README + proposed 3 real gaps; M1 = glamfire authored
  `docs/QUICKSTART.md` closing good-first-issue #11 (write_file tool; review caught a config-schema
  error → iterated to green → `glam config` loads it, doctor green, gates green). Commit tagged
  w/ model id. **M2 PROVEN (v0.3.0)**: first glamfire-authored PR #15 merged (glamfire used
  its own git_log tool to author CHANGELOG.md). Next dogfood: M3 (multi-file feature, review-only).
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

**Specified, not yet built** (lock-step, no shims): `@glamfire/team` (#7), SDK, server/daemon
mode, Docker image, subagent-orchestration engine tool. (DONE since: router #5, packaging #8 +
publishing, CI matrix, engine code-search + git-read tools.)

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

**HEADLINE — DOGFOODING HANDOFF REACHED (2026-07-01, v0.2.0).** FIREWORKS_API_KEY LIVE
(`~/.config/.env`; `set -a; . ~/.config/.env; set +a`). All 5 finish-line items DONE:
(1) `glam run` DONE, live GLM round-trip → v0.1.0 tagged; (2) dogfood M0+M1 proven on real
good-first-issue #11, AI commits tagged w/ model id; (3) code-search engine tools (grep/glob)
shipped+live-verified (git ops + subagent orchestration = honest next mini-features, NOT yet
built); (4) self-hosting CI gate shipped (fail-loud, gated on FIREWORKS_API_KEY secret);
(5) first category flipped to glamfire = **scoped docs**, measured (~$0.01-0.02/task, review-only
intervention), Claude Code backstop — recorded in docs/DOGFOODING.md. Stop condition met: a scoped
glam+GLM task (README nav link) completed end-to-end with only review-time involvement.

**CI FULLY GREEN (2026-07-01)** on macOS+Linux+Windows + the live self-hosting gate. User
added `FIREWORKS_API_KEY` repo secret → self-hosting gate runs live GLM in CI (not skipped),
confirmed green (run 28552478908). Fixed 2 Windows-only blockers to get there: `.gitattributes`
(LF, was failing biome) + `realpathSync.native` in skills loader (8.3 short-name `%7E` URL bug).
See [[gotchas]].

**npm PUBLISHED (2026-07-01, v0.2.1)**: `glamfire` LIVE on npm (latest 0.2.1, provides `glam`)
— human-verified via `npm i -g glamfire@0.2.1` from public registry → `glam --version` 0.2.1.
GitHub Release v0.2.1 = 5 binaries + tarball + SBOM. NPM_TOKEN in ~/.config/.env + repo secret.
Release-job fix: `pnpm install` before build-sbom.mjs (SBOM reads real dep versions; was failing
`Cannot find module zod` → skipped publish). Cut a release: bump→commit→push→tag `vX.Y.Z`→push
tag fires release.yml. GOTCHA: workflow_dispatch checks out main NOT the tag; tag-PUSH is correct.

**npm + Homebrew + Scoop ALL LIVE (2026-07-01, v0.2.2)**: tap repo glamworks/homebrew-tap
(Formula/glamfire.rb) + bucket glamworks/scoop-bucket (bucket/glamfire.json) pushed by release
workflow. GOTCHA: glamworks has ORG-LEVEL DEPLOY KEYS DISABLED — publish-manifest.sh pushes over
HTTPS token (x-access-token) not SSH. HOMEBREW_TAP_DEPLOY_KEY + SCOOP_BUCKET_DEPLOY_KEY secrets
hold the general gh token (admin on both repos), NOT ssh keys despite the names.

**ALL 4 PACKAGE MANAGERS WIRED (2026-07-01, v0.2.4)**: npm + Homebrew + Scoop LIVE; winget
SUBMITTED via PR microsoft/winget-pkgs#396675 (Glamworks.Glamfire 0.2.4, OPEN — pending
Microsoft community review/merge, then `winget install` goes live; that step is theirs).
GOTCHA: wingetcreate is WINDOWS-ONLY (not a NuGet/dotnet tool) — winget runs in a dedicated
`winget submit` windows-latest job (choco install wingetcreate) consuming manifests rendered by
the linux release job. WINGET_TOKEN = general gh token (repo scope). Future releases auto-submit
a new winget PR each tag.

**Remaining — BLOCKED ON USER**:
- **Memecoin**: stays NOT LIVE until user funds+authorizes (only outstanding item).

**Next dev (key-independent, lock-step)**: git-ops READ tools DONE v0.3.0 (git_status/diff/log/show, read-only, sandboxed, injection-guarded, live-verified). Next: subagent-orchestration engine tool (M3);
first glamfire-authored PR (M2); team Slack (#7); SDK; server/daemon; Docker. Open issues: #1,
#7, #13 (+ #10 RFC). Dogfood the remaining engine tools THROUGH glamfire now that flip is proven.

**Next (key-independent, lock-step, when ready)**: team Slack surface (#7, live needs Slack token),
`@glamfire/sdk` (typed API over engine/brain/router/skills), server/daemon mode, Docker. Open
issues remaining: #1 (north star), #2 #3 #9 (live-call pending key), #7 (team), #11 (quickstart docs), #13 (join us).

**CONTEXT-WARS WAVE SHIPPED (2026-07-03, v0.4.0)** — 4 parallel builders + 2 researchers,
orchestrator-integrated on `integration/context-wars-wave`, 354 tests, smoke PASS:
- **Usage/billing**: append-only JSONL ledger `~/.glam/usage.jsonl` (portable, no native
  deps, corrupt lines counted not hidden); every `glam run` records adapter/provider/model/
  tokens/cost/duration/escalations + per-model split (ModelTurnStep now stamps adapter+model
  — additive PUBLIC engine type change, drove the minor bump). `glam usage` (by day/model/
  provider, --since, --json, budget bar); opt-in `[usage] monthlyBudgetUsd`/`warnAtPct`.
- **`glam models`**: evergreen landscape view. `packages/adapters/src/catalog.ts` = SINGLE
  SOURCE OF TRUTH for pricing (13 entries, every price live-verified w/ asOf+sourceUrl;
  null = unpublished, never guessed). Adapters price through `catalogPriceRow()` (fail-loud)
  so `glam route`/`run`/`models` can never drift. `--refresh`: Together live prices
  (plausibility-guarded), Fireworks availability-only (publishes no machine prices — says
  so), price-drop diffs, cache `~/.glam/cache/models.json`. Qwen 3.7 Plus EXCLUDED
  (closed weights) w/ regression test. GLM-5.2 license = MIT (verified HF card).
- **DeepSeek V4 (current gen; R2 does NOT exist)**: Fireworks primary — `deepseek-v4-pro`
  ($1.74/$3.48 FP8 1M ctx) + `deepseek-v4-flash` ($0.14/$0.28 — budget tier, no priority
  tier so requesting it fails loud) — conformance 63/63, live-verified incl. parallel tool
  calls + seed + real cache hit ($0.000372 run). Together `deepseek-ai/DeepSeek-V4-Pro`
  wired, live pending TOGETHER_API_KEY. Both DeepSeeks are thinking models
  (reasoning_content/reasoning_effort). Fireworks adapter now FAILS LOUD on unknown model
  ids (was: silent GLM pricing). Together DeepSeek price: live model page $1.74/$3.48 wins
  over launch-blog $2.10/$4.40 — reconcile on first invoice.
- **UX/perf**: doctor compiled-binary ✗ ROOT-CAUSED+FIXED (context-aware detectInstall,
  /$bunfs mount detection, version-drift check); real SIGINT (AbortSignal CLI to engine to
  adapter fetch, status `interrupted`, honest partial cost, exit 130); numeric option
  validation (exit 2, was silent NaN killing the cost ceiling); did-you-mean; one color
  policy (FORCE_COLOR > NO_COLOR > TTY); EPIPE-safe; stacks behind GLAM_DEBUG=1; startup
  66ms to 28ms (lazy command imports — keep new commands lazy!).
- **Messaging (context-wars frame, creator still unnamed)**: README hero rewritten
  ("The intelligence wars are over. The context wars have begun."), continuity as
  co-equal sell with cost, docs/WHY-WE-WIN.md replaced, status badge foundation to
  shipping. Issues filed from creator-thesis: #16 distribution profiler, #17 receipts,
  #18 outage failover, #19 work queue; #13 refreshed. Site refresh STAGED (scratchpad
  clone, branch `messaging/context-wars`) — review+push after release.
- **GOTCHA (2 workers hit it)**: workers embedded raw NUL bytes as map-key separators in
  source template literals — file turns binary to git/grep/Biome. Always write the
  6-char escape sequence (backslash-u-0000), never the raw byte.
- Research: `research/24-creator-thesis-update.md` (thesis now context wars; DeepSeek =
  canonical migration story; routing-shaped adoption wave) + `research/25-provider-
  landscape-2026-07.md` + registry seed JSON (models/providers/prices, cited).

**COMPLETION SWEEP (2026-07-03, post-v0.4.1)** — messaging + non-technical gaps closed:
- README gained "What is this, concretely?" (agent example, 5 differentiators, why-now,
  fit table vs Claude Code/opencode/Ollama-vLLM/OpenRouter/single-models/Goose, 5 use
  cases) — then TWO honesty passes: competitive review (OpenRouter has Auto Router +
  Agent SDK; opencode does per-agent models; Goose ships config multi-model, AAIF-
  stewarded; do NOT claim wired vLLM adapter or routable Kimi) and verifier pass
  (brain not user-reachable from glam yet — say ledger/config/cache are the owned files,
  brain wiring "in build"; "authored" not "opened the PR"; ~2 cents not ~1; default
  policy ships NO edge/escalation rule — phrase as "one routing rule away").
- STANCE (user-set): context is local-first, inference is DELIBERATELY RENTED — "the
  fire in the name is Fireworks-class serverless GPUs, not your laptop"; "local-first
  describes your data, not your GPUs." In README + site. Never re-frame glamfire as
  local-inference-first.
- Site (glamworks.github.io) mirrors all of it (#concrete/#fits/#week sections).
- QUICKSTART rewritten as install→doctor→key→five use-case walkthroughs, ALL output
  real-captured at v0.4.1 (incl. live budget-stop + SIGINT). Fire-drill rule matches
  CENTER-scored tasks only — docs carry the edge-rule note (a "refactor" prompt scores
  edge and falls through; site/quickstart snippets verified to actually route).
- Non-tech gaps closed: repo description/topics/homepage set (was old GLM-only pitch,
  zero topics); v0.4.0/v0.4.1 release notes filled from CHANGELOG + release.yml now
  auto-extracts the tag's CHANGELOG section; good-first-issues #20 (models --provider)
  #21 (usage --month) #22 (catalog entry template); help-wanted on #16-19; product
  issues from verifier: #23 budget_exhausted exit code (currently exits 0!), #24 run
  header shows adapter id not provider, #25 local/vLLM adapter (unlocks Ornith
  self-host), #26 default edge/escalation rule, #27 wire brain into glam run.
  SECURITY/CoC dead glamworks.dev emails replaced with GitHub private reporting.
- research/26-ornith.md: Ornith-1.0 (DeepReinforce, MIT, 9B/35B/397B; 31B unreleased) —
  NO US serverless host yet → catalog/adapter = self-host tier via #25, does NOT change
  GLM default or DeepSeek budget tier. Messaging gold: their own tables show the harness
  swings Terminal-Bench up to 6 points (Opus 85→78.9 Terminus-2→Claude Code).
- BLOCKED ON USER: (a) glamworks.dev domain dead (no DNS) — register+mailbox or stay on
  GitHub reporting; (b) GitHub social-preview image upload (Settings, manual);
  (c) npm/site copy for next release picks up new keywords/description at next tag.
