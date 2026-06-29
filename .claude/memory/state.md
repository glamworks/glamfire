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
- `scripts/smoke.mjs` (drives real CLI + `glam run`/`glam config`); version source-of-truth.

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

**Next**: (1) get FIREWORKS_API_KEY → live-verify `glam run` → release 0.1.0. (2) Wave 3:
router + a 2nd adapter (anthropic) together; then team Slack surface, SDK, packaging.
