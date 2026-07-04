# Gotchas

Non-obvious technical traps. Add to this as you hit them so no future session re-learns
them the hard way.

- **GLM 5.2 tool-call arguments stream as fragments** and must be reassembled by the
  engine; reasoning is interleaved between tool calls. The adapter/engine must handle
  both (research/01). This is core to `@glamfire/engine` + `fireworks-glm` adapter.
- **GLM 5.2 thinking is on by default** via `reasoning_effort` (high/max; max is the
  template default). Surface this as adapter config.
- **Fireworks is OpenAI- and Anthropic-compatible**, ~90% cached-input discount, 50%
  batch pricing, on-demand GPUs (~$7/hr H100/H200). The router's cost model must account
  for caching and tiers (research/02).
- **Fireworks wire `service_tier` ≠ glamfire's internal pricing-tier names.** The LIVE
  Fireworks API accepts ONLY `auto|default|flex|priority` (verified 2026-07-01);
  glamfire's INTERNAL `serviceTier` enum is `standard|priority|fast|background` (a
  pricing-table key in `fireworks-glm.ts`). Sending the internal name raw → HTTP 400
  (`value: 'standard'` rejected). The default/cheapest path OMITS the field entirely.
  The adapter must translate internal→wire before it hits the body: standard→omit,
  background→flex, priority→priority, fast→priority (Fireworks has no distinct "fast").
  This was the blocker that stopped the first live GLM round-trip.
- **License landmines in competitors** (research/07): LangGraph server = Elastic License
  2.0; Dify = source-available (no-SaaS); Arize Phoenix = Elastic License 2.0. Do not
  copy code from these into an Apache-2.0 repo.
- **MCP 2026-07-28 RC** deprecates Roots/Sampling/Logging (stateless core). Track the
  spec revision when building MCP support (research/08).
- **GLM weights license**: repo states Apache-2.0 while some launch press said MIT —
  verify against the actual repo LICENSE before asserting (research/01).
- **Confidence signal**: probe/perplexity-based confidence beats verbalized
  ("how sure are you?") confidence for routing/escalation (research/04).
- **Fireworks `GET /inference/v1/models` is a curated subset, not the catalog.**
  It returned only 7 models on 2026-07-03 and OMITS `deepseek-v4-flash`, which is
  READY + serverless + serving fine. To verify a model exists, hit the control
  plane: `GET https://api.fireworks.ai/v1/accounts/fireworks/models/<short-id>`
  (same bearer key) — returns `state`, `supportsServerless`, `supportsTools`,
  `contextLength`. Never conclude a model is gone from the inference list alone.
- **DeepSeek-V4 on Fireworks (verified live 2026-07-03):** both `deepseek-v4-pro`
  and `deepseek-v4-flash` are THINKING models — they emit `reasoning_content` and
  accept `reasoning_effort` (same knob as GLM). Parallel tool calls + `seed` work.
  Fireworks lists **no Priority tier for V4-Flash** (standard only) — the adapter
  fails loud on `--tier priority|fast` with Flash. Their streamed tool-call
  arguments arrived as ONE chunk (not fragmented like GLM) — the shared
  accumulator handles both; don't assume fragmentation when authoring fixtures.
- **Windows CI cross-platform traps (fixed 2026-07-01, all green on win/mac/linux):**
  (1) No `.gitattributes` → Windows checks out CRLF → `biome check` fails (LF formatter).
  Fix: `.gitattributes` with `* text=auto eol=lf`. (2) Dynamic `import()` of a runtime
  file whose path holds a Windows 8.3 short name (`RUNNER~1` in the temp dir) → `~`
  becomes `%7E` in the file URL → Vite's loader in vitest fails (`Failed to load url
  C:/…/skill.mjs`). Fix: `realpathSync.native(path)` before `pathToFileURL` — the JS
  `realpathSync` does NOT expand 8.3 names, only `.native` (libuv) does. (3) `new Function
  ('u','return import(u)')` for a "native" import throws `A dynamic import callback was not
  specified` in Node — don't use it. `scripts/bump-version.mjs` writing package.json via
  raw `JSON.stringify` expands `workspaces` to multiline which Biome rejects → bump script
  now runs `biome format` on it.
- **Claude Code ⇄ proxy wire facts (observed live 2026-07-03, Claude Code v2.1.200,
  `glam serve`):** (1) Claude Code sends `role:"system"` messages INSIDE the
  `messages` array (beyond the top-level `system` field) — a strict
  Anthropic-Messages translator 400s on its very first request; `@glamfire/proxy`
  maps them to OpenAI system messages. (2) Auth header depends on which env var the
  user set: `ANTHROPIC_AUTH_TOKEN` → `Authorization: Bearer …`, `ANTHROPIC_API_KEY`
  → `x-api-key: …` — the proxy accepts the token in either. (3) Claude Code always
  streams and calls `POST /v1/messages/count_tokens`; serve answers it with a
  documented ~4-chars/token estimate. (4) Fireworks prompt caching is real through
  the proxy: turn 2 of a Claude Code session showed 27k `cached_tokens`, priced at
  the cached rate. (5) Claude Code's own `total_cost_usd` prices the model NAME it
  requested (a Claude id) — a session it estimated at $0.30 actually cost $0.042 on
  GLM-5.2 through the proxy; the ledger is the receipts story.
- **Windows main-module guard (fixed v0.4.1):** `import.meta.url === `` `file://${process.argv[1]}` ``
  never matches on Windows (backslashes + `file:///D:/` drive form) — the "run as CLI"
  branch of `scripts/version.mjs` silently printed nothing there, first surfaced by the
  doctor install-check regression test executing the script on Windows CI. ALWAYS write
  main-module checks as `import.meta.url === pathToFileURL(process.argv[1]).href`.

## Integration gotchas (2026-07-03, orchestrator)

- **Rebuild dist after every merge touching packages/*/src TS**: tests import
  `@glamfire/*` via `dist/`; a stale dist made 11 provider-identity tests fail on
  main while the source was correct. `npm run build` is part of the integration
  checklist before gating.
- **FIREWORKS_API_KEY lives in `~/.config/.env`** (`set -a; . ~/.config/.env; set +a`)
  — NOT in the default shell env. Smoke's live checks are key-gated and print a loud
  not-verified notice without it.
- **Brain never bundles**: `packages/cli/src/memory.mjs` loads `@glamfire/brain` via a
  runtime-composed import specifier so Bun.build can't inline the native store. Memory
  therefore requires running from the repo/workspace (the dogfood setup does). Publishing
  brain as an optionalDependency is an open product decision.
- One-off vitest flake seen once on a full run, never reproduced in four re-runs
  (name not captured) — watch CI.
- **Local adapter / Ollama fixture-capture traps (learned live 2026-07-03, issue #25):**
  (1) qwen3:0.6b at temperature 0 will NOT call a `calculator` tool — it does the
  arithmetic in its `reasoning` and stops (deterministic; stronger prompts don't help).
  Use a tool the model *cannot* answer without (`get_weather`) for single-tool-call
  fixtures; parallel weather calls DO work on 0.6b. (2) Ollama's OpenAI endpoint emits
  thinking as `reasoning` (not `reasoning_content`) and DOES honor
  `stream_options.include_usage`; token usage is real. (3) A cold Ollama model load can
  exceed 3 minutes when big models occupy memory — the live smoke pre-warms with a tiny
  completion (250s budget) before timing the real `glam run` (300s). Warm inference on
  qwen3:0.6b is ~3s/run. (4) The `local` adapter sends NO Authorization header when no
  key is configured (a dangling `Bearer ` confuses some servers); vLLM `--api-key` mode
  uses GLAM_LOCAL_API_KEY. (5) `catalogEntrySchema` now rejects $0 on hosted providers
  at the schema level; $0 is legal only for the self-host venues
  (ollama/vllm/lmstudio/dwarfstar) — see SELF_HOST_PROVIDERS in catalog.ts. (6) The
  conformance battery's pricing test auto-detects declared-free adapters (1M+1M tokens
  price to $0) and then requires EVERY usage to be exactly $0. (7) DS4 byte-exact
  tool-call ID replay is a shared battery item now — never normalize/rewrite tool_call
  IDs when replaying history (also protects Fireworks prompt caching).
