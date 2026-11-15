import type { BotStats, HeartbeatResponse, WebhookEventType } from "@discordforgejs/types";

export type * from "@discordforgejs/types";

/** Options for {@link ForgeClient.events}. */
export interface LiveEventsOptions {
    /** Only receive these event types. Defaults to all. */
    types?: WebhookEventType[];
    /** Resume after this event ID (replays events from the past hour). */
    lastEventId?: string;
    /** Give up reconnecting after this many failed attempts in a row. Defaults to `Infinity`. */
    maxRetries?: number;
}

/** Configuration options for the {@link ForgeClient}. */
export interface ClientOptions {
    /** API origin. Defaults to `"https://discordforge.org"`. */
    baseURL?: string;
    /** Request timeout in milliseconds. Defaults to `10000`. */
    timeout?: number;
    /** Number of automatic retries on failure or 429. Defaults to `3`. */
    retries?: number;
}

/**
 * Configuration for the {@link AutoPoster}.
 *
 * @example
 * ```js
 * const poster = new AutoPoster(forgeClient, discordClient, {
 *   interval: 600_000, // 10 minutes
 *   startImmediately: true
 * });
 * ```
 */
export interface AutoPosterOptions {
    /**
     * Posting interval in milliseconds.
     * Must be at least 300,000 (5 minutes) to respect the API rate limit.
     * Defaults to `300_000`.
     */
    interval?: number;
    /** Whether to post stats immediately when `start()` is called. Defaults to `true`. */
    startImmediately?: boolean;
    /**
     * Also send uptime heartbeats. `true` sends one every 5 minutes; pass
     * `{ interval }` (at least 60,000 ms) to change that. The bot's Discord
     * presence (online, idle, dnd) is sent when available. Defaults to `false`.
     */
    heartbeat?: boolean | { interval?: number };
    /** Called when stats are posted successfully. */
    onPost?: (stats: BotStats) => void;
    /** Called after each successful heartbeat. */
    onHeartbeat?: (response: HeartbeatResponse) => void;
    /** Called when a stats post or heartbeat fails. */
    onError?: (error: Error) => void;
}
