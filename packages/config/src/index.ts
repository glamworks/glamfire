// @glamfire/config — the single, typed, layered, validated configuration
// (SPEC §6). Public surface: the schema + types, the loader (with provenance),
// credential resolution (redaction-safe), and the display helper for `glam config`.

export { ConfigError, type ConfigErrorCode } from './errors.js';
export { Secret, isSecret } from './secret.js';
export { readKeychain, type KeychainRef } from './keychain.js';
export {
  CONFIG_SCHEMA_VERSION,
  FIREWORKS_DEEPSEEK_FLASH_MODEL,
  FIREWORKS_DEEPSEEK_PRO_MODEL,
  FIREWORKS_DEFAULT_BASE_URL,
  GLM_DEFAULT_MODEL,
  TOGETHER_DEEPSEEK_MODEL,
  TOGETHER_DEFAULT_BASE_URL,
  TOGETHER_GLM_MODEL,
  TOGETHER_QWEN_MODEL,
  builtinDefaults,
  glamConfigSchema,
  providerSchema,
  routingSchema,
  permissionsSchema,
  sandboxSchema,
  runSchema,
  usageSchema,
  credentialRefSchema,
  capabilitySchema,
  type GlamConfig,
  type ProviderConfig,
  type ProvidersConfig,
  type ProviderName,
  type CredentialRef,
  type RoutingConfig,
  type RoutingRule,
  type Capability,
  type PermissionsConfig,
  type SandboxConfig,
  type RunConfig,
  type UsageConfig,
  type BudgetConfig,
  type Verdict,
} from './schema.js';
export {
  type LayerName,
  type Layer,
  type MergeResult,
  mergeLayers,
  flattenLeaves,
  nearestProvenance,
  isPlainObject,
} from './merge.js';
export {
  loadConfig,
  findProjectConfig,
  type LoadConfigOptions,
  type LoadedConfig,
  type ConfigSources,
  type DeepPartial,
} from './load.js';
export {
  resolveCredential,
  resolveProviderCredential,
  describeCredentialRef,
  credentialStatuses,
  type CredentialStatus,
} from './credentials.js';
export { describeConfig, type ConfigDisplay, type ConfigDisplayRow } from './display.js';
