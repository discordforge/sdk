import { ForgeAPIError } from "./errors";
import { SDK_VERSION } from "./version";
import { LiveEventStream } from "./events";
import type {
    ClientOptions,
    BotStats,
    BotStatsRequestBody,
    BotStatsResponse,
    HeartbeatStatus,
    HeartbeatResponse,
    VoteMetadata,
    VoteListOptions,
    BotVote,
    BotVoteList,
    ReviewListOptions,
    BotReviewList,
    UptimeOptions,
    BotUptime,
    AnalyticsOptions,
    BotAnalytics,
    LiveEventsOptions,
    WebhookEventType,
    BotOperationalStatus,
    BotStatusUpdateRequest,
    BotStatusNotice,
    BumpCooldown,
    BotInfo,
    SyncCommand,
    SyncCommandsResponse,
    BotListingUpdateRequest,
    BotListingUpdateResponse,
    BotAnnouncementCreateRequest,
    BotAnnouncementCreateResponse
} from "./types";

const DEFAULT_OPTIONS: Required<ClientOptions> = {
    baseURL: "https://discordforge.org",
    timeout: 10_000,
    retries: 3
};

const V1 = "/api/v1";

/** Path segment used for "the bot this API key belongs to" on `/api/v1/bots/:id/...` routes. */
const SELF = "@me";

const LISTING_UPDATE_FIELDS = [
    "prefix",
    "shortDescription",
    "description",
    "tags",
    "supportServer",
    "website",
    "socials",
    "languages",
    "hasPaidFeatures",
    "paidFeaturesAvailable",
    "webInterface",
    "installableAsUserApp"
] as const satisfies ReadonlyArray<keyof BotListingUpdateRequest>;

const ANNOUNCEMENT_TYPES = new Set(["UPDATE", "MAINTENANCE", "NEWS", "EVENT", "GENERAL"]);
const EVENT_TYPES = new Set<WebhookEventType>([
    "vote.created",
    "review.created",
    "milestone.votes",
    "follower.new",
    "boost.expiring"
]);
const HEARTBEAT_STATUSES = new Set<HeartbeatStatus>(["online", "idle", "dnd"]);
const OPERATIONAL_STATUSES = new Set<BotOperationalStatus>([
    "operational",
    "degraded",
    "partial_outage",
    "major_outage",
    "maintenance"
]);

type AuthMode = "bearer" | "raw" | "none";
type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
    body?: unknown;
    query?: Query;
    auth?: AuthMode;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function clampInt(value: number | undefined, min: number, max: number, name: string): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * DiscordForge API client.
 *
 * Every v1 call authenticates with `Authorization: Bearer <apiKey>`. The API key
 * identifies your bot, so most methods don't need `botId`; only `checkVote()`
 * and `getBot()` do.
 *
 * @example
 * ```js
 * const { ForgeClient } = require("@discordforgejs/sdk");
 *
 * const client = new ForgeClient(process.env.DISCORDFORGE_API_KEY, "YOUR_BOT_ID");
 * await client.postStats({ serverCount: 1500 });
 * const { hasVoted } = await client.checkVote("USER_ID");
 * ```
 *
 * @see {@link https://discordforge.org/support/developers | API reference}
 */
export class ForgeClient {
    private readonly apiKey: string;
    private readonly botId?: string;
    private readonly options: Required<ClientOptions>;

    constructor(apiKey: string, botId?: string, options?: ClientOptions) {
        if (!apiKey || typeof apiKey !== "string") throw new Error("ForgeClient requires a valid apiKey string.");

        this.apiKey = apiKey;
        this.botId = botId || undefined;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.options.baseURL = this.options.baseURL.replace(/\/+$/, "");
    }

    // -----------------------------------------------------------------------
    // Stats & presence
    // -----------------------------------------------------------------------

    /**
     * Post your bot's statistics.
     *
     * Rate limit: **1 request / 5 minutes**.
     *
     * @example
     * ```js
     * await client.postStats({ serverCount: 1500, shardCount: 2, userCount: 75000 });
     * ```
     */
    public async postStats(stats: BotStats): Promise<BotStatsResponse> {
        if (!isPlainObject(stats)) throw new Error("stats must be a valid object");
        if (typeof stats.serverCount !== "number" || !Number.isFinite(stats.serverCount)) {
            throw new Error("stats.serverCount must be a number");
        }

        const body: BotStatsRequestBody = {
            server_count: stats.serverCount,
            shard_count: stats.shardCount,
            user_count: stats.userCount,
            voice_connections: stats.voiceConnections
        };
        return this.request<BotStatsResponse>("POST", `${V1}/bots/stats`, { body });
    }

    /**
     * Send a heartbeat so DiscordForge can track your bot's uptime and presence.
     * Send one every 5 minutes; heartbeats closer together update presence but
     * don't count as a new uptime check. The listing must be approved.
     *
     * @param status Presence to show. Defaults to `"online"`.
     *
     * @example
     * ```js
     * setInterval(() => client.heartbeat().catch(console.error), 5 * 60_000);
     * ```
     */
    public async heartbeat(status?: HeartbeatStatus): Promise<HeartbeatResponse> {
        if (status !== undefined && !HEARTBEAT_STATUSES.has(status)) {
            throw new Error("status must be one of online, idle, or dnd");
        }
        return this.request<HeartbeatResponse>("POST", `${V1}/bots/heartbeat`, {
            body: status ? { status } : {}
        });
    }

    // -----------------------------------------------------------------------
    // Votes
    // -----------------------------------------------------------------------

    /**
     * Check whether a user voted for your bot in the last 8 hours. Requires `botId`.
     *
     * Rate limit: **60 requests / minute**.
     *
     * @example
     * ```js
     * const vote = await client.checkVote("USER_ID");
     * if (vote.hasVoted) console.log("Thanks for voting!");
     * ```
     */
    public async checkVote(userId: string): Promise<VoteMetadata> {
        const botId = this.requireBotId("checkVote");
        if (!userId || typeof userId !== "string") throw new Error("userId must be a valid string");
        // This endpoint has no v1 replacement yet and expects the raw API key.
        return this.request<VoteMetadata>("GET", `/api/bots/${encodeURIComponent(botId)}/votes/check`, {
            query: { userId },
            auth: "raw"
        });
    }

    /**
     * Get one page of your bot's vote history, newest first.
     *
     * @example
     * ```js
     * const { votes, has_more } = await client.getVotes({ limit: 500 });
     * ```
     */
    public async getVotes(options: VoteListOptions = {}): Promise<BotVoteList> {
        const before = options.before instanceof Date ? options.before.toISOString() : options.before;
        if (before !== undefined && Number.isNaN(new Date(before).getTime())) {
            throw new Error("before must be a valid date or ISO-8601 string");
        }
        return this.request<BotVoteList>("GET", `${V1}/bots/${this.selfId()}/votes`, {
            query: {
                limit: clampInt(options.limit, 1, 1000, "limit"),
                before,
                epoch: options.epoch ? true : undefined
            }
        });
    }

    /**
     * Iterate over your whole vote history, newest first, fetching pages as needed.
     *
     * @example
     * ```js
     * for await (const vote of client.iterateVotes()) {
     *   console.log(vote.user_id, vote.timestamp);
     * }
     * ```
     */
    public async *iterateVotes(options: Omit<VoteListOptions, "epoch"> = {}): AsyncGenerator<BotVote, void, undefined> {
        let before = options.before;
        while (true) {
            const page = await this.getVotes({ limit: options.limit ?? 1000, before });
            for (const vote of page.votes) yield vote;
            const last = page.votes[page.votes.length - 1];
            if (!page.has_more || !last) return;
            before = String(last.timestamp);
        }
    }

    // -----------------------------------------------------------------------
    // Reviews & uptime
    // -----------------------------------------------------------------------

    /**
     * Get reviews left on your bot, with the average rating and total count.
     *
     * @example
     * ```js
     * const { reviews, average, total } = await client.getReviews({ sort: "rating", limit: 5 });
     * ```
     */
    public async getReviews(options: ReviewListOptions = {}): Promise<BotReviewList> {
        if (options.sort !== undefined && options.sort !== "recent" && options.sort !== "rating") {
            throw new Error('sort must be "recent" or "rating"');
        }
        return this.request<BotReviewList>("GET", `${V1}/bots/${this.selfId()}/reviews`, {
            query: { limit: clampInt(options.limit, 1, 50, "limit"), sort: options.sort }
        });
    }

    /**
     * Get your bot's uptime percentage and day-by-day checks (from heartbeats).
     *
     * @example
     * ```js
     * const uptime = await client.getUptime({ days: 7 });
     * console.log(`${uptime.uptime_percentage}% over 7 days`);
     * ```
     */
    public async getUptime(options: UptimeOptions = {}): Promise<BotUptime> {
        return this.request<BotUptime>("GET", `${V1}/bots/${this.selfId()}/uptime`, {
            query: { days: clampInt(options.days, 1, 90, "days") }
        });
    }

    /**
     * Get page views, invite clicks and votes, with totals, click-through rate
     * and a day-by-day breakdown (UTC days, oldest first).
     *
     * Rate limit: **60 requests / minute**.
     *
     * @example
     * ```js
     * const { totals, daily } = await client.getAnalytics({ days: 7 });
     * console.log(`${totals.views} views, ${totals.click_through_rate}% clicked invite`);
     * ```
     */
    public async getAnalytics(options: AnalyticsOptions = {}): Promise<BotAnalytics> {
        return this.request<BotAnalytics>("GET", `${V1}/bots/${this.selfId()}/analytics`, {
            query: { days: clampInt(options.days, 1, 90, "days") }
        });
    }

    // -----------------------------------------------------------------------
    // Live events
    // -----------------------------------------------------------------------

    /**
     * Subscribe to live events (votes, reviews, milestones, followers, expiring
     * boosts) without hosting a webhook endpoint. Uses the same payloads as
     * Webhooks v2. Reconnects and resumes automatically until you call `close()`.
     *
     * @example
     * ```js
     * const stream = client.events({ types: ["vote.created", "review.created"] });
     * stream.on("vote.created", (event) => rewardVoter(event.data.voter_id));
     * stream.on("error", (err) => console.error(err));
     *
     * // or
     * for await (const event of client.events()) console.log(event.type);
     * ```
     */
    public events(options: LiveEventsOptions = {}): LiveEventStream {
        if (options.types !== undefined) {
            if (!Array.isArray(options.types) || options.types.some((type) => !EVENT_TYPES.has(type))) {
                throw new Error(`types must only contain: ${[...EVENT_TYPES].join(", ")}`);
            }
        }
        const types = options.types?.length ? options.types.join(",") : undefined;

        return new LiveEventStream(
            (lastEventId, signal) => {
                const headers = new Headers({
                    "Accept": "text/event-stream",
                    "Authorization": `Bearer ${this.apiKey}`,
                    "User-Agent": `DiscordForge-NodeSDK/${SDK_VERSION}`
                });
                if (lastEventId) headers.set("Last-Event-ID", lastEventId);
                return fetch(this.buildURL(`${V1}/bots/events`, { types }), { headers, signal })
                    .catch((error) => { throw this.sanitizeError(error); });
            },
            (response) => this.toAPIError(response),
            options
        );
    }

    // -----------------------------------------------------------------------
    // Status banner
    // -----------------------------------------------------------------------

    /** Get the status banner currently shown on your bot page. */
    public async getStatus(): Promise<BotStatusNotice> {
        return this.request<BotStatusNotice>("GET", `${V1}/bots/status`);
    }

    /**
     * Set the status banner on your bot page. The banner is shown for every
     * status, `"operational"` included, unless you pass `enabled: false`.
     * Use {@link ForgeClient.clearStatus} to hide it once things recover.
     *
     * @example
     * ```js
     * await client.setStatus({ status: "degraded", message: "Music is slow on EU shards" });
     * // later, when it's fixed
     * await client.clearStatus();
     * ```
     */
    public async setStatus(update: BotStatusUpdateRequest): Promise<BotStatusNotice> {
        if (!isPlainObject(update)) throw new Error("status update must be a valid object");
        if (!OPERATIONAL_STATUSES.has(update.status)) {
            throw new Error("status must be one of operational, degraded, partial_outage, major_outage, or maintenance");
        }
        if (update.message != null && (typeof update.message !== "string" || update.message.length > 500)) {
            throw new Error("message must be a string of up to 500 characters");
        }

        const body: BotStatusUpdateRequest = { status: update.status };
        if (update.message !== undefined) body.message = update.message;
        if (update.enabled !== undefined) body.enabled = update.enabled;
        return this.request<BotStatusNotice>("PUT", `${V1}/bots/status`, { body });
    }

    /** Clear the status banner (back to operational, banner hidden). */
    public async clearStatus(): Promise<BotStatusNotice> {
        return this.request<BotStatusNotice>("DELETE", `${V1}/bots/status`);
    }

    // -----------------------------------------------------------------------
    // Bump cooldown
    // -----------------------------------------------------------------------

    /**
     * Check whether a user can bump a server yet, for bots that run their own
     * bump command.
     *
     * Rate limit: **60 requests / minute**.
     *
     * @example
     * ```js
     * const { canBump, cooldownExpiresAt } = await client.getBumpCooldown(userId, guildId);
     * ```
     */
    public async getBumpCooldown(userId: string, serverId: string): Promise<BumpCooldown> {
        if (!userId || typeof userId !== "string") throw new Error("userId must be a valid string");
        if (!serverId || typeof serverId !== "string") throw new Error("serverId must be a valid string");
        return this.request<BumpCooldown>("GET", `${V1}/bump/cooldown`, { query: { userId, serverId } });
    }

    // -----------------------------------------------------------------------
    // Listing
    // -----------------------------------------------------------------------

    /**
     * Fetch your bot's public profile. Requires `botId`. No authentication is sent.
     *
     * @example
     * ```js
     * const bot = await client.getBot();
     * console.log(`${bot.name} has ${bot.voteCount} votes`);
     * ```
     */
    public async getBot(): Promise<BotInfo> {
        const botId = this.requireBotId("getBot");
        return this.request<BotInfo>("GET", `/api/bots/${encodeURIComponent(botId)}`, { auth: "none" });
    }

    /**
     * Sync your bot's commands to its DiscordForge page. Replaces the current list.
     * Accepts up to **200** commands; Discord subcommands are flattened.
     *
     * @example
     * ```js
     * await client.syncCommands([
     *   { name: "ping", description: "Check latency" },
     *   { name: "play", description: "Play a song", category: "Music" }
     * ]);
     * ```
     */
    public async syncCommands(commands: SyncCommand[]): Promise<SyncCommandsResponse> {
        if (!Array.isArray(commands)) throw new Error("commands must be an array");
        if (commands.length > 200) throw new Error("You can only sync up to 200 commands at once.");
        return this.request<SyncCommandsResponse>("POST", `${V1}/bots/commands`, { body: { commands } });
    }

    /**
     * Update editable fields on your bot's listing. Unknown fields are dropped.
     * The listing must be approved.
     */
    public async updateListing(listing: BotListingUpdateRequest): Promise<BotListingUpdateResponse> {
        if (!isPlainObject(listing)) throw new Error("listing must be a valid object");

        const body: Partial<BotListingUpdateRequest> = {};
        for (const field of LISTING_UPDATE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(listing, field)) {
                (body as Record<string, unknown>)[field] = listing[field];
            }
        }
        return this.request<BotListingUpdateResponse>("PATCH", `${V1}/bots/listing`, { body });
    }

    /** Publish an announcement on your bot page. Images are not supported. */
    public async publishAnnouncement(announcement: BotAnnouncementCreateRequest): Promise<BotAnnouncementCreateResponse> {
        if (!isPlainObject(announcement)) throw new Error("announcement must be a valid object");
        if (!announcement.content || typeof announcement.content !== "string") {
            throw new Error("announcement.content must be a valid string");
        }
        if (announcement.type && !ANNOUNCEMENT_TYPES.has(announcement.type)) {
            throw new Error("announcement.type must be one of UPDATE, MAINTENANCE, NEWS, EVENT, or GENERAL");
        }

        const body: BotAnnouncementCreateRequest = { content: announcement.content };
        if (Object.prototype.hasOwnProperty.call(announcement, "title")) body.title = announcement.title;
        if (Object.prototype.hasOwnProperty.call(announcement, "type")) body.type = announcement.type;
        return this.request<BotAnnouncementCreateResponse>("POST", `${V1}/bots/announcements`, { body });
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private requireBotId(method: string): string {
        if (!this.botId) throw new Error(`${method}() requires a botId. Pass it as the second argument to ForgeClient.`);
        return this.botId;
    }

    /** The API key already identifies the bot; the path id is informational. */
    private selfId(): string {
        return encodeURIComponent(this.botId ?? SELF);
    }

    private buildURL(path: string, query?: Query): string {
        const url = new URL(`${this.options.baseURL}${path}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined) url.searchParams.set(key, String(value));
            }
        }
        return url.toString();
    }

    private redactApiKey(value: string): string {
        return value.split(this.apiKey).join("[REDACTED]");
    }

    private sanitizeForError(value: unknown): unknown {
        if (typeof value === "string") return this.redactApiKey(value);
        if (Array.isArray(value)) return value.map(item => this.sanitizeForError(item));
        if (isPlainObject(value)) {
            const sanitized: Record<string, unknown> = {};
            for (const [key, nested] of Object.entries(value)) sanitized[key] = this.sanitizeForError(nested);
            return sanitized;
        }
        return value;
    }

    private sanitizeError(error: unknown): Error {
        if (error instanceof Error) {
            const sanitized = new Error(this.redactApiKey(error.message));
            sanitized.name = error.name;
            return sanitized;
        }
        return new Error(this.redactApiKey(String(error)));
    }

    private async toAPIError(response: Response): Promise<ForgeAPIError> {
        let body: unknown = await response.text().catch(() => "");
        try { body = JSON.parse(body as string); } catch { /* keep raw text */ }
        return new ForgeAPIError(
            `Forge API Request Failed: ${response.status} ${response.statusText}`,
            response.status,
            this.sanitizeForError(body),
            response.headers
        );
    }

    private async request<T>(
        method: string,
        path: string,
        { body, query, auth = "bearer" }: RequestOptions = {},
        retriesLeft = this.options.retries
    ): Promise<T> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

        const headers = new Headers({
            "Accept": "application/json",
            "User-Agent": `DiscordForge-NodeSDK/${SDK_VERSION}`
        });
        if (body !== undefined) headers.set("Content-Type", "application/json");
        if (auth !== "none") headers.set("Authorization", auth === "bearer" ? `Bearer ${this.apiKey}` : this.apiKey);

        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);

        const retry = async (waitMs: number) => {
            await new Promise(resolve => setTimeout(resolve, waitMs));
            return this.request<T>(method, path, { body, query, auth }, retriesLeft - 1);
        };

        try {
            const response = await fetch(this.buildURL(path, query), init);
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429 && retriesLeft > 0) {
                    const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
                    return retry(Number.isFinite(retryAfter) ? retryAfter * 1000 : 3000);
                }

                throw await this.toAPIError(response);
            }

            if (response.status === 204) return {} as T;
            return await response.json() as T;
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error instanceof ForgeAPIError) throw error;
            if (error?.name === "AbortError") throw new Error(`Request to ${path} timed out after ${this.options.timeout}ms.`);
            if (retriesLeft > 0) return retry(3000);
            throw this.sanitizeError(error);
        }
    }
}
