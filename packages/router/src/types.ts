// @glamfire/router — domain types (SPEC §5.3).
//
// The router decides which model handles each task and when to escalate. It is
// driven entirely by the declarative `routing` policy from @glamfire/config and
// the adapter-declared `Capabilities`/`pricing` from @glamfire/engine. Nothing
// here talks to a provider: classification and policy are pre-call and pure;
// escalation is a hook the engine loop drives.

import type {
  AdapterRuntimeConfig,
  Capabilities,
  RouteClassification,
  StreamingAdapter,
  Usage,
} from '@glamfire/engine';

/**
 * Coarse task shape used as a (strong) classification signal. Center-of-
 * distribution shapes are routine and cheap-model-suitable; edge shapes are the
 * multi-step / generative / novel work that warrants a frontier model.
 */
export type TaskType =
  | 'summary'
  | 'extraction'
  | 'classification'
  | 'reformat'
  | 'translation'
  | 'qa'
  | 'reasoning'
  | 'generation'
  | 'coding'
  | 'unknown';

/** Retrieval-hit quality for the task's context (a center-ness signal). */
export interface RetrievalSignal {
  /** Number of context chunks retrieved. */
  hits: number;
  /** Mean similarity/quality of those hits, [0,1]. */
  meanScore: number;
}

/** Historical outcomes for similar past tasks (a learned center/edge signal). */
export interface HistorySignal {
  /** How many similar past tasks were observed. */
  similar: number;
  /** How many of those had to escalate to a stronger model. */
  escalated: number;
}

/** Everything the classifier consults — all available *before* any model call. */
export interface ClassificationInput {
  goal: string;
  inputs?: Record<string, string>;
  constraints?: string[];
  /** Optional explicit task-shape hint. */
  taskType?: TaskType;
  /** Optional retrieval-hit quality from the brain/context store. */
  retrieval?: RetrievalSignal;
  /** Optional historical outcomes for similar tasks. */
  history?: HistorySignal;
}

/** One signal's contribution to the edge-ness estimate. */
export interface SignalContribution {
  name: string;
  /** This signal's edge-ness vote, [0,1] (0 = center, 1 = edge). */
  edgeness: number;
  /** Relative weight of this signal (>= 0). */
  weight: number;
  /** Human-readable note for the `--explain` trace. */
  note: string;
}

/** A composable feature extractor; returns null when the signal isn't present. */
export type SignalExtractor = (input: ClassificationInput) => SignalContribution | null;

/** The classifier's verdict: the neutral `RouteClassification` plus its trace. */
export interface Classification extends RouteClassification {
  /** The signal contributions that produced the score (for `--explain`). */
  contributions: SignalContribution[];
  /** The center/edge decision boundary used, [0,1]. */
  threshold: number;
}

/**
 * A runnable model the router can select: a model id bound to a real adapter +
 * runtime config, with the adapter's declared capabilities and cost function.
 * Built from real adapters only — the router never invents capabilities/pricing.
 */
export interface ModelDescriptor {
  /** Model id (matches `routing.candidates` / `routing.default`). */
  id: string;
  adapter: StreamingAdapter;
  config: AdapterRuntimeConfig;
  capabilities: Capabilities;
  /** Cost in USD for a given token usage (the adapter's pricing function). */
  pricing: (usage: Usage) => number;
}
