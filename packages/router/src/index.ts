// @glamfire/router — center/edge, cost-aware routing with confidence-based
// escalation (SPEC §5.3). Public surface: the classifier, the declarative policy
// engine, the model registry, the pluggable cascade verifiers, the cost /
// distribution report, and the `Router` that implements the engine's RouterHook.

export type {
  TaskType,
  RetrievalSignal,
  HistorySignal,
  ClassificationInput,
  SignalContribution,
  SignalExtractor,
  Classification,
  ModelDescriptor,
} from './types.js';

export {
  DEFAULT_THRESHOLD,
  DEFAULT_EXTRACTORS,
  classify,
  taskTypeSignal,
  lengthSignal,
  codeSignal,
  noveltySignal,
  retrievalSignal,
  historySignal,
  type ClassifyOptions,
} from './classify.js';

export {
  CHARS_PER_TOKEN,
  DEFAULT_OUTPUT_TOKENS,
  SYSTEM_OVERHEAD_TOKENS,
  estimateUsage,
  type EstimateOptions,
} from './cost.js';

export { LONG_CONTEXT_TOKENS, satisfies, missingCapabilities } from './capabilities.js';

export { ModelRegistry, descriptorFromAdapter } from './registry.js';

export {
  PolicyError,
  evaluatePolicy,
  isLocalDescriptor,
  type CandidateEval,
  type RuleEvaluation,
  type PolicySelection,
  type EvaluatePolicyOptions,
} from './policy.js';

export {
  runRubric,
  rubricVerifier,
  nonEmptyVerifier,
  notRefusalVerifier,
  allOf,
  defaultVerifier,
  type Verification,
  type VerifierContext,
  type Verifier,
  type RubricCriterion,
} from './verify.js';

export {
  buildReport,
  formatReport,
  type DecisionRecord,
  type DistributionReport,
} from './report.js';

export { Router, type RouterOptions, type RouteDecision } from './router.js';

export { explainDecision } from './explain.js';
