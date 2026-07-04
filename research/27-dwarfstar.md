# 27 — DwarfStar (DS4, antirez): single-model local inference engine for DeepSeek V4 Flash

Research date: **2026-07-03**. Released: **2026-05-06** (as "DwarfStar4", since renamed
**DwarfStar**; repo `antirez/ds4`). Status: ~2 months old, beta-quality by the author's
own label, but the biggest local-inference story of mid-2026.

**Pivot note:** "dwarfstar" is **not a model**. It is an **inference engine** — a
purpose-built, self-contained native runtime for **DeepSeek V4 Flash** (glamfire's
existing budget-tier model) written by **Salvatore Sanfilippo (antirez)**, the creator
of Redis. Everything below documents what it actually is.

---

## 1. What it is (facts)

- **Author & pedigree:** antirez (Redis, 2009). "This is the antirez software
  philosophy applied to AI" — small, single-purpose, written in C, opinionated about
  scope ([andrew.ooo review](https://andrew.ooo/posts/ds4-antirez-deepseek-v4-flash-local-inference-review/),
  [antirez blog](https://antirez.com/news/165)). Openly disclosed as built "with strong
  assistance from GPT 5.5" ([README](https://github.com/antirez/ds4/blob/main/README.md)).
- **Timing:** DeepSeek V4 Flash (284B MoE, ~13B active, 1M ctx, MIT) dropped
  **2026-04-24**; DS4 shipped **2026-05-06**, six days after Apple started shipping the
  M3 Ultra Mac Studio with 512 GB unified memory
  ([andrew.ooo](https://andrew.ooo/posts/ds4-antirez-deepseek-v4-flash-local-inference-review/),
  our [25-provider-landscape](25-provider-landscape-2026-07.md)).
- **Adoption (2026-07-03):** **~17.4k stars, ~1.5k forks, 332 commits**, MIT license,
  primary language C (~49.6%) ([GitHub](https://github.com/antirez/ds4)). Crossed 7k
  stars in 4 days off the HN launch (497 points, 157 comments,
  [HN 48142108](https://news.ycombinator.com/item?id=48142108)); caught the attention
  of Georgi Gerganov (llama.cpp) per secondary press
  ([pythonlibraries.substack](https://pythonlibraries.substack.com/p/deepseek-v4-flash-quantized-version)).
- **Scope (deliberately narrow):** "not a generic GGUF runner, not a wrapper around
  another runtime… completely self-contained." Accepts **only DeepSeek V4 Flash GGUFs**
  (DS4-specific files — *incompatible with llama.cpp/Ollama*), plus **V4 Pro** on
  512GB-class machines. Author calls the model choice "strictly opportunistic" — if a
  better open-weight model appears they may retarget the engine
  ([README](https://github.com/antirez/ds4/blob/main/README.md)).
- **The quantization trick (why it matters):** asymmetric ~2-bit quantization —
  **only the routed MoE experts are quantized** (up/gate at `IQ2_XXS`, down at `Q2_K`);
  shared experts, attention, routing stay high precision. Result: the 284B model fits
  in **~87 GB** of weights, "right at the edge" of 128 GB unified memory
  ([tech report](https://pradeep-stellar.github.io/ds4),
  [pi-ds4](https://pi.audreyt.org/),
  [MindStudio](https://www.mindstudio.ai/blog/what-is-selective-quantization-dwarf-star)).
  Variants: `q2-imatrix` / `q2-q4-imatrix` (96–128GB), `q4-imatrix` (256GB+),
  `pro-q2-imatrix` (512GB), plus **SSD expert-streaming** "capacity mode" for
  below-RAM machines (e.g. 64GB MacBook w/ 32GB expert cache) and **distributed
  layer-split inference** over Thunderbolt/Ethernet (1.66× prefill speedup on 2×M5 Max;
  −19.4% generation) ([README](https://github.com/antirez/ds4/blob/main/README.md),
  [antirez news/167](https://antirez.com/news/167)).
- **Serving surface — the part glamfire cares about:** one binary exposes
  **dual-protocol endpoints on `http://127.0.0.1:8000`**: OpenAI
  (`/v1/chat/completions`, `/v1/completions`, `/v1/responses`) **and** Anthropic
  (`/v1/messages` incl. `count_tokens`) — Claude Code, Codex CLI, OpenCode, Pi, Aider,
  Continue.dev drive it directly ([pi-ds4](https://pi.audreyt.org/),
  [andrew.ooo](https://andrew.ooo/posts/ds4-antirez-deepseek-v4-flash-local-inference-review/)).
  Tool calling is translated **DSML→JSON with "exact replay"**: the server maps tool
  IDs back to original DSML blocks, preserving byte-for-byte fidelity across stateless
  API calls ([README](https://github.com/antirez/ds4/blob/main/README.md)).
- **KV cache as a product feature:** compressed KV (per-layer 4:1 / 128:1) makes
  32k–128k sessions serialize to **a few MB**; disk-persisted, SHA1-keyed checkpoints
  (`~/.ds4/kvcache`) with `/save`, `/list`, `/switch` in the native TUI agent; cheap
  exact token-prefix checks for reuse ([tech report](https://pradeep-stellar.github.io/ds4),
  [README](https://github.com/antirez/ds4/blob/main/README.md)).
- **Platforms:** Metal (primary), CUDA (incl. DGX Spark/GB10), ROCm (Strix Halo /
  Framework Desktop). CPU path is diagnostics-only and **crashes macOS** due to an OS
  VM bug ([README](https://github.com/antirez/ds4/blob/main/README.md)).
- **Hardware floor:** 96–128 GB unified memory minimum for the sanctioned path
  (~87 GB weights + ~10 GB KV/logs disk; `sudo sysctl iogpu.wired_limit_mb=92000` on
  96GB Macs). "There's no path to running this on a 32 GB MacBook"
  ([pi-ds4](https://pi.audreyt.org/), [andrew.ooo](https://andrew.ooo/posts/ds4-antirez-deepseek-v4-flash-local-inference-review/)).

## 2. Benchmarks — engine speed is real; model quality at Q2 is the open question

DS4 changes **where** DeepSeek V4 Flash runs, not what it is. So "benchmarks vs
glamfire tiers" splits into throughput (engine, well-documented) and quality (model at
2-bit, **not independently evaluated**).

**Throughput** (vendor README, single-run Metal CLI, `--ctx 32768`, greedy, 256-tok gen;
plus HN/pi reports):

| Hardware | Quant | Prefill t/s | Generation t/s |
|---|---|---|---|
| M5 Max 128GB (11.7k-tok prompt) | Q2 | **463.4** | 25.9 |
| M5 Max (2k ctx, pi report) | IQ2XXS | 545 | 35 |
| M3 Max 128GB | Q2 | 58.5 | 26.7 |
| M3 Ultra 512GB (12k prompt) | Q4 | 448.8 | 26.6 |
| DGX Spark GB10 128GB | Q2 | 343.8 | **13.75** (decode-bound) |
| RTX Pro 6000 (HN report) | lower quant | 121.8 | 47.9 |

([README](https://github.com/antirez/ds4/blob/main/README.md),
[HN](https://news.ycombinator.com/item?id=48142108), [pi-ds4](https://pi.audreyt.org/).)
~25–35 t/s generation is usable-agent speed; one HN user ran **124k-token context**
"still just buzzing along."

**Quality at Q2 — treat all claims skeptically:**
- **No independent eval suite results exist** (no Artificial Analysis entry for the Q2
  local variant; DeepSeek publishes FP8 numbers only). DS4 ships `ds4-eval` — 92
  embedded questions (GPQA Diamond, SuperGPQA, AIME 2025, security code reasoning) —
  explicitly "a hard capability regression suite rather than a pass/fail unit test,"
  i.e. it detects engine regressions, it does not certify parity with FP8
  ([README](https://github.com/antirez/ds4/blob/main/README.md)).
- Secondary-source claim: selective 2/4-bit "preserves approximately 95–98% of the
  quality of a full Q4 quantization," perplexity +3–5%
  ([MindStudio](https://www.mindstudio.ai/blog/what-is-selective-quantization-dwarf-star)) —
  **unattributed methodology; do not repeat as fact.** (Same article reports 4–8 t/s on
  M4 Ultra, contradicting every primary source — low-quality secondary.)
- HN skeptic framing worth keeping: "large MoE models at 2–3 bits usually performed
  worse (quality-wise) than dense ~30B models at 4–8 bits, despite being much heavier
  to run"; another asked for real-task comparisons vs Qwen3.6-27B
  ([HN](https://news.ycombinator.com/item?id=48142108)).
- Split testimony on agentic use: simonw on HN: "very capable at writing code and tool
  execution" on a 128GB M5 (~80GB resident); andrew.ooo calls tool-calling reliability
  at 2-bit "the surprise"; but the pi-ds4 docs warn "DS4's tool-calling training is
  weaker than Claude's and tends to slip up… workloads heavily reliant on tool loops
  will struggle," and validate behavior only to **32k tokens**
  ([HN](https://news.ycombinator.com/item?id=48142108),
  [andrew.ooo](https://andrew.ooo/posts/ds4-antirez-deepseek-v4-flash-local-inference-review/),
  [pi-ds4](https://pi.audreyt.org/)).
- **Vs glamfire tiers:** hosted **GLM-5.2** (FP8, Fireworks, $1.40/$4.40) remains the
  quality workhorse — V4 Flash even at FP8 is the *budget* model (SWE-bench-class
  results below GLM-5.2; see [25](25-provider-landscape-2026-07.md)), and Q2-local can
  only be ≤ FP8-hosted. Vs **Ornith** ([26](26-ornith.md)): Ornith-35B (~25 GB
  quantized) is the laptop-class local candidate; DS4+V4-Flash is the
  **workstation-class** local candidate (96–128 GB floor) with a much bigger base model
  behind it.

## 3. What first-class DS4 support in glamfire requires

Cheapest "new provider" we will ever add — it speaks both protocols we already target:

- **Adapter:** point the existing OpenAI-compatible adapter at
  `http://127.0.0.1:8000/v1/chat/completions` (or the Anthropic adapter at
  `/v1/messages`). No new wire format. Model ID is fixed (one model per server);
  provider entry is `local/ds4` with price **$0.00/$0.00** and a `local` capability
  flag.
- **Tool-call ID hygiene (conformance-suite item):** DS4's exact-replay design means
  tool-call IDs must round-trip **byte-identical** — the server keys original DSML
  blocks off them. glamfire must never rewrite/normalize tool_call IDs when
  replaying history. Add an ID-round-trip case to the adapter conformance suite; it
  also protects us on Fireworks prompt caching.
- **Context policy:** engine supports up to 1M tokens (indexer alone ~26 GB at max),
  but the practical validated envelope is **32k (pi) to ~128k (HN user)**; pi defaults
  `DS4_CONTEXT_KB=100`. Router should cap DS4-routed tasks at ~100k and treat beyond
  as experimental.
- **Cache-aware prompting:** DS4 persists KV checkpoints keyed by exact token prefix.
  glamfire's context layer should emit **stable prompt prefixes** (system + tool defs
  frozen per session) so reuse hits; this is the same discipline Fireworks cache-hit
  pricing rewards — one behavior, two payoffs.
- **Thinking modes:** non-thinking / thinking / "Think Max"; reasoning streamed
  natively. Adapter must pass through/strip reasoning consistently with our GLM `<think>`
  handling.
- **Install/health path:** weights via `./download_model.sh <variant>` (~87 GB — a
  real onboarding cost), build via `make` / `make cuda-spark`; `glam doctor` should
  detect a running DS4 endpoint and report RAM headroom. Note DS4 GGUFs are
  **DS4-only** — do not conflate with the user's Ollama/llama.cpp model store.
- **Honesty flags:** author labels the code **beta**; macOS CPU path crashes the
  kernel; hardware floor 96 GB excludes most laptops. Catalog entry must say so.

## 4. Four things we take from it

1. **Vertical single-model integration is the same bet as tested per-model adapters.**
   antirez's stated reason for DS4 is that general-purpose runners have "integration
   gaps — particularly around KV cache persistence, tool-calling, and agentic
   workflows" ([tech report](https://pradeep-stellar.github.io/ds4)). That is a
   verbatim description of glamfire's last-mile thesis, endorsed by 17.4k stars in two
   months: depth-per-model beats lowest-common-denominator.
2. **Tool-call IDs are state.** Exact-replay (byte-preserving DSML↔JSON mapping across
   stateless calls) is the first engine to make ID fidelity a hard contract. Our
   conformance suite should test it for *every* adapter — silent ID rewriting is a
   latent cache- and replay-breaker.
3. **KV/prefix persistence is a harness feature, not just an engine feature.**
   Sessions that serialize to "a few MB" and resume from disk only pay off if the
   client sends stable prefixes. glamfire's context layer controls the prefix — being
   cache-shape-aware is leverage over both local DS4 and hosted Fireworks caching.
4. **Dual-protocol local endpoints are now table stakes — and demand routing.** DS4
   ships OpenAI *and* Anthropic APIs so existing agents adopt it with zero glue;
   Claude Code/OpenCode/Pi integrations happened within weeks. Bonus routing data
   point from the author: "not just me but every other contributor found GPT 5.5 able
   to help immensely and Opus completely useless" for perf-critical C — task-dependent
   model fitness is real, which is exactly why a router exists
   ([HN](https://news.ycombinator.com/item?id=48142108)).

## 5. Does it change glamfire defaults?

- **GLM 5.2 workhorse: unchanged.** DS4 does not serve GLM; hosted GLM-5.2 remains the
  quality/speed/price default ([25](25-provider-landscape-2026-07.md)).
- **DeepSeek V4 Flash budget tier: unchanged — and strengthened.** The budget model
  now has **two venues with one identity**: Fireworks FP8 at $0.14/$0.28 per 1M, or
  local DS4 at $0/token on 96–128 GB hardware. "Same brain, hosted or on your desk" is
  a routing story no per-model quality cliff undermines — though we must label the
  local venue **Q2 ≠ FP8, quality unverified** until we run our own eval pair
  (identical task set vs Fireworks FP8; nobody has published this — cheap, novel,
  citable work).
- **Local tier:** DS4+V4-Flash becomes the **workstation local option** alongside
  Ornith-9B/35B as the **laptop local option** ([26](26-ornith.md)). Neither displaces
  a hosted default; both make the `local` capability flag real.
- **Skepticism ledger:** throughput numbers are author-reported single runs; quality
  claims for Q2 are anecdotal (simonw positive, pi docs negative on tool loops);
  hardware floor excludes most users; the engine is one maintainer + community, beta,
  and hard-coupled to one model family's lifecycle.

---

## Key takeaways for glamfire

- **DwarfStar/DS4 is an engine, not a model** — antirez's MIT, pure-C, single-model
  runtime that puts **DeepSeek V4 Flash (284B MoE, our budget-tier model)** on
  96–128 GB Macs/DGX Spark/Strix Halo at ~26–35 tok/s gen, ~450–545 tok/s prefill,
  via asymmetric 2-bit expert-only quantization (~87 GB weights).
- Cheapest adapter we can add: **dual OpenAI + Anthropic endpoints on localhost:8000**;
  the work is a catalog entry, an ID-round-trip conformance test, a ~100k context cap,
  and honest `beta / Q2-unverified` flags.
- **Q2 quality is the unknown** — no independent evals; testimony splits (simonw:
  capable at code+tools; pi docs: tool loops "will struggle", validated only to 32k).
  Running Fireworks-FP8 vs DS4-Q2 on one task set would be first-of-its-kind evidence.
- **Defaults unchanged:** GLM 5.2 workhorse, V4 Flash budget — but V4 Flash gains a
  $0/token local venue, making model-identity-preserving hosted↔local routing a
  glamfire-unique story.
- DS4's existence is **third-party validation of the last-mile thesis**: a
  world-class systems engineer decided the generic-runner gaps that matter are "KV
  cache persistence, tool-calling, and agentic workflows" — and 17.4k stars agreed.
- Absorb its mechanics: byte-stable tool-call IDs, stable prompt prefixes for KV/cache
  reuse, dual-protocol serving, and per-task model fitness ("GPT 5.5 immensely
  helpful, Opus useless" for perf C) as router ammunition.

## Sources

- https://github.com/antirez/ds4
- https://github.com/antirez/ds4/blob/main/README.md
- https://antirez.com/news/165
- https://antirez.com/news/167
- https://news.ycombinator.com/item?id=48142108
- https://pradeep-stellar.github.io/ds4
- https://pi.audreyt.org/
- https://andrew.ooo/posts/ds4-antirez-deepseek-v4-flash-local-inference-review/
- https://gigazine.net/gsc_news/en/20260515-dwarfstar-4/
- https://www.mindstudio.ai/blog/what-is-selective-quantization-dwarf-star
- https://pythonlibraries.substack.com/p/deepseek-v4-flash-quantized-version
- https://www.fratepietro.com/2026/dwarfstar-4-local-inference-antirez/
- https://www.noze.it/en/insights/dwarfstar-4/
- https://pasqualepillitteri.it/en/news/2253/ds4-antirez-deepseek-v4-flash-inference-engine
- https://techstrong.ai/articles/redis-creator-brings-deepseek-to-the-mac/
- https://forums.developer.nvidia.com/t/fully-custom-cuda-native-deepseek-4-flash-optimized-for-1x-spark-antirez-ds4/369791
