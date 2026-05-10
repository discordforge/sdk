/**
 * Thrown on non-2xx API responses. Parses `retry-after` and
 * `x-ratelimit-reset` headers when present.
 *
 * @example
 * ```js
 * try {
 *   await client.postStats({ serverCount: 100 });
 * } catch (err) {
 *   if (err instanceof ForgeAPIError && err.status === 429) {
 *     console.log(`Rate limited – retry after ${err.retryAfter}s`);
 *   }
 * }
 * ```
 */
export class ForgeAPIError extends Error {
    public readonly status: number;
    public readonly body: unknown;
    public readonly resetAfter?: number;
    public readonly retryAfter?: number;

    constructor(message: string, status: number, body: unknown, headers?: Headers) {
        super(message);
        this.name = 'ForgeAPIError';
        this.status = status;
        this.body = body;

        if (headers) {
            const resetAfterHeader = headers.get('x-ratelimit-reset');
            const retryAfterHeader = headers.get('retry-after');
            if (resetAfterHeader) this.resetAfter = parseInt(resetAfterHeader, 10);
            if (retryAfterHeader) this.retryAfter = parseInt(retryAfterHeader, 10);
        }

        Object.setPrototypeOf(this, ForgeAPIError.prototype);
    }
}
