// Shared building blocks for glamfire's distributable artifacts (issue #8).
//
// Both the self-contained npm package (scripts/build-npm.mjs) and the single-file
// binaries (scripts/build-binaries.mjs) are produced with Bun's bundler. These
// builds run under `bun`, never Node — `bun build --compile` is the locked binary
// engine (research/11-cross-platform-packaging.md).
//
// The one thing the CLI does at runtime that a bundled/compiled artifact cannot do
// is read the repo's `VERSION` file relative to `scripts/version.mjs` (inside a
// compiled binary that path is the virtual `/$bunfs/VERSION`, which does not exist).
// We solve this the standard way a release binary embeds its version — the Go
// `-ldflags -X main.version=...` pattern — with a build-time plugin that replaces
// `scripts/version.mjs` with one that returns the VERSION read at build time. No
// source file on disk is modified; the real version still flows from the real
// VERSION file, so `glam --version` stays truthful (SPEC §9).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The single source of truth for the version (mirrors scripts/version.mjs). */
export function readVersion() {
  return readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
}

/** The CLI surface that becomes `glam`. */
export const cliEntry = join(repoRoot, 'packages', 'cli', 'src', 'index.mjs');

/**
 * Bun plugin: inline the build-time version into the bundle so the artifact never
 * depends on a `VERSION` file existing next to it at runtime. Matches the real
 * `scripts/version.mjs` module by its resolved path and swaps in a constant
 * `getVersion()`. This is build-time constant injection, not a shim — the value is
 * the real VERSION, read here, at build time.
 */
export function inlineVersionPlugin(version) {
  return {
    name: 'glamfire-inline-version',
    setup(build) {
      build.onLoad({ filter: /[/\\]scripts[/\\]version\.mjs$/ }, () => ({
        contents: `export function getVersion() { return ${JSON.stringify(version)}; }\n`,
        loader: 'js',
      }));
    },
  };
}

/**
 * The standalone-binary targets glamfire ships (SPEC §7, research §9). One host can
 * cross-compile every target with `bun build --compile --target=...`.
 */
export const BINARY_TARGETS = [
  { id: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', outName: 'glam-darwin-arm64' },
  { id: 'darwin-x64', bunTarget: 'bun-darwin-x64', outName: 'glam-darwin-x64' },
  { id: 'linux-x64', bunTarget: 'bun-linux-x64', outName: 'glam-linux-x64' },
  { id: 'linux-arm64', bunTarget: 'bun-linux-arm64', outName: 'glam-linux-arm64' },
  { id: 'windows-x64', bunTarget: 'bun-windows-x64', outName: 'glam-windows-x64.exe' },
];

/** The bun --target that matches the host running this build (for a real run-test). */
export function hostTargetId() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  if (process.platform === 'darwin') return `darwin-${arch}`;
  if (process.platform === 'win32') return 'windows-x64';
  return `linux-${arch}`;
}
