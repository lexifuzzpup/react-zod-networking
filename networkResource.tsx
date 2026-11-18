export namespace NetworkResource {
    export type ErrorType = { [ key: string ]: any };

    export type Response = { status: number } & ({ content: object, error: undefined } | { content: undefined, error: ErrorType });

    export enum BodyEncodingMethod {
        JSON, SEARCH
    }

    export interface FetchOptions {
        /**
         * Body of the request. This is encoded differently depending
         * on the body encoding method option.
         */
        data?: object;

        /**
         * Request method, eg. `GET`, `POST`, `PUT`
         * 
         * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods
         */
        method: string;

        /**
         * How to encode the body of the request. GET requests cannot
         * have a body, and must be encoded in search parameters, for
         * example, while POST requests can have a body.
         */
        encodingMethod: BodyEncodingMethod;

        /**
         * Authorization header string to send to the server. If this
         * isn't specified, no header is set.
         */
        authorization?: string;

        /**
         * Abort signal for making the request.
         * 
         * See https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
         */
        signal?: AbortSignal;
    }

    /**
     * Safely make a request, returning a result with a status and
     * either an error or response content.
     */
    export async function fetch(url: URL, options: FetchOptions): Promise<Response> {
        const headers: HeadersInit = {};
        const request: RequestInit = { method: options.method, headers };

        const data = options.data ?? {};

        if(options.authorization != null) {
            headers["Authorization"] = options.authorization;
        }

        if(options.encodingMethod === BodyEncodingMethod.JSON) {
            request.body = JSON.stringify(data);
            headers["Content-Type"] = "application/json";
        } else if(options.encodingMethod === BodyEncodingMethod.SEARCH) {
            for(const [ key, value ] of Object.entries(data)) {
                if(value === undefined) continue;

                if(typeof value != "object") {
                    url.searchParams.set(key, value as any);
                } else {
                    url.searchParams.set(key, JSON.stringify(value));
                }
            }
        }

        const response = await globalThis.fetch(url, request);

        if(response.ok) {
            return {
                status: response.status,
                error: undefined,
                content: await response.json()
            };
        } else {
            try {
                return {
                    status: response.status,
                    error: await response.json(),
                    content: undefined
                };
            } catch(e) {
                return {
                    status: response.status,
                    error: { message: "Failed to parse error response", cause: e },
                    content: undefined
                };
            }
        }
    }

    export interface WrappedFetchOptions {
        /**
         * Body of the request. This is encoded differently depending
         * on the body encoding method option.
         */
        data?: object;

        /**
         * Authorization header string to send to the server. If this
         * isn't specified, no header is set.
         */
        authorization?: string;

        /**
         * Abort signal for making the request.
         * 
         * See https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
         */
        signal?: AbortSignal;
    }

    /**
     * Safely make a GET request, returning a result with a status and
     * either an error or response content.
     */
    export async function get(url: string, options: WrappedFetchOptions = {}) {
        return await NetworkResource.fetch(
            new URL(url, document.location.origin),
            {
                ...options,
                method: "GET",
                encodingMethod: BodyEncodingMethod.SEARCH
            }
        );
    }

    /**
     * Safely make a QUERY request, returning a result with a status and
     * either an error or response content.
     */
    export async function query(url: string, options: WrappedFetchOptions = {}) {
        return await NetworkResource.fetch(
            new URL(url, document.location.origin),
            {
                ...options,
                method: "QUERY",
                encodingMethod: BodyEncodingMethod.JSON
            }
        );
    }

    /**
     * Safely make a POST request, returning a result with a status and
     * either an error or response content.
     */
    export async function post(url: string | URL, options: WrappedFetchOptions = {}) {
        return await NetworkResource.fetch(
            new URL(url, document.location.origin),
            {
                ...options,
                method: "POST",
                encodingMethod: BodyEncodingMethod.JSON
            }
        );
    }

    /**
     * Safely make a PUT request, returning a result with a status and
     * either an error or response content.
     */
    export async function put(url: string | URL, options: WrappedFetchOptions = {}) {
        return await NetworkResource.fetch(
            new URL(url, document.location.origin),
            {
                ...options,
                method: "PUT",
                encodingMethod: BodyEncodingMethod.JSON
            }
        );
    }

    /**
     * Safely make a DELETE request, returning a result with a status and
     * either an error or response content.
     */
    export async function del(url: string, options: WrappedFetchOptions = {}) {
        return await NetworkResource.fetch(
            new URL(url, document.location.origin),
            {
                ...options,
                method: "DELETE",
                encodingMethod: BodyEncodingMethod.JSON
            }
        );
    }

    /**
     * Safely make a PATCH request, returning a result with a status and
     * either an error or response content.
     */
    export async function patch(url: string | URL, options: WrappedFetchOptions = {}) {
        return await NetworkResource.fetch(
            new URL(url, document.location.origin),
            {
                ...options,
                method: "PATCH",
                encodingMethod: BodyEncodingMethod.JSON
            }
        );
    }
}