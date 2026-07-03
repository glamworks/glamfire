// The Router (SPEC §5.3): classify -> select cheapest capable model -> run ->
// verify -> escalate, with full cost accounting. Implements the engine's
// `RouterHook` so `runTask` can drive it while still owning the loop, budget,
// and permission gate. Stateful per run (it tracks the cascade position and a
// decision ledger); construct one Router per run, or call `reset()` to reuse.

import type { RoutingConfig } from '@glamfire/config';
import type {
  RouterHook,
  RouterReview,
  RouterReviewInput,
  RouterSelection,
  Task,
  Usage,
} from '@glamfire/engine';
import { classify } from './classify.js';
import { estimateUsage } from './cost.js';
import { type PolicySelection, evaluatePolicy } from './policy.js';
import type { ModelRegistry } from './registry.js';
import { type DecisionRecord, type DistributionReport, buildReport } from './report.js';
import type {
  Classification,
  ClassificationInput,
  ModelDescriptor,
  SignalExtractor,
} from './types.js';
import { type Verifier, defaultVerifier } from './verify.js';

export interface RouterOptions {
  /** The declarative routing policy (from @glamfire/config). */
  routing: RoutingConfig;
  /** Runnable models, built from real adapters. */
  registry: ModelRegistry;
  /** Cascade verifier; defaults to a permissive non-refusal/non-empty check. */
  verifier?: Verifier;
  /** Extra classification signals merged over the task-derived input. */
  signals?: Omit<Partial<ClassificationInput>, 'goal'>;
  /** Center/edge decision boundary, [0,1]. */
  threshold?: number;
  /** Assumed completion length for cost projection (tokens). */
  outputTokens?: number;
  /** Custom signal-extractor pipeline. */
  extractors?: SignalExtractor[];
  /** Callback to persist a terminal decision record to longitudinal history local-first store. */
  onTaskComplete?: (record: DecisionRecord & { timestamp: string; taskId: string }) => Promise<void> | void;
}

/** A fully-resolved routing decision (classification + policy), for `--explain`. */
export interface RouteDecision {
  classification: Classification;
  selection: PolicySelection;
  estimate: Usage;
  /** Always-frontier baseline cost for the estimate. */
  baselineUsd: number;
}

export class Router implements RouterHook {
  private cascade: ModelDescriptor[] = [];
  private position = 0;
  private estimate: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  private readonly records: DecisionRecord[] = [];
  /** The most recent decision's ledger entry (mutated as the cascade runs). */
  private current: DecisionRecord | undefined;
  private lastDecision: RouteDecision | undefined;

  constructor(private readonly opts: RouterOptions) {}

  /** Build the classifier input from a task plus any configured extra signals. */
  private inputFor(task: Task): ClassificationInput {
    const input: ClassificationInput = { goal: task.goal };
    if (task.inputs !== undefined) input.inputs = task.inputs;
    if (task.constraints !== undefined) input.constraints = task.constraints;
    const s = this.opts.signals;
    if (s) {
      if (s.taskType !== undefined) input.taskType = s.taskType;
      if (s.retrieval !== undefined) input.retrieval = s.retrieval;
      if (s.history !== undefined) input.history = s.history;
      if (s.inputs !== undefined) input.inputs = { ...input.inputs, ...s.inputs };
      if (s.constraints !== undefined) {
        input.constraints = [...(input.constraints ?? []), ...s.constraints];
      }
    }
    return input;
  }

  private async flushHistory(task: Task): Promise<void> {
    if (!this.opts.onTaskComplete || !this.current) return;
    
    try {
      await this.opts.onTaskComplete({
        ...this.current,
        timestamp: new Date().toISOString(),
        // Fix: Use a deterministic or sequential identifier since task.id doesn't exist
        taskId: `task_${Date.now()}`
      });
    } catch (err) {
      // Invariant: Writing profiling history must never crash primary task loops!
    }
  }
  /**
   * Compute the full routing decision for a task without mutating cascade state.
   * Pure relative to the registry; used by `glam route` for the offline dry-run.
   */
  decide(task: Task): RouteDecision {
    const input = this.inputFor(task);
    const classification = classify(input, {
      ...(this.opts.threshold !== undefined ? { threshold: this.opts.threshold } : {}),
      ...(this.opts.extractors !== undefined ? { extractors: this.opts.extractors } : {}),
    });
    const estimate = estimateUsage(
      input,
      this.opts.outputTokens !== undefined ? { outputTokens: this.opts.outputTokens } : {},
    );
    const selection = evaluatePolicy(this.opts.routing, classification, this.opts.registry, {
      estimate,
    });
    const frontier = this.opts.registry.frontier(estimate);
    const baselineUsd = frontier ? frontier.pricing(estimate) : selection.projectedUsd;
    return { classification, selection, estimate, baselineUsd };
  }

  // --- RouterHook -----------------------------------------------------------

  select(task: Task): RouterSelection {
    const decision = this.decide(task);
    this.lastDecision = decision;
    this.cascade = decision.selection.cascade;
    this.position = 0;
    this.estimate = decision.estimate;

    const record: DecisionRecord = {
      model: decision.selection.chosen.id,
      distribution: decision.classification.distribution,
      confidence: decision.classification.confidence,
      score: decision.classification.score,
      projectedUsd: decision.selection.projectedUsd,
      baselineUsd: decision.baselineUsd,
      escalated: false,
    };
    this.current = record;
    this.records.push(record);

    return {
      adapter: decision.selection.chosen.adapter,
      config: decision.selection.chosen.config,
      reason: decision.selection.reason,
      classification: {
        distribution: decision.classification.distribution,
        score: decision.classification.score,
        confidence: decision.classification.confidence,
      },
    };
  }

  async review(input: RouterReviewInput): Promise<RouterReview> {
    const verifier = this.opts.verifier ?? defaultVerifier();
    const v = await verifier(input.output, { task: input.task });
    const verification = { passed: v.passed, detail: v.detail };

    // Attribute the real spend so far to this decision (cumulative across the
    // cascade); the engine's run.costUSD is the source of truth.
    if (this.current) this.current.actualUsd = input.run.costUSD;

    if (v.passed) {
      // Terminal Point 1: Execution passed successfully!
      await this.flushHistory(input.task);
      return { verification };
    }

    // Verifier failed — try to escalate to the next-stronger candidate.
    const from = this.cascade[this.position];
    const next = this.cascade[this.position + 1];
    if (from === undefined || next === undefined) {
      // No stronger candidate left; accept the best-so-far answer.
      // Terminal Point 2: Failed but ran out of cascade layers to escalate to.
      await this.flushHistory(input.task);
      return { verification };
    }

    // Budget bound: don't escalate if the next call's projected cost would push
    // the run past its hard USD ceiling. (The engine's loop also enforces this,
    // so this is a cooperative early-out, not the only guard.)
    const nextProjected = next.pricing(this.estimate);
    const maxUSD = input.task.budget.maxUSD;
    if (maxUSD !== undefined && input.run.costUSD + nextProjected > maxUSD) {
      // Terminal Point 3: Escalation would breach the task's budget ceiling.
      await this.flushHistory(input.task);
      return { verification };
    }

    this.position += 1;
    if (this.current) this.current.escalated = true;

    return {
      verification,
      escalation: {
        adapter: next.adapter,
        config: next.config,
        from: from.id,
        to: next.id,
        trigger: `verifier failed: ${v.detail}`,
      },
    };
  }

  // --- reporting ------------------------------------------------------------

  /** The most recent decision (classification + policy trace). */
  lastRouteDecision(): RouteDecision | undefined {
    return this.lastDecision;
  }

  /** All decision records accumulated across this router's lifetime. */
  decisionRecords(): readonly DecisionRecord[] {
    return this.records;
  }

  /** The aggregated, printable distribution report. */
  report(): DistributionReport {
    return buildReport(this.records);
  }

  /** Clear cascade state and the decision ledger to reuse this router. */
  reset(): void {
    this.cascade = [];
    this.position = 0;
    this.records.length = 0;
    this.current = undefined;
    this.lastDecision = undefined;
  }
}
