import { QueryClient } from '@tanstack/react-query';
import { initClient } from '@ts-rest/core';
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
 * A second, non-React client for calls that don't originate from a component's render —
 * `lib/upload-manager.tsx`'s queue processor drives `files.createUploadUrl`/`files.complete`
 * itself (one file's phase 1/phase 3 calls happen whenever its turn in the concurrency-capped
 * queue comes up, not in response to a single click), so those two calls go through this
 * instead of a `tsr.*.useMutation()` hook. Unlike the react-query wrapper (see the comment
 * below), this client resolves with `{ status, body }` for every status declared in the
 * contract — including 409/413 — rather than throwing, which is exactly what the upload
 * manager's per-error-kind branching needs.
 */
export const apiClient = initClient(contract, {
  baseUrl: API_BASE,
  credentials: 'include',
});

/**
 * @ts-rest/react-query's v5 client throws the raw `{ status, body, headers }` result for
 * any non-2xx response (confirmed by reading the installed package's source — it is not
 * limited to statuses undeclared in the contract). This is how a 401 from `GET /auth/me`
 * actually surfaces: as a react-query error, never as a `data.status === 401` success.
 *
 * Exported (not just used below for the retry policy) — `folder-route.tsx`/`file-route.tsx`
 * use this to tell a 404 apart from every other failure, to show `NotFoundState` only for
 * a confirmed "not found", not for a network error or a 500.
 */
export function isTsRestErrorWithStatus(error: unknown, status: number): boolean {
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
