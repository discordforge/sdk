import type { LegacyVoteWebhookPayload, WebhookEvent } from "./types";
import {
    constructWebhookEvent,
    ForgeWebhookError,
    parseLegacyVoteWebhook,
    WEBHOOK_SIGNATURE_HEADER
} from "./webhooks";

/*
 * Ready-made request handlers for Express and Fastify. They only rely on the
 * shape of the request/response objects, so neither framework is a dependency.
 */

type RawBody = string | Uint8Array;
type Awaitable<T> = T | Promise<T>;

/** The parts of an Express (or Node `http`) request the handlers use. */
export interface ExpressLikeRequest {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    rawBody?: RawBody;
    readableEnded?: boolean;
    on?(event: string, listener: (...args: any[]) => void): unknown;
}

/** The parts of an Express response the handlers use. */
export interface ExpressLikeResponse {
    headersSent?: boolean;
    status(code: number): ExpressLikeResponse;
    json(body: unknown): unknown;
    end(): unknown;
}

/** The parts of a Fastify request the handlers use. */
export interface FastifyLikeRequest {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    rawBody?: RawBody;
}

/** The parts of a Fastify reply the handlers use. */
export interface FastifyLikeReply {
    sent?: boolean;
    code(statusCode: number): FastifyLikeReply;
    send(payload?: unknown): unknown;
}

export interface WebhookHandlerOptions<Req, Res> {
    /** The Webhooks v2 endpoint secret from your bot's dashboard. */
    secret: string;
    /** Called with each verified event. Respond yourself, or let the handler reply `204`. */
    onEvent: (event: WebhookEvent, request: Req, response: Res) => Awaitable<void>;
}

export interface LegacyVoteHandlerOptions<Req, Res> {
    /** The legacy webhook secret from your bot's dashboard. */
    secret: string;
    /** Called with each verified vote. Respond yourself, or let the handler reply `204`. */
    onVote: (vote: LegacyVoteWebhookPayload, request: Req, response: Res) => Awaitable<void>;
}

const RAW_BODY_HINT =
    "The request body was already parsed as JSON, so its signature can't be checked. " +
    "Give this route the raw body (Express: express.raw({ type: \"application/json\" }); " +
    "Fastify: a buffer content-type parser or fastify-raw-body).";

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
}

function isRaw(value: unknown): value is RawBody {
    return typeof value === "string" || value instanceof Uint8Array;
}

function readStream(request: ExpressLikeRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        request.on!("data", (chunk: Buffer | string) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
        request.on!("end", () => resolve(Buffer.concat(chunks)));
        request.on!("error", reject);
    });
}

async function expressRawBody(request: ExpressLikeRequest): Promise<RawBody> {
    if (isRaw(request.rawBody)) return request.rawBody;
    if (isRaw(request.body)) return request.body;
    if (request.body !== undefined && request.body !== null && typeof request.body === "object") {
        throw new Error(RAW_BODY_HINT);
    }
    if (typeof request.on === "function" && !request.readableEnded) return readStream(request);
    throw new Error(RAW_BODY_HINT);
}

function fastifyRawBody(request: FastifyLikeRequest): RawBody {
    if (isRaw(request.rawBody)) return request.rawBody;
    if (isRaw(request.body)) return request.body;
    throw new Error(RAW_BODY_HINT);
}

/**
 * Express handler for Webhooks v2. Verifies `X-Forge-Signature`, replies `401`
 * to anything unsigned, and calls `onEvent` with the parsed event.
 *
 * Works with the raw body from `express.raw()`, `req.rawBody`, or an unread request stream.
 *
 * @example
 * ```js
 * app.post("/forge", express.raw({ type: "application/json" }), expressWebhook({
 *   secret: process.env.FORGE_WEBHOOK_SECRET,
 *   onEvent: (event) => {
 *     if (event.type === "vote.created" && !event.data.test) rewardVoter(event.data.voter_id);
 *   }
 * }));
 * ```
 */
export function expressWebhook<Req extends ExpressLikeRequest, Res extends ExpressLikeResponse>(
    options: WebhookHandlerOptions<Req, Res>
): (request: Req, response: Res, next?: (error?: unknown) => void) => Promise<void> {
    if (!options?.secret) throw new Error("expressWebhook requires a secret");
    if (typeof options.onEvent !== "function") throw new Error("expressWebhook requires an onEvent function");

    return async (request, response, next) => {
        let event: WebhookEvent;
        try {
            const body = await expressRawBody(request);
            event = constructWebhookEvent(body, header(request.headers, WEBHOOK_SIGNATURE_HEADER), options.secret);
        } catch (error) {
            if (error instanceof ForgeWebhookError) {
                response.status(401).json({ error: error.message });
                return;
            }
            return next ? next(error) : void response.status(500).json({ error: (error as Error).message });
        }

        try {
            await options.onEvent(event, request, response);
            if (!response.headersSent) response.status(204).end();
        } catch (error) {
            if (next) return next(error);
            if (!response.headersSent) response.status(500).json({ error: "Webhook handler failed" });
        }
    };
}

/**
 * Express handler for the legacy vote webhook. Checks the `Authorization`
 * secret and calls `onVote`. Works with `express.json()` or a raw body.
 *
 * @example
 * ```js
 * app.post("/vote", express.json(), expressLegacyVoteWebhook({
 *   secret: process.env.FORGE_WEBHOOK_SECRET,
 *   onVote: (vote) => { if (!vote.isTest) rewardVoter(vote.id); }
 * }));
 * ```
 */
export function expressLegacyVoteWebhook<Req extends ExpressLikeRequest, Res extends ExpressLikeResponse>(
    options: LegacyVoteHandlerOptions<Req, Res>
): (request: Req, response: Res, next?: (error?: unknown) => void) => Promise<void> {
    if (!options?.secret) throw new Error("expressLegacyVoteWebhook requires a secret");
    if (typeof options.onVote !== "function") throw new Error("expressLegacyVoteWebhook requires an onVote function");

    return async (request, response, next) => {
        let vote: LegacyVoteWebhookPayload;
        try {
            const body = request.body !== undefined && request.body !== null ? request.body : await expressRawBody(request);
            vote = parseLegacyVoteWebhook(body as RawBody | LegacyVoteWebhookPayload, header(request.headers, "authorization"), options.secret);
        } catch (error) {
            if (error instanceof ForgeWebhookError) {
                response.status(401).json({ error: error.message });
                return;
            }
            return next ? next(error) : void response.status(500).json({ error: (error as Error).message });
        }

        try {
            await options.onVote(vote, request, response);
            if (!response.headersSent) response.status(204).end();
        } catch (error) {
            if (next) return next(error);
            if (!response.headersSent) response.status(500).json({ error: "Webhook handler failed" });
        }
    };
}

/**
 * Fastify route handler for Webhooks v2. Needs the raw body: register a buffer
 * parser for `application/json` in the route's scope, or use `fastify-raw-body`.
 *
 * @example
 * ```js
 * fastify.register(async (scope) => {
 *   scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
 *   scope.post("/forge", fastifyWebhook({
 *     secret: process.env.FORGE_WEBHOOK_SECRET,
 *     onEvent: (event) => console.log(event.type)
 *   }));
 * });
 * ```
 */
export function fastifyWebhook<Req extends FastifyLikeRequest, Reply extends FastifyLikeReply>(
    options: WebhookHandlerOptions<Req, Reply>
): (request: Req, reply: Reply) => Promise<void> {
    if (!options?.secret) throw new Error("fastifyWebhook requires a secret");
    if (typeof options.onEvent !== "function") throw new Error("fastifyWebhook requires an onEvent function");

    return async (request, reply) => {
        let event: WebhookEvent;
        try {
            event = constructWebhookEvent(fastifyRawBody(request), header(request.headers, WEBHOOK_SIGNATURE_HEADER), options.secret);
        } catch (error) {
            if (error instanceof ForgeWebhookError) {
                reply.code(401).send({ error: error.message });
                return;
            }
            throw error;
        }
        await options.onEvent(event, request, reply);
        if (!reply.sent) reply.code(204).send();
    };
}

/**
 * Fastify route handler for the legacy vote webhook. Works with Fastify's default JSON parsing.
 *
 * @example
 * ```js
 * fastify.post("/vote", fastifyLegacyVoteWebhook({
 *   secret: process.env.FORGE_WEBHOOK_SECRET,
 *   onVote: (vote) => { if (!vote.isTest) rewardVoter(vote.id); }
 * }));
 * ```
 */
export function fastifyLegacyVoteWebhook<Req extends FastifyLikeRequest, Reply extends FastifyLikeReply>(
    options: LegacyVoteHandlerOptions<Req, Reply>
): (request: Req, reply: Reply) => Promise<void> {
    if (!options?.secret) throw new Error("fastifyLegacyVoteWebhook requires a secret");
    if (typeof options.onVote !== "function") throw new Error("fastifyLegacyVoteWebhook requires an onVote function");

    return async (request, reply) => {
        let vote: LegacyVoteWebhookPayload;
        try {
            vote = parseLegacyVoteWebhook(request.body as RawBody | LegacyVoteWebhookPayload, header(request.headers, "authorization"), options.secret);
        } catch (error) {
            if (error instanceof ForgeWebhookError) {
                reply.code(401).send({ error: error.message });
                return;
            }
            throw error;
        }
        await options.onVote(vote, request, reply);
        if (!reply.sent) reply.code(204).send();
    };
}
