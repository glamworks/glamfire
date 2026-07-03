# Security Policy

glamfire touches company context, credentials, and tool execution. We take security
seriously — see [`research/21-security-privacy.md`](research/21-security-privacy.md) for
the full threat model.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately via GitHub Security Advisories
([Report a vulnerability](https://github.com/glamworks/glamfire/security/advisories/new))
or email **security@glamworks.dev**. We aim to acknowledge within 72 hours and to keep
you updated through remediation. Coordinated disclosure; we credit reporters who want it.

## Scope highlights

- **Model output is attacker‑controllable.** Treat retrieved/external content as
  untrusted; tool‑use is gated by the permission model and a real sandbox.
- **Secrets** live in the OS keychain or env — never in the context store, run logs, or
  telemetry. Report any leak path as a vulnerability.
- **Data sovereignty.** The context store stays local/in‑your‑infra; only the inference
  prompt for a call crosses the wire to the provider you chose.
- **Supply chain.** Releases are signed with an SBOM; report tampering or dependency
  confusion risks.

## Supported versions

While glamfire is pre‑1.0, the latest tagged release receives security fixes.
