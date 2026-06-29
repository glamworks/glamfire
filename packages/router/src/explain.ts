// Human-readable rendering of a routing decision (for `glam route` / --explain).
// Pure formatting over a `RouteDecision`; no I/O, no provider calls.

import type { RouteDecision } from './router.js';

function usd(n: number): string {
  return `$${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 6 : 4)}`;
}

/** Render the classification + policy decision as an explanation block. */
export function explainDecision(decision: RouteDecision): string {
  const { classification: c, selection: s } = decision;
  const lines: string[] = [];

  lines.push('route decision');
  lines.push(
    `  distribution: ${c.distribution}   ` +
      `score: ${c.score.toFixed(3)}   confidence: ${c.confidence.toFixed(3)}   ` +
      `(threshold ${c.threshold})`,
  );
  lines.push(
    `  chosen model: ${s.chosen.id}   projected: ${usd(s.projectedUsd)}   ` +
      `frontier baseline: ${usd(decision.baselineUsd)}`,
  );
  lines.push(`  why: ${s.reason}`);

  lines.push('  signals:');
  for (const sig of c.contributions) {
    lines.push(
      `    - ${sig.name.padEnd(10)} edge=${sig.edgeness.toFixed(2)} ` +
        `w=${sig.weight.toFixed(1)}  (${sig.note})`,
    );
  }

  if (s.cascade.length > 1) {
    lines.push(`  cascade: ${s.cascade.map((d) => d.id).join(' -> ')}`);
  }

  // Surface any configured candidate that has no wired adapter (honest gap).
  const unavailable = new Set<string>();
  for (const ev of s.evaluations) {
    for (const cand of ev.candidates) {
      if (!cand.available) unavailable.add(cand.id);
    }
  }
  if (unavailable.size > 0) {
    lines.push(`  note: no adapter wired for: ${[...unavailable].join(', ')}`);
  }

  return lines.join('\n');
}
