# Roadmap

> Current version: **1.0.0**

## Phase 1: Core Foundation ✅

- [x] `ForgeClient` base class with auth, timeout, and retry configuration
- [x] `postStats()` — post guild/shard/user counts
- [x] `checkVote()` — check if a user voted in the last 12h
- [x] `getBot()` — fetch public bot profile
- [x] `syncCommands()` — sync up to 200 slash commands
- [x] `ForgeAPIError` with rate-limit header parsing
- [x] Automatic 429 retry with `retry-after` header support
- [x] Dual-publish (ESM + CJS) with full type declarations
- [x] Unit and integration test suites (Vitest)
- [x] GitHub Actions CI pipeline

## Phase 2: Webhooks & Ecosystem Support

- [ ] Native webhook signature validation middleware (Express/Fastify)
- [ ] Optional discord.js plugin for automatic stat posting
- [ ] Webhook event types and payload interfaces

## Phase 3: Real-Time & Analytics

- [ ] Analytics API — fetch pageviews, click-through rates on bot pages
- [ ] WebSocket support — live vote event subscriptions
- [ ] CLI tool for quick API interaction from terminal
