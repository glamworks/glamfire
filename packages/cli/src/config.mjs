// `glam config` — print the resolved, secret-redacted, layered configuration
// with per-value provenance, and validate it. Exits non-zero with an actionable
// message when the config is invalid (SPEC §6). Secrets are NEVER printed: the
// config object holds only credential *references*; credential availability is
// reported as a boolean, never as a value (SPEC §8).

import { ConfigError, describeConfig, loadConfig } from '@glamfire/config';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const FLAME = '\x1b[38;5;208m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function color(on, code, s) {
  return on ? `${code}${s}${RESET}` : s;
}

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

  const useColor = process.stdout.isTTY === true;
  const out = process.stdout;

  out.write(
    `${color(useColor, FLAME, `glamfire ${version}`)} ${color(useColor, DIM, '· resolved configuration')}\n\n`,
  );

  // --- config files ---
  out.write(`${color(useColor, BOLD, 'config files')}\n`);
  out.write(`  user:    ${view.sources.user ?? color(useColor, DIM, '(none)')}\n`);
  out.write(`  project: ${view.sources.project ?? color(useColor, DIM, '(none)')}\n`);
  if (view.sources.user === null && view.sources.project === null) {
    out.write(color(useColor, DIM, '  (using built-in defaults — no config files found)\n'));
  }
  out.write('\n');

  // --- values with provenance ---
  const pad = Math.max(...view.rows.map((r) => r.path.length));
  out.write(
    `${color(useColor, BOLD, 'values')} ${color(useColor, DIM, '(path = value   [layer])')}\n`,
  );
  for (const row of view.rows) {
    const layer = color(useColor, DIM, `[${row.layer}]`);
    out.write(`  ${row.path.padEnd(pad)} = ${row.value}   ${layer}\n`);
  }
  out.write('\n');

  // --- credentials (never printed) ---
  out.write(
    `${color(useColor, BOLD, 'credentials')} ${color(useColor, DIM, '(value never printed — SPEC §8)')}\n`,
  );
  const cpad = Math.max(...view.credentials.map((c) => c.provider.length));
  for (const c of view.credentials) {
    const status = c.resolved ? color(useColor, GREEN, 'set') : color(useColor, YELLOW, 'missing');
    out.write(`  ${c.provider.padEnd(cpad)}  ${c.source.padEnd(28)} ${status}\n`);
  }
  out.write('\n');

  out.write(`${color(useColor, GREEN, 'ok')}: configuration is valid.\n`);
}
