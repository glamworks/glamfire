// Classification (SPEC §5.3): turn fast, pre-call signals into a center<->edge
// `distribution`, an edge-ness `score`, and a `confidence`.
//
// Design (research/04): we deliberately do NOT ask a model "how sure are you"
// (verbalized confidence underperforms). Instead we compute confidence from the
// *features themselves* — how far the score sits from the decision boundary, how
// much the signals agree, and how much hard evidence (task type, retrieval,
// history) we actually have. The signal pipeline is pure and extensible: each
// extractor contributes a weighted edge-ness vote, and the scorer aggregates.

import type {
  Classification,
  ClassificationInput,
  SignalContribution,
  SignalExtractor,
  TaskType,
} from './types.js';

/** Default center/edge boundary: score >= threshold => edge. */
export const DEFAULT_THRESHOLD = 0.5;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function totalPromptText(input: ClassificationInput): string {
  const parts = [input.goal];
  if (input.constraints) parts.push(...input.constraints);
  if (input.inputs) parts.push(...Object.values(input.inputs));
  return parts.join('\n');
}

// --- task-shape edge-ness (the strongest explicit prior) --------------------

const TASK_TYPE_EDGENESS: Record<TaskType, number> = {
  summary: 0.2,
  extraction: 0.2,
  classification: 0.15,
  reformat: 0.15,
  translation: 0.25,
  qa: 0.35,
  coding: 0.65,
  generation: 0.7,
  reasoning: 0.8,
  unknown: 0.5,
};

export const taskTypeSignal: SignalExtractor = (input) => {
  if (input.taskType === undefined) return null;
  const edgeness = TASK_TYPE_EDGENESS[input.taskType];
  return {
    name: 'task_type',
    edgeness,
    weight: input.taskType === 'unknown' ? 0.4 : 2.5,
    note: `declared task type "${input.taskType}"`,
  };
};

// --- prompt length ----------------------------------------------------------

export const lengthSignal: SignalExtractor = (input) => {
  const chars = totalPromptText(input).length;
  // Short prompts skew center; long, dense prompts skew edge. Saturating ramp
  // from ~200 chars (center) to ~6000 chars (edge).
  const edgeness = clamp01((chars - 200) / (6000 - 200));
  return {
    name: 'length',
    edgeness,
    weight: 1,
    note: `${chars} prompt chars`,
  };
};

// --- code-ness --------------------------------------------------------------

const CODE_MARKERS =
  /```|\bfunction\b|\bclass\b|=>|;\s*$|\bimport\b|\bdef\b|\bSELECT\b|\{[\s\S]*\}|<\/?[a-z]+>/im;

export const codeSignal: SignalExtractor = (input) => {
  const text = totalPromptText(input);
  const hasCode = CODE_MARKERS.test(text);
  return {
    name: 'code',
    // Code presence is a mild edge nudge (more moving parts), not decisive.
    edgeness: hasCode ? 0.62 : 0.42,
    weight: hasCode ? 0.8 : 0.3,
    note: hasCode ? 'code/markup detected' : 'no code markers',
  };
};

// --- novelty / complexity keywords ------------------------------------------

const ROUTINE_MARKERS = [
  'summarize',
  'summarise',
  'tl;dr',
  'extract',
  'list ',
  'classify',
  'categorize',
  'categorise',
  'label',
  'translate',
  'format',
  'reformat',
  'rename',
  'convert',
  'capitalize',
  'lowercase',
  'uppercase',
  'count ',
  'sort ',
  'tag ',
];

const COMPLEX_MARKERS = [
  'design',
  'architect',
  'prove',
  'derive',
  'optimi', // optimize / optimise
  'why ',
  'trade-off',
  'tradeoff',
  'debug',
  'refactor',
  'strategy',
  'ambiguous',
  'novel',
  'step by step',
  'step-by-step',
  'reason',
  'analyze',
  'analyse',
  'plan ',
  'multi-step',
  'edge case',
];

function countMarkers(haystack: string, markers: string[]): number {
  let n = 0;
  for (const m of markers) if (haystack.includes(m)) n += 1;
  return n;
}

export const noveltySignal: SignalExtractor = (input) => {
  const text = totalPromptText(input).toLowerCase();
  const routine = countMarkers(text, ROUTINE_MARKERS);
  const complex = countMarkers(text, COMPLEX_MARKERS);
  if (routine === 0 && complex === 0) {
    return { name: 'novelty', edgeness: 0.5, weight: 0.3, note: 'no routine/complex keywords' };
  }
  // Net lean: more complex markers -> edge, more routine markers -> center.
  const net = (complex - routine) / (complex + routine);
  const edgeness = clamp01(0.5 + net * 0.5);
  return {
    name: 'novelty',
    edgeness,
    weight: 1.4,
    note: `${routine} routine / ${complex} complex keyword(s)`,
  };
};

// --- retrieval-hit quality --------------------------------------------------

export const retrievalSignal: SignalExtractor = (input) => {
  const r = input.retrieval;
  if (r === undefined) return null;
  if (r.hits <= 0) {
    // No grounding context found -> the task is novel for this team -> edge.
    return { name: 'retrieval', edgeness: 0.75, weight: 1.5, note: 'no retrieval hits' };
  }
  // Strong, high-quality grounding -> well-supported -> center.
  const edgeness = clamp01(1 - r.meanScore);
  return {
    name: 'retrieval',
    edgeness,
    weight: 1.5,
    note: `${r.hits} hit(s), mean score ${r.meanScore.toFixed(2)}`,
  };
};

// --- historical outcomes for similar tasks ----------------------------------

export const historySignal: SignalExtractor = (input) => {
  const h = input.history;
  if (h === undefined || h.similar <= 0) return null;
  const escalationRate = clamp01(h.escalated / h.similar);
  // More observations -> more trustworthy -> heavier weight (saturating at ~10).
  const weight = 1 + Math.min(h.similar, 10) / 5;
  return {
    name: 'history',
    edgeness: escalationRate,
    weight,
    note: `${h.escalated}/${h.similar} similar task(s) escalated`,
  };
};

/** The built-in extractor pipeline, in evaluation order. */
export const DEFAULT_EXTRACTORS: SignalExtractor[] = [
  taskTypeSignal,
  lengthSignal,
  codeSignal,
  noveltySignal,
  retrievalSignal,
  historySignal,
];

/** Weighted mean of the contributions' edge-ness votes. */
function aggregateScore(contributions: SignalContribution[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const c of contributions) {
    weighted += c.edgeness * c.weight;
    totalWeight += c.weight;
  }
  return totalWeight === 0 ? 0.5 : weighted / totalWeight;
}

/**
 * Feature-based confidence (research/04 — not verbalized). Blends three factors:
 *   - boundaryDistance: how far the score is from the 0.5 decision boundary,
 *   - agreement: 1 - normalized weighted spread of the signal votes,
 *   - evidence: how much hard evidence (explicit task type / retrieval / history)
 *     and total signal weight we actually have.
 */
function aggregateConfidence(
  contributions: SignalContribution[],
  score: number,
  threshold: number,
): number {
  if (contributions.length === 0) return 0;

  const boundaryDistance = clamp01(
    Math.abs(score - threshold) / Math.max(threshold, 1 - threshold),
  );

  let totalWeight = 0;
  let weightedSpread = 0;
  for (const c of contributions) {
    totalWeight += c.weight;
    weightedSpread += c.weight * Math.abs(c.edgeness - score);
  }
  const meanSpread = totalWeight === 0 ? 0.5 : weightedSpread / totalWeight;
  // Max possible mean |edgeness - score| is bounded by ~0.5 in practice; scale.
  const agreement = clamp01(1 - meanSpread / 0.5);

  // Evidence: explicit, high-signal extractors (task_type/retrieval/history)
  // each add a chunk; total weight saturates the rest.
  const strong = contributions.filter(
    (c) => c.name === 'task_type' || c.name === 'retrieval' || c.name === 'history',
  ).length;
  const evidence = clamp01(0.3 + strong * 0.2 + Math.min(totalWeight, 6) / 6 / 2);

  const confidence = 0.45 * boundaryDistance + 0.3 * agreement + 0.25 * evidence;
  return clamp01(confidence);
}

export interface ClassifyOptions {
  threshold?: number;
  extractors?: SignalExtractor[];
}

/**
 * Classify a task into center/edge with a confidence. Pure and deterministic:
 * same input -> same verdict. The returned `contributions` make the decision
 * fully auditable for the `--explain` surface.
 */
export function classify(input: ClassificationInput, opts: ClassifyOptions = {}): Classification {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const extractors = opts.extractors ?? DEFAULT_EXTRACTORS;

  const contributions: SignalContribution[] = [];
  for (const extract of extractors) {
    const c = extract(input);
    if (c !== null && c.weight > 0) contributions.push(c);
  }

  const score = aggregateScore(contributions);
  const confidence = aggregateConfidence(contributions, score, threshold);
  const distribution = score >= threshold ? 'edge' : 'center';

  return { distribution, score, confidence, contributions, threshold };
}
