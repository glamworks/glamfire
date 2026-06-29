# 18 — OSS Community Building for glamfire

> The product is a harness companies are meant to **own**. That makes community the moat:
> the more contributors, integrations, and shared context-engineering knowledge accrue
> around glamfire, the more "owning your last mile" becomes the obvious default. Community
> is also the proof that the project isn't a single-vendor trap in disguise.

---

## 1. Where the community lives: Discord vs GitHub Discussions vs Discourse

There is no single winner — the right answer is usually **both GitHub Discussions (system of
record) + Discord (real-time pulse)**, with clear roles for each.

**GitHub Discussions**
- **Strengths:** asynchronous (works across time zones), **searchable**, permanently
  documented, and **directly linked to code, issues, and PRs** so context survives. Zero
  cost. Best when participants are developer-like contributors.
- **Weakness:** feels "official/formal." People worry about "spamming" with a dumb question
  or an unpolished feature idea, so they self-censor.

**Discord**
- **Strengths:** low-friction, casual, real-time. People freely report "my install failed"
  and pitch half-baked ideas in `#ideas` they'd never open a Discussion for. Great for
  momentum, support, and belonging. (Discord even curates an OSS-communities list.)
- **Weaknesses:** ephemeral and **not searchable/indexable** — knowledge evaporates; answers
  get re-asked; nothing is linked to the code. High moderation load.

**Discourse (forum)** — a third option: searchable + SEO-indexed like Discussions but with
richer forum UX; costs money to host (or use their free OSS-hosting program). Consider later
if Discussions outgrows itself.

**Recommended setup for glamfire**
- **GitHub Discussions = canonical** for Q&A, RFCs, "show and tell," announcements, and
  anything worth finding again. It's free, where your contributors already are, and feeds
  LLM-SEO (indexed, citable).
- **Discord = the heartbeat** for real-time help, `#ideas`, contributor coordination, office
  hours, and community feeling.
- **Bridge the two:** a norm/bot that nudges durable answers from Discord into a Discussion,
  so the searchable record stays the source of truth. Don't let support knowledge die in chat.

Sources: GitHub community discussions on Discord-vs-Discussions, Duck Alignment Academy
(Discussions vs Discourse), dev.to (Why Discord for OSS), PingCAP (all-in on Discussions),
medusajs discussion, discord/discord-open-source.

---

## 2. The contributor funnel (drive-by → repeat → maintainer)

Think of it as a leaky funnel; each stage needs a deliberate on-ramp.

```
Visitor → User → First-time contributor → Repeat contributor → Maintainer / core team
```

**Stage 1 — Visitor → User**
- Frictionless quickstart (one command to value), great README, demo (see file 17).
- A `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and a clear "how to get help" pointer.

**Stage 2 — User → first contribution (the hardest leak)**
- Maintain a **`good first issue`** + **`help wanted`** label set that's genuinely curated:
  small, well-scoped, with context, acceptance criteria, and pointers to the relevant files.
  These labels are what surfaces issues on aggregators like **goodfirstissue.dev** and
  **firsttimersonly.com**.
- Add the **`first-timers-only`** label on a few ultra-hand-held issues — it explicitly
  signals first timers are *welcome and valued*, and lowers the courage barrier.
- Reduce friction: a working dev-container/Makefile, fast CI, a "your first PR" walkthrough.
- **Respond fast.** A first PR that sits for a week kills the contributor. Speed of first
  response is the highest-leverage retention lever at this stage.

**Stage 3 — first → repeat contributor**
- Thank + review with care, then **immediately suggest a logical next issue** ("if you liked
  that, #123 is related"). Continuity is what converts one-time to repeat.
- Give increasing autonomy: triage rights, then review rights, on demonstrated merit.

**Stage 4 — repeat → maintainer / core team**
- Under a **meritocracy**, active contributors earn a formal decision-making role (commonly
  by consensus/voting). Form a **core team**, or **subcommittees** owning issue areas, once
  contribution is active enough to warrant it.
- Make the path *written and visible* — see governance below.

Sources: opensource.guide (leadership & governance), goodfirstissue.dev, firsttimersonly.com,
GitHub Docs (contributing), CNCF contributors (roadmaps → contributions).

---

## 3. Recognition (the cheapest, highest-ROI retention tool)

- **Define contributor roles explicitly** and what each unlocks (contributor → triager →
  reviewer → maintainer). Ambiguity demotivates; a visible ladder motivates.
- **All-contributors / public credit:** a contributors section in the README, release notes
  that name who landed what, shout-outs in Discord/Discussions and on X.
- **Acknowledge non-code contributions** — docs, triage, answering questions, demos, content.
  "Contributor" should explicitly include these, not just merged PRs.
- **Celebrate milestones** publicly (first PR merged, 10th PR, first time reviewing someone
  else's PR). Recognition is free and compounds belonging.

Sources: opensource.guide (roles/recognition), firsttimersonly.com.

---

## 4. Governance & transparency (the "this isn't a single-vendor trap" signal)

Because glamfire's whole pitch is **ownership and escape from lock-in**, governance
transparency is not bureaucracy — it's **product-market messaging made credible.** A harness
you "own" can't be governed like a closed vendor's roadmap.

- **Publish a `GOVERNANCE.md`:** who decides, how decisions are made (BDFL vs meritocracy vs
  consensus), how someone joins the core team, how disputes resolve. Pick a model and write
  it down. (Open Source Guides catalogs the common models.)
- **Public, prioritized roadmap** (GitHub Projects board, made public): shows what shipped,
  what's in progress, what's planned. Transparently sharing the roadmap **builds trust and
  attracts contributors** by exposing where help is welcome.
- **Co-create the roadmap** with the community (interviews, feedback sessions, voting on
  Discussions). When a roadmap item links to the original request with N votes, every voter
  feels heard.
- **Close the loop with a changelog:** when an item ships, announce it and notify everyone
  who voted/commented. A roadmap without a changelog has a gap at the end.
- **Levels of transparency** (per opensource.com): decisions, finances (if any sponsorship),
  roadmap, meeting notes — be deliberate about which you open. More open = more trust, within
  reason.

Sources: opensource.guide (leadership & governance), CNCF contributors (roadmaps),
contribute.cncf.io, opensource.com (5 levels of transparency), public-roadmap tooling guides.

---

## 5. RFC process (how big changes get decided in the open)

A lightweight **RFC (Request for Comments)** process scales decision-making past the founder
and signals that direction is set in public, not behind closed doors.

**A minimal RFC flow that fits glamfire**
1. **Open an RFC** as a GitHub Discussion (category: `RFC`) or a PR to a `/rfcs` folder, using
   a template: *motivation, design, alternatives considered, drawbacks, unresolved questions.*
2. **Comment period** (e.g. 1–2 weeks) — community + maintainers debate in the open.
3. **Decision** by the agreed governance model (maintainer consensus / core-team vote),
   recorded with rationale in the thread.
4. **Accepted RFCs** become tracked work on the public roadmap; rejected ones stay archived
   as the documented "why not."

This keeps the *narrative* (own your harness, model-agnostic, no lock-in) coherent across
contributions — a written design record is the spine that proof points hang off of.

**Note for 2026:** with AI contributors now common, adopt a clear **AI-contribution policy**
early. Emerging norm/RFC: an *Artificial Contributor MUST disclose its involvement* (PR
description or commit trailer). Several orgs (SymPy, LLVM, matplotlib, OpenInfra, ASF, Linux
Foundation) already publish such policies — borrow from them. For an *AI harness* project,
having a thoughtful AI-contribution stance is also on-brand.

Sources: opensource.guide, nesbitt.io RFC on artificial contributors, arxiv "Regulating the
Machine Contributor."

---

## 6. Office hours & live presence

- **Recurring office hours** (e.g. a weekly Discord voice/stream, or a monthly community
  call) give contributors a predictable, human touchpoint, unblock PRs live, and surface
  roadmap input. Post notes back into Discussions afterward (searchable record).
- **Pair-on-a-good-first-issue** sessions convert lurkers into contributors faster than any
  doc. Stream/record them as reusable onboarding content (doubles as marketing — see file 17).
- Keep cadence sustainable; a reliable monthly beats an enthusiastic-then-abandoned weekly.

Sources: opensource.guide, CNCF contributors growth practices.

---

## 7. "Current reality" honesty as a trust signal

The strongest differentiator a small OSS project has against polished frontier-lab marketing
is **radical honesty about its current state** — and devs reward it.

- **A "Current reality / Project status" section** in the README: what works today, what's
  alpha, what's missing, what you're *not* going to do. Mirrors the "one honest limitation"
  rule that wins HN threads (file 16).
- **Transparency about delays builds more trust than silence.** Slipping a roadmap date and
  saying so beats quietly missing it.
- This honesty *is the brand*: a project telling you to stop trusting frontier-lab hype and
  own your stack cannot itself be hypey. Under-promise, show receipts, over-deliver.
- It also de-risks adoption: enterprises evaluating "do we bet our last mile on this?" trust a
  maintainer who names the rough edges far more than one who claims none.

Sources: quackback (delays > silence), opensource.com (transparency levels), markepear/HN
launch guidance on honest limitations (file 16).

---

## Key takeaways for glamfire

- **Run both: GitHub Discussions as the searchable system of record + Discord as the real-time
  heartbeat** — and bridge durable Discord answers back into Discussions so knowledge persists
  (and stays LLM-SEO-indexable).
- **The biggest funnel leak is the first contribution** — curate real `good first issue` /
  `first-timers-only` work, remove setup friction, and respond *fast*; then always hand a
  repeat contributor their logical next issue.
- **Recognition is free and high-ROI** — visible role ladder, named credit in releases,
  celebrate non-code contributions.
- **Governance transparency is product messaging, not bureaucracy** — a public `GOVERNANCE.md`,
  public co-created roadmap, and a changelog that closes the loop *prove* glamfire isn't a
  single-vendor trap, which is the entire thesis.
- **A lightweight public RFC process** keeps the "own your harness" narrative coherent as the
  project scales past the founder; adopt an AI-contributor disclosure policy early (on-brand).
- **"Current reality" honesty is the trust moat** — name what's alpha and what's missing; a
  project preaching "stop trusting lab hype" must be conspicuously un-hypey itself.

---

## Sources

- Discord vs GitHub Discussions (GitHub community) — https://github.com/orgs/community/discussions/176166
- GitHub Discussions vs Discourse — https://duckalignment.academy/github-discussions-versus-discourse/
- Why Discord is a must-have for OSS (dev.to) — https://dev.to/appwrite/why-discord-is-a-must-have-for-oss-2jpj
- GitHub Discussions bringing community together (PingCAP) — https://www.pingcap.com/blog/github-discussions-bringing-the-open-source-community-closer-together-and-all-in-github/
- Why both Discussions and Discord (Medusa) — https://github.com/medusajs/medusa/discussions/4234
- discord/discord-open-source — https://github.com/discord/discord-open-source
- Leadership and Governance (Open Source Guides) — https://opensource.guide/leadership-and-governance/
- How to Contribute (Open Source Guides) — https://opensource.guide/how-to-contribute/
- Good First Issue — https://goodfirstissue.dev/
- First Timers Only — https://www.firsttimersonly.com/
- Contributing to open source (GitHub Docs) — https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-open-source
- Open source roadmaps for contributions (CNCF) — https://contribute.cncf.io/projects/best-practices/community/contributor-growth/open-source-roadmaps/
- 5 levels of transparency for OSS communities (opensource.com) — https://opensource.com/article/22/2/transparency-open-source-communities
- Best public roadmap tools (Quackback) — https://quackback.io/blog/best-public-roadmap-tools
- RFC: Artificial Contributors to Open Source (Nesbitt) — https://nesbitt.io/2026/05/21/rfc-artificial-contributors-to-open-source.html
- Regulating the Machine Contributor (arXiv) — https://arxiv.org/html/2606.14594v1
- Contributor guidelines template (opensource.com) — https://opensource.com/life/16/3/contributor-guidelines-template-and-tips
