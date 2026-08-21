import { createRoute, redirect } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell';
import { HomeEmptyState } from '../components/home-empty-state';
import { HomeHeader } from '../components/home-header';
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
  // `beforeLoad` above already redirects unauthenticated visitors away, so `auth` is
  // always the authenticated branch by the time this renders.
  if (auth.status !== 'authenticated') return null;

  return (
    <AppShell user={auth.user}>
      <div
        data-testid="home-page"
        className="px-4 pt-4 pb-10 min-[900px]:px-10 min-[900px]:pt-7 min-[900px]:pb-14"
      >
        <HomeHeader />
        <HomeEmptyState />
      </div>
    </AppShell>
  );
}
