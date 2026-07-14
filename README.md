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
console.log(`${bot.name} – ${bot.voteCount} votes`);
```

## Developer API v1

The SDK uses DiscordForge Developer API v1 routes under `/api/v1` for canonical developer API calls. Authentication is centralized in `ForgeClient`; every v1 request sends:

```http
Authorization: Bearer <BOT_API_KEY>
```

For v1 requests, do not pass raw `Authorization` values, `x-api-key` headers, or API keys in query strings. `checkVote()` retains its legacy raw-Authorization contract because that endpoint does not yet have a v1 replacement.

Migration note: the announced legacy aliases remain available only until **14 October 2026, 00:00 UTC**. Upgrade calls such as stats and command sync to `/api/v1` before that time. `checkVote()` and `getBot()` are existing public endpoints that do not have v1 replacements.

## API Reference

### `new ForgeClient(apiKey, botId?, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | `string` | Your DiscordForge API key |
| `botId` | `string?` | Your bot's Discord snowflake ID (required for `checkVote` and `getBot`) |
| `options.timeout` | `number` | Request timeout in ms (default: `10000`) |
| `options.retries` | `number` | Auto-retry count on failure (default: `3`) |

### Methods

| Method | Returns | Description | Rate Limit |
|--------|---------|-------------|------------|
| `postStats(stats)` | `Promise<void>` | Update your bot's server/shard/user stats | 1 req / 5 min |
| `checkVote(userId)` | `Promise<VoteMetadata>` | Check if a user voted in the last 8h | 60 req / min |
| `getBot()` | `Promise<BotInfo>` | Fetch your bot's public profile | – |
| `syncCommands(commands)` | `Promise<SyncCommandsResponse>` | Sync up to 200 slash commands | – |
| `updateListing(listing)` | `Promise<BotListingUpdateResponse>` | Update editable listing fields | – |
| `publishAnnouncement(announcement)` | `Promise<BotAnnouncementCreateResponse>` | Publish a bot announcement without images | – |

### v1 Routes Used

| Method | Route |
|--------|-------|
| `postStats(stats)` | `POST /api/v1/bots/stats` |
| `syncCommands(commands)` | `POST /api/v1/bots/commands` |
| `updateListing(listing)` | `PATCH /api/v1/bots/listing` |
| `publishAnnouncement(announcement)` | `POST /api/v1/bots/announcements` |

### Existing public routes

| Method | Route | Authentication |
|--------|-------|----------------|
| `checkVote(userId)` | `GET /api/bots/:id/votes/check` | Raw `Authorization: <BOT_API_KEY>` (legacy contract) |
| `getBot()` | `GET /api/bots/:id` | None |

### `new AutoPoster(forgeClient, discordClient, options?)`

Automatically posts stats to DiscordForge on a fixed interval. Works with discord.js, Eris, or any client that exposes `guilds.cache.size`.

```js
const { ForgeClient, AutoPoster } = require("discordforge-sdk");

const forge = new ForgeClient("YOUR_API_KEY");
const poster = new AutoPoster(forge, discordClient);

poster.on("post", (stats) => console.log(`Posted: ${stats.serverCount} servers`));
poster.on("error", (err) => console.error(err));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `interval` | `number` | `300000` | Posting interval in ms (min: 5 minutes) |
| `startImmediately` | `boolean` | `true` | Post stats as soon as the client is ready |
| `onPost` | `function` | – | Callback fired after each successful post |
| `onError` | `function` | – | Callback fired on posting failure |

| Method | Description |
|--------|-------------|
| `start()` | Start the loop (called automatically on client ready) |
| `stop()` | Pause the loop |
| `destroy()` | Stop and remove all listeners |
| `isRunning` | Whether the poster is active |

### Types

All interfaces are exported for use in your own code:

```ts
import type {
  BotStats,
  BotInfo,
  VoteMetadata,
  SyncCommand,
  BotListing,
  BotListingUpdateRequest,
  BotListingUpdateResponse,
  BotAnnouncementCreateRequest,
  BotAnnouncementCreateResponse
} from "discordforge-sdk";
```

### Updating Your Listing

`updateListing()` only sends fields supported by the v1 listing endpoint:

```ts
await client.updateListing({
  prefix: "!",
  shortDescription: "Moderation and utility bot",
  description: "Longer Markdown-capable listing description.",
  tags: "moderation, utility",
  supportServer: "https://discord.gg/example",
  website: "https://example.com",
  socials: '[{"type":"github","url":"https://github.com/example/bot"}]',
  languages: "en",
  hasPaidFeatures: false,
  paidFeaturesAvailable: false,
  webInterface: true,
  installableAsUserApp: false
});
```

### Publishing Announcements

Announcements support optional `title`, required `content`, and optional `type`. Supported types are `UPDATE`, `MAINTENANCE`, `NEWS`, `EVENT`, and `GENERAL`. Images are not supported.

```ts
await client.publishAnnouncement({
  title: "Version 2.0 is live",
  content: "New moderation tools and dashboard improvements are now available.",
  type: "UPDATE"
});
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

  console.log(`${bot.user.tag} is online – stats synced to DiscordForge`);
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
- [Listing updates and announcements](./examples/6-listing-and-announcements.ts)

## Links

- [DiscordForge Dashboard](https://discordforge.org/dashboard)
- [API Documentation](https://discordforge.org/support/developers)
- [npm Package](https://www.npmjs.com/package/discordforge-sdk)

## 🎯 Smart Promotion with the Engagement Algorithm

Stop forcing your community to endlessly type vote commands. **DiscordForge.org** replaces outdated upvote systems with an advanced, automated ranking system that favors real utility and activity.

When you list your project on DiscordForge, your positioning in the catalog and featured sections is driven entirely by our three-pillar **Engagement Algorithm**:

1. **Engagement Velocity (40%)** – Driven by real-time velocity of profile views, clicks, and recent reviews. The more your project is actually explored and interacted with on the site, the higher it scales.
2. **Recency Weight (40%)** – A built-in mechanism that boosts new and freshly updated projects, leveling the playing field for indie developers against established giants.
3. **Project Quality (20%)** – Evaluates your profile's completeness, verification benchmarks, and authentic community ratings.

This data-driven approach ensures that high-quality, engaging communities and tools organically win the top spots over stagnant, dead projects.

## License

[MIT](./LICENSE) © DiscordForge

## Forge Bot Widget

[![Forge Widget](https://discordforge.org/api/widget/bot/1446137754206474392?lang=en&size=large)](https://discordforge.org/bot/1446137754206474392)
