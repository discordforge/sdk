import { EventEmitter } from "node:events";
import { ForgeAPIError } from "./errors";
import type { LiveEventsOptions, WebhookEvent, WebhookEventOf, WebhookEventType } from "./types";

/** Opens one HTTP connection to the event stream. Supplied by {@link ForgeClient}. */
export type EventStreamConnector = (lastEventId: string | undefined, signal: AbortSignal) => Promise<Response>;

/** Turns a non-2xx stream response into an error. Supplied by {@link ForgeClient} so the API key is redacted. */
export type EventStreamErrorFactory = (response: Response) => Promise<ForgeAPIError>;

const IDLE_TIMEOUT_MS = 45_000; // the server sends a keepalive every 15 s
const MAX_BACKOFF_MS = 30_000;
const FATAL_STATUSES = new Set([400, 401, 403, 404]);

type Listener<T> = (value: T) => void;

/**
 * A live connection to `GET /api/v1/bots/events`.
 *
 * Reconnects on its own (the server closes streams about every 50 seconds) and
 * resumes from the last event it saw, so events aren't lost between connections.
 * Stops on authentication errors.
 *
 * Use it as an event emitter or iterate it with `for await`.
 *
 * @example
 * ```js
 * const stream = client.events({ types: ["vote.created"] });
 * stream.on("vote.created", (event) => rewardVoter(event.data.voter_id));
 * stream.on("error", console.error);
 * // later
 * stream.close();
 * ```
 */
export class LiveEventStream extends EventEmitter implements AsyncIterable<WebhookEvent> {
    private readonly connector: EventStreamConnector;
    private readonly toError: EventStreamErrorFactory;
    private readonly maxRetries: number;
    private controller: AbortController | null = null;
    private retryMs = 1_000;
    private closed = false;
    private _lastEventId: string | undefined;

    constructor(connector: EventStreamConnector, toError: EventStreamErrorFactory, options: LiveEventsOptions = {}) {
        super();
        this.connector = connector;
        this.toError = toError;
        this.maxRetries = options.maxRetries ?? Infinity;
        this._lastEventId = options.lastEventId;
        // Let callers attach listeners before the first connection.
        queueMicrotask(() => void this.run());
    }

    /** ID of the last event received. Pass it as `lastEventId` to resume later. */
    public get lastEventId(): string | undefined {
        return this._lastEventId;
    }

    /** Whether `close()` was called or the stream gave up. */
    public get isClosed(): boolean {
        return this.closed;
    }

    /** Stop the stream. No more events are emitted. */
    public close(): void {
        if (this.closed) return;
        this.closed = true;
        this.controller?.abort();
        this.emit("close");
    }

    public override on(event: "event", listener: Listener<WebhookEvent>): this;
    public override on<T extends WebhookEventType>(event: T, listener: Listener<WebhookEventOf<T>>): this;
    public override on(event: "connect" | "disconnect" | "close", listener: () => void): this;
    public override on(event: "error", listener: Listener<Error>): this;
    public override on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public override once(event: "event", listener: Listener<WebhookEvent>): this;
    public override once<T extends WebhookEventType>(event: T, listener: Listener<WebhookEventOf<T>>): this;
    public override once(event: "connect" | "disconnect" | "close", listener: () => void): this;
    public override once(event: "error", listener: Listener<Error>): this;
    public override once(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }

    /** Iterate events as they arrive. Ends when the stream closes; breaking out closes it. */
    public async *[Symbol.asyncIterator](): AsyncIterator<WebhookEvent> {
        const queue: WebhookEvent[] = [];
        let wake: (() => void) | null = null;
        const onEvent = (event: WebhookEvent) => {
            queue.push(event);
            wake?.();
        };
        const onClose = () => wake?.();
        this.on("event", onEvent);
        this.on("close", onClose);
        try {
            while (true) {
                if (queue.length) {
                    yield queue.shift()!;
                    continue;
                }
                if (this.closed) return;
                await new Promise<void>((resolve) => (wake = resolve));
                wake = null;
            }
        } finally {
            this.off("event", onEvent);
            this.off("close", onClose);
            this.close();
        }
    }

    private reportError(error: Error): void {
        // An "error" event without listeners would throw; only emit when someone listens.
        if (this.listenerCount("error") > 0) this.emit("error", error);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const onClose = () => {
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(() => {
                this.off("close", onClose);
                resolve();
            }, ms);
            super.once("close", onClose);
        });
    }

    private async run(): Promise<void> {
        let failures = 0;

        while (!this.closed) {
            this.controller = new AbortController();
            let response: Response;
            try {
                response = await this.connector(this._lastEventId, this.controller.signal);
            } catch (error) {
                if (this.closed) return;
                failures++;
                this.reportError(error instanceof Error ? error : new Error(String(error)));
                if (failures > this.maxRetries) return this.close();
                await this.sleep(Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (failures - 1)));
                continue;
            }

            if (!response.ok) {
                const error = await this.toError(response);
                this.reportError(error);
                if (FATAL_STATUSES.has(response.status)) return this.close();
                failures++;
                if (failures > this.maxRetries) return this.close();
                const retryAfter = error.retryAfter ? error.retryAfter * 1000 : 0;
                await this.sleep(Math.max(retryAfter, Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (failures - 1))));
                continue;
            }

            failures = 0;
            this.emit("connect");
            try {
                await this.consume(response, this.controller);
            } catch (error) {
                if (!this.closed && !(error instanceof Error && error.name === "AbortError")) {
                    this.reportError(error instanceof Error ? error : new Error(String(error)));
                }
            }
            if (this.closed) return;
            this.emit("disconnect");
            await this.sleep(this.retryMs);
        }
    }

    /** Reads one connection until it ends, dispatching parsed SSE messages. */
    private async consume(response: Response, controller: AbortController): Promise<void> {
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let idle: ReturnType<typeof setTimeout> | undefined;
        const resetIdle = () => {
            clearTimeout(idle);
            idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
        };

        let data: string[] = [];
        let eventId: string | undefined;

        const dispatch = () => {
            if (eventId !== undefined) this._lastEventId = eventId;
            if (data.length) {
                try {
                    const event = JSON.parse(data.join("\n")) as WebhookEvent;
                    this.emit("event", event);
                    this.emit(event.type, event);
                } catch {
                    this.reportError(new Error("Received an event that is not valid JSON"));
                }
            }
            data = [];
            eventId = undefined;
        };

        resetIdle();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                resetIdle();
                buffer += decoder.decode(value, { stream: true });

                let newline: number;
                while ((newline = buffer.search(/\r\n|\r|\n/)) >= 0) {
                    const line = buffer.slice(0, newline);
                    buffer = buffer.slice(newline + (buffer.startsWith("\r\n", newline) ? 2 : 1));

                    if (line === "") {
                        dispatch();
                        continue;
                    }
                    if (line.startsWith(":")) continue;

                    const colon = line.indexOf(":");
                    const field = colon === -1 ? line : line.slice(0, colon);
                    let value = colon === -1 ? "" : line.slice(colon + 1);
                    if (value.startsWith(" ")) value = value.slice(1);

                    if (field === "data") data.push(value);
                    else if (field === "id") eventId = value;
                    else if (field === "retry" && /^\d+$/.test(value)) this.retryMs = parseInt(value, 10);
                }
            }
        } finally {
            clearTimeout(idle);
            reader.releaseLock();
        }
    }
}
