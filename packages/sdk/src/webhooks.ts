import { createHmac, timingSafeEqual } from "node:crypto";
import type { LegacyVoteWebhookPayload, WebhookEvent } from "./types";

/** Header carrying the `sha256=<hex>` HMAC of the raw body on Webhooks v2 deliveries. */
export const WEBHOOK_SIGNATURE_HEADER = "x-forge-signature";
/** Header carrying the event name on Webhooks v2 deliveries. */
export const WEBHOOK_EVENT_HEADER = "x-forge-event";
/** Header carrying the delivery ID on Webhooks v2 deliveries. */
export const WEBHOOK_DELIVERY_HEADER = "x-forge-delivery";

type RawBody = string | Uint8Array;

/** Thrown by {@link constructWebhookEvent} and {@link parseLegacyVoteWebhook} when a request can't be trusted. */
export class ForgeWebhookError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ForgeWebhookError";
        Object.setPrototypeOf(this, ForgeWebhookError.prototype);
    }
}

function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    // Compare against itself on length mismatch so timing doesn't reveal the length check.
    if (left.length !== right.length) {
        timingSafeEqual(left, left);
        return false;
    }
    return timingSafeEqual(left, right);
}

/** Computes the `sha256=<hex>` signature DiscordForge sends for a raw body. */
export function signWebhookPayload(rawBody: RawBody, secret: string): string {
    return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Checks the `X-Forge-Signature` header of a Webhooks v2 delivery.
 *
 * Pass the **raw** request body, before any JSON parsing; re-serialized JSON
 * will not match.
 */
export function verifyWebhookSignature(
    rawBody: RawBody,
    signature: string | null | undefined,
    secret: string
): boolean {
    if (!secret) throw new Error("A webhook endpoint secret is required");
    if (!signature || typeof signature !== "string") return false;
    return safeEqual(signWebhookPayload(rawBody, secret), signature.trim());
}

/**
 * Verifies a Webhooks v2 delivery and returns the parsed event.
 * Throws {@link ForgeWebhookError} when the signature is missing or wrong.
 *
 * @example
 * ```js
 * // Express: use express.raw() so you get the body as a Buffer
 * app.post("/forge", express.raw({ type: "application/json" }), (req, res) => {
 *   let event;
 *   try {
 *     event = constructWebhookEvent(req.body, req.get("x-forge-signature"), process.env.FORGE_WEBHOOK_SECRET);
 *   } catch {
 *     return res.sendStatus(401);
 *   }
 *   if (event.type === "vote.created" && !event.data.test) rewardVoter(event.data.voter_id);
 *   res.sendStatus(204);
 * });
 * ```
 */
export function constructWebhookEvent(
    rawBody: RawBody,
    signature: string | null | undefined,
    secret: string
): WebhookEvent {
    if (!verifyWebhookSignature(rawBody, signature, secret)) {
        throw new ForgeWebhookError("Invalid webhook signature");
    }
    const text = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
    try {
        return JSON.parse(text) as WebhookEvent;
    } catch {
        throw new ForgeWebhookError("Webhook body is not valid JSON");
    }
}

/**
 * Checks the `Authorization` header of a legacy vote webhook. DiscordForge sends
 * your webhook secret as-is in that header.
 */
export function verifyLegacyWebhook(authorization: string | null | undefined, secret: string): boolean {
    if (!secret) throw new Error("A webhook secret is required");
    if (!authorization || typeof authorization !== "string") return false;
    return safeEqual(authorization, secret);
}

/**
 * Verifies a legacy vote webhook and returns its payload.
 * Accepts the parsed JSON body or the raw body.
 * Throws {@link ForgeWebhookError} when the secret doesn't match.
 *
 * @example
 * ```js
 * app.post("/vote", express.json(), (req, res) => {
 *   let vote;
 *   try {
 *     vote = parseLegacyVoteWebhook(req.body, req.get("authorization"), process.env.FORGE_WEBHOOK_SECRET);
 *   } catch {
 *     return res.sendStatus(401);
 *   }
 *   if (!vote.isTest) rewardVoter(vote.id);
 *   res.sendStatus(204);
 * });
 * ```
 */
export function parseLegacyVoteWebhook(
    body: RawBody | LegacyVoteWebhookPayload,
    authorization: string | null | undefined,
    secret: string
): LegacyVoteWebhookPayload {
    if (!verifyLegacyWebhook(authorization, secret)) {
        throw new ForgeWebhookError("Invalid webhook authorization");
    }
    if (typeof body === "string" || body instanceof Uint8Array) {
        const text = typeof body === "string" ? body : Buffer.from(body).toString("utf8");
        try {
            return JSON.parse(text) as LegacyVoteWebhookPayload;
        } catch {
            throw new ForgeWebhookError("Webhook body is not valid JSON");
        }
    }
    return body;
}
