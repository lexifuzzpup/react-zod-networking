import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import z from "zod";
import { useNetworkJsonResource } from "./networkResourceHook";
import { headersOf, json, mockFetch } from "./test/fetchMock";

const networkError = () => new TypeError("Failed to fetch");

let consoleError: ReturnType<typeof spyOn>;

beforeEach(() => {
    // The hook logs failures; keep test output readable.
    consoleError = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    consoleError.mockRestore();
});

/** Calls reload() and returns its result once the request settles. */
async function reload(hook: { current: { reload(): Promise<boolean> } }) {
    let ok!: boolean;
    await act(async () => { ok = await hook.current.reload(); });
    return ok;
}

describe("useNetworkJsonResource", () => {
    describe("auto fetch", () => {
        test("fetches on mount and exposes the result", async () => {
            const { calls } = mockFetch(() => json({ id: 1 }));

            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item" }));

            expect(result.current.loading).toBe(true);
            await waitFor(() => expect(result.current.result).toEqual({ id: 1 }));

            expect(result.current.loading).toBe(false);
            expect(result.current.status).toBe(200);
            expect(result.current.error).toBeNull();
            expect(calls).toHaveLength(1);
            expect(calls[0]!.init.method).toBe("GET");
            expect(calls[0]!.url.href).toBe("http://localhost:3000/api/item");
        });

        test("sends the authorization header", async () => {
            const { calls } = mockFetch(() => json({}));

            renderHook(() => useNetworkJsonResource({ url: "/api/item", authorization: "Bearer xyz" }));

            await waitFor(() => expect(calls).toHaveLength(1));
            expect(headersOf(calls[0]!.init)["authorization"]).toBe("Bearer xyz");
        });

        test("does not fetch when autoFetch is false", async () => {
            const { calls } = mockFetch(() => json({}));

            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", autoFetch: false }));
            await Bun.sleep(20);

            expect(calls).toHaveLength(0);
            expect(result.current).toMatchObject({ loading: false, result: null, status: null, error: null });
        });

        test("refetches when the url changes", async () => {
            const { calls } = mockFetch(url => json({ path: url.pathname }));

            const { result, rerender } = renderHook(
                ({ url }) => useNetworkJsonResource({ url }),
                { initialProps: { url: "/api/a" } }
            );
            await waitFor(() => expect(result.current.result).toEqual({ path: "/api/a" }));

            rerender({ url: "/api/b" });
            await waitFor(() => expect(result.current.result).toEqual({ path: "/api/b" }));
            expect(calls).toHaveLength(2);
        });

        test("re-rendering with the same props does not refetch or drop the in-flight request", async () => {
            const { calls } = mockFetch();

            const { result, rerender } = renderHook(() => useNetworkJsonResource({ url: "/api/item" }));
            await waitFor(() => expect(calls).toHaveLength(1));

            rerender();
            rerender();
            calls[0]!.respond(json({ id: 1 }));

            await waitFor(() => expect(result.current.result).toEqual({ id: 1 }));
            expect(calls).toHaveLength(1);
        });
    });

    describe("schema", () => {
        const Item = z.object({ id: z.number() });

        test("parses the response with the schema", async () => {
            mockFetch(() => json({ id: 1, extra: "stripped" }));

            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", schema: Item }));

            await waitFor(() => expect(result.current.result).toEqual({ id: 1 }));
        });

        test("a response that fails validation counts as a failure", async () => {
            mockFetch(() => json({ id: "not a number" }));

            const { result } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", schema: Item, autoFetch: false })
            );

            expect(await reload(result)).toBe(false);
            expect(result.current.result).toBeNull();
            expect(result.current.status).toBe(200);
        });

        test("loading is false after a response fails validation", async () => {
            mockFetch(() => json({ id: "not a number" }));

            const { result } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", schema: Item, autoFetch: false })
            );

            await reload(result);
            expect(result.current.loading).toBe(false);
        });
    });

    describe("error responses", () => {
        test("exposes the error body and status", async () => {
            mockFetch(() => json({ message: "Nope" }, 403));

            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", autoFetch: false }));

            expect(await reload(result)).toBe(true);
            expect(result.current).toMatchObject({
                loading: false,
                result: null,
                status: 403,
                error: { message: "Nope" }
            });
        });
    });

    describe("network failures", () => {
        test("reload() resolves false and status stays null", async () => {
            mockFetch(() => { throw networkError(); });

            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", autoFetch: false }));

            expect(await reload(result)).toBe(false);
            expect(result.current.status).toBeNull();
            expect(result.current.result).toBeNull();
        });

        test("loading is false after a network failure", async () => {
            mockFetch(() => { throw networkError(); });

            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", autoFetch: false }));

            await reload(result);
            expect(result.current.loading).toBe(false);
        });
    });

    describe("retries", () => {
        test("retries failed requests up to maxAttempts", async () => {
            let n = 0;
            const { calls } = mockFetch(() => {
                if(++n < 3) throw networkError();
                return json({ ok: true });
            });
            const retryInterval = mock((_attempt: number) => 10);

            const { result } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", maxAttempts: 3, retryInterval })
            );

            await waitFor(() => expect(result.current.result).toEqual({ ok: true }));
            expect(calls).toHaveLength(3);
            expect(retryInterval.mock.calls.map(c => c[0])).toEqual([ 1, 2 ]);
        });

        test("gives up after maxAttempts", async () => {
            const { calls } = mockFetch(() => { throw networkError(); });

            renderHook(() => useNetworkJsonResource({ url: "/api/item", maxAttempts: 2, retryInterval: () => 10 }));

            await waitFor(() => expect(calls).toHaveLength(2));
            await Bun.sleep(50);
            expect(calls).toHaveLength(2);
        });

        test("does not retry by default", async () => {
            const { calls } = mockFetch(() => { throw networkError(); });

            renderHook(() => useNetworkJsonResource({ url: "/api/item" }));

            await waitFor(() => expect(calls).toHaveLength(1));
            await Bun.sleep(50);
            expect(calls).toHaveLength(1);
        });

        test("does not retry HTTP error responses", async () => {
            const { calls } = mockFetch(() => json({ message: "boom" }, 500));

            const { result } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", maxAttempts: 3, retryInterval: () => 10 })
            );

            await waitFor(() => expect(result.current.status).toBe(500));
            await Bun.sleep(50);
            expect(calls).toHaveLength(1);
        });

        test("a new url gets a fresh retry budget", async () => {
            let bAttempts = 0;
            const { calls } = mockFetch(url => {
                if(url.pathname === "/api/a") throw networkError();
                if(++bAttempts < 2) throw networkError();
                return json({ ok: true });
            });

            const { result, rerender } = renderHook(
                ({ url }) => useNetworkJsonResource({ url, maxAttempts: 2, retryInterval: () => 10 }),
                { initialProps: { url: "/api/a" } }
            );
            await waitFor(() => expect(calls).toHaveLength(2));
            await Bun.sleep(30);

            rerender({ url: "/api/b" });

            await waitFor(() => expect(result.current.result).toEqual({ ok: true }));
        });

        test("stops retrying after unmount", async () => {
            const { calls } = mockFetch();

            const { unmount } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", maxAttempts: 5, retryInterval: () => 10 })
            );
            await waitFor(() => expect(calls).toHaveLength(1));

            unmount();
            calls[0]!.fail(networkError());
            await Bun.sleep(60);

            expect(calls).toHaveLength(1);
        });
    });

    describe("cachePrevious", () => {
        test("when false, clears the previous result while reloading", async () => {
            const { calls } = mockFetch();
            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", autoFetch: false }));

            act(() => { result.current.reload(); });
            await act(async () => { calls[0]!.respond(json({ v: 1 })); });
            await waitFor(() => expect(result.current.result).toEqual({ v: 1 }));

            act(() => { result.current.reload(); });

            expect(result.current.loading).toBe(true);
            expect(result.current.result).toBeNull();
            expect(result.current.status).toBeNull();
        });

        test("when true, keeps the previous result while reloading", async () => {
            const { calls } = mockFetch();
            const { result } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", autoFetch: false, cachePrevious: true })
            );

            act(() => { result.current.reload(); });
            await act(async () => { calls[0]!.respond(json({ v: 1 })); });
            await waitFor(() => expect(result.current.result).toEqual({ v: 1 }));

            act(() => { result.current.reload(); });

            expect(result.current.loading).toBe(true);
            expect(result.current.result).toEqual({ v: 1 });
            expect(result.current.status).toBe(200);
        });

        test("when true, clears a previous error after a successful reload", async () => {
            let fail = true;
            mockFetch(() => fail ? json({ message: "down" }, 503) : json({ v: 1 }));

            const { result } = renderHook(() =>
                useNetworkJsonResource({ url: "/api/item", autoFetch: false, cachePrevious: true })
            );

            await reload(result);
            expect(result.current.error).toEqual({ message: "down" });

            fail = false;
            await reload(result);

            expect(result.current.result).toEqual({ v: 1 });
            expect(result.current.error).toBeNull();
        });
    });

    describe("cancellation", () => {
        test("reload() aborts the previous in-flight request", async () => {
            const { calls } = mockFetch();
            const { result } = renderHook(() => useNetworkJsonResource({ url: "/api/item", autoFetch: false }));

            act(() => { result.current.reload(); });
            act(() => { result.current.reload(); });

            expect(calls).toHaveLength(2);
            expect(calls[0]!.init.signal?.aborted).toBe(true);
            expect(calls[1]!.init.signal?.aborted).toBe(false);
        });

        test("unmounting aborts the in-flight request", async () => {
            const { calls } = mockFetch();
            const { unmount } = renderHook(() => useNetworkJsonResource({ url: "/api/item" }));
            await waitFor(() => expect(calls).toHaveLength(1));

            unmount();

            expect(calls[0]!.init.signal?.aborted).toBe(true);
        });

        test("a slow response for an old url does not overwrite the new url's result", async () => {
            const { calls } = mockFetch();

            const { result, rerender } = renderHook(
                ({ url }) => useNetworkJsonResource({ url }),
                { initialProps: { url: "/api/a" } }
            );
            await waitFor(() => expect(calls).toHaveLength(1));

            rerender({ url: "/api/b" });
            await waitFor(() => expect(calls).toHaveLength(2));

            await act(async () => { calls[1]!.respond(json({ from: "b" })); });
            await waitFor(() => expect(result.current.result).toEqual({ from: "b" }));

            await act(async () => { calls[0]!.respond(json({ from: "a" })); });
            await Bun.sleep(20);

            expect(result.current.result).toEqual({ from: "b" });
        });
    });
});
