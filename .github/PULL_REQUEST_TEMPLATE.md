<!-- glamfire PR. The bar: real, full-stack, human-verified. No shims. -->

## What & why

<!-- What does this change do, and which issue/spec section does it serve? -->

Closes #

## How I verified it the way a human would

<!-- Required. Drive the real surface. Paste real output. A green unit test alone is not DONE. -->

```
# commands run + their real output
```

## Checklist

- [ ] Real **full-stack mini-feature** — no shims, no mocks, no `|| true`/`--skip`
- [ ] **Breadth in lock-step** — no narrow feature raced ahead; partial work is stated in README → Current reality
- [ ] **Smoke/regression tests** added or extended (`node scripts/smoke.mjs` passes)
- [ ] `npm run lint` clean
- [ ] **Version-in-output** preserved where a surface changed
- [ ] No secrets in store/logs; least-privilege tool perms
- [ ] Commits signed off (`git commit -s`, DCO) and Conventional Commit messages
- [ ] Temp files / scratch / stray branches cleaned up
