// Cost accounting + distribution report (SPEC §5.3): how much work was center
// vs edge, and how much routing saved versus always sending everything to the
// frontier model. Each decision records its projected cost, the always-frontier
// baseline, and (after a run) the actual cost. The aggregate turns the founder's
// "get out pencil and paper" exercise into an automatic, printable summary.

/** One routing decision's cost accounting. */
export interface DecisionRecord {
  model: string;
  distribution: 'center' | 'edge';
  confidence: number;
  score: number;
  /** Projected cost of the chosen model for the estimated usage. */
  projectedUsd: number;
  /** Always-frontier baseline cost for the same estimated usage. */
  baselineUsd: number;
  /** Actual cost once the run completed (undefined for dry-run projections). */
  actualUsd?: number;
  /** Whether the cascade escalated to a stronger model. */
  escalated: boolean;
}

/** The aggregated, printable distribution report. */
export interface DistributionReport {
  decisions: number;
  center: number;
  edge: number;
  centerPct: number;
  edgePct: number;
  /** Sum of projected costs of the chosen models. */
  projectedUsd: number;
  /** Sum of always-frontier baseline costs. */
  baselineUsd: number;
  /** Effective cost: actuals where known, else projections. */
  effectiveUsd: number;
  /** baselineUsd - effectiveUsd. */
  savedUsd: number;
  /** Percentage saved vs always-frontier, [0,100]. */
  savedPct: number;
  escalations: number;
  /** True when every effective cost is an actual (no projections mixed in). */
  actuals: boolean;
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

/** Aggregate decision records into a distribution report. */
export function buildReport(records: DecisionRecord[]): DistributionReport {
  let center = 0;
  let edge = 0;
  let projectedUsd = 0;
  let baselineUsd = 0;
  let effectiveUsd = 0;
  let escalations = 0;
  let allActual = records.length > 0;

  for (const r of records) {
    if (r.distribution === 'center') center += 1;
    else edge += 1;
    projectedUsd += r.projectedUsd;
    baselineUsd += r.baselineUsd;
    effectiveUsd += r.actualUsd ?? r.projectedUsd;
    if (r.actualUsd === undefined) allActual = false;
    if (r.escalated) escalations += 1;
  }

  const decisions = records.length;
  const savedUsd = baselineUsd - effectiveUsd;
  return {
    decisions,
    center,
    edge,
    centerPct: pct(center, decisions),
    edgePct: pct(edge, decisions),
    projectedUsd,
    baselineUsd,
    effectiveUsd,
    savedUsd,
    savedPct: pct(savedUsd, baselineUsd),
    escalations,
    actuals: allActual,
  };
}

function usd(n: number): string {
  return `$${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 6 : 4)}`;
}

/** Render a distribution report as a human-readable block. */
export function formatReport(r: DistributionReport): string {
  const basis = r.actuals ? 'actual' : 'projected';
  const lines = [
    'distribution report',
    `  decisions:   ${r.decisions}  (center ${r.center} / ${r.centerPct.toFixed(0)}%, ` +
      `edge ${r.edge} / ${r.edgePct.toFixed(0)}%)`,
    `  escalations: ${r.escalations}`,
    `  cost (${basis}):     ${usd(r.effectiveUsd)}`,
    `  always-frontier:    ${usd(r.baselineUsd)}`,
    `  saved by routing:   ${usd(r.savedUsd)}  (${r.savedPct.toFixed(1)}%)`,
  ];
  return lines.join('\n');
}
