import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ForgeAPIError } from '@discordforgejs/sdk';
import { run, type CliIO } from '../src/run';

function io(env: Record<string, string> = { DISCORDFORGE_API_KEY: 'key' }, files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  let interrupt: () => void = () => {};
  const value: CliIO = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    env,
    readFile: (p) => {
      if (!(p in files)) throw new Error('ENOENT');
      return files[p];
    },
    interrupted: () => new Promise<void>((resolve) => (interrupt = resolve))
  };
  return { value, out, err, interrupt: () => interrupt() };
}

function fakeClient(overrides: Record<string, any> = {}) {
  return {
    getBot: vi.fn().mockResolvedValue({ name: 'Forge', voteCount: 5, serverCount: 10, averageRating: 5, reviewCount: 1, tags: 'utility' }),
    postStats: vi.fn().mockResolvedValue({ success: true, message: 'Stats updated successfully' }),
    heartbeat: vi.fn().mockResolvedValue({ success: true, message: 'Heartbeat recorded successfully', status: 'online', uptimeChecks: 2, uptimeOnline: 2 }),
    checkVote: vi.fn().mockResolvedValue({ hasVoted: false }),
    getVotes: vi.fn().mockResolvedValue({ votes: [{ user_id: '1', timestamp: '2026-01-01T00:00:00.000Z' }], has_more: false }),
    getAnalytics: vi.fn().mockResolvedValue({ days_requested: 7, totals: { views: 10, invite_clicks: 1, votes: 2, click_through_rate: 10 }, daily: [] }),
    setStatus: vi.fn().mockResolvedValue({ status: 'degraded', message: 'slow', enabled: true }),
    clearStatus: vi.fn().mockResolvedValue({ status: 'operational', message: null, enabled: false }),
    syncCommands: vi.fn().mockResolvedValue({ success: true, synced: 1 }),
    ...overrides
  } as any;
}

describe('cli', () => {
  it('prints help and version', async () => {
    const a = io();
    expect(await run(['--help'], a.value)).toBe(0);
    expect(a.out[0]).toContain('Usage: discordforge');
    const b = io();
    expect(await run(['--version'], b.value)).toBe(0);
    expect(b.out[0]).toMatch(/@discordforgejs\/cli \S+ \(sdk \S+\)/);
  });

  it('requires an API key', async () => {
    const a = io({});
    expect(await run(['bot'], a.value, () => fakeClient())).toBe(2);
    expect(a.err[0]).toContain('DISCORDFORGE_API_KEY');
  });

  it('passes key, bot id and base URL to the client', async () => {
    const factory = vi.fn(() => fakeClient());
    const a = io({ DISCORDFORGE_API_KEY: 'env-key', DISCORDFORGE_BOT_ID: '42' });
    expect(await run(['bot', '--base-url', 'http://localhost:3000'], a.value, factory)).toBe(0);
    expect(factory).toHaveBeenCalledWith('env-key', '42', { baseURL: 'http://localhost:3000' });
    expect(a.out[0]).toContain('Forge');
  });

  it('stats post converts numbers and validates them', async () => {
    const client = fakeClient();
    const a = io();
    expect(await run(['stats', 'post', '--servers', '120', '--shards', '2'], a.value, () => client)).toBe(0);
    expect(client.postStats).toHaveBeenCalledWith({ serverCount: 120, shardCount: 2, userCount: undefined, voiceConnections: undefined });
    const b = io();
    expect(await run(['stats', 'post', '--servers', 'many'], b.value, () => client)).toBe(2);
    expect(await run(['stats', 'post'], io().value, () => client)).toBe(2);
  });

  it('--json prints raw responses', async () => {
    const a = io();
    await run(['analytics', '--days', '7', '--json'], a.value, () => fakeClient());
    expect(JSON.parse(a.out[0]).totals.views).toBe(10);
  });

  it('status set/clear map to the SDK', async () => {
    const client = fakeClient();
    await run(['status', 'set', 'degraded', '--message', 'slow'], io().value, () => client);
    expect(client.setStatus).toHaveBeenCalledWith({ status: 'degraded', message: 'slow', enabled: undefined });
    await run(['status', 'set', 'maintenance', '--hidden'], io().value, () => client);
    expect(client.setStatus).toHaveBeenLastCalledWith({ status: 'maintenance', message: undefined, enabled: false });
    const a = io();
    await run(['status', 'clear'], a.value, () => client);
    expect(a.out[0]).toContain('banner hidden');
  });

  it('commands sync reads a JSON array file', async () => {
    const client = fakeClient();
    const a = io({ DISCORDFORGE_API_KEY: 'k' }, { 'cmds.json': '[{"name":"ping","description":"Pong"}]', 'bad.json': '{"a":1}' });
    expect(await run(['commands', 'sync', 'cmds.json'], a.value, () => client)).toBe(0);
    expect(client.syncCommands).toHaveBeenCalledWith([{ name: 'ping', description: 'Pong' }]);
    expect(await run(['commands', 'sync', 'bad.json'], a.value, () => client)).toBe(2);
    expect(await run(['commands', 'sync', 'missing.json'], a.value, () => client)).toBe(2);
  });

  it('API errors exit 1 with the status', async () => {
    const client = fakeClient({ getBot: vi.fn().mockRejectedValue(new ForgeAPIError('x', 401, { message: 'bad key' })) });
    const a = io();
    expect(await run(['bot'], a.value, () => client)).toBe(1);
    expect(a.err[0]).toBe('API error 401: bad key');
  });

  it('unknown commands exit 2', async () => {
    expect(await run(['launch'], io().value, () => fakeClient())).toBe(2);
  });

  it('webhook verify works offline', async () => {
    const body = '{"id":"evt_1"}';
    const sig = `sha256=${createHmac('sha256', 's').update(body).digest('hex')}`;
    const a = io({}, { 'body.json': body });
    expect(await run(['webhook', 'verify', 'body.json', '--secret', 's', '--signature', sig], a.value)).toBe(0);
    expect(a.out[0]).toBe('Signature is valid');
    const b = io({}, { 'body.json': body });
    expect(await run(['webhook', 'verify', 'body.json', '--secret', 'wrong', '--signature', sig], b.value)).toBe(1);
  });

  it('events prints events until interrupted', async () => {
    const stream = Object.assign(new EventEmitter(), { close: vi.fn() });
    const client = fakeClient({ events: vi.fn(() => stream) });
    const a = io();
    const done = run(['events', '--types', 'vote.created', '--json'], a.value, () => client);
    await new Promise((r) => setTimeout(r, 0));
    expect(client.events).toHaveBeenCalledWith({ types: ['vote.created'] });
    stream.emit('event', { id: 'evt_1', type: 'vote.created', created_at: 'now', data: { voter_id: '1' } });
    a.interrupt();
    expect(await done).toBe(0);
    expect(JSON.parse(a.out[0]).id).toBe('evt_1');
    expect(stream.close).toHaveBeenCalled();
  });

  it('events exits 1 when the key is rejected', async () => {
    const stream = Object.assign(new EventEmitter(), { close: vi.fn() });
    const client = fakeClient({ events: vi.fn(() => stream) });
    const a = io();
    const done = run(['events'], a.value, () => client);
    await new Promise((r) => setTimeout(r, 0));
    stream.emit('error', new ForgeAPIError('x', 401, { message: 'Unauthorized' }));
    stream.emit('close');
    expect(await done).toBe(1);
    expect(a.err.join('\n')).toContain('API error 401');
  });
});
