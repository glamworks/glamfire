# 24 — Creator thesis update (late May – early July 2026)

**Purpose:** Refresh of what the harness-thesis creator is currently saying, based on
his ten most recent long-form videos (published roughly 2026-06-12 → 2026-07-03).
Standing repo rule: he is referred to only as "the creator" here; no names, no video
links. This updates and extends `03-harness-last-mile.md`, `04-model-routing.md`,
`05-context-ownership.md`, and `19-positioning-messaging.md`.

---

## Current thesis (with dates)

The creator's through-line has hardened from "the harness is the last mile" into a
sharper claim: **the intelligence wars are over; the context wars have begun.** The
next useful AI product "is not the one that wins a benchmark — it's the one that knows
where the work is, what it's allowed to see, and what it's allowed to do."

Dated beats from the last four weeks:

- **~2026-06-12 — "steer vs dispatch" agent literacy.** The Claude-Code-vs-Codex
  debate is the wrong question. Interfaces train habits: one harness teaches
  *steering* work up close (conversation, taste, ambiguity), the other teaches
  *dispatching* work (assignments, sandboxes, parallel queues, receipts). The skill of
  2026 is knowing when to steer, when to dispatch, and **what proof to demand before
  output leaves the machine**. "I don't trust the agent because it sounds confident. I
  trust the receipts."
- **~2026-06-16 → 2026-07-01 — the frontier became unreliable.** The strongest
  frontier model was released, then **forced offline by the US government for 18
  days**; the next flagship from the other major lab shipped only to
  government-approved partners. His conclusion: "the month where everyone assumed the
  model you build on will still be there tomorrow" is over. The companies that
  shrugged it off "were the ones who never tied their work to a single model in the
  first place — because they own the harness. They routed somewhere else and kept
  moving."
- **2026-06-22 — agent ownership.** Every useful agent needs an *owner*, a *job*, a
  *diet* (what context it reads), *boundaries* (read-only → draft-only → write, earned
  progressively), and a *review loop*. Teams need an **agent roster / registry with
  owner cards** — "the fastest way to make an AI agent dangerous is to let everyone
  use it and nobody own it." Maintenance is the 2026 skill (prompting was 2023,
  delegation 2025).
- **2026-06-23 — "the doing got cheap, the deciding did not."** Ten-trillion-parameter
  class models moved the bottleneck from model capability to **task imagination** —
  the ability to scope whole jobs (with a data pack, a written definition of done, and
  a review trail) instead of prompts. Frontier pricing (~$50/M output tokens) itself
  "begs you to ask bigger" — and pushes everything small to cheap models.
- **2026-06-26 — the handoff is the bottleneck.** He shipped the third piece of his
  own public harness stack: a **shared task queue both humans and agents read**
  (tickets with outcome, sources, owner, definition of done; claim-locks; explicit
  `needs-input` stops; receipts on completion), so work can move between agents from
  different vendors without a human as "the hallway between rooms." His stack is now
  explicitly three-layer: **memory you own → skills you own → an engine/queue that
  moves work**, all agent-agnostic and model-agnostic.
- **2026-06-28 — the definitive last-mile statement.** The leading open-weight model
  is "free, and often better than the frontier on center-of-distribution work," yet
  companies keep paying frontier prices because **switching models means replacing a
  whole work system, not a model call**: system prompts, tool-call handling, memory
  architecture all have to be re-tuned per model. "A model is a brain in a jar without
  a harness." The last mile is "literally a trillion-dollar last mile," and **the
  talent that can build harnesses and auto-routers is the scarcest resource in AI** —
  a "golden goose moment" for agencies and builders who can promise token savings
  while maintaining quality.
- **2026-06-29 — the context wars frame.** Apple (personal/phone context), the
  frontier labs (team context via a Slack-native team harness; file-shaped delegation
  surfaces) are all making the same move: get closest to the context that makes any
  model useful. The team-harness product he analyzed is "incredibly sticky —
  *exactly* the dangerous thing": once a vendor's model sits inside your Slack and
  accumulates your team's messy context, "no matter how cheap the open models get,
  how can you rip out the model that's that close to context?" Renting your company
  brain back from a frontier lab is the failure mode. The government slowdown on
  frontier releases gives open-weight models time to close the public gap, which puts
  all competitive pressure on the **context/utility layer**.
- **2026-07-01 — own the memory, rent the intelligence.** The build barrier for an
  owned memory/skills stack collapsed: agents can now build ~80% of it for you by
  conversation ("a fifth as technical as February"). The part you must keep: accounts,
  permissions, final approval. "Intelligence is not personal. Memory is personal. The
  company that holds the memory holds the part that makes the assistant feel
  personal. I would rather build that part myself."
- **2026-07-02 — routing as a human playbook.** Practical model-picker: route by the
  *job*, not the model name. Center-of-distribution (familiar shape, easy to review) →
  the cheap open-weight workhorse; messy/novel/judgment-heavy → frontier daily driver;
  specialists for images/video/live web. Five rules: don't copy others' stacks; ask
  how *hard* the work is, not how *much*; know how you'll tell if output is good;
  **model choice itself must not become work**; don't pick too many models.
- **2026-07-03 — the trust skeleton.** One reusable agent skeleton for high-trust
  paperwork: context pack → ingest → chunk → normalize → store (local SQLite) →
  retrieve → **cite** → export → **gate** (agent drafts and assembles; the human
  clicks submit). "Clean, normalized data is the secret: when dates are dates and
  every claim has an address, **you stop needing the most expensive model for most of
  the work**." Explicitly teased next episode: model routing.

## What changed since the original harness thesis

1. **From prediction to consensus.** In the original thesis the harness/last-mile idea
   was contrarian. Now he cites a wave of production migrations (below) and both
   frontier labs behaving as harness companies (one marketing its harness as usable
   *without* its own models; one shipping a team harness inside Slack). The thesis
   won; the fight moved to *who owns the harness and the context inside it*.
2. **A new forcing function: frontier fragility.** Government intervention (an 18-day
   forced outage of the top model; approved-partner-only releases; no defined release
   cadence anymore) turned model-agnosticism from a cost play into a **continuity /
   sovereignty requirement**. This is a brand-new argument that did not exist in the
   original thesis.
3. **Context lock-in named as the villain.** The sticky team harness inside chat
   surfaces reframes lock-in: not API contracts but *accumulated informal context*.
   "We taught companies for decades that data is alpha — and now we're handing it to
   a frontier model provider as context." The firm's brain "has never been on rent
   before."
4. **The harness decomposed into named, buildable layers.** Memory (owned, local,
   SQLite, wiki-linked), skills (portable methods), engine (shared queue with
   claim-locks and receipts), plus governance (owner cards, agent registry, gates).
   This is now a concrete reference architecture he demos, not a metaphor.
5. **Trust mechanics moved to the center.** Receipts, citations, draft-not-send
   gates, `needs-input` escalation, review loops, and progressive permissions are now
   presented as *the* adoption unlock for real (money-touching) work — more important
   than capability.
6. **Cost collapse quantified and normalized.** "Intelligence got 98% cheaper" is
   stated as settled fact; the interesting question is who can move their context to
   exploit it. Frontier is repositioned as the *escalation tier* ("not a daily
   driver — too expensive, overkill"), exactly inverting 2024-era defaults.

## DeepSeek + open-weight signals

- **DeepSeek is his canonical production-migration story.** A well-known agent
  company's CEO "very publicly wrote up his journey to a DeepSeek architecture away
  from Claude" — big savings, but he was honest that the team **had to rewrite their
  harness from scratch around DeepSeek**: prompts, memory handling, and tool calls do
  not lift-and-shift. Incentive matters: they migrated because tokens are their COGS.
- **Microsoft is "testing into a DeepSeek architecture"** (his phrasing) — the
  strongest enterprise legitimacy signal yet for open-weight backbones.
- **He expects the next open-weight leapfrog imminently**: "maybe a new DeepSeek, who
  knows" — and expects Fable-class capability to reach open-weight models "in 4–6
  months."
- **The migration wave is multi-model, and routing-shaped, not switching-shaped:**
  Cursor building on Kimi; Coinbase *increasing* token usage while *decreasing* cost
  via smart routing across GLM and Kimi; Shopify and Airbnb on Qwen-style routing.
  Companies don't pick one open model — they route across several.
- **Open-weight vendors now ship their own harnesses** (the GLM 5.2 team launched a
  Codex-style harness at release), because they've realized a bare model can't
  compete with a frontier product. He expects "much more harness work from the
  Chinese open-source labs in the next couple of months" — but also notes open-weight
  vendors lack the margin to fund armies of forward-deployed engineers, which is
  precisely the gap independent harness builders fill.
- **Capability framing:** the open workhorse is not "good enough" — it is "the best
  model in the world at center-of-distribution tasks," which "by definition is most
  of our work." Frontier models must "earn their keep" at the edge of the
  distribution.

## Concrete product implications for glamfire

1. **Ship the router as the hero feature, with a task-distribution profiler.** His
   repeated claim: "almost no one has asked what their distribution of tasks is."
   glamfire should measure it for them — classify each completed task
   (center-vs-edge, review cost), report per-task routing decisions, and show
   realized savings ("your last 100 tasks: 84 routed to GLM 5.2, $X saved, N
   escalations"). This is the exact artifact leaders lack. (Extends `04`, `09`.)
2. **Make model switching a lift-and-shift, not a rewrite.** The #1 stated blocker to
   open-weight adoption is that prompts/tool-calls/memory must be re-tuned per model.
   glamfire's adapter conformance suite *is* the productization of that pain: one
   work system, per-model adapters that absorb tool-call/system-prompt/memory
   differences, so a migration is a config change. Advertise the Lindy-style rewrite
   as the thing glamfire deletes. (Extends `03`, `08`, `23`.)
3. **Receipts, citations, and gates as first-class primitives.** Every glamfire task
   should end with a machine-written receipt (sources used, files touched, what
   changed, what still needs approval, where it stopped and why), and high-impact
   actions (send/submit/pay/merge) must sit behind a human gate with progressive,
   earned permissions (read-only → draft-only → write). This is his stated trust
   unlock for real work — and it doubles as the escalation trigger for routing
   (low-confidence receipt → frontier re-run). (Extends `21`.)
4. **A shared, inspectable work queue for agent/human handoffs.** His engine layer —
   tickets with outcome/sources/definition-of-done, claim-locks, `needs-input` stops,
   visible status transitions — is the missing coordination surface between agents of
   different vendors. glamfire should either implement this queue natively or
   integrate with Linear/Jira-style queues so glamfire agents can pick up, hand off,
   and leave receipts. "Can the work leave your chat?" is the test. (Extends `06`.)
5. **Agent registry with owner cards.** Every configured glamfire agent/loop should
   carry: name, owner, job (one sentence), diet (context sources), permissions,
   review cadence, known failure modes — queryable from the CLI and exportable to the
   team. Unowned agents are flagged. This maps directly to his "roster" and makes
   glamfire the governance answer, not just the runtime. (New; touches `06`, `21`.)
6. **Owned memory as the moat-breaker.** Local-first memory (SQLite + wiki-style
   links), skills, and context packs that travel across models are his explicit
   counter to team-harness context lock-in. glamfire's context store should be
   trivially exportable/inspectable ("open the folder yourself; nothing leaves your
   machine") and should offer a *conversational bootstrap*: glamfire builds ~80% of
   the user's memory/skills setup by interview, since "the build barrier dropped" is
   what finally made owned stacks mainstream. (Extends `05`.)
7. **Normalize-then-route as a cost architecture.** His observed pattern: clean,
   normalized, cited context lets cheap models do work that raw mess required
   frontier models for. glamfire pipelines should invest tokens in
   ingest/normalize/cite steps (cheap model) precisely so the doing can stay on the
   cheap model — routing quality is downstream of context hygiene. (Extends `04`,
   `05`.)
8. **Frontier-outage resilience as a tested feature.** After the 18-day forced outage
   of the top frontier model, "the model you build on might not be there tomorrow" is
   a live enterprise fear. glamfire should smoke-test the failover path (primary
   provider down → route to second provider/model per `23`) and surface it in the
   product ("provider outage detected, rerouted N tasks"). Continuity is now a
   selling point on par with cost.

## Messaging / positioning implications

- **Adopt "the context wars" frame; name the villain as rented context.** The
  strongest emotional line in his current run: sticky vendor team-harnesses mean
  "renting your company brain back from a frontier lab" — "the firm has never faced a
  moment where the firm's brain has been on rent." glamfire's counter-position writes
  itself: *your harness, your context, any model.* "Own the memory, rent the
  intelligence" is the sentiment to echo (in our own words). (Extends `19`.)
- **Sell continuity, not just cost.** New since the original thesis: bans, restricted
  releases, and no frontier release cadence. Message: with glamfire, no single
  model's outage, ban, or price change can stall your work — the companies that
  shrugged off the frontier outage were the ones that owned their harness and routed
  around it.
- **Lead with the migration wave as social proof.** Lindy→DeepSeek (harness rewritten
  from scratch), Microsoft testing DeepSeek, Cursor on Kimi, Coinbase routing
  GLM+Kimi, Shopify/Airbnb on Qwen: the market is already routing to open weights —
  glamfire is the missing tool that makes that move safe for everyone who can't hire
  scarce harness talent. "The last mile is a trillion-dollar problem and the talent
  to build it is the scarcest resource in AI" — glamfire packages that talent as
  software.
- **Frame the workhorse honestly and confidently.** Not "GLM is good enough" but "the
  best model in the world at the center of the distribution — which is most work";
  frontier models must *earn* escalation. And repeat his adoption rule as a product
  promise: **model choice itself must never become work** — glamfire decides, shows
  receipts, and lets you overrule.
- **Trust language: receipts over confidence.** Adopt "don't trust the agent, trust
  the receipts" energy across docs and demos: every demo ends with the receipt, the
  citation map, and the human gate. Demos that stop at the gate (draft, don't send)
  read as *more* credible to this audience, not less.

## Key takeaways for glamfire

- The creator's thesis has escalated in glamfire's favor: harness > model is now
  consensus; the new battleground is **context ownership + routing + trust
  mechanics**, which is exactly glamfire's spec.
- DeepSeek's role: proof that open-weight migration works *and* that it costs a
  full harness rewrite without a tool like glamfire; Microsoft's testing and the
  expected "next DeepSeek" mean the router must stay genuinely multi-model (`23`).
- Highest-leverage build order implied by his content: task receipts + gates,
  task-distribution profiling with visible savings, adapter lift-and-shift,
  exportable local memory, agent owner cards, provider-failover smoke tests.
- Positioning: *the context wars have begun — glamfire is how you fight them without
  renting your brain back.* Continuity + cost + ownership, proven with receipts.
