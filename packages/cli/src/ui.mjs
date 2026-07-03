// Shared terminal helpers for the glam CLI: one color policy for every command,
// and "did you mean" suggestions for typos. Zero dependencies, cheap to import
// (this module must never slow down `glam --version`).

export const CODES = {
  DIM: '\x1b[2m',
  BOLD: '\x1b[1m',
  RESET: '\x1b[0m',
  FLAME: '\x1b[38;5;208m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
};

/**
 * Whether to emit ANSI colors on `stream`, following the informal standard the
 * rest of the ecosystem (chalk, node itself) converges on:
 *   FORCE_COLOR=0/false               -> never color  (explicit off)
 *   FORCE_COLOR (any other value)     -> always color (wins, even over NO_COLOR)
 *   NO_COLOR    (set to anything)     -> never color  (https://no-color.org)
 *   otherwise                         -> color only on a real TTY
 */
export function useColor(stream = process.stdout, env = process.env) {
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== '') {
    return force !== '0' && force !== 'false';
  }
  if (env.NO_COLOR !== undefined) return false;
  return stream.isTTY === true;
}

/** Wrap `s` in an ANSI code when `on`, else return it untouched. */
export function color(on, code, s) {
  return on ? `${code}${s}${CODES.RESET}` : s;
}

/** Classic Levenshtein edit distance (small inputs only: command names). */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, sub);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * The closest candidate to `input` within a sane typo distance, or undefined.
 * "rout" -> "route", "confg" -> "config"; garbage like "xyzzy" suggests nothing.
 */
export function suggest(input, candidates) {
  const needle = input.toLowerCase();
  let best;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = editDistance(needle, c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  // Allow at most 2 edits, and never more than half the word — otherwise the
  // suggestion is noise, not help.
  const limit = Math.min(2, Math.floor(Math.max(needle.length, 1) / 2));
  return bestDist <= limit ? best : undefined;
}
