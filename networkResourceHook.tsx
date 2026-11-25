import { useCallback, useEffect, useRef, useState } from "react";
import z, { ZodAny, ZodType } from "zod";
import { NetworkResource } from "./networkResource";

export interface NetworkJsonResourceOptions<Schema> {
    /**
     * Properly-structured URL string to fetch from
     */
    url: string,
    
    /**
     * A function to calculate how long until the next request
     * should be attempted, in case a fetch fails.
     * 
     * Defaults to 5000ms.
     * @param attempt 
     * @returns 
     */
    retryInterval?: (attempt: number) => number,

    /**
     * How many times the request should be attempted, in
     * case a request should be re-attempted when it fails.
     * 
     * Defaults to 1.
     */
    maxAttempts?: number,

    /**
     * Zod schema determining the desired response structure.
     * 
     * Defaults to ZodAny.
     */
    schema?: Schema,

    /**
     * Whether or not to cache the previous value. Useful if
     * you don't want a flash of content when refreshing.
     * 
     * Defaults to false.
     */
    cachePrevious?: boolean,

    /**
     * Whether or not to automatically send the request when
     * the hook is called and whenever requirements change.
     * 
     * Defaults to true.
     */
    autoFetch?: boolean,

    /**
     * Authorization header string to send to the server.
     * If this isn't specified, no header is set.
     */
    authorization?: string
}

export interface NetworkJsonResourceHook<Schema extends ZodType> {
    /**
     * True when the hook is making a network request, regardless of if
     * cachePrevious is set.
     */
    loading: boolean,
    
    /**
     * Last result from the network request, in the specified Zod schema
     */
    result: z.infer<Schema> | undefined,

    /**
     * NetworkResource error returned from the request
     */
    error: NetworkResource.ErrorType | undefined,

    /**
     * HTTP status code of the response.
     * 
     * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
     */
    status: number | undefined,

    /**
     * Re-sends the request to update the value stored in the hook.
     */
    reload(): Promise<boolean>
}

/**
 * Automatically fetches remote content using NetworkResource.get()
 */
export function useNetworkJsonResource<Schema extends ZodType = ZodAny>({
    url,
    retryInterval,
    maxAttempts,
    schema,
    autoFetch,
    cachePrevious,
    authorization
}: NetworkJsonResourceOptions<Schema>): NetworkJsonResourceHook<Schema> {
    retryInterval ??= () => 5000;
    maxAttempts ??= 1;
    autoFetch ??= true;
    cachePrevious ??= false;
    
    const [ loading, setLoading ] = useState<boolean>(false);
    const [ status, setStatus ] = useState<number | undefined>();
    const [ result, setResult ] = useState<z.infer<Schema> | undefined>();
    const [ error, setError ] = useState<NetworkResource.ErrorType | undefined>();
    
    const attempts = useRef(0);
    useEffect(() => { attempts.current = 0 }, [ url ]);

    const abortControllers = useRef<Set<AbortController>>(new Set);
    useEffect(() => () => {
        for(const abortController of abortControllers.current) {
            abortController.abort();
        }
        abortControllers.current.clear();
    }, [ cachePrevious, url, schema, authorization ]);

    const reload = useCallback(async () => {
        for(const abortController of abortControllers.current) {
            abortController.abort();
        }
        abortControllers.current.clear();

        setLoading(true);

        if(!cachePrevious) {
            setResult(undefined);
            setError(undefined);
            setStatus(undefined);
        }

        let successfulFetch = false;

        try {
            const abortController = new AbortController;
            
            abortControllers.current.add(abortController);
            const response = await NetworkResource.get(url, { authorization, signal: abortController.signal });
            abortControllers.current.delete(abortController);

            successfulFetch = true;
            setStatus(response.status);
            
            if(response.error) {
                setError(response.error);
            } else {
                if(cachePrevious) setError(undefined);

                if(schema) {
                    setResult(schema.parse(response.content));
                } else {
                    setResult(response.content as z.infer<Schema>);
                }
            }
        } catch(e: any) {
            if(!(e instanceof DOMException)) {
                console.error(e);
            }

            setResult(undefined);
            setError(undefined);

            return false;
        } finally {
            if(!successfulFetch) setStatus(undefined);
            setLoading(false);
        }

        return true;
    }, [ cachePrevious, url, schema, authorization ]);

    useEffect(() => {
        if(!autoFetch) return;

        let timeoutId: number | null = null;
        let unmounted = false;

        async function tryFetch() {
            attempts.current++;
            const success = await reload();

            if(success) return;

            if(attempts.current >= maxAttempts!) {
                console.error("Failed to fetch " + url + " after " + attempts.current + " attempt(s)");
                return;
            }

            const nextTimeout = retryInterval!(attempts.current);

            console.error("Failed to fetch " + url + ", retrying in " + nextTimeout + "ms");

            if(unmounted) return;
            timeoutId = setTimeout(tryFetch, nextTimeout) as any;
        }

        tryFetch();

        return () => {
            if(timeoutId != null) clearInterval(timeoutId);
            unmounted = true;
        }
    }, [ cachePrevious, url, schema, authorization ]);

    return { result, status, loading, reload, error };
}