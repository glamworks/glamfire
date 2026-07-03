// @glamfire/proxy — the router-as-proxy translation layer behind `glam serve`
// (research/28 §6 mode 3, research/32 backlog item 4). Pure wire translation:
// Anthropic Messages ⇄ OpenAI chat completions, streaming included. The CLI's
// proxy server owns transport, auth, budget stops, and the usage ledger.

export {
  AnthropicStreamTranslator,
  TranslateError,
  anthropicErrorBody,
  anthropicToOpenAIRequest,
  encodeAnthropicSSE,
  estimateInputTokens,
  mapFinishToStopReason,
  openaiErrorBody,
  openaiToAnthropicResponse,
  usageFromOpenAI,
  type AnthropicMessagesRequest,
  type AnthropicSSEEvent,
  type OpenAIChatResponse,
  type OpenAIStreamChunk,
  type TranslateOptions,
  type TranslatedRequest,
} from './translate.js';
