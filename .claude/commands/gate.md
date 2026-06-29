---
description: Run every glamfire quality gate and report pass/fail. Run before calling anything DONE or releasing.
---

Run the full gate set and report a clear PASS/FAIL with real output. Do not declare
success unless every gate genuinely passes (no `|| true`, no skips):

```bash
node scripts/smoke.mjs      # real CLI exercised like a human
npm run lint                # Biome clean (once deps installed)
npm test                    # unit/regression green
node packages/cli/src/index.mjs --version   # version-in-output sanity
```

For any change touching inference/a surface, ALSO perform human-standard verification
(CLAUDE.md §5): drive the real surface, make a real GLM-5.2/Fireworks call where
relevant, inspect real output. Summarize each gate's result and quote any failure
exactly. If anything fails, stop and report the blocker — do not work around it.
