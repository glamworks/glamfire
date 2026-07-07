# Nate B Jones comment — truth audit + implementation plan (2026-07-07)

The owner wants to post this comment on a Nate B Jones video, and it must be
**truthful** (no vaporware claims):

> OK, I think this is pretty awesome. glamfire on github. use claude code with
> Anthropic subscription and GLM 5.2 on Fireworks AI with shared memory and
> knowledge base. Plus team memory and knowledge base. And flexible support for
> model, provider and harness (more are being implemented everyday). Open source,
> contributors welcome. glamworks glamfire on gh. Thanks Nate for inspiration and
> general awesomeness.

## Truth audit against main (2026-07-07, v0.7.0, PR #50 merged)

| Claim | Status | Evidence / gap |
|---|---|---|
| claude code + Anthropic subscription | ✅ true | `claude` alone = Anthropic sub; `glam launch claude` wraps it |
| GLM 5.2 on Fireworks | ✅ true | default, live-verified, smoke PASS |
| shared memory + knowledge base | ⚠️ partial | `glam run` reads/writes the brain; `glam launch claude` does NOT capture sessions into the brain yet (README admits this is "the next step") |
| Plus team memory + knowledge base | ❌ not shipped | brain has `scope:team` + `sharing:team` + lint, but no team store path / git-sync / CLI wiring |
| flexible model/provider/harness | ✅ true | 4 adapters (fireworks-glm, anthropic, together, local/Ollama), 8 model configs, conformance suite |
| more being implemented everyday | ⚠️ weak | true in backlog (Kimi pending, #37 Ornith, #38 DwarfStar open) — not concrete today |
| open source, contributors welcome | ✅ true | Apache-2.0, CONTRIBUTING.md + CODE_OF_CONDUCT.md + RFC process, good-first-issues #49/#22/#21/#20/#13 |

## What makes the comment fully true (in progress, parallel workers, 2026-07-07)

- **Team memory + KB** → issue #31 + #51 team layer. Worker on worktree
  `../glamfire-team-brain` (branch `feat/team-brain-31`). Build: team brain store,
  git-versioned team tree (personal excluded by lint), wire all run modes to one
  brain, `glam brain team` CLI.
- **Shared memory across all run modes** → issues #52 + #29. Worker on
  `../glamfire-launch-capture` (branch `feat/launch-capture-52`). Build: real-time
  episode capture from `glam launch claude` into the brain + first-launch async
  ingest of existing Claude Code memory, non-blocking.
- **"more being implemented" concrete now** → issue #37. Worker on
  `../glamfire-ornith-37` (branch `feat/ornith-adapter-37`). Build: first-class
  Ornith-1.0 adapter (antirez's local DeepSeek V4 Flash engine) + catalog entry +
  conformance.
- Statusline "model · project · context" (#53) + generalize-beyond-glamfire (#54)
  also in flight (worktrees `../glamfire-statusline-53`, `../glamfire-generalize-54`).

## Rule

Do NOT soften the comment or README to hedge unimplemented claims — **implement
the claims** (owner directive 2026-07-07). The comment posts verbatim once #7
(team) + #8 (launch capture) land and merge. Until then, the comment is not yet
fully truthful.

See [[2026-07-07-fresh-session-handoff]] for the broader session handoff and
[[glamfire-evergreen-persistence]] for the always-on commit/tag/bump discipline.
