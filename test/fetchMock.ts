import { afterEach } from "bun:test";

export interface RecordedCall {
    url: URL;
    init: RequestInit;
    /** Settle a request created by `mockFetch.deferred()`. */
    respond(response: Response): void;
    fail(error: unknown): void;
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

const originalFetch = globalThis.fetch;
let restore: (() => void) | null = null;

afterEach(() => {
    restore?.();
    restore = null;
});

/**
 * Replaces `globalThis.fetch` for the current test. The mock honors
 * `init.signal` the same way real `fetch` does, rejecting with an
 * `AbortError` DOMException once the signal is aborted.
 *
 * With no handler, every request stays pending until the test calls
 * `respond()` or `fail()` on its entry in `calls`.
 */
export function mockFetch(handler?: Handler) {
    const calls: RecordedCall[] = [];

    const fn = (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());

        return new Promise<Response>((resolve, reject) => {
            const signal = init.signal;
            const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));

            if(signal?.aborted) return abort();
            signal?.addEventListener("abort", abort, { once: true });

            calls.push({ url, init, respond: resolve, fail: reject });

            if(handler) {
                Promise.resolve()
                    .then(() => handler(url, init))
                    .then(resolve, reject);
            }
        });
    };

    globalThis.fetch = fn as typeof fetch;
    restore = () => { globalThis.fetch = originalFetch; };

    return { calls };
}

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

/** Request headers with lowercased names. Supports plain-object and array forms. */
export function headersOf(init: RequestInit): Record<string, string> {
    const raw = init.headers ?? {};
    const entries = Array.isArray(raw) ? raw : Object.entries(raw);
    return Object.fromEntries(entries.map(([ k, v ]) => [ k!.toLowerCase(), v! ]));
}
