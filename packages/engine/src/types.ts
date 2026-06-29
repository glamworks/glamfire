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
  /** Center vs edge of distribution, logged when a router made the call (§5.3). */
  distribution?: 'center' | 'edge';
  /** Router confidence in the classification, [0,1]. */
  confidence?: number;
  /** Edge-ness score, [0,1] (0 = dead center, 1 = far edge). */
  score?: number;
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

// ---------------------------------------------------------------------------
// Router hook — the cost-aware routing boundary (SPEC §5.3).
//
// The engine owns the loop, the budget ceiling, and the permission gate. A
// router only decides *which* model runs and *whether to escalate* after a
// final answer. This interface is implemented by `@glamfire/router`; the engine
// depends on nothing but these types, keeping the contract neutral and the
// dependency arrow pointing inward (router -> engine, never the reverse).
// ---------------------------------------------------------------------------

/** A concrete (adapter, runtime-config) pair the engine can run a turn with. */
export interface AdapterSelection {
  adapter: StreamingAdapter;
  config: AdapterRuntimeConfig;
}

/** The router's pre-call classification of a task (center <-> edge + confidence). */
export interface RouteClassification {
  distribution: 'center' | 'edge';
  /** Edge-ness in [0,1] (0 = dead center, 1 = far edge). */
  score: number;
  /** Calibrated confidence in the classification, [0,1]. */
  confidence: number;
}

/** The router's initial model choice, logged as a `route_decision` step. */
export interface RouterSelection extends AdapterSelection {
  /** Human-readable explanation (which rule matched, why this model won). */
  reason: string;
  /** Classification logged on the route_decision step. */
  classification?: RouteClassification;
}

/** A verifier verdict the engine records as a `verification` step. */
export interface VerificationVerdict {
  passed: boolean;
  detail: string;
}

/** The router's decision to escalate to a stronger model after a failed verify. */
export interface RouterEscalation extends AdapterSelection {
  /** Model id being escalated from. */
  from: string;
  /** Model id being escalated to. */
  to: string;
  /** Why the escalation fired (the recorded trigger). */
  trigger: string;
}

/** What the router hands back after reviewing a candidate's final answer. */
export interface RouterReview {
  /** Verifier verdict to log as a `verification` step (omit to skip logging). */
  verification?: VerificationVerdict;
  /** When present, the engine escalates to this selection and continues. */
  escalation?: RouterEscalation;
}

/** Read-only context the router consults when reviewing a final answer. */
export interface RouterReviewInput {
  task: Task;
  /** The model's current final answer to verify. */
  output: string;
  /** The run so far (cost/usage/steps) — for budget-aware escalation decisions. */
  run: Run;
  /** The model id that produced this answer. */
  currentModel: string;
}

/**
 * A pluggable routing brain. The engine calls `select` once at the start of a
 * run to pick the initial model, then (optionally) `review` after each final
 * answer to verify and, on failure, escalate. Escalation continues the same
 * run, so the engine's budget ceiling still bounds the whole cascade.
 */
export interface RouterHook {
  select(task: Task): RouterSelection;
  review?(input: RouterReviewInput): RouterReview | Promise<RouterReview>;
}
