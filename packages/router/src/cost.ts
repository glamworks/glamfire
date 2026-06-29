// Cost projection (SPEC §5.3). The policy engine and the distribution report
// need a *projected* token cost per candidate before any call is made. We
// estimate token usage from the prompt's character size (a cheap, deterministic
// proxy) and let each candidate's real `pricing` function price that usage.

import type { Usage } from '@glamfire/engine';
import type { ClassificationInput } from './types.js';

/** Rough characters-per-token for English+code (GPT-style BPE averages ~4). */
export const CHARS_PER_TOKEN = 4;
/** Assumed system-prompt + scaffolding overhead, in tokens. */
export const SYSTEM_OVERHEAD_TOKENS = 200;
/** Default assumed completion length when none is supplied, in tokens. */
export const DEFAULT_OUTPUT_TOKENS = 600;

export interface EstimateOptions {
  /** Override the assumed completion length (tokens). */
  outputTokens?: number;
  /** Override the assumed system/scaffolding overhead (tokens). */
  systemOverheadTokens?: number;
}

function promptChars(input: ClassificationInput): number {
  let chars = input.goal.length;
  if (input.constraints) for (const c of input.constraints) chars += c.length;
  if (input.inputs) for (const v of Object.values(input.inputs)) chars += v.length;
  return chars;
}

/**
 * Estimate the token usage a task will consume. Deterministic and model-neutral
 * — the same usage is priced by every candidate so cost comparisons are fair.
 */
export function estimateUsage(input: ClassificationInput, opts: EstimateOptions = {}): Usage {
  const overhead = opts.systemOverheadTokens ?? SYSTEM_OVERHEAD_TOKENS;
  const inputTokens = Math.ceil(promptChars(input) / CHARS_PER_TOKEN) + overhead;
  const outputTokens = opts.outputTokens ?? DEFAULT_OUTPUT_TOKENS;
  return { inputTokens, cachedInputTokens: 0, outputTokens };
}
