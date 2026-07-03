// `glam doctor` — check the local environment is ready to run glamfire, and give
// a copy-paste fix for every failing prerequisite.
//
// The install check is context-aware and honest (it used to blindly read
// `<root>/package.json`, which does not exist inside a `bun build --compile`
// standalone binary and produced a false ✗):
//   - repo checkout / npm install: `<pkgRoot>/package.json` must exist, parse,
//     be the glamfire package, and agree with the running version (real
//     integrity: catches a half-installed package and version drift).
//   - standalone binary: the executable IS the install — single self-contained
//     file, version embedded at build time from the real VERSION file. There is
//     no package.json to read, and that is correct, not a failure.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from '@glamfire/config';
import { CODES, color, useColor } from './ui.mjs';

/** True when running inside a Bun standalone (`bun build --compile`) binary. */
export function isStandaloneBuild(moduleUrl) {
  // Bun mounts compiled modules on a virtual filesystem: /$bunfs/root/... on
  // POSIX and a B:/~BUN/root/... style path on Windows.
  return moduleUrl.includes('/$bunfs/') || moduleUrl.includes('/~BUN/');
}

/**
 * Classify how this glamfire is installed and whether the install is intact.
 * Returns { ok, label, hint, fix } ready for the check list.
 */
export function detectInstall({ moduleUrl, version }) {
  if (isStandaloneBuild(moduleUrl)) {
    return {
      ok: true,
      label: `glamfire install: standalone binary v${version} (self-contained)`,
      hint: '',
      fix: '',
    };
  }
  // packages/cli/src/*.mjs in the repo, dist/cli/src/glam.mjs in the npm
  // package — either way the owning package.json sits three directories up.
  const pkgRoot = join(dirname(fileURLToPath(moduleUrl)), '..', '..', '..');
  const pkgPath = join(pkgRoot, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      label: 'glamfire install',
      hint: `cannot read ${pkgPath} (${err?.code ?? err?.message ?? err}) — the install looks incomplete`,
      fix: 'npm i -g glamfire',
    };
  }
  if (manifest.name !== 'glamfire') {
    return {
      ok: false,
      label: 'glamfire install',
      hint: `${pkgPath} belongs to "${manifest.name}", not glamfire — the install looks corrupted`,
      fix: 'npm i -g glamfire',
    };
  }
  if (manifest.version !== version) {
    return {
      ok: false,
      label: 'glamfire install',
      hint: `version drift: running v${version} but ${pkgPath} says v${manifest.version}`,
      fix: 'npm i -g glamfire@latest',
    };
  }
  return {
    ok: true,
    label: `glamfire install: v${version} (${pkgPath})`,
    hint: '',
    fix: '',
  };
}

export function cmdDoctor({ version, banner }) {
  const checks = [];

  const node = process.versions.node;
  const nodeOk = Number(node.split('.')[0]) >= 22;
  checks.push({
    ok: nodeOk,
    label: `Node.js ${node}`,
    hint: 'glamfire needs Node.js 22 or newer',
    fix: 'install Node 22+ from https://nodejs.org (or: nvm install 22)',
  });

  const fwKey = Boolean(process.env.FIREWORKS_API_KEY);
  checks.push({
    ok: fwKey,
    label: 'FIREWORKS_API_KEY',
    hint: 'needed to call GLM 5.2 on Fireworks (the default model)',
    fix: 'export FIREWORKS_API_KEY="<your key>"   # create one: https://app.fireworks.ai/settings/users/api-keys',
  });

  // Config-file presence + validity (issue #12). Absent files are fine (built-in
  // defaults work); an invalid config is a real failure reported here.
  try {
    const loaded = loadConfig({ cwd: process.cwd(), env: process.env });
    const found = [];
    if (loaded.sources.user) found.push(loaded.sources.user);
    if (loaded.sources.project) found.push(loaded.sources.project);
    const label =
      found.length > 0
        ? `config: ${found.join(', ')}`
        : 'config: built-in defaults (no ~/.glam/config.toml or ./glam.toml)';
    checks.push({ ok: true, label, hint: '', fix: '' });
  } catch (err) {
    const msg =
      err instanceof ConfigError ? err.message.split('\n')[0] : String(err?.message ?? err);
    const file = err instanceof ConfigError && err.file ? err.file : null;
    checks.push({
      ok: false,
      label: 'config',
      hint: `invalid configuration — ${msg}`,
      fix: file
        ? `edit ${file} (run \`glam config\` to see the offending field)`
        : 'run `glam config` to see the offending field',
    });
  }

  checks.push(detectInstall({ moduleUrl: import.meta.url, version }));

  const on = useColor(process.stdout);
  const out = process.stdout;
  out.write(`${banner}\n\n`);
  let allOk = true;
  for (const c of checks) {
    allOk = allOk && c.ok;
    const mark = c.ok ? color(on, CODES.GREEN, '✓') : color(on, CODES.RED, '✗');
    out.write(`  ${mark} ${c.label}${c.ok ? '' : `  — ${c.hint}`}\n`);
    if (!c.ok && c.fix) {
      out.write(color(on, CODES.DIM, `      fix: ${c.fix}\n`));
    }
  }
  out.write(
    `\n${allOk ? color(on, CODES.GREEN, 'Ready.') : 'Not ready — apply the fixes above, then re-run `glam doctor`.'}\n`,
  );
  process.exitCode = allOk ? 0 : 1;
}
