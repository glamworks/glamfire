# World-Class Open-Source Governance for glamfire / glamworks

> Research note for **glamworks** (org) and **glamfire** (a test/eval harness that could
> plausibly be SaaS-wrapped by third parties). Compiled June 2026.
> The recommendations in [Key takeaways](#key-takeaways-for-glamfireglamworks) are tailored
> to a harness that is meant to be *adopted widely* yet not trivially *resold as a hosted
> service* without giving back.

---

## 1. License choice

The single most consequential governance decision. For glamfire the tension is the classic
one: **maximize adoption** (permissive) vs **protect against a closed-source SaaS fork**
(copyleft / network-copyleft). The three serious OSI-approved candidates are MIT, Apache-2.0,
and AGPL-3.0, with SSPL/BSL/Elastic as non-OSI "source-available" alternatives.

### MIT — maximum permissiveness, zero protection
- ~3 short paragraphs; do anything as long as you preserve the copyright + license notice.
- **No patent grant** at all. A contributor (or their employer) could later assert a patent
  covering code they contributed. This is the biggest practical gap vs Apache-2.0.
- Best when the goal is the *widest possible* adoption and you don't care that someone wraps
  it in a proprietary SaaS. Common for small libraries and reference implementations.
- Adoption: highest. Protection: none.

### Apache-2.0 — the permissive default for anything non-trivial
- Permissive like MIT (no copyleft; proprietary/SaaS use is fine) **plus** three things MIT lacks:
  - **Explicit patent grant** (§3): every contributor grants users a "perpetual, worldwide,
    non-exclusive, no-charge, royalty-free, irrevocable" patent license for their contribution.
  - **Patent retaliation / termination**: if you sue alleging the software infringes your patent,
    your patent license terminates. This deters patent aggression.
  - **NOTICE-file attribution** and an explicit statement-of-changes requirement.
- The de-facto choice for foundation and enterprise-friendly projects (Kubernetes, most CNCF/ASF
  projects, Android, Swift). Lawyers like it because the patent picture is explicit.
- Adoption: very high (enterprise-safe). Protection against SaaS rewrap: still none (a third party
  can host glamfire as a paid service without sharing changes).
- Refs: [Apache License 2.0 explained (Snyk)](https://snyk.io/articles/apache-license/),
  [Apache 2.0 guide (Wiz)](https://www.wiz.io/academy/compliance/apache-2-license).

### AGPL-3.0 — copyleft that closes the "SaaS loophole"
- Strong copyleft (like GPLv3: derivative works must be AGPL and ship source) **plus the §13
  network clause**: if you *modify* the software and let users interact with it **over a network**,
  you must offer those users the **complete corresponding source** of your modified version.
- GPLv2/GPLv3 are triggered by *distribution*; SaaS never "distributes" a binary, so a hosted
  service escapes GPL obligations — the so-called **cloud / SaaS / ASP loophole**. AGPL §13 is
  the patch that closes it: running a modified version as a service counts.
- Also contains an explicit patent grant (inherited from GPLv3), so the patent posture is as
  strong as Apache-2.0.
- **Adoption cost**: many corporate legal departments *ban AGPL outright* for fear the copyleft
  "infects" their own code if they integrate it. Google's open-source policy famously forbids
  AGPL. For a *library* this is fatal; for a *standalone harness/tool/server* run as-is it is
  much less of a problem, because using a tool is not the same as linking a library into your
  product. This distinction matters a lot for glamfire.
- This is the **commercial-OSS standard for hosted products in 2026**: Grafana, Mattermost,
  Bitwarden, Nextcloud, and (after their U-turns) Elasticsearch and Redis all use AGPL, usually
  with a **dual-license** (AGPL for the community, a paid commercial license for companies that
  want to embed it without the copyleft obligation). Dual licensing requires the project to hold
  the rights to relicense — which is exactly why such projects use a **CLA** (see §2).
- Adoption: lower (legal friction). Protection: high — a competitor hosting a *modified* glamfire
  must publish their changes.
- Refs: [GNU AGPL FAQ / why AGPL](https://www.gnu.org/licenses/why-affero-gpl.html),
  [OSS licensing MIT vs Apache vs AGPL 2026 (OSSAlt)](https://ossalt.com/guides/oss-licensing-guide-mit-apache-agpl-2026).

### Non-OSI "source-available" alternatives — protection at the cost of being "open source"
These are **not OSI-approved and not "open source"** by the Open Source Definition (they
discriminate against a field of use — namely cloud providers). They buy revenue protection but
fragment community trust.

- **SSPL (Server Side Public License)** — MongoDB's GPLv3 derivative. §13 is dramatically broader
  than AGPL: offering the software *as a service* requires releasing the source of **the entire
  service stack** (management, orchestration, monitoring, APIs — everything needed to run it).
  Rejected by OSI; Debian/Fedora treat it as non-free. MongoDB, and briefly Elastic and Redis.
- **BSL / Business Source License 1.1** — MariaDB's parameterized license. Source-available with a
  use-limitation grant (typically "you may not offer a competing hosted service"), and a
  **time-delayed conversion**: after a "Change Date" (commonly 3–4 years, capped at 4) each release
  automatically relicenses to a true OSS license (often Apache-2.0 or GPL). Used by HashiCorp
  (Terraform/Vault, 2023), Sentry, CockroachDB, Couchbase.
- **Elastic License v2 (ELv2)** — simple source-available license: do almost anything **except**
  (a) provide it as a hosted/managed service, (b) circumvent license keys, (c) remove notices.
- **Tradeoffs**: all three deter AWS-style "strip-mining" but trigger community backlash, exclusion
  from Linux distros, and contributor mistrust. The 2024–2026 trend is telling: **Elastic returned
  to AGPL (added Aug/Sep 2024) and Redis returned to AGPLv3 (2025)** after SSPL backlash — strong
  signal that **AGPL is the sweet spot** for "open but SaaS-protected." See
  [Server Side Public License (Wikipedia)](https://en.wikipedia.org/wiki/Server_Side_Public_License),
  [Legal risks of source-available licenses (TermsFeed)](https://www.termsfeed.com/blog/legal-risks-source-available-licenses/),
  [Elastic license FAQ](https://www.elastic.co/pricing/faq/licensing),
  [Elastic adds AGPL](https://www.elastic.co/blog/elastic-license-v2).

### Adoption-vs-protection summary

| License | OSI OSS? | Patent grant | SaaS rewrap protection | Corporate-legal friction | Typical use |
|---|---|---|---|---|---|
| MIT | Yes | No | None | Minimal | Small libs, reference code |
| Apache-2.0 | Yes | **Yes** (+retaliation) | None | Minimal | Enterprise/foundation projects |
| AGPL-3.0 | Yes | Yes | **High** (network copyleft) | High (often banned for libs) | Commercial-OSS hosted products |
| SSPL | No | Yes | Very high | Very high | DB vendors (MongoDB) |
| BSL 1.1 | No (until Change Date) | Varies | High (time-limited) | High | Infra vendors (HashiCorp) |
| Elastic v2 | No | — | High | High | Elastic, others |

---

## 2. CLA vs DCO

How you take in contributions while keeping the legal right to ship them (and, if dual-licensing,
to relicense them).

### DCO — Developer Certificate of Origin
- A lightweight, **per-commit attestation**, not a contract. The contributor adds a
  `Signed-off-by: Name <email>` trailer (via `git commit -s`), certifying the
  [DCO 1.1 text](https://developercertificate.org/): "I have the right to submit this under the
  open source license indicated."
- Created by the Linux Foundation in 2004 after the SCO–Linux litigation; used by the **Linux
  kernel, GitLab, Docker/Moby, Chef, and many CNCF projects** (CNCF lets projects pick DCO or CLA;
  DCO is the lighter path).
- **Pros**: near-zero friction, no copyright assignment, no database of signed agreements,
  no corporate legal review needed to start contributing. Keeps contributors as copyright holders.
- **Cons**: it does **not** grant the project the right to **relicense** later. If glamfire ever
  wants to **dual-license** (AGPL + commercial), a DCO alone is insufficient — every contributor
  would have to agree to the relicense. So DCO and "AGPL + commercial license" don't combine well.
- **Tooling**: the [DCO GitHub App / Probot DCO bot](https://github.com/apps/dco) blocks PRs whose
  commits lard the sign-off; many projects enforce it as a required status check.
- Refs: [The DCO is not a CLA (Kyle Mitchell)](https://writing.kemitchell.com/2021/07/02/DCO-Not-CLA),
  [DCO vs CLA (Opensource.com)](https://opensource.com/article/18/3/cla-vs-dco-whats-difference),
  [DCO (Wikipedia)](https://en.wikipedia.org/wiki/Developer_Certificate_of_Origin).

### CLA — Contributor License Agreement
- A **signed legal agreement** between contributor (and often their employer) and the project.
  Two flavors:
  - **License CLA** (e.g. Apache ICLA/CCLA): contributor *keeps* copyright but grants the project a
    broad, irrevocable copyright + patent license — including the right to sublicense/relicense.
  - **Copyright-assignment CLA**: contributor *transfers* copyright to the project/foundation
    (FSF historically; more contentious).
- Used by projects with heavy institutional/commercial backing: **Apache (ICLA), Google projects,
  CNCF (its EasyCLA), MongoDB, Elastic, Grafana, and most dual-licensed commercial-OSS companies.**
- **Pros**: gives the steward the legal certainty and **relicensing rights** needed to offer a
  commercial license, defend the project, or change licenses; explicit patent grant.
- **Cons**: real **contribution friction** — a one-time signature (often requiring corporate
  sign-off) is a barrier, especially for drive-by fixes; the project must store and maintain the
  signature records; seen by some as a corporate "rights grab." Signed **once per contributor**,
  not per commit (the inverse of DCO).
- **Tooling**: [cla-assistant](https://github.com/cla-assistant/cla-assistant) (SAP, open source)
  and the **Linux Foundation EasyCLA** automate signing as a PR status check.
- Refs: [CLAs and DCOs (FINOS)](https://osr.finos.org/docs/bok/artifacts/clas-and-dcos),
  [All about CLAs and DCOs (ConsortiumInfo)](https://consortiuminfo.org/open-source/all-about-clas-and-dcos/).

### Rule of thumb
- **Pure community / never going to relicense → DCO.** Lighter, friendlier, modern default
  (GitLab, Docker, kernel).
- **Plan to dual-license or sell a commercial license → CLA** (you *need* relicensing rights).
- A growing middle path is the **"inbound = outbound"** principle (popularized by GitHub): no CLA,
  the act of contributing licenses the work under the same license as the project. Simple, but again
  gives you no relicensing power.

---

## 3. Code of Conduct (Contributor Covenant) and enforcement

- The **[Contributor Covenant](https://www.contributor-covenant.org/)** is the de-facto standard,
  adopted by thousands of communities including the Linux kernel, Kubernetes, Rust, and Mastodon
  ("9 of the 10 largest open source projects"). Text is **CC BY-SA 4.0** — just attribute it.
- **Contributor Covenant 3.0** was released **28 July 2025** by the Organization for Ethical Source
  ([announcement](https://ethicalsource.dev/blog/contributor-covenant-3/)). Key changes vs 2.x:
  - Enforcement section reframed as **"Addressing and Repairing Harm"** along **restorative-justice**
    lines, including pathways to safely **reintegrate** someone after an incident.
  - Clearer, **less US-centric** language that is easier to translate and applies to offline events.
- **Enforcement ladder (3.0)** — four escalating rungs, skippable by severity:
  1. **Warning** — private written warning.
  2. **Temporarily Limited Activities** — time-limited cooldown / restricted participation.
  3. **Temporary Suspension** — conditions-based suspension for patterns or serious violations.
  4. **Permanent Ban**.
  ([CoC 3.0 text](https://www.contributor-covenant.org/version/3/0/code_of_conduct/))
- **Enforcement is the hard part, not adoption.** A CoC is worthless without:
  - A **real, monitored reporting channel** (a dedicated alias like `conduct@glamworks.dev`, not a
    public issue), with named, accountable moderators.
  - A documented response process (acknowledge fast, investigate, decide, record).
  - **Conflict-of-interest handling** (reports about a maintainer go to others).
  - Transparency reports where feasible. Larger projects stand up a dedicated **CoC committee**
    (Rust, Python, Kubernetes all have one).

---

## 4. Governance models

Governance defines **who decides, how, and how leaders are chosen**. Projects typically *start*
informal (one or two maintainers) and formalize as they grow and as more organizations depend on them.

### BDFL — Benevolent Dictator For Life
- One founder holds final say; works well early because it's fast and coherent. Linux (Linus
  Torvalds) is the canonical survivor.
- **Failure mode = bus factor + burnout + succession.** Python's Guido van Rossum resigned as BDFL
  in 2018; the project replaced him via **[PEP 8016](https://peps.python.org/pep-8016/)** with a
  **5-member elected Steering Council** governing the **PEP** (Python Enhancement Proposal) process.
  A cautionary tale: plan the transition *before* you need it.

### Meritocracy / "do-ocracy"
- Influence is earned through sustained, valued contribution; "whoever does the work decides how."
- The **Apache Software Foundation "Apache Way"** is the archetype: contributor → **committer**
  (write access, earned by merit) → **PMC** (Project Management Committee, the governing body) →
  **ASF Member**. Decisions use **lazy consensus** and **voting** (`+1/0/-1`; a `-1` on code is a
  veto that must be justified). Projects are vendor-neutral and run by the PMC, not a company.
  ([How the ASF works](https://www.apache.org/foundation/how-it-works/)).
- Criticism: "meritocracy" can entrench insiders; modern projects pair it with explicit roles,
  CoC, and diversity efforts.

### Teams + RFCs (Rust)
- **[Rust governance](https://rust-lang.org/governance/)**: autonomous **teams** (language, compiler,
  libs, infra, etc.) own their domains. Substantial changes go through the public **RFC process**
  ([rust-lang/rfcs](https://github.com/rust-lang/rfcs)): write-up → open discussion → team **FCP
  (Final Comment Period)** → decision. After the 2021 core-team crisis, governance was rebuilt via
  **[RFC 3392 — the Leadership Council](https://rust-lang.github.io/rfcs/3392-leadership-council.html)**:
  representatives from each top-level team, designed to delegate (not centralize) and to handle
  cross-cutting concerns. A great template for a tool that wants structured, transparent,
  community-scalable decision-making.

### Technical Steering Committee (Node.js)
- **[Node.js governance](https://nodejs.org/en/about/governance)** under the **OpenJS Foundation**:
  a **TSC** owns technical direction per the
  **[TSC Charter](https://github.com/nodejs/TSC/blob/main/TSC-Charter.md)**; **Collaborators**
  (commit access, earned) do most work; **Working Groups** have broad self-governance. Consensus-
  seeking with a voting fallback. A neutral foundation prevents single-vendor capture.

### SIGs under a Steering Committee (Kubernetes)
- **[Kubernetes governance](https://github.com/kubernetes/community/blob/master/governance.md)**:
  an elected **Steering Committee** sets overall direction and charters; day-to-day work happens in
  **SIGs (Special Interest Groups)** — Network, Storage, Docs, etc. — each with a **charter**
  defining scope, roles, and decision process, plus **Working Groups** and **subprojects**. Scales
  across thousands of contributors and many companies; the gold standard for a large multi-vendor
  ecosystem.

### Foundations as a neutral home
- For projects that become critical infrastructure, donating to a foundation (**Linux Foundation /
  CNCF, Apache, OpenJS, NumFOCUS**) provides vendor-neutral IP ownership, legal/CLA infrastructure,
  trademark protection, and CI/funding. The cost is process overhead and ceding some control.

### Choosing
- Start **BDFL/maintainer-led** for velocity, but **write down the rules early** (a `GOVERNANCE.md`),
  define a path from contributor → committer/maintainer, and pre-plan succession so you don't repeat
  Python's scramble. Graduate to a steering committee / teams model as the contributor base and the
  number of dependent organizations grow.

---

## 5. CONTRIBUTING best practices

A good `CONTRIBUTING.md` (GitHub surfaces it automatically on new issues/PRs) should make the first
contribution *fast and unambiguous*:

- **Frictionless dev setup**: one documented path from clone → build → test (ideally a single
  `make setup` / devcontainer / Nix flake). The more steps, the fewer contributors.
- **"good first issue" + "help wanted" labels**, curated by maintainers to teach repo norms without
  requiring whole-codebase understanding. GitHub aggregates these
  ([forgoodfirstissue](https://forgoodfirstissue.github.com/),
  [goodfirstissue.dev](https://goodfirstissue.dev/),
  [GitHub "good-first-issue" topic](https://github.com/topics/good-first-issue)).
- **Issue & PR templates** in `.github/ISSUE_TEMPLATE/` (bug/feature **forms** with required fields)
  and `.github/pull_request_template.md`. Good PR descriptions follow
  **summary → motivation → how to test → screenshots/logs**, with a checklist (tests added, docs
  updated, CoC/DCO acknowledged).
- **Clear review process & expectations**: who reviews, target response time, how decisions are made,
  how to get unblocked. **CODEOWNERS** to auto-route reviews.
- **Definition of done**: lint/format/test/CI gates that run on every PR so contributors get fast,
  automated feedback before a human looks.
- **Recognition**: changelog credits, `all-contributors`, maintainer ladder so contributors can grow
  into committers.
- Exemplary references: **Kubernetes** (`kubernetes/community`, contributor guide + SIG onboarding),
  **Rust** (`rustc-dev-guide`, RFC book), **first-contributions** (a hands-on PR tutorial repo),
  and well-documented tools like **VS Code** and **Jest**.

---

## 6. Security policy

- **`SECURITY.md`** (in repo root, `docs/`, or `.github/`) tells reporters **how and where** to
  report privately, scope, supported versions, and expected response time. GitHub surfaces it under
  the **Security** tab. If reporters can't find a channel, they resort to digging emails out of git
  history or, worse, full public disclosure.
- **GitHub Private Vulnerability Reporting (PVR)** — enable it per-repo (or org-wide). Gives a
  private, structured report form right in the repo, separate from public issues
  ([docs: privately reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)).
- **GitHub Security Advisories** — maintainers work the fix in a **private draft advisory** (a
  temporary private fork), can request a **CVE**, then publish; publishing feeds the **GitHub
  Advisory Database** and Dependabot alerts downstream.
- **Coordinated Vulnerability Disclosure (CVD)**: reporter privately contacts the security contact;
  both parties coordinate a fix and an embargo, then disclose together once a patch ships. Maintainer
  best practices: **acknowledge receipt fast** (even before triage), give a timeline, credit the
  reporter, and keep the fix private until release.
  ([GitHub: coordinated disclosure](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/about-coordinated-disclosure-of-security-vulnerabilities),
  [GitHub blog: CVD for OSS](https://github.blog/security/vulnerability-research/coordinated-vulnerability-disclosure-cvd-open-source-projects/)).
- For a harness that may run untrusted models/test code, **also document the threat model and a
  safe-harbor statement** so good-faith researchers know they won't be pursued legally.

---

## 7. Release automation

Predictable, automated releases build trust and reduce maintainer toil. Building blocks:

- **[SemVer 2.0.0](https://semver.org/)** — `MAJOR.MINOR.PATCH`: breaking / feature / fix. The
  contract that lets downstreams pin and upgrade safely. Pre-1.0 (`0.y.z`) signals an unstable API —
  reasonable for early glamfire, but commit to graduating to 1.0 when the API stabilizes.
- **[Conventional Commits](https://www.conventionalcommits.org/)** — structured commit messages
  (`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE:`) that machines can map to SemVer bumps and changelogs.
- Tooling choices:
  - **[semantic-release](https://github.com/semantic-release/semantic-release)** — fully automated:
    on merge to main it parses Conventional Commits, computes the next version, writes the changelog,
    tags, and publishes. Maximum automation, zero human gate. Risk: a stray `feat:` can ship a release
    you didn't intend, and changelog quality depends entirely on commit hygiene.
  - **[Changesets](https://github.com/changesets/changesets)** — *intent-based*: contributors add a
    changeset file in the PR declaring the bump type and a human-written summary; a bot opens a
    "Version Packages" PR you review before publishing. **Best monorepo / independent-versioning story**
    and far better changelogs; slightly more contributor effort.
  - **[Release Please](https://github.com/googleapis/release-please)** (Google) — Conventional-Commits
    driven but keeps a human gate: it maintains a release PR you approve to cut the release. A nice
    middle ground.
  - **[release-it](https://github.com/release-it/release-it)** — flexible, more manual/local.
- Pattern recommendation: **Conventional Commits + SemVer** as the foundation, then **Changesets**
  (if monorepo or you value curated changelogs / explicit release intent) or **semantic-release**
  (if you want fully hands-off single-package releases). Refs:
  [Changesets vs semantic-release (Schiller)](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/),
  [NPM release automation guide (Popov)](https://oleksiipopov.com/blog/npm-release-automation/).

---

## 8. What top-notch repos do (concrete examples)

- **Clear mission + "why"** above the fold in the README; a short, opinionated value statement
  (Rust: "empowering everyone to build reliable and efficient software").
- **A real `GOVERNANCE.md`** (Node.js, Kubernetes, Rust) so newcomers and companies know how
  decisions get made and how to gain influence.
- **A contributor ladder**: explicit roles and the path between them (Kubernetes
  member→reviewer→approver; ASF contributor→committer→PMC).
- **`/.github` hygiene**: issue forms, PR template, `CODEOWNERS`, `SUPPORT.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, funding links.
- **Docs as a first-class product**: a docs site (not just README), architecture/design docs, an
  RFC/PEP/ADR process for big changes (Rust RFC book, Python PEPs, many projects use lightweight ADRs).
- **Automated quality gates**: CI on every PR, DCO/CLA bot, semantic-release/changesets, dependency
  and vulnerability scanning (Dependabot/Renovate), reproducible dev environment.
- **Public roadmap + regular releases** so users can plan; transparent decision logs / meeting notes
  (Kubernetes SIG notes, Node TSC minutes).

---

## Key takeaways for glamfire / glamworks

glamfire is a **standalone harness/tool that others might host as a SaaS** — not a library that
companies embed deep in their own products. That profile changes the usual "just use Apache-2.0"
advice, because AGPL's biggest downside (corporate bans on *linking* copyleft code) largely doesn't
apply to running a *tool as-is*.

1. **License → AGPL-3.0, with an optional commercial license (dual-license).**
   - The whole point is that glamfire "could be SaaS-wrapped by others." AGPL §13 means a competitor
     who *modifies* glamfire and offers it as a hosted service must publish their changes — closing
     the SaaS loophole while staying genuine **OSI open source** (unlike SSPL/BSL/ELv2, which fragment
     community trust). The 2024–2026 reversals of **Elastic and Redis back to AGPL** validate this as
     the protection-without-going-proprietary sweet spot.
   - Reserve the option to offer a **paid commercial license** to companies that want to embed
     glamfire without AGPL obligations — the standard Grafana/Mattermost playbook.
   - If, instead, the priority becomes *maximum* adoption (e.g. you want glamfire embedded as a
     library inside other test frameworks and CI vendors), fall back to **Apache-2.0** for its
     explicit patent grant and zero legal friction — but accept you give up SaaS protection. Pick AGPL
     if protection matters more than ubiquity; Apache-2.0 if ubiquity matters more. **Do not use MIT**
     (no patent grant) and **avoid SSPL/BSL/ELv2** (not OSS, community-toxic).

2. **Contributions → CLA (DCO is not enough here).**
   - Because the recommendation is **AGPL + a commercial license**, you **must** be able to
     relicense contributed code — which a DCO does *not* grant. Use a **license CLA** (Apache-ICLA
     style: contributors keep copyright, grant glamworks broad rights including relicensing),
     automated with **cla-assistant** or **LF EasyCLA** as a PR status check.
   - If glamfire later commits to **AGPL-only forever** (no commercial license), switch to a **DCO**
     (`git commit -s`, enforced by the DCO bot) for lower friction. State the choice explicitly so
     contributors aren't surprised.

3. **Governance → start maintainer-led, but write `GOVERNANCE.md` from day one.**
   - Run BDFL/core-maintainer for velocity early, but immediately publish a `GOVERNANCE.md` with a
     **contributor→committer→maintainer ladder** and a **succession/tie-break rule** (learn from
     Python's BDFL scramble). As contributors and dependent orgs grow, graduate to a small
     **Steering Committee + teams/SIGs** model (Rust/Node/Kubernetes pattern), and consider a neutral
     foundation (Linux Foundation/CNCF) if glamfire becomes critical infrastructure.

4. **Adopt the full hygiene kit now (cheap, high-trust):**
   - **`CODE_OF_CONDUCT.md`** = Contributor Covenant 3.0, with a *real* monitored
     `conduct@glamworks.*` alias and a named CoC contact/committee.
   - **`SECURITY.md`** + enable **GitHub Private Vulnerability Reporting** and use draft Security
     Advisories for coordinated disclosure; include a threat model + safe-harbor for researchers
     (important for a harness that executes untrusted test/model code).
   - **`CONTRIBUTING.md`** with one-command dev setup, curated `good first issue` labels, issue forms,
     and a PR template.
   - **Conventional Commits + SemVer**, automated with **Changesets** (curated changelogs / monorepo-
     ready) or **semantic-release** (fully hands-off) — pick based on whether you want a human gate.
   - A README that leads with a crisp **mission**, a public **roadmap**, and an **ADR/RFC** process
     for substantial changes.

---

## Sources

- [OSS Licensing: MIT vs Apache vs AGPL 2026 (OSSAlt)](https://ossalt.com/guides/oss-licensing-guide-mit-apache-agpl-2026)
- [Apache 2.0 License Guide (Wiz)](https://www.wiz.io/academy/compliance/apache-2-license)
- [Apache License 2.0 Explained (Snyk)](https://snyk.io/articles/apache-license/)
- [Open Source License Guide (opensourcealternatives.to)](https://www.opensourcealternatives.to/blog/open-source-license-guide)
- [Why the GNU AGPL (gnu.org)](https://www.gnu.org/licenses/why-affero-gpl.html)
- [Server Side Public License (Wikipedia)](https://en.wikipedia.org/wiki/Server_Side_Public_License)
- [Legal Risks of Source-Available Licenses: SSPL, BSL, and Beyond (TermsFeed)](https://www.termsfeed.com/blog/legal-risks-source-available-licenses/)
- [Elastic Licensing FAQ](https://www.elastic.co/pricing/faq/licensing)
- [Introducing Elastic License v2; SSPL remains an option (Elastic)](https://www.elastic.co/blog/elastic-license-v2)
- [The Open Source License Change Pattern: MongoDB to Redis 2018–2026 (SoftwareSeni)](https://www.softwareseni.com/the-open-source-license-change-pattern-mongodb-to-redis-timeline-2018-to-2026-and-what-comes-next/)
- [Developer Certificate of Origin (developercertificate.org)](https://developercertificate.org/)
- [Developer Certificate of Origin (Wikipedia)](https://en.wikipedia.org/wiki/Developer_Certificate_of_Origin)
- [The DCO is Not a CLA (Kyle Mitchell)](https://writing.kemitchell.com/2021/07/02/DCO-Not-CLA)
- [CLA vs DCO: What's the difference? (Opensource.com)](https://opensource.com/article/18/3/cla-vs-dco-whats-difference)
- [CLAs and DCOs (FINOS)](https://osr.finos.org/docs/bok/artifacts/clas-and-dcos)
- [All About CLAs and DCOs (ConsortiumInfo)](https://consortiuminfo.org/open-source/all-about-clas-and-dcos/)
- [cla-assistant (GitHub)](https://github.com/cla-assistant/cla-assistant)
- [DCO GitHub App](https://github.com/apps/dco)
- [Contributor Covenant](https://www.contributor-covenant.org/)
- [Contributor Covenant 3.0 Code of Conduct](https://www.contributor-covenant.org/version/3/0/code_of_conduct/)
- [Announcing Contributor Covenant 3.0 (Ethical Source)](https://ethicalsource.dev/blog/contributor-covenant-3/)
- [Rust Governance](https://rust-lang.org/governance/)
- [RFC 3392 — Rust Leadership Council](https://rust-lang.github.io/rfcs/3392-leadership-council.html)
- [rust-lang/rfcs](https://github.com/rust-lang/rfcs)
- [Node.js Project Governance](https://nodejs.org/en/about/governance)
- [Node.js TSC Charter](https://github.com/nodejs/TSC/blob/main/TSC-Charter.md)
- [Kubernetes Governance (kubernetes/community)](https://github.com/kubernetes/community/blob/master/governance.md)
- [Kubernetes SIG Governance](https://github.com/kubernetes/community/blob/master/committee-steering/governance/sig-governance.md)
- [How the Apache Software Foundation works](https://www.apache.org/foundation/how-it-works/)
- [Meritocratic governance voting (OSS Watch)](http://oss-watch.ac.uk/resources/meritocraticgovernancevoting)
- [PEP 8016 — The Steering Council Model (Python)](https://peps.python.org/pep-8016/)
- [Open Source Governance Models Explained (Ferreira)](https://iferreiradev.medium.com/open-source-governance-models-explained-723a3ffd59b6)
- [Understanding Open Source Governance Models (Red Hat)](https://www.redhat.com/en/blog/understanding-open-source-governance-models)
- [For Good First Issue (GitHub)](https://forgoodfirstissue.github.com/)
- [goodfirstissue.dev](https://goodfirstissue.dev/)
- [GitHub "good-first-issue" topic](https://github.com/topics/good-first-issue)
- [first-contributions tutorial repo](https://github.com/firstcontributions/first-contributions)
- [About Coordinated Disclosure of Security Vulnerabilities (GitHub Docs)](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/about-coordinated-disclosure-of-security-vulnerabilities)
- [Privately Reporting a Security Vulnerability (GitHub Docs)](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
- [Coordinated Vulnerability Disclosure for OSS (GitHub Blog)](https://github.blog/security/vulnerability-research/coordinated-vulnerability-disclosure-cvd-open-source-projects/)
- [A Maintainer's Guide to Vulnerability Disclosure (GitHub Blog)](https://github.blog/security/vulnerability-research/a-maintainers-guide-to-vulnerability-disclosure-github-tools-to-make-it-simple/)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [semantic-release (GitHub)](https://github.com/semantic-release/semantic-release)
- [Changesets (GitHub)](https://github.com/changesets/changesets)
- [Release Please (GitHub)](https://github.com/googleapis/release-please)
- [Changesets vs Semantic Release (Brian Schiller)](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/)
- [The Ultimate Guide to NPM Release Automation (Oleksii Popov)](https://oleksiipopov.com/blog/npm-release-automation/)
- [Intentional Releases: Changesets over Semantic-Release (Infra Bootstrap Tools)](https://xnok.github.io/infra-bootstrap-tools/blog/intentional-releases-changesets/)
