# Current state

Keep this in sync with README → **Current reality**. Update on every release.

**Version**: see `VERSION` (source of truth).

**Works today (verified, real, human-usable)**
- `glam version` / `--version` — version in output.
- `glam doctor` — env checks (Node ≥22, FIREWORKS_API_KEY, install).
- `glam help`.
- `scripts/smoke.mjs` — drives the real CLI like a human; PASSING.
- `scripts/version.mjs` / `bump-version.mjs` — version source-of-truth + bump.
- SPEC.md complete; 22-dimension research base in `research/`; orchestrator framework
  in `.claude/`.

**Specified, not yet built** (build in lock-step, no shims): `@glamfire/engine`,
`@glamfire/brain`, `@glamfire/router`, `@glamfire/adapters` (fireworks-glm first),
`@glamfire/skills`, `@glamfire/team`, SDK, server mode, real binaries/packaging, CI
matrix, team harness surfaces.

**Next sensible work** (pull as issues, dispatch to parallel builders): the
`fireworks-glm` adapter as the first real inference path behind `glam`, then the engine
loop (handling GLM streaming tool-call fragments), then the brain store (sqlite-vec),
then the router — each a full-stack mini-feature verified against a real Fireworks call.
