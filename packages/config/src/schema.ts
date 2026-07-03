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
/**
 * DeepSeek-V4-Pro on Fireworks serverless (research/25): the open escalation
 * tier — 1M ctx, FP8, tool calling, MIT weights. Live-verified 2026-07-03.
 */
export const FIREWORKS_DEEPSEEK_PRO_MODEL = 'accounts/fireworks/models/deepseek-v4-pro';
/**
 * DeepSeek-V4-Flash on Fireworks serverless (research/25): the budget tier —
 * cheapest capable 1M-context model ($0.14/$0.28). Live-verified 2026-07-03.
 */
export const FIREWORKS_DEEPSEEK_FLASH_MODEL = 'accounts/fireworks/models/deepseek-v4-flash';

/** Together AI — second OpenAI-compatible inference provider (research/23). */
export const TOGETHER_DEFAULT_BASE_URL = 'https://api.together.xyz/v1';
/** GLM-5.2 on Together (HF-style id), served at FP4 (research/23 §2). */
export const TOGETHER_GLM_MODEL = 'zai-org/GLM-5.2';
/** Qwen3-Coder-Next on Together — the second open-weight model, FP8 (research/23 §1). */
export const TOGETHER_QWEN_MODEL = 'Qwen/Qwen3-Coder-Next';
/** DeepSeek-V4-Pro on Together — secondary DeepSeek host, 512K ctx (research/25). */
export const TOGETHER_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Pro';

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

// --- capability tokens (shared by routing rules and local capability floors) --

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

/**
 * The local/self-host provider: any OpenAI-compatible server the user runs
 * (Ollama, vLLM, SGLang, LM Studio, antirez's DwarfStar/DS4). Unlike hosted
 * providers, glamfire cannot know the served model's capabilities, context
 * window, or cost a priori — the USER declares them here, and the declarations
 * are honest routing inputs (the capability floor): an undeclared capability is
 * absent, never guessed. Marginal token price defaults to $0 (owned hardware);
 * it can be overridden for internal cost attribution, never invented.
 */
export const localProviderSchema = providerSchema.extend({
  /** Context-window cap in tokens for the served model (conservative default: 32768). */
  contextWindow: z.number().int().positive().optional(),
  /** Max output tokens per turn (default: 8192, clamped to contextWindow). */
  maxOutputTokens: z.number().int().positive().optional(),
  /**
   * Capability tokens the served model actually supports. Conservative default:
   * ["tool_calling", "streaming"] — declare more only when your server/model
   * really provides it (this is the router's capability floor for local models).
   */
  capabilities: z.array(capabilitySchema).optional(),
  /** USD per 1M input tokens (default 0 — self-host marginal price). */
  usdPerMInput: z.number().nonnegative().optional(),
  /** USD per 1M cached-input tokens (default 0). */
  usdPerMCachedInput: z.number().nonnegative().optional(),
  /** USD per 1M output tokens (default 0). */
  usdPerMOutput: z.number().nonnegative().optional(),
});
export type LocalProviderConfig = z.infer<typeof localProviderSchema>;

export const providersSchema = z.strictObject({
  fireworks: providerSchema,
  together: providerSchema,
  anthropic: providerSchema,
  openai: providerSchema,
  local: localProviderSchema,
});
export type ProvidersConfig = z.infer<typeof providersSchema>;
/** Stable provider keys the harness ships adapters (or adapter slots) for. */
export type ProviderName = keyof ProvidersConfig;

// --- routing policy (declarative; the @glamfire/router contract) -------------

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
  /**
   * Restrict routing to $0 self-host models served by `providers.local`
   * (privacy/offline mode). With this set, hosted candidates are ineligible and
   * the router fails LOUD when no local model can satisfy a task — it never
   * silently falls back to a hosted provider. CLI override: `glam run --local`.
   * Absent = false (hosted and local candidates compete normally).
   */
  localOnly: z.boolean().optional(),
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

// --- usage & billing (the local usage ledger + budget alerting) ---------------

/**
 * Monitoring, usage & billing. Every real run is appended to the local, owned
 * usage ledger (`~/.glam/usage.jsonl`); these keys control budget alerting on
 * top of it. `glam run` warns when month-to-date spend crosses
 * `warnAtPct` % of `monthlyBudgetUsd`, and `glam usage` renders a budget bar.
 */
export const usageSchema = z.strictObject({
  /** Soft monthly spend budget in USD (alerting only — runs are never blocked). */
  monthlyBudgetUsd: z.number().positive().optional(),
  /** Warn when month-to-date spend crosses this percentage of the budget. */
  warnAtPct: z.number().min(1).max(100),
});
export type UsageConfig = z.infer<typeof usageSchema>;

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
  usage: usageSchema,
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
        // All three ride the same FIREWORKS_API_KEY, so registering them by
        // default adds no new credential assumption: GLM-5.2 (the workhorse),
        // DeepSeek-V4-Flash (budget tier), DeepSeek-V4-Pro (open escalation).
        models: [GLM_DEFAULT_MODEL, FIREWORKS_DEEPSEEK_FLASH_MODEL, FIREWORKS_DEEPSEEK_PRO_MODEL],
        credential: { env: 'FIREWORKS_API_KEY' },
      },
      // Together AI — second OpenAI-compatible provider (research/23). Wired but
      // unlisted by default (like anthropic): the harness only registers the
      // models a user explicitly lists, so it never assumes a Together key
      // exists or routes there unasked. See glam.example.toml to enable.
      together: {
        baseUrl: TOGETHER_DEFAULT_BASE_URL,
        models: [],
        credential: { env: 'TOGETHER_API_KEY' },
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
      localOnly: false,
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
    usage: {
      // No monthly budget by default (alerting is opt-in); warn at 80% once set.
      warnAtPct: 80,
    },
  };
}
