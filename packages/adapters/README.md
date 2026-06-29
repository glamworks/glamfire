# @glamfire/adapters

Per-model harnesses behind one **conformance-tested** contract (SPEC §5.4). An
adapter turns a model into a working agent: it declares `capabilities`, encodes
neutral run state into the provider's native request, decodes the response (and
streamed fragments) back into neutral steps, and prices token usage for the
router.

## First-class adapters

| Adapter | Surface | Status |
|---|---|---|
| **`fireworks-glm`** | GLM-5.2 via Fireworks AI (OpenAI-compatible Chat Completions) — the default workhorse and the reference adapter. | real, conformance-green |
| **`anthropic`** | Claude family via the native Anthropic **Messages API** — for edge escalation / migration parity. | real, conformance-green |

Both speak the full `StreamingAdapter` contract for real over `fetch`: native
tool-call grammar, streamed tool-argument fragment reassembly (OpenAI
`tool_calls[].function.arguments` fragments; Anthropic `input_json_delta`),
interleaved reasoning/thinking, real provider pricing, and credential resolution
through [`@glamfire/config`](../config) (`FIREWORKS_API_KEY` / `ANTHROPIC_API_KEY`,
env or OS keychain — never inline, never logged).

`openai` and `local` adapter slots exist in config but are not yet implemented;
see [`../../README.md`](../../README.md) → *Current reality*.

## Conformance suite

The [`conformance/`](conformance) directory holds the shared, provider-agnostic
battery that gates model support: **a model/adapter is "supported" only when the
conformance suite is green.** The same `runConformance` battery runs against both
first-class adapters, each driven by captured real wire fixtures (committed under
[`test/fixtures/`](test/fixtures), recorded via the `scripts/capture-*` scripts).
See [`conformance/README.md`](conformance/README.md).

```bash
pnpm --filter @glamfire/adapters build
npx vitest run packages/adapters    # unit + regression + conformance (both adapters)
```

Live verification (real provider calls) is documented in
[`MANUAL-VERIFY.md`](MANUAL-VERIFY.md).
