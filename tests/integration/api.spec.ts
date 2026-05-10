import { describe, it, expect, beforeAll } from 'vitest';
import { ForgeClient } from '../../src/client';
import { ForgeAPIError } from '../../src/errors';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.TEST_API_KEY;
const botId = process.env.TEST_BOT_ID;

const suite = apiKey && botId ? describe : describe.skip;

suite('ForgeClient (live)', () => {
  let client: ForgeClient;

  beforeAll(() => {
    client = new ForgeClient(apiKey!, botId!, { retries: 0 });
  });

  it('GET /api/bots/:id returns bot info matching the configured bot ID', async () => {
    const bot = await client.getBot();

    expect(bot).toBeDefined();
    expect(bot.id).toBe(botId);
    expect(typeof bot.name).toBe('string');
  });

  it('POST /api/bots/stats accepts a valid stats payload or returns 429', { timeout: 15000 }, async () => {
    try {
      await client.postStats({
        serverCount: 1,
        shardCount: 1,
        userCount: 1,
        voiceConnections: 0
      });
    } catch (err) {
      if (err instanceof ForgeAPIError && err.status === 429) {
        return; // rate-limited – expected when running tests frequently
      }
      throw err;
    }
  });
});
