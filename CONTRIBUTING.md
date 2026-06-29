# Contributing to glamfire

The harness‑talent shortage is the whole opportunity — and this is an open invitation.
If you can reason about routing, context, tool‑calls, or model adapters, **we want you.**

## Ground rules (the same ones the maintainers hold)

- **No shims, no mocks.** Every contribution is a real, full‑stack mini‑feature —
  working end‑to‑end from surface to provider. No stubs standing in for real behavior,
  no `|| true`, no `--skip`. If you're blocked on a decision, open an issue and say so.
- **Breadth stays in lock‑step.** Don't race one narrow feature ahead of the framework.
  If your change leaves something partial, say so explicitly in the PR and in README →
  *Current reality*.
- **DONE means a human can use it.** Include real **smoke/regression tests** and show,
  in the PR, how you verified it the way a human would (drive the real CLI, make a real
  GLM‑5.2/Fireworks call where relevant, paste the output).
- **Version‑in‑output stays true.** If you touch a surface, keep the version visible.

## Workflow

1. **Find or open an issue.** Start with a
   [good first issue](https://github.com/glamworks/glamfire/labels/good%20first%20issue).
   For anything substantial, comment first so we don't duplicate work.
2. **Branch.** Feature branches only — `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
   For parallel streams, `git worktree` keeps you from colliding.
3. **Build the real thing.** Read [`SPEC.md`](SPEC.md), [`CLAUDE.md`](CLAUDE.md), and
   the relevant [`research/`](research/) brief for your subsystem first.
4. **Verify.** `node scripts/smoke.mjs`, `npm test`, `npm run lint` — all green — plus
   human‑standard verification described in the PR.
5. **Sign your commits (DCO).** Add `Signed‑off‑by:` via `git commit -s`. We use the
   [Developer Certificate of Origin](https://developercertificate.org/), not a CLA.
6. **Conventional Commits.** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
7. **Open a PR.** Describe what, why, and exactly how you verified it. Link the issue.

## Bigger changes: lightweight RFC

For new subsystems, public interfaces, or anything that affects the spec, open an
**RFC** issue (label `rfc`) describing the problem, the proposed contract, and
alternatives, before large implementation. Keep it short; iterate in the open.

## AI‑assisted contributions

glamfire is built with AI agents and we welcome AI‑assisted PRs — but **you** are
responsible for the result: it must be real, verified, and understood by you. Disclose
significant AI assistance in the PR. The bar is identical: no shims, human‑verified DONE.

## Code of Conduct & governance

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Project
governance is documented in [GOVERNANCE.md](GOVERNANCE.md). Security issues:
[SECURITY.md](SECURITY.md).

Thank you for helping keep the last mile open.
