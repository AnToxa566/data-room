import type { User } from '@dataroom/contracts';

import { API_BASE, queryClient, tsr } from './api';

export type SettledAuthState =
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

export type CurrentUserState = { status: 'loading' } | SettledAuthState;

/**
 * `GET /api/auth/me` is the single source of truth for who is logged in. Called exactly
 * once, at the router root (see routes/router.tsx / app.tsx) — every other consumer reads
 * the already-resolved state via router context, so this is the only network call.
 *
 * A 401 throws (see lib/api.ts) and lands in `isError`, never `isSuccess` — it is treated
 * the same as any other failure: logged out, fail-closed. Nothing here reads, logs, or
 * surfaces `query.error`, so a 401 is never shown to the user as an error.
 */
export function useCurrentUser(): CurrentUserState {
  const query = tsr.auth.me.useQuery({ queryKey: ['auth', 'me'] });

  if (query.isPending) {
    return { status: 'loading' };
  }
  if (query.isSuccess) {
    return { status: 'authenticated', user: query.data.body };
  }
  return { status: 'unauthenticated' };
}

/**
 * OAuth requires a top-level navigation — an XHR to this endpoint would follow the
 * redirect to Google in the background and silently fail to move the user anywhere.
 *
 * `returnTo` (an in-app path, e.g. `window.location.pathname`) round-trips through the
 * OAuth handshake — see `apps/api/src/auth/return-to.util.ts` — so the callback can land
 * the visitor back where they started instead of the default `/`. Omit it (as both
 * existing call sites that have nothing to return to do) to get today's behavior.
 */
export function signInWithGoogle(returnTo?: string): void {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  window.location.href = `${API_BASE}/auth/google${query}`;
}

/**
 * Sign-out deliberately does not navigate anywhere itself. `invalidateQueries` forces the
 * still-mounted `/auth/me` observer to refetch — `queryClient.clear()` does *not*
 * reliably do this: it destroys the cached query, but a mounted observer has no reason to
 * rebuild and refetch it without a render triggering `setOptions`, so nothing happens
 * until something else re-renders the app (verified empirically — `clear()` alone left
 * the app stuck showing the stale authenticated page). Once the refetch resolves 401,
 * `useCurrentUser()` flips to `unauthenticated`, which makes the app mount a fresh
 * unauthenticated router (see app.tsx — this requires `<RouterProvider key={key} .../>`;
 * without the `key`, react-router's `Transitioner` never resolves the new router against
 * the current URL and sign-out silently leaves `/home` on screen). Sign-out can only
 * ever be triggered from `/home`
 * — the only route an authenticated user can be on, since `/` itself redirects them away
 * — so the new router's first match, against the still-current `/home` URL, hits
 * `/home`'s own `beforeLoad` guard and redirects to `/` for exactly the reason it always
 * does. That guard is what "navigates to /": a second, explicit `navigate()` call here
 * would run on the *old*, still-authenticated router before the refetch has landed, and
 * would immediately be sent right back to `/home` by `/`'s own "authenticated → /home"
 * guard.
 */
export function useSignOut(): () => void {
  const mutation = tsr.auth.logout.useMutation();
  return () => {
    // onSettled, not onSuccess: logout is documented idempotent and may legitimately
    // 401 if the session was already gone — the client-side cleanup should happen either
    // way.
    mutation.mutate(
      { body: undefined },
      {
        onSettled: () => {
          void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        },
      },
    );
  };
}
