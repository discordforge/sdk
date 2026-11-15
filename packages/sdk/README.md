<p align="center">
  <img src="https://discordforge.org/images/logo.png" alt="DiscordForge" width="200" />
</p>

<h1 align="center">@discordforgejs/sdk</h1>

<p align="center">
  Node.js SDK for the <a href="https://discordforge.org">DiscordForge</a> bot listing platform.<br/>
  No runtime dependencies. TypeScript included.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@discordforgejs/sdk"><img src="https://img.shields.io/npm/v/@discordforgejs/sdk.svg?style=flat-square&color=5865F2&cacheSeconds=300" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@discordforgejs/sdk"><img src="https://img.shields.io/npm/dm/@discordforgejs/sdk.svg?style=flat-square&cacheSeconds=300" alt="npm downloads" /></a>
  <a href="https://github.com/discordforge/sdk/actions"><img src="https://img.shields.io/github/actions/workflow/status/discordforge/sdk/test.yml?style=flat-square&cacheSeconds=300" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@discordforgejs/sdk.svg?style=flat-square&cacheSeconds=300" alt="license" /></a>
</p>

---

## Installation

```bash
npm install @discordforgejs/sdk
```

**Requirements:** Node.js 18 or higher.

> **Moving from `discordforge-sdk`?** This package used to be published as `discordforge-sdk`. That name no longer gets updates. Swap the package and your imports; the API is the same:
>
> ```bash
> npm uninstall discordforge-sdk
> npm install @discordforgejs/sdk
> ```
>
> ```diff
> - const { ForgeClient } = require("discordforge-sdk");
> + const { ForgeClient } = require("@discordforgejs/sdk");
> ```

## Quick Start

```js
const { ForgeClient } = require("@discordforgejs/sdk");

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
import { ForgeClient } from "@discordforgejs/sdk";

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");
const bot = await client.getBot();
console.log(`${bot.name} – ${bot.voteCount} votes`);
```

## Authentication

Every v1 call sends your bot's API key as a bearer token:

```http
Authorization: Bearer <BOT_API_KEY>
```

The key identifies your bot, so most methods work with just the key. `checkVote()` and `getBot()` also need `botId`. `checkVote()` still uses the older vote route, which expects the raw key (`Authorization: <BOT_API_KEY>`); the SDK handles that for you.

The legacy aliases (`/api/external/...` and `/api/bots/stats`) were retired on **14 October 2026** and now return `410 Gone`. Every method in this SDK already uses the current routes.

## API Reference

### `new ForgeClient(apiKey, botId?, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | `string` | Your bot's DiscordForge API key |
| `botId` | `string?` | Your bot's ID (needed for `checkVote` and `getBot`) |
| `options.timeout` | `number` | Request timeout in ms (default: `10000`) |
| `options.retries` | `number` | Retries on network errors and 429s (default: `3`) |
| `options.baseURL` | `string` | API origin (default: `https://discordforge.org`) |

### Methods

| Method | Route | Returns |
|--------|-------|---------|
| `postStats(stats)` | `POST /api/v1/bots/stats` | `BotStatsResponse` |
| `heartbeat(status?)` | `POST /api/v1/bots/heartbeat` | `HeartbeatResponse` |
| `checkVote(userId)` | `GET /api/bots/:id/votes/check` | `VoteMetadata` |
| `getVotes(options?)` | `GET /api/v1/bots/:id/votes` | `BotVoteList` |
| `iterateVotes(options?)` | `GET /api/v1/bots/:id/votes` (paged) | `AsyncGenerator<BotVote>` |
| `getReviews(options?)` | `GET /api/v1/bots/:id/reviews` | `BotReviewList` |
| `getUptime(options?)` | `GET /api/v1/bots/:id/uptime` | `BotUptime` |
| `getAnalytics(options?)` | `GET /api/v1/bots/:id/analytics` | `BotAnalytics` |
| `events(options?)` | `GET /api/v1/bots/events` (Server-Sent Events) | `LiveEventStream` |
| `getStatus()` | `GET /api/v1/bots/status` | `BotStatusNotice` |
| `setStatus(update)` | `PUT /api/v1/bots/status` | `BotStatusNotice` |
| `clearStatus()` | `DELETE /api/v1/bots/status` | `BotStatusNotice` |
| `getBumpCooldown(userId, serverId)` | `GET /api/v1/bump/cooldown` | `BumpCooldown` |
| `getBot()` | `GET /api/bots/:id` (no auth) | `BotInfo` |
| `syncCommands(commands)` | `POST /api/v1/bots/commands` | `SyncCommandsResponse` |
| `updateListing(listing)` | `PATCH /api/v1/bots/listing` | `BotListingUpdateResponse` |
| `publishAnnouncement(announcement)` | `POST /api/v1/bots/announcements` | `BotAnnouncementCreateResponse` |

Responses are returned exactly as the API sends them, so newer endpoints use `snake_case` fields (`has_more`, `uptime_percentage`).

Rate limits: `postStats` 1 request per 5 minutes; `checkVote`, `getBumpCooldown` and `getAnalytics` 60 per minute. A 429 is retried automatically after `retry-after`.

### Stats and heartbeats

```js
await client.postStats({ serverCount: guilds, shardCount: 2, userCount: 75000 });

// Uptime tracking: one heartbeat every 5 minutes. Status is "online" (default), "idle" or "dnd".
setInterval(() => client.heartbeat().catch(console.error), 5 * 60_000);
```

Heartbeats need an approved listing. Heartbeats less than about 4.5 minutes apart update presence but don't count as a new uptime check. `AutoPoster` can send them for you with `heartbeat: true`.

### Votes

```js
// Did this user vote in the last 8 hours? (needs botId)
const { hasVoted, nextVoteAt } = await client.checkVote(userId);

// One page of vote history, newest first (limit 1–1000, default 100)
const { votes, has_more } = await client.getVotes({ limit: 500 });

// Or walk the whole history
for await (const vote of client.iterateVotes()) {
  console.log(vote.user_id, vote.timestamp);
}
```

### Reviews and uptime

```js
const { reviews, average, total } = await client.getReviews({ sort: "rating", limit: 5 });

const uptime = await client.getUptime({ days: 7 }); // 1–90, default 30
console.log(`${uptime.uptime_percentage}% over the last week`);
```

### Analytics

```js
const { totals, daily } = await client.getAnalytics({ days: 7 }); // 1–90, default 30
console.log(`${totals.views} views, ${totals.invite_clicks} invite clicks (${totals.click_through_rate}%), ${totals.votes} votes`);

for (const day of daily) console.log(day.date, day.views, day.invite_clicks, day.votes);
```

Days are UTC calendar days ending today, oldest first.

### Live events

Get votes, reviews, milestones, new followers and expiring boosts as they happen, without hosting a webhook endpoint. Payloads are the same as Webhooks v2.

```js
const stream = client.events({ types: ["vote.created", "review.created"] }); // types are optional

stream.on("vote.created", (event) => rewardVoter(event.data.voter_id));
stream.on("review.created", (event) => console.log(`${event.data.rating}★: ${event.data.snippet}`));
stream.on("error", (err) => console.error(err));

// later
stream.close();
```

Or iterate it:

```js
for await (const event of client.events()) {
  console.log(event.type, event.data);
}
```

The server ends each connection after about 50 seconds. The stream reconnects by itself and sends the last event ID, so events from the gap (up to an hour back) are replayed. It stops on `401`/`403` and emits `error`. Other events: `connect`, `disconnect`, `close`. Save `stream.lastEventId` and pass it as `lastEventId` to resume after a restart. Each bot can have up to 5 open streams.

### Status banner

Show a status banner on your bot page and clear it when things recover:

```js
await client.setStatus({ status: "degraded", message: "Music is slow on EU shards" });

const current = await client.getStatus();

// Fixed: hide the banner (status goes back to operational)
await client.clearStatus();
```

The banner shows for every status you set, `operational` included. Pass `enabled: false` to save a status without showing it.

Statuses: `operational`, `degraded`, `partial_outage`, `major_outage`, `maintenance`. Messages can be up to 500 characters.

### Bump cooldown

For bots with their own bump command:

```js
const { canBump, cooldownExpiresAt } = await client.getBumpCooldown(interaction.user.id, interaction.guildId);
```

### Webhooks

Verify incoming webhooks before trusting them. Both helpers use timing-safe comparison.

**Webhooks v2** are signed with `X-Forge-Signature: sha256=<hex HMAC of the raw body>`. Pass the raw body, not parsed JSON:

```js
const express = require("express");
const { constructWebhookEvent } = require("@discordforgejs/sdk");

app.post("/forge", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.get("x-forge-signature"), process.env.FORGE_WEBHOOK_SECRET);
  } catch {
    return res.sendStatus(401);
  }

  if (event.type === "vote.created" && !event.data.test) {
    rewardVoter(event.data.voter_id);
  }
  res.sendStatus(204);
});
```

Events: `vote.created`, `review.created`, `milestone.votes`, `follower.new`, `boost.expiring`. `event.type` narrows `event.data` in TypeScript. Retries can deliver the same event twice; skip `event.id` values you've already handled.

**Legacy vote webhook** sends your secret as-is in `Authorization`:

```js
const { parseLegacyVoteWebhook } = require("@discordforgejs/sdk");

app.post("/vote", express.json(), (req, res) => {
  let vote;
  try {
    vote = parseLegacyVoteWebhook(req.body, req.get("authorization"), process.env.FORGE_WEBHOOK_SECRET);
  } catch {
    return res.sendStatus(401);
  }
  if (!vote.isTest) rewardVoter(vote.id);
  res.sendStatus(204);
});
```

Lower-level helpers: `verifyWebhookSignature(rawBody, signature, secret)`, `verifyLegacyWebhook(authorization, secret)`, `signWebhookPayload(rawBody, secret)`.

#### Ready-made handlers

The same checks as drop-in handlers. They reply `401` to unsigned requests and `204` after your callback, unless you respond yourself. Neither framework is a dependency of the SDK.

```js
const { expressWebhook, expressLegacyVoteWebhook } = require("@discordforgejs/sdk");

// Webhooks v2: needs the raw body
app.post("/forge", express.raw({ type: "application/json" }), expressWebhook({
  secret: process.env.FORGE_EVENTS_SECRET,
  onEvent: async (event) => {
    if (event.type === "vote.created" && !event.data.test) await rewardVoter(event.data.voter_id);
  }
}));

// Legacy vote webhook: works with express.json()
app.post("/vote", express.json(), expressLegacyVoteWebhook({
  secret: process.env.FORGE_WEBHOOK_SECRET,
  onVote: (vote) => { if (!vote.isTest) rewardVoter(vote.id); }
}));
```

Fastify:

```js
const { fastifyWebhook, fastifyLegacyVoteWebhook } = require("@discordforgejs/sdk");

fastify.register(async (scope) => {
  // Keep the raw body for signature checks in this scope only
  scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  scope.post("/forge", fastifyWebhook({ secret: process.env.FORGE_EVENTS_SECRET, onEvent: (event) => console.log(event.type) }));
});

fastify.post("/vote", fastifyLegacyVoteWebhook({ secret: process.env.FORGE_WEBHOOK_SECRET, onVote: (vote) => console.log(vote.id) }));
```

### `new AutoPoster(forgeClient, discordClient, options?)`

Automatically posts stats to DiscordForge on a fixed interval, and optionally sends uptime heartbeats. Works with discord.js, Eris, or any client that exposes `guilds.cache.size`. Starts when the client is ready (`clientReady` or `ready`).

```js
const { ForgeClient, AutoPoster } = require("@discordforgejs/sdk");

const forge = new ForgeClient("YOUR_API_KEY");
const poster = new AutoPoster(forge, discordClient, { heartbeat: true });

poster.on("post", (stats) => console.log(`Posted: ${stats.serverCount} servers`));
poster.on("heartbeat", (res) => console.log(res.message));
poster.on("error", (err) => console.error(err));
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `interval` | `number` | `300000` | Posting interval in ms (min: 5 minutes) |
| `startImmediately` | `boolean` | `true` | Post stats as soon as the client is ready |
| `heartbeat` | `boolean | { interval }` | `false` | Also send heartbeats: every 5 minutes, or every `interval` ms (min: 1 minute). Sends the bot's presence (online, idle, dnd) when known |
| `onPost` | `function` | – | Callback fired after each successful post |
| `onHeartbeat` | `function` | – | Callback fired after each successful heartbeat |
| `onError` | `function` | – | Callback fired when a post or heartbeat fails |

| Method | Description |
|--------|-------------|
| `start()` | Start the loop (called automatically on client ready) |
| `stop()` | Pause posting and heartbeats |
| `destroy()` | Stop and remove all listeners |
| `isRunning` | Whether the poster is active |

### Types

All interfaces are exported for use in your own code. They come from [`@discordforgejs/types`](https://www.npmjs.com/package/@discordforgejs/types), which the SDK installs for you:

```ts
import type {
  BotStats,
  BotInfo,
  VoteMetadata,
  BotVoteList,
  BotReviewList,
  BotUptime,
  BotStatusNotice,
  BumpCooldown,
  SyncCommand,
  BotListingUpdateRequest,
  BotAnnouncementCreateRequest,
  WebhookEvent,
  LegacyVoteWebhookPayload
} from "@discordforgejs/sdk";
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
const { ForgeClient } = require("@discordforgejs/sdk");

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
const { ForgeClient, ForgeAPIError } = require("@discordforgejs/sdk");

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
- [Heartbeats and status banner](./examples/7-heartbeat-and-status.js)
- [Webhook receiver](./examples/8-webhooks.js)
- [Live events](./examples/9-live-events.js)

## Links

- [DiscordForge Dashboard](https://discordforge.org/dashboard)
- [API Documentation](https://discordforge.org/support/developers)
- [npm Package](https://www.npmjs.com/package/@discordforgejs/sdk)

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
