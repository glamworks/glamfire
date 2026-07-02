#!/usr/bin/env bash
# Publish a rendered package-manager manifest to its channel repo (issue #8).
#
#   scripts/publish-manifest.sh homebrew "<github-token>"
#   scripts/publish-manifest.sh scoop    "<github-token>"
#   scripts/publish-manifest.sh winget   "<github-token>"
#
# Called only by the release workflow, and only when the corresponding secret is
# present (the workflow gates each call). Run `node scripts/render-manifests.mjs`
# first so dist/manifests/ holds the version+checksum-filled manifests.
#
# This is real publish logic — a git push to the tap/bucket over an HTTPS token
# (glamworks has org-level deploy keys disabled, so we authenticate with a
# fine-grained PAT that has contents:write on those two repos), and a winget-pkgs
# submission via wingetcreate. Dormant only because the maintainer holds the
# token; nothing here is mocked.
set -euo pipefail

channel="${1:?usage: publish-manifest.sh <homebrew|scoop|winget> <secret>}"
secret="${2:?missing channel secret}"
version="$(cat "$(dirname "$0")/../VERSION")"
manifests="$(cd "$(dirname "$0")/.." && pwd)/dist/manifests"

push_git_manifest() {
  # $1 repo slug (owner/name), $2 source file in dist/manifests, $3 dest path in repo
  local slug="$1" src="$2" dest="$3" work
  git config --global user.name "glamfire-release"
  git config --global user.email "release@glamworks.github.io"
  work="$(mktemp -d)"
  # Token in the URL; x-access-token is the conventional username for a PAT.
  git clone --depth 1 "https://x-access-token:${secret}@github.com/${slug}.git" "$work" 2>/dev/null \
    || git clone "https://x-access-token:${secret}@github.com/${slug}.git" "$work"
  mkdir -p "$work/$(dirname "$dest")"
  cp "$manifests/$src" "$work/$dest"
  ( cd "$work"
    git add "$dest"
    if git diff --cached --quiet; then
      echo "publish-manifest($channel): no change for v$version"; exit 0
    fi
    git commit -m "glamfire $version"
    git push origin HEAD )
  rm -rf "$work"
}

case "$channel" in
  homebrew)
    push_git_manifest \
      "glamworks/homebrew-tap" \
      "homebrew/glamfire.rb" "Formula/glamfire.rb"
    ;;
  scoop)
    push_git_manifest \
      "glamworks/scoop-bucket" \
      "scoop/glamfire.json" "bucket/glamfire.json"
    ;;
  winget)
    # winget-pkgs submission via Microsoft's wingetcreate (token = GitHub PAT with
    # access to a winget-pkgs fork). Submits the multi-file manifest set.
    if ! command -v wingetcreate >/dev/null 2>&1; then
      echo "publish-manifest(winget): wingetcreate not installed on runner" >&2
      exit 1
    fi
    wingetcreate submit --token "$secret" "$manifests/winget"
    ;;
  *)
    echo "publish-manifest: unknown channel '$channel'" >&2
    exit 1
    ;;
esac

echo "publish-manifest($channel): published glamfire $version"
