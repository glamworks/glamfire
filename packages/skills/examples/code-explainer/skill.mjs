// code-explainer skill module — real tool handler + verifier.
//
// Authored as a plain ES module so the skill directory is fully self-contained
// and portable: it imports and runs without this package (or any TypeScript
// build) being present. The loader imports this file directly and resolves the
// names referenced by skill.json (`outlineCode`, `verifyExplanation`).

/**
 * Detect the top-level symbols of a piece of (JS/TS-style) source code with a
 * deterministic, dependency-free scan. Returns one record per symbol:
 * `{ kind, name, line, exported }`. Real and reproducible — no eval, no parser
 * dependency — so it behaves identically on every platform and model.
 */
export function outline(code) {
  const lines = String(code).split('\n');
  const symbols = [];
  const patterns = [
    { kind: 'function', re: /^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
    { kind: 'class', re: /^\s*(export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
    {
      kind: 'const',
      re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$].*=>)/,
    },
    { kind: 'type', re: /^\s*(export\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/ },
  ];
  lines.forEach((text, i) => {
    for (const { kind, re } of patterns) {
      const m = text.match(re);
      if (m) {
        symbols.push({ kind, name: m[2], line: i + 1, exported: Boolean(m[1]) });
        break;
      }
    }
  });
  return symbols;
}

/**
 * Tool handler: outline_code. Given source text (and optional language label),
 * returns its structural outline and a line count for the model to explain.
 */
export async function outlineCode(args) {
  const code = args.code;
  if (typeof code !== 'string' || code.trim().length === 0) {
    throw new Error('argument "code" must be a non-empty string');
  }
  const language = typeof args.language === 'string' ? args.language : 'unknown';
  const symbols = outline(code);
  return {
    language,
    lineCount: code.split('\n').length,
    symbolCount: symbols.length,
    symbols,
  };
}

/**
 * Verifier: checks that an explanation is real and grounded. Deterministic and
 * model-free. It re-outlines the source carried in the task inputs and asserts
 * the explanation (1) opens with a Summary, (2) is substantive, and (3) actually
 * references at least one real symbol from the code — catching hand-wavy or
 * hallucinated answers without needing a model.
 */
export function verifyExplanation(output, ctx) {
  const text = String(output ?? '');
  const inputs = ctx?.task?.inputs ?? {};
  const source = Object.values(inputs).join('\n');
  const symbolNames = outline(source).map((s) => s.name);

  const checks = [];
  checks.push({ ok: /summary\s*:/i.test(text), detail: 'opens with a "Summary:" line' });
  checks.push({ ok: text.trim().length >= 40, detail: 'is substantive (>= 40 chars)' });
  if (symbolNames.length > 0) {
    const referenced = symbolNames.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
    checks.push({
      ok: referenced.length > 0,
      detail: `references a real symbol (${referenced.join(', ') || 'none'})`,
    });
  }

  const passedChecks = checks.filter((c) => c.ok);
  const failed = checks.filter((c) => !c.ok).map((c) => c.detail);
  return {
    passed: failed.length === 0,
    detail:
      failed.length === 0 ? `all ${checks.length} checks passed` : `failed: ${failed.join('; ')}`,
    score: checks.length === 0 ? 1 : passedChecks.length / checks.length,
  };
}
