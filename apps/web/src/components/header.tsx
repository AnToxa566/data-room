import { Link } from '@tanstack/react-router';

import { Button } from '@dataroom/ui';

import { signInWithGoogle } from '../lib/auth';

/**
 * Rendered by the landing page only. Authenticated users never see it — `/` redirects
 * them to `/home` before it mounts, and `/home` owns its own shell (`AppShell`), so
 * there's no route left where this needs a signed-in state.
 */
export function Header() {
  return (
    <header className="flex h-17 items-center justify-between border-b-2 border-border px-6 sm:px-8">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-sm text-sm font-extrabold tracking-tight text-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="size-4.5 shrink-0 bg-accent" />
        Data Red Room
      </Link>

      <Button variant="outline" onClick={signInWithGoogle}>Sign in</Button>
    </header>
  );
}
