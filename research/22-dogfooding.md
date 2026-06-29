# 22 — Dogfooding: Using glamfire to Build glamfire

The goal: glamfire becomes its own primary development tool. The fastest credibility signal for an OSS agent harness is "we build it with itself." This doc covers how the leading agentic coding tools dogfood, a concrete transition path from *built-with-Claude-Code* → *built-with-glamfire*, milestones where glamfire's own loop takes over more dev work, and how to verify the loop actually closes end-to-end.

## How the leaders dogfood

- **Claude Code (Anthropic).** Released internally ~2 months after the first prototype; **~20% of Engineering** used it on day one, **50% by day five**. Today **70–80%** of technical Anthropic staff use it daily, and the team estimates **~90% of Claude Code's own code is written by Claude Code**, shipping ~5 releases/engineer/day and burning through 10+ prototypes per feature. Claude does the first pass of all internal code review (human still approves), and the tool auto-uses the latest model snapshots so engineers feel model changes directly ([How Claude Code is built](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built), [How Anthropic teams use Claude Code (PDF)](https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf)).
- **OpenAI Codex.** The Codex team estimates **Codex writes >90% of the Codex app's code** — Codex building Codex. Internally ~**98% of OpenAI employees** use Codex (up from ~40% in Aug 2025); it's leaned on for refactors, renames, test-writing, scaffolding, bug fixes, docs, and on-call triage ([How Codex is built](https://newsletter.pragmaticengineer.com/p/how-codex-is-built), [Introducing Codex](https://openai.com/index/introducing-codex/), [TNW](https://thenextweb.com/news/openai-codex-agents-shift-employees-non-developers)).
- **Aider.** Reports the **percentage of each release written by Aider itself** in its release notes, and commits every AI change as a clean, reviewable/revertible git commit — a lightweight, transparent dogfood metric ([Aider](https://aider.chat)). 6.8M+ PyPI installs.
- **Goose (Block → Linux Foundation / Agentic AI Foundation).** General-purpose agent (Rust) that runs on your machine, edits code, runs commands, and connects to 3,000+ MCP servers; works across 15+ providers including local Ollama — built and used as an internal automation agent at Block before open-sourcing ([Goose docs](https://goose-docs.ai/), [Goose repo](https://github.com/aaif-goose/goose)).

**Common thread:** start dogfooding *early and internally* (a rough but usable build), measure the share of work the agent does, keep a human approver in the loop, route well-scoped tasks to the agent first, and make the agent eat its own model upgrades.

## Smooth transition path: Claude Code → glamfire

The transition should be **gradual and reversible** — glamfire takes over surfaces one at a time, with Claude Code (or any harness) always available as a fallback so a half-built glamfire never blocks development.

1. **Compatibility beachhead.** Make glamfire reuse the artifacts the project already has: read the same `CLAUDE.md`/project-context file, an `allow/ask/deny` permission config, and OpenAI-compatible model config (Fireworks or local GLM, per `20`). This means switching harnesses changes the *runner*, not the project conventions.
2. **Parallel, low-stakes tasks first.** Point glamfire at well-scoped, easily-verified jobs (rename, add tests, update docs, mechanical refactors) while Claude Code still drives the hard architectural work — exactly the task class Codex/Claude Code teams hand to the agent first.
3. **Run both side by side on the same task** for a period; compare diffs/outcomes. This is the dogfood A/B that surfaces glamfire's gaps with a known-good reference.
4. **Flip the default for a category once glamfire wins it** (e.g. "all test-writing goes through glamfire"), keeping Claude Code as fallback.
5. **glamfire-first, Claude-Code-as-backstop.** New work starts in glamfire; escalate to the other tool only when glamfire can't yet do it — and file that gap as a glamfire task.
6. **Self-sustaining.** glamfire is the primary tool; remaining Claude Code use is rare/edge. Track and publish the crossover (see metrics).

## Milestones: the loop takes over more dev work

- **M0 — Manual harness.** glamfire can run a single tool call against a model; humans drive everything. *Gate: it can read a file and propose an edit.*
- **M1 — Edit + run loop.** glamfire can read, edit, run shell/tests, and iterate to green on a small bug with human approval per step. *Gate: closes a real "good first issue" in this repo end-to-end.*
- **M2 — Self-hosted contributions.** glamfire opens PRs against glamfire for scoped tasks (tests, docs, refactors); humans review/merge. *Gate: first PR authored by glamfire merged into main.* (Mirrors Aider's "% of release written by the tool".)
- **M3 — Permissioned autonomy.** With the `allow/deny` + sandbox model (`21`), glamfire runs multi-step tasks unattended within the sandbox, asking only for high-impact actions. *Gate: completes a multi-file feature with only review-time human involvement.*
- **M4 — Self-review & self-upgrade.** glamfire does first-pass review on incoming PRs (human approves) and runs against the latest model snapshot, surfacing regressions — the Anthropic pattern. *Gate: glamfire's review catches a real defect; model bumps flow through it.*
- **M5 — Majority author.** A measured majority of new glamfire commits are authored by glamfire. *Gate: published "% written by glamfire" crosses 50%, trending toward the ~90% the leaders report.*

## Verifying the dogfood loop actually works end-to-end

Dogfooding is only real if the loop demonstrably closes — not vibes. Verify with hard gates, echoing the global rule that work isn't "done" until it builds clean, every gate passes for real, and it's merged + installed.

- **Self-hosting CI gate.** A CI job runs glamfire (using glamfire) on a canned task in this repo and asserts the result compiles, lint passes, and the test suite is green. If glamfire can't drive a clean build, the loop is broken — fail loudly, fix the root cause, don't `--skip`.
- **Provenance on every AI commit.** Tag commits/PRs authored by glamfire (and the model id used) so "% authored by glamfire" is measurable and auditable — Aider-style transparency.
- **A/B against a reference harness** on a fixed task set; track success rate, human-intervention count, and tokens/cost per task. Regressions in any of these block the milestone.
- **End-to-end smoke task each release.** "glamfire fixes a seeded bug in glamfire and ships a green PR" as a release-blocking smoke test — proves the full read→edit→run→verify→PR cycle, not just unit pieces.
- **Trust signals to publish:** share of code written by glamfire per release, releases/day, intervention rate, and cost/task — the same metrics the leaders cite, which doubles as marketing.

## Key takeaways for glamfire

- Start dogfooding on a *rough but usable* build, internally and early — the leaders all began before the tool was polished.
- Make the switch additive: glamfire reuses existing project conventions (context file, permission config, OpenAI-compatible model), so it slots in beside Claude Code and can always fall back.
- Hand the agent well-scoped, easily-verified tasks first; expand autonomy only as the permission/sandbox model (from `21`) earns trust.
- Gate "done" on a real self-hosting CI run that builds clean and passes every check — a worked-around dogfood gate is a broken loop, not a green one.
- Measure and publish "% of code written by glamfire," releases/day, and cost/task; the credible target is the 90% the leaders report, with 50% as the meaningful crossover milestone.

## Sources

- How Claude Code is built (Pragmatic Engineer): https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built
- How Anthropic teams use Claude Code (Anthropic PDF): https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf
- How Anthropic dogfoods on Claude Code: https://cloudnativenow.com/features/how-anthropic-dogfoods-on-claude-code/
- How Codex is built (Pragmatic Engineer): https://newsletter.pragmaticengineer.com/p/how-codex-is-built
- Introducing Codex (OpenAI): https://openai.com/index/introducing-codex/
- 98% of OpenAI employees use Codex (TNW): https://thenextweb.com/news/openai-codex-agents-shift-employees-non-developers
- Aider: https://aider.chat
- Goose docs: https://goose-docs.ai/
- Goose repo (Agentic AI Foundation): https://github.com/aaif-goose/goose
- Best Open Source AI Coding Assistants 2026: https://www.opensourcealternatives.to/blog/best-open-source-ai-coding-assistants
