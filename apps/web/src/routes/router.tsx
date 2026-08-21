import { createRouter } from '@tanstack/react-router';

import { fileRoute } from './file-route';
import { folderRoute } from './folder-route';
import { homeRoute } from './home-route';
import { landingRoute } from './landing-route';
import { rootRoute, type RouterContext } from './root-route';

const routeTree = rootRoute.addChildren([landingRoute, homeRoute, folderRoute, fileRoute]);

/**
 * A factory, not a module-level singleton — this is what makes the router directly
 * unit-testable with injected context (see test/render-app.tsx), and what lets app.tsx
 * mount a fresh router whenever settled auth state changes (see app.tsx).
 */
export function createAppRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    context,
    defaultPreload: false,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
