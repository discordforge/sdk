# Examples

Runnable code samples demonstrating common SDK usage patterns.

| File | Description |
|------|-------------|
| `1-posting-stats.js` | Post server and shard counts to DiscordForge |
| `2-checking-votes.js` | Check if a user voted in the last 8 hours |
| `3-syncing-commands.ts` | Sync slash commands to the DiscordForge panel (TypeScript) |
| `4-discord-js-integration.js` | Auto-post stats from a discord.js bot on an interval |
| `5-autoposter.js` | Post stats automatically with `AutoPoster` |
| `6-listing-and-announcements.ts` | Update v1 listing fields and publish announcements (TypeScript) |
| `7-heartbeat-and-status.js` | Send heartbeats, set the status banner and read uptime |
| `8-webhooks.js` | Verify and handle Webhooks v2 and legacy vote webhooks (Express) |
| `9-live-events.js` | Receive live votes and reviews without a webhook endpoint |

## Running locally

1. Install and build from the repository root:
   ```bash
   npm install
   npm run build
   ```
2. Replace `YOUR_API_KEY` and `YOUR_BOT_ID` with your real credentials. v1 methods send `Authorization: Bearer <BOT_API_KEY>`; the vote-check example retains its legacy raw-Authorization contract.
3. Run any example:
   ```bash
   node packages/sdk/examples/1-posting-stats.js
   ```
