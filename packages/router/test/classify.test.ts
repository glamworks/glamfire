// Classification is pure and deterministic: representative center vs edge
// prompts must land on the right side of the boundary, and confidence must be
// feature-based (high when signals agree + sit far from the boundary).

import { describe, expect, it } from 'vitest';
import { classify } from '../src/classify.js';
import type { ClassificationInput } from '../src/types.js';

describe('classify — center vs edge', () => {
  it('routes a routine summary to center with real confidence', () => {
    const input: ClassificationInput = {
      goal: 'Summarize this paragraph in one sentence.',
      taskType: 'summary',
    };
    const c = classify(input);
    expect(c.distribution).toBe('center');
    expect(c.score).toBeLessThan(0.5);
    expect(c.confidence).toBeGreaterThan(0.4);
    expect(c.contributions.length).toBeGreaterThan(0);
  });

  it('routes a novel multi-step design task to edge', () => {
    const input: ClassificationInput = {
      goal:
        'Design and architect a distributed rate limiter; reason step by step about ' +
        'the trade-offs, prove correctness under concurrency, and handle every edge case.',
      taskType: 'reasoning',
    };
    const c = classify(input);
    expect(c.distribution).toBe('edge');
    expect(c.score).toBeGreaterThan(0.5);
    expect(c.confidence).toBeGreaterThan(0.4);
  });

  it('is deterministic for the same input', () => {
    const input: ClassificationInput = {
      goal: 'Translate "hello" to French.',
      taskType: 'translation',
    };
    const a = classify(input);
    const b = classify(input);
    expect(a).toEqual(b);
  });

  it('uses retrieval-hit quality: strong grounding pulls toward center', () => {
    const base: ClassificationInput = {
      goal: 'Answer the question from the docs.',
      taskType: 'qa',
    };
    const grounded = classify({ ...base, retrieval: { hits: 5, meanScore: 0.92 } });
    const ungrounded = classify({ ...base, retrieval: { hits: 0, meanScore: 0 } });
    expect(grounded.score).toBeLessThan(ungrounded.score);
  });

  it('uses historical outcomes: a high escalation rate pushes toward edge', () => {
    const base: ClassificationInput = { goal: 'Do the usual transform.' };
    const easyHistory = classify({ ...base, history: { similar: 10, escalated: 0 } });
    const hardHistory = classify({ ...base, history: { similar: 10, escalated: 9 } });
    expect(hardHistory.score).toBeGreaterThan(easyHistory.score);
  });

  it('gives low confidence when signals conflict', () => {
    // Routine keyword + edge task type + sparse evidence => near the boundary.
    const conflicted = classify({ goal: 'summarize and also design a novel architecture' });
    const clear = classify({ goal: 'Summarize this text.', taskType: 'summary' });
    expect(conflicted.confidence).toBeLessThan(clear.confidence);
  });
});
