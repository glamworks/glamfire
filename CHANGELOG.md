# Changelog

All notable changes to this project are documented here. Based on the real git
history; newest versions first. This project adheres to
[Keep a Changelog](https://keepachangelog.com/).

## Unreleased

- **feat(cli): BEHAVIOR CHANGE —** a run stopped by a budget/step/token ceiling now
  exits **3** instead of 0, so scripts and CI can tell a budget stop from `done`
  without parsing output. The documented, stable scheme (`glam help` /
  `glam run --help`): 0 done · 1 error · 2 usage error · 3 budget/step ceiling ·
  130 interrupted (128+SIGINT). (#23)
- **fix(cli):** the run header now shows the serving **provider and model family**
  (e.g. `provider: fireworks   model: deepseek-v4-flash (…)`) instead of leaking the
  shared adapter's internal id (`adapter: fireworks-glm`) on DeepSeek runs; adapters
  now declare a stable `provider` id alongside their adapter id. (#24)
- **fix(cli):** the `recorded to …` ledger line and the monthly-budget alert passed
  the `useColor` *function* (always truthy) instead of the resolved boolean, forcing
  raw ANSI codes into piped `glam run` output. Found while verifying #23.

## v0.4.1

- **fix(scripts):** `version.mjs` main-module guard used naive `file://` string
  concatenation, which never matches on Windows — `node scripts/version.mjs` printed
  nothing there (surfaced by the new doctor install-check test on Windows CI). Now
  compares via `pathToFileURL`.

## v0.4.0

- **feat(usage):** local usage ledger (`~/.glam/usage.jsonl`) — every `glam run` records
  model, provider, tokens, real cost, duration, and per-model escalation splits; new
  `glam usage` command (totals, by day/model/provider, `--since`, `--json`, budget bar);
  opt-in monthly budget alerts (`[usage] monthlyBudgetUsd` / `warnAtPct`).
- **feat(models):** evergreen model/provider landscape — new `glam models` command over a
  built-in catalog (13 entries, live-verified prices with as-of dates and sources);
  `--refresh` pulls current provider prices, reports price drops, caches honestly;
  adapters price *through* the catalog so route/run/models can never drift.
- **feat(adapters):** DeepSeek V4 support — `deepseek-v4-pro` + `deepseek-v4-flash` on
  Fireworks (FP8, 1M context, live-verified incl. parallel tool calls, seed, and prompt
  caching) and `DeepSeek-V4-Pro` on Together (live pending key); adapter conformance
  63/63; Fireworks adapter now fails loud on unknown model ids.
- **feat(cli):** hardening/UX sweep — honest `glam doctor` inside compiled binaries
  (root-caused `/$bunfs` detection), real Ctrl-C interrupt (aborts in-flight provider
  request, honest partial cost, exit 130), numeric option validation, did-you-mean
  suggestions, `NO_COLOR`/`FORCE_COLOR` policy, EPIPE-safe piping, 2.3× faster startup.
- **docs:** context-wars messaging (README hero, WHY-WE-WIN), research briefs 24–25
  (creator-thesis update; provider/model landscape 2026-07 with cited prices).

## v0.3.0

- **feat(engine):** read-only git tools — `git_status` / `git_diff` / `git_log` / `git_show`.
- **chore(release):** v0.3.0 — read-only git engine tools (dogfood M3 enablement).

## v0.2.4

- **fix(release):** winget via dedicated Windows job (`wingetcreate` is Windows-only).
- **docs:** all 4 package managers wired — winget PR submitted.

## v0.2.3

- **chore(release):** wire winget (PR to `microsoft/winget-pkgs`).

## v0.2.2

- **fix(release):** publish brew/scoop manifests over HTTPS token (deploy keys org-disabled).
- **chore(release):** publish Homebrew tap + Scoop bucket.

## v0.2.1

- **fix(ci):** enforce LF via `.gitattributes` so Windows biome gate passes.
- **fix(skills):** canonicalize module path before import (Windows CI).
- **fix(skills):** use `realpathSync.native` to expand Windows 8.3 short names.
- **fix(release):** install deps in release job so SBOM reads real versions.
- **chore(release):** CI green on all OSes; first npm publish (`glamfire@0.2.1`).

## v0.2.0

- **feat(engine):** code-search tools — `list_files` (glob) + `search_files` (grep).
- **ci:** self-hosting gate — glamfire builds glamfire (research/22).
- **fix(release):** bump-version must format `package.json` via Biome.
- **docs:** add Quickstart to README nav (authored by glamfire).
- **docs(dogfood):** flip scoped-docs category to glamfire (measured).
- **chore(release):** code-search tools + self-hosting CI gate.

## v0.1.0

- **feat(engine):** sandboxed `write_file` / `edit_file` / `run_command` tools behind permission gate.
- **feat(dogfood):** staged Claude Code → glamfire transition harness + runbook.
- **fix(engine,adapters):** real hard budget ceiling + Fireworks `service_tier` wire mapping.
- **docs:** Fireworks/GLM 5.2 quickstart (closes #11).
- **chore(release):** glam run DONE, live GLM 5.2 round-trip observed.
