// loadConfig — assemble the layered, validated configuration (SPEC §6).
//
// Layers, lowest -> highest precedence:
//   built-in defaults -> ~/.glam/config.toml -> ./glam.toml (searched upward)
//   -> environment variables -> explicit overrides (CLI flags)
//
// On invalid config we throw an actionable ConfigError naming the file, the
// field, and what was expected — never a silent fallback.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse as parsePath } from 'node:path';
import { TomlError, parse as parseToml } from 'smol-toml';
import { ConfigError } from './errors.js';
import { type Layer, type LayerName, mergeLayers, nearestProvenance } from './merge.js';
import { type GlamConfig, builtinDefaults, glamConfigSchema } from './schema.js';

/** A recursive partial of the config, used for CLI-flag overrides. */
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export interface LoadConfigOptions {
  /** Directory to search upward from for `glam.toml` (default: process.cwd()). */
  cwd?: string;
  /** Environment to read the env layer from (default: process.env). */
  env?: Record<string, string | undefined>;
  /** Highest-precedence explicit overrides (e.g. parsed CLI flags). */
  overrides?: DeepPartial<GlamConfig>;
  /** Home directory to find `~/.glam/config.toml` (default: os.homedir()). */
  home?: string;
}

export interface ConfigSources {
  /** Absolute path to the user config if it exists, else null. */
  user: string | null;
  /** Absolute path to the discovered project config if it exists, else null. */
  project: string | null;
}

export interface LoadedConfig {
  config: GlamConfig;
  /** dotted leaf path -> the layer that set it. */
  provenance: Record<string, LayerName>;
  sources: ConfigSources;
}

/** Env var -> config path mapping for the environment layer. */
interface EnvBinding {
  env: string;
  path: string[];
  kind: 'string' | 'number' | 'boolean';
}

const ENV_BINDINGS: EnvBinding[] = [
  { env: 'GLAM_MODEL', path: ['model'], kind: 'string' },
  { env: 'GLAM_EFFORT', path: ['run', 'effort'], kind: 'string' },
  { env: 'GLAM_TIER', path: ['run', 'tier'], kind: 'string' },
  { env: 'GLAM_TEMPERATURE', path: ['run', 'temperature'], kind: 'number' },
  { env: 'GLAM_MAX_USD', path: ['run', 'budget', 'maxUsd'], kind: 'number' },
  { env: 'GLAM_MAX_TOKENS', path: ['run', 'budget', 'maxTokens'], kind: 'number' },
  { env: 'GLAM_MAX_STEPS', path: ['run', 'budget', 'maxSteps'], kind: 'number' },
  { env: 'GLAM_MONTHLY_BUDGET_USD', path: ['usage', 'monthlyBudgetUsd'], kind: 'number' },
  { env: 'GLAM_WARN_AT_PCT', path: ['usage', 'warnAtPct'], kind: 'number' },
  { env: 'GLAM_MEMORY', path: ['memory', 'enabled'], kind: 'boolean' },
  { env: 'FIREWORKS_BASE_URL', path: ['providers', 'fireworks', 'baseUrl'], kind: 'string' },
  { env: 'ANTHROPIC_BASE_URL', path: ['providers', 'anthropic', 'baseUrl'], kind: 'string' },
  { env: 'OPENAI_BASE_URL', path: ['providers', 'openai', 'baseUrl'], kind: 'string' },
  { env: 'GLAM_LOCAL_BASE_URL', path: ['providers', 'local', 'baseUrl'], kind: 'string' },
];

function setPath(root: Record<string, unknown>, path: string[], value: unknown): void {
  let node = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i] as string;
    const next = node[key];
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      node = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      node[key] = created;
      node = created;
    }
  }
  node[path[path.length - 1] as string] = value;
}

function buildEnvLayer(env: Record<string, string | undefined>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const binding of ENV_BINDINGS) {
    const raw = env[binding.env];
    if (raw === undefined || raw === '') continue;
    // Numbers/booleans are parsed; an unparseable value flows to zod, which
    // rejects it with an actionable message rather than silently dropping it.
    let value: unknown = raw;
    if (binding.kind === 'number') value = Number(raw);
    if (binding.kind === 'boolean') {
      const lowered = raw.toLowerCase();
      if (['true', '1', 'on', 'yes'].includes(lowered)) value = true;
      else if (['false', '0', 'off', 'no'].includes(lowered)) value = false;
      // otherwise pass the raw string through so zod rejects it loudly
    }
    setPath(data, binding.path, value);
  }
  return data;
}

function readTomlFile(file: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new ConfigError('CONFIG_FILE_READ', `cannot read config file ${file}`, {
      cause: err,
      file,
    });
  }
  try {
    const parsed = parseToml(text);
    return parsed as Record<string, unknown>;
  } catch (err) {
    const detail = err instanceof TomlError ? err.message : String(err);
    throw new ConfigError('CONFIG_TOML_PARSE', `invalid TOML in ${file}: ${detail}`, {
      cause: err,
      file,
    });
  }
}

/** Search `cwd` and each ancestor for a `glam.toml`. Returns the first found. */
export function findProjectConfig(cwd: string): string | null {
  let dir = cwd;
  const { root } = parsePath(dir);
  // Guard against symlink loops with a generous depth cap.
  for (let depth = 0; depth < 64; depth += 1) {
    const candidate = join(dir, 'glam.toml');
    if (existsSync(candidate)) return candidate;
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();

  const userPath = join(home, '.glam', 'config.toml');
  const userExists = existsSync(userPath);
  const projectPath = findProjectConfig(cwd);

  const layers: Layer[] = [{ name: 'default', data: builtinDefaults() as Record<string, unknown> }];
  if (userExists) layers.push({ name: 'user', data: readTomlFile(userPath) });
  if (projectPath !== null) layers.push({ name: 'project', data: readTomlFile(projectPath) });
  layers.push({ name: 'env', data: buildEnvLayer(env) });
  if (options.overrides !== undefined) {
    layers.push({ name: 'override', data: options.overrides as Record<string, unknown> });
  }

  const { merged, provenance } = mergeLayers(layers);

  const sources: ConfigSources = {
    user: userExists ? userPath : null,
    project: projectPath,
  };

  const parsed = glamConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const sourceForLayer = (layer: LayerName | undefined): string =>
      layer === 'user' && sources.user
        ? sources.user
        : layer === 'project' && sources.project
          ? sources.project
          : (layer ?? 'config');
    const lines = parsed.error.issues.map((issue) => {
      const path = issue.path.map(String).join('.') || '(root)';
      const layer = nearestProvenance(provenance, issue.path);
      return `  - ${path}: ${issue.message} [from ${sourceForLayer(layer)}]`;
    });
    const firstFileIssue = parsed.error.issues
      .map((issue) => nearestProvenance(provenance, issue.path))
      .find((layer) => layer === 'user' || layer === 'project');
    const offendingFile =
      firstFileIssue === 'user'
        ? sources.user
        : firstFileIssue === 'project'
          ? sources.project
          : null;
    const hint =
      'Fix the offending field(s) above. See the config schema in @glamfire/config or glam.example.toml.';
    throw new ConfigError(
      'CONFIG_INVALID',
      `invalid glamfire configuration:\n${lines.join('\n')}\n\n${hint}`,
      offendingFile !== null ? { file: offendingFile } : undefined,
    );
  }

  return { config: parsed.data, provenance, sources };
}
