// Build a redaction-safe, provenance-annotated view of the resolved config for
// `glam config`. The config object holds no secrets (only credential references),
// so every leaf is safe to print; credential availability is reported as a
// boolean, never as a value.

import { type CredentialStatus, credentialStatuses } from './credentials.js';
import type { LoadedConfig } from './load.js';
import { type LayerName, flattenLeaves } from './merge.js';

export interface ConfigDisplayRow {
  path: string;
  value: string;
  layer: LayerName;
}

export interface ConfigDisplay {
  rows: ConfigDisplayRow[];
  credentials: CredentialStatus[];
  sources: LoadedConfig['sources'];
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(renderValue).join(', ')}]`;
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  // Objects (e.g. a routing rule) render as compact JSON so they stay legible.
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function describeConfig(
  loaded: LoadedConfig,
  env: Record<string, string | undefined> = process.env,
): ConfigDisplay {
  const rows = flattenLeaves(loaded.config).map(({ path, value }) => ({
    path,
    value: renderValue(value),
    layer: loaded.provenance[path] ?? 'default',
  }));
  return {
    rows,
    credentials: credentialStatuses(loaded.config, env),
    sources: loaded.sources,
  };
}
