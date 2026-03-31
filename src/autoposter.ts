import { ForgeClient } from "./client";
import { AutoPosterOptions, BotStats } from "./types";

const MIN_INTERVAL = 300_000; // 5 minutes — matches the API rate limit

/**
 * Automatically posts bot statistics to DiscordForge on a fixed interval.
 *
 * Accepts any object with a `guilds.cache.size` property (discord.js `Client`,
 * Eris `Client`, or a plain object). Zero hard dependencies on any library.
 *
 * @example
 * ```js
 * const { ForgeClient, AutoPoster } = require("discordforge-sdk");
 * const { Client } = require("discord.js");
 *
 * const bot = new Client({ intents: ["Guilds"] });
 * const forge = new ForgeClient("YOUR_API_KEY");
 * const poster = new AutoPoster(forge, bot);
 *
 * poster.on("post", (stats) => console.log(`Posted: ${stats.serverCount} servers`));
 * poster.on("error", (err) => console.error("AutoPoster error:", err));
 *
 * bot.login("BOT_TOKEN");
 * ```
 *
 * @link {@link https://discordforge.org/support/developers | API Reference}
 */
export class AutoPoster {
    private readonly forge: ForgeClient;
    private readonly discordClient: DiscordLikeClient;
    private readonly interval: number;
    private readonly startImmediately: boolean;
    private timer: ReturnType<typeof setInterval> | null = null;
    private listeners: { post: Array<(stats: BotStats) => void>; error: Array<(err: Error) => void> } = {
        post: [],
        error: []
    };

    constructor(forge: ForgeClient, discordClient: DiscordLikeClient, options?: AutoPosterOptions) {
        if (!forge) throw new Error("AutoPoster requires a ForgeClient instance.");
        if (!discordClient) throw new Error("AutoPoster requires a Discord client instance.");

        const interval = options?.interval ?? MIN_INTERVAL;
        if (interval < MIN_INTERVAL) {
            throw new Error(`AutoPoster interval must be at least ${MIN_INTERVAL}ms (5 minutes) to respect rate limits.`);
        }

        this.forge = forge;
        this.discordClient = discordClient;
        this.interval = interval;
        this.startImmediately = options?.startImmediately ?? true;

        if (options?.onPost) this.listeners.post.push(options.onPost);
        if (options?.onError) this.listeners.error.push(options.onError);

        // Auto-start: wait for the client to be ready, then begin posting.
        this.waitForReady();
    }

    /**
     * Register an event listener.
     *
     * - `"post"` — fired after each successful stats post.
     * - `"error"` — fired when a posting attempt fails.
     */
    public on(event: "post", listener: (stats: BotStats) => void): this;
    public on(event: "error", listener: (err: Error) => void): this;
    public on(event: string, listener: (...args: any[]) => void): this {
        if (event === "post") this.listeners.post.push(listener as (stats: BotStats) => void);
        if (event === "error") this.listeners.error.push(listener as (err: Error) => void);
        return this;
    }

    /** Start the posting loop. Called automatically after the Discord client is ready. */
    public start(): void {
        if (this.timer) return; // already running

        if (this.startImmediately) {
            this.post();
        }

        this.timer = setInterval(() => this.post(), this.interval);
    }

    /** Stop the posting loop. Can be restarted with `start()`. */
    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Stop the poster and remove all listeners. */
    public destroy(): void {
        this.stop();
        this.listeners.post = [];
        this.listeners.error = [];
    }

    /** Whether the poster is currently running. */
    public get isRunning(): boolean {
        return this.timer !== null;
    }

    /** Collect stats from the Discord client and post them. */
    private async post(): Promise<void> {
        try {
            const stats = this.collectStats();
            await this.forge.postStats(stats);
            for (const fn of this.listeners.post) fn(stats);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (this.listeners.error.length > 0) {
                for (const fn of this.listeners.error) fn(error);
            }
            // Swallow the error — never crash the host process.
        }
    }

    /** Read guild/shard counts from the Discord client using duck-typed access. */
    private collectStats(): BotStats {
        const client = this.discordClient as any;

        const serverCount: number =
            client.guilds?.cache?.size ??   // discord.js
            client.guilds?.size ??          // eris
            0;

        const shardCount: number | undefined =
            client.ws?.shards?.size ??      // discord.js ShardingManager
            client.shards?.size ??          // eris
            undefined;

        const userCount: number | undefined =
            client.users?.cache?.size ??    // discord.js
            client.users?.size ??           // eris
            undefined;

        return { serverCount, shardCount, userCount };
    }

    /** Wait for the Discord client's `ready` event, then start the loop. */
    private waitForReady(): void {
        const client = this.discordClient as any;

        // If the client is already ready, start immediately.
        if (client.isReady?.() || client.ready) {
            this.start();
            return;
        }

        // Otherwise, wait for the "ready" event (works with discord.js, eris, etc.)
        if (typeof client.once === "function") {
            client.once("ready", () => this.start());
        } else {
            // Fallback: start right away.
            this.start();
        }
    }
}

/**
 * Duck-typed interface for any Discord client that exposes guild data.
 * Compatible with discord.js, eris, and custom wrappers.
 */
export interface DiscordLikeClient {
    guilds?: { cache?: { size: number }; size?: number };
    ws?: { shards?: { size: number } };
    shards?: { size: number };
    users?: { cache?: { size: number }; size?: number };
    isReady?: () => boolean;
    ready?: boolean;
    once?: (event: string, listener: (...args: any[]) => void) => any;
}
