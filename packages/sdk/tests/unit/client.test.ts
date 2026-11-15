import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgeClient } from '../../src/client';
import { ForgeAPIError } from '../../src/errors';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('ForgeClient', () => {
  let client: ForgeClient;

  beforeEach(() => {
    client = new ForgeClient('test_token', '123456789');
    mockFetch.mockReset();
  });

  function expectBearerV1Request(path: string, method: string) {
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://discordforge.org${path}`);
    expect(options.method).toBe(method);
    expect(options.headers.get('Authorization')).toBe('Bearer test_token');
    expect(options.headers.get('x-api-key')).toBeNull();
    expect(url).not.toContain('test_token');
    return options;
  }

  function expectLegacyRawAuthorizationRequest(path: string, method: string) {
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://discordforge.org${path}`);
    expect(options.method).toBe(method);
    expect(options.headers.get('Authorization')).toBe('test_token');
    expect(options.headers.get('x-api-key')).toBeNull();
    return options;
  }

  function expectPublicRequest(path: string, method: string) {
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://discordforge.org${path}`);
    expect(options.method).toBe(method);
    expect(options.headers.get('Authorization')).toBeNull();
    return options;
  }

  describe('constructor', () => {
    it('throws on missing apiKey', () => {
      expect(() => new ForgeClient('', '123')).toThrowError('requires a valid apiKey');
    });

    it('accepts apiKey-only construction for endpoints that do not need botId', () => {
      expect(() => new ForgeClient('test_key')).not.toThrow();
    });

    it('preserves existing public SDK methods', () => {
      expect(typeof client.postStats).toBe('function');
      expect(typeof client.checkVote).toBe('function');
      expect(typeof client.getBot).toBe('function');
      expect(typeof client.syncCommands).toBe('function');
    });
  });

  describe('postStats', () => {
    it('maps camelCase fields to snake_case in request body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await client.postStats({ serverCount: 1500, shardCount: 5, userCount: 80000 });

      const options = expectBearerV1Request('/api/v1/bots/stats', 'POST');
      expect(JSON.parse(options.body)).toEqual({
        server_count: 1500,
        shard_count: 5,
        user_count: 80000
      });
    });
  });

  describe('checkVote', () => {
    it('uses the legacy vote route with the raw Authorization API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ hasVoted: true })
      });

      await client.checkVote('user_abc');

      expectLegacyRawAuthorizationRequest('/api/bots/123456789/votes/check?userId=user_abc', 'GET');
    });

    it('rejects with an error when userId is empty', async () => {
      await expect(client.checkVote('')).rejects.toThrowError('userId must be a valid string');
    });

    it('throws when called without a botId', async () => {
      const keyOnlyClient = new ForgeClient('test_token');
      await expect(keyOnlyClient.checkVote('user_abc')).rejects.toThrowError('requires a botId');
    });
  });

  describe('getBot', () => {
    it('fetches public bot info without an API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: '123456789', name: 'Test Bot', voteCount: 10, serverCount: 20 })
      });

      const bot = await client.getBot();

      expectPublicRequest('/api/bots/123456789', 'GET');
      expect(bot.id).toBe('123456789');
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

    it('posts to /api/v1/bots/commands', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, synced: 2 })
      });

      const result = await client.syncCommands([
        { name: 'ping', description: 'Check latency' },
        { name: 'help', description: 'Show help' }
      ]);

      const options = expectBearerV1Request('/api/v1/bots/commands', 'POST');
      expect(JSON.parse(options.body)).toEqual({
        commands: [
          { name: 'ping', description: 'Check latency' },
          { name: 'help', description: 'Show help' }
        ]
      });
      expect(result).toEqual({ success: true, synced: 2 });
    });
  });

  describe('listing updates', () => {
    it('patches only supported listing fields to the v1 endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: '123456789',
          clientId: '123456789',
          prefix: '!',
          shortDescription: 'Short listing text',
          description: 'Long listing text',
          tags: 'utility',
          supportServer: 'https://discord.gg/example',
          website: 'https://example.com',
          socials: '[{"type":"github","url":"https://github.com/example"}]',
          languages: 'en',
          hasPaidFeatures: true,
          paidFeaturesAvailable: true,
          webInterface: true,
          installableAsUserApp: false
        })
      });

      const result = await client.updateListing({
        prefix: '!',
        shortDescription: 'Short listing text',
        description: 'Long listing text',
        tags: 'utility',
        supportServer: 'https://discord.gg/example',
        website: 'https://example.com',
        socials: '[{"type":"github","url":"https://github.com/example"}]',
        languages: 'en',
        hasPaidFeatures: true,
        paidFeaturesAvailable: true,
        webInterface: true,
        installableAsUserApp: false,
        ignored: 'not sent'
      } as any);

      const options = expectBearerV1Request('/api/v1/bots/listing', 'PATCH');
      expect(JSON.parse(options.body)).toEqual({
        prefix: '!',
        shortDescription: 'Short listing text',
        description: 'Long listing text',
        tags: 'utility',
        supportServer: 'https://discord.gg/example',
        website: 'https://example.com',
        socials: '[{"type":"github","url":"https://github.com/example"}]',
        languages: 'en',
        hasPaidFeatures: true,
        paidFeaturesAvailable: true,
        webInterface: true,
        installableAsUserApp: false
      });
      expect(result.tags).toBe('utility');
    });
  });

  describe('announcement publishing', () => {
    it('posts announcement payloads to the v1 endpoint without image fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ id: 'ann_1', title: 'Release', content: 'New release is live', type: 'NEWS' })
      });

      const result = await client.publishAnnouncement({
        title: 'Release',
        content: 'New release is live',
        type: 'NEWS',
        images: ['https://example.com/image.png']
      } as any);

      const options = expectBearerV1Request('/api/v1/bots/announcements', 'POST');
      expect(JSON.parse(options.body)).toEqual({
        title: 'Release',
        content: 'New release is live',
        type: 'NEWS'
      });
      expect(result.type).toBe('NEWS');
    });

    it('requires announcement content', async () => {
      await expect(client.publishAnnouncement({ content: '' })).rejects.toThrowError('content must be a valid string');
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
        expect((apiErr.body as any).message).toBe('Invalid payload');
      }
    });

    it('getBot throws when called without a botId', async () => {
      const keyOnlyClient = new ForgeClient('test_token');
      await expect(keyOnlyClient.getBot()).rejects.toThrowError('requires a botId');
    });

    it('does not expose the API key in ForgeAPIError messages or bodies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue(JSON.stringify({
          message: 'Bearer test_token is invalid',
          nested: { authorization: 'test_token' }
        })),
        headers: new Headers()
      });

      try {
        await client.postStats({ serverCount: 1 });
        expect.unreachable('Expected ForgeAPIError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ForgeAPIError);
        expect((err as Error).message).not.toContain('test_token');
        expect(JSON.stringify((err as ForgeAPIError).body)).not.toContain('test_token');
      }
    });

    it('does not expose the API key in network error messages', async () => {
      const noRetryClient = new ForgeClient('test_token', '123456789', { retries: 0 });
      mockFetch.mockRejectedValueOnce(new Error('network failed for test_token'));

      await expect(noRetryClient.postStats({ serverCount: 1 })).rejects.not.toThrow('test_token');
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
  });
});
