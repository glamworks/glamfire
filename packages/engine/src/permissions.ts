// The permission gate (SPEC §5.1). Every tool call passes through here before
// dispatch. Enforced by the engine, never by the model. Defaults are
// least-privilege: only side-effect-free reads run unattended.

import type { ToolPermissionClass, ToolSpec } from './types.js';

export type Verdict = 'allow' | 'ask' | 'deny';

/** A policy maps each privilege class to a default verdict, with per-tool overrides. */
export interface PermissionPolicy {
  /** Default verdict per privilege class. */
  classDefaults: Record<ToolPermissionClass, Verdict>;
  /** Per-tool-name overrides (highest precedence). */
  toolOverrides: Record<string, Verdict>;
  /**
   * Resolver for `ask` verdicts. Returns true to allow, false to deny.
   * In a non-interactive run this defaults to deny (least-privilege).
   */
  asker?: (tool: ToolSpec, args: Record<string, unknown>) => boolean;
}

/** Least-privilege defaults: reads run; writes/network ask; exec denied. */
export function defaultPolicy(overrides?: Partial<PermissionPolicy>): PermissionPolicy {
  return {
    classDefaults: {
      read: 'allow',
      write: 'ask',
      network: 'ask',
      exec: 'deny',
    },
    toolOverrides: {},
    ...overrides,
  };
}

export interface GateResult {
  /** The static verdict from the policy (before any interactive ask). */
  verdict: Verdict;
  /** Whether the call is admitted for dispatch after resolving asks. */
  admitted: boolean;
  /** Human-readable reason, used in the denial observation fed to the model. */
  reason: string;
}

/** Decide whether a single tool call may run. */
export function gate(
  policy: PermissionPolicy,
  tool: ToolSpec,
  args: Record<string, unknown>,
): GateResult {
  const override = policy.toolOverrides[tool.name];
  const verdict: Verdict = override ?? policy.classDefaults[tool.permission];

  if (verdict === 'allow') {
    return { verdict, admitted: true, reason: `allowed (${tool.permission})` };
  }
  if (verdict === 'deny') {
    return {
      verdict,
      admitted: false,
      reason: `denied by policy (${tool.permission} tools are not permitted)`,
    };
  }
  // 'ask' — resolve interactively, defaulting to deny when no asker is wired.
  const allowed = policy.asker ? policy.asker(tool, args) : false;
  return {
    verdict,
    admitted: allowed,
    reason: allowed
      ? `approved on ask (${tool.permission})`
      : `denied on ask (${tool.permission} tool requires approval)`,
  };
}
