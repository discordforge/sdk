import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForgeClient } from '../../src/client';
import { AutoPoster } from '../../src/autoposter';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

/** Minimal discord.js-like client stub. */
function createMockDiscordClient(guildCount = 100, ready = true) {
  const listeners: Record<string, Function[]> = {};
  return {
    guilds: { cache: { size: guildCount } },
    ws: { shards: { size: 2 } },
    users: { cache: { size: 5000 } },
    isReady: () => ready,
    once(event: string, fn: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    /** Simulate the "ready" event firing. */
    _emitReady() {
      for (const fn of listeners['ready'] ?? []) fn();
    }
  };
}

describe('AutoPoster', () => {
  let forge: ForgeClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    forge = new ForgeClient('test_api_key');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when interval is below the 5-minute minimum', () => {
    const discord = createMockDiscordClient();
    expect(() => new AutoPoster(forge, discord, { interval: 60_000 }))
      .toThrowError('at least 300000ms');
  });

  it('posts stats immediately on a ready client', async () => {
    const discord = createMockDiscordClient(42);
    const onPost = vi.fn();

    new AutoPoster(forge, discord, { onPost });

    // Flush the immediate post (microtask)
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.server_count).toBe(42);
    expect(onPost).toHaveBeenCalledWith({ serverCount: 42, shardCount: 2, userCount: 5000 });
  });

  it('waits for the ready event before starting on a non-ready client', async () => {
    const discord = createMockDiscordClient(10, false);
    new AutoPoster(forge, discord);

    // Nothing posted yet — client not ready
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).not.toHaveBeenCalled();

    // Fire the ready event
    discord._emitReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('posts on each interval tick', async () => {
    const discord = createMockDiscordClient(50);
    new AutoPoster(forge, discord, { interval: 300_000 });

    // Initial post
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // After 5 minutes
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // After 10 minutes total
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('stop() halts the posting loop', async () => {
    const discord = createMockDiscordClient();
    const poster = new AutoPoster(forge, discord);

    await vi.advanceTimersByTimeAsync(0); // initial post
    poster.stop();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no additional posts
    expect(poster.isRunning).toBe(false);
  });

  it('emits error events without crashing on API failure', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const noRetryForge = new ForgeClient('test_api_key', undefined, { retries: 0 });
    const discord = createMockDiscordClient();
    const onError = vi.fn();
    new AutoPoster(noRetryForge, discord, { onError });

    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('network down');
  });

  it('destroy() stops the loop and clears all listeners', async () => {
    const discord = createMockDiscordClient();
    const onPost = vi.fn();
    const poster = new AutoPoster(forge, discord, { onPost });

    await vi.advanceTimersByTimeAsync(0);
    poster.destroy();

    await vi.advanceTimersByTimeAsync(300_000);
    // onPost should have been called once (initial), then removed by destroy
    expect(onPost).toHaveBeenCalledTimes(1);
    expect(poster.isRunning).toBe(false);
  });
});
