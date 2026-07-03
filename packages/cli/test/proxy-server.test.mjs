// proxy-server tests: drive the REAL `glam serve` HTTP server over real
// sockets. The upstream is a real local HTTP server speaking the OpenAI wire
// (pointed at via FIREWORKS_BASE_URL — a documented config surface), so every
// proxy code path (auth, budget gate, translation, streaming, metering) runs
// exactly as in production; only the provider's hostname differs. The live
// provider path itself is exercised by scripts/smoke.mjs.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '@glamfire/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startProxyServer } from '../src/proxy-server.mjs';

const TOKEN = 'test-proxy-token-123';
const VERSION = '0.0.0-test';

// --- a real OpenAI-wire upstream on localhost --------------------------------
/** Requests the upstream actually received (assert nothing was called on budget stops). */
const upstreamHits = [];

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const upstream = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', () => {
    const body = JSON.parse(raw);
    upstreamHits.push({ url: req.url, auth: req.headers.authorization, body });
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sse({ choices: [{ delta: { reasoning_content: 'hmm' } }] }));
      res.write(sse({ choices: [{ delta: { content: 'str' } }] }));
      res.write(sse({ choices: [{ delta: { content: 'eamed' } }] }));
      res.write(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_up1', function: { name: 'do_it', arguments: '{"a"' } },
                ],
              },
            },
          ],
        }),
      );
      res.write(
        sse({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':2}' } }] } }],
        }),
      );
      res.write(sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));
      res.write(
        sse({
          choices: [],
          usage: {
            prompt_tokens: 40,
            completion_tokens: 7,
            prompt_tokens_details: { cached_tokens: 10 },
          },
        }),
      );
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-up',
        model: body.model,
        choices: [
          {
            message: { content: `echo: ${body.messages.at(-1).content}`, reasoning_content: 'why' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      }),
    );
  });
});

let upstreamPort;
let home;
let proxy;

function glamConfig(extraToml = '') {
  // A real layered config load, exactly as `glam serve` performs it.
  const proj = join(home, 'proj');
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, 'glam.toml'), extraToml);
  return loadConfig({
    cwd: proj,
    home,
    env: {
      FIREWORKS_API_KEY: 'unit-test-key',
      FIREWORKS_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      GLAM_SERVE_PORT: '0',
    },
  }).config;
}

async function startProxy(extraToml = '') {
  return startProxyServer({
    glamConfig: glamConfig(extraToml),
    env: {
      FIREWORKS_API_KEY: 'unit-test-key',
      FIREWORKS_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    },
    version: VERSION,
    token: TOKEN,
    home,
  });
}

const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'glam-proxy-test-'));
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  upstreamPort = upstream.address().port;
  proxy = await startProxy();
});

afterAll(async () => {
  await proxy?.close();
  await new Promise((resolve) => upstream.close(resolve));
  rmSync(home, { recursive: true, force: true });
});

function ledgerRecords() {
  const path = join(home, '.glam', 'usage.jsonl');
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

describe('auth', () => {
  it('rejects a missing/wrong token with a provider-shaped 401 per dialect', async () => {
    const a = await fetch(`${proxy.url}/v1/messages`, { method: 'POST', body: '{}' });
    expect(a.status).toBe(401);
    const aBody = await a.json();
    expect(aBody.type).toBe('error');
    expect(aBody.error.type).toBe('authentication_error');

    const o = await fetch(`${proxy.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
      body: '{}',
    });
    expect(o.status).toBe(401);
    const oBody = await o.json();
    expect(oBody.error.code).toBe('invalid_api_key');
  });

  it('accepts the token as x-api-key too (Claude Code ANTHROPIC_API_KEY mode)', async () => {
    const res = await fetch(`${proxy.url}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'x-api-key': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.input_tokens).toBeGreaterThan(0);
  });

  it('healthz needs no auth and reports the version (SPEC §9)', async () => {
    const res = await fetch(`${proxy.url}/healthz`);
    expect(res.status).toBe(200);
    expect((await res.json()).glamfire).toBe(VERSION);
  });
});

describe('anthropic dialect', () => {
  it('translates a non-streaming request end-to-end and meters it', async () => {
    const before = ledgerRecords().length;
    const res = await fetch(`${proxy.url}/v1/messages`, {
      method: 'POST',
      headers: { ...auth, 'x-glam-client': 'unit-anthropic' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        system: 'terse',
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-glamfire-version')).toBe(VERSION);
    expect(Number(res.headers.get('x-glamfire-cost-usd'))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.type).toBe('message');
    expect(body.model).toBe('accounts/fireworks/models/glm-5p2'); // honest: what actually served
    expect(body.content.find((b) => b.type === 'text').text).toBe('echo: ping');
    expect(body.usage).toEqual({
      input_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 2,
      output_tokens: 5,
    });

    // Upstream saw the pinned model + translated messages + provider knobs.
    const hit = upstreamHits.at(-1);
    expect(hit.url).toBe('/chat/completions');
    expect(hit.auth).toBe('Bearer unit-test-key');
    expect(hit.body.model).toBe('accounts/fireworks/models/glm-5p2');
    expect(hit.body.messages[0]).toEqual({ role: 'system', content: 'terse' });
    expect(hit.body.reasoning_effort).toBeDefined(); // adapter knob preserved

    // Metered: one proxy record with client label + exact usage.
    const records = ledgerRecords();
    expect(records.length).toBe(before + 1);
    const rec = records.at(-1);
    expect(rec.source).toBe('proxy');
    expect(rec.client).toBe('unit-anthropic');
    expect(rec.dialect).toBe('anthropic');
    expect(rec.requestedModel).toBe('claude-sonnet-4-6');
    expect(rec.usage).toEqual({ inputTokens: 12, cachedInputTokens: 2, outputTokens: 5 });
    expect(rec.costUsd).toBeGreaterThan(0);
  });

  it('streams as Anthropic SSE with tool-call ID fidelity and meters exact usage', async () => {
    const before = ledgerRecords().length;
    const res = await fetch(`${proxy.url}/v1/messages`, {
      method: 'POST',
      headers: { ...auth, 'x-glam-client': 'unit-stream' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        stream: true,
        messages: [{ role: 'user', content: 'go' }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: message_start');
    expect(text).toContain('"type":"thinking_delta","thinking":"hmm"');
    expect(text).toContain('"type":"text_delta","text":"str"');
    // upstream tool-call id passes through VERBATIM, fragments preserved
    expect(text).toContain('"id":"call_up1"');
    expect(text).toContain('"partial_json":"{\\"a\\""');
    expect(text).toContain('"partial_json":":2}"');
    expect(text).toContain('"stop_reason":"tool_use"');
    expect(text).toContain('event: message_stop');

    const rec = ledgerRecords().at(-1);
    expect(ledgerRecords().length).toBe(before + 1);
    expect(rec.stream).toBe(true);
    expect(rec.toolCalls).toBe(1);
    expect(rec.usage).toEqual({ inputTokens: 40, cachedInputTokens: 10, outputTokens: 7 });
  });

  it('rejects invalid JSON with a clean provider-shaped 400', async () => {
    const res = await fetch(`${proxy.url}/v1/messages`, {
      method: 'POST',
      headers: auth,
      body: '{nope',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.type).toBe('invalid_request_error');
  });
});

describe('openai dialect', () => {
  it('pins the model, passes through, and meters with the client label from user-agent', async () => {
    const before = ledgerRecords().length;
    const res = await fetch(`${proxy.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'user-agent': 'claude-cli/2.1.200 (external, cli)' },
      body: JSON.stringify({ model: 'anything', messages: [{ role: 'user', content: 'yo' }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe('echo: yo');
    expect(upstreamHits.at(-1).body.model).toBe('accounts/fireworks/models/glm-5p2');

    const rec = ledgerRecords().at(-1);
    expect(ledgerRecords().length).toBe(before + 1);
    expect(rec.dialect).toBe('openai');
    expect(rec.client).toBe('claude-code'); // UA-derived label
    expect(rec.requestedModel).toBe('anything');
  });

  it('lists registered models', async () => {
    const res = await fetch(`${proxy.url}/v1/models`, { headers: auth });
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data.map((m) => m.id)).toContain('accounts/fireworks/models/glm-5p2');
  });

  it('404s unknown endpoints with a shaped error', async () => {
    const res = await fetch(`${proxy.url}/v1/embeddings`, {
      method: 'POST',
      headers: auth,
      body: '{}',
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeDefined();
  });
});

describe('budget stops (regression: over budget -> clean error, provider NEVER called)', () => {
  it('enforces the global and per-client monthly stops on both dialects', async () => {
    // A second proxy over the same HOME with hard budgets; the ledger already
    // holds real spend from the tests above (> $0 but tiny), so seed a big
    // proxy record to cross the line.
    const seeded = {
      v: 1,
      ts: new Date().toISOString(),
      source: 'proxy',
      client: 'burner',
      provider: 'fireworks',
      model: 'accounts/fireworks/models/glm-5p2',
      costUsd: 5.0,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    };
    writeFileSync(join(home, '.glam', 'usage.jsonl'), `${JSON.stringify(seeded)}\n`, { flag: 'a' });

    const proxy2 = await startProxy('[serve.budgets]\nmonthlyUsd = 1.0\n');
    try {
      const hitsBefore = upstreamHits.length;
      const a = await fetch(`${proxy2.url}/v1/messages`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          model: 'x',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      expect(a.status).toBe(400);
      const aBody = await a.json();
      expect(aBody.error.type).toBe('invalid_request_error');
      expect(aBody.error.message).toContain('budget stop');
      expect(aBody.error.message).toContain('No provider was called');

      const o = await fetch(`${proxy2.url}/v1/chat/completions`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(o.status).toBe(429);
      const oBody = await o.json();
      expect(oBody.error.code).toBe('insufficient_quota');

      expect(upstreamHits.length).toBe(hitsBefore); // the provider was NEVER called
    } finally {
      await proxy2.close();
    }

    // Per-client: only the labeled client is stopped; others still pass.
    const proxy3 = await startProxy('[serve.budgets.clients.burner]\nmonthlyUsd = 1.0\n');
    try {
      const blocked = await fetch(`${proxy3.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { ...auth, 'x-glam-client': 'burner' },
        body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(blocked.status).toBe(429);

      const allowed = await fetch(`${proxy3.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { ...auth, 'x-glam-client': 'frugal' },
        body: JSON.stringify({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(allowed.status).toBe(200);
    } finally {
      await proxy3.close();
    }
  });
});

describe('startup validation', () => {
  it('refuses an unregistered pinned model, loudly', async () => {
    await expect(startProxy('[serve]\nmodel = "not-a-real-model"\n')).rejects.toThrow(
      /not registered/,
    );
  });

  it('refuses to start without a usable token', async () => {
    await expect(
      startProxyServer({
        glamConfig: glamConfig(),
        env: {},
        version: VERSION,
        token: 'short',
        home,
      }),
    ).rejects.toThrow(/token/);
  });
});
