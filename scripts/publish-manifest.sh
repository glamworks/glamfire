#!/usr/bin/env bash
# Publish a rendered package-manager manifest to its channel repo (issue #8).
#
#   scripts/publish-manifest.sh homebrew "<ssh-deploy-key>"
#   scripts/publish-manifest.sh scoop    "<ssh-deploy-key>"
#   scripts/publish-manifest.sh winget   "<github-token>"
#
# Called only by the release workflow, and only when the corresponding secret is
# present (the workflow gates each call). Run `node scripts/render-manifests.mjs`
# first so dist/manifests/ holds the version+checksum-filled manifests.
#
# This is real publish logic — git push to the tap/bucket over a deploy key, and a
# winget-pkgs submission via wingetcreate. It is dormant only because the maintainer
# holds the keys; nothing here is mocked.
set -euo pipefail

channel="${1:?usage: publish-manifest.sh <homebrew|scoop|winget> <secret>}"
secret="${2:?missing channel secret}"
version="$(cat "$(dirname "$0")/../VERSION")"
manifests="$(cd "$(dirname "$0")/.." && pwd)/dist/manifests"

setup_ssh() {
  mkdir -p ~/.ssh
  printf '%s\n' "$secret" > ~/.ssh/deploy_key
  chmod 600 ~/.ssh/deploy_key
  export GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  git config --global user.name "glamfire-release"
  git config --global user.email "release@glamworks.github.io"
}

push_git_manifest() {
  # $1 repo (ssh url), $2 source file in dist/manifests, $3 dest path in repo
  local repo="$1" src="$2" dest="$3" work
  setup_ssh
  work="$(mktemp -d)"
  git clone --depth 1 "$repo" "$work"
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
      "git@github.com:glamworks/homebrew-tap.git" \
      "homebrew/glamfire.rb" "Formula/glamfire.rb"
    ;;
  scoop)
    push_git_manifest \
      "git@github.com:glamworks/scoop-bucket.git" \
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
