/**
 * aiGatewayFetch: resilient wrapper around fetch for AI gateway and
 * server-to-server calls.
 *
 * Adds a timeout (via AbortController) and optional retry on transient
 * failures. It keeps fetch semantics: it returns the Response whenever the
 * server answers (including 4xx and 5xx after retries are exhausted), so the
 * caller keeps its own .ok handling. It throws ONLY on a network error or a
 * timeout after every attempt is used.
 *
 * Retry is opt-in. Default retries = 0, so the wrapper is a pure timeout unless
 * the caller asks for retries. Retries fire only on transient conditions:
 * HTTP 429, 500, 502, 503, 504 and network/abort errors. Client errors
 * (400, 401, 403, 404 and any other 4xx) are returned immediately, never
 * retried. A timeout (abort) is retried by default; pass retryOnTimeout: false
 * to fail fast on a timeout (network errors still retry).
 */

export interface AiGatewayFetchOpts {
  /** Abort the request after this many milliseconds. Default 60000. */
  timeoutMs?: number;
  /** Number of EXTRA attempts after the first. Default 0 (retry disabled). */
  retries?: number;
  /**
   * Retry a timeout (abort) when attempts remain. Default true, which keeps the
   * existing behaviour. Set false for a user-blocking caller that should fail
   * fast on a timeout instead of waiting another full timeout window. Network
   * errors (not aborts) and transient status retries are unaffected.
   */
  retryOnTimeout?: boolean;
}

/** HTTP statuses worth retrying: transient server and rate-limit conditions. */
const TRANSIENT_STATUS = new Set<number>([429, 500, 502, 503, 504]);

/** Exponential-ish backoff before the next attempt (retryIndex is 0-based). */
function backoffMs(retryIndex: number): number {
  const schedule = [500, 1500, 3000];
  return schedule[Math.min(retryIndex, schedule.length - 1)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function aiGatewayFetch(
  url: string,
  init: RequestInit,
  opts: AiGatewayFetchOpts = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const retries = opts.retries ?? 0;
  const retryOnTimeout = opts.retryOnTimeout ?? true;

  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      // Server answered. Retry only on a transient status, and only while
      // attempts remain. Drain the body first so the connection can be reused.
      if (TRANSIENT_STATUS.has(response.status) && attempt < retries) {
        await response.body?.cancel();
        await sleep(backoffMs(attempt));
        continue;
      }

      // Everything else (2xx, 3xx, any 4xx client error, and the final 5xx
      // after retries) is returned as-is so the caller keeps its .ok handling.
      return response;
    } catch (err) {
      // Network error or timeout (abort).
      lastNetworkError = err;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      // Retry while attempts remain. A timeout is retried only when the caller
      // opted in (default); network errors retry regardless. Status retries are
      // handled above and are unaffected.
      if (attempt < retries && (retryOnTimeout || !isAbort)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(
        isAbort
          ? `aiGatewayFetch: request timed out after ${timeoutMs}ms`
          : `aiGatewayFetch: network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable: the loop always returns a Response or throws. Present only so
  // the function provably returns a Response on every path.
  throw new Error(
    `aiGatewayFetch: exhausted ${retries} retries: ${
      lastNetworkError instanceof Error ? lastNetworkError.message : String(lastNetworkError)
    }`,
  );
}
