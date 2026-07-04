# 29 — Capability-Grounded Routing & Per-Task Cost Estimation

How glamfire keeps routing grounded in **measured capability × price**, stays
automatically current on both, matches an incoming task's domain to the relevant
benchmarks (biology task → natural-sciences scores), and quotes an **estimated
dollar cost for THIS task** — not a per-token price. Builds directly on
[04-model-routing.md](04-model-routing.md) (cascade/confidence architecture),
[25-provider-landscape-2026-07.md](25-provider-landscape-2026-07.md), and the
[25-registry-seed.json](25-registry-seed.json) schema. Researched 2026-07-03.

---

## A. Data sources — what's machine-readable, and under what terms

### 1. Artificial Analysis (AA) — richest single source, **attribution required, redistribution restricted**

- **Data API exists** (`artificialanalysis.ai/data-api`), auth via `x-api-key` header.
  Endpoints cover: LLM evaluations + pricing + performance, provider-level
  breakdowns, media arenas (Elo), and raw per-request measurements (Commercial tier).
- **Fields**: Intelligence Index, **Coding Index, Agentic Index, Math Index**,
  Openness and Multilingual indices, plus **individual benchmark results** (GDPval-AA
  v2, τ³-Banking, Terminal-Bench 2.1, SciCode, Humanity's Last Exam, GPQA Diamond,
  CritPt, AA-Omniscience, AA-LCR); performance (tokens/s, TTFT, time-to-first-answer,
  e2e latency); pricing (input/output/cache, blended); model metadata (context window,
  params, modalities, license, release date, open-weights URL). Intelligence Index
  v4.1 is exactly the per-category composite glamfire needs.
- **Tiers/limits**: Free ≈ 100 req/day (headline indices only; one AA page cites
  1,000/day — treat the data-api docs' 100/day as canonical), Pro 500/day (model-level
  detail, full pricing, percentiles), Commercial (provider-level, time series, raw
  measurements, custom limits).
- **Legal — flag clearly**: *"Use of the API requires attribution across all tiers"* —
  display "Artificial Analysis" as the source. **Redistribution rights require a
  separately negotiated commercial license.** Committing AA numbers into glamfire's
  public repo or shipping them in a released registry snapshot **is redistribution**
  and is not covered by the free tier. Scraping the website instead of using the API
  does not escape this and is worse ToS-wise.
- **Consequence**: AA data must be **fetched at runtime with each user's own free API
  key**, cached locally in the user's context store, and attributed in CLI output —
  never baked into the repo. Update cadence is not documented; AA measures performance
  continuously, so a local TTL (e.g., 7 days for scores, 24h for price/speed) is the
  right model.

### 2. OpenRouter `/api/v1/models` — best free machine-readable **pricing** feed

- Public JSON endpoint (`https://openrouter.ai/api/v1/models`), no key needed, cached
  at the edge, documented for production integration. Per model: **pricing**
  (input/output token, per-request, image, web-search, internal reasoning tokens,
  **cache read and cache write**), `context_length`, `max_completion_tokens`,
  modality filters, supported parameters.
- Covers 400+ models across providers — a cross-check for the hand-curated Fireworks/
  Together prices in `25-registry-seed.json`, and the fastest way to detect the
  "prices decay in weeks" erosion documented in brief 25.
- No formal attribution requirement published for the models endpoint; it is a public
  catalog API. Still: record `sourceUrl` provenance per datum (the registry seed
  already does this — keep the pattern).

### 3. Epoch AI Benchmarking Hub — best **redistributable** benchmark source

- ~18 benchmarks (5 run internally, 13 collected), spanning math, coding, agentic,
  long-context, creative writing. **CSV download + Python client (`pip install
  epochai`)** over an Airtable API that preserves entity relationships.
- **License: CC-BY** (free to use/distribute/reproduce with credit); externally
  sourced slices (Aider Polyglot, Terminal-Bench leaderboards) are **Apache-2.0**.
- **Consequence**: Epoch data **can** be committed as repo snapshots with an
  attribution line — this is glamfire's legally clean committed-snapshot backbone.

### 4. LMArena — per-category and **occupational** human-preference Elo

- Historical leaderboard snapshots published as a Hugging Face dataset
  (`lmarena-ai/leaderboard-dataset`), per arena and category over time.
- Categories (2026): Overall, **Expert**, Coding, Math, Creative Writing, Instruction
  Following, Multi-Turn, Hard Prompts, and **Occupational** — all prompts mapped to
  **23 fields of practice** with 8 leaderboards for the largest (Software/IT ~28%,
  Writing/Literature ~25%, **Life/Physical/Social Science ~17%**). This is the
  closest existing thing to glamfire's task-domain → capability mapping, including
  the "biology task" case.
- Licensing is **per dataset**: arena-human-preference-55k Apache-2.0;
  100k/Search-Arena prompts CC-BY-4.0 with model outputs under providers' terms;
  VisionArena under a limited custom license. **Check the dataset card for
  `leaderboard-dataset` before committing snapshots**; treat as
  "verify-per-dataset", not blanket-permissive.

### 5. Others (secondary / gates, not primary feeds)

- **HELM (Stanford CRFM)**: all raw results in the public GCS bucket
  `crfm-helm-public` (Apache-2.0 framework); hundreds of GB — too heavy as a feed,
  but sub-leaderboards (e.g., **MedHELM**) are useful one-off domain calibration.
- **SWE-bench**: leaderboard is machine-readable — `data/leaderboards.json` in the
  `SWE-bench/swe-bench.github.io` repo (Test/Lite/Verified/Multimodal arrays).
- **Terminal-Bench**: official leaderboard at tbench.ai (2.0/2.1) with audited
  entries; run logs in `laude-institute/terminal-bench-leaderboard` on GitHub; Epoch
  mirrors the leaderboard under Apache-2.0 — **ingest via Epoch** for clean licensing.
- **LiveBench**: 18 tasks in 6 categories (**math, coding, reasoning, language,
  instruction following, data analysis**) with objective ground truth, refreshed
  monthly to fight contamination; datasets on HF (`livebench/*`).
- **GPQA Diamond**: 198 graduate questions across **physics/chemistry/biology**; the
  canonical "natural sciences" signal. Per-domain subscores exist (e.g., OpenAI o1:
  physics 92.8% vs chemistry 77.3%) but most aggregators publish only the composite —
  glamfire should use the composite and note the caveat.
- **HF Open LLM Leaderboard**: **retired March 2025** — do not use; its successors
  are the 200+ community leaderboards, of which LiveBench/LMArena above are the ones
  that matter.

---

## B. Prior art — how routers classify tasks and map to model strengths

- **OpenRouter Auto Router (powered by NotDiamond)**: analyzes each prompt for
  **complexity + task type**, picks from a curated model set; user-facing control is
  a single `cost_quality_tradeoff` dial 0–10 (default 7) plus `allowed_models`
  wildcards. Selection is per-request; no method details published beyond this.
- **NotDiamond custom routers**: train a "meta-model" router **on the customer's own
  eval data** — prompts + per-model scores from any metric — rather than a fixed
  taxonomy. Key idea glamfire can copy: the router is calibrated by *your* evals, and
  the task taxonomy is implicit in the training distribution.
- **RouteLLM (lm-sys)**: routers trained on Chatbot Arena preference data; **transfer
  across model pairs without retraining** (already covered in brief 04) — meaning a
  capability prior learned once survives model churn.
- **Martian**: markets "Model Mapping" — interpretability-based prediction of how a
  model behaves on a query; "Expert Orchestration" with **judge models scoring expert
  models** and routers dispatching to the most trustworthy. Method largely
  unpublished; treat as directional.
- **Unify.ai**: routed per-prompt on quality/cost/speed using live benchmark data —
  the closest published articulation of glamfire's capability×price×speed objective.
- **Router benchmarks for our own regression gate**: **RouterBench** (405k
  precomputed outputs, 11 LLMs, 7 tasks) and **RouterEval** (200M+ performance
  records, 8,500+ LLMs, 12 benchmarks) — ready-made eval sets to test glamfire's
  scorer offline without paying for inference.
- **Pattern across all of them**: nobody publishes a full task→benchmark taxonomy;
  they either learn it from preference/eval data (NotDiamond, RouteLLM) or keep it
  proprietary (Martian, OpenRouter). An **explicit, editable, cited taxonomy is white
  space** and fits glamfire's transparency positioning.

---

## C. Prior art — estimating a task's total cost before running it

- **"How Do AI Agents Spend Your Money?"** (arXiv 2604.22750, Stanford Digital
  Economy Lab; SWE-bench Verified trajectories across 8 frontier models) is the key
  paper:
  - Agentic tasks consume **~1000× the tokens** of code chat/reasoning; **input
    tokens dominate cost** (context re-fed every step) — so cached-input price
    matters more than output price for agents (consistent with brief 25's
    cache-as-routing-signal takeaway).
  - **Same-task runs vary up to 30×** in total tokens; more tokens ≠ better outcome
    (accuracy peaks at intermediate spend).
  - **Self-prediction fails**: models predicting their own upcoming token usage reach
    correlations ≤ 0.39 and **systematically underestimate**. Human difficulty
    ratings also correlate weakly with actual consumption.
  - But coarse-grained self-estimates still carry *relative* signal — usable for
    budget alerts, not for point estimates.
- **Practitioner heuristics** (LLM Gateway et al.): naive per-step estimates
  understate agent cost because context grows each step — real multipliers run
  **8–15×** a single call for a 5-step task; apply a **1.5–2× safety factor**; include
  a 1–5% retry/error rate.
- **Implication for glamfire**: do **not** ask the model to predict its cost, and do
  not present a point estimate. Estimate from **historical distributions of similar
  tasks** — glamfire uniquely owns this data, because every run already produces cost
  receipts in the owned context store — and present **quantile ranges (P50 / P90)**.

---

## D. Recommended architecture

### D1. Registry extension (builds on `25-registry-seed.json`)

Add a `capability` block per entry, keeping the existing provenance discipline
(`sourceUrl`, `asOf`) at the **per-score** level:

```jsonc
{
  "model": "glm-5.2",
  // ...existing fields (price, quant, contextK, capabilities)...
  "scores": {
    "swe_bench_pro":    { "value": 62.1, "source": "epoch|vendor", "sourceUrl": "...", "asOf": "2026-07-03" },
    "terminal_bench_2_1": { "value": 81.0, "source": "epoch", "sourceUrl": "...", "asOf": "2026-07-03" },
    "gpqa_diamond":     { "value": null, "source": null }          // absent → back off (see D4)
  },
  "runtimeScores": "artificial-analysis"   // filled at runtime from user's AA key, never committed
}
```

### D2. Two-plane ingestion (update mechanism)

- **Plane 1 — committed snapshots (redistributable only)**: a scheduled CI job
  (weekly; monthly minimum per brief 25's price-decay finding) fetches **Epoch AI
  CSV/API (CC-BY / Apache-2.0)**, **SWE-bench `leaderboards.json`**, **LiveBench**,
  and **OpenRouter `/api/v1/models`** pricing; regenerates the registry snapshot with
  per-datum provenance; opens a PR (orchestrator reviews and merges — workers don't
  run git). The repo ships with a working snapshot so `glam recommend` works offline
  and on first run. Attribution lines for Epoch (CC-BY credit) live in the snapshot
  header and NOTICE.
- **Plane 2 — runtime fetch (restricted sources)**: `glam models refresh` (and a lazy
  auto-refresh on staleness) pulls **Artificial Analysis** indices with the user's own
  free API key (config: `providers.artificialAnalysis.apiKey`), caches into the local
  context store with TTLs (scores 7d, price/speed 24h), and every surface that shows
  AA-derived numbers prints "capability data: Artificial Analysis". **AA data never
  enters the repo or any published artifact.** Without an AA key, glamfire degrades
  gracefully to Plane-1 snapshot data and says so.
- **Freshness is user-visible**: every recommendation prints the oldest `asOf` it
  relied on; warn at >30 days, and `glam models refresh` fixes it.

### D3. Task-domain taxonomy (explicit, editable, cited)

A small YAML/JSON file in the repo mapping domains → weighted benchmarks. Users can
edit it; glamfire ships defaults:

| Domain | Primary benchmarks (weights) | Fallback |
|---|---|---|
| `coding.agentic` | SWE-bench Pro (.4), Terminal-Bench 2.1 (.3), SWE-bench Verified (.2), AA Coding Index (.1) | AA Intelligence |
| `coding.chat` | LiveBench coding (.5), AA Coding Index (.5) | AA Intelligence |
| `math` | AA Math Index (.5), LiveBench math (.5) | AA Intelligence |
| `science.natural` | **GPQA Diamond (.5)**, HLE (.3), SciCode (.2) | AA Intelligence |
| `reasoning.general` | AA Intelligence Index (.6), LiveBench reasoning (.4) | — |
| `writing` | LMArena Creative Writing Elo (.6), LMArena Writing-occupational (.4) | AA Intelligence |
| `data.analysis` | LiveBench data-analysis (.6), AA Intelligence (.4) | — |
| `agentic.tools` | τ³-Banking (.4), AA Agentic Index (.4), Toolathlon (.2) | AA Intelligence |
| `long_context` | AA-LCR (.7), context-window fit (hard filter) (.3) | — |
| `routine` (extract/classify/reformat) | none — price-dominated tier; capability floor = AA Intelligence ≥ threshold | — |

Domain classification of an incoming task reuses brief 04's machinery: the ~5ms
embedding/keyword pre-router against labeled exemplars per domain, falling back to a
one-shot classification call on the cheapest registry model (DeepSeek V4 Flash,
$0.14/M) when confidence is low. A biology prompt lands in `science.natural` and is
scored on GPQA-Diamond-weighted capability — exactly the mission case.

### D4. Weighted scoring formula (sketch)

```
1. Hard filters: context fits estimated input; required capabilities (tools/json/
   vision); quant policy (fp8+ for coding, per brief 25); license/jurisdiction policy.
2. capability(m, d) = Σ_b w_{d,b} · norm(score_b(m))     // norm = min-max over registry, 0–100
   missing score_b → substitute norm(AA Intelligence) × 0.85 and mark the
   recommendation "low-evidence" (never silently equal-footed).
3. estCost(m, task) = p_in·E[tok_in] + p_cached·E[tok_cached] + p_out·E[tok_out]   // §D6
4. score(m, task) = capability(m, d)^α / estCost_P50(m, task)^β
   with (α, β) set by one knob `router.costQuality` ∈ [0,10] (OpenRouter-compatible
   semantics: 0 = capability-only, 10 = cheapest-capable), default 7.
5. Tie-breakers: measured tokens/s, then TTFT (AA performance data).
```

The existing cascade (cheap-first, escalate on low probe confidence — brief 04) stays;
this scorer replaces "static cheapest-capable ordering" as the cascade's *ordering
function per task*, and the routing-regression gate (golden set + RouterBench slices)
guards changes to weights or taxonomy.

### D5. `glam recommend <task>` UX

```
$ glam recommend "annotate these 400 protein sequences and summarize likely function"
domain: science.natural (confidence 0.91)   evidence: GPQA-D ·. HLE · SciCode

  model               capability  est. cost (this task)   speed     why
» deepseek-v4-pro     82          $0.11 – $0.34           98 t/s    GPQA-D 84.1, cheapest in top tier
  glm-5.2             85          $0.19 – $0.55           329 t/s   GPQA-D 85.9, default workhorse
  claude-opus-4-8     93          $1.80 – $5.10           —         escalation only

pick: deepseek-v4-pro on fireworks   (cost basis: 22 similar science tasks, P50/P90)
data: registry 2026-07-01 · Artificial Analysis (runtime, 2026-07-03)
```

- `glam recommend --explain` dumps per-benchmark weights, raw scores, and provenance.
- `glam recommend --auto` (or config `router.autoPick: true`) executes with the pick;
  default is recommend-only, human confirms.
- Auto mode uses the same scorer inside the normal run path — one code path, two
  surfaces.

### D6. Per-task cost estimation (dollars for THIS task, as a range)

- **Unit of learning**: glamfire's own receipts ledger. For every completed run record
  `(domain, model, input-size bucket, tok_in, tok_cached, tok_out, steps, $)` in the
  context store.
- **Estimator**: per `(domain, size-bucket)` keep **P50/P90 token quantiles** (plus an
  EMA for drift) of input, cached-input, and output tokens; multiply by the target
  model's registry prices — including **cached-input price**, since input dominates
  agentic cost (arXiv 2604.22750). Cross-model transfer: token profiles are stored
  per-domain, with a per-model correction factor (models differ >1.5M tokens on
  identical tasks).
- **Cold start** (no history for a domain): plan-free heuristic — measured prompt
  tokens × step-count prior for the domain × the 8–15× context-growth multiplier ×
  1.5 safety factor; label the estimate "prior, no history". Never use model
  self-prediction as the estimate (≤0.39 correlation, systematic underestimate); at
  most use it as a coarse "this looks expensive" alert.
- **Always a range, never a point**: P50–P90, because same-task variance is up to 30×.
  After the run, print actual vs estimate in the receipt — the estimator improves with
  every task, and the honesty builds trust in auto mode.

---

## E. Legal / attribution constraints — summary flags

| Source | Machine access | License / terms | Can commit snapshot to repo? |
|---|---|---|---|
| Artificial Analysis | Data API (key; Free/Pro/Commercial) | **Attribution mandatory all tiers; redistribution needs commercial license** | **No** — runtime fetch per-user only |
| OpenRouter models API | Public JSON, no key | Public catalog endpoint; no stated attribution duty | Yes (keep `sourceUrl` provenance) |
| Epoch AI | CSV + `epochai` Python client | **CC-BY** (external slices Apache-2.0) | **Yes, with credit** — primary committed source |
| LMArena | HF datasets incl. `leaderboard-dataset` | Varies per dataset (Apache-2.0 / CC-BY-4.0 / custom) | Per-dataset check first |
| SWE-bench | `leaderboards.json` on GitHub | Open leaderboard repo | Yes |
| Terminal-Bench | tbench.ai + run-log repos; via Epoch | Apache-2.0 via Epoch | Yes (via Epoch) |
| LiveBench | HF datasets, monthly refresh | Open (per HF cards) | Yes |
| HELM | Public GCS bucket | Apache-2.0 framework; huge | Impractical as feed; one-off calibration |

---

## Key takeaways for glamfire

1. **Two-plane data design is forced by licensing**: Epoch AI (CC-BY) + OpenRouter
   pricing + SWE-bench/LiveBench become **committed, provenance-stamped snapshots**
   refreshed by a scheduled CI PR; Artificial Analysis — the richest per-category
   source (Coding/Agentic/Math indices + individual benchmarks + speed + price) — is
   **runtime-fetched with each user's own free key, cached with TTLs, attributed in
   output, never committed**. Redistribution of AA data without a commercial license
   is the one bright legal line in this design.
2. **An explicit, editable task→benchmark taxonomy is white space**: NotDiamond,
   Martian, and OpenRouter keep theirs learned or proprietary. A cited YAML mapping
   (~10 domains, LMArena's 23 occupational fields as validation) is transparent,
   user-tunable, and on-brand.
3. **The scorer slots into the existing cascade, not beside it**: hard filters →
   domain-weighted capability^α / estCost^β with the OpenRouter-compatible 0–10 knob
   → cheap-first execution with confidence escalation (brief 04 unchanged). Missing
   benchmark scores back off to AA Intelligence ×0.85 and are flagged, never hidden.
4. **Per-task cost must be a learned range, not a model guess**: self-prediction
   correlates ≤0.39 and underestimates; same-task variance hits 30×; **input (and
   cached-input) tokens dominate agent cost**. Quote P50–P90 dollars from glamfire's
   own receipts ledger per (domain, size-bucket), with an 8–15×-multiplier prior for
   cold start — and print actual-vs-estimate after every run so the estimator
   self-improves. Owning the receipts history is a structural moat no SaaS router has.
5. **Freshness is a feature**: prices decay in weeks (brief 25); every recommendation
   prints its oldest `asOf`, warns past 30 days, and `glam models refresh` is one
   command. RouterBench/RouterEval slices give a free offline regression gate so
   taxonomy/weight changes can't silently degrade picks.

---

## Sources

- Artificial Analysis Data API docs — https://artificialanalysis.ai/data-api/docs
- Artificial Analysis Data API overview — https://artificialanalysis.ai/data-api
- Artificial Analysis (indices, methodology) — https://artificialanalysis.ai/
- Artificial Analysis API reference — https://artificialanalysis.ai/api-reference
- OpenRouter list-models endpoint — https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter models overview — https://openrouter.ai/docs/guides/overview/models
- OpenRouter Auto Router docs — https://openrouter.ai/docs/guides/routing/routers/auto-router
- OpenRouter Auto Router FAQ — https://openrouter.zendesk.com/hc/en-us/articles/47463293706395-What-is-the-Auto-Router-and-how-does-it-choose-a-model
- Epoch AI — Use this data (licensing, CSV, Python client) — https://epoch.ai/benchmarks/use-this-data
- Epoch AI Benchmarking Hub — https://epoch.ai/benchmarks ; https://epoch.ai/blog/benchmarking-hub-update
- Epoch AI GPQA Diamond page — https://epoch.ai/benchmarks/gpqa-diamond
- LMArena leaderboard dataset — https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset
- LMArena occupational/expert categories — https://news.lmarena.ai/arena-expert/ ; https://news.lmarena.ai/arena-category/ ; https://news.lmarena.ai/leaderboard-changelog/
- LMArena preference datasets (licenses) — https://huggingface.co/datasets/lmarena-ai/arena-human-preference-55k ; https://huggingface.co/datasets/lmarena-ai/arena-human-preference-100k/blob/main/README.md
- HELM raw results download — https://crfm-helm.readthedocs.io/en/latest/downloading_raw_results/ ; https://github.com/stanford-crfm/helm
- SWE-bench leaderboard JSON — https://github.com/SWE-bench/swe-bench.github.io ; https://www.swebench.com/
- Terminal-Bench leaderboard — https://www.tbench.ai/leaderboard/terminal-bench/2.1 ; https://github.com/laude-institute/terminal-bench-leaderboard
- LiveBench — https://github.com/livebench/livebench ; https://huggingface.co/datasets/livebench/coding ; https://livebench.ai/livebench.pdf
- GPQA paper (domains) — https://arxiv.org/pdf/2311.12022 ; GPQA Diamond explainers — https://intuitionlabs.ai/articles/gpqa-diamond-ai-benchmark ; https://smartchunks.com/gpqa-diamond-score-explained-ai-benchmark-2026/
- Open LLM Leaderboard retirement — https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard/discussions/1135
- NotDiamond custom router training — https://docs.notdiamond.ai/docs/router-training-quickstart ; https://docs.notdiamond.ai/docs/routing-between-custom-models
- RouteLLM paper — https://arxiv.org/pdf/2406.18665
- Martian / routing landscape — https://www.everydev.ai/tools/martian ; https://www.augmentcode.com/tools/model-routing-platforms-ai-agent-systems
- RouterBench / RouterEval (via routing survey) — https://arxiv.org/pdf/2603.04445 ; https://arxiv.org/pdf/2509.07571
- "How Do AI Agents Spend Your Money?" (token prediction) — https://arxiv.org/abs/2604.22750 ; https://digitaleconomy.stanford.edu/publication/how-do-ai-agents-spend-your-money-analyzing-and-predicting-token-consumption-in-agentic-coding-tasks/
- LLM cost-estimation heuristics — https://llmgateway.io/blog/how-to-estimate-llm-token-costs
