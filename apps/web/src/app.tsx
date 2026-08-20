import { useRef } from 'react';
import { RouterProvider } from '@tanstack/react-router';

import { createAppRouter, type AppRouter } from './routes/router';
import { useCurrentUser, type SettledAuthState } from './lib/auth';

export function App() {
  const auth = useCurrentUser();

  // The router is never mounted while auth is still loading — this is what prevents the
  // landing page (or a redirect) from flashing before an already-logged-in user reaches
  // /home, and vice versa. By the time it does mount, `auth` is already settled, so its
  // very first route match already has the correct context.
  if (auth.status === 'loading') {
    return <NeutralShell />;
  }

  return <SettledApp auth={auth} />;
}

function SettledApp({ auth }: { auth: SettledAuthState }) {
  // A derived string, not the `auth` object itself — useCurrentUser() returns a fresh
  // object literal every render even when nothing meaningfully changed, and recreating
  // the router on every one of those would be wasteful. `useMemo`'s dependency array
  // can't express "recompute when this derived key changes, using this other value" — so
  // the router is cached in a ref and rebuilt only when `key` no longer matches what it
  // was built with, computed directly during render (a standard alternative to `useMemo`
  // for custom-equality memoization).
  const key = auth.status === 'authenticated' ? `auth:${auth.user.id}` : 'anon';
  const cached = useRef<{ key: string; router: AppRouter } | null>(null);
  if (cached.current?.key !== key) {
    cached.current = { key, router: createAppRouter({ auth }) };
  }

  // `key` forces React to unmount/remount the router tree, not just hand a new `router`
  // prop to the same still-mounted <RouterProvider>. That distinction matters:
  // @tanstack/react-router's internal `Transitioner` only resolves the current URL
  // against the router the *first* time its owning component instance mounts (a
  // dev-mode `mounted` ref gates it) — on a prop-only swap that ref is already `true`,
  // so the new router's `beforeLoad` guards would never run against the current
  // location and the app would keep showing whatever was on screen (verified
  // empirically: without `key`, signing out left `/home` rendered with a router that
  // never redirected). A fresh component instance per `key` gets a fresh `mounted`
  // ref, so the swapped-in router always resolves the current URL on mount — which is
  // exactly what sends a freshly-signed-out user from /home back to /.
  return <RouterProvider key={key} router={cached.current.router} />;
}

/** Genuinely neutral — no sign-in button, no avatar — shown only while auth resolves. */
function NeutralShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center border-b border-border px-6 sm:px-8">
        <span className="text-sm font-semibold tracking-tight">Data Red Room</span>
      </header>
      <main className="flex-1" />
    </div>
  );
}

export default App;
