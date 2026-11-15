# Roadmap

> Current versions: `@discordforgejs/sdk` **2.0.0**, `@discordforgejs/types` **1.0.0**, `@discordforgejs/cli` **1.0.0**

## Phase 1: Core Foundation ✅

- [x] `ForgeClient` base class with auth, timeout, and retry configuration
- [x] `postStats()` – post guild/shard/user counts
- [x] `checkVote()` – check if a user voted in the last 8h
- [x] `getBot()` – fetch public bot profile
- [x] `syncCommands()` – sync up to 200 slash commands
- [x] `ForgeAPIError` with rate-limit header parsing
- [x] Automatic 429 retry with `retry-after` header support
- [x] Dual-publish (ESM + CJS) with full type declarations
- [x] Unit and integration test suites (Vitest)
- [x] GitHub Actions CI pipeline
- [x] `updateListing()` and `publishAnnouncement()` (Developer API v1)
- [x] Move to the `@discordforgejs` npm org as a monorepo, with API types split into `@discordforgejs/types`
- [x] Heartbeats, vote history, reviews, uptime, status banner and bump cooldown endpoints
- [x] Webhook verification helpers and payload types (Webhooks v2 and the legacy vote webhook)

## Phase 2: Webhooks & Ecosystem Support ✅

- [x] Ready-made webhook handlers for Express and Fastify
- [x] `AutoPoster` sends uptime heartbeats too (`heartbeat: true`) and supports the discord.js `clientReady` event

## Phase 3: Real-Time & Analytics ✅

- [x] `getAnalytics()` – page views, invite clicks, votes and click-through rate per day
- [x] `events()` – live events (votes, reviews, milestones, followers, expiring boosts) over Server-Sent Events, with automatic reconnect and replay
- [x] `@discordforgejs/cli` for quick API calls from the terminal

## Next

- [ ] Analytics broken down by referrer and country (needs a new API field)
- [ ] Server listings in the SDK (stats and votes for servers, not just bots)
