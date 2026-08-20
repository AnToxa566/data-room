import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { createAppRouter } from '../routes/router';
import type { SettledAuthState } from '../lib/auth';

/**
 * Renders the real route tree with already-resolved auth context injected directly — no
 * network call, no mocking needed. `App`'s own loading→settled transition is deliberately
 * not exercised here (see auth-routing.spec.ts in web-e2e for that).
 */
export function renderRouterAt(path: string, auth: SettledAuthState) {
  window.history.pushState({}, '', path);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter({ auth });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  // Returned alongside the render result so tests can assert on router state (e.g. the
  // current search string) without reaching for `window.location` directly.
  return { ...result, router };
}
