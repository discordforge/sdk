/** Configuration options for the {@link ForgeClient}. */
export interface ClientOptions {
    /** API version prefix. Defaults to `"v1"`. */
    version?: string;
    /** Request timeout in milliseconds. Defaults to `10000`. */
    timeout?: number;
    /** Number of automatic retries on failure or 429. Defaults to `3`. */
    retries?: number;
}

/**
 * Bot statistics payload accepted by {@link ForgeClient.postStats}.
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

/** Vote check response returned by {@link ForgeClient.checkVote}. */
export interface VoteMetadata {
    /** Whether the user has voted in the last 12 hours. */
    hasVoted: boolean;
    /** ISO-8601 timestamp of the last vote, if any. */
    votedAt?: string;
    /** ISO-8601 timestamp of when the user can vote again. */
    nextVoteAt?: string;
}

/** Public bot information returned by {@link ForgeClient.getBot}. */
export interface BotInfo {
    /** The bot's Discord snowflake ID. */
    id: string;
    /** The bot's username. */
    name: string;
    /** Total number of votes on DiscordForge. */
    voteCount: number;
    /** Last reported server count. */
    serverCount: number;
    /** Additional fields returned by the API. */
    [key: string]: any;
}

/** Structured error body returned by the DiscordForge API on failure. */
export interface APIErrorBody {
    message: string;
    code?: string;
    errors?: Record<string, string[]>;
}

/** A custom command format for {@link ForgeClient.syncCommands}. */
export interface CustomCommand {
    name: string;
    description: string;
    usage?: string;
    category?: string;
}

/** A Discord API-compatible application command object. */
export interface DiscordCommand {
    name: string;
    description: string;
    type?: number;
    options?: any[];
    [key: string]: any;
}

/**
 * Union type accepted by {@link ForgeClient.syncCommands}.
 * Pass either a {@link CustomCommand} or a native {@link DiscordCommand}.
 */
export type SyncCommand = CustomCommand | DiscordCommand;
