# Claude Code's honest status line behind a gateway (env-var mechanism)

Recorded 2026-07-03 while building `glam launch claude`. Non-obvious; future
sessions building agent wrappers / status-line integrations need this.

## The problem

Claude Code's status line prints the model name from its OWN config, unaware
that `ANTHROPIC_BASE_URL` redirected the request to a gateway. So even when
every request is served by GLM 5.2 via glamfire, the line says "Opus 4.8" — a
cosmetic lie. The gateway pins the real model server-side
(`proxy-server.mjs` overlays the client's model id with the adapter's), so
behavior is correct; only the display is wrong.

## The mechanism (which env vars, why)

Set these in claude's env (all documented at code.claude.com/docs/en/env-vars,
all take effect behind `ANTHROPIC_BASE_URL`):

- `ANTHROPIC_BASE_URL` → the glam serve URL (http://127.0.0.1:4114).
- `ANTHROPIC_AUTH_TOKEN` → the serve bearer token (claude sends
  `Authorization: Bearer`).
- `ANTHROPIC_MODEL=glm-5.2` → a NON-Anthropic model id. This is the key trick:
  for unknown ids claude prints the raw string verbatim (no pretty-print
  lookup), so the line stops saying "Opus 4.8". The gateway ignores this id and
  pins GLM anyway.
- `ANTHROPIC_CUSTOM_MODEL_OPTION=glm-5.2` + `ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="GLM
  5.2 (via glamfire)"` + `ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION=...` → the
  documented custom-model vars. These make the `/model` picker AND the status
  line show the friendly name instead of the bare id. NOTE the `_OPTION_` infix:
  `ANTHROPIC_CUSTOM_MODEL_NAME` (without `_OPTION_`) is NOT read by claude and
  silently does nothing — confirmed by grepping the claude binary
  (only `ANTHROPIC_CUSTOM_MODEL_OPTION_NAME` / `_OPTION_DESCRIPTION` /
  `_OPTION_SUPPORTED_CAPABILITIES` are present).
- `ANTHROPIC_SMALL_FAST_MODEL=glm-5.2` → background/haiku tasks also route
  through glamfire (deprecated var, but currently the only Anthropic-path lever
  for the small/fast model).

## The gotcha — unknown ids make claude emit thinking/beta fields

Setting `ANTHROPIC_MODEL` to a non-Anthropic id makes claude emit
`thinking:{type:adaptive}` and beta header fields it would not send for a
known id. This is SAFE with glamfire because the translator
(`packages/proxy/src/translate.ts:219`, `anthropicToOpenAIRequest`) builds the
upstream body from a strict whitelist
(`messages/tools/max_tokens/temperature/top_p/stop/user/stream`) and DROPS
`thinking`, `output_config`, `context_management`, and unknown content blocks
with loud warnings. So the unknown-id path that makes the status line honest
does not break the request. Verified live 2026-07-03: `glam launch claude -- -p
"…"` returned 200 from GLM-5.2 with `requestedModel: glm-5.2` in the ledger.

If a future claude version sends a field the translator does NOT whitelist and
the upstream 400s, the fallback is to also set
`CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` and
`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` in the wrapper env. Not needed today
(translator handles it); add only if a live 400 appears.

## The other gotcha — claude's own config can override ANTHROPIC_MODEL

`ANTHROPIC_MODEL` sets claude's DEFAULT model. If the user has a model pinned
in `~/.claude/config.json` (or `~/.claude.json`), that user config WINS and
claude sends that id instead of `glm-5.2`. The gateway still pins GLM
server-side (behavior correct), but the status line shows the user's pinned
name, not "GLM 5.2 (via glamfire)". This is claude's config precedence, not the
wrapper's bug. Verified: with a clean HOME (no `~/.claude/config.json`),
`ANTHROPIC_MODEL=glm-5.2` takes effect and the ledger records
`requestedModel: glm-5.2`. With a real HOME that pins `claude-opus-4-8`, the
ledger records `requestedModel: claude-opus-4-8` (cosmetic lie returns). To get
the honest line in that case the user must clear their claude model pin or pick
the glamfire custom option in `/model`.

## Where this lives in the code

- `packages/cli/src/launch.mjs` — `buildLaunchEnv` (pure, testable) constructs
  the block; `cmdLaunch` / `runLaunch` spawn serve, build the env, exec claude,
  tear serve down.
- The smoke LIVE check (`scripts/smoke.mjs`, "glam launch claude LIVE") is the
  human-standard verify: real claude + real GLM + ledger record with
  `requestedModel: glm-5.2` and `model: glm-5p2`.
