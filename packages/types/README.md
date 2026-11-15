# @discordforgejs/types

TypeScript type definitions for the [DiscordForge](https://discordforge.org) Developer API.

[`@discordforgejs/sdk`](https://www.npmjs.com/package/@discordforgejs/sdk) already depends on this package and re-exports every type, so SDK users don't need to install it. Install it on its own when you call the API with your own HTTP client, or run somewhere the SDK doesn't fit, and only want the request and response shapes.

## Installation

```bash
npm install -D @discordforgejs/types
```

## Usage

```ts
import type { BotStats, VoteMetadata } from "@discordforgejs/types";

const stats: BotStats = { serverCount: 1500, shardCount: 2 };

await fetch("https://discordforge.org/api/v1/bots/stats", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.DISCORDFORGE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(stats),
});

const res = await fetch(`https://discordforge.org/api/bots/${botId}/votes/check?userId=${userId}`, {
  headers: { Authorization: process.env.DISCORDFORGE_API_KEY! },
});
const vote = (await res.json()) as VoteMetadata;
```

## What's included

| Types | Used for |
|-------|----------|
| `BotStats`, `BotStatsRequestBody`, `BotStatsResponse` | `POST /api/v1/bots/stats` |
| `HeartbeatStatus`, `HeartbeatRequest`, `HeartbeatResponse` | `POST /api/v1/bots/heartbeat` |
| `VoteMetadata` | `GET /api/bots/:id/votes/check` |
| `VoteListOptions`, `BotVote`, `BotVoteList` | `GET /api/v1/bots/:id/votes` |
| `ReviewListOptions`, `BotReview`, `BotReviewList` | `GET /api/v1/bots/:id/reviews` |
| `UptimeOptions`, `BotUptime`, `BotUptimeDay` | `GET /api/v1/bots/:id/uptime` |
| `AnalyticsOptions`, `BotAnalytics`, `BotAnalyticsDay` | `GET /api/v1/bots/:id/analytics` |
| `BotOperationalStatus`, `BotStatusUpdateRequest`, `BotStatusNotice` | `GET`, `PUT`, `DELETE /api/v1/bots/status` |
| `BumpCooldown` | `GET /api/v1/bump/cooldown` |
| `BotInfo` | `GET /api/bots/:id` |
| `SyncCommand`, `CustomCommand`, `DiscordCommand`, `SyncCommandsResponse` | `POST /api/v1/bots/commands` |
| `BotListingUpdateRequest`, `BotListing`, `BotListingUpdateResponse` | `PATCH /api/v1/bots/listing` |
| `BotAnnouncementCreateRequest`, `BotAnnouncement`, `BotAnnouncementType`, `BotAnnouncementCreateResponse` | `POST /api/v1/bots/announcements` |
| `WebhookEvent`, `WebhookEventType`, `WebhookEventOf`, `VoteCreatedData`, `ReviewCreatedData`, `VoteMilestoneData`, `FollowerNewData`, `BoostExpiringData` | Webhooks v2 payloads and live events (`GET /api/v1/bots/events`) |
| `LegacyVoteWebhookPayload` | Legacy vote webhook |
| `APIErrorBody` | Error responses |

Field names match the JSON the API returns, so newer v1 endpoints use `snake_case`.

`WebhookEvent` is a union you can narrow by `type`:

```ts
import type { WebhookEvent } from "@discordforgejs/types";

function handle(event: WebhookEvent) {
  if (event.type === "vote.created") {
    console.log(event.data.voter_id);
  }
}
```

Full endpoint reference: [discordforge.org/support/developers](https://discordforge.org/support/developers)

## License

[MIT](./LICENSE) © DiscordForge
