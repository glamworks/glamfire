# 21 — Security & Privacy

Security and privacy posture for an agent harness that reads company source, runs tools/commands, and sends context to an LLM. The threat model is broader than a normal app: the *model output* can be attacker-controlled, and the agent has real privileges (filesystem, shell, network). Prompt injection has held the #1 spot in OWASP's risk rankings for two consecutive editions ([OWASP Top 10 for Agentic Apps](https://www.aikido.dev/blog/owasp-top-10-agentic-applications)).

## Secrets handling

- **Keep secrets out of the model.** Never put credentials, tokens, or customer data into prompts; redact before sending. Use synthetic/redacted examples in context ([Knostic](https://www.knostic.ai/blog/ai-coding-assistant-security)). Build an egress redaction pass that scrubs common secret patterns (API keys, `.env` values, private keys) from anything bound for the provider.
- **Secrets at rest.** API keys live in environment / a secrets manager, never committed and never baked into images. `.gitignore` the secrets file; provide `.env.example` only.
- **Block the agent from reading secret files.** Default-deny on `.env`, key material, and credential stores via the permission layer below. Note an important limitation seen in Claude Code: file-tool deny rules do **not** stop an arbitrary subprocess (a Node/Python script the agent runs) from opening the same file — so deny rules must be paired with sandboxing of the execution environment ([Claude Code settings](https://code.claude.com/docs/en/settings)).

## Data residency & privacy

- **Self-hosting is the strongest privacy control.** When the harness and model both run in the user's VPC/host, code, prompts, and logs never leave their infrastructure — often the only thing regulated industries actually require ([IronCore](https://ironcorelabs.com/blog/2026/ai-coding-agents-drawing-the-line/), [Agentmelt](https://agentmelt.com/blog/ai-coding-agent-security)). glamfire's vLLM/SGLang path (see `20`) is the privacy story; make it first-class, not an afterthought.
- **For the hosted path (Fireworks), document the data flow.** Which region inference runs in matters for GDPR/data-residency/government work; state plainly what's sent, whether it's retained, and whether it can be used for training ([Agentmelt](https://agentmelt.com/blog/ai-coding-agent-security)).
- **Default to zero data retention (ZDR).** A harness that forgets task data once the task ends shrinks the breach surface — if the data doesn't persist, it can't leak ([dev.to/ZDR](https://dev.to/alessandro_pignati/is-your-ai-agent-leaking-secrets-why-zero-data-retention-is-the-new-standard-for-enterprise-trust-3c3a)). Local logs/transcripts should be opt-in, scoped, and easy to purge.
- **Compliance hooks:** offer a DPA path for the hosted tier and document SOC 2 / GDPR considerations so enterprises can evaluate ([POSTMAN guide](https://p0stman.com/guides/ai-agent-security-data-privacy-guide-2025.html)).

## Prompt-injection defenses

Treat **all** external content the agent ingests (file contents, web pages, tool output, dependency READMEs) as untrusted — it can carry instructions that hijack the agent. From LLM to agentic AI, injection got worse because the model can now *act* on the injected instruction ([Christian Schneider](https://christian-schneider.net/blog/prompt-injection-agentic-amplification/)).

- **Defense in depth, no single silver bullet:** input validation on all data sources + output filtering + privilege restriction + human-in-the-loop for sensitive actions ([OWASP/Aikido](https://www.aikido.dev/blog/owasp-top-10-agentic-applications)).
- **Treat model output as untrusted input (OWASP LLM05).** Before agent output flows to a downstream system (shell, file write, API call), validate/encode it for that sink ([Aembit OWASP LLM Top 10](https://aembit.io/blog/owasp-top-10-llm-risks-explained/)).
- **Trust boundaries on context:** mark which parts of the prompt are trusted (system/developer) vs untrusted (fetched/tool) and never let untrusted content escalate tool permissions.
- **Goal-lock / least privilege at the tool layer:** strict tool-permission scoping, argument validation, and a policy check on every tool invocation so an injected instruction can't reach a tool the task never needed ([Promptfoo OWASP agentic](https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/)).
- **Human approval for high-impact actions:** anything touching databases, external APIs, the filesystem outside the project, or the network should require confirmation unless explicitly pre-approved ([secops.group](https://secops.group/blog/securing-agentic-ai-the-owasp-top-10-and-beyond/)).

## Tool-permission & sandbox model

Model glamfire's permissions on the proven Claude Code design ([Claude Code settings](https://code.claude.com/docs/en/settings), [Agent SDK permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)):

- **`allow` / `ask` / `deny` rules, scoped by tool**, in the form `Tool(specifier)` (e.g. `Bash(npm run test *)`, `Read(./.env)`).
- **Evaluation order: deny → ask → allow; first match wins.** A `deny` can never be overridden by an `allow`, and deny holds even in a "bypass/yolo" mode — making deny the strongest layer ([Claude Code settings](https://code.claude.com/docs/en/settings)).
- **Sandboxed execution as the real boundary.** Because deny rules can't stop a subprocess from opening files directly, run tool/command execution in an isolated environment with least privilege: restricted filesystem (project dir only), no ambient cloud creds, network egress allowlist, resource limits, and rollback capability ([OWASP/Aikido](https://www.aikido.dev/blog/owasp-top-10-agentic-applications), [secops.group](https://secops.group/blog/securing-agentic-ai-the-owasp-top-10-and-beyond/)). Containers/VMs/namespaces are the practical mechanisms.
- **Layered scopes:** managed/enterprise settings > project settings > user settings, with deny rules from any scope unioned in, so an org can enforce hard limits a user can't relax.

## Audit logging

- **Log every tool invocation** (tool, arguments, decision: allow/ask/deny, result, timestamp, actor/run id) — comprehensive logging and audit trails are an explicit OWASP control for agentic systems ([trydeepteam OWASP](https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-agentic-applications)).
- **Log prompt/response provenance** enough to investigate an injection incident, but redact secrets in the log itself; make logs tamper-evident (append-only) in server mode.
- **Make logging configurable & local-first** to respect the ZDR stance — verbose audit for enterprises, minimal/ephemeral for individuals.

## Supply-chain security

Supply-chain attacks more than doubled in 2025 (Sonatype found 454k+ new malicious packages; the self-replicating `Shai-Hulud` npm worm hit 500+ packages) — an npm/TS project is squarely in the blast radius ([Faith Forge Labs](https://faithforgelabs.com/blog_supplychain_security_2025.php), [Oligo](https://www.oligo.security/academy/ultimate-guide-to-software-supply-chain-security-in-2025)).

- **Signed releases via Sigstore** — keyless signing with short-lived OIDC-tied certs; free and CI-native, lets users verify glamfire artifacts/images ([AquilaX](https://aquilax.ai/blog/supply-chain-artifact-signing-slsa)).
- **Publish an SBOM** (CycloneDX/SPDX) per release — the parts list (deps, versions, licenses, checksums) so downstreams can scan for known-vulnerable components ([Trantor](https://www.trantorinc.com/blog/software-supply-chain-security-sbom-slsa-engineering-teams)).
- **SLSA build provenance** — target SLSA Level 2 (build provenance from GitHub Actions); achievable in ~1–2 days and it blunts the most common attack patterns ([AquilaX](https://aquilax.ai/blog/supply-chain-artifact-signing-slsa), [Nathan Berg](https://nathanberg.io/posts/supply-chain-security-ci-sbom-slsa-sigstore/)).
- **Dependency hygiene:** pin/lockfile, enable npm provenance, automated dependency + secret scanning in CI, minimal deps, and review of new transitive packages.

## Practical hardening checklist

- [ ] Secrets in env/secret-manager only; never committed, never in images; egress redaction scrubs secrets from prompts and logs.
- [ ] Default-deny reads on `.env`/keys/credential stores.
- [ ] Self-hosted (vLLM/SGLang) path documented as the data-residency option; hosted data flow documented; ZDR default.
- [ ] Treat all file/web/tool content as untrusted; validate model output before it hits any sink.
- [ ] `allow`/`ask`/`deny` permission rules, deny-wins, with org-enforceable managed scope.
- [ ] Tool/command execution sandboxed: project-only FS, no ambient creds, network egress allowlist, resource limits.
- [ ] Human-in-the-loop approval for DB/API/network/out-of-project actions.
- [ ] Append-only, secret-redacted audit log of every tool call and permission decision.
- [ ] Releases: Sigstore-signed, SBOM published, SLSA L2 provenance, lockfiles + npm provenance, CI dependency/secret scanning.

## Key takeaways for glamfire

- The agent's privileges *are* the attack surface: assume injected instructions will arrive via files/web/tool output and design so they can't reach tools or data the task didn't authorize.
- Permissions (deny-wins rules) and a real sandbox are complementary — rules express intent, the sandbox enforces it even against subprocesses.
- Self-hosting + ZDR is glamfire's differentiated privacy pitch; make it the default narrative for regulated users.
- Bake supply-chain integrity (Sigstore signing + SBOM + SLSA L2) into release CI from day one — cheap now, credibility-defining later.

## Sources

- OWASP Top 10 for Agentic Applications (2026): https://www.aikido.dev/blog/owasp-top-10-agentic-applications
- Securing Agentic AI — OWASP and Beyond: https://secops.group/blog/securing-agentic-ai-the-owasp-top-10-and-beyond/
- OWASP Top 10 for LLM Applications (2025): https://aembit.io/blog/owasp-top-10-llm-risks-explained/
- Promptfoo — OWASP Agentic AI: https://www.promptfoo.dev/docs/red-team/owasp-agentic-ai/
- DeepTeam — OWASP Top 10 for Agents: https://www.trydeepteam.com/docs/frameworks-owasp-top-10-for-agentic-applications
- Prompt injection got worse (agentic amplification): https://christian-schneider.net/blog/prompt-injection-agentic-amplification/
- Claude Code — Settings & permissions: https://code.claude.com/docs/en/settings
- Claude Agent SDK — Configure permissions: https://platform.claude.com/docs/en/agent-sdk/permissions
- AI Coding Agent Security & Privacy (Agentmelt): https://agentmelt.com/blog/ai-coding-agent-security
- IronCore — AI Coding Agents privacy line: https://ironcorelabs.com/blog/2026/ai-coding-agents-drawing-the-line/
- Knostic — Securing AI coding assistants: https://www.knostic.ai/blog/ai-coding-assistant-security
- Zero Data Retention as enterprise standard: https://dev.to/alessandro_pignati/is-your-ai-agent-leaking-secrets-why-zero-data-retention-is-the-new-standard-for-enterprise-trust-3c3a
- AI Agent Security: GDPR/HIPAA/SOC 2 (POSTMAN): https://p0stman.com/guides/ai-agent-security-data-privacy-guide-2025.html
- Supply Chain Security beyond SBOMs — Sigstore/SLSA (AquilaX): https://aquilax.ai/blog/supply-chain-artifact-signing-slsa
- SBOM/SLSA/Actions (Trantor): https://www.trantorinc.com/blog/software-supply-chain-security-sbom-slsa-engineering-teams
- Supply-chain security 2025 baseline (Faith Forge Labs): https://faithforgelabs.com/blog_supplychain_security_2025.php
- Ultimate Guide to Software Supply Chain Security 2025 (Oligo): https://www.oligo.security/academy/ultimate-guide-to-software-supply-chain-security-in-2025
- Supply Chain Security in CI — SBOM/SLSA/Sigstore (Nathan Berg): https://nathanberg.io/posts/supply-chain-security-ci-sbom-slsa-sigstore/
