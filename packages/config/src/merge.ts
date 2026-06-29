// Deep-merge the configuration layers and record, for every leaf value, which
// layer set it (provenance). Lowest precedence first; later layers win. Plain
// objects merge recursively; arrays and scalars replace wholesale (last writer
// wins) and are recorded as leaves.

/** The ordered configuration layers, lowest -> highest precedence (SPEC §6). */
export type LayerName = 'default' | 'user' | 'project' | 'env' | 'override';

export interface Layer {
  name: LayerName;
  data: Record<string, unknown>;
}

export interface MergeResult {
  merged: Record<string, unknown>;
  /** dotted leaf path -> the layer that set it. */
  provenance: Record<string, LayerName>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  // Exclude class instances (Date, TomlDate, Map, ...) — only POJOs merge.
  return proto === Object.prototype || proto === null;
}

/**
 * Keys whose object value is replaced *wholesale* across layers instead of being
 * deep-merged. A `credential` is a discriminated either/or (`{env}` XOR
 * `{keychain}`): merging a default `{env}` with a user `{keychain}` would union
 * both keys and fail the strict schema. Switching the source must replace it.
 */
export const ATOMIC_LEAF_KEYS: ReadonlySet<string> = new Set(['credential']);

function mergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  prefix: string,
  provenance: Record<string, LayerName>,
  layer: LayerName,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !ATOMIC_LEAF_KEYS.has(key)) {
      const existing = target[key];
      const nested = isPlainObject(existing) ? existing : {};
      target[key] = nested;
      mergeInto(nested, value, path, provenance, layer);
    } else {
      // arrays, scalars, and atomic objects are leaves: replace + record.
      target[key] = value;
      provenance[path] = layer;
    }
  }
}

/** Merge the layers in order, tracking per-leaf provenance. */
export function mergeLayers(layers: Layer[]): MergeResult {
  const merged: Record<string, unknown> = {};
  const provenance: Record<string, LayerName> = {};
  for (const layer of layers) {
    mergeInto(merged, layer.data, '', provenance, layer.name);
  }
  return { merged, provenance };
}

/**
 * Walk a zod issue path from most- to least-specific and return the nearest
 * recorded provenance, so an error can name the layer/file that set the bad value.
 */
export function nearestProvenance(
  provenance: Record<string, LayerName>,
  path: ReadonlyArray<PropertyKey>,
): LayerName | undefined {
  for (let i = path.length; i > 0; i -= 1) {
    const key = path
      .slice(0, i)
      .map((segment) => String(segment))
      .join('.');
    const hit = provenance[key];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Flatten a merged config into ordered `(path, value)` leaves for display. */
export function flattenLeaves(
  value: unknown,
  prefix = '',
  out: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      // Atomic objects (e.g. a credential reference) are one leaf, matching how
      // the merger records their provenance.
      if (ATOMIC_LEAF_KEYS.has(key)) out.push({ path: childPath, value: child });
      else flattenLeaves(child, childPath, out);
    }
  } else {
    out.push({ path: prefix, value });
  }
  return out;
}
