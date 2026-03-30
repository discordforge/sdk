<p align="center">
  <img src="https://discordforge.org/images/logo.png" alt="DiscordForge" width="200" />
</p>

<h1 align="center">discordforge-sdk</h1>

<p align="center">
  Node.js SDK for the <a href="https://discordforge.org">DiscordForge</a> bot listing platform.<br/>
  No dependencies. TypeScript included.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/discordforge-sdk"><img src="https://img.shields.io/npm/v/discordforge-sdk.svg?style=flat-square&color=5865F2&cacheSeconds=300" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/discordforge-sdk"><img src="https://img.shields.io/npm/dm/discordforge-sdk.svg?style=flat-square&cacheSeconds=300" alt="npm downloads" /></a>
  <a href="https://github.com/discordforge/sdk/actions"><img src="https://img.shields.io/github/actions/workflow/status/discordforge/sdk/test.yml?style=flat-square&cacheSeconds=300" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/discordforge-sdk.svg?style=flat-square&cacheSeconds=300" alt="license" /></a>
</p>

---

## Installation

```bash
npm install discordforge-sdk
```

**Requirements:** Node.js 18 or higher.

## Quick Start

```js
const { ForgeClient } = require("discordforge-sdk");

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

// Post your bot stats
await client.postStats({
  serverCount: 1500,
  shardCount: 2,
});

// Check if a user voted
const vote = await client.checkVote("USER_DISCORD_ID");
if (vote.hasVoted) {
  console.log("Thanks for voting!");
}
```

### ESM / TypeScript

```ts
import { ForgeClient } from "discordforge-sdk";

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");
const bot = await client.getBot();
console.log(`${bot.name} — ${bot.voteCount} votes`);
```

## API Reference

### `new ForgeClient(apiKey, botId, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | `string` | Your DiscordForge API key |
| `botId` | `string` | Your bot's Discord snowflake ID |
| `options.timeout` | `number` | Request timeout in ms (default: `10000`) |
| `options.retries` | `number` | Auto-retry count on failure (default: `3`) |

### Methods

| Method | Returns | Description | Rate Limit |
|--------|---------|-------------|------------|
| `postStats(stats)` | `Promise<void>` | Update your bot's server/shard/user stats | 1 req / 5 min |
| `checkVote(userId)` | `Promise<VoteMetadata>` | Check if a user voted in the last 12h | 60 req / min |
| `getBot()` | `Promise<BotInfo>` | Fetch your bot's public profile | — |
| `syncCommands(commands)` | `Promise<{ success, synced }>` | Sync up to 200 slash commands | — |

### Types

All interfaces are exported for use in your own code:

```ts
import type { BotStats, BotInfo, VoteMetadata, SyncCommand } from "discordforge-sdk";
```

## Usage with discord.js

```js
const { Client, GatewayIntentBits } = require("discord.js");
const { ForgeClient } = require("discordforge-sdk");

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const forge = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

bot.once("ready", async () => {
  // Post stats on startup
  await forge.postStats({ serverCount: bot.guilds.cache.size });

  // Update stats every 30 minutes
  setInterval(async () => {
    await forge.postStats({ serverCount: bot.guilds.cache.size });
  }, 30 * 60 * 1000);

  console.log(`${bot.user.tag} is online — stats synced to DiscordForge`);
});

bot.login("YOUR_BOT_TOKEN");
```

## Error Handling

The SDK throws `ForgeAPIError` on non-2xx responses. Rate limits (429) are automatically retried.

```js
const { ForgeClient, ForgeAPIError } = require("discordforge-sdk");

try {
  await client.postStats({ serverCount: 100 });
} catch (err) {
  if (err instanceof ForgeAPIError) {
    console.error(`API error ${err.status}:`, err.body);
    if (err.retryAfter) {
      console.log(`Retry after ${err.retryAfter}s`);
    }
  }
}
```

## Examples

See the [`examples/`](./examples) directory:

- [Posting stats](./examples/1-posting-stats.js)
- [Checking votes](./examples/2-checking-votes.js)
- [Syncing commands](./examples/3-syncing-commands.ts)
- [discord.js integration](./examples/4-discord-js-integration.js)

## Links

- [DiscordForge Dashboard](https://discordforge.org/dashboard)
- [API Documentation](https://discordforge.org/support/developers)
- [npm Package](https://www.npmjs.com/package/discordforge-sdk)

## License

[MIT](./LICENSE) © DiscordForge
