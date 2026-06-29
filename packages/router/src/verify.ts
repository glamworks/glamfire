// Pluggable verifiers for the escalation cascade (SPEC §5.3). The router runs
// the cheap model, verifies its output, and escalates on failure. Verification
// is real and provider-independent: a rubric (regex must/mustNot), a heuristic
// (non-empty, not-a-refusal), or any custom function. This mirrors the
// @glamfire/skills verifier shape without depending on it (so the router has no
// provider dependency).

import type { Task } from '@glamfire/engine';

/** The outcome of verifying one output. */
export interface Verification {
  passed: boolean;
  /** Human-readable explanation (which criteria passed/failed). */
  detail: string;
  /** Optional 0..1 quality score for ranking. */
  score?: number;
}

/** Context a verifier may consult. */
export interface VerifierContext {
  task: Task;
}

/** A verifier reduces an output (+ context) to a verdict. */
export type Verifier = (
  output: string,
  ctx: VerifierContext,
) => Verification | Promise<Verification>;

/** A single declarative rubric criterion (regex `must` / `mustNot`). */
export interface RubricCriterion {
  description: string;
  /** This regex MUST match the output. */
  must?: string;
  /** This regex must NOT match the output. */
  mustNot?: string;
}

/** Run a declarative rubric against an output. Deterministic and model-free. */
export function runRubric(criteria: RubricCriterion[], output: string): Verification {
  const failures: string[] = [];
  let passedCount = 0;
  for (const c of criteria) {
    let ok = true;
    if (c.must !== undefined && !new RegExp(c.must, 'm').test(output)) {
      ok = false;
      failures.push(`missing: ${c.description}`);
    }
    if (ok && c.mustNot !== undefined && new RegExp(c.mustNot, 'm').test(output)) {
      ok = false;
      failures.push(`disallowed: ${c.description}`);
    }
    if (ok) passedCount += 1;
  }
  const total = criteria.length;
  return {
    passed: failures.length === 0,
    detail:
      failures.length === 0
        ? `all ${total} rubric criteria satisfied`
        : `${failures.length}/${total} criteria failed: ${failures.join('; ')}`,
    score: total === 0 ? 1 : passedCount / total,
  };
}

/** Wrap a rubric as a {@link Verifier}. */
export function rubricVerifier(criteria: RubricCriterion[]): Verifier {
  return (output: string) => runRubric(criteria, output);
}

/** Fails when the output is empty/whitespace or shorter than `minLength`. */
export function nonEmptyVerifier(minLength = 1): Verifier {
  return (output: string) => {
    const trimmed = output.trim();
    const passed = trimmed.length >= minLength;
    return {
      passed,
      detail: passed
        ? `output has ${trimmed.length} chars`
        : `output too short (${trimmed.length} < ${minLength} chars)`,
      score: passed ? 1 : 0,
    };
  };
}

const REFUSAL_MARKERS =
  /\b(i (?:don'?t|do not) know|i'?m not sure|i cannot (?:determine|help|answer)|unable to (?:determine|answer)|insufficient information|as an ai\b)/i;

/** Fails when the output reads as a refusal or low-confidence non-answer. */
export function notRefusalVerifier(): Verifier {
  return (output: string) => {
    const refused = REFUSAL_MARKERS.test(output);
    return {
      passed: !refused,
      detail: refused
        ? 'output reads as a refusal / low-confidence non-answer'
        : 'output is a substantive answer',
      score: refused ? 0 : 1,
    };
  };
}

/** Compose verifiers: all must pass (the first failure short-circuits the detail). */
export function allOf(...verifiers: Verifier[]): Verifier {
  return async (output: string, ctx: VerifierContext) => {
    const details: string[] = [];
    let minScore = 1;
    for (const v of verifiers) {
      const r = await v(output, ctx);
      details.push(r.detail);
      if (r.score !== undefined) minScore = Math.min(minScore, r.score);
      if (!r.passed) {
        return { passed: false, detail: r.detail, score: r.score ?? 0 };
      }
    }
    return { passed: true, detail: details.join('; '), score: minScore };
  };
}

/**
 * The default cascade verifier: a substantive, non-refusal answer of at least a
 * few characters. Intentionally permissive — it escalates only clearly-bad cheap
 * answers, so center work is not needlessly sent to the frontier.
 */
export function defaultVerifier(): Verifier {
  return allOf(nonEmptyVerifier(4), notRefusalVerifier());
}
