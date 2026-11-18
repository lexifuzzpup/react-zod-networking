import { describe, expect, test } from "bun:test";
import { NetworkResource } from "./networkResource";
import { headersOf, json, mockFetch } from "./test/fetchMock";

describe("NetworkResource.fetch", () => {
    describe("SEARCH encoding", () => {
        test("encodes data as search params and sends no body", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/items"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                data: { page: 2, q: "hello world", active: true }
            });

            const [ call ] = calls;
            expect(call!.init.method).toBe("GET");
            expect(call!.init.body).toBeUndefined();
            expect(call!.url.searchParams.get("page")).toBe("2");
            expect(call!.url.searchParams.get("q")).toBe("hello world");
            expect(call!.url.searchParams.get("active")).toBe("true");
            expect(headersOf(call!.init)["content-type"]).toBeUndefined();
        });

        test("JSON-encodes object and array values", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/items"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                data: { filter: { tag: "a" }, ids: [ 1, 2 ] }
            });

            expect(calls[0]!.url.searchParams.get("filter")).toBe('{"tag":"a"}');
            expect(calls[0]!.url.searchParams.get("ids")).toBe("[1,2]");
        });

        test("skips undefined values", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/items"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                data: { a: undefined, b: 1 }
            });

            expect(calls[0]!.url.searchParams.has("a")).toBe(false);
            expect(calls[0]!.url.searchParams.get("b")).toBe("1");
        });

        test("keeps search params already on the URL", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/items?sort=asc"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                data: { page: 1 }
            });

            expect(calls[0]!.url.searchParams.get("sort")).toBe("asc");
            expect(calls[0]!.url.searchParams.get("page")).toBe("1");
        });
    });

    describe("JSON encoding", () => {
        test("sends data as a JSON body with a Content-Type header", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/items"), {
                method: "POST",
                encodingMethod: NetworkResource.BodyEncodingMethod.JSON,
                data: { name: "widget", tags: [ "a" ] }
            });

            const [ call ] = calls;
            expect(call!.init.method).toBe("POST");
            expect(JSON.parse(call!.init.body as string)).toEqual({ name: "widget", tags: [ "a" ] });
            expect(headersOf(call!.init)["content-type"]).toBe("application/json");
            expect(call!.url.search).toBe("");
        });

        test("sends an empty object when no data is given", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/items"), {
                method: "POST",
                encodingMethod: NetworkResource.BodyEncodingMethod.JSON
            });

            expect(calls[0]!.init.body).toBe("{}");
        });
    });

    describe("authorization", () => {
        test("sets the Authorization header when provided", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                authorization: "Bearer abc123"
            });

            expect(headersOf(calls[0]!.init)["authorization"]).toBe("Bearer abc123");
        });

        test("omits the Authorization header when not provided", async () => {
            const { calls } = mockFetch(() => json({}));

            await NetworkResource.fetch(new URL("http://api.test/"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH
            });

            expect(headersOf(calls[0]!.init)["authorization"]).toBeUndefined();
        });
    });

    describe("responses", () => {
        test("returns parsed content for a successful response", async () => {
            mockFetch(() => json({ id: 1, name: "widget" }, 201));

            const response = await NetworkResource.fetch(new URL("http://api.test/"), {
                method: "POST",
                encodingMethod: NetworkResource.BodyEncodingMethod.JSON
            });

            expect(response).toEqual({ status: 201, content: { id: 1, name: "widget" }, error: undefined });
        });

        test("returns the parsed error body for a failed response", async () => {
            mockFetch(() => json({ message: "Not found" }, 404));

            const response = await NetworkResource.fetch(new URL("http://api.test/"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH
            });

            expect(response).toEqual({ status: 404, content: undefined, error: { message: "Not found" } });
        });

        test("does not throw on a successful response with no body (204)", async () => {
            mockFetch(() => new Response(null, { status: 204 }));

            const response = await NetworkResource.fetch(new URL("http://api.test/items/1"), {
                method: "DELETE",
                encodingMethod: NetworkResource.BodyEncodingMethod.JSON
            });

            expect(response.status).toBe(204);
            expect(response.error).toBeUndefined();
        });

        test("rejects when the network request itself fails", async () => {
            mockFetch(() => { throw new TypeError("Failed to fetch"); });

            const promise = NetworkResource.fetch(new URL("http://api.test/"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH
            });

            await expect(promise).rejects.toThrow("Failed to fetch");
        });
    });

    describe("abort signal", () => {
        test("passes the signal through to fetch", async () => {
            const { calls } = mockFetch(() => json({}));
            const controller = new AbortController();

            await NetworkResource.fetch(new URL("http://api.test/"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                signal: controller.signal
            });

            // Compare by identity: printing a diff of a happy-dom AbortSignal hangs Bun.
            expect(calls[0]!.init.signal === controller.signal).toBe(true);
        });

        test("rejects with an AbortError when the signal is aborted", async () => {
            mockFetch();
            const controller = new AbortController();

            const promise = NetworkResource.fetch(new URL("http://api.test/"), {
                method: "GET",
                encodingMethod: NetworkResource.BodyEncodingMethod.SEARCH,
                signal: controller.signal
            });
            controller.abort();

            // Bounded explicitly so that a request that ignores the signal fails fast instead of hanging.
            const outcome = await Promise.race([
                promise.then(() => "resolved", e => e?.name),
                Bun.sleep(200).then(() => "still pending")
            ]);
            expect(outcome).toBe("AbortError");
        });
    });
});

describe("method wrappers", () => {
    const jsonMethods = [
        [ "post", "POST" ],
        [ "put", "PUT" ],
        [ "patch", "PATCH" ],
        [ "del", "DELETE" ],
        [ "query", "QUERY" ]
    ] as const;

    test.each(jsonMethods)("%s() sends a %s request with a JSON body", async (fn, method) => {
        const { calls } = mockFetch(() => json({ ok: true }));

        const response = await NetworkResource[fn]("/api/items", { data: { a: 1 }, authorization: "Bearer t" });

        const [ call ] = calls;
        expect(call!.init.method).toBe(method);
        expect(call!.init.body).toBe('{"a":1}');
        expect(headersOf(call!.init)["authorization"]).toBe("Bearer t");
        expect(response).toEqual({ status: 200, content: { ok: true }, error: undefined });
    });

    test("get() sends a GET request with data in search params", async () => {
        const { calls } = mockFetch(() => json([]));

        await NetworkResource.get("/api/items", { data: { page: 3 } });

        expect(calls[0]!.init.method).toBe("GET");
        expect(calls[0]!.init.body).toBeUndefined();
        expect(calls[0]!.url.searchParams.get("page")).toBe("3");
    });

    test("resolves relative URLs against the document origin", async () => {
        const { calls } = mockFetch(() => json({}));

        await NetworkResource.get("/api/items");

        expect(calls[0]!.url.href).toBe("http://localhost:3000/api/items");
    });

    test("leaves absolute URLs unchanged", async () => {
        const { calls } = mockFetch(() => json({}));

        await NetworkResource.post(new URL("https://other.test/x"));

        expect(calls[0]!.url.href).toBe("https://other.test/x");
    });
});
