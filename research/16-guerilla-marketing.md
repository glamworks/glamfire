# 16 — No-Cost Guerilla Marketing for an OSS Dev-Tool Launch (2026)

> Context: launching **glamfire**, an open-source AI harness. Thesis: cheap open
> intelligence (GLM 5.2, ~98% cheaper) is here, but companies can't switch because the
> "last mile / harness" is hard and the talent is scarce — so **own your harness and
> context instead of renting your company brain back from frontier labs.**

This file is a concrete, ethical, zero-budget playbook. No spam, no astroturf, no
upvote-rings. Every tactic below is something a single founder can execute by hand.

---

## Guiding principles (read first)

- **Developers verify claims, distrust hype, and trust competence over polish.** Modest,
  specific, technically-deep language beats superlatives every time.
- **Earn distribution, don't buy/fake it.** HN, Lobsters, and Reddit all run mature
  vote-ring / brigading detection. Getting caught nukes the launch *and* the brand.
- **One artifact, many doors.** Write the deep technical piece once (a "show your work"
  blog post / README), then adapt it per channel. The repo is always the destination.
- **The first 1–2 hours decide everything** on every ranked platform. Be at your keyboard,
  not in a meeting, and reply to every comment as a peer.

---

## Channel 1 — Show HN / Hacker News (the single highest-leverage door)

HN is the best place a dev-tool can launch for free: a front-page Show HN can drive
5,000–50,000+ visitors in 48h, and OSS tools see roughly **~1 GitHub star per upvote**.

**Mechanics**
- Use the **`Show HN:`** prefix. It puts you on the less-competitive `/show` tab, so you
  accumulate votes over a longer window than the main `/newest` firehose.
- **Title = crystal clear, no superlatives.** It must be obvious what glamfire *is* and
  that clicking goes to the repo. Avoid "fastest/best/first." E.g. *"Show HN: glamfire –
  an open AI coding harness you self-host, runs on open-weight models"*.
- **Link to the GitHub repo** (or a no-fluff landing page), not a marketing site.
- **First comment = the maker comment**, posted within ~5 minutes: why you built it, the
  tech stack, what it does *not* do yet, and the specific feedback you want. One honest
  limitation up front is a trust multiplier.
- **Timing:** Tue–Thu, ~8–10am PT / 9am–12pm ET hits peak traffic.
- **First 30–60 min are critical** — a front-page run usually needs ~30–50 upvotes in the
  first hour, driven by *organic* interest, not solicitation.

**Hard "don'ts"**
- **Never ask for upvotes** (in the post, on Twitter, in Slack/Discord). HN's ring
  detection is excellent and penalizes the submission. Asking people to "go comment" is
  fine; "go upvote" is not.
- Don't argue defensively. Thank critics, concede real points, answer the rest with depth.

**Sustained coverage:** HN rewards repeat substance. After launch, submit genuinely
interesting *engineering* writeups (e.g. "How we route between GLM 5.2 and a frontier model
per-task") as regular stories, not re-launches.

Sources: markepear, daily.dev, lucasfcosta, syften.

---

## Channel 2 — r/LocalLLaMA + adjacent subreddits

r/LocalLLaMA is the perfect-fit audience for an open-weight-first harness: people who
already run local/open models and feel frontier-lab lock-in viscerally.

**Rules of the road (Reddit-wide + sub-specific)**
- **Read each sub's sidebar/wiki and rules before posting.** Many subs ban or rate-limit
  self-promotion; some require a "self-promo Saturday" thread or a participation ratio.
- **Frame as "I built X to solve Y," not a pitch.** Lead with the problem and a demo
  (GIF/asciinema), show benchmarks/cost numbers, and link the repo at the *bottom*.
- **Participate first.** Build comment karma and credibility in the community for weeks
  before you post your own thing. Drive-by launches get removed.
- **Target the right rooms** — beyond r/LocalLLaMA: r/selfhosted, r/opensource, r/webdev,
  r/programming, r/devops, r/ChatGPTCoding, r/artificial. Tailor the angle to each.

**Why glamfire fits r/LocalLLaMA specifically:** the "own your harness, run open weights,
98% cheaper" thesis *is* the subreddit's worldview. Show real cost-per-task comparisons and
a reproducible setup — that community rewards receipts.

Sources: opensource.guide, daily.dev (Reddit framing). (Verify current rules directly in
the r/LocalLLaMA sidebar/wiki at post time — they change.)

---

## Channel 3 — Lobste.rs (small, high-signal, invite-only)

Lobsters is a calmer, more technical HN alternative — smaller reach but high-quality
discussion and good backlink value.

- **Invite-only.** The fastest path: participate in their chat / be recognized; if your
  link gets posted by someone else, reach out and they'll often invite you.
- **New users (~first 70 days, green username)** can't submit links to never-before-seen
  domains, can't invite, can't resubmit, etc. Plan ahead.
- **Self-promo cap:** rule of thumb is **self-promotion < ~25%** of your stories+comments.
  Use the `authored` tag honestly and *engage* — don't treat it as a write-only billboard.
- Best fit: a meaty engineering post (architecture, harness internals), not a bare repo.

Sources: lobste.rs/about, lobste.rs meta threads, aneeshdurg.me.

---

## Channel 4 — X / Twitter

Still the dev-founder town square. Free reach comes from *threads* and *building in public*,
not from ads.

- **Launch thread** (see `17-multimedia-assets.md` for full structure): hook → why it
  matters → demo GIF → architecture → cost numbers → repo link + CTA. Spend ~50% of writing
  time on the first tweet (the hook).
- **Build in public** daily/weekly: ship logs, benchmarks, "today I made GLM 5.2 do X."
  This compounds and feeds every other channel.
- **Reply-guy strategy (ethical):** add genuine value in threads about AI cost, lock-in,
  coding agents. Become a known voice before launch day.
- Tag/quote relevant accounts only when truly relevant; cross-post the demo video natively
  (X down-ranks external links and reposts of others' video).

Sources: xagently, unfollr, buildsolo.

---

## Channel 5 — dev.to / Hashnode (owned long-form + backlinks)

- Publish the **deep technical writeup** here (canonical or cross-posted). dev.to/Hashnode
  give SEO juice, RSS distribution, and an easy "discuss" surface.
- Good post archetypes: "Why we built an open AI harness," "GLM 5.2 vs frontier on real
  coding tasks (with numbers)," "How to escape AI vendor lock-in in 2026."
- Use a `canonical_url` back to your own blog if you have one, to consolidate SEO.

Sources: dev.to community guides (HN/PH playbooks linked below).

---

## Channel 6 — Product Hunt (optional booster, not a must)

PH is **not required** for OSS, but it adds visibility + valuable backlinks, and featured
launches get a real traffic spike.

- **Launch at 12:01am PT** to capture the full 24h voting cycle; the **first ~2 hours** set
  the algorithmic trajectory.
- Prepare: clear tagline, gallery (GIF demo first), maker comment, and a small group of
  *real* supporters notified in advance (notifying ≠ vote-buying; don't incentivize votes).
- Consider **Open-Launch** (the OSS PH alternative) and **OpenHunts** as supplementary,
  lower-noise directories.

Sources: producthunt.com/launch, dev.to PH playbook, papermark, openhunts, flowjam,
github.com/openlaunch-org/Open-Launch.

---

## Channel 7 — GitHub trending + awesome-lists

**GitHub Trending** ranks on **star *velocity*** (acceleration), not total stars. You can't
game it directly — it's a *consequence* of a good HN/Reddit/X day. To maximize conversion of
that traffic into stars:
- A repo that earns the click: strong hero image, a 15-second value prop, a copy-paste
  quickstart, and an animated demo above the fold (see file 17).
- A pinned "good first issue" set and a visible roadmap (see file 18) so visitors stick.
- Concentrate launch traffic into a **single day** to spike velocity onto Trending, which
  then creates a second, organic discovery wave (Trending → Trendshift → newsletters).

**Awesome-lists:** submit to genuinely-relevant curated lists (e.g. awesome-llm, awesome-ai-
agents, awesome-selfhosted, awesome-llmops) **following each list's contribution guide
exactly.** These are human-vetted; low-effort/off-topic PRs get rejected and some lists pause
submissions due to spam. Quality + clear category fit is the price of entry.

Sources: github.com/trending, github.com/sindresorhus/awesome, trendshift.io, yuv.ai.

---

## Channel 8 — Short-form video (TikTok / Reels / YouTube Shorts / LinkedIn)

Underused by dev tools, so reach is cheap. Each platform differs:
- **TikTok** rewards raw completion rate; **Reels** rewards polished originality + saves/
  shares; **Shorts** funnels into a long-form channel; **LinkedIn short-form** has unusually
  high organic B2B reach right now.
- **Authenticity > production.** Phone-shot, screen-recorded, conversational clips
  outperform studio polish. The **first ~1.5 seconds (the hook)** decide distribution.
- Sweet spot is now **~60–90s** (platforms added distribution bonuses for longer content
  that holds watch time).
- **Content ideas:** "Watch an open model do *this* coding task for $0.002," "Stop renting
  your company's brain back from OpenAI," "Self-host your AI harness in 90 seconds."
- Edit free with **CapCut** / **Descript**; repurpose one asciinema/VHS demo into clips for
  all four platforms.

Sources: ltx.io, marketingagent.blog, theviralapp, homemadesocial, stackmatix.

---

## Channel 9 — SEO + LLM-SEO / GEO (compounding, slow but free)

Increasingly, your buyers ask **ChatGPT/Claude/Perplexity** "what's the best open-source AI
harness?" — so optimize to be *cited*, not just ranked.

- **GEO tactics that actually move the needle (2026):** add **statistics, source citations,
  and direct quotations** — the three biggest levers for getting pulled into AI answers.
- **Maximize extractability:** comparison tables, a 5-question FAQ block, headings phrased
  as the exact questions users ask, sourced claims instead of vague ones.
- **Structured data:** valid `Article`, `FAQPage`, `HowTo`, `Organization`, `SoftwareApplication`
  schema; validate with Google's Rich Results Test.
- **Optimize for sub-queries** the model decomposes into (e.g. "open source coding agent,"
  "GLM 5.2 vs Claude cost," "self-host AI harness").
- **Measure:** pick ~10 buyer queries, run them monthly in ChatGPT/Perplexity/Claude/Google
  AI Overviews, log which sources get cited, iterate. Most see movement in 4–8 weeks.
- Traditional SEO still matters for the docs site; keyword-stuffing is dead for AI answers.

Sources: trueranker, yotpo, llmrefs, mersel.ai, witscode.

---

## Channel 10 — Podcasts (founder credibility + backlinks)

- Pitch OSS/dev podcasts as a **guest**: *The Craft of Open Source*, *Sustain*, *Scotland
  Open Source*, plus AI/dev shows. Most guests (≈70%) come from outreach + networks.
- **Topic relevance is the #1 booking factor (~88% of hosts).** Pitch an *angle*, not
  yourself: "Why cheap open models still can't displace frontier labs — the harness gap."
- Keep pitches **<200 words, personalized**, referencing a specific past episode. Generic/
  AI-spam pitches are instantly filtered in 2026.

Sources: justreachout, prezly, podmatch, feedspot/millionpodcasts (OSS podcast lists).

---

## Launch sequencing (a concrete 4-week timeline)

**T-3 to T-2 weeks — build credibility & assets**
- Repo polished: hero image, quickstart, demo GIF, good-first-issues, roadmap, LICENSE.
- Start building-in-public on X; begin participating in r/LocalLLaMA, Lobsters chat, HN.
- Write the canonical deep-dive post (dev.to/Hashnode + own blog). Line up 1–2 podcast pitches.

**T-1 week — warm up**
- Tease on X ("launching next week"), publish a "teaser" engineering post.
- Add GEO/structured-data to docs. Prep PH assets. Notify (don't bribe) a few real friends.

**Launch day (Tue–Thu)**
- **12:01am PT:** Product Hunt goes live (optional).
- **~8–9am PT:** Show HN goes live → post maker comment immediately → camp the thread.
- Same morning: publish the X launch thread (native demo video) + the dev.to post.
- Post to r/LocalLLaMA + 1–2 other fitting subs *as separate, tailored, problem-first posts*
  (don't blast identical copy everywhere on the same hour).
- Reply to *everything* across channels for the full day.

**T+1 to T+3 days — capture the wave**
- Concentrated traffic spikes **GitHub Trending** → second organic wave.
- Submit to relevant awesome-lists (now you have proof/traction).
- Cut the demo into 3–5 short-form videos; post across TikTok/Reels/Shorts/LinkedIn.

**T+1 to T+4 weeks — sustain**
- Weekly: ship log on X, one engineering post (feeds HN/Lobsters/dev.to), one short video.
- Run the GEO query-tracking loop monthly. Close the loop publicly on roadmap items shipped.

---

## Key takeaways for glamfire

- **HN Show HN is your top free lever** — clear title, repo link, instant honest maker
  comment, camp the thread, *never* solicit upvotes.
- **r/LocalLLaMA is your ideal-fit audience** — your "own your harness / open weights / 98%
  cheaper" thesis is that community's native worldview; show receipts, not pitches.
- **Concentrate launch traffic into one day** to spike GitHub Trending and trigger a second
  organic discovery wave.
- **One deep technical artifact, adapted per channel** beats N shallow promos; the repo is
  always the destination and must convert the click (see file 17).
- **Lobsters and awesome-lists demand patience and ratios** — participate first, self-promo
  under ~25%, follow each list's guide exactly.
- **GEO/LLM-SEO is the new compounding moat** — stats + citations + tables + FAQ schema get
  glamfire *cited* when buyers ask an AI "best open AI harness?"
- **Everything ethical, nothing faked** — modest, specific, builder-to-builder tone; the
  audience punishes hype and rewards honest limitations.

---

## Sources

- How to launch a dev tool on Hacker News — https://www.markepear.dev/blog/dev-tool-hacker-news-launch
- HN marketing for dev tools (daily.dev) — https://business.daily.dev/resources/hacker-news-marketing-developer-tools-show-hn-launch-day-sustained-coverage/
- How to do a successful HN launch (Lucas da Costa) — https://www.lucasfcosta.com/blog/hn-launch
- HN posting guide (Syften) — https://syften.com/blog/hacker-news-marketing/
- How to crush your HN launch (dev.to) — https://dev.to/dfarrell/how-to-crush-your-hacker-news-launch-10jk
- Promote your OSS project step-by-step (daily.dev) — https://business.daily.dev/resources/promote-open-source-project-step-by-step-launch-guide/
- Product Hunt launch guide — https://www.producthunt.com/launch
- Product Hunt launch playbook (dev.to) — https://dev.to/iris1031/product-hunt-launch-playbook-the-definitive-guide-30x-1-winner-1pbh
- Open-Launch (OSS Product Hunt alternative) — https://github.com/openlaunch-org/Open-Launch
- Product Hunt launch guide 2025 (OpenHunts) — https://openhunts.com/blog/product-hunt-launch-guide-2025
- Lobsters about/rules — https://lobste.rs/about
- Lobsters self-promo meta thread — https://lobste.rs/s/7mx8tx/is_it_appropriate_keep_submitting
- How fair is lobste.rs on self-promo — https://aneeshdurg.me/posts/2025/06/12-lobsters/
- GitHub Trending — https://github.com/trending
- sindresorhus/awesome — https://github.com/sindresorhus/awesome
- GitHub Trending explained (YUV.AI) — https://yuv.ai/blog/github-trending
- Trendshift — https://trendshift.io/
- Short-form video strategy 2026 (LTX) — https://ltx.io/blog/short-form-video
- Short-form video B2B (Stackmatix) — https://www.stackmatix.com/blog/short-form-video-marketing-strategy
- GEO guide 2026 (TrueRanker) — https://trueranker.com/blog/geo-guide-to-llms/
- ChatGPT SEO & GEO 2026 (Yotpo) — https://www.yotpo.com/blog/chatgpt-seo-geo-tips/
- GEO for B2B (Mersel AI) — https://www.mersel.ai/generative-engine-optimization
- How to be a podcast guest 2026 (JustReachOut) — https://blog.justreachout.io/how-to-be-a-guest-on-a-podcast/
- 35 best open source podcasts 2026 (Feedspot) — https://podcast.feedspot.com/open_source_podcasts/
- How to write viral X threads (XAgently) — https://xagently.com/en/blog/how-to-write-x-threads
- Contributing to open source (Open Source Guides) — https://opensource.guide/how-to-contribute/
