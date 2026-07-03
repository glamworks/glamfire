// The local (self-host) adapter — config resolution honesty, the no-key auth
// path, user-declared capability/price surfaces, the DwarfStar/DS4 byte-exact
// tool-call ID replay contract (research/27 §3), and usage-reporting honesty
// (a server that reports no token usage is SAID to have reported none — counts
// are never invented). Transport tests replay REAL captured Ollama bytes over
// a loopback socket, exactly like stream-http.test.ts does for Fireworks.

import { readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_DEFAULT_BASE_URL,
  LOCAL_DEFAULT_CONTEXT_WINDOW,
  LOCAL_DEFAULT_MAX_OUTPUT_TOKENS,
  OLLAMA_DEFAULT_BASE_URL,
  createLocalAdapter,
  resolveLocalConfig,
} from '@glamfire/adapters';
import { builtinDefaults } from '@glamfire/config';
import type { RunState, Usage } from '@glamfire/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ollamaSSE = readFileSync(join(here, 'fixtures', 'ollama-stream-toolcall.sse.txt'), 'utf8');

function state(model: string): RunState {
  return {
    system: 'You are glamfire.',
    task: { goal: 'weather', budget: {} },
    messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
    tools: [],
    config: { model },
  };
}

describe('resolveLocalConfig', () => {
  it('fails loud when no model is named anywhere (never guesses)', () => {
    expect(() => resolveLocalConfig({})).toThrow(/local model id is required/);
    expect(() => resolveLocalConfig({})).toThrow(/providers\.local/);
  });

  it('applies honest defaults: $0 price, conservative context, capability floor', () => {
    const config = resolveLocalConfig({ GLAM_LOCAL_MODEL: 'qwen3:0.6b' });
    expect(config.baseUrl).toBe(LOCAL_DEFAULT_BASE_URL);
    expect(config.usdPerMInput).toBe(0);
    expect(config.usdPerMCachedInput).toBe(0);
    expect(config.usdPerMOutput).toBe(0);
    expect(config.contextWindow).toBe(LOCAL_DEFAULT_CONTEXT_WINDOW);
    expect(config.maxOutputTokens).toBe(LOCAL_DEFAULT_MAX_OUTPUT_TOKENS);
    expect(config.capabilities).toEqual(['tool_calling', 'streaming']);
    expect(config.apiKey).toBeUndefined();
  });

  it('resolves the model from providers.local.models and honors declared fields', () => {
    const glam = builtinDefaults();
    glam.providers.local = {
      ...glam.providers.local,
      baseUrl: OLLAMA_DEFAULT_BASE_URL,
      models: ['qwen3:0.6b'],
      contextWindow: 40_960,
      maxOutputTokens: 16_384,
      capabilities: ['tool_calling', 'streaming', 'json_mode'],
      usdPerMInput: 0.01,
      usdPerMOutput: 0.02,
    };
    const config = resolveLocalConfig({}, {}, { config: glam });
    expect(config.model).toBe('qwen3:0.6b');
    expect(config.baseUrl).toBe(OLLAMA_DEFAULT_BASE_URL);
    expect(config.contextWindow).toBe(40_960);
    expect(config.maxOutputTokens).toBe(16_384);
    expect(config.capabilities).toContain('json_mode');
    expect(config.usdPerMInput).toBe(0.01);
    expect(config.usdPerMOutput).toBe(0.02);
  });

  it('precedence: overrides > GLAM_LOCAL_* env > config', () => {
    const glam = builtinDefaults();
    glam.providers.local = { ...glam.providers.local, models: ['config-model'] };
    const env = { GLAM_LOCAL_MODEL: 'env-model', GLAM_LOCAL_BASE_URL: 'http://localhost:1234/v1' };
    expect(resolveLocalConfig(env, {}, { config: glam }).model).toBe('env-model');
    expect(resolveLocalConfig(env, { model: 'flag-model' }, { config: glam }).model).toBe(
      'flag-model',
    );
    expect(resolveLocalConfig(env, {}, { config: glam }).baseUrl).toBe('http://localhost:1234/v1');
  });

  it('rejects maxOutputTokens above the declared context window', () => {
    expect(() =>
      resolveLocalConfig({ GLAM_LOCAL_MODEL: 'm' }, { contextWindow: 1024, maxOutputTokens: 2048 }),
    ).toThrow(/exceeds contextWindow/);
  });
});

describe('LocalAdapter', () => {
  it('sends NO Authorization header when no key is configured', () => {
    const adapter = createLocalAdapter(resolveLocalConfig({ GLAM_LOCAL_MODEL: 'qwen3:0.6b' }));
    const req = adapter.encodeRequest(state('qwen3:0.6b'), { stream: false });
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(req.url).toBe(`${LOCAL_DEFAULT_BASE_URL}/chat/completions`);
  });

  it('sends a Bearer token when a key IS configured (vLLM --api-key mode)', () => {
    const adapter = createLocalAdapter(
      resolveLocalConfig({ GLAM_LOCAL_MODEL: 'm', GLAM_LOCAL_API_KEY: 'vllm-key' }),
    );
    const req = adapter.encodeRequest(state('m'), { stream: false });
    expect(req.headers.Authorization).toBe('Bearer vllm-key');
  });

  it('never sends reasoning_effort or service_tier to a local server', () => {
    const adapter = createLocalAdapter(resolveLocalConfig({ GLAM_LOCAL_MODEL: 'm' }));
    const req = adapter.encodeRequest(state('m'), { stream: false });
    expect(req.body.reasoning_effort).toBeUndefined();
    expect(req.body.service_tier).toBeUndefined();
  });

  it('maps user-declared capability tokens onto the engine surface (the floor)', () => {
    const adapter = createLocalAdapter(resolveLocalConfig({ GLAM_LOCAL_MODEL: 'm' }));
    expect(adapter.capabilities).toMatchObject({
      toolCalling: true,
      streaming: true,
      parallelToolCalls: false,
      jsonMode: false,
      vision: false,
      seed: false,
      contextWindow: LOCAL_DEFAULT_CONTEXT_WINDOW,
    });
    const declared = createLocalAdapter(
      resolveLocalConfig(
        { GLAM_LOCAL_MODEL: 'm' },
        { capabilities: ['tool_calling', 'parallel_tool_calls', 'json_mode', 'streaming'] },
      ),
    );
    expect(declared.capabilities.parallelToolCalls).toBe(true);
    expect(declared.capabilities.jsonMode).toBe(true);
  });

  it('prices $0 by default and honors declared override rates exactly', () => {
    const usage: Usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 };
    const free = createLocalAdapter(resolveLocalConfig({ GLAM_LOCAL_MODEL: 'm' }));
    expect(free.pricing(usage)).toBe(0);
    const priced = createLocalAdapter(
      resolveLocalConfig(
        { GLAM_LOCAL_MODEL: 'm' },
        { usdPerMInput: 0.1, usdPerMCachedInput: 0.01, usdPerMOutput: 0.4 },
      ),
    );
    expect(priced.pricing(usage)).toBeCloseTo(0.5, 9);
    expect(
      priced.pricing({ inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 }),
    ).toBeCloseTo(0.01, 9);
  });

  it('replays DS4-style tool-call IDs byte-exact through the wire encoding (research/27)', () => {
    // DwarfStar's exact-replay design keys original DSML blocks off the IDs the
    // client sends back — one rewritten byte breaks the replay.
    const exotic = 'dsml:blk_9zK4|w+Q7/replay==';
    const adapter = createLocalAdapter(resolveLocalConfig({ GLAM_LOCAL_MODEL: 'm' }));
    const runState: RunState = {
      ...state('m'),
      messages: [
        { role: 'user', content: 'weather in Paris?' },
        {
          role: 'assistant',
          content: '',
          reasoning: '',
          toolCalls: [{ id: exotic, name: 'get_weather', arguments: { city: 'Paris' } }],
        },
        { role: 'tool', callId: exotic, name: 'get_weather', content: '{"temp":21}' },
      ],
    };
    const req = adapter.encodeRequest(runState, { stream: false });
    const messages = req.body.messages as Array<Record<string, unknown>>;
    const assistant = messages.find((m) => m.role === 'assistant');
    const toolMsg = messages.find((m) => m.role === 'tool');
    const calls = assistant?.tool_calls as Array<{ id: string }>;
    expect(calls[0]?.id).toBe(exotic);
    expect(toolMsg?.tool_call_id).toBe(exotic);
  });
});

// --- real-transport tests: replay captured Ollama bytes over a loopback socket ---

let server: Server;
let baseUrl: string;
/** Per-request behavior switch (set by each test before calling the adapter). */
let mode: 'replay' | 'strip-usage' = 'replay';

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let body = ollamaSSE;
    if (mode === 'strip-usage') {
      // A real degradation scenario: a server that ignores
      // stream_options.include_usage and never emits token counts. Filter the
      // captured Ollama bytes down to exactly that wire shape.
      body = ollamaSSE
        .split('\n')
        .map((line) => {
          const t = line.trim();
          if (!t.startsWith('data:')) return line;
          const payload = t.slice('data:'.length).trim();
          if (payload === '' || payload === '[DONE]') return line;
          const chunk = JSON.parse(payload) as Record<string, unknown>;
          chunk.usage = undefined;
          return `data: ${JSON.stringify(chunk)}`;
        })
        .join('\n');
    }
    // Awkward 7-byte slices split SSE lines across reads (the hard case).
    const bytes = Buffer.from(body, 'utf8');
    let i = 0;
    const tick = () => {
      if (i >= bytes.length) {
        res.end();
        return;
      }
      res.write(bytes.subarray(i, i + 7));
      i += 7;
      setImmediate(tick);
    };
    tick();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('LocalAdapter.stream over real HTTP (captured Ollama bytes)', () => {
  it('reassembles the live-captured qwen3:0.6b tool call over a socket', async () => {
    mode = 'replay';
    const adapter = createLocalAdapter(
      resolveLocalConfig({ GLAM_LOCAL_MODEL: 'qwen3:0.6b' }, { baseUrl }),
    );
    const result = await adapter.stream(state('qwen3:0.6b'), () => {});
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'get_weather',
      arguments: { city: 'Paris' },
    });
    expect(result.finishReason).toBe('tool_calls');
    expect(result.usage).toEqual({ inputTokens: 163, cachedInputTokens: 0, outputTokens: 88 });
    expect(adapter.turnsWithoutUsage).toBe(0);
  });

  it('records (never fakes) a turn whose server reported no token usage', async () => {
    mode = 'strip-usage';
    const adapter = createLocalAdapter(
      resolveLocalConfig({ GLAM_LOCAL_MODEL: 'qwen3:0.6b' }, { baseUrl }),
    );
    const result = await adapter.stream(state('qwen3:0.6b'), () => {});
    // Output arrived, usage did not: counts stay zero (never invented) and the
    // adapter records the honesty gap for the CLI to surface.
    expect(result.toolCalls).toHaveLength(1);
    expect(result.usage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
    expect(adapter.turnsWithoutUsage).toBe(1);
  });
});
