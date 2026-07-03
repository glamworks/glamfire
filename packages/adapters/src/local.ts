// local — the self-host adapter: ANY OpenAI-compatible endpoint the user runs
// (Ollama, vLLM, SGLang, LM Studio, antirez's DwarfStar/DS4 serving DeepSeek V4
// Flash). One adapter behind the shared `openai-compatible` core (SPEC §5.4,
// research/26 §6, research/27 §3, issue #25).
//
// What makes it different from a hosted adapter — and how it stays honest:
//   - Capabilities/context/price are USER-DECLARED (local-config.ts). glamfire
//     never guesses what a self-hosted server serves; the conservative default
//     floor is tool_calling + streaming at a 32K context cap and $0/1M.
//   - $0/token is the REAL marginal price of owned hardware (not a fake):
//     hardware/electricity are not billed per token. Overridable for internal
//     accounting.
//   - Usage honesty: some local servers omit `usage` from responses. When a
//     turn produces output but reports no token counts, this adapter records it
//     (`turnsWithoutUsage`) so surfaces can SAY token counts were not reported —
//     glamfire never invents numbers to fill the gap.
//   - Tool-call ID fidelity: IDs round-trip byte-exact through the shared core
//     (neutralToWire passes them verbatim). This is a hard contract for
//     DwarfStar/DS4, whose exact-replay design keys original DSML blocks off
//     the IDs glamfire sends back (research/27 §3) — covered by tests.
//   - No credential required: when no key is configured, NO Authorization
//     header is sent (most local servers want none); a 401 still points at
//     GLAM_LOCAL_API_KEY for vLLM --api-key style setups.

import type {
  Capabilities,
  ModelTurnResult,
  ProviderRequest,
  RunState,
  StreamEvent,
  Usage,
} from '@glamfire/engine';
import type { LocalConfig } from './local-config.js';
import { OpenAICompatibleAdapter } from './openai-compatible.js';

/** Map user-declared capability tokens onto the engine's Capabilities surface. */
export function localCapabilities(config: LocalConfig): Capabilities {
  const tokens = new Set(config.capabilities);
  return {
    contextWindow: config.contextWindow,
    maxOutputTokens: config.maxOutputTokens,
    toolCalling: tokens.has('tool_calling'),
    parallelToolCalls: tokens.has('parallel_tool_calls'),
    jsonMode: tokens.has('json_mode'),
    vision: tokens.has('vision'),
    streaming: tokens.has('streaming'),
    seed: tokens.has('seed'),
  };
}

function localPricing(config: LocalConfig): (usage: Usage) => number {
  const { usdPerMInput, usdPerMCachedInput, usdPerMOutput } = config;
  return (usage: Usage) => {
    const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    return (
      (uncachedInput * usdPerMInput +
        usage.cachedInputTokens * usdPerMCachedInput +
        usage.outputTokens * usdPerMOutput) /
      1_000_000
    );
  };
}

function producedOutput(result: ModelTurnResult): boolean {
  return result.text.length > 0 || result.reasoning.length > 0 || result.toolCalls.length > 0;
}

function usageReported(usage: Usage): boolean {
  return usage.inputTokens > 0 || usage.outputTokens > 0 || usage.cachedInputTokens > 0;
}

/**
 * The local/self-host adapter — a specialization of the shared OpenAI-compatible
 * core parameterized entirely by user-declared config.
 */
export class LocalAdapter extends OpenAICompatibleAdapter {
  /** True when the resolved config carries a bearer token. */
  readonly authenticated: boolean;
  /**
   * Turns (this adapter instance) that produced output but reported NO token
   * usage — the server does not implement the `usage` field. Surfaces use this
   * to say token counts are unreported instead of showing silent zeros.
   */
  turnsWithoutUsage = 0;

  constructor(config: LocalConfig) {
    super({
      id: 'local',
      baseUrl: config.baseUrl,
      // The shared core formats `Bearer ${apiKey}`; encodeRequest below strips
      // the header entirely when no key is configured.
      apiKey: config.apiKey ?? '',
      model: config.model,
      capabilities: localCapabilities(config),
      pricing: localPricing(config),
      providerLabel: `local OpenAI-compatible server (${config.baseUrl})`,
      keyEnvVar: 'GLAM_LOCAL_API_KEY',
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      seed: config.seed,
      // Local servers (Ollama/vLLM/LM Studio/DS4) do not implement the
      // GLM-style `reasoning_effort` knob or Fireworks service tiers; thinking
      // models stream `reasoning`/`reasoning_content`, which the shared
      // accumulator already tolerates.
      sendReasoningEffort: false,
      sendServiceTier: false,
    });
    this.authenticated = config.apiKey !== undefined && config.apiKey !== '';
  }

  override encodeRequest(state: RunState, opts?: { stream?: boolean }): ProviderRequest {
    const req = super.encodeRequest(state, opts);
    if (!this.authenticated) {
      // No key configured -> send NO Authorization header at all. A dangling
      // "Bearer " confuses some servers, and local endpoints usually want none.
      const { Authorization: _drop, ...headers } = req.headers;
      return { ...req, headers };
    }
    return req;
  }

  private track(result: ModelTurnResult): ModelTurnResult {
    if (producedOutput(result) && !usageReported(result.usage)) {
      this.turnsWithoutUsage += 1;
    }
    return result;
  }

  override async complete(state: RunState): Promise<ModelTurnResult> {
    return this.track(await super.complete(state));
  }

  override async stream(
    state: RunState,
    onEvent: (ev: StreamEvent) => void,
  ): Promise<ModelTurnResult> {
    return this.track(await super.stream(state, onEvent));
  }
}

/** Construct the adapter from a resolved local config. */
export function createLocalAdapter(config: LocalConfig): LocalAdapter {
  return new LocalAdapter(config);
}
