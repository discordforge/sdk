/**
 * Type definitions for the DiscordForge Developer API.
 *
 * Used by `@discordforgejs/sdk`. Install this package on its own if you call
 * the API with your own HTTP client and only need the request and response shapes.
 *
 * Response types match the JSON the API returns, so field names follow the
 * API: newer v1 endpoints use `snake_case`, older ones use `camelCase`.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Structured error body returned by the DiscordForge API on failure. */
export interface APIErrorBody {
    error?: string;
    message?: string;
    code?: string;
    errors?: Record<string, string[]>;
}

/** Generic `{ success, message }` acknowledgement. */
export interface SuccessResponse {
    success: boolean;
    message?: string;
}

// ---------------------------------------------------------------------------
// Stats — POST /api/v1/bots/stats
// ---------------------------------------------------------------------------

/**
 * Bot statistics accepted by `ForgeClient.postStats()`.
 * The SDK converts these to the `snake_case` body the API expects ({@link BotStatsRequestBody}).
 *
 * @example
 * ```js
 * await client.postStats({ serverCount: 1500, shardCount: 2 });
 * ```
 */
export interface BotStats {
    /** Total number of guilds (servers) the bot is in. */
    serverCount: number;
    /** Total number of shards the bot is running. */
    shardCount?: number;
    /** Total number of users the bot can see. */
    userCount?: number;
    /** Current number of active voice connections. */
    voiceConnections?: number;
}

/** Raw request body for `POST /api/v1/bots/stats`. */
export interface BotStatsRequestBody {
    server_count: number;
    shard_count?: number;
    user_count?: number;
    voice_connections?: number;
}

/** Response from `POST /api/v1/bots/stats`. */
export type BotStatsResponse = SuccessResponse;

// ---------------------------------------------------------------------------
// Heartbeat — GET|POST /api/v1/bots/heartbeat
// ---------------------------------------------------------------------------

/** Presence reported with a heartbeat. Defaults to `"online"`. */
export type HeartbeatStatus = "online" | "idle" | "dnd";

/** Request body for `POST /api/v1/bots/heartbeat`. */
export interface HeartbeatRequest {
    status?: HeartbeatStatus;
}

/**
 * Response from the heartbeat endpoint. Heartbeats sent less than ~4.5 minutes
 * apart update presence but are not counted as a new uptime check.
 */
export interface HeartbeatResponse {
    success: boolean;
    /** `"Heartbeat recorded successfully"` or `"Heartbeat received (rate-limited)"`. */
    message: string;
    status: HeartbeatStatus;
    /** Total uptime checks recorded for the bot. */
    uptimeChecks: number;
    /** Uptime checks where the bot was online. */
    uptimeOnline: number;
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/** Response from `GET /api/bots/:id/votes/check`. */
export interface VoteMetadata {
    /** Whether the user has voted in the last 8 hours. */
    hasVoted: boolean;
    /** ISO-8601 timestamp of the last vote, or `null`. */
    votedAt?: string | null;
    /** ISO-8601 timestamp of when the user can vote again, or `null`. */
    nextVoteAt?: string | null;
}

/** Query options for `GET /api/v1/bots/:id/votes`. */
export interface VoteListOptions {
    /** Page size, 1–1000. Defaults to `100`. */
    limit?: number;
    /** Only return votes older than this time (cursor for the next page). */
    before?: string | Date;
    /** Return `timestamp` as Unix seconds instead of ISO-8601. */
    epoch?: boolean;
}

/** One vote in the vote history. */
export interface BotVote {
    /** Discord user ID of the voter. */
    user_id: string;
    /** ISO-8601 string, or Unix seconds when `epoch` is set. */
    timestamp: string | number;
}

/** Response from `GET /api/v1/bots/:id/votes`. Newest votes first. */
export interface BotVoteList {
    votes: BotVote[];
    /** Whether older votes exist. Pass the last vote's `timestamp` as `before` to get them. */
    has_more: boolean;
}

// ---------------------------------------------------------------------------
// Reviews — GET /api/v1/bots/:id/reviews
// ---------------------------------------------------------------------------

/** Sort order for reviews. */
export type ReviewSort = "recent" | "rating";

/** Query options for `GET /api/v1/bots/:id/reviews`. */
export interface ReviewListOptions {
    /** Page size, 1–50. Defaults to `10`. */
    limit?: number;
    /** `"recent"` (default) or `"rating"` (highest first). */
    sort?: ReviewSort;
}

/** A review left on your bot. */
export interface BotReview {
    id: string;
    /** 1–5 stars. */
    rating: number;
    comment: string;
    created_at: string;
    user: {
        id: string;
        name: string | null;
        avatar: string | null;
    };
    /** Your public reply, if you posted one. */
    owner_reply: {
        comment: string;
        created_at: string | null;
    } | null;
}

/** Response from `GET /api/v1/bots/:id/reviews`. */
export interface BotReviewList {
    reviews: BotReview[];
    /** Average rating rounded to one decimal, `0` when there are no reviews. */
    average: number;
    /** Total number of reviews. */
    total: number;
}

// ---------------------------------------------------------------------------
// Uptime — GET /api/v1/bots/:id/uptime
// ---------------------------------------------------------------------------

/** Query options for `GET /api/v1/bots/:id/uptime`. */
export interface UptimeOptions {
    /** Days to look back, 1–90. Defaults to `30`. */
    days?: number;
}

/** Uptime for a single day. */
export interface BotUptimeDay {
    /** `YYYY-MM-DD` (UTC). */
    date: string;
    online: boolean;
    checks: number;
    online_checks: number;
}

/** Response from `GET /api/v1/bots/:id/uptime`. */
export interface BotUptime {
    /** Percentage of online checks over the range, one decimal. */
    uptime_percentage: number;
    /** How uptime is tracked, e.g. `"PUSH"` for heartbeats. */
    method: string;
    /** One entry per day, oldest first. Days without data are offline with zero checks. */
    days: BotUptimeDay[];
    days_requested: number;
    days_with_data: number;
    total_checks: number;
    total_online: number;
}

// ---------------------------------------------------------------------------
// Analytics — GET /api/v1/bots/:id/analytics
// ---------------------------------------------------------------------------

/** Query options for `GET /api/v1/bots/:id/analytics`. */
export interface AnalyticsOptions {
    /** Days to look back, 1–90. Defaults to `30`. */
    days?: number;
}

/** Counts for one UTC day. */
export interface BotAnalyticsDay {
    /** `YYYY-MM-DD` (UTC). */
    date: string;
    views: number;
    invite_clicks: number;
    votes: number;
}

/** Response from `GET /api/v1/bots/:id/analytics`. */
export interface BotAnalytics {
    days_requested: number;
    /** Start of the first day in the range (UTC midnight). */
    since: string;
    totals: {
        views: number;
        invite_clicks: number;
        votes: number;
        /** Invite clicks as a percentage of views, one decimal. `0` without views. */
        click_through_rate: number;
    };
    /** One entry per day, oldest first. */
    daily: BotAnalyticsDay[];
}

// ---------------------------------------------------------------------------
// Status banner — GET|PUT|DELETE /api/v1/bots/status
// ---------------------------------------------------------------------------

/** Operational status shown in the banner on your public bot page. */
export type BotOperationalStatus =
    | "operational"
    | "degraded"
    | "partial_outage"
    | "major_outage"
    | "maintenance";

/** Request body for `PUT /api/v1/bots/status`. */
export interface BotStatusUpdateRequest {
    status: BotOperationalStatus;
    /** Optional message, up to 500 characters. */
    message?: string | null;
    /** Set to `false` to save the status without showing the banner. Defaults to `true`. */
    enabled?: boolean;
}

/** Current status banner. */
export interface BotStatusNotice {
    /** Whether the banner is visible on the bot page. */
    enabled: boolean;
    status: BotOperationalStatus;
    message: string | null;
    updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Bump cooldown — GET /api/v1/bump/cooldown
// ---------------------------------------------------------------------------

/** Response from `GET /api/v1/bump/cooldown`. */
export interface BumpCooldown {
    canBump: boolean;
    /** ISO-8601 time the cooldown ends, or `null` when the user can bump now. */
    cooldownExpiresAt: string | null;
    /** The user's cooldown tier. */
    tierLabel: string;
    /** Length of the user's cooldown in milliseconds. */
    cooldownMs: number;
}

// ---------------------------------------------------------------------------
// Bot info — GET /api/bots/:id
// ---------------------------------------------------------------------------

/** Public bot information from `GET /api/bots/:id`. */
export interface BotInfo {
    /** DiscordForge's internal bot ID. */
    id: string;
    name: string;
    prefix: string | null;
    shortDescription: string;
    avatar: string | null;
    voteCount: number;
    serverCount: number;
    /** Comma-separated tags. */
    tags: string;
    owner: {
        id: string;
        name: string | null;
    };
    /** Average review rating, or `null` when there are no reviews. */
    averageRating: number | null;
    reviewCount: number;
}

// ---------------------------------------------------------------------------
// Commands — POST /api/v1/bots/commands
// ---------------------------------------------------------------------------

/** Response from `POST /api/v1/bots/commands`. */
export interface SyncCommandsResponse {
    success: boolean;
    /** Commands stored after subcommands are flattened. Capped at 200. */
    synced: number;
}

/** A custom command format for `ForgeClient.syncCommands()`. */
export interface CustomCommand {
    name: string;
    description: string;
    usage?: string;
    category?: string;
}

/** A Discord API-compatible application command object. Subcommands are flattened by DiscordForge. */
export interface DiscordCommand {
    name: string;
    description: string;
    type?: number;
    options?: any[];
    [key: string]: any;
}

/** Either a {@link CustomCommand} or a native {@link DiscordCommand}. */
export type SyncCommand = CustomCommand | DiscordCommand;

// ---------------------------------------------------------------------------
// Listing — PATCH /api/v1/bots/listing
// ---------------------------------------------------------------------------

/** Fields accepted by `PATCH /api/v1/bots/listing`. */
export interface BotListingUpdateRequest {
    prefix?: string;
    shortDescription?: string;
    description?: string;
    /** Comma-separated tag names, for example `"moderation, utility"`. */
    tags?: string;
    /** Discord invite URL, or an empty string to clear it. */
    supportServer?: string;
    /** Website URL, or an empty string to clear it. */
    website?: string;
    /** JSON string of social links, for example `[{"type":"github","url":"https://github.com/example"}]`. */
    socials?: string;
    /** Comma-separated language codes, for example `"en, pl"`. */
    languages?: string;
    hasPaidFeatures?: boolean;
    paidFeaturesAvailable?: boolean;
    webInterface?: boolean;
    installableAsUserApp?: boolean;
}

/** Public listing returned by `PATCH /api/v1/bots/listing`. */
export interface BotListing {
    id: string;
    clientId: string;
    prefix: string | null;
    shortDescription: string;
    description: string;
    tags: string;
    supportServer: string | null;
    website: string | null;
    socials: string | null;
    languages: string;
    hasPaidFeatures: boolean;
    paidFeaturesAvailable: boolean;
    webInterface: boolean;
    installableAsUserApp: boolean;
}

/** Response from `PATCH /api/v1/bots/listing`. */
export type BotListingUpdateResponse = BotListing;

// ---------------------------------------------------------------------------
// Announcements — POST /api/v1/bots/announcements
// ---------------------------------------------------------------------------

/** Allowed announcement categories. */
export type BotAnnouncementType = "UPDATE" | "MAINTENANCE" | "NEWS" | "EVENT" | "GENERAL";

/** Request body for `POST /api/v1/bots/announcements`. Images are not supported. */
export interface BotAnnouncementCreateRequest {
    title?: string;
    content: string;
    type?: BotAnnouncementType;
}

/** Announcement returned by DiscordForge. */
export interface BotAnnouncement {
    id: string;
    title: string | null;
    content: string;
    type: BotAnnouncementType;
    createdAt: string;
    updatedAt: string;
    botId: string | null;
}

/** Response from `POST /api/v1/bots/announcements`. */
export type BotAnnouncementCreateResponse = BotAnnouncement;

// ---------------------------------------------------------------------------
// Legacy vote webhook
// ---------------------------------------------------------------------------

/**
 * Body of the legacy vote webhook. DiscordForge sends it with
 * `Authorization: <your webhook secret>`.
 */
export interface LegacyVoteWebhookPayload {
    /** Discord user ID of the voter. */
    id: string;
    /** Username at the time of the vote. Can change; don't use it as an identifier. */
    username: string;
    avatar: string;
    admin: boolean;
    /** The voter's votes for your bot in the last 7 days. */
    weeklyVotes?: number;
    /** The voter's lifetime votes for your bot. */
    totalVotes?: number;
    /** `true` when sent by the dashboard's Test Webhook button. */
    isTest: boolean;
}

// ---------------------------------------------------------------------------
// Webhooks v2
// ---------------------------------------------------------------------------

/** Event names delivered by Webhooks v2. */
export type WebhookEventType =
    | "vote.created"
    | "review.created"
    | "milestone.votes"
    | "follower.new"
    | "boost.expiring";

/** Fields present on test deliveries sent from the dashboard. */
export interface WebhookTestFields {
    test?: true;
    source?: "dashboard";
}

/** `vote.created` data. */
export interface VoteCreatedData extends WebhookTestFields {
    voter_id: string;
    streak: number;
    total_votes: number;
    weekly_votes: number;
}

/** `review.created` data. */
export interface ReviewCreatedData extends WebhookTestFields {
    review_id: string;
    reviewer_id: string;
    rating: number;
    /** First 240 characters of the review. */
    snippet: string;
    review_count: number;
}

/** `milestone.votes` data. */
export interface VoteMilestoneData extends WebhookTestFields {
    threshold: number;
    total_votes: number;
}

/** `follower.new` data. */
export interface FollowerNewData extends WebhookTestFields {
    follower_id: string;
    follower_name: string | null;
    follower_count: number;
}

/** `boost.expiring` data. Sent 24 hours before a boost ends. */
export interface BoostExpiringData extends WebhookTestFields {
    expires_at: string;
    hours_remaining: number;
    target_type: string;
    target_id: string;
}

/** Maps each event name to its `data` shape. */
export interface WebhookEventDataMap {
    "vote.created": VoteCreatedData;
    "review.created": ReviewCreatedData;
    "milestone.votes": VoteMilestoneData;
    "follower.new": FollowerNewData;
    "boost.expiring": BoostExpiringData;
}

/** Envelope of a single Webhooks v2 event type. */
export interface WebhookEventOf<T extends WebhookEventType> {
    /** Stable event ID (`evt_…`). Use it to ignore duplicate deliveries. */
    id: string;
    type: T;
    /** ISO-8601 time in UTC. */
    created_at: string;
    /** Your bot's Discord client ID. */
    bot_id: string;
    data: WebhookEventDataMap[T];
}

/**
 * Any Webhooks v2 event. Narrow it with `event.type`:
 *
 * ```ts
 * if (event.type === "vote.created") event.data.voter_id;
 * ```
 */
export type WebhookEvent = { [T in WebhookEventType]: WebhookEventOf<T> }[WebhookEventType];
