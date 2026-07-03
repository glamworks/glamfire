// `glam config` — print the resolved, secret-redacted, layered configuration
// with per-value provenance, and validate it. Exits non-zero with an actionable
// message when the config is invalid (SPEC §6). Secrets are NEVER printed: the
// config object holds only credential *references*; credential availability is
// reported as a boolean, never as a value (SPEC §8).

import { ConfigError, describeConfig, loadConfig } from '@glamfire/config';
import { CODES, color, useColor } from './ui.mjs';

const { DIM, BOLD, FLAME, GREEN, YELLOW } = CODES;

const CONFIG_HELP = `glam config — show the resolved, layered, secret-redacted configuration.

Usage: glam config [options]

Options:
  --json     Print the resolved config + provenance as JSON (secrets redacted)
  -h, --help Show this help

Layers, lowest -> highest precedence (SPEC §6):
  built-in defaults < ~/.glam/config.toml < ./glam.toml < env vars < CLI flags

Secrets are never printed: providers carry a credential *reference* (env var or
OS keychain); only whether it resolves is shown. See glam.example.toml.
`;

export function cmdConfig(argv, { version }) {
  let json = false;
  for (const a of argv) {
    if (a === '-h' || a === '--help') {
      process.stdout.write(CONFIG_HELP);
      return;
    }
    if (a === '--json') {
      json = true;
      continue;
    }
    process.stderr.write(`glam config: unknown option "${a}"\nRun \`glam config --help\`.\n`);
    process.exitCode = 2;
    return;
  }

  let loaded;
  try {
    loaded = loadConfig({ cwd: process.cwd(), env: process.env });
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`glam config: ${err.message}\n`);
      if (err.file) process.stderr.write(`\nOffending file: ${err.file}\n`);
    } else {
      process.stderr.write(`glam config: ${err?.message ?? err}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const view = describeConfig(loaded, process.env);

  if (json) {
    // The config object holds no secrets; credential availability is a boolean.
    process.stdout.write(
      `${JSON.stringify(
        {
          version,
          sources: view.sources,
          config: loaded.config,
          provenance: loaded.provenance,
          credentials: view.credentials,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const useColorOut = useColor(process.stdout);
  const out = process.stdout;

  out.write(
    `${color(useColorOut, FLAME, `glamfire ${version}`)} ${color(useColorOut, DIM, '· resolved configuration')}\n\n`,
  );

  // --- config files ---
  out.write(`${color(useColorOut, BOLD, 'config files')}\n`);
  out.write(`  user:    ${view.sources.user ?? color(useColorOut, DIM, '(none)')}\n`);
  out.write(`  project: ${view.sources.project ?? color(useColorOut, DIM, '(none)')}\n`);
  if (view.sources.user === null && view.sources.project === null) {
    out.write(color(useColorOut, DIM, '  (using built-in defaults — no config files found)\n'));
  }
  out.write('\n');

  // --- values with provenance ---
  const pad = Math.max(...view.rows.map((r) => r.path.length));
  out.write(
    `${color(useColorOut, BOLD, 'values')} ${color(useColorOut, DIM, '(path = value   [layer])')}\n`,
  );
  for (const row of view.rows) {
    const layer = color(useColorOut, DIM, `[${row.layer}]`);
    out.write(`  ${row.path.padEnd(pad)} = ${row.value}   ${layer}\n`);
  }
  out.write('\n');

  // --- credentials (never printed) ---
  out.write(
    `${color(useColorOut, BOLD, 'credentials')} ${color(useColorOut, DIM, '(value never printed — SPEC §8)')}\n`,
  );
  const cpad = Math.max(...view.credentials.map((c) => c.provider.length));
  for (const c of view.credentials) {
    const status = c.resolved
      ? color(useColorOut, GREEN, 'set')
      : color(useColorOut, YELLOW, 'missing');
    out.write(`  ${c.provider.padEnd(cpad)}  ${c.source.padEnd(28)} ${status}\n`);
  }
  out.write('\n');

  out.write(`${color(useColorOut, GREEN, 'ok')}: configuration is valid.\n`);
}
