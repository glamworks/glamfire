// The glamfire configuration schema (SPEC §6) — documented, versioned, and
// validated with zod. This is part of the spec surface: it is the contract the
// CLI, adapters, and the future router all read. Field names here are stable.
//
// Secrets are NEVER stored in the config object: providers carry a *credential
// reference* (an env-var name or a keychain location), and the plaintext is
// resolved on demand into a redaction-safe `Secret` (see credentials.ts). That
// is what makes "show config" structurally safe to print.

import { z } from 'zod';

/** Bumped when the config shape changes in a way that needs migration. */
export const CONFIG_SCHEMA_VERSION = 1;

export const FIREWORKS_DEFAULT_BASE_URL = 'https://api.fireworks.ai/inference/v1';
/** Fireworks model id for GLM-5.2 serverless (research/02). */
export const GLM_DEFAULT_MODEL = 'accounts/fireworks/models/glm-5p2';

// --- credential references (never an inline secret) --------------------------

/** Resolve a credential from a named environment variable. */
const envCredentialSchema = z.strictObject({ env: z.string().min(1) });
/** Resolve a credential from the OS keychain (macOS/Linux/Windows). */
const keychainCredentialSchema = z.strictObject({
  keychain: z.strictObject({
    service: z.string().min(1),
    account: z.string().min(1),
  }),
});

export const credentialRefSchema = z.union([envCredentialSchema, keychainCredentialSchema]);
export type CredentialRef = z.infer<typeof credentialRefSchema>;

// --- providers ---------------------------------------------------------------

export const providerSchema = z.strictObject({
  /** Base URL of the provider's OpenAI-compatible (or native) endpoint. */
  baseUrl: z.string().url(),
  /** Known model ids served by this provider (used by the router as candidates). */
  models: z.array(z.string().min(1)).default([]),
  /** Where to resolve this provider's API credential from. Optional for local. */
  credential: credentialRefSchema.optional(),
});
export type ProviderConfig = z.infer<typeof providerSchema>;

export const providersSchema = z.strictObject({
  fireworks: providerSchema,
  anthropic: providerSchema,
  openai: providerSchema,
  local: providerSchema,
});
export type ProvidersConfig = z.infer<typeof providersSchema>;
/** Stable provider keys the harness ships adapters (or adapter slots) for. */
export type ProviderName = keyof ProvidersConfig;

// --- routing policy (declarative; the @glamfire/router contract) -------------

/**
 * Capability tokens a task can require. The router filters a rule's `candidates`
 * by each adapter's declared `Capabilities` before applying cost preference.
 * These names mirror `@glamfire/engine`'s `Capabilities` surface.
 */
export const capabilitySchema = z.enum([
  'tool_calling',
  'parallel_tool_calls',
  'json_mode',
  'vision',
  'streaming',
  'seed',
  'long_context',
]);
export type Capability = z.infer<typeof capabilitySchema>;

/**
 * One declarative routing rule. Match conditions are ANDed; an omitted condition
 * matches anything. Rules are evaluated top-to-bottom and the first match wins;
 * the router then filters `candidates` (ordered cheapest-first) by capability and
 * budget and picks the cheapest survivor. SPEC §5.3.
 */
export const routingRuleSchema = z.strictObject({
  /** Match center- vs edge-of-distribution work. */
  distribution: z.enum(['center', 'edge']).optional(),
  /** Inclusive lower bound on the router's confidence score [0,1]. */
  minConfidence: z.number().min(0).max(1).optional(),
  /** Inclusive upper bound on the router's confidence score [0,1]. */
  maxConfidence: z.number().min(0).max(1).optional(),
  /** Capabilities a candidate model must declare to be eligible. */
  requires: z.array(capabilitySchema).default([]),
  /** Skip this rule if the task's projected spend exceeds this ceiling (USD). */
  maxUsd: z.number().positive().optional(),
  /** Ordered, cheapest-first model ids the router may select from. */
  candidates: z.array(z.string().min(1)).min(1),
});
export type RoutingRule = z.infer<typeof routingRuleSchema>;

export const routingSchema = z.strictObject({
  /** Model id used when no rule matches (also the engine's direct default). */
  default: z.string().min(1),
  /** Declarative rules, evaluated in order; first match wins. */
  rules: z.array(routingRuleSchema).default([]),
});
export type RoutingConfig = z.infer<typeof routingSchema>;

// --- permissions & sandbox (enforced by the engine, §5.1 / §8) ---------------

export const verdictSchema = z.enum(['allow', 'ask', 'deny']);
export type Verdict = z.infer<typeof verdictSchema>;

/** Default verdict per privilege class; mirrors engine `PermissionPolicy`. */
export const permissionsSchema = z.strictObject({
  read: verdictSchema,
  write: verdictSchema,
  network: verdictSchema,
  exec: verdictSchema,
  /** Per-tool-name overrides (highest precedence in the gate). */
  tools: z.record(z.string(), verdictSchema).default({}),
});
export type PermissionsConfig = z.infer<typeof permissionsSchema>;

/** Sandbox allowlists enforced by the engine for tool execution. */
export const sandboxSchema = z.strictObject({
  /** Filesystem paths (dirs/globs) tools may touch. */
  filesystem: z.array(z.string()).default([]),
  /** Network hosts tools may reach. */
  network: z.array(z.string()).default([]),
  /** Commands exec tools may run. */
  command: z.array(z.string()).default([]),
});
export type SandboxConfig = z.infer<typeof sandboxSchema>;

// --- run defaults ------------------------------------------------------------

export const budgetSchema = z.strictObject({
  maxUsd: z.number().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  maxSteps: z.number().int().positive().optional(),
});
export type BudgetConfig = z.infer<typeof budgetSchema>;

export const runSchema = z.strictObject({
  /** GLM reasoning effort. */
  effort: z.enum(['high', 'max']),
  /** Fireworks service tier. */
  tier: z.enum(['standard', 'priority', 'fast', 'background']),
  /** Default sampling temperature. */
  temperature: z.number().min(0).max(2),
  /** Default run budget (hard ceilings enforced by the engine). */
  budget: budgetSchema,
});
export type RunConfig = z.infer<typeof runSchema>;

// --- top level ---------------------------------------------------------------

export const glamConfigSchema = z.strictObject({
  /** Config schema version (for migration/forward-compat). */
  version: z.number().int().positive(),
  /** Headline default model id (provider-qualified). */
  model: z.string().min(1),
  providers: providersSchema,
  routing: routingSchema,
  permissions: permissionsSchema,
  sandbox: sandboxSchema,
  run: runSchema,
});
export type GlamConfig = z.infer<typeof glamConfigSchema>;

/**
 * The built-in defaults layer (lowest precedence). A real, complete config on
 * its own: the CLI works with zero config files. Higher layers (user TOML,
 * project TOML, env, flags) deep-merge over this.
 */
export function builtinDefaults(): GlamConfig {
  return {
    version: CONFIG_SCHEMA_VERSION,
    model: GLM_DEFAULT_MODEL,
    providers: {
      fireworks: {
        baseUrl: FIREWORKS_DEFAULT_BASE_URL,
        models: [GLM_DEFAULT_MODEL],
        credential: { env: 'FIREWORKS_API_KEY' },
      },
      anthropic: {
        baseUrl: 'https://api.anthropic.com',
        models: [],
        credential: { env: 'ANTHROPIC_API_KEY' },
      },
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        models: [],
        credential: { env: 'OPENAI_API_KEY' },
      },
      local: {
        baseUrl: 'http://localhost:8000/v1',
        models: [],
      },
    },
    routing: {
      default: GLM_DEFAULT_MODEL,
      // Center-of-distribution work goes to GLM 5.2 on Fireworks by default.
      // Frontier escalation for the edge is configured by the user once an edge
      // adapter (e.g. anthropic) is wired — see glam.example.toml. We do not ship
      // a default rule that references an adapter that is not yet real.
      rules: [{ distribution: 'center', requires: [], candidates: [GLM_DEFAULT_MODEL] }],
    },
    permissions: {
      // Least-privilege defaults (mirror engine defaultPolicy).
      read: 'allow',
      write: 'ask',
      network: 'ask',
      exec: 'deny',
      tools: {},
    },
    sandbox: {
      filesystem: [],
      network: [],
      command: [],
    },
    run: {
      effort: 'high',
      tier: 'standard',
      temperature: 0.2,
      budget: { maxUsd: 0.5, maxSteps: 8 },
    },
  };
}
