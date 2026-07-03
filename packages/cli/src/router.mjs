// CLI wiring for @glamfire/router: build a real ModelRegistry from the resolved
// config (using the real fireworks-glm adapter), and construct a Router from the
// declarative routing policy. Shared by `glam run` (live) and `glam route`
// (offline dry-run).

import {
  createAnthropicAdapter,
  createFireworksGlmAdapter,
  createTogetherAdapter,
  resolveAnthropicConfig,
  resolveFireworksConfig,
  resolveTogetherConfig,
} from '@glamfire/adapters';
import { ModelRegistry, Router, descriptorFromAdapter } from '@glamfire/router';

/**
 * Build a registry of runnable models from the resolved GlamConfig. Every model
 * id listed under `providers.fireworks.models` is wired to the real fireworks
 * adapter with real, declared capabilities and real pricing. Model ids served by
 * a provider whose adapter is not yet built are intentionally left unregistered
 * — the router reports them honestly as "no adapter wired" rather than faking
 * capabilities or cost.
 *
 * `allowDryRunKey: true` lets the registry be built without a Fireworks API key
 * (for the offline `glam route` decision, which never calls a provider). The
 * placeholder key is never used because no request is ever sent.
 */
export function buildModelRegistry(glamConfig, env, { allowDryRunKey = false } = {}) {
  const registry = new ModelRegistry();
  // Fireworks — the workhorse provider. The default list registers GLM-5.2 (the
  // workhorse), DeepSeek-V4-Flash (budget tier), and DeepSeek-V4-Pro (open
  // escalation tier), all behind the same FIREWORKS_API_KEY, each with its own
  // verified per-model capabilities + tiered pricing (research/25).
  const fireworksModels = new Set(glamConfig.providers.fireworks.models);
  // The headline default model is fireworks-served by default; include it.
  fireworksModels.add(glamConfig.model);

  for (const modelId of fireworksModels) {
    const overrides = { model: modelId };
    if (allowDryRunKey && !env.FIREWORKS_API_KEY) {
      // Offline decision only — capabilities + pricing need no key, and no call
      // is made. The live `run` path never sets this and requires a real key.
      overrides.apiKey = 'dry-run-no-provider-call';
    }
    const fwConfig = resolveFireworksConfig(env, overrides, { config: glamConfig });
    const adapter = createFireworksGlmAdapter(fwConfig);
    const runtimeConfig = {
      model: modelId,
      reasoningEffort: fwConfig.reasoningEffort,
      serviceTier: fwConfig.serviceTier,
      temperature: fwConfig.temperature,
    };
    if (fwConfig.maxTokens !== undefined) runtimeConfig.maxTokens = fwConfig.maxTokens;
    if (fwConfig.seed !== undefined) runtimeConfig.seed = fwConfig.seed;
    registry.add(descriptorFromAdapter(adapter, runtimeConfig));
  }

  // Together AI — second OpenAI-compatible provider (research/23): serves GLM-5.2
  // (FP4) and Qwen3-Coder-Next (FP8) behind the shared core. Only models the team
  // explicitly lists under `providers.together.models` are registered; with the
  // default (empty) list nothing is wired, so the router never pretends a Together
  // path exists that the config didn't ask for. Each registered model carries its
  // own real capabilities + per-model pricing (and served quantization).
  const togetherModels = new Set(glamConfig.providers.together.models);
  for (const modelId of togetherModels) {
    const overrides = { model: modelId };
    if (allowDryRunKey && !env.TOGETHER_API_KEY) {
      overrides.apiKey = 'dry-run-no-provider-call';
    }
    const togetherConfig = resolveTogetherConfig(env, overrides, { config: glamConfig });
    const adapter = createTogetherAdapter(togetherConfig);
    const runtimeConfig = { model: modelId, temperature: togetherConfig.temperature };
    // reasoning_effort only matters for the thinking model (GLM); the adapter
    // ignores it for the non-thinking Qwen3-Coder-Next.
    if (adapter.modelInfo.thinking && togetherConfig.reasoningEffort !== undefined) {
      runtimeConfig.reasoningEffort = togetherConfig.reasoningEffort;
    }
    if (togetherConfig.maxTokens !== undefined) runtimeConfig.maxTokens = togetherConfig.maxTokens;
    if (togetherConfig.seed !== undefined) runtimeConfig.seed = togetherConfig.seed;
    registry.add(descriptorFromAdapter(adapter, runtimeConfig));
  }

  // Anthropic (Claude) — the edge/escalation candidate. Only models the team has
  // explicitly listed under `providers.anthropic.models` are registered; with the
  // default (empty) list nothing is wired, so the router never pretends an
  // escalation path exists that the config didn't ask for.
  const anthropicModels = new Set(glamConfig.providers.anthropic.models);
  for (const modelId of anthropicModels) {
    const overrides = { model: modelId };
    if (allowDryRunKey && !env.ANTHROPIC_API_KEY) {
      overrides.apiKey = 'dry-run-no-provider-call';
    }
    const anthropicConfig = resolveAnthropicConfig(env, overrides, { config: glamConfig });
    const adapter = createAnthropicAdapter(anthropicConfig);
    const runtimeConfig = { model: modelId };
    if (anthropicConfig.maxTokens !== undefined)
      runtimeConfig.maxTokens = anthropicConfig.maxTokens;
    if (anthropicConfig.temperature !== undefined) {
      runtimeConfig.temperature = anthropicConfig.temperature;
    }
    if (anthropicConfig.effort !== undefined) runtimeConfig.effort = anthropicConfig.effort;
    registry.add(descriptorFromAdapter(adapter, runtimeConfig));
  }

  return registry;
}

/** Construct a Router over the resolved routing policy + a model registry. */
export function buildRouter(glamConfig, registry, opts = {}) {
  return new Router({
    routing: glamConfig.routing,
    registry,
    ...opts,
  });
}
