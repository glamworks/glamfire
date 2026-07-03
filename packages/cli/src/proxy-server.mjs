// The `glam serve` HTTP core — glamfire's router-as-proxy gateway
// (research/28 §6 mode 3, research/32 backlog item 4).
//
// Two local dialect surfaces over one metered path to the real provider:
//   POST /v1/messages              Anthropic Messages (Claude Code via
//                                  ANTHROPIC_BASE_URL) — translated to the
//                                  OpenAI-compatible upstream and back,
//                                  streaming included.
//   POST /v1/messages/count_tokens Documented estimate (Claude Code calls it).
//   POST /v1/chat/completions      OpenAI chat completions (opencode, Cursor,
//                                  curl, any OpenAI SDK) — metered passthrough.
//   GET  /v1/models                The registered model list (OpenAI shape).
//   GET  /healthz                  Liveness + version (SPEC §9), no auth.
//
// Every request: bearer-token auth (always required), a HARD budget gate
// (config [serve.budgets]) that rejects with a clean provider-shaped error
// BEFORE any provider is called, then one usage-ledger record with the exact
// tokens/cost the upstream reported — the proxy is glamfire's most accurate
// first-party meter. No mocks anywhere: the upstream is the real provider.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  AnthropicStreamTranslator,
  TranslateError,
  anthropicErrorBody,
  anthropicToOpenAIRequest,
  encodeAnthropicSSE,
  estimateInputTokens,
  openaiErrorBody,
  openaiToAnthropicResponse,
  usageFromOpenAI,
} from '@glamfire/proxy';
import { PolicyError } from '@glamfire/router';
import { appendRecord, buildProxyRecord, proxyBudgetGate, readLedger } from './ledger.mjs';
import { buildModelRegistry, buildRouter } from './router.mjs';

const MAX_BODY_BYTES = 64 * 1024 * 1024; // 64 MB — agent payloads are large.

/** Constant-time bearer-token comparison (hash first: lengths never leak). */
function tokenMatches(presented, expected) {
  if (typeof presented !== 'string' || presented === '') return false;
  const a = createHash('sha256').update(presented, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Client label: explicit `x-glam-client` header, else user-agent family. */
export function clientLabel(headers) {
  const explicit = headers['x-glam-client'];
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim().slice(0, 64);
  }
  const ua = String(headers['user-agent'] ?? '');
  if (/^claude-cli\//i.test(ua)) return 'claude-code';
  if (/opencode/i.test(ua)) return 'opencode';
  if (/cursor/i.test(ua)) return 'cursor';
  const family = ua
    .split('/')[0]
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  return family !== '' && family !== undefined ? family.slice(0, 64) : 'unknown';
}

/** Pull a routing goal out of either dialect's last user message. */
function goalFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
      if (text !== '') return text;
    }
  }
  return '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new TranslateError(413, 'invalid_request_error', 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function fmtUSD(n) {
  return `$${n.toFixed(n > 0 && n < 0.01 ? 6 : 4)}`;
}

/**
 * Start the proxy server. Returns `{ server, port, url, close }`; `close()`
 * stops listening and terminates open connections.
 *
 * `token` is REQUIRED — the server refuses to exist without one. The caller
 * (`glam serve`) decides where it comes from (flag, GLAM_SERVE_TOKEN, or a
 * generated per-session secret) and enforces the non-loopback rule.
 */
export async function startProxyServer({
  glamConfig,
  env = process.env,
  version,
  token,
  home,
  log = () => {},
}) {
  if (typeof token !== 'string' || token.length < 8) {
    throw new Error('glam serve: an auth token of at least 8 characters is required');
  }
  const serveConfig = glamConfig.serve;

  // --- resolve the target(s) up front: fail loud at startup, not per request --
  const registry = buildModelRegistry(glamConfig, env);
  const assertUpstream = (descriptor) => {
    if (descriptor.adapter.id === 'anthropic') {
      throw new Error(
        `glam serve: target model "${descriptor.id}" is served by the anthropic adapter. The proxy upstream must be an OpenAI-compatible provider (fireworks/together/local) — pointing an Anthropic-dialect client at Anthropic through a local hop adds nothing.`,
      );
    }
    return descriptor;
  };
  let pinned = null;
  let router = null;
  if (serveConfig.target === 'pin') {
    const id = serveConfig.model ?? glamConfig.model;
    const descriptor = registry.get(id);
    if (!descriptor) {
      throw new Error(
        `glam serve: pinned model "${id}" is not registered — list it under a provider in glam.toml (see glam models)`,
      );
    }
    pinned = assertUpstream(descriptor);
  } else {
    router = buildRouter(glamConfig, registry);
  }

  /** Pick the serving descriptor for one request (pin or per-request route). */
  const resolveTarget = (goal) => {
    if (pinned) return { descriptor: pinned, routed: false, reason: 'pinned by [serve] config' };
    const decision = router.decide({ goal, budget: {} });
    const descriptor = registry.get(decision.selection.chosen.id);
    if (!descriptor)
      throw new Error(`router chose unregistered model "${decision.selection.chosen.id}"`);
    return {
      descriptor: assertUpstream(descriptor),
      routed: true,
      reason: decision.selection.reason,
    };
  };

  /** Real upstream URL + auth headers via the adapter's own encoder. */
  const upstreamRequest = (descriptor, translatedBody, stream) => {
    const probe = descriptor.adapter.encodeRequest(
      {
        system: '',
        task: { goal: '', budget: {} },
        messages: [],
        tools: [],
        config: descriptor.config,
      },
      { stream },
    );
    // Overlay: the client's translated fields win where the client spoke;
    // provider knobs the client cannot express (model id, reasoning_effort,
    // service_tier, default temperature) come from the adapter's own encoding.
    const body = { ...probe.body, ...translatedBody, model: probe.body.model };
    return { url: probe.url, headers: probe.headers, body };
  };

  const sendJson = (res, status, obj, extraHeaders = {}) => {
    const payload = JSON.stringify(obj);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'x-glamfire-version': version,
      ...extraHeaders,
    });
    res.end(payload);
  };

  const shapeError = (dialect, res, status, message, type = 'invalid_request_error') => {
    if (dialect === 'anthropic') sendJson(res, status, anthropicErrorBody(type, message));
    else {
      const code = type === 'authentication_error' ? 'invalid_api_key' : type;
      sendJson(
        res,
        status,
        openaiErrorBody(
          message,
          type === 'authentication_error' ? 'invalid_request_error' : type,
          code,
        ),
      );
    }
  };

  /** Meter one completed request into the local usage ledger. */
  const meter = ({
    dialect,
    client,
    descriptor,
    requestedModel,
    routed,
    stream,
    status,
    startedAt,
    usage,
    toolCalls,
  }) => {
    const costUsd = descriptor.pricing(usage);
    const record = buildProxyRecord({
      version,
      client,
      dialect,
      adapter: descriptor.adapter.id,
      model: descriptor.id,
      requestedModel,
      routed,
      stream,
      status,
      durationMs: Date.now() - startedAt,
      usage,
      costUsd,
      toolCalls,
    });
    try {
      appendRecord(record, home ? { home } : {});
    } catch (err) {
      log(`warning: could not record usage: ${err.message}`);
    }
    log(
      `${client} ${dialect} -> ${descriptor.id} ` +
        `in=${usage.inputTokens} (cached ${usage.cachedInputTokens}) out=${usage.outputTokens} ` +
        `cost=${fmtUSD(costUsd)} status=${status} ${Date.now() - startedAt}ms`,
    );
    return costUsd;
  };

  /** The hard budget stop — evaluated BEFORE any provider call. */
  const budgetStop = (client) => {
    const { records } = readLedger(home ? { home } : {});
    return proxyBudgetGate(serveConfig, records, client);
  };

  const budgetMessage = (gate) =>
    `glamfire budget stop: ${gate.scope === 'client' ? `client "${gate.client}"` : 'proxy'} month-to-date spend ${fmtUSD(gate.spentUsd)} has reached the ${fmtUSD(gate.budgetUsd)} monthly budget ([serve.budgets] in glam.toml). No provider was called. Raise the budget or wait for the new month.`;

  // --- dialect handlers --------------------------------------------------------

  async function handleAnthropicMessages(req, res, rawBody, client) {
    const startedAt = Date.now();
    let areq;
    try {
      areq = JSON.parse(rawBody);
    } catch {
      return shapeError('anthropic', res, 400, 'invalid JSON body');
    }

    const gate = budgetStop(client);
    if (gate) {
      log(`${client} anthropic BLOCKED (budget): ${budgetMessage(gate)}`);
      return shapeError('anthropic', res, 400, budgetMessage(gate));
    }

    let target;
    try {
      target = resolveTarget(goalFromMessages(areq.messages));
    } catch (err) {
      if (err instanceof PolicyError)
        return shapeError('anthropic', res, 400, err.message, 'api_error');
      throw err;
    }
    const { descriptor, routed } = target;

    let translated;
    try {
      translated = anthropicToOpenAIRequest(areq, {
        vision: descriptor.capabilities.vision,
        maxOutputTokens: descriptor.capabilities.maxOutputTokens,
        targetLabel: descriptor.id,
      });
    } catch (err) {
      if (err instanceof TranslateError)
        return shapeError('anthropic', res, err.status, err.message, err.type);
      throw err;
    }
    for (const w of translated.warnings) log(`${client} anthropic: ${w}`);

    const stream = areq.stream === true;
    const { url, headers, body } = upstreamRequest(descriptor, translated.body, stream);

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abort.signal,
      });
    } catch (err) {
      if (abort.signal.aborted) return; // client went away; nothing to answer
      return shapeError(
        'anthropic',
        res,
        502,
        `upstream request failed: ${err.message}`,
        'api_error',
      );
    }

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 500);
      // Upstream 401/403 is OUR provider credential problem, not the client's.
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
      return shapeError(
        'anthropic',
        res,
        status,
        `upstream (${descriptor.id}) HTTP ${upstream.status}${detail ? `: ${detail}` : ''}`,
        'api_error',
      );
    }

    const requestedModel = typeof areq.model === 'string' ? areq.model : 'unknown';

    if (!stream) {
      const json = await upstream.json();
      const out = openaiToAnthropicResponse(json, { model: descriptor.id });
      const usage = usageFromOpenAI(json.usage);
      const toolCalls = out.content.filter((b) => b.type === 'tool_use').length;
      const costUsd = meter({
        dialect: 'anthropic',
        client,
        descriptor,
        requestedModel,
        routed,
        stream: false,
        status: 'done',
        startedAt,
        usage,
        toolCalls,
      });
      return sendJson(res, 200, out, {
        'x-glamfire-cost-usd': costUsd.toFixed(8),
        'x-glamfire-model': descriptor.id,
      });
    }

    // Streaming: re-frame the upstream's OpenAI SSE as Anthropic Messages SSE,
    // fragment-for-fragment, while the translator keeps the real usage totals.
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-glamfire-version': version,
      'x-glamfire-model': descriptor.id,
    });
    const translator = new AnthropicStreamTranslator(descriptor.id);
    const decoder = new TextDecoder();
    let buffer = '';
    const consume = (line) => {
      const t = line.trim();
      if (!t.startsWith('data:')) return;
      const payload = t.slice('data:'.length).trim();
      if (payload === '' || payload === '[DONE]') return;
      for (const ev of translator.push(JSON.parse(payload))) res.write(encodeAnthropicSSE(ev));
    };
    let status = 'done';
    try {
      for await (const part of upstream.body) {
        buffer += decoder.decode(part, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          consume(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf('\n');
        }
      }
      consume(buffer);
      for (const ev of translator.finish()) res.write(encodeAnthropicSSE(ev));
      res.end();
    } catch (err) {
      status = 'interrupted';
      if (!abort.signal.aborted) log(`${client} anthropic stream error: ${err.message}`);
      res.destroy();
    }
    meter({
      dialect: 'anthropic',
      client,
      descriptor,
      requestedModel,
      routed,
      stream: true,
      status,
      startedAt,
      usage: translator.usage,
      toolCalls: translator.toolCallIds.length,
    });
  }

  async function handleOpenAIChat(req, res, rawBody, client) {
    const startedAt = Date.now();
    let oreq;
    try {
      oreq = JSON.parse(rawBody);
    } catch {
      return shapeError('openai', res, 400, 'invalid JSON body');
    }

    const gate = budgetStop(client);
    if (gate) {
      log(`${client} openai BLOCKED (budget): ${budgetMessage(gate)}`);
      return shapeError('openai', res, 429, budgetMessage(gate), 'insufficient_quota');
    }

    let target;
    try {
      target = resolveTarget(goalFromMessages(oreq.messages));
    } catch (err) {
      if (err instanceof PolicyError)
        return shapeError('openai', res, 400, err.message, 'api_error');
      throw err;
    }
    const { descriptor, routed } = target;
    const requestedModel = typeof oreq.model === 'string' ? oreq.model : 'unknown';
    const stream = oreq.stream === true;

    // Same-dialect passthrough: the client body is already OpenAI wire — only
    // the model id is pinned/routed and usage reporting is forced on streams
    // (that is what makes the meter exact).
    // (`model` is omitted here; the overlay in upstreamRequest pins/routes it.)
    const { model: _clientModel, ...clientBody } = oreq;
    if (stream) clientBody.stream_options = { include_usage: true, ...(oreq.stream_options ?? {}) };
    const { url, headers, body } = upstreamRequest(descriptor, clientBody, stream);

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abort.signal,
      });
    } catch (err) {
      if (abort.signal.aborted) return;
      return shapeError('openai', res, 502, `upstream request failed: ${err.message}`, 'api_error');
    }

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 500);
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status;
      return shapeError(
        'openai',
        res,
        status,
        `upstream (${descriptor.id}) HTTP ${upstream.status}${detail ? `: ${detail}` : ''}`,
        'api_error',
      );
    }

    if (!stream) {
      const json = await upstream.json();
      const usage = usageFromOpenAI(json.usage);
      const toolCalls = json.choices?.[0]?.message?.tool_calls?.length ?? 0;
      const costUsd = meter({
        dialect: 'openai',
        client,
        descriptor,
        requestedModel,
        routed,
        stream: false,
        status: 'done',
        startedAt,
        usage,
        toolCalls,
      });
      return sendJson(res, 200, json, {
        'x-glamfire-cost-usd': costUsd.toFixed(8),
        'x-glamfire-model': descriptor.id,
      });
    }

    // Streaming passthrough: bytes flow to the client verbatim while a line
    // scanner lifts the final usage chunk for the meter.
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-glamfire-version': version,
      'x-glamfire-model': descriptor.id,
    });
    const decoder = new TextDecoder();
    let buffer = '';
    let wireUsage;
    let toolCallCount = 0;
    const scan = (line) => {
      const t = line.trim();
      if (!t.startsWith('data:')) return;
      const payload = t.slice('data:'.length).trim();
      if (payload === '' || payload === '[DONE]') return;
      try {
        const chunk = JSON.parse(payload);
        if (chunk.usage) wireUsage = chunk.usage;
        for (const tc of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
          if (tc.id) toolCallCount += 1;
        }
      } catch {
        // a partial/foreign line never breaks the passthrough
      }
    };
    let status = 'done';
    try {
      for await (const part of upstream.body) {
        res.write(part);
        buffer += decoder.decode(part, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          scan(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf('\n');
        }
      }
      scan(buffer);
      res.end();
    } catch (err) {
      status = 'interrupted';
      if (!abort.signal.aborted) log(`${client} openai stream error: ${err.message}`);
      res.destroy();
    }
    meter({
      dialect: 'openai',
      client,
      descriptor,
      requestedModel,
      routed,
      stream: true,
      status,
      startedAt,
      usage: usageFromOpenAI(wireUsage),
      toolCalls: toolCallCount,
    });
  }

  // --- the server ---------------------------------------------------------------

  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://proxy.local').pathname;
    const dialect = pathname.startsWith('/v1/messages') ? 'anthropic' : 'openai';
    try {
      if (req.method === 'GET' && pathname === '/healthz') {
        return sendJson(res, 200, { ok: true, glamfire: version });
      }

      // Auth: ALWAYS required. Claude Code sends `Authorization: Bearer`
      // (ANTHROPIC_AUTH_TOKEN) or `x-api-key` (ANTHROPIC_API_KEY); OpenAI SDKs
      // send `Authorization: Bearer`. Accept both header spellings.
      const authHeader = String(req.headers.authorization ?? '');
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
      const presented = bearer !== '' ? bearer : String(req.headers['x-api-key'] ?? '');
      if (!tokenMatches(presented, token)) {
        return shapeError(
          dialect,
          res,
          401,
          'invalid or missing glamfire proxy token (set ANTHROPIC_AUTH_TOKEN / the Bearer token to the value `glam serve` printed)',
          'authentication_error',
        );
      }

      const client = clientLabel(req.headers);

      if (req.method === 'GET' && pathname === '/v1/models') {
        return sendJson(res, 200, {
          object: 'list',
          data: registry.all().map((d) => ({
            id: d.id,
            object: 'model',
            created: 0,
            owned_by: d.adapter.id,
          })),
        });
      }

      if (req.method === 'POST' && pathname === '/v1/messages/count_tokens') {
        const raw = await readBody(req);
        let areq;
        try {
          areq = JSON.parse(raw);
        } catch {
          return shapeError('anthropic', res, 400, 'invalid JSON body');
        }
        // A documented estimate (~4 chars/token): the target tokenizer is not
        // Anthropic's, so an exact count does not exist at this boundary.
        return sendJson(res, 200, { input_tokens: estimateInputTokens(areq) });
      }

      if (req.method === 'POST' && pathname === '/v1/messages') {
        const raw = await readBody(req);
        return await handleAnthropicMessages(req, res, raw, client);
      }

      if (req.method === 'POST' && pathname === '/v1/chat/completions') {
        const raw = await readBody(req);
        return await handleOpenAIChat(req, res, raw, client);
      }

      return shapeError(
        dialect,
        res,
        404,
        `no such endpoint: ${req.method} ${pathname}`,
        'not_found_error',
      );
    } catch (err) {
      if (err instanceof TranslateError) {
        if (!res.headersSent) return shapeError(dialect, res, err.status, err.message, err.type);
        return;
      }
      log(`internal error: ${err.stack ?? err.message}`);
      if (!res.headersSent) {
        shapeError(dialect, res, 500, `glamfire proxy internal error: ${err.message}`, 'api_error');
      } else {
        res.destroy();
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(serveConfig.port, serveConfig.bind, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : serveConfig.port;
  const host = serveConfig.bind.includes(':') ? `[${serveConfig.bind}]` : serveConfig.bind;
  return {
    server,
    port,
    url: `http://${host}:${port}`,
    target: pinned
      ? { mode: 'pin', model: pinned.id, adapter: pinned.adapter.id }
      : { mode: 'route' },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
