import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';

import { ToastProvider } from '@dataroom/ui';

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

/**
 * Deliberately chrome-free — each top-level route owns its own header/shell (the
 * landing page renders `<Header/>`, `/home` renders `<AppShell/>`) since the two look
 * nothing alike and neither wants the other's controls layered on top.
 */
function RootLayout() {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <Outlet />
      </div>
    </ToastProvider>
  );
}
