# 17 — No-Budget Multimedia Marketing Assets for glamfire

> Goal: every asset below is **free, scriptable, and version-controllable** (lives in the
> repo, regenerates in CI). The thesis to dramatize throughout: *cheap open intelligence is
> here, but the harness is the hard part — own your harness, don't rent your brain back.*

Priority order (what actually moves stars): **(1) animated terminal demo → (2) README hero +
quickstart → (3) X launch thread → (4) architecture diagram → (5) OG social card → (6)
short-form video → (7) podcast angle.**

---

## 1. README hero / banner (the 5-second pitch)

The top of the README is your storefront — most launch traffic decides in seconds.

**What to include, above the fold**
- A **hero image/banner** with the name, one-line value prop, and a visual motif (the
  "own your harness" idea). Keep it legible as a thumbnail (GitHub Trending shows it small).
- **Badges** (license, CI, release, stars, Discord) — but only a tidy row, not a wall.
- **One sentence** that states what glamfire is and who it's for, no superlatives.
- An **animated demo GIF** (see §2) immediately after.
- A **copy-paste quickstart** (one command to first value).

**Free, scriptable tools**
- **Banner generators (free/OSS):** `banners.beyondco.de` (social/banner images for
  packages), `sdras/hero-generator`, the GitHub `banner-generator` topic, SleekPixel/
  GitHubCard for quick visual cards.
- **Hand-rolled & versioned:** an SVG/HTML template rendered to PNG headlessly (Playwright/
  Puppeteer screenshot, or `satori`/`@vercel/og` for HTML→PNG). Lives in repo, regen in CI.
- Keep the source file in-repo (`/.github/assets/` or `/docs/assets/`) so the banner is
  reproducible, not a one-off Figma export nobody can edit.

Sources: banners.beyondco.de, github.com/topics/banner-generator, sdras/hero-generator.

---

## 2. Animated terminal demos (the single highest-converting asset)

For a CLI/harness, a short looping demo of *real output* outperforms any screenshot. Use a
**scripted** recorder so the demo is reproducible, editable, and CI-regenerable — not a
fragile hand-recorded take.

**Tool choice**
- **VHS (Charmbracelet)** — *recommended default.* You write a `.tape` script of `Type`,
  `Enter`, `Sleep`, `Set` directives; VHS renders to **GIF, MP4, and WebM**. Reproducible,
  version-controlled, CI-friendly, and produces noticeably cleaner GIFs. You can `vhs record`
  to bootstrap a tape, then hand-edit timing/commands in any text editor.
- **asciinema** — records real terminal sessions to lightweight `asciicast` v2 JSON; great
  for an *embeddable, copy-pasteable* player on a docs page (text, not pixels).
- **agg** — converts asciinema `asciicast` files to animated GIF (the asciinema→GIF bridge).
- See **`orangekame3/awesome-terminal-recorder`** for the full landscape (termtosvg, t-rec,
  autocast, etc.).

**Recommended pipeline for glamfire**
1. Author one **`demo.tape`** (VHS) showing: install → run a real coding task on an open
   model → show the cost/latency line → done. Keep it **≤30s**, loopable.
2. Render `demo.gif` (README), `demo.mp4`/`demo.webm` (X/LinkedIn/short-form, which prefer
   real video over GIF).
3. Commit the `.tape` and wire a CI job to re-render on release so the demo never drifts
   from reality.
4. Optionally publish an **asciinema** cast for the docs page (selectable text + share link).

**Demo content tips**
- First frame must communicate value (no long `npm install` scroll — fast-forward it).
- Show the *receipt*: the cost-per-task / token numbers are the whole pitch — make them
  visible on screen.

Sources: charmbracelet/vhs, asciinema.org, agg (asciinema), awesome-terminal-recorder.

---

## 3. Architecture / "how it works" diagrams

Buyers of a *harness* need to grok the boxes-and-arrows fast: model-agnostic routing, your
context/memory layer, tools/MCP, the swappable model backend (GLM 5.2 / open weights /
frontier fallback).

**Free, scriptable tools**
- **Mermaid** — *recommended for in-repo diagrams.* Text-based (`flowchart`, `sequenceDiagram`,
  `C4`), **renders natively inside GitHub Markdown** (no image to maintain), diffs cleanly in
  PRs, and stays in sync with the code. Ideal for README + docs.
- **Excalidraw** — hand-drawn, friendly aesthetic for the *narrative* "big picture" diagram
  (great in blog posts / slides / threads). Free, exports SVG/PNG; `.excalidraw` files are
  JSON so they're version-controllable. (excalidraw.com / self-hostable.)
- **D2** or **Graphviz** if you want a more formal generated look — both text-based/CI-able.

**What to draw**
- One **Mermaid** flow in the README: `User → glamfire harness (context + tools + routing)
  → {GLM 5.2 | open weights | frontier fallback}` — emphasizing you own the middle box.
- One **Excalidraw** "old way vs new way" picture for the blog/thread: *renting your brain
  back from a frontier lab* vs *owning your harness + context*.

Sources: mermaid.js.org (GitHub-native), excalidraw.com.

---

## 4. Social cards / Open Graph (OG) images

When the repo/docs/blog link is shared on X, LinkedIn, Slack, Discord, the unfurled card is
free advertising. Make it intentional, not the default GitHub gray.

**Free, scriptable tools**
- **Dynamic OG generation:** `@vercel/og` + `satori` (HTML/JSX → PNG at the edge), or a
  serverless headless-chromium screenshot service. Generates per-page cards with the page
  title baked in, cached.
- **GitHub Action:** *"Open Graph social cards"* action auto-generates per-page OG images in
  CI for docs sites.
- **OSS generators:** `permafrost-dev/social-card-generator`, `codersforcauses/og-social-cards`,
  `anomalyco/social-cards`, beyondco social image generator.
- **GitHub repo social preview:** set the repo's Social Preview image in Settings (1280×640)
  — many forget this; it controls the unfurl when the bare repo URL is shared.

**Content:** logo + name + the one-liner ("Own your AI harness") + a tiny visual. Keep text
huge and legible at small sizes.

Sources: github.com/marketplace/actions/open-graph-social-cards, permafrost-dev/social-card-generator,
codersforcauses/og-social-cards, banners.beyondco.de.

---

## 5. The explainer thread (X / LinkedIn) — reusable structure

Threads of **5–9 posts** have the highest completion rate; spend ~**50% of your time on the
hook** (post 1). One idea per post; each post self-contained.

**glamfire launch-thread skeleton**
1. **Hook (the promise/contrarian claim).** e.g. *"Open models are now 98% cheaper than
   frontier labs. So why can't companies switch? The harness. I open-sourced ours. 🧵"*
   + the demo GIF/video attached to post 1 (media lifts the hook).
2. **Why you should care.** The lock-in: you're renting your company's brain back from a lab.
3. **The problem named.** The "last mile / harness" gap — context, tools, routing, evals.
4. **The demo.** GIF/video of glamfire running a real task on an open model.
5. **How it works.** The Mermaid/Excalidraw architecture image; the model-agnostic middle.
6. **The receipts.** Cost-per-task table: GLM 5.2 vs frontier on the same job.
7. **Honest limitation.** One thing it doesn't do yet (builds trust, pre-empts critics).
8. **CTA.** Repo link + "good first issues" + Discord/Discussions. Recap bullets.

Reuse this same spine for the dev.to post, the HN maker comment, and the README narrative —
same story, different depth.

Sources: xagently, unfollr, buildsolo.

---

## 6. Short-form video script outline (TikTok / Reels / Shorts / LinkedIn)

Phone/screen-recorded and conversational beats polished. The **first ~1.5s hook** decides
distribution; sweet spot **~60–90s**. Edit free in **CapCut** or **Descript**; repurpose the
VHS/asciinema demo as the screen-capture B-roll.

**Outline (one ~60–75s clip)**
- **0:00–0:02 Hook (on-screen text + spoken):** "Stop renting your company's brain back from
  OpenAI." / "This coding task cost $0.002. Watch."
- **0:02–0:10 Problem:** open models are cheap now, but you can't just swap them in — the
  harness is the hard part.
- **0:10–0:40 Demo:** screen-record glamfire doing a real task on an open model; the cost
  number visible; captions on (most watch muted).
- **0:40–0:60 Payoff:** "You own the harness and the context. Swap models anytime. It's
  open source."
- **0:60–0:75 CTA:** "Link in bio / repo in comments. Star it, try it, tell me what breaks."

**Volume tactic:** cut one demo into 3–5 angle-variations (cost angle, lock-in angle, self-
host angle, "GLM 5.2 vs Claude" angle) and post natively to each platform — captions sized
per aspect ratio.

Sources: ltx.io, marketingagent.blog, stackmatix, teleprompter.

---

## 7. Podcast angle (founder as guest)

- **Pitch a topic, not yourself.** Angle: *"The harness gap: why 98%-cheaper open models
  still can't displace frontier labs — and what 'owning your last mile' actually takes."*
  Topic relevance is the #1 booking factor (~88% of hosts).
- **Target shows:** *The Craft of Open Source*, *Sustain*, *Scotland Open Source*, plus AI/
  ML and dev-tool podcasts (see Feedspot/MillionPodcasts OSS lists).
- **Pitch format:** <200 words, personalized, reference a specific past episode, propose 2–3
  concrete talking points. Avoid anything that reads as AI-generated spam (hosts filter it).
- **Asset to bring:** the same architecture diagram + cost-receipt table; offer to demo live.

Sources: justreachout, prezly, feedspot.

---

## Asset → channel matrix

| Asset | Tool (free) | Primary channels | In-repo / regenerable? |
|---|---|---|---|
| Hero/banner | beyondco, hero-generator, satori | README, GitHub Trending thumb | Yes |
| Terminal demo GIF/MP4 | **VHS** (.tape), asciinema+agg | README, X, short-form, PH | Yes (CI on release) |
| Architecture diagram | **Mermaid** (in-repo), Excalidraw | README, docs, blog, thread | Yes |
| OG social card | @vercel/og, OG-cards Action | every shared link | Yes (CI) |
| Launch thread | (writing) | X, LinkedIn | n/a |
| Short video | CapCut/Descript + VHS B-roll | TikTok/Reels/Shorts/LinkedIn | Source script in repo |
| Podcast angle | (pitch) | OSS/AI podcasts | n/a |

---

## Key takeaways for glamfire

- **Lead with a VHS-scripted terminal demo** — reproducible, CI-regenerated, and the single
  highest-converting asset for a CLI harness. Put the **cost-per-task number on screen**.
- **Mermaid for in-repo diagrams** (renders natively on GitHub, diffs in PRs) + **Excalidraw**
  for the "old way vs new way" narrative picture.
- **Everything lives in the repo and regenerates in CI** — banner, demo, OG cards, diagrams —
  so assets never drift from reality (a trust signal in itself).
- **Author one story spine, reuse it everywhere** — thread, README, HN maker comment, video,
  podcast — same villain (renting your brain back), same hero (the builder), same receipts.
- **Repurpose the one demo into 3–5 short videos** across platforms; phone-grade authenticity
  beats studio polish and the first 1.5s is everything.
- **Don't forget the repo's Social Preview image** and per-page OG cards — free advertising on
  every share.

---

## Sources

- VHS (Charmbracelet) — https://github.com/charmbracelet/vhs
- asciinema — https://asciinema.org/
- agg (asciinema GIF generator) — https://github.com/asciinema/agg
- Awesome terminal recorders — https://github.com/orangekame3/awesome-terminal-recorder
- Mermaid (GitHub-native diagrams) — https://mermaid.js.org/
- Excalidraw — https://excalidraw.com/
- Beyond Code social image generator — https://banners.beyondco.de/
- sdras/hero-generator — https://github.com/sdras/hero-generator
- banner-generator topic — https://github.com/topics/banner-generator
- Open Graph social cards (GitHub Action) — https://github.com/marketplace/actions/open-graph-social-cards
- permafrost-dev/social-card-generator — https://github.com/permafrost-dev/social-card-generator
- codersforcauses/og-social-cards — https://github.com/codersforcauses/og-social-cards
- How to write viral X threads (XAgently) — https://xagently.com/en/blog/how-to-write-x-threads
- Viral Twitter/X thread template (Build Solo) — https://buildsolo.io/twitter-thread-template/
- Short-form video strategy 2026 (LTX) — https://ltx.io/blog/short-form-video
- Short-form video B2B (Stackmatix) — https://www.stackmatix.com/blog/short-form-video-marketing-strategy
- How to be a podcast guest 2026 (JustReachOut) — https://blog.justreachout.io/how-to-be-a-guest-on-a-podcast/
- 35 best open source podcasts 2026 (Feedspot) — https://podcast.feedspot.com/open_source_podcasts/
