import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';

import { Header } from '../components/header';
import type { SettledAuthState } from '../lib/auth';

export interface RouterContext {
  /**
   * Always settled — `loading` cannot exist inside the router, by construction (see
   * app.tsx: the router only ever mounts once `useCurrentUser()` has resolved).
   */
  auth: SettledAuthState;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-col flex-1">
        <Outlet />
      </main>
    </div>
  );
}
