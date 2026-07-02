# Changelog

All notable changes to this project are documented here. Based on the real git
history; newest versions first. This project adheres to
[Keep a Changelog](https://keepachangelog.com/).

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
