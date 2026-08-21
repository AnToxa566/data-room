import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';

import { ToastProvider } from '@dataroom/ui';

import { UploadTray } from '../components/upload-tray';
import type { SettledAuthState } from '../lib/auth';
import { UploadProvider } from '../lib/upload-manager';

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
 *
 * `UploadProvider`/`UploadTray` live here, not inside `folder-route.tsx` — an upload
 * started in one folder needs to survive navigating to another (or to `/home`), same as
 * the design keeps its tray fixed regardless of which view is showing. See
 * `lib/upload-manager.tsx`.
 */
function RootLayout() {
  return (
    <ToastProvider>
      <UploadProvider>
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
          <Outlet />
        </div>
        <UploadTray />
      </UploadProvider>
    </ToastProvider>
  );
}
