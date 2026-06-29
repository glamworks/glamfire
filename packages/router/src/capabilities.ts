// Capability-token resolution: map a rule's required `Capability` tokens (the
// @glamfire/config contract) onto an adapter's declared `Capabilities`
// (@glamfire/engine), so the policy engine can filter candidates that cannot do
// what the task needs *before* applying cost preference (SPEC §5.3).

import type { Capability } from '@glamfire/config';
import type { Capabilities } from '@glamfire/engine';

/** Context windows at/above this are treated as satisfying `long_context`. */
export const LONG_CONTEXT_TOKENS = 200_000;

/** Does an adapter's declared capabilities satisfy a single required token? */
export function satisfies(caps: Capabilities, token: Capability): boolean {
  switch (token) {
    case 'tool_calling':
      return caps.toolCalling;
    case 'parallel_tool_calls':
      return caps.parallelToolCalls;
    case 'json_mode':
      return caps.jsonMode;
    case 'vision':
      return caps.vision;
    case 'streaming':
      return caps.streaming;
    case 'seed':
      return caps.seed;
    case 'long_context':
      return caps.contextWindow >= LONG_CONTEXT_TOKENS;
    default: {
      // Exhaustiveness guard: a new token must be handled explicitly.
      const _never: never = token;
      return _never;
    }
  }
}

/** The required tokens an adapter is *missing* (empty array = fully eligible). */
export function missingCapabilities(caps: Capabilities, required: Capability[]): Capability[] {
  return required.filter((token) => !satisfies(caps, token));
}
