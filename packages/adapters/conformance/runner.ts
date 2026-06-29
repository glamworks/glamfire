// The adapter conformance suite (SPEC §5.4): one provider-agnostic battery that
// exercises the `AdapterContract` and runs against EVERY adapter. A model/adapter
// is "supported" only when this suite is green.
//
// The battery is shared; the wire-specific bits (how to build a request, how to
// extract neutral facts from a provider request body, and how to reduce a
// captured SSE stream with that adapter's own reducer) are supplied per adapter
// via a `ConformanceCase`. Every case is driven by CAPTURED REAL WIRE FIXTURES
// (committed under each adapter's test/fixtures), so the suite is hermetic and
// CI-safe — no live keys, no mocks standing in for provider behavior.

import type {
  AdapterContract,
  ModelTurnResult,
  ProviderRequest,
  RunState,
  Usage,
} from '@glamfire/engine';
import { describe, expect, it } from 'vitest';

/** Neutral facts extracted from a provider-specific request body. */
export interface RequestFacts {
  /** The system-prompt text the adapter shaped into its request. */
  systemText: string | undefined;
  /** Tool names re-emitted into the provider's native tool grammar. */
  toolNames: string[];
  /** Tool-result ids threaded back into the request (must preserve call ids). */
  toolResultIds: string[];
  /** The provider's max-output-tokens field, if the adapter sets one. */
  maxTokens: number | undefined;
}

/** A captured non-streaming response plus the neutral result it must decode to. */
export interface DecodeExpectation {
  raw: unknown;
  text?: string;
  reasoning?: string;
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
  finishReason: string;
  usage: Usage;
}

/** Everything the battery needs to exercise one adapter against real fixtures. */
export interface ConformanceCase {
  adapter: AdapterContract;
  /**
   * A representative run state: a system prompt mentioning "glamfire", a user
   * turn, an assistant turn with a `calculator` tool call (id `call_1`), the
   * matching tool result, and a `calculator` tool declared.
   */
  sampleState: RunState;
  /** Provider-specific extractor for {@link RequestFacts}. */
  inspectRequest(req: ProviderRequest): RequestFacts;
  /** Captured non-streaming single-tool-call completion + expectations. */
  toolCallCompletion: DecodeExpectation;
  /** Captured non-streaming multi-tool completion + expectations. */
  multiToolCompletion: DecodeExpectation;
  /** Captured non-streaming completion whose text is a JSON document. */
  jsonCompletion: { raw: unknown; expectJson: unknown };
  /** Reduce the captured streamed tool-call SSE with this adapter's reducer. */
  reduceToolCallStream(): ModelTurnResult;
  /** Reduce the captured streamed plain-text SSE with this adapter's reducer. */
  reduceTextStream(): ModelTurnResult;
  /** Expected reassembly of the streamed tool call. */
  expectStreamToolCall: { name: string; arguments: Record<string, unknown>; finishReason: string };
  /** Expected reassembly of the streamed plain-text answer. */
  expectStreamText: { textIncludes: string; finishReason: string };
}

function assertDecode(actual: ModelTurnResult, expected: DecodeExpectation): void {
  if (expected.text !== undefined) expect(actual.text).toBe(expected.text);
  if (expected.reasoning !== undefined) expect(actual.reasoning).toBe(expected.reasoning);
  expect(actual.finishReason).toBe(expected.finishReason);
  expect(actual.usage).toEqual(expected.usage);
  expect(actual.toolCalls).toEqual(expected.toolCalls);
}

/**
 * Run the full conformance battery for one adapter. Call once per adapter; the
 * suite name is the adapter id under test.
 */
export function runConformance(makeCase: () => ConformanceCase): void {
  const c = makeCase();
  const { adapter } = c;

  describe(`adapter conformance: ${adapter.id}`, () => {
    it('declares a complete, sane capability surface', () => {
      const caps = adapter.capabilities;
      expect(adapter.id).toBeTruthy();
      expect(caps.contextWindow).toBeGreaterThan(0);
      expect(caps.maxOutputTokens).toBeGreaterThan(0);
      expect(caps.maxOutputTokens).toBeLessThanOrEqual(caps.contextWindow);
      for (const flag of [
        caps.toolCalling,
        caps.parallelToolCalls,
        caps.jsonMode,
        caps.vision,
        caps.streaming,
        caps.seed,
      ]) {
        expect(typeof flag).toBe('boolean');
      }
    });

    it('prices coherently: zero is free, more costs more, cache is cheaper', () => {
      expect(adapter.pricing({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 })).toBe(0);

      const inSmall = adapter.pricing({ inputTokens: 1000, cachedInputTokens: 0, outputTokens: 0 });
      const inBig = adapter.pricing({ inputTokens: 2000, cachedInputTokens: 0, outputTokens: 0 });
      expect(inSmall).toBeGreaterThan(0);
      expect(inBig).toBeGreaterThan(inSmall);

      // Output is never cheaper than input per token, for any real provider.
      const out = adapter.pricing({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 1000 });
      expect(out).toBeGreaterThanOrEqual(inSmall);

      // Cached input is strictly cheaper than fresh input, and non-negative.
      const cached = adapter.pricing({ inputTokens: 0, cachedInputTokens: 1000, outputTokens: 0 });
      expect(cached).toBeGreaterThanOrEqual(0);
      expect(cached).toBeLessThan(inSmall);
    });

    it('encodes system prompt, tool grammar, and threads tool results by id', () => {
      const req = adapter.encodeRequest(c.sampleState, { stream: false });
      const facts = c.inspectRequest(req);

      expect(facts.systemText).toContain('glamfire');
      expect(facts.toolNames).toContain('calculator');
      // The tool result's call id must survive the round-trip into the request.
      expect(facts.toolResultIds).toContain('call_1');
      expect(facts.maxTokens).toBeDefined();
      expect(facts.maxTokens ?? 0).toBeGreaterThan(0);

      expect(req.url).toMatch(/^https?:\/\//);
      expect(Object.keys(req.headers).length).toBeGreaterThan(0);
    });

    it('marks a streaming request as streaming', () => {
      const req = adapter.encodeRequest(c.sampleState, { stream: true });
      expect(req.body.stream).toBe(true);
    });

    it('decodes a tool-call completion (round-trip + stop-reason mapping)', () => {
      const result = adapter.decodeResponse(c.toolCallCompletion.raw);
      assertDecode(result, c.toolCallCompletion);
      expect(result.finishReason).toBe('tool_calls');
    });

    it('decodes multiple tool calls with distinct ids', () => {
      const result = adapter.decodeResponse(c.multiToolCompletion.raw);
      assertDecode(result, c.multiToolCompletion);
      expect(result.toolCalls.length).toBeGreaterThanOrEqual(2);
      const ids = new Set(result.toolCalls.map((t) => t.id));
      expect(ids.size).toBe(result.toolCalls.length);
    });

    it('decodes structured/JSON output without mangling content', () => {
      const result = adapter.decodeResponse(c.jsonCompletion.raw);
      expect(JSON.parse(result.text)).toEqual(c.jsonCompletion.expectJson);
    });

    it('reassembles streamed tool-call argument fragments', () => {
      const result = c.reduceToolCallStream();
      expect(result.toolCalls).toHaveLength(1);
      const call = result.toolCalls[0];
      expect(call).toBeDefined();
      if (!call) return;
      expect(call.name).toBe(c.expectStreamToolCall.name);
      expect(call.arguments).toEqual(c.expectStreamToolCall.arguments);
      expect(result.finishReason).toBe(c.expectStreamToolCall.finishReason);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
    });

    it('reassembles a streamed plain-text answer', () => {
      const result = c.reduceTextStream();
      expect(result.text).toContain(c.expectStreamText.textIncludes);
      expect(result.toolCalls).toHaveLength(0);
      expect(result.finishReason).toBe(c.expectStreamText.finishReason);
    });
  });
}
