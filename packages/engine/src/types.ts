// @glamfire/engine — the neutral contract.
//
// This is the lynchpin every other subsystem imports: the router produces
// `route_decision`/`escalation` steps, skills register `ToolSpec`s, the brain
// packs context into `RunState`, and adapters translate `RunState` <-> provider
// wire format. Keep these types clean, neutral, and provider-agnostic.

/** A JSON-Schema object describing a tool's arguments (model-neutral). */
export type JSONSchema = Record<string, unknown>;

/** Token accounting for a single provider call, in the three billed dimensions. */
export interface Usage {
  inputTokens: number;
  /** Input tokens served from the provider's prompt cache (billed cheaper). */
  cachedInputTokens: number;
  outputTokens: number;
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** A token/cost budget. The engine enforces these as hard ceilings. */
export interface Budget {
  /** Hard ceiling on total spend in USD across the run. */
  maxUSD?: number;
  /** Hard ceiling on total tokens (input + output) across the run. */
  maxTokens?: number;
  /** Hard ceiling on plan->act->observe iterations (loop cap). */
  maxSteps?: number;
}

/** The unit of work handed to the engine. */
export interface Task {
  /** What the user wants done, in natural language. */
  goal: string;
  /** Optional structured inputs (e.g. file contents) folded into the first turn. */
  inputs?: Record<string, string>;
  /** Optional hard constraints surfaced to the model. */
  constraints?: string[];
  /** Token/cost budget enforced as a hard ceiling. */
  budget: Budget;
}

/** A single tool invocation requested by the model (parsed into neutral form). */
export interface ToolCall {
  /** Provider-assigned call id, preserved so results thread back correctly. */
  id: string;
  name: string;
  /** Parsed argument object (adapters unify string-vs-object argument typing). */
  arguments: Record<string, unknown>;
}

/** Classifies a tool for the least-privilege permission gate. */
export type ToolPermissionClass = 'read' | 'write' | 'network' | 'exec';

/** Context passed to a tool handler at dispatch time. */
export interface ToolContext {
  /** Absolute path the run is scoped to (sandbox filesystem root). */
  cwd: string;
}

/** A tool declared once in neutral form; the active adapter re-emits it per model. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON-Schema for the arguments object. */
  parameters: JSONSchema;
  /** Privilege class used by the permission gate (default: 'exec', least trust). */
  permission: ToolPermissionClass;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Steps — the ordered, persisted, replayable record of a Run.
// ---------------------------------------------------------------------------

interface BaseStep {
  /** Monotonic index within the run. */
  index: number;
  /** Epoch milliseconds when the step was recorded. */
  ts: number;
}

export interface ModelTurnStep extends BaseStep {
  type: 'model_turn';
  /** Assistant content tokens. */
  text: string;
  /** Interleaved reasoning/thinking tokens (GLM emits these by default). */
  reasoning: string;
  /** Tool calls the model requested this turn (already reassembled). */
  toolCalls: ToolCall[];
  usage: Usage;
  costUSD: number;
  /** Provider stop reason (e.g. 'stop', 'tool_calls', 'length'). */
  finishReason: string;
}

export interface ToolCallStep extends BaseStep {
  type: 'tool_call';
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Permission-gate verdict that admitted (or blocked) this call. */
  permission: 'allow' | 'ask' | 'deny';
}

export interface ToolResultStep extends BaseStep {
  type: 'tool_result';
  callId: string;
  name: string;
  ok: boolean;
  /** Tool output, or an error observation fed back to the model. */
  result: unknown;
}

export interface RouteDecisionStep extends BaseStep {
  type: 'route_decision';
  adapter: string;
  model: string;
  reason: string;
}

export interface EscalationStep extends BaseStep {
  type: 'escalation';
  from: string;
  to: string;
  trigger: string;
}

export interface VerificationStep extends BaseStep {
  type: 'verification';
  passed: boolean;
  detail: string;
}

export type FinalReason = 'stop' | 'budget_exhausted' | 'max_steps' | 'error';

export interface FinalStep extends BaseStep {
  type: 'final';
  text: string;
  reason: FinalReason;
}

/** Discriminated union of every step kind. Switch on `.type`. */
export type Step =
  | ModelTurnStep
  | ToolCallStep
  | ToolResultStep
  | RouteDecisionStep
  | EscalationStep
  | VerificationStep
  | FinalStep;

export type RunStatus = 'running' | 'done' | 'budget_exhausted' | 'error';

/** A completed (or in-progress) run: replayable from its ordered step log. */
export interface Run {
  task: Task;
  steps: Step[];
  /** Cumulative token usage across all model turns. */
  usage: Usage;
  /** Cumulative spend in USD across all model turns. */
  costUSD: number;
  status: RunStatus;
  /** The model's final answer (mirrors the trailing FinalStep). */
  output: string;
}

// ---------------------------------------------------------------------------
// Adapter contract — the per-model harness boundary (SPEC §5.4).
// ---------------------------------------------------------------------------

/** Declared support surface used by the router to filter candidate models. */
export interface Capabilities {
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens in a single turn. */
  maxOutputTokens: number;
  toolCalling: boolean;
  parallelToolCalls: boolean;
  jsonMode: boolean;
  vision: boolean;
  streaming: boolean;
  /** Whether the provider honors a fixed seed for determinism. */
  seed: boolean;
}

/** Per-call runtime knobs resolved from config (model id, effort, tier, temp). */
export interface AdapterRuntimeConfig {
  model: string;
  /** GLM reasoning effort; passed through to the provider. */
  reasoningEffort?: 'high' | 'max';
  /** Fireworks service tier. */
  serviceTier?: 'standard' | 'priority' | 'fast' | 'background';
  temperature?: number;
  maxTokens?: number;
  /** Provider-honored seed for reproducible runs where supported. */
  seed?: number;
}

/** A neutral message in the conversation the engine maintains across turns. */
export type NeutralMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; reasoning: string; toolCalls: ToolCall[] }
  | { role: 'tool'; callId: string; name: string; content: string };

/** Everything an adapter needs to encode one provider request. */
export interface RunState {
  /** System-prompt text (composed by skills/brain upstream). */
  system: string;
  task: Task;
  /** Conversation so far, in neutral form. */
  messages: NeutralMessage[];
  /** Tools available this turn (re-emitted into the model's native grammar). */
  tools: ToolSpec[];
  config: AdapterRuntimeConfig;
}

/** A ready-to-send provider HTTP request (transport-neutral shape). */
export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** The normalized result of a single model turn, in neutral form. */
export interface ModelTurnResult {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason: string;
}

/** Streamed token event surfaced to the live UI as the model generates. */
export type StreamEvent =
  | { kind: 'reasoning'; delta: string }
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call_started'; id: string; name: string };

/**
 * The single contract every model family implements. A model is only
 * "supported" once its adapter passes the shared conformance suite.
 */
export interface AdapterContract {
  /** Stable adapter id, e.g. 'fireworks-glm'. */
  id: string;
  capabilities: Capabilities;
  /** Neutral run state -> provider request (system shaping, tool grammar, knobs). */
  encodeRequest(state: RunState, opts?: { stream?: boolean }): ProviderRequest;
  /** Non-streaming provider response -> neutral turn result. */
  decodeResponse(raw: unknown): ModelTurnResult;
  /** Token cost function used by the router and the budget gate. */
  pricing(usage: Usage): number;
}

/**
 * Streaming variant. `stream` performs the request and reassembles fragmented
 * tool-call arguments (a GLM streaming requirement) into a neutral result,
 * emitting token events along the way.
 */
export interface StreamingAdapter extends AdapterContract {
  stream(state: RunState, onEvent: (ev: StreamEvent) => void): Promise<ModelTurnResult>;
  /** Non-streaming completion (used when streaming is disabled). */
  complete(state: RunState): Promise<ModelTurnResult>;
}
