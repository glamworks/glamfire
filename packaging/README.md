# Packaging — package-manager manifests for `glam`

These are the **templates** for the channels that install the `glam` CLI from a
prebuilt single-file binary. They are not published from this repo directly; the
[release workflow](../.github/workflows/release.yml) renders them with the tagged
version + per-asset SHA-256 checksums (`scripts/render-manifests.mjs`, reading
`dist-bin/SHA256SUMS.txt`) and pushes the rendered files to the channel repos.

Each template carries `__VERSION__` / `__SHA256_<asset>__` placeholders so the same
file works for every release. `scripts/render-manifests.mjs` fails loudly if any
placeholder is left unresolved — a release never ships a manifest with a literal
`__SHA256_...__` in it.

| Channel | Template | Published to | User command |
|---|---|---|---|
| Homebrew (macOS + Linux) | `homebrew/glamfire.rb` | tap repo `glamworks/homebrew-tap` (`Formula/glamfire.rb`) | `brew install glamworks/tap/glamfire` |
| Scoop (Windows) | `scoop/glamfire.json` | bucket repo `glamworks/scoop-bucket` (`bucket/glamfire.json`) | `scoop bucket add glamworks https://github.com/glamworks/scoop-bucket; scoop install glamfire` |
| winget (Windows) | `winget/Glamworks.Glamfire*.yaml` | PR to `microsoft/winget-pkgs` under `manifests/g/Glamworks/Glamfire/<version>/` | `winget install Glamworks.Glamfire` |

## How a release fills these in

1. `bun scripts/build-binaries.mjs` builds every `glam-<os>-<arch>` binary into
   `dist-bin/` and writes `dist-bin/SHA256SUMS.txt`.
2. `node scripts/render-manifests.mjs` reads those checksums and the `VERSION` file
   and writes ready-to-publish manifests to `dist/manifests/{homebrew,scoop,winget}/`.
3. The release workflow commits the rendered Homebrew formula to the tap, the Scoop
   manifest to the bucket, and opens the winget PR — each step **gated on the
   relevant secret** so it no-ops cleanly until the maintainer wires credentials.

## Binary assets the manifests reference

The release attaches these raw binaries (and `SHA256SUMS.txt`) to the GitHub Release:

- `glam-darwin-arm64`, `glam-darwin-x64`
- `glam-linux-x64`, `glam-linux-arm64`
- `glam-windows-x64.exe`

Homebrew installs the matching binary as `glam`; Scoop and winget consume the
Windows `.exe` (winget as a `portable` installer exposing the `glam` command).

## Validating templates locally

```bash
bun scripts/build-binaries.mjs        # produces dist-bin/ + SHA256SUMS.txt
node scripts/render-manifests.mjs     # fills templates → dist/manifests/
ruby -c packaging/homebrew/glamfire.rb # ruby syntax
# in a tap checkout: brew style glamworks/tap
```

## Status

The templates, the renderer, and the binary builds are real and tested. The
**publish** steps (pushing to the tap/bucket and opening the winget PR) are wired in
CI but **gated** on maintainer-supplied secrets — see the repository README's Install
section for exactly which secrets switch each channel on.
