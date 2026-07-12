import { ForgeAPIError } from "./errors";
import { ClientOptions, BotStats, VoteMetadata, BotInfo, SyncCommand } from "./types";

const DEFAULT_OPTIONS: Required<ClientOptions> = {
    version: "v1",
    timeout: 10000,
    retries: 3
};

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
        const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
        if (!Number.isFinite(resolvedOptions.timeout) || resolvedOptions.timeout <= 0) {
            throw new Error("timeout must be a positive finite number");
        }
        if (!Number.isInteger(resolvedOptions.retries) || resolvedOptions.retries < 0) {
            throw new Error("retries must be a non-negative integer");
        }
        this.options = resolvedOptions;
    }

    private async request<T>(method: string, path: string, body?: unknown, retriesLeft = this.options.retries): Promise<T> {
        const url = `${this.baseURL}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); }, this.options.timeout);

        const headers = new Headers({
            "Authorization": this.apiKey,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "DiscordForge-NodeSDK"
        });

        const fetchOptions: RequestInit = { method, headers, signal: controller.signal };
        if (body) fetchOptions.body = JSON.stringify(body);

        try {
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429 && retriesLeft > 0) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitTime = this.retryDelay(retryAfter);
                    await new Promise(r => setTimeout(r, waitTime));
                    return await this.request<T>(method, path, body, retriesLeft - 1);
                }

                let errorBody: unknown = await response.text();
                try { errorBody = JSON.parse(errorBody as string); } catch { /* raw text */ }

                throw new ForgeAPIError(
                    `Forge API Request Failed: ${response.status.toString()} ${response.statusText}`,
                    response.status, errorBody, response.headers
                );
            }

            if (response.status === 204) return {} as T;
            return await response.json() as T;

        } catch (error: unknown) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request to ${path} timed out after ${this.options.timeout.toString()}ms.`);
            }
            if (error instanceof ForgeAPIError) throw error;
            if (retriesLeft > 0) {
                await new Promise(r => setTimeout(r, 3000));
                return await this.request<T>(method, path, body, retriesLeft - 1);
            }
            throw error;
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
        this.assertCounter(stats.serverCount, "serverCount", false);
        this.assertCounter(stats.shardCount, "shardCount", true);
        this.assertCounter(stats.userCount, "userCount", true);
        this.assertCounter(stats.voiceConnections, "voiceConnections", true);

        const payload = {
            server_count: stats.serverCount,
            shard_count: stats.shardCount,
            user_count: stats.userCount,
            voice_connections: stats.voiceConnections
        };
        await this.request("POST", "/api/bots/stats", payload);
    }

    private assertCounter(value: number | undefined, name: string, optional: boolean): void {
        if (optional && value === undefined) return;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            throw new Error(`${name} must be a non-negative finite number`);
        }
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
        return await this.request<VoteMetadata>("GET", `/api/bots/${encodeURIComponent(this.botId)}/votes/check?userId=${encodeURIComponent(userId)}`);
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
        return await this.request<BotInfo>("GET", `/api/bots/${encodeURIComponent(this.botId)}`);
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
    public async syncCommands(commands: SyncCommand[]): Promise<{ success: boolean; synced: number }> {
        if (!Array.isArray(commands)) throw new Error("commands must be an array");
        if (commands.length > 200) throw new Error("You can only sync up to 200 commands at once.");
        return await this.request<{ success: boolean; synced: number }>("POST", "/api/external/bots/commands", { commands });
    }

    private retryDelay(retryAfter: string | null): number {
        if (!retryAfter) return 3000;

        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

        const timestamp = Date.parse(retryAfter);
        if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());

        return 3000;
    }
}
