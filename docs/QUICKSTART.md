# Quickstart

Zero to a routed, budgeted, metered agent run — about five minutes. This guide walks
the [five things to do with glamfire this week](../README.md#five-things-to-do-with-it-this-week)
from the README, end to end, with real output.

> **Honesty note.** Every output block below was captured from a real session at
> **v0.4.1** — the real CLI, and real GLM 5.2 calls on Fireworks where a key is used.
> Long file paths are elided (`…`) and the model landscape notes are truncated for
> readability; nothing is invented. Prices and step counts will drift with versions —
> the shape won't.

## 1. Install

One line, any platform:

```bash
# npm (any Node >= 22) — provides the `glam` command
npm install -g glamfire

# macOS / Linux — Homebrew
brew install glamworks/tap/glamfire

# Windows — Scoop
scoop bucket add glamworks https://github.com/glamworks/scoop-bucket && scoop install glamfire
```

(Windows `winget install Glamworks.Glamfire` is submitted and goes live when
Microsoft's community review merges it; single-file binaries for every OS/arch are on
each [GitHub Release](https://github.com/glamworks/glamfire/releases); or run from
source — see the [README install section](../README.md#install).)

Verify:

```console
$ glam --version
0.4.1
```

## 2. Check your environment: `glam doctor`

```console
$ glam doctor
glamfire 0.4.1  ·  the open harness for the last mile of AI

  ✓ Node.js 22.21.1
  ✗ FIREWORKS_API_KEY  — needed to call GLM 5.2 on Fireworks (the default model)
      fix: export FIREWORKS_API_KEY="<your key>"   # create one: https://app.fireworks.ai/settings/users/api-keys
  ✓ config: built-in defaults (no ~/.glam/config.toml or ./glam.toml)
  ✓ glamfire install: v0.4.1 (…/node_modules/glamfire/package.json)

Not ready — apply the fixes above, then re-run `glam doctor`.
```

It exits non-zero until the environment is complete, and every ✗ comes with a
copy-paste fix. Note what does **not** need a key: `glam route`, `glam models`, and
`glam usage` all work fully offline — you can try most of this guide before spending
a cent.

## 3. Get a key

Sign in at [fireworks.ai](https://fireworks.ai), create an API key
([app.fireworks.ai/settings/users/api-keys](https://app.fireworks.ai/settings/users/api-keys)),
and export it:

```bash
export FIREWORKS_API_KEY="<your key>"
```

glamfire never stores secrets inline. Config files only ever hold a *reference* to
where the key lives (an env var or your OS keychain), never the value; `glam config`
prints the fully resolved config with every secret redacted. The default model is
already GLM 5.2 on Fireworks, so no config file is needed — but to make it explicit,
drop this in `~/.glam/config.toml` (or a per-project `./glam.toml`):

```toml
model = "accounts/fireworks/models/glm-5p2"

[providers.fireworks]
# references only — never paste the key here
credential = { env = "FIREWORKS_API_KEY" }
```

Re-run the doctor:

```console
$ glam doctor
glamfire 0.4.1  ·  the open harness for the last mile of AI

  ✓ Node.js 22.21.1
  ✓ FIREWORKS_API_KEY
  ✓ config: built-in defaults (no ~/.glam/config.toml or ./glam.toml)
  ✓ glamfire install: v0.4.1 (…/node_modules/glamfire/package.json)

Ready.
```

Now the five things to do with it this week.

---

## Thing 1 — Route routine work at open-model prices

Send the routine center of your workload — changelogs, dep bumps, repo explanations,
first-pass docs — through `glam run` at open-model prices, and keep your frontier
subscription for the tasks that deserve it.

Before any money moves, ask the router what it *would* do. `glam route` is a dry run —
offline, no key, no provider call:

```console
$ glam route "read this repo and write a CHANGELOG.md from the git history"
glamfire 0.4.1 · route (dry-run, no provider call)
  task: read this repo and write a CHANGELOG.md from the git history

route decision
  distribution: center   score: 0.173   confidence: 0.574   (threshold 0.5)
  chosen model: accounts/fireworks/models/glm-5p2   projected: $0.002941   frontier baseline: $0.002941
  why: rule #0 matched (center, confidence 0.57); chose cheapest of 1 eligible candidate(s): accounts/fireworks/models/glm-5p2
  signals:
    - length     edge=0.00 w=1.0  (60 prompt chars)
    - code       edge=0.42 w=0.3  (no code markers)
    - novelty    edge=0.50 w=0.3  (no routine/complex keywords)

distribution report
  decisions:   1  (center 1 / 100%, edge 0 / 0%)
  escalations: 0
  cost (projected):     $0.002941
  always-frontier:    $0.002941
  saved by routing:   $0.0000  (0.0%)
```

Center-of-distribution work goes to the cheap workhorse. (With only the default
GLM rule configured, "saved by routing" is $0 — Thing 5 below adds a rule and the
savings get real.) Now make an actual call:

```console
$ glam run "Compute (2 + 3) * 4 using the calculator tool." --max-usd 0.05
glamfire 0.4.1 · run
  adapter: fireworks-glm   model: accounts/fireworks/models/glm-5p2
  routing: center (score 0.17, confidence 0.57) → accounts/fireworks/models/glm-5p2
  effort: high   tier: standard   budget: $0.0500 / 8 steps

  → calculator({"expression":"(2 + 3) * 4"})  [allow]
  ← calculator ok
(2 + 3) * 4 = **20**

──
tokens: in 3810 (cached 1884) · out 34 (3844 total)   cost: $0.003110   steps: 7   status: done
recorded to ~/.glam/usage.jsonl — see `glam usage`
```

That's the whole loop in one screen: the routing decision in the header, a real tool
dispatch through the permission gate (`[allow]`), streamed output, and an exact cost
line — a third of a cent. Add `--explain` for the router's full reasoning inline.
`glam run` has the same tools a coding agent needs — read/write/edit files, glob,
grep, read-only git — so "write a CHANGELOG.md from the git history" works exactly
like it reads (glamfire's own [CHANGELOG](../CHANGELOG.md) was written that way;
the run cost about a cent). Writes ask before touching disk; `run_command` is
deny-by-default and opt-in via `--allow-exec`.

## Thing 2 — Put a real ceiling on an agent

`--max-usd` is a hard stop, not a warning. The engine checks spend every turn and caps
each turn's output tokens by the remaining budget:

```console
$ glam run "Explain the history of the transistor in detail." --max-usd 0.001
glamfire 0.4.1 · run
  adapter: fireworks-glm   model: accounts/fireworks/models/glm-5p2
  routing: center (score 0.17, confidence 0.57) → accounts/fireworks/models/glm-5p2
  effort: high   tier: standard   budget: $0.001000 / 8 steps

The transistor is one of the most important inventions of the 20th century, the
foundational building block of all modern electronics. […]

──
stopped: budget/step ceiling reached
tokens: in 1880 (cached 0) · out 227 (2107 total)   cost: $0.003631   steps: 3   status: budget_exhausted
recorded to ~/.glam/usage.jsonl — see `glam usage`
```

The run stops mid-task and reports `budget_exhausted`, never a fake `done`. The cost
line is the honest spend actually incurred — with a ceiling this tiny it can overshoot
by the final turn's input tokens (the check is per-turn), and glamfire reports that
number rather than pretending the ceiling was free.

Ctrl-C is just as honest — it aborts the in-flight request (real `AbortSignal` down to
the provider fetch), records the run, and exits 130:

```console
$ glam run "Write a long essay about rivers." --max-usd 0.05
…
# Rivers: The Arteries of Earth
[… streaming, then Ctrl-C pressed …]
interrupted — stopping (Ctrl-C again to force quit)

──
stopped: interrupted by Ctrl-C
cost below covers completed turns; a turn cancelled mid-flight may still bill the provider a few tokens.
tokens: in 0 (cached 0) · out 0 (0 total)   cost: $0.000000   steps: 2   status: interrupted
recorded to ~/.glam/usage.jsonl — see `glam usage`
```

## Thing 3 — Meter yourself (and your team)

Every real run appends one record to `~/.glam/usage.jsonl` — append-only JSONL you
own: portable, greppable, its own export format. `glam usage` reads it offline, no
key:

```console
$ glam usage
glamfire 0.4.1 · usage
  ledger: ~/.glam/usage.jsonl

totals  runs: 7   tokens: in 36,133 (cached 19,118) · out 2,321   cost: $0.0335   escalations: 0

by day
              runs      tokens        cost
  2026-07-03     7      38,454     $0.0335

by model
                                               runs      tokens        cost
  accounts/fireworks/models/glm-5p2               6      34,257     $0.0332
  accounts/fireworks/models/deepseek-v4-flash     1       4,197   $0.000372

by provider
             runs      tokens        cost
  fireworks     7      38,454     $0.0335

no monthly budget set — add [usage] monthlyBudgetUsd to glam.toml for alerts
```

Seven runs — including everything above — for three cents. `--since 7d` filters,
`--json` emits the same numbers structured. For a soft monthly budget (warning, not
blocking — hard per-run ceilings stay on `--max-usd` / `[run.budget]`), add to
`glam.toml`:

```toml
[usage]
monthlyBudgetUsd = 25.0   # soft monthly spend budget in USD (opt-in)
warnAtPct = 80            # warn when month-to-date spend crosses this %
```

`glam run` then warns when month-to-date spend crosses the threshold, and `glam usage`
renders a budget bar.

## Thing 4 — Read the market in one command

`glam models` is the evergreen landscape of top open-weight models across respected
US-hosted providers — offline, from a built-in catalog where every price carries its
verification date and source URL:

```console
$ glam models --sort price
glamfire 0.4.1 · model landscape (built-in catalog; USD per 1M tokens)

MODEL               PROVIDER   $IN/1M  $OUT/1M  QUANT    CTX    CAPS                          AS-OF
deepseek-v4-flash   fireworks  $0.14   $0.28    FP8      1024K  tools,json,long               2026-07-03
qwen3-coder-next    together   $0.11   $0.80    FP8      262K   tools,par,json,str,seed,long  2026-07-03
minimax-m3          fireworks  $0.30   $1.20    FP8      1024K  tools,json,vis,long           2026-07-03
kimi-k2.6           deepinfra  $0.75   $3.50    FP4      256K   tools,json,long               2026-07-03
kimi-k2.7-code      fireworks  $0.95   $4.00    FP8      256K   tools,json,long               2026-07-03
deepseek-v4-pro     fireworks  $1.74   $3.48    FP8      1024K  tools,json,str,long           2026-07-03
deepseek-v4-pro     together   $1.74   $3.48    FP4/FP8  512K   tools,json,str,long           2026-07-03
glm-5.2             fireworks  $1.40   $4.40    FP8      1024K  tools,par,json,str,seed,long  2026-07-03
glm-5.2             together   $1.40   $4.40    FP4      256K   tools,par,json,str,seed,long  2026-07-03
claude-haiku-4-5    anthropic  $1.00   $5.00    native   200K   tools,par,json,vis,str,long   2026-07-03
claude-sonnet-4-6   anthropic  $3.00   $15.00   native   1000K  tools,par,json,vis,str,long   2026-07-03
claude-opus-4-8     anthropic  $5.00   $25.00   native   1000K  tools,par,json,vis,str,long   2026-07-03
mistral-large-2512  mistral    —       —        FP8      256K   tools,json,vis,long           2026-07-03

notes
  deepseek-v4-flash @ fireworks: Budget tier — adapter wired and live-verified (real cache-hit run at $0.028/1M cached). […]
  glm-5.2 @ fireworks: DEFAULT WORKHORSE (and the most expensive open model here). 753B MoE; #1 open model on AA Intelligence Index. […]
  glm-5.2 @ together: Failover route for the default workhorse […] CAVEAT: served at FP4 — a real quantization downgrade vs the Fireworks FP8 baseline […]
  [… one honesty note per row — quantization caveats, dedicated-endpoint pricing, unpublished prices shown as —, never guessed …]
```

Filter with `--capable vision`, get JSON with `--json`. `glam models --refresh` pulls
**current** data from provider model APIs and reports every price movement explicitly
(`↓ was $X now $Y since <asOf>`). It needs a provider key and degrades honestly:
Together's prices are machine-readable; Fireworks exposes availability but publishes
no machine-readable prices — the command *says so* instead of faking freshness, and
with no key at all it exits 1 with "nothing could be refreshed" rather than
pretending.

The router prices from this same catalog — the landscape you read and the cost
decisions `glam route`/`glam run` make can never drift apart.

## Thing 5 — Fire-drill your continuity

2026 already showed that frontier access can vanish for weeks. The teams that shrugged
owned their routing. Prove to yourself the same task completes on a different model:
add this rule to `./glam.toml` (it ships commented-out in
[`glam.example.toml`](../glam.example.toml)) — put it **above** the plain GLM center
rule so it matches first:

```toml
[[routing.rules]]
distribution = "center"
requires = ["tool_calling", "long_context"]
candidates = [
  "accounts/fireworks/models/deepseek-v4-flash",
  "accounts/fireworks/models/glm-5p2",
  "accounts/fireworks/models/deepseek-v4-pro",
]
```

Candidates are ordered cheapest-first; the router filters by capability and budget and
picks the cheapest survivor. Watch the decision change — still offline, still no key:

```console
$ glam route "Summarize this paragraph in one sentence."
glamfire 0.4.1 · route (dry-run, no provider call)
  task: Summarize this paragraph in one sentence.

route decision
  distribution: center   score: 0.047   confidence: 0.789   (threshold 0.5)
  chosen model: accounts/fireworks/models/deepseek-v4-flash   projected: $0.000198   frontier baseline: $0.002935
  why: rule #0 matched (center, confidence 0.79); chose cheapest of 3 eligible candidate(s): accounts/fireworks/models/deepseek-v4-flash
  signals:
    - length     edge=0.00 w=1.0  (41 prompt chars)
    - code       edge=0.42 w=0.3  (no code markers)
    - novelty    edge=0.00 w=1.4  (1 routine / 0 complex keyword(s))
  cascade: accounts/fireworks/models/deepseek-v4-flash -> accounts/fireworks/models/deepseek-v4-pro -> accounts/fireworks/models/glm-5p2

distribution report
  decisions:   1  (center 1 / 100%, edge 0 / 0%)
  escalations: 0
  cost (projected):     $0.000198
  always-frontier:    $0.002935
  saved by routing:   $0.002738  (93.3%)
```

One TOML block: DeepSeek-V4-Flash — the cheapest capable 1M-context model on the
market — now takes center work at **93% below** the frontier baseline, with a real
escalation cascade behind it (the router runs the cheap model, verifies, and escalates
up the chain on failure). Both DeepSeeks ride your existing Fireworks key; no new
account. For a second *provider* (a true outage drill), uncomment the
`[providers.together]` block in `glam.example.toml` and add its models as candidates —
switching families is conformance-tested, not vibes.

---

## Where next

- [`glam.example.toml`](../glam.example.toml) — the full annotated config surface:
  providers, routing rules, permissions, sandbox, budgets.
- `glam help`, `glam <command> --help` — every command documents itself.
- [README → Current reality](../README.md#current-reality) — exactly what works
  today, what's one step from done, and what's still specified. No vaporware.
- [SPEC.md](../SPEC.md) — the full contract; [ARCHITECTURE.md](ARCHITECTURE.md) —
  the map; [DOGFOODING.md](DOGFOODING.md) — glamfire building glamfire.
