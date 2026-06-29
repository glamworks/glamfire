// Verifiers (SPEC §5.5) — an optional, model-neutral check on a skill's output.
//
// A skill may ship a verifier as either:
//   1. a FUNCTION (exported by the skill module) — arbitrary deterministic logic, or
//   2. a RUBRIC (declared in the manifest) — regex must/mustNot criteria.
//
// Both reduce to a `VerifierFn` (output -> VerifierResult), so the router can run
// the cheap model, verify, and escalate on failure (SPEC §5.3) without caring
// which kind a skill used. Verification here is real and provider-independent.

import type { Task } from '@glamfire/engine';
import type { RubricManifest } from './manifest.js';

/** The outcome of verifying one output. */
export interface VerifierResult {
  passed: boolean;
  /** Human-readable explanation of the verdict (which criteria passed/failed). */
  detail: string;
  /** Optional 0..1 quality score for ranking/escalation policy. */
  score?: number;
}

/** Context a verifier may consult (the originating task, the skill's episodes). */
export interface VerifierContext {
  task?: Task;
}

/** A verifier reduces an output string (+ optional context) to a verdict. */
export type VerifierFn = (
  output: string,
  ctx?: VerifierContext,
) => VerifierResult | Promise<VerifierResult>;

/**
 * Run a declarative rubric against an output. Deterministic and model-free:
 * every `must` regex must match and every `mustNot` regex must not. The score
 * is the fraction of criteria satisfied.
 */
export function runRubric(rubric: RubricManifest, output: string): VerifierResult {
  const failures: string[] = [];
  let passedCount = 0;
  for (const c of rubric.criteria) {
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
  const total = rubric.criteria.length;
  return {
    passed: failures.length === 0,
    detail:
      failures.length === 0
        ? `all ${total} rubric criteria satisfied`
        : `${failures.length}/${total} criteria failed:\n  - ${failures.join('\n  - ')}`,
    score: total === 0 ? 1 : passedCount / total,
  };
}

/** Wrap a rubric as a `VerifierFn` so callers can treat both kinds uniformly. */
export function rubricVerifier(rubric: RubricManifest): VerifierFn {
  return (output: string) => runRubric(rubric, output);
}
