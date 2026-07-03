# Architecture

The canonical, GitHub-rendered view of glamfire. The full contract for each box is in
[`../SPEC.md`](../SPEC.md) §5. Source diagram: [`../marketing/assets/architecture.mmd`](../marketing/assets/architecture.mmd).

```mermaid
flowchart TD
    subgraph S[Surfaces]
        CLI[glam CLI]
        TEAM[Team harness<br/>Slack / Discord / HTTP]
        SDK[SDK]
    end

    subgraph E[open engine]
        LOOP[Agent loop<br/>plan to act to observe<br/>tool dispatch · permissions · sandbox]
    end

    ROUTER[router<br/>center vs edge · cost-aware · escalation]
    BRAIN[open brain<br/>owned · local-first · portable context]
    SKILLS[open skills<br/>portable capability packs]
    ADAPTERS[adapters<br/>tested per-model harnesses]

    subgraph I[Intelligence]
        GLM[GLM 5.2 on Fireworks<br/>default workhorse]
        FRONTIER[Anthropic / OpenAI<br/>edge escalation]
        LOCAL[Self-hosted GLM<br/>vLLM / SGLang]
    end

    CLI --> LOOP
    TEAM --> LOOP
    SDK --> LOOP
    LOOP --> ROUTER
    LOOP --> BRAIN
    LOOP --> SKILLS
    LOOP --> ADAPTERS
    ROUTER -->|cheapest capable| ADAPTERS
    ADAPTERS --> GLM
    ADAPTERS --> FRONTIER
    ADAPTERS --> LOCAL
```

## Reading the diagram

- **Surfaces** are thin; all real work goes through the **engine**.
- The **engine** owns the agent loop and enforces permissions/sandboxing — the model
  never bypasses the gate.
- The **router** is the buyer's side of the commodity intelligence market: it picks
  the cheapest capable model per task (GLM 5.2/Fireworks by default) and escalates to
  frontier only on low confidence — the frontier earns its tokens.
- The **brain** is yours: local-first, portable, exportable. It is never uploaded,
  never rented back — the ground glamfire holds in the context wars.
- **adapters** turn each model into a working agent behind one conformance-tested
  contract — switching models is config, not a rewrite.
