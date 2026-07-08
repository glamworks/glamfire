import { readRoutingHistory } from './ledger.mjs';
import { CODES, color, useColor } from './ui.mjs';

const { DIM, BOLD, FLAME, GREEN } = CODES;

function fmtUSD(n) {
    return `$${n.toFixed(n < 0.01 ? 6 : 4)}`;
}

export async function cmdReport(args, { version }) {
    const useColorOut = useColor(process.stdout);
    const out = process.stdout;

    // Retrieve our offline logs
    const history = await readRoutingHistory();

    // Print Header Banner
    out.write(
        `${color(useColorOut, FLAME, `glamfire ${version}`)} ${color(useColorOut, DIM, '· longitudinal realized savings report')}\n`,
    );

    if (history.length === 0) {
        out.write(
            color(
                useColorOut,
                DIM,
                '\n  No historical routing records found in your local ledger yet.\n  Run some tasks using `glam run` or `glam route` to populate metrics!\n',
            ),
        );
        return;
    }

    let totalDecisions = 0;
    let centerCount = 0;
    let edgeCount = 0;
    let totalEscalations = 0;
    let totalCostUSD = 0;
    let baselineCostUSD = 0;

    // Aggregate stats from the offline tracking history
    for (const record of history) {
    totalDecisions += 1;
    
    if (record.classification?.distribution === 'center') {
        centerCount += 1;
    } else if (record.classification?.distribution === 'edge') {
        edgeCount += 1;
    }

    if (record.escalated) {
        totalEscalations += 1;
    }

    // Accumulate actual cost vs baseline cost
    const roundCost = record.selection?.projectedUsd ?? 0;
    const baseCost = record.baselineUsd ?? roundCost;

    totalCostUSD += roundCost;
    baselineCostUSD += baseCost;
}

    const centerPct = totalDecisions > 0 ? ((centerCount / totalDecisions) * 100).toFixed(1) : '0.0';
    const edgePct = totalDecisions > 0 ? ((edgeCount / totalDecisions) * 100).toFixed(1) : '0.0';
    const savedUSD = Math.max(0, baselineCostUSD - totalCostUSD);
    const savedPct = baselineCostUSD > 0 ? ((savedUSD / baselineCostUSD) * 100).toFixed(1) : '0.0';

    // Output formatting matching the CLI style guide
    out.write(`\n`);
    out.write(`${color(useColorOut, BOLD, 'Historical Summary Profile')}\n`);
    out.write(`  Total Decisions:   ${totalDecisions}\n`);
    out.write(`  Distribution:      Center: ${centerCount} (${centerPct}%)  ·  Edge: ${edgeCount} (${edgePct}%)\n`);
    out.write(`  Escalations:       ${totalEscalations}\n`);
    out.write(`\n`);
    out.write(`${color(useColorOut, BOLD, 'Financial Impact Ledger')}\n`);
    out.write(`  Total Spend:       ${fmtUSD(totalCostUSD)}\n`);
    out.write(`  Always-Frontier:   ${fmtUSD(baselineCostUSD)}\n`);
    out.write(`  Realized Savings:  ${color(useColorOut, GREEN, fmtUSD(savedUSD))} (${savedPct}%)\n`);
}