import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  constructWebhookEvent,
  ForgeWebhookError,
  parseLegacyVoteWebhook,
  signWebhookPayload,
  verifyLegacyWebhook,
  verifyWebhookSignature
} from '../../src/webhooks';

const secret = 'whsec_test';
const event = {
  id: 'evt_1',
  type: 'vote.created',
  created_at: '2026-11-15T00:00:00.000Z',
  bot_id: '123',
  data: { voter_id: '42', streak: 3, total_votes: 10, weekly_votes: 2 }
};
const raw = JSON.stringify(event);
// Same algorithm as the DiscordForge server: sha256=<hex HMAC-SHA256 of the raw body>
const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('Webhooks v2', () => {
  it('signs like the server', () => {
    expect(signWebhookPayload(raw, secret)).toBe(signature);
  });

  it('accepts a valid signature for string and Buffer bodies', () => {
    expect(verifyWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(raw), signature, secret)).toBe(true);
  });

  it('rejects missing, wrong or tampered signatures', () => {
    expect(verifyWebhookSignature(raw, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(raw, 'sha256=00', secret)).toBe(false);
    expect(verifyWebhookSignature(raw, signature, 'other')).toBe(false);
    expect(verifyWebhookSignature(raw.replace('42', '43'), signature, secret)).toBe(false);
  });

  it('constructWebhookEvent returns a typed event', () => {
    const parsed = constructWebhookEvent(raw, signature, secret);
    expect(parsed.type).toBe('vote.created');
    if (parsed.type === 'vote.created') expect(parsed.data.voter_id).toBe('42');
  });

  it('constructWebhookEvent throws ForgeWebhookError on a bad signature', () => {
    expect(() => constructWebhookEvent(raw, 'sha256=bad', secret)).toThrow(ForgeWebhookError);
  });

  it('requires a secret', () => {
    expect(() => verifyWebhookSignature(raw, signature, '')).toThrow('secret');
  });
});

describe('legacy vote webhook', () => {
  const payload = { id: '42', username: 'x', avatar: '', admin: false, weeklyVotes: 1, totalVotes: 2, isTest: false };

  it('verifies the raw Authorization secret', () => {
    expect(verifyLegacyWebhook(secret, secret)).toBe(true);
    expect(verifyLegacyWebhook(`Bearer ${secret}`, secret)).toBe(false);
    expect(verifyLegacyWebhook(null, secret)).toBe(false);
  });

  it('parses parsed or raw bodies', () => {
    expect(parseLegacyVoteWebhook(payload, secret, secret)).toEqual(payload);
    expect(parseLegacyVoteWebhook(JSON.stringify(payload), secret, secret)).toEqual(payload);
  });

  it('throws on a wrong secret', () => {
    expect(() => parseLegacyVoteWebhook(payload, 'nope', secret)).toThrow(ForgeWebhookError);
  });
});
