---
description: Release flow — bump version (patch included), update current reality, commit, push, tag.
---

Ship a release. Only after `/gate` passes and the work is verified DONE by a human's
standard. Steps:

1. Confirm gates pass (run `/gate`).
2. Bump the version (third number included):
   ```bash
   node scripts/bump-version.mjs patch   # or minor / major
   ```
3. Update `README.md` → **Current reality** to reflect exactly what now works.
4. Record any durable decision in `.claude/memory/` (+ INDEX line).
5. Commit, push, tag:
   ```bash
   V=$(node scripts/version.mjs)
   git commit -am "chore(release): v$V"
   git push
   git tag "v$V" && git push --tags
   ```
6. Confirm `glam --version` prints the new version (version-in-output).
7. Clean up temp files, merged branches, stale worktrees (`git worktree prune`).

Never tag a release with a worked-around blocker or a shimmed feature.
