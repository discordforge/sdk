import { ForgeAPIError } from "./errors";
import {
    ClientOptions,
    BotStats,
    VoteMetadata,
    BotInfo,
    SyncCommand,
    SyncCommandsResponse,
    BotListingUpdateRequest,
    BotListingUpdateResponse,
    BotAnnouncementCreateRequest,
    BotAnnouncementCreateResponse
} from "./types";

const DEFAULT_OPTIONS: Required<ClientOptions> = {
    version: "v1",
    timeout: 10000,
    retries: 3
};

const API_PREFIX = "/api/v1";

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

const ANNOUNCEMENT_TYPES = new Set([
    "UPDATE",
    "MAINTENANCE",
    "NEWS",
    "EVENT",
    "GENERAL"
]);

/**
 * DiscordForge API client.
 *
 * @example
 * ```js
 * const { ForgeClient } = require("discordforge-sdk");
 *
 * // API key only – enough for postStats() and syncCommands()
 * const client = new ForgeClient("Your API Key");
 * await client.postStats({ serverCount: 1500 });
 *
 * // With botId – required for checkVote() and getBot()
 * const client2 = new ForgeClient("Your API Key", "Your Bot ID");
 * const bot = await client2.getBot();
 * ```
 *
 * @link {@link https://discordforge.org/support/developers | API Reference}
 */
export class ForgeClient {
    private readonly apiKey: string;
    private readonly botId?: string;
    private readonly options: Required<ClientOptions>;
    private readonly baseURL = "https://discordforge.org";

    constructor(apiKey: string, botId?: string, options?: ClientOptions) {
        if (!apiKey || typeof apiKey !== 'string') throw new Error("ForgeClient requires a valid apiKey string.");

        this.apiKey = apiKey;
        this.botId = botId;
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    private get authorizationHeader(): string {
        return `Bearer ${this.apiKey}`;
    }

    private redactApiKey(value: string): string {
        return value.split(this.apiKey).join("[REDACTED]");
    }

    private sanitizeForError(value: unknown): unknown {
        if (typeof value === "string") return this.redactApiKey(value);
        if (Array.isArray(value)) return value.map(item => this.sanitizeForError(item));
        if (value && typeof value === "object") {
            const sanitized: Record<string, unknown> = {};
            for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
                sanitized[key] = this.sanitizeForError(nestedValue);
            }
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

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        retriesLeft = this.options.retries,
        authorization: "bearer" | "raw" | "none" = "bearer",
    ): Promise<T> {
        const url = `${this.baseURL}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

        const headers = new Headers({
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "DiscordForge-NodeSDK/1.0.0"
        });
        if (authorization !== "none") {
            headers.set("Authorization", authorization === "bearer" ? this.authorizationHeader : this.apiKey);
        }

        const fetchOptions: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) fetchOptions.body = JSON.stringify(body);

        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429 && retriesLeft > 0) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
                    await new Promise(r => setTimeout(r, waitTime));
                    return this.request<T>(method, path, body, retriesLeft - 1, authorization);
                }

                let errorBody: unknown = await response.text();
                try { errorBody = JSON.parse(errorBody as string); } catch { /* raw text */ }
                errorBody = this.sanitizeForError(errorBody);

                throw new ForgeAPIError(
                    `Forge API Request Failed: ${response.status} ${response.statusText}`,
                    response.status, errorBody, response.headers
                );
            }

            if (response.status === 204) return {} as T;
            return await response.json() as T;

        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error(`Request to ${path} timed out after ${this.options.timeout}ms.`);
            if (error instanceof ForgeAPIError) throw error;
            if (retriesLeft > 0) {
                await new Promise(r => setTimeout(r, 3000));
                return this.request<T>(method, path, body, retriesLeft - 1, authorization);
            }
            throw this.sanitizeError(error);
        }
    }

    /**
     * Post your bot's statistics to DiscordForge.
     *
     * Rate limit: **1 request / 5 minutes**.
     *
     * @example
     * ```js
     * await client.postStats({
     *   serverCount: 1500,
     *   shardCount: 2,
     *   userCount: 75000,
     *   voiceConnections: 10
     * });
     * ```
     */
    public async postStats(stats: BotStats): Promise<void> {
        const payload = {
            server_count: stats.serverCount,
            shard_count: stats.shardCount,
            user_count: stats.userCount,
            voice_connections: stats.voiceConnections
        };
        await this.request<void>("POST", `${API_PREFIX}/bots/stats`, payload);
    }

    /**
     * Check if a user has voted for your bot in the last 8 hours.
     *
     * Rate limit: **60 requests / minute**.
     *
     * @example
     * ```js
     * const vote = await client.checkVote("USER_ID");
     * if (vote.hasVoted) {
     *   console.log("Thanks for voting!");
     * }
     * ```
     */
    public async checkVote(userId: string): Promise<VoteMetadata> {
        if (!this.botId) throw new Error("checkVote() requires a botId. Pass it as the second argument to ForgeClient.");
        if (!userId || typeof userId !== 'string') throw new Error("userId must be a valid string");
        return await this.request<VoteMetadata>(
            "GET",
            `/api/bots/${encodeURIComponent(this.botId)}/votes/check?userId=${encodeURIComponent(userId)}`,
            undefined,
            this.options.retries,
            "raw",
        );
    }

    /**
     * Fetch public information about your bot from DiscordForge.
     *
     * @example
     * ```js
     * const bot = await client.getBot();
     * console.log(`${bot.name} has ${bot.voteCount} votes`);
     * ```
     */
    public async getBot(): Promise<BotInfo> {
        if (!this.botId) throw new Error("getBot() requires a botId. Pass it as the second argument to ForgeClient.");
        return await this.request<BotInfo>(
            "GET",
            `/api/bots/${encodeURIComponent(this.botId)}`,
            undefined,
            this.options.retries,
            "none",
        );
    }

    /**
     * Sync your bot's slash commands to the DiscordForge panel.
     *
     * Accepts up to **200** commands per request.
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
        return await this.request<SyncCommandsResponse>("POST", `${API_PREFIX}/bots/commands`, { commands });
    }

    /**
     * Update editable fields on your bot's DiscordForge listing.
     */
    public async updateListing(listing: BotListingUpdateRequest): Promise<BotListingUpdateResponse> {
        if (!listing || typeof listing !== "object" || Array.isArray(listing)) {
            throw new Error("listing must be a valid object");
        }

        const payload: Partial<BotListingUpdateRequest> = {};
        for (const field of LISTING_UPDATE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(listing, field)) {
                (payload as any)[field] = listing[field];
            }
        }

        return await this.request<BotListingUpdateResponse>("PATCH", `${API_PREFIX}/bots/listing`, payload);
    }

    /**
     * Publish a bot announcement. Images are not supported.
     */
    public async publishAnnouncement(announcement: BotAnnouncementCreateRequest): Promise<BotAnnouncementCreateResponse> {
        if (!announcement || typeof announcement !== "object" || Array.isArray(announcement)) {
            throw new Error("announcement must be a valid object");
        }
        if (!announcement.content || typeof announcement.content !== "string") {
            throw new Error("announcement.content must be a valid string");
        }
        if (announcement.type && !ANNOUNCEMENT_TYPES.has(announcement.type)) {
            throw new Error("announcement.type must be one of UPDATE, MAINTENANCE, NEWS, EVENT, or GENERAL");
        }

        const payload: BotAnnouncementCreateRequest = { content: announcement.content };
        if (Object.prototype.hasOwnProperty.call(announcement, "title")) payload.title = announcement.title;
        if (Object.prototype.hasOwnProperty.call(announcement, "type")) payload.type = announcement.type;

        return await this.request<BotAnnouncementCreateResponse>("POST", `${API_PREFIX}/bots/announcements`, payload);
    }
}
