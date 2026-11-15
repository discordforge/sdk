import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { ForgeClient } from '../../src/client';
import { AutoPoster } from '../../src/autoposter';
import {
  expressWebhook,
  expressLegacyVoteWebhook,
  fastifyWebhook,
  fastifyLegacyVoteWebhook
} from '../../src/middleware';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function ok(body: unknown, status = 200) {
  return { ok: true, status, json: vi.fn().mockResolvedValue(body) };
}

/** A Response-like object whose body streams the given SSE chunks, then ends. */
function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const vote = (id: string) => ({
  id,
  type: 'vote.created',
  created_at: '2026-11-15T00:00:00.000Z',
  bot_id: '123',
  data: { voter_id: '42', streak: 1, total_votes: 5, weekly_votes: 1 }
});
const frame = (event: ReturnType<typeof vote>) => `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

describe('getAnalytics', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('GETs analytics with days clamped to 1-90', async () => {
    mockFetch.mockResolvedValueOnce(ok({ days_requested: 90, totals: { views: 1 }, daily: [] }));
    const client = new ForgeClient('k', '777', { retries: 0 });
    await client.getAnalytics({ days: 500 });
    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/bots/777/analytics');
    expect(url.searchParams.get('days')).toBe('90');
    expect(mockFetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer k');
  });
});

describe('events()', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('parses SSE frames, emits by type, and sends auth + types', async () => {
    mockFetch.mockResolvedValueOnce(sseResponse([
      'retry: 5\n: connected\n\n',
      frame(vote('evt_1')).slice(0, 20),           // split across chunks
      frame(vote('evt_1')).slice(20)
    ]));
    mockFetch.mockImplementation(() => new Promise(() => {})); // later reconnects hang

    const client = new ForgeClient('key', undefined, { retries: 0 });
    const stream = client.events({ types: ['vote.created'] });
    const typed = vi.fn();
    const any = vi.fn();
    stream.on('vote.created', typed);
    stream.on('event', any);

    await vi.waitFor(() => expect(typed).toHaveBeenCalledTimes(1));
    expect(any).toHaveBeenCalledTimes(1);
    expect(typed.mock.calls[0][0].data.voter_id).toBe('42');
    expect(stream.lastEventId).toBe('evt_1');

    const [url, init] = mockFetch.mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/v1/bots/events');
    expect(new URL(url).searchParams.get('types')).toBe('vote.created');
    expect(init.headers.get('Authorization')).toBe('Bearer key');
    expect(init.headers.get('Accept')).toBe('text/event-stream');
    stream.close();
  });

  it('reconnects after the server closes and resumes with Last-Event-ID', async () => {
    mockFetch
      .mockResolvedValueOnce(sseResponse(['retry: 1\n\n', frame(vote('evt_1'))]))
      .mockResolvedValueOnce(sseResponse([frame(vote('evt_2'))]))
      .mockImplementation(() => new Promise(() => {}));

    const stream = new ForgeClient('key', undefined, { retries: 0 }).events();
    const ids: string[] = [];
    const connects = vi.fn();
    stream.on('event', (e) => ids.push(e.id));
    stream.on('connect', connects);

    await vi.waitFor(() => expect(ids).toEqual(['evt_1', 'evt_2']));
    expect(connects).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].headers.get('Last-Event-ID')).toBeNull();
    expect(mockFetch.mock.calls[1][1].headers.get('Last-Event-ID')).toBe('evt_1');
    stream.close();
  });

  it('stops on 401 and reports a ForgeAPIError with the key redacted', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad secret_key' }), { status: 401, statusText: 'Unauthorized' }));
    const stream = new ForgeClient('secret_key', undefined, { retries: 0 }).events();
    const errors: any[] = [];
    stream.on('error', (e) => errors.push(e));
    const closed = new Promise((resolve) => stream.on('close', () => resolve(true)));

    await expect(closed).resolves.toBe(true);
    expect(errors[0].status).toBe(401);
    expect(errors[0].body).toEqual({ error: 'bad [REDACTED]' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('works with for await and closes when the loop breaks', async () => {
    mockFetch
      .mockResolvedValueOnce(sseResponse([frame(vote('evt_a')), frame(vote('evt_b'))]))
      .mockImplementation(() => new Promise(() => {}));

    const stream = new ForgeClient('key', undefined, { retries: 0 }).events();
    const seen: string[] = [];
    for await (const event of stream) {
      seen.push(event.id);
      if (seen.length === 2) break;
    }
    expect(seen).toEqual(['evt_a', 'evt_b']);
    expect(stream.isClosed).toBe(true);
  });

  it('rejects unknown event types', () => {
    expect(() => new ForgeClient('k').events({ types: ['vote.deleted' as any] })).toThrow('types');
  });
});

describe('AutoPoster heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () => ok({ success: true, status: 'online' }));
  });
  afterEach(() => vi.useRealTimers());

  const discord = (status = 'dnd') => ({
    guilds: { cache: { size: 10 } },
    user: { presence: { status } },
    isReady: () => true
  });
  const paths = () => mockFetch.mock.calls.map(([url]) => new URL(url).pathname);

  it('sends heartbeats with the bot presence when enabled', async () => {
    const onHeartbeat = vi.fn();
    const poster = new AutoPoster(new ForgeClient('k'), discord(), { heartbeat: true, onHeartbeat });
    await vi.advanceTimersByTimeAsync(0);

    expect(paths()).toEqual(['/api/v1/bots/stats', '/api/v1/bots/heartbeat']);
    const heartbeatCall = mockFetch.mock.calls[1];
    expect(JSON.parse(heartbeatCall[1].body)).toEqual({ status: 'dnd' });
    expect(onHeartbeat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(paths().filter((p) => p.endsWith('/heartbeat'))).toHaveLength(2);
    poster.destroy();
  });

  it('uses a custom heartbeat interval and stop() clears it', async () => {
    const poster = new AutoPoster(new ForgeClient('k'), discord('invisible'), { heartbeat: { interval: 60_000 } });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(paths().filter((p) => p.endsWith('/heartbeat'))).toHaveLength(3);
    expect(JSON.parse(mockFetch.mock.calls.find(([u]) => u.endsWith('/heartbeat'))![1].body)).toEqual({});

    poster.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(paths().filter((p) => p.endsWith('/heartbeat'))).toHaveLength(3);
  });

  it('does not send heartbeats by default', async () => {
    const poster = new AutoPoster(new ForgeClient('k'), discord());
    await vi.advanceTimersByTimeAsync(600_000);
    expect(paths().some((p) => p.endsWith('/heartbeat'))).toBe(false);
    poster.destroy();
  });

  it('rejects heartbeat intervals under a minute', () => {
    expect(() => new AutoPoster(new ForgeClient('k'), discord(), { heartbeat: { interval: 1000 } })).toThrow('at least 60000ms');
  });

  it('starts on the discord.js clientReady event', async () => {
    const handlers: Record<string, () => void> = {};
    const client = { guilds: { cache: { size: 1 } }, isReady: () => false, once: (e: string, fn: () => void) => { handlers[e] = fn; } };
    const poster = new AutoPoster(new ForgeClient('k'), client);
    handlers.clientReady();
    handlers.ready?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(paths()).toEqual(['/api/v1/bots/stats']);
    poster.destroy();
  });
});

describe('webhook middleware', () => {
  const secret = 'whsec';
  const raw = JSON.stringify(vote('evt_m'));
  const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  function expressRes() {
    const res: any = { statusCode: 0, body: undefined, headersSent: false };
    res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
    res.json = vi.fn((body: unknown) => { res.body = body; res.headersSent = true; });
    res.end = vi.fn(() => { res.headersSent = true; });
    return res;
  }

  it('express: verifies a Buffer body and replies 204', async () => {
    const onEvent = vi.fn();
    const res = expressRes();
    await expressWebhook({ secret, onEvent })({ headers: { 'x-forge-signature': sig }, body: Buffer.from(raw) }, res);
    expect(onEvent.mock.calls[0][0].id).toBe('evt_m');
    expect(res.statusCode).toBe(204);
  });

  it('express: reads an unconsumed request stream', async () => {
    const onEvent = vi.fn();
    const req: any = Readable.from([Buffer.from(raw)]);
    req.headers = { 'x-forge-signature': sig };
    const res = expressRes();
    await expressWebhook({ secret, onEvent })(req, res);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('express: 401 on a bad signature, handler not called', async () => {
    const onEvent = vi.fn();
    const res = expressRes();
    await expressWebhook({ secret, onEvent })({ headers: { 'x-forge-signature': 'sha256=00' }, body: raw }, res);
    expect(res.statusCode).toBe(401);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('express: explains when the body was already parsed', async () => {
    const next = vi.fn();
    await expressWebhook({ secret, onEvent: vi.fn() })({ headers: { 'x-forge-signature': sig }, body: { parsed: true } }, expressRes(), next);
    expect(next.mock.calls[0][0].message).toContain('express.raw');
  });

  it('express legacy: works with a parsed body', async () => {
    const onVote = vi.fn();
    const res = expressRes();
    await expressLegacyVoteWebhook({ secret, onVote })({ headers: { authorization: secret }, body: { id: '42', isTest: false } }, res);
    expect(onVote.mock.calls[0][0].id).toBe('42');
    expect(res.statusCode).toBe(204);

    const bad = expressRes();
    await expressLegacyVoteWebhook({ secret, onVote })({ headers: { authorization: 'nope' }, body: {} }, bad);
    expect(bad.statusCode).toBe(401);
  });

  function fastifyReply() {
    const reply: any = { sent: false, statusCode: 0 };
    reply.code = vi.fn((code: number) => { reply.statusCode = code; return reply; });
    reply.send = vi.fn(() => { reply.sent = true; });
    return reply;
  }

  it('fastify: verifies rawBody and replies 204', async () => {
    const onEvent = vi.fn();
    const reply = fastifyReply();
    await fastifyWebhook({ secret, onEvent })({ headers: { 'x-forge-signature': sig }, body: JSON.parse(raw), rawBody: raw }, reply);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(reply.statusCode).toBe(204);
  });

  it('fastify: 401 on a bad signature; legacy works with parsed body', async () => {
    const reply = fastifyReply();
    await fastifyWebhook({ secret, onEvent: vi.fn() })({ headers: { 'x-forge-signature': 'bad' }, body: Buffer.from(raw) }, reply);
    expect(reply.statusCode).toBe(401);

    const onVote = vi.fn();
    const legacy = fastifyReply();
    await fastifyLegacyVoteWebhook({ secret, onVote })({ headers: { authorization: secret }, body: { id: '9' } }, legacy);
    expect(onVote).toHaveBeenCalledTimes(1);
    expect(legacy.statusCode).toBe(204);
  });
});
