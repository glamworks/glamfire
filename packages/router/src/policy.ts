// The policy engine (SPEC §5.3): evaluate `routing.rules` top-to-bottom against
// the classification, filter each rule's candidates by adapter-declared
// capabilities and by the rule's projected-cost ceiling, and pick the cheapest
// surviving candidate. The first rule that yields >= 1 eligible candidate wins;
// otherwise we fall back to `routing.default`. Everything is declarative and
// driven by the @glamfire/config contract — no hard-coded model names here.

import type { Capability, RoutingConfig, RoutingRule } from '@glamfire/config';
import type { RouteClassification, Usage } from '@glamfire/engine';
import { missingCapabilities } from './capabilities.js';
import type { ModelRegistry } from './registry.js';
import type { ModelDescriptor } from './types.js';

/** How one candidate model fared against one rule. */
export interface CandidateEval {
  id: string;
  /** The descriptor, when a real adapter is registered for this id. */
  descriptor: ModelDescriptor | undefined;
  /** False when no adapter is wired for this candidate id (honest skip). */
  available: boolean;
  /** Projected cost in USD for the estimated usage (undefined if unavailable). */
  projectedUsd: number | undefined;
  /** Required capability tokens this candidate cannot satisfy. */
  missing: Capability[];
  /** True when the rule's `maxUsd` ceiling is exceeded. */
  overBudget: boolean;
  /** True when `localOnly` routing is active and this is a hosted model. */
  excludedByLocalOnly: boolean;
  /** True when available, capable, and within budget. */
  eligible: boolean;
  note: string;
}

/** Is this descriptor served by the local/self-host adapter? */
export function isLocalDescriptor(d: ModelDescriptor): boolean {
  return d.adapter.id === 'local';
}

/** The full evaluation of one rule (kept for the `--explain` trace). */
export interface RuleEvaluation {
  /** Rule index in `routing.rules`, or -1 for the default fallback. */
  ruleIndex: number;
  /** Whether the rule's distribution/confidence conditions matched. */
  conditionsMatched: boolean;
  candidates: CandidateEval[];
  /** Eligible descriptors, ordered cheapest-first. */
  survivors: ModelDescriptor[];
}

/** The router's resolved policy decision. */
export interface PolicySelection {
  /** Ordered cheapest-first survivors usable as the escalation cascade. */
  cascade: ModelDescriptor[];
  /** The chosen (cheapest eligible) model = cascade[0]. */
  chosen: ModelDescriptor;
  /** Matched rule index, or -1 when the default fallback was used. */
  ruleIndex: number;
  reason: string;
  /** Projected cost of the chosen model for the estimated usage. */
  projectedUsd: number;
  /** Full per-rule trace, in evaluation order. */
  evaluations: RuleEvaluation[];
}

/** Raised when the policy cannot resolve any runnable model (real misconfig). */
export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

function conditionsMatch(rule: RoutingRule, c: RouteClassification): boolean {
  if (rule.distribution !== undefined && rule.distribution !== c.distribution) return false;
  if (rule.minConfidence !== undefined && c.confidence < rule.minConfidence) return false;
  if (rule.maxConfidence !== undefined && c.confidence > rule.maxConfidence) return false;
  return true;
}

function evalCandidate(
  id: string,
  rule: RoutingRule,
  registry: ModelRegistry,
  estimate: Usage,
  localOnly: boolean,
): CandidateEval {
  const descriptor = registry.get(id);
  if (descriptor === undefined) {
    return {
      id,
      descriptor: undefined,
      available: false,
      projectedUsd: undefined,
      missing: [],
      overBudget: false,
      excludedByLocalOnly: false,
      eligible: false,
      note: 'no adapter wired for this model id',
    };
  }
  const projectedUsd = descriptor.pricing(estimate);
  const missing = missingCapabilities(descriptor.capabilities, rule.requires);
  const overBudget = rule.maxUsd !== undefined && projectedUsd > rule.maxUsd;
  const excludedByLocalOnly = localOnly && !isLocalDescriptor(descriptor);
  const eligible = missing.length === 0 && !overBudget && !excludedByLocalOnly;
  const notes: string[] = [`~$${projectedUsd.toFixed(6)}`];
  if (isLocalDescriptor(descriptor)) notes.push('self-host (local adapter)');
  if (missing.length > 0) notes.push(`missing: ${missing.join(', ')}`);
  if (overBudget) notes.push(`over maxUsd $${rule.maxUsd?.toFixed(6)}`);
  if (excludedByLocalOnly)
    notes.push('excluded: local_only routing is set and this model is hosted');
  return {
    id,
    descriptor,
    available: true,
    projectedUsd,
    missing,
    overBudget,
    excludedByLocalOnly,
    eligible,
    note: notes.join('; '),
  };
}

function rankSurvivors(candidates: CandidateEval[]): ModelDescriptor[] {
  return candidates
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c.eligible && c.descriptor !== undefined)
    .sort((a, b) => {
      const ca = a.c.projectedUsd ?? Number.POSITIVE_INFINITY;
      const cb = b.c.projectedUsd ?? Number.POSITIVE_INFINITY;
      if (ca !== cb) return ca - cb; // cheapest first
      return a.idx - b.idx; // stable: preserve declared order on ties
    })
    .map(({ c }) => c.descriptor as ModelDescriptor);
}

export interface EvaluatePolicyOptions {
  /** The token usage estimate used to project candidate costs. */
  estimate: Usage;
  /**
   * Restrict routing to self-host (local adapter) models. Overrides
   * `routing.localOnly` when provided; when neither is set, hosted and local
   * candidates compete normally (cheapest capable wins — local models cost $0
   * but only participate when the user explicitly lists them as candidates and
   * declares their capabilities, the anti-silent-quality-cliff floor).
   */
  localOnly?: boolean;
}

/**
 * Resolve a routing decision. First matching rule with an eligible candidate
 * wins; its eligible candidates (cheapest-first) become the escalation cascade.
 * Falls back to `routing.default` when no rule produces an eligible candidate.
 */
export function evaluatePolicy(
  routing: RoutingConfig,
  classification: RouteClassification,
  registry: ModelRegistry,
  opts: EvaluatePolicyOptions,
): PolicySelection {
  const evaluations: RuleEvaluation[] = [];
  const localOnly = opts.localOnly ?? routing.localOnly ?? false;

  for (let i = 0; i < routing.rules.length; i += 1) {
    const rule = routing.rules[i] as RoutingRule;
    const matched = conditionsMatch(rule, classification);
    const candidates = matched
      ? rule.candidates.map((id) => evalCandidate(id, rule, registry, opts.estimate, localOnly))
      : [];
    const survivors = rankSurvivors(candidates);
    evaluations.push({ ruleIndex: i, conditionsMatched: matched, candidates, survivors });

    if (matched && survivors.length > 0) {
      const chosen = survivors[0] as ModelDescriptor;
      const reason =
        `rule #${i} matched (${classification.distribution}, ` +
        `confidence ${classification.confidence.toFixed(2)}); ` +
        `chose cheapest of ${survivors.length} eligible candidate(s): ${chosen.id}`;
      return {
        cascade: survivors,
        chosen,
        ruleIndex: i,
        reason,
        projectedUsd: chosen.pricing(opts.estimate),
        evaluations,
      };
    }
  }

  // Fallback: routing.default. This MUST resolve to a runnable model.
  const fallback = registry.get(routing.default);
  if (fallback === undefined) {
    throw new PolicyError(
      `routing.default "${routing.default}" has no wired adapter; cannot route. Register an adapter for the default model or fix the routing policy.`,
    );
  }
  // local_only NEVER silently falls back to a hosted model — that would defeat
  // the privacy/offline guarantee the flag exists for. Fail loud instead.
  if (localOnly && !isLocalDescriptor(fallback)) {
    throw new PolicyError(
      `local_only routing is set but no self-host model is eligible and the fallback routing.default "${routing.default}" is hosted. List your served model under providers.local.models (and as a routing candidate), or unset localOnly / drop --local.`,
    );
  }
  const reason =
    routing.rules.length === 0
      ? `no routing rules; using routing.default ${fallback.id}`
      : `no rule produced an eligible candidate; using routing.default ${fallback.id}`;
  return {
    cascade: [fallback],
    chosen: fallback,
    ruleIndex: -1,
    reason,
    projectedUsd: fallback.pricing(opts.estimate),
    evaluations,
  };
}
