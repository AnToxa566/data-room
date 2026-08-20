import { createRoute, redirect } from '@tanstack/react-router';

import { rootRoute } from './root-route';

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  beforeLoad: ({ context }) => {
    if (context.auth.status === 'unauthenticated') {
      throw redirect({ to: '/' });
    }
  },
  component: HomePage,
});

function HomePage() {
  const { auth } = homeRoute.useRouteContext();
  const user = auth.status === 'authenticated' ? auth.user : null;

  return (
    <div
      data-testid="home-page"
      className="mx-auto max-w-5xl px-6 py-12 sm:px-8"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Welcome back{user?.name ? `, ${user.name}` : ''}
      </h1>
      <div className="mt-10 flex min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          Your Data Rooms will show up here
        </p>
        <p className="text-sm text-muted-foreground">
          Come back soon — creating and browsing Data Rooms is coming in the next update.
        </p>
      </div>
    </div>
  );
}
