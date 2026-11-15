import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgeClient } from '../../src/client';
import { ForgeAPIError } from '../../src/errors';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function ok(body: unknown, status = 200) {
  return { ok: true, status, json: vi.fn().mockResolvedValue(body) };
}

function call(index = 0) {
  const [url, options] = mockFetch.mock.calls[index];
  return { url: new URL(url), options, body: options.body ? JSON.parse(options.body) : undefined };
}

describe('ForgeClient v1 endpoints', () => {
  let client: ForgeClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ForgeClient('test_token', '123456789', { retries: 0 });
  });

  describe('heartbeat', () => {
    it('POSTs to /api/v1/bots/heartbeat with an empty body by default', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, status: 'online' }));
      const res = await client.heartbeat();
      const { url, options, body } = call();
      expect(url.pathname).toBe('/api/v1/bots/heartbeat');
      expect(options.method).toBe('POST');
      expect(options.headers.get('Authorization')).toBe('Bearer test_token');
      expect(body).toEqual({});
      expect(res.status).toBe('online');
    });

    it('sends the presence status', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, status: 'dnd' }));
      await client.heartbeat('dnd');
      expect(call().body).toEqual({ status: 'dnd' });
    });

    it('rejects unknown statuses without a request', async () => {
      await expect(client.heartbeat('away' as any)).rejects.toThrow('online, idle, or dnd');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('postStats', () => {
    it('returns the API acknowledgement', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: 'Stats updated successfully' }));
      await expect(client.postStats({ serverCount: 10 })).resolves.toEqual({ success: true, message: 'Stats updated successfully' });
    });

    it('requires a numeric serverCount', async () => {
      await expect(client.postStats({} as any)).rejects.toThrow('serverCount');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getVotes', () => {
    it('GETs the vote history with query options', async () => {
      mockFetch.mockResolvedValueOnce(ok({ votes: [], has_more: false }));
      await client.getVotes({ limit: 5000, before: new Date('2026-01-01T00:00:00.000Z'), epoch: true });
      const { url, options } = call();
      expect(options.method).toBe('GET');
      expect(url.pathname).toBe('/api/v1/bots/123456789/votes');
      expect(url.searchParams.get('limit')).toBe('1000');
      expect(url.searchParams.get('before')).toBe('2026-01-01T00:00:00.000Z');
      expect(url.searchParams.get('epoch')).toBe('true');
      expect(options.headers.get('Content-Type')).toBeNull();
    });

    it('uses @me when no botId is configured', async () => {
      mockFetch.mockResolvedValueOnce(ok({ votes: [], has_more: false }));
      await new ForgeClient('k', undefined, { retries: 0 }).getVotes();
      expect(call().url.pathname).toBe('/api/v1/bots/%40me/votes');
      expect(call().url.search).toBe('');
    });

    it('rejects an invalid before value', async () => {
      await expect(client.getVotes({ before: 'nope' })).rejects.toThrow('before');
    });
  });

  describe('iterateVotes', () => {
    it('follows has_more using the last timestamp as the cursor', async () => {
      mockFetch
        .mockResolvedValueOnce(ok({
          votes: [
            { user_id: 'a', timestamp: '2026-03-02T00:00:00.000Z' },
            { user_id: 'b', timestamp: '2026-03-01T00:00:00.000Z' }
          ],
          has_more: true
        }))
        .mockResolvedValueOnce(ok({ votes: [{ user_id: 'c', timestamp: '2026-02-01T00:00:00.000Z' }], has_more: false }));

      const ids: string[] = [];
      for await (const vote of client.iterateVotes({ limit: 2 })) ids.push(vote.user_id);

      expect(ids).toEqual(['a', 'b', 'c']);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(call(0).url.searchParams.get('before')).toBeNull();
      expect(call(1).url.searchParams.get('before')).toBe('2026-03-01T00:00:00.000Z');
      expect(call(1).url.searchParams.get('limit')).toBe('2');
    });
  });

  describe('getReviews', () => {
    it('GETs reviews with limit and sort', async () => {
      mockFetch.mockResolvedValueOnce(ok({ reviews: [], average: 0, total: 0 }));
      await client.getReviews({ limit: 99, sort: 'rating' });
      const { url } = call();
      expect(url.pathname).toBe('/api/v1/bots/123456789/reviews');
      expect(url.searchParams.get('limit')).toBe('50');
      expect(url.searchParams.get('sort')).toBe('rating');
    });

    it('rejects an unknown sort', async () => {
      await expect(client.getReviews({ sort: 'best' as any })).rejects.toThrow('sort');
    });
  });

  describe('getUptime', () => {
    it('GETs uptime with days clamped to 1-90', async () => {
      mockFetch.mockResolvedValueOnce(ok({ uptime_percentage: 99.5, days: [] }));
      const res = await client.getUptime({ days: 365 });
      expect(call().url.pathname).toBe('/api/v1/bots/123456789/uptime');
      expect(call().url.searchParams.get('days')).toBe('90');
      expect(res.uptime_percentage).toBe(99.5);
    });
  });

  describe('status banner', () => {
    const notice = { enabled: true, status: 'degraded', message: 'Slow', updated_at: '2026-11-15T00:00:00.000Z' };

    it('getStatus GETs /api/v1/bots/status', async () => {
      mockFetch.mockResolvedValueOnce(ok(notice));
      await expect(client.getStatus()).resolves.toEqual(notice);
      expect(call().options.method).toBe('GET');
      expect(call().url.pathname).toBe('/api/v1/bots/status');
    });

    it('setStatus PUTs only the supported fields', async () => {
      mockFetch.mockResolvedValueOnce(ok(notice));
      await client.setStatus({ status: 'degraded', message: 'Slow', extra: 1 } as any);
      expect(call().options.method).toBe('PUT');
      expect(call().body).toEqual({ status: 'degraded', message: 'Slow' });
    });

    it('setStatus validates status and message length', async () => {
      await expect(client.setStatus({ status: 'down' as any })).rejects.toThrow('operational');
      await expect(client.setStatus({ status: 'degraded', message: 'x'.repeat(501) })).rejects.toThrow('500');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('clearStatus DELETEs /api/v1/bots/status', async () => {
      mockFetch.mockResolvedValueOnce(ok({ ...notice, enabled: false, status: 'operational', message: null }));
      await client.clearStatus();
      expect(call().options.method).toBe('DELETE');
      expect(call().url.pathname).toBe('/api/v1/bots/status');
    });
  });

  describe('getBumpCooldown', () => {
    it('GETs /api/v1/bump/cooldown with userId and serverId', async () => {
      mockFetch.mockResolvedValueOnce(ok({ canBump: true, cooldownExpiresAt: null, tierLabel: 'free', cooldownMs: 1 }));
      await client.getBumpCooldown('u1', 's1');
      const { url, options } = call();
      expect(url.pathname).toBe('/api/v1/bump/cooldown');
      expect(url.searchParams.get('userId')).toBe('u1');
      expect(url.searchParams.get('serverId')).toBe('s1');
      expect(options.headers.get('Authorization')).toBe('Bearer test_token');
    });

    it('requires both ids', async () => {
      await expect(client.getBumpCooldown('u1', '')).rejects.toThrow('serverId');
    });
  });

  describe('options', () => {
    it('uses a custom baseURL without a trailing slash', async () => {
      mockFetch.mockResolvedValueOnce(ok({}));
      await new ForgeClient('k', 'b', { baseURL: 'http://localhost:3000/', retries: 0 }).getStatus();
      expect(call().url.toString()).toBe('http://localhost:3000/api/v1/bots/status');
    });

    it('sends the SDK version in the User-Agent', async () => {
      mockFetch.mockResolvedValueOnce(ok({}));
      await client.getStatus();
      expect(call().options.headers.get('User-Agent')).toMatch(/^DiscordForge-NodeSDK\/\d+\.\d+\.\d+/);
    });

    it('redacts the API key from error bodies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'bad key test_token' }))
      });
      const error = await client.getStatus().catch(e => e);
      expect(error).toBeInstanceOf(ForgeAPIError);
      expect(error.body).toEqual({ message: 'bad key [REDACTED]' });
    });
  });
});
