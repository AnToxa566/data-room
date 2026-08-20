import { QueryClient } from '@tanstack/react-query';
import { initTsrReactQuery } from '@ts-rest/react-query/v5';

import { contract } from '@dataroom/contracts';

/**
 * Relative in every environment (see vite.config.mts's dev proxy and the root
 * vercel.json's rewrite) — the SPA never calls the API cross-origin, so the session
 * cookie is always first-party and no code branches on where it's running.
 */
export const API_BASE = import.meta.env.VITE_API_URL;

export const tsr = initTsrReactQuery(contract, {
  baseUrl: API_BASE,
  credentials: 'include',
});

/**
 * @ts-rest/react-query's v5 client throws the raw `{ status, body, headers }` result for
 * any non-2xx response (confirmed by reading the installed package's source — it is not
 * limited to statuses undeclared in the contract). This is how a 401 from `GET /auth/me`
 * actually surfaces: as a react-query error, never as a `data.status === 401` success.
 */
function isTsRestErrorWithStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === status
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // One retry, except a 401 — retrying an unauthenticated request just delays the
      // redirect a real network failure deserves one retry, a 401 deserves none.
      retry: (failureCount, error) =>
        isTsRestErrorWithStatus(error, 401) ? false : failureCount < 1,
    },
  },
});
