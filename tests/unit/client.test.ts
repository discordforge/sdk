import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgeClient } from '../../src/client';
import { ForgeAPIError } from '../../src/errors';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('ForgeClient', () => {
  let client: ForgeClient;

  beforeEach(() => {
    client = new ForgeClient('test_token', '123456789');
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('throws on missing apiKey', () => {
      expect(() => new ForgeClient('', '123')).toThrowError('requires a valid apiKey');
    });

    it('accepts apiKey-only construction for endpoints that do not need botId', () => {
      expect(() => new ForgeClient('test_key')).not.toThrow();
    });

    it('rejects invalid timeout and retry options', () => {
      expect(() => new ForgeClient('test_key', undefined, { timeout: 0 }))
        .toThrowError('timeout must be a positive finite number');
      expect(() => new ForgeClient('test_key', undefined, { retries: -1 }))
        .toThrowError('retries must be a non-negative integer');
      expect(() => new ForgeClient('test_key', undefined, { retries: 1.5 }))
        .toThrowError('retries must be a non-negative integer');
    });
  });

  describe('postStats', () => {
    it('rejects invalid statistics counters before making a request', async () => {
      await expect(client.postStats({ serverCount: -1 })).rejects
        .toThrowError('serverCount must be a non-negative finite number');
      await expect(client.postStats({ serverCount: Number.NaN })).rejects
        .toThrowError('serverCount must be a non-negative finite number');
      await expect(client.postStats({ serverCount: 1, userCount: -1 })).rejects
        .toThrowError('userCount must be a non-negative finite number');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('maps camelCase fields to snake_case in request body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await client.postStats({ serverCount: 1500, shardCount: 5, userCount: 80000 });

      const [url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(url).toBe('https://discordforge.org/api/bots/stats');
      expect(options.method).toBe('POST');
      expect(body).toEqual({
        server_count: 1500,
        shard_count: 5,
        user_count: 80000,
        voice_connections: undefined
      });
    });

    it('sends Authorization header with the provided API key', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await client.postStats({ serverCount: 1 });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.get('Authorization')).toBe('test_token');
    });

    it('keeps the historical API path when a version option is provided', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      const versionedClient = new ForgeClient('test_token', undefined, { version: 'v2' });
      await versionedClient.postStats({ serverCount: 1 });

      expect(mockFetch.mock.calls[0][0]).toBe('https://discordforge.org/api/bots/stats');
    });
  });

  describe('checkVote', () => {
    it('encodes userId in the query string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ hasVoted: true })
      });

      await client.checkVote('user_abc');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/bots/123456789/votes/check?userId=user_abc');
    });

    it('rejects with an error when userId is empty', async () => {
      await expect(client.checkVote('')).rejects.toThrowError('userId must be a valid string');
    });

    it('throws when called without a botId', async () => {
      const keyOnlyClient = new ForgeClient('test_token');
      await expect(keyOnlyClient.checkVote('user_abc')).rejects.toThrowError('requires a botId');
    });
  });

  describe('syncCommands', () => {
    it('rejects payloads exceeding 200 commands', async () => {
      const oversized = Array.from({ length: 201 }, (_, i) => ({
        name: `cmd_${i}`,
        description: 'test'
      }));
      await expect(client.syncCommands(oversized)).rejects.toThrowError('200 commands');
    });

    it('posts to /api/external/bots/commands', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, synced: 2 })
      });

      const result = await client.syncCommands([
        { name: 'ping', description: 'Check latency' },
        { name: 'help', description: 'Show help' }
      ]);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://discordforge.org/api/external/bots/commands');
      expect(options.method).toBe('POST');
      expect(result).toEqual({ success: true, synced: 2 });
    });
  });

  describe('error handling', () => {
    it('throws ForgeAPIError with parsed body on 4xx responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Invalid payload' })),
        headers: new Headers()
      });

      try {
        await client.getBot();
        expect.unreachable('Expected ForgeAPIError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ForgeAPIError);
        const apiErr = err as ForgeAPIError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.body).toMatchObject({ message: 'Invalid payload' });
      }
    });

    it('getBot throws when called without a botId', async () => {
      const keyOnlyClient = new ForgeClient('test_token');
      await expect(keyOnlyClient.getBot()).rejects.toThrowError('requires a botId');
    });

    it('retries automatically on 429 responses', async () => {
      const retryClient = new ForgeClient('test_token', '123456789', { retries: 1 });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '0' }),
          text: vi.fn().mockResolvedValue('{}')
        })
        .mockResolvedValueOnce({ ok: true, status: 204 });

      await retryClient.postStats({ serverCount: 1 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses a safe fallback delay for malformed retry-after headers', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': 'not-a-delay' }),
          text: vi.fn().mockResolvedValue('{}')
        })
        .mockResolvedValueOnce({ ok: true, status: 204 });

      const request = new ForgeClient('test_token', undefined, { retries: 1 }).postStats({ serverCount: 1 });
      await vi.advanceTimersByTimeAsync(2999);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await request;
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('supports HTTP-date retry-after headers', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({
            'retry-after': new Date(Date.now() + 60_000).toUTCString()
          }),
          text: vi.fn().mockResolvedValue('{}')
        })
        .mockResolvedValueOnce({ ok: true, status: 204 });

      const request = new ForgeClient('test_token', undefined, { retries: 1 }).postStats({ serverCount: 1 });
      await vi.advanceTimersByTimeAsync(59_000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_000);
      await request;
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });
});
