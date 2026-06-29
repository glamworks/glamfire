// CLI wiring for @glamfire/router: build a real ModelRegistry from the resolved
// config (using the real fireworks-glm adapter), and construct a Router from the
// declarative routing policy. Shared by `glam run` (live) and `glam route`
// (offline dry-run).

import {
  createAnthropicAdapter,
  createFireworksGlmAdapter,
  resolveAnthropicConfig,
  resolveFireworksConfig,
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
