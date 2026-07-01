// Skill loader (SPEC §5.5): discover and load self-contained skill directories
// from disk, validate their manifests with actionable errors, resolve their
// tool handlers + verifier from the skill module, and produce installable
// `LoadedSkill` objects. A skill directory is fully portable — nothing here
// depends on this package being built; the skill's module is imported directly.

import { realpathSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ToolContext, ToolSpec } from '@glamfire/engine';
import {
  type SkillManifest,
  SkillManifestError,
  type SkillToolManifest,
  parseManifest,
} from './manifest.js';
import type { LoadedSkill } from './skill.js';
import { type VerifierFn, rubricVerifier } from './verifier.js';

/** The conventional manifest filename inside a skill directory. */
export const MANIFEST_FILENAME = 'skill.json';

type HandlerFn = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

function isManifestPath(p: string): boolean {
  return p.endsWith('.json');
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Import a skill module and return its named exports as a plain record. */
async function importModule(modulePath: string, source: string): Promise<Record<string, unknown>> {
  let mod: unknown;
  try {
    // Canonicalize first: on Windows a temp path can carry an 8.3 short name
    // (e.g. `RUNNER~1`), whose `~` becomes `%7E` in the file URL and fails to
    // resolve under Vite's loader (`Failed to load url C:/…/skill.mjs`).
    // `realpathSync` expands it to the real long path so the URL resolves on
    // every OS; it's a no-op for already-canonical paths.
    let resolvedPath = modulePath;
    try {
      // `.native` (libuv) — unlike the JS impl — expands Windows 8.3 short names
      // (RUNNER~1 -> runneradmin), which is what removes the `%7E` from the URL.
      resolvedPath = realpathSync.native(modulePath);
    } catch {
      // Fall back to the given path (e.g. it may not exist yet) — the import
      // below then throws the actionable "failed to import" error as before.
    }
    mod = await import(pathToFileURL(resolvedPath).href);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SkillManifestError(`failed to import skill module "${modulePath}": ${msg}`, source);
  }
  return mod as Record<string, unknown>;
}

function resolveExportedFn(
  mod: Record<string, unknown>,
  modulePath: string,
  name: string,
  role: string,
  source: string,
): (...args: unknown[]) => unknown {
  const fn = mod[name];
  if (typeof fn !== 'function') {
    const exported = Object.keys(mod)
      .filter((k) => typeof mod[k] === 'function')
      .join(', ');
    throw new SkillManifestError(
      `${role} "${name}" is not an exported function of "${modulePath}" ` +
        `(exports: ${exported || 'none'})`,
      source,
    );
  }
  return fn as (...args: unknown[]) => unknown;
}

function toToolSpec(
  decl: SkillToolManifest,
  mod: Record<string, unknown>,
  modulePath: string,
  source: string,
): ToolSpec {
  const handler = resolveExportedFn(
    mod,
    modulePath,
    decl.handler,
    `tool "${decl.name}" handler`,
    source,
  ) as HandlerFn;
  return {
    name: decl.name,
    description: decl.description,
    permission: decl.permission,
    parameters: decl.parameters,
    handler,
  };
}

async function resolveInstruction(
  manifest: SkillManifest,
  dir: string,
  source: string,
): Promise<string> {
  if (manifest.instruction !== undefined) return manifest.instruction;
  // The refine on the schema guarantees one of the two is present.
  const path = resolve(dir, manifest.instructionPath as string);
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new SkillManifestError(
      `instructionPath "${manifest.instructionPath}" could not be read (looked at ${path})`,
      source,
    );
  }
}

/**
 * Load a single skill from a directory (containing `skill.json`) or from an
 * explicit manifest file path. Validates the manifest, reads the instruction,
 * imports the module, and resolves every tool handler + the verifier. Throws a
 * `SkillManifestError` with actionable detail on any failure.
 */
export async function loadSkill(path: string): Promise<LoadedSkill> {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const manifestPath = isManifestPath(abs) ? abs : join(abs, MANIFEST_FILENAME);
  const dir = dirname(manifestPath);

  let rawText: string;
  try {
    rawText = await readFile(manifestPath, 'utf8');
  } catch {
    throw new SkillManifestError(`no skill manifest found at ${manifestPath}`, manifestPath);
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SkillManifestError(`manifest is not valid JSON: ${msg}`, manifestPath);
  }

  const manifest = parseManifest(rawData, manifestPath);
  const instruction = await resolveInstruction(manifest, dir, manifestPath);

  let mod: Record<string, unknown> = {};
  let modulePath = '';
  if (manifest.module !== undefined) {
    modulePath = resolve(dir, manifest.module);
    if (!(await fileExists(modulePath))) {
      throw new SkillManifestError(
        `module "${manifest.module}" does not exist (looked at ${modulePath})`,
        manifestPath,
      );
    }
    mod = await importModule(modulePath, manifestPath);
  }

  const tools = manifest.tools.map((t) => toToolSpec(t, mod, modulePath, manifestPath));

  let verifier: VerifierFn | undefined;
  if (manifest.verifier !== undefined) {
    verifier = resolveExportedFn(
      mod,
      modulePath,
      manifest.verifier,
      'verifier',
      manifestPath,
    ) as VerifierFn;
  } else if (manifest.rubric !== undefined) {
    verifier = rubricVerifier(manifest.rubric);
  }

  const loaded: LoadedSkill = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    instruction,
    tools,
    episodes: manifest.episodes,
    dir,
  };
  if (verifier !== undefined) loaded.verifier = verifier;
  return loaded;
}

/**
 * Discover and load every skill directly under `rootDir` — each immediate
 * subdirectory that contains a `skill.json`. Returns them sorted by name for
 * deterministic install order. Subdirectories without a manifest are skipped.
 */
export async function discoverSkills(rootDir: string): Promise<LoadedSkill[]> {
  const abs = isAbsolute(rootDir) ? rootDir : resolve(process.cwd(), rootDir);
  if (!(await isDir(abs))) {
    throw new SkillManifestError(`skills directory not found: ${abs}`, abs);
  }
  const entries = await readdir(abs, { withFileTypes: true });
  const skills: LoadedSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(abs, entry.name);
    if (await fileExists(join(dir, MANIFEST_FILENAME))) {
      skills.push(await loadSkill(dir));
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** Re-exported for callers that want the directory's leaf name (skill id hint). */
export function skillDirName(dir: string): string {
  return basename(dir);
}
