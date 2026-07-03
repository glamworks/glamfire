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
