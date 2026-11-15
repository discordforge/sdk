import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
    ForgeAPIError,
    ForgeClient,
    SDK_VERSION,
    verifyWebhookSignature,
    type BotOperationalStatus,
    type BotVote,
    type ClientOptions,
    type HeartbeatStatus,
    type ReviewSort,
    type WebhookEventType
} from "@discordforgejs/sdk";

declare const __CLI_VERSION__: string;
const CLI_VERSION = typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0-dev";

/** Where the CLI writes. Swappable for tests. */
export interface CliIO {
    out: (line: string) => void;
    err: (line: string) => void;
    env: Record<string, string | undefined>;
    readFile: (path: string) => string;
    /** Resolves when the user asks to stop a long-running command (Ctrl+C). */
    interrupted: () => Promise<void>;
}

export type ClientFactory = (apiKey: string, botId: string | undefined, options: ClientOptions) => ForgeClient;

const HELP = `DiscordForge CLI

Usage: discordforge <command> [options]

Commands:
  bot                                   Show your bot's public profile (needs --bot)
  stats post --servers <n>              Post stats [--shards <n>] [--users <n>] [--voice <n>]
  heartbeat [--status online|idle|dnd]  Send an uptime heartbeat
  vote check <userId>                   Did this user vote in the last 8 hours? (needs --bot)
  votes [--limit <n>] [--before <iso>]  Vote history, newest first [--all to fetch every page]
  reviews [--limit <n>] [--sort recent|rating]
  uptime [--days <n>]                   Uptime over the last 1-90 days
  analytics [--days <n>]                Views, invite clicks and votes over 1-90 days
  status get                            Show the status banner
  status set <status> [--message <m>]   Set the banner [--hidden to save without showing]
                                        status: operational, degraded, partial_outage, major_outage, maintenance
  status clear                          Hide the banner
  cooldown <userId> <serverId>          Bump cooldown for a user and server
  commands sync <file.json>             Replace your commands (JSON array, up to 200)
  listing update <file.json>            Update listing fields from a JSON object
  announce --content <text>             Publish an announcement [--title <t>] [--type UPDATE|MAINTENANCE|NEWS|EVENT|GENERAL]
  events [--types <a,b>]                Print live events until Ctrl+C
  webhook verify <file> --secret <s> --signature <sha256=...>
                                        Check a saved Webhooks v2 body against its signature

Options:
  --key <key>        Bot API key (or DISCORDFORGE_API_KEY)
  --bot <id>         Bot ID (or DISCORDFORGE_BOT_ID)
  --base-url <url>   API origin (or DISCORDFORGE_BASE_URL), default https://discordforge.org
  --json             Print raw JSON responses
  -h, --help         Show this help
  -v, --version      Show versions
`;

class UsageError extends Error {}

function int(value: string | undefined, name: string): number | undefined {
    if (value === undefined) return undefined;
    if (!/^-?\d+$/.test(value)) throw new UsageError(`${name} must be a whole number`);
    return parseInt(value, 10);
}

function need<T>(value: T | undefined, message: string): T {
    if (value === undefined || value === "") throw new UsageError(message);
    return value;
}

function readJson(io: CliIO, path: string): unknown {
    let text: string;
    try {
        text = io.readFile(path);
    } catch {
        throw new UsageError(`Can't read ${path}`);
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new UsageError(`${path} is not valid JSON`);
    }
}

/**
 * Runs the CLI and returns the exit code: 0 on success, 1 when the API or
 * network fails, 2 on a usage error.
 */
export async function run(
    argv: string[],
    io: CliIO,
    createClient: ClientFactory = (key, bot, options) => new ForgeClient(key, bot, options)
): Promise<number> {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                key: { type: "string" },
                bot: { type: "string" },
                "base-url": { type: "string" },
                json: { type: "boolean" },
                help: { type: "boolean", short: "h" },
                version: { type: "boolean", short: "v" },
                servers: { type: "string" },
                shards: { type: "string" },
                users: { type: "string" },
                voice: { type: "string" },
                status: { type: "string" },
                limit: { type: "string" },
                before: { type: "string" },
                all: { type: "boolean" },
                sort: { type: "string" },
                days: { type: "string" },
                message: { type: "string" },
                hidden: { type: "boolean" },
                content: { type: "string" },
                title: { type: "string" },
                type: { type: "string" },
                types: { type: "string" },
                secret: { type: "string" },
                signature: { type: "string" }
            }
        });
    } catch (error) {
        io.err(`${(error as Error).message}\nRun discordforge --help for usage.`);
        return 2;
    }

    const { values: opts, positionals } = parsed;
    const [command, sub, ...rest] = positionals;

    if (opts.version) {
        io.out(`@discordforgejs/cli ${CLI_VERSION} (sdk ${SDK_VERSION})`);
        return 0;
    }
    if (opts.help || !command) {
        io.out(HELP);
        return command || opts.help ? 0 : 2;
    }

    const print = (value: unknown, human: () => string) => io.out(opts.json ? JSON.stringify(value, null, 2) : human());

    try {
        // Offline command: no API key needed.
        if (command === "webhook") {
            if (sub !== "verify") throw new UsageError("Usage: discordforge webhook verify <file> --secret <s> --signature <sha256=...>");
            const file = need(rest[0], "Pass the file with the raw webhook body");
            const valid = verifyWebhookSignature(
                io.readFile(file),
                need(opts.signature, "--signature is required"),
                need(opts.secret, "--secret is required")
            );
            print({ valid }, () => (valid ? "Signature is valid" : "Signature does NOT match"));
            return valid ? 0 : 1;
        }

        const key = opts.key ?? io.env.DISCORDFORGE_API_KEY;
        if (!key) throw new UsageError("Missing API key. Pass --key or set DISCORDFORGE_API_KEY.");
        const botId = opts.bot ?? io.env.DISCORDFORGE_BOT_ID;
        const baseURL = opts["base-url"] ?? io.env.DISCORDFORGE_BASE_URL;
        const client = createClient(key, botId, baseURL ? { baseURL } : {});

        switch (command) {
            case "bot": {
                const bot = await client.getBot();
                print(bot, () => [
                    `${bot.name}`,
                    `  votes ${bot.voteCount}   servers ${bot.serverCount}   rating ${bot.averageRating ?? "none yet"} (reviews: ${bot.reviewCount})`,
                    `  tags ${bot.tags}`
                ].join("\n"));
                return 0;
            }

            case "stats": {
                if (sub !== "post") throw new UsageError("Usage: discordforge stats post --servers <n>");
                const res = await client.postStats({
                    serverCount: need(int(opts.servers, "--servers"), "--servers is required"),
                    shardCount: int(opts.shards, "--shards"),
                    userCount: int(opts.users, "--users"),
                    voiceConnections: int(opts.voice, "--voice")
                });
                print(res, () => res.message ?? "Stats posted");
                return 0;
            }

            case "heartbeat": {
                const res = await client.heartbeat(opts.status as HeartbeatStatus | undefined);
                print(res, () => `${res.message} (${res.status}, ${res.uptimeOnline}/${res.uptimeChecks} checks online)`);
                return 0;
            }

            case "vote": {
                if (sub !== "check") throw new UsageError("Usage: discordforge vote check <userId>");
                const res = await client.checkVote(need(rest[0], "Pass the user ID"));
                print(res, () => (res.hasVoted ? `Voted at ${res.votedAt}; can vote again at ${res.nextVoteAt}` : "No vote in the last 8 hours"));
                return 0;
            }

            case "votes": {
                if (opts.all) {
                    const votes: BotVote[] = [];
                    for await (const vote of client.iterateVotes({ before: opts.before })) votes.push(vote);
                    print(votes, () => votes.map((v) => `${v.timestamp}  ${v.user_id}`).join("\n") || "No votes");
                    return 0;
                }
                const res = await client.getVotes({ limit: int(opts.limit, "--limit"), before: opts.before });
                print(res, () => {
                    const lines = res.votes.map((v) => `${v.timestamp}  ${v.user_id}`);
                    if (res.has_more) lines.push(`… more: --before ${res.votes[res.votes.length - 1]?.timestamp} or --all`);
                    return lines.join("\n") || "No votes";
                });
                return 0;
            }

            case "reviews": {
                const res = await client.getReviews({ limit: int(opts.limit, "--limit"), sort: opts.sort as ReviewSort | undefined });
                print(res, () => [
                    `Average rating ${res.average} (reviews: ${res.total})`,
                    ...res.reviews.map((r) => `  ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}  ${r.user.name ?? r.user.id}: ${r.comment}`)
                ].join("\n"));
                return 0;
            }

            case "uptime": {
                const res = await client.getUptime({ days: int(opts.days, "--days") });
                print(res, () => [
                    `${res.uptime_percentage}% uptime over ${res.days_requested} days (${res.method}, ${res.total_online}/${res.total_checks} checks online)`,
                    ...res.days.map((d) => `  ${d.date}  ${d.online ? "up  " : "down"}  ${d.online_checks}/${d.checks}`)
                ].join("\n"));
                return 0;
            }

            case "analytics": {
                const res = await client.getAnalytics({ days: int(opts.days, "--days") });
                const t = res.totals;
                print(res, () => [
                    `Last ${res.days_requested} days: views ${t.views}, invite clicks ${t.invite_clicks} (${t.click_through_rate}% of views), votes ${t.votes}`,
                    ...res.daily.map((d) => `  ${d.date}  views ${d.views}  clicks ${d.invite_clicks}  votes ${d.votes}`)
                ].join("\n"));
                return 0;
            }

            case "status": {
                const res =
                    sub === "get" ? await client.getStatus()
                    : sub === "clear" ? await client.clearStatus()
                    : sub === "set" ? await client.setStatus({
                        status: need(rest[0], "Pass the status, e.g. degraded") as BotOperationalStatus,
                        message: opts.message,
                        enabled: opts.hidden ? false : undefined
                    })
                    : (() => { throw new UsageError("Usage: discordforge status get|set|clear"); })();
                print(res, () => `${res.status}${res.message ? ` – ${res.message}` : ""} (banner ${res.enabled ? "shown" : "hidden"})`);
                return 0;
            }

            case "cooldown": {
                const res = await client.getBumpCooldown(need(sub, "Pass the user ID"), need(rest[0], "Pass the server ID"));
                print(res, () => (res.canBump ? "Can bump now" : `Can bump again at ${res.cooldownExpiresAt}`) + ` (tier ${res.tierLabel})`);
                return 0;
            }

            case "commands": {
                if (sub !== "sync") throw new UsageError("Usage: discordforge commands sync <file.json>");
                const commands = readJson(io, need(rest[0], "Pass a JSON file with your commands"));
                if (!Array.isArray(commands)) throw new UsageError("The commands file must contain a JSON array");
                const res = await client.syncCommands(commands);
                print(res, () => `Synced ${res.synced} commands`);
                return 0;
            }

            case "listing": {
                if (sub !== "update") throw new UsageError("Usage: discordforge listing update <file.json>");
                const listing = readJson(io, need(rest[0], "Pass a JSON file with listing fields"));
                const res = await client.updateListing(listing as Record<string, unknown>);
                print(res, () => `Listing updated: ${res.shortDescription}`);
                return 0;
            }

            case "announce": {
                const res = await client.publishAnnouncement({
                    content: need(opts.content, "--content is required"),
                    title: opts.title,
                    type: opts.type as any
                });
                print(res, () => `Published ${res.type} announcement ${res.id}`);
                return 0;
            }

            case "events": {
                const types = opts.types ? (opts.types.split(",").map((t) => t.trim()).filter(Boolean) as WebhookEventType[]) : undefined;
                const stream = client.events({ types });
                let fatal: Error | null = null;
                stream.on("connect", () => { if (!opts.json) io.err("Connected, waiting for events (Ctrl+C to stop)…"); });
                stream.on("event", (event) => print(event, () => `${event.created_at}  ${event.type}  ${JSON.stringify(event.data)}`));
                stream.on("error", (error) => {
                    io.err(`Stream error: ${describe(error)}`);
                    if (error instanceof ForgeAPIError && [400, 401, 403, 404].includes(error.status)) fatal = error;
                });
                await Promise.race([io.interrupted(), new Promise<void>((resolve) => stream.on("close", () => resolve()))]);
                stream.close();
                return fatal ? 1 : 0;
            }

            default:
                throw new UsageError(`Unknown command "${command}". Run discordforge --help for usage.`);
        }
    } catch (error) {
        if (error instanceof UsageError) {
            io.err(error.message);
            return 2;
        }
        io.err(describe(error));
        return 1;
    }
}

function describe(error: unknown): string {
    if (error instanceof ForgeAPIError) {
        const body = error.body as { message?: string; error?: string } | string | undefined;
        const detail = typeof body === "string" ? body : body?.message ?? body?.error;
        return `API error ${error.status}${detail ? `: ${detail}` : ""}`;
    }
    return error instanceof Error ? error.message : String(error);
}

/** IO bound to the real process. */
export function processIO(): CliIO {
    return {
        out: (line) => process.stdout.write(line + "\n"),
        err: (line) => process.stderr.write(line + "\n"),
        env: process.env,
        readFile: (path) => readFileSync(path, "utf8"),
        interrupted: () => new Promise((resolve) => process.once("SIGINT", () => resolve()))
    };
}
