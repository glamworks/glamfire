// Skill manifest format (SPEC §5.5) — the documented, versioned, zod-validated
// contract for a portable capability pack on disk.
//
// A skill is a self-contained, portable DIRECTORY:
//
//   my-skill/
//     skill.json        <- the manifest (this schema)
//     skill.mjs         <- ES module exporting tool handlers + (optional) verifier
//     template.md       <- optional model-neutral instruction file
//
// The manifest is intentionally model-NEUTRAL: it carries the instruction/prompt
// template, the tools the skill needs (declared as JSON-Schema args + a named
// handler exported by the module), optional few-shot example episodes, and an
// optional verifier. Nothing here is tuned to one model family — the same skill
// directory installs unchanged onto GLM, Claude, GPT, or a local model, because
// each tool is re-emitted into the target model's native grammar by its adapter.

import type { ToolPermissionClass } from '@glamfire/engine';
import { z } from 'zod';

/** Loose semver gate: a skill must declare a real, comparable version. */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+].*)?$/;

/** The four privilege classes the engine's permission gate understands. */
const permissionSchema: z.ZodType<ToolPermissionClass> = z.enum([
  'read',
  'write',
  'network',
  'exec',
]);

/**
 * A tool the skill needs. `parameters` is a JSON-Schema object for the tool's
 * arguments (model-neutral); `handler` names an async function exported by the
 * skill's module. `permission` defaults to 'exec' (least trust) to match the
 * engine's least-privilege default.
 */
export const skillToolSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'tool name must be a valid identifier'),
    description: z.string().min(1, 'a tool needs a description the model can act on'),
    permission: permissionSchema.default('exec'),
    parameters: z
      .record(z.string(), z.unknown())
      .default({ type: 'object', properties: {}, additionalProperties: false }),
    /** Name of the async handler function exported by the skill module. */
    handler: z.string().min(1, 'tool.handler must name an exported function'),
  })
  .strict();

export type SkillToolManifest = z.infer<typeof skillToolSchema>;

/** A logged interaction reused as few-shot context (SPEC §5.2 Episode). */
export const episodeSchema = z
  .object({
    goal: z.string().min(1),
    response: z.string().min(1),
    note: z.string().optional(),
  })
  .strict();

export type EpisodeManifest = z.infer<typeof episodeSchema>;

/**
 * A deterministic, model-free verification rubric. Each criterion checks the
 * output string against a regex it must match (`must`) and/or one it must not
 * match (`mustNot`). Real and provider-independent — the harness can run it on
 * any model's output to gate quality before accepting or escalating.
 */
export const rubricCriterionSchema = z
  .object({
    description: z.string().min(1),
    must: z.string().optional(),
    mustNot: z.string().optional(),
  })
  .strict()
  .refine((c) => c.must !== undefined || c.mustNot !== undefined, {
    message: 'a rubric criterion needs at least one of "must" or "mustNot"',
  });

export const rubricSchema = z
  .object({
    criteria: z.array(rubricCriterionSchema).min(1),
  })
  .strict();

export type RubricManifest = z.infer<typeof rubricSchema>;

/**
 * The full skill manifest. A skill must carry a model-neutral instruction —
 * either inline (`instruction`) or in a referenced file (`instructionPath`).
 * `module` is required whenever tools or a function verifier are declared.
 */
export const skillManifestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z][a-z0-9-]*$/, 'skill name must be kebab-case (a-z, 0-9, -)'),
    version: z.string().regex(SEMVER, 'version must be semver, e.g. "1.0.0"'),
    description: z.string().min(1, 'a skill needs a one-line description'),
    /** Relative path to the ES module exporting handlers + verifier. */
    module: z.string().min(1).optional(),
    /** Inline model-neutral instruction/prompt template. */
    instruction: z.string().min(1).optional(),
    /** Relative path to a model-neutral instruction file (e.g. template.md). */
    instructionPath: z.string().min(1).optional(),
    tools: z.array(skillToolSchema).default([]),
    episodes: z.array(episodeSchema).default([]),
    /** Name of an exported verifier function (output -> VerifierResult). */
    verifier: z.string().min(1).optional(),
    /** A declarative, model-free verification rubric. */
    rubric: rubricSchema.optional(),
  })
  .strict()
  .refine((m) => m.instruction !== undefined || m.instructionPath !== undefined, {
    message: 'a skill must provide "instruction" or "instructionPath"',
  })
  .refine((m) => !(m.tools.length > 0 && m.module === undefined), {
    message: 'tools are declared but no "module" is set to resolve their handlers',
  })
  .refine((m) => !(m.verifier !== undefined && m.module === undefined), {
    message: 'a function "verifier" is named but no "module" is set to resolve it',
  });

export type SkillManifest = z.infer<typeof skillManifestSchema>;

/** Thrown when a manifest fails validation; carries an actionable, multi-line message. */
export class SkillManifestError extends Error {
  constructor(
    message: string,
    /** Source path of the offending manifest, for actionable diagnostics. */
    readonly source: string,
  ) {
    super(message);
    this.name = 'SkillManifestError';
  }
}

/**
 * Validate raw manifest data, returning a typed manifest or throwing a
 * `SkillManifestError` with an actionable, field-by-field message. `source` is
 * the manifest's path (or other label) surfaced in error text.
 */
export function parseManifest(raw: unknown, source = '<inline>'): SkillManifest {
  const parsed = skillManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new SkillManifestError(`invalid skill manifest (${source}):\n${issues}`, source);
  }
  return parsed.data;
}
