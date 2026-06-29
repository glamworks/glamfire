# 11 — Cross-Platform Distribution & Packaging

**Project:** glamfire (`glam` CLI) — OSS, cross-platform (macOS / Windows / Linux) AI agentic harness.
**Stack assumption:** TypeScript monorepo, pnpm workspaces, Node 20+/Bun, shipped via npm + standalone single-file binaries.
**Researched:** June 2026. All tool-status claims verified against current sources (see **Sources**).

> TL;DR: Build the binary with **`bun build --compile`** (best cross-compile + smallest, fastest single-file artifact in 2026), publish via **npm** (thin launcher + per-platform optional-dependency binaries, the esbuild pattern), and fan out to **Homebrew cask, Scoop, winget, AUR, and Docker** automatically from **one tagged GitHub Actions release** driven by **GoReleaser** (which natively understands Bun/Deno/npm in 2026). Sign + notarize on macOS, sign on Windows via **Azure Artifact Signing** (formerly Trusted Signing).

---

## 1. Single-file binary compilation — the four contenders

This is the core decision: how do we turn TypeScript into a self-contained `glam` executable that runs with no pre-installed runtime?

### 1.1 `bun build --compile` — **recommended primary**

Bun bundles your entry point together with the Bun runtime into one executable.

- **Cross-compilation:** First-class and mature in 2026. A single host (e.g. a macOS or Linux CI runner) can emit binaries for every target via `--target`:
  - `bun-darwin-arm64`, `bun-darwin-x64` (+ `-baseline`)
  - `bun-linux-x64`, `bun-linux-arm64`, plus `-musl` variants (`bun-linux-x64-musl`, `bun-linux-arm64-musl`) for Alpine/static
  - `bun-windows-x64` (+ `-baseline`), `bun-windows-arm64`
  - `-modern` (AVX2 / Haswell+ 2013+) vs `-baseline` (pre-2013 CPUs) tiers
  - Bun 1.3.14 (May 2026) also added FreeBSD and Android targets.
- **Syntax:**
  ```bash
  bun build --compile --target=bun-linux-x64        ./src/cli.ts --outfile dist/glam-linux-x64
  bun build --compile --target=bun-windows-x64       ./src/cli.ts --outfile dist/glam.exe
  bun build --compile --target=bun-darwin-arm64      ./src/cli.ts --outfile dist/glam-darwin-arm64
  # production: shrink + faster cold start
  bun build --compile --minify --bytecode --sourcemap ./src/cli.ts --outfile dist/glam
  ```
- **Startup time:** Fastest of the four for a JS CLI. `--bytecode` pre-parses JS at build time, documented ~**2x faster startup** by moving V8 parse cost off the hot path. Bun's own process startup is also lower than Node's.
- **Binary size:** Includes the Bun runtime; expect roughly ~55–95 MB before, less with `--minify --bytecode`. Comparable to Deno, generally smaller and faster to start than Node SEA for equivalent apps.
- **Native modules:** N-API `.node` addons can be embedded ("you can embed `.node` files into executables"). SQLite can be embedded via an `embed: "true"` import attribute. Caveat: tooling like `@mapbox/node-pre-gyp` needs the `.node` required directly to bundle correctly.
- **Important limitations:**
  - Single entrypoint only; no `--no-bundle`; `--target=node`/browser not supported with `--compile`.
  - **Windows metadata/icon flags (`--windows-icon`, `--windows-hide-console`) cannot be set when cross-compiling** — set them on a native Windows runner, or sign/edit metadata in a Windows job.
  - You ship the Bun runtime, so any Node API Bun hasn't implemented is a risk — test the real CLI on each OS.

### 1.2 Node.js SEA (Single Executable Applications) — **viable, now stable**

- **Status (2026):** No longer experimental. SEA is **stable since Node 22, significantly improved in Node 24**, and Node **25.5.0 added a one-step `--build-sea` flag** that replaces the old three-step dance (`--experimental-sea-config` blob → copy node binary → `postject` inject). See Joyee Cheung's Jan 2026 writeup.
- **What it is:** A copy of the Node binary with your bundled JS embedded as a blob resource; V8 still interprets your JS at runtime (not native compilation).
- **Cross-compilation:** **Weak point.** SEA injects into a *host* Node binary, so producing a Windows `.exe` cleanly wants a Windows runner, mac wants mac, etc. You generally build each target on its own runner (matrix), unlike Bun's single-host cross-compile. There's no built-in `--target=other-os`.
- **Native modules:** Must be shipped alongside or handled manually; embedding native addons is more awkward than Bun/Deno.
- **Binary size / startup:** Largest baseline (full Node), startup ≈ normal Node cold start. No bytecode-precompile equivalent as polished as Bun's.
- **When to pick:** If glamfire wants to stay strictly on the Node runtime (max ecosystem/API fidelity) and is willing to run a per-OS build matrix. Lower runtime-compatibility risk than Bun; worse cross-compile ergonomics.

### 1.3 `vercel/pkg` — **deprecated, do not use for new work**

- **Officially deprecated since Jan 2024**; last release **5.8.1**. Vercel explicitly points users to Node's native SEA as the replacement. It cannot target modern Node versions cleanly.
- **If you must use the pattern**, the maintained community fork is **`@yao-pkg/pkg`** (yao-pkg), which tracks newer Node versions. Still, prefer Bun/SEA/Deno for a greenfield 2026 project — `pkg` is legacy.

### 1.4 `deno compile` — **strong alternative**

- **Cross-compilation:** Supported via `--target` (`x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`, etc.); output is fully self-contained.
- **Native modules (2026):** Deno 3 added full `node_modules` compatibility including **`.node` native addons**; `deno compile` detects and embeds CJS deps and `.node` addons reached at runtime.
- **Binary size:** Deno 3 cut compiled sizes ~15–20% via better tree-shaking (a simple HTTP server ≈ 45 MB). The new experimental **`--bundle`** flag runs the entry through Deno's tree-shaking bundler first instead of embedding the whole `node_modules` — big wins for npm-heavy projects.
- **When to pick:** If glamfire were Deno-first. For a pnpm/Node/Bun monorepo, Bun is the more natural fit, but Deno compile is a credible plan-B and notably good at producing a clean self-contained binary.

### 1.5 Comparison matrix

| Criterion | `bun --compile` | Node SEA | `vercel/pkg` | `deno compile` |
|---|---|---|---|---|
| Maturity (2026) | Mature, fast-moving | **Stable** (N22+), `--build-sea` (N25.5) | **Deprecated** (use `@yao-pkg`) | Mature, improved in Deno 3 |
| Cross-compile from one host | **Yes, excellent** | No (per-OS matrix) | Limited | **Yes** (`--target`) |
| Binary size | Small–medium (`--minify --bytecode`) | Largest | Medium | Medium (smaller w/ `--bundle`) |
| Startup time | **Fastest** (`--bytecode`) | Node cold start | Node cold start | Fast |
| Native `.node` addons | Yes (embed) | Manual/awkward | Yes (older) | **Yes** (Deno 3) |
| Runtime API fidelity | Bun runtime (test!) | **Full Node** | Node | Deno + node compat |
| Recommendation | **Primary** | Fallback (Node purity) | Avoid | Strong alt |

---

## 2. npm global install (`npm i -g glam`)

The lowest-friction channel for a JS audience — most glamfire users already have Node.

- **Pros:** Zero new tooling for users; trivial to publish; auto-resolves the right platform binary; `npm`/`pnpm`/`bun`/`yarn`/`npx`/`bunx` all work; easy version pinning.
- **Cons / pitfalls:**
  - **Requires Node already installed** — defeats the "no runtime needed" promise for non-JS users. (That's exactly why we *also* ship standalone binaries.)
  - **postinstall scripts are fragile and increasingly distrusted.** Many users / CI run `--ignore-scripts`; pnpm gates build scripts behind allow-lists; a postinstall that downloads a binary from a CDN can fail behind firewalls/proxies and is a supply-chain attack surface.
- **Recommended npm pattern — the esbuild model (avoid postinstall downloads):**
  - Publish a thin `glam` package whose **`optionalDependencies`** are per-platform binary packages: `@glamfire/cli-darwin-arm64`, `@glamfire/cli-linux-x64`, `@glamfire/cli-linux-x64-musl`, `@glamfire/cli-win32-x64`, etc., each with `os`/`cpu`/`libc` fields in its `package.json`.
  - npm/pnpm automatically install **only the matching** optional dependency; the main package's `bin` shim resolves and execs the correct binary. No network in postinstall, works with `--ignore-scripts`.
  - This is how esbuild, swc, Turbopack, Biome, and friends ship native binaries in 2026 — it's the de-facto standard and what GoReleaser's `npms` publisher targets.
  - Pitfalls to handle: `--no-optional` breaks it (document it); set `cpu`/`os`/`libc` correctly (musl vs glibc!); keep all sub-package versions lockstep with the launcher.

---

## 3. macOS — Homebrew tap

- **Formula vs Cask (important 2026 change):** For pre-built binaries, the ecosystem has **shifted from formulae to casks**. **GoReleaser deprecated Homebrew *formulas* in v2.10 and recommends casks.** Casks are the right vehicle for a downloaded, signed binary; formulae are increasingly reserved for build-from-source.
  - User command becomes `brew install --cask glamfire/tap/glam` (or you can keep an unbracketed alias). Migration of existing formula users is handled via `tap_migrations.json`.
- **Automating it:** Maintain a `glamfire/homebrew-tap` repo. On each GitHub release, your release tool (GoReleaser) regenerates and commits the cask (`url`, `sha256`, `version`) into the tap automatically — this is exactly how GoReleaser publishes its own cask to `goreleaser/homebrew-tap`.
- **Notes:** Casks need a code-signed + notarized binary to avoid Gatekeeper friction (see §8). Provide both `arm64` and `x64` artifacts (or a universal binary).

---

## 4. Windows — Scoop & winget

Ship to **both**; they serve different users (Scoop = dev/portable, winget = built into Windows 11).

- **Scoop:**
  - Maintain a bucket repo (`glamfire/scoop-bucket`) with a JSON manifest per app: download `url`, `hash` (SHA256), `bin`, and an `autoupdate`/`checkver` block so Scoop's autoupdate tooling can bump versions automatically.
  - GoReleaser has a native `scoops` publisher that writes the manifest into your bucket on release.
- **winget:**
  - Submit a YAML manifest (Installer/Locale/Version) to `microsoft/winget-pkgs`. winget uses SHA256 hashes and prefers signed installers.
  - Automate with **`wingetcreate`** (Microsoft's manifest tool) or GoReleaser's `winget` publisher, which opens the PR to `winget-pkgs` for you.
  - Note: winget auto-update of installed apps is still maturing (tracked upstream), so don't rely on winget alone for update delivery.

---

## 5. Linux — AUR + others

- **AUR (Arch):** Publish a **`-bin` PKGBUILD** (e.g. `glam-bin`) that downloads the prebuilt release tarball, verifies `sha256sums`, and installs the binary. GoReleaser has a native **`aurs`** publisher that generates the PKGBUILD and pushes to the AUR git repo over SSH on each release. (Optionally also a `glam` source PKGBUILD that builds from npm/bun.)
- **`.deb` / `.rpm`:** Generate with **nFPM** (GoReleaser's packager) — no need for native Debian/RPM tooling. Host the files on the GitHub release and/or a simple apt/yum repo or Cloudflare-hosted repo.
- **Snap / Flatpak:** Higher friction (confinement, store review) and aimed more at GUI desktop apps. For a developer CLI they're optional; GoReleaser can build a snap if demand appears, but treat as nice-to-have, not launch-critical.
- **Nix:** GoReleaser also has a `nix` publisher (writes a flake/derivation to a Nix user repo) — cheap to add for the Nix crowd.
- **Universal fallback:** A documented `curl -fsSL https://get.glamfire.dev | sh` install script that detects OS/arch/libc and drops the right binary into `~/.local/bin` covers every distro and containers without a package manager.

---

## 6. Docker images

- **Pattern:** Multi-stage build. Build/bundle in a `bun`/`node` builder stage, then copy a single self-contained binary into a minimal runtime.
- **Base image choices (2026):**
  - **`scratch`** — best when shipping a fully static binary (use Bun's `-musl` target so it doesn't need glibc). Smallest, no OS attack surface.
  - **Distroless** (`gcr.io/distroless/nodejs22-debian13` or `cc`/`static`) — minimal, Sigstore-signed, no shell/package manager; good security posture.
  - **Alpine** — small and has a shell for debugging, but musl libc (match your `-musl` binary).
  - **Docker Hardened Images (DHI)** — Docker open-sourced 1,000+ hardened images under Apache-2.0 in 2026; good for supply-chain/compliance-sensitive users.
- **Multi-arch:** Build with `docker buildx build --platform linux/amd64,linux/arm64 ... --push` to publish one tag with a manifest list. Use `--platform=$BUILDPLATFORM` on the builder stage + `$TARGETARCH` to pick the right prebuilt binary, and **always wire `--cache-from/--cache-to`** or multi-arch builds rebuild from scratch each run.
- GoReleaser can build and push these (`dockers` / `docker_manifests`) as part of the same release.

---

## 7. Auto-update for self-distributed binaries

Package-manager installs (brew/scoop/winget/apt/AUR) update through the manager — don't fight that. Auto-update logic is for users who grabbed the **raw binary / install script**.

- **`glam self-update` command (recommended):** Query the GitHub Releases API for the latest version, download the matching asset, **verify checksum + signature**, atomically swap the running binary (download to temp, `rename` over). This is the **mise** model. Detect package-manager installs and instead tell the user to `brew upgrade` / `scoop update` etc. (don't clobber a managed install).
- **Update notifications:** A lightweight `update-notifier`-style check (cached, throttled to ~once/day, async, non-blocking, opt-out via env var like `GLAM_NO_UPDATE_NOTIFIER=1`) that prints "a new version is available" — standard for npm CLIs.
- **Signed releases:** Publish a `checksums.txt` (SHA256 of every asset) and a **signature** over the checksums file (cosign/sigstore keyless or minisign/GPG). Sign the *checksums file*, not every asset individually (the updatecli/GoReleaser approach). `self-update` verifies the signature before swapping.
- **Release channels:** Use GitHub's **prerelease flag** to drive channels without special tag schemes — `stable` skips prereleases, `--channel beta`/`nightly` opts into them. Cheap and convention-based.

---

## 8. Code signing & notarization

For a CLI this is not cosmetic — it's the difference between "runs" and "blocked / scary warning," and it's required for several distribution channels.

- **Why it matters for a CLI:**
  - **macOS:** Unsigned/un-notarized binaries hit Gatekeeper quarantine ("cannot be opened, unidentified developer") when downloaded; notarization is effectively mandatory for a smooth `curl`/cask/dmg install. Homebrew casks of unsigned binaries trigger warnings.
  - **Windows:** Unsigned `.exe` triggers SmartScreen ("Windows protected your PC"); signing builds reputation and is increasingly needed for Smart App Control compliance and clean winget/Scoop installs.
- **macOS:** Sign with `codesign` using a Developer ID cert, then **notarize** via `notarytool` and `staple`. For Bun binaries, include the JIT entitlement:
  ```xml
  <key>com.apple.security.cs.allow-jit</key><true/>
  ```
  GoReleaser/`signing_tools` can wrap codesign+notarytool in CI.
- **Windows:** Use **Azure Artifact Signing** (renamed from **Azure Trusted Signing**; **GA as of April 2026**). It's a cloud signing service (no HSM/USB token to manage); the build host hashes the file and the service returns a signature (the file never leaves your machine). CLI is the `dotnet sign` tool (NuGet package `sign`, currently `--prerelease`; the old `Azure.CodeSigning` package is removed). Eligibility is gated to US/CA/EU/UK orgs and now self-employed individuals (no 3-year-history requirement). This is far cheaper/easier than traditional EV certs for an OSS project.
- **Linux:** Typically **unsigned** outside package-manager ecosystems; rely on checksums + sigstore/minisign signatures (§7) for integrity.

---

## 9. Recommended distribution matrix for `glam`

| OS / Arch | Build (single host CI) | Primary channel | Secondary channels | Signing |
|---|---|---|---|---|
| macOS arm64 | `bun --compile --target=bun-darwin-arm64` | Homebrew **cask** | npm optional-dep, `self-update`, install.sh | `codesign` + `notarytool` (Developer ID) |
| macOS x64 | `bun --compile --target=bun-darwin-x64` | Homebrew cask | npm, install.sh | same |
| Windows x64 | `bun --compile --target=bun-windows-x64` (icon/metadata on a Windows runner) | **winget** | Scoop, npm optional-dep, install.ps1 | Azure Artifact Signing (`dotnet sign`) |
| Windows arm64 | `bun --compile --target=bun-windows-arm64` | winget | Scoop, npm | Azure Artifact Signing |
| Linux x64 (glibc) | `bun --compile --target=bun-linux-x64` | AUR `-bin`, `.deb`/`.rpm` (nFPM) | npm optional-dep, install.sh, Docker | checksums + cosign/minisign |
| Linux arm64 | `bun --compile --target=bun-linux-arm64` | AUR, deb/rpm | npm, install.sh, Docker | same |
| Linux x64/arm64 (musl) | `bun --compile --target=bun-linux-*-musl` | Docker (`scratch`/distroless/alpine), Alpine users | install.sh | same |

### CI automation (GitHub Actions + GoReleaser)

The clean way to ship to all of the above from **one git tag**:

1. **One release workflow** triggered on `v*` tags. `actions/checkout` with `fetch-depth: 0` (GoReleaser needs full history).
2. Set up Bun (and Node for npm publish). Run tests across an OS matrix first.
3. **GoReleaser** (via `goreleaser/goreleaser-action@v7`) is the "goreleaser for JS" answer — in 2026 it has **first-class Bun and Deno builders** (it builds with `bun build --compile` / `deno compile` and maps OS/arch into its template system) plus a 2026 **`npms`** publisher (GoReleaser Pro) for npm. One `.goreleaser.yaml` then **automatically publishes to Homebrew (cask), Scoop, winget, AUR, Nix, `.deb`/`.rpm` (nFPM), Docker images + manifests, and the GitHub Release with checksums.**
4. **Signing in CI:** macOS signing/notarization on a `macos-latest` runner (Developer ID + App Store Connect API key in secrets); Windows signing via Azure Artifact Signing (OIDC/service principal, no stored cert); cosign keyless (GitHub OIDC) for the checksums signature.
5. **Windows metadata caveat:** because `bun --compile` can't set Windows icon/metadata while cross-compiling, run the Windows binary build (or at least icon/metadata + signing) on a `windows-latest` runner in the matrix, then hand artifacts to GoReleaser's publish stage.
6. Result: `git tag v1.2.3 && git push --tags` → every channel updated, every artifact signed, checksums + signature published.

> If GoReleaser Pro's npm publisher isn't desired, keep npm publishing as a separate `pnpm publish` step that pushes the launcher + per-platform optional-dependency packages built from the same binaries — fully OSS, no Pro dependency.

---

## Key takeaways for glamfire

1. **Binary engine: `bun build --compile`.** Best 2026 cross-compilation (all OS/arch from one host), fastest startup (`--bytecode`), smallest with `--minify`, and it matches the proposed Bun-friendly stack. Keep **Node SEA** (`--build-sea`, stable since N22) as a documented fallback if Bun runtime fidelity ever bites; **avoid `vercel/pkg`** (deprecated). **`deno compile`** is the plan-B if the project ever pivots to Deno.
2. **Two delivery shapes:** (a) **npm** for the JS audience using the **esbuild optional-dependencies pattern** (no postinstall downloads — survives `--ignore-scripts`/pnpm gating); (b) **standalone signed binaries** for everyone else.
3. **One tag, all channels, via GoReleaser.** In 2026 GoReleaser natively builds with Bun/Deno and publishes to Homebrew **cask** (formulae are deprecated there), Scoop, winget, AUR, Nix, deb/rpm (nFPM), and Docker — this is the JS equivalent of the Go release flow. Drive it from a single GitHub Actions workflow on `v*` tags.
4. **Sign everything.** macOS `codesign` + notarize (with the `allow-jit` entitlement for Bun); Windows via **Azure Artifact Signing** (GA April 2026, cloud-based, cheap for OSS); Linux via cosign/minisign over a `checksums.txt`. Unsigned CLIs get blocked by Gatekeeper/SmartScreen and erode trust.
5. **Auto-update:** ship a `glam self-update` (mise-style, signature-verified, atomic swap) **plus** a throttled, opt-out update-notifier; detect package-manager installs and defer to the manager. Use GitHub prerelease flags for stable/beta/nightly channels.
6. **Docker:** multi-stage → `scratch`/distroless with the **musl** Bun target; `buildx` multi-arch (`amd64`+`arm64`) with remote cache.
7. **Watch-outs:** musl vs glibc must be a distinct artifact; `bun --compile` can't set Windows icon/metadata when cross-compiling (do it on a Windows runner); test the actual compiled binary on each OS because you're shipping the Bun runtime, not Node.

---

## Sources

- Bun standalone executables (targets, native modules, signing, limitations): https://bun.com/docs/bundler/executables
- Bun cross-compilation PR (Jarred Sumner): https://github.com/oven-sh/bun/pull/10477
- Bun cross-compile overview: https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/
- Bun blog (releases incl. 1.3.x): https://bun.com/blog
- Node.js SEA official docs: https://nodejs.org/api/single-executable-applications.html
- Node.js 25.5.0 release (`--build-sea`): https://nodejs.org/en/blog/release/v25.5.0
- Joyee Cheung — improving SEA building / `--build-sea` (Jan 2026): https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/
- Node SEA 2026 production guide: https://www.hirenodejs.com/blog/nodejs-single-executable-applications-2026
- vercel/pkg (deprecated, last 5.8.1): https://github.com/vercel/pkg
- yao-pkg (maintained pkg fork): https://github.com/yao-pkg
- Deno `compile` docs (cross-compile, native addons): https://docs.deno.com/runtime/reference/cli/compile/
- Deno 2.9 release notes: https://deno.com/blog/v2.9
- Deno 3 features / npm compat (2026): https://www.pkgpulse.com/guides/deno-3-new-features-npm-compatibility-2026
- esbuild getting started (optional-dep binary pattern): https://esbuild.github.io/getting-started/
- esbuild platform-specific binaries discussion: https://github.com/evanw/esbuild/issues/789
- pnpm settings (build-script gating): https://pnpm.io/settings
- GoReleaser homepage (multi-language, publishers): https://goreleaser.com/
- GoReleaser Bun builder: https://goreleaser.com/customization/builds/builders/bun/
- GoReleaser Deno builder: https://goreleaser.com/customization/builds/builders/deno/
- GoReleaser Homebrew Casks (formulae deprecated): https://goreleaser.com/customization/publish/homebrew_casks/
- GoReleaser Homebrew Formulas (deprecated): https://goreleaser.com/customization/publish/homebrew_formulas/
- GoReleaser v2.10 announcement (formula→cask): https://goreleaser.com/blog/goreleaser-v2.10/
- GoReleaser NPM publisher: https://goreleaser.com/customization/publish/npm/
- GoReleaser GitHub Action: https://github.com/goreleaser/goreleaser-action
- GoReleaser homebrew-tap example: https://github.com/goreleaser/homebrew-tap
- Scoop app manifest autoupdate: https://github.com/ScoopInstaller/Scoop/wiki/App-Manifest-Autoupdate
- Scoop: https://scoop.sh/
- winget-cli (Scoop integration / autoupdate discussions): https://github.com/microsoft/winget-cli/issues/1262
- winget autoupdate feature request: https://github.com/microsoft/winget-cli/issues/6146
- AUR PKGBUILD reference (cgit): https://aur.archlinux.org/cgit/aur.git/
- mise self-update (auto-update model): https://mise.jdx.dev/cli/self-update.html
- Self-updater with GitHub Releases (channels via prerelease flag): https://dev.to/cn8001/how-i-built-a-self-updater-with-github-releases-2j15
- updatecli (signed checksums approach): https://github.com/updatecli/updatecli
- Azure Artifact Signing (formerly Trusted Signing) product: https://azure.microsoft.com/en-us/products/artifact-signing
- Azure Artifact Signing GA announcement: https://techcommunity.microsoft.com/blog/microsoft-security-blog/simplifying-code-signing-for-windows-apps-artifact-signing-ga/4482789
- Windows code signing with Azure Trusted Signing (guide): https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/
- KeyQ — Windows code signing with Azure Trusted Signing: https://www.keyq.cloud/blog/windows-code-signing-with-azure-trusted-signing/
- KeyQ — macOS code signing & notarization: https://www.keyq.cloud/blog/code-signing-and-notarization-for-macos-desktop-apps/
- ddev signing_tools (mac+win CI signing): https://github.com/ddev/signing_tools
- Smart App Control code signing (Microsoft Learn): https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control
- Distroless images: https://github.com/GoogleContainerTools/distroless
- Docker multi-arch with buildx: https://dockerbuild.com/tutorials/multi-arch-builds
- Smaller images (Alpine/distroless/multi-stage): https://oneuptime.com/blog/post/2026-01-16-docker-reduce-image-size/view
- Docker Hardened Images 2026 guide: https://mrcloudbook.com/docker-hardened-images-the-2026-architects-guide-to-supply-chain-compliance/
