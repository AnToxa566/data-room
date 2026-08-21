import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { createAppRouter } from '../routes/router';
import type { SettledAuthState } from '../lib/auth';
import { tsr } from '../lib/api';

/**
 * Renders the real route tree with already-resolved auth context injected directly — no
 * network call for auth, no mocking needed there. `App`'s own loading→settled transition
 * is deliberately not exercised here (see auth-routing.spec.ts in web-e2e for that).
 *
 * Wraps `tsr.ReactQueryProvider` because components under `/home` (AppSidebar, HomePage)
 * call ts-rest query/mutation hooks directly — without it those hooks throw
 * "tsrQueryClient not initialized" (see @ts-rest/react-query's `useTsrQueryClient`).
 * Those hooks still hit real `fetch` under the hood, so any spec that renders a route
 * exercising them must stub `global.fetch` itself.
 */
export function renderRouterAt(path: string, auth: SettledAuthState) {
  window.history.pushState({}, '', path);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter({ auth });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <tsr.ReactQueryProvider>
        <RouterProvider router={router} />
      </tsr.ReactQueryProvider>
    </QueryClientProvider>,
  );

  // Returned alongside the render result so tests can assert on router state (e.g. the
  // current search string) without reaching for `window.location` directly.
  return { ...result, router };
}
