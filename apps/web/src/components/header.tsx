import { Link } from '@tanstack/react-router';

import { Button } from '@dataroom/ui';

import { signInWithGoogle } from '../lib/auth';

import { ReadOnlyBadge } from './read-only-badge';

interface HeaderProps {
  /** Set only when this is a signed-out visitor's shared-resource shell — see
   * `folder-route.tsx`/`file-route.tsx`. Undefined on the landing page, which renders
   * `<Header />` with no props, unchanged from before these props existed. */
  sharedByEmail?: string;
  /** The current path, so "Sign in" returns here afterward instead of dropping the
   * visitor on `/home` — see `lib/auth.ts`'s `signInWithGoogle`. Undefined on the
   * landing page: there's nothing to return to. */
  returnTo?: string;
}

/**
 * Rendered by the landing page (no props — the plain marketing header) and, since
 * public sharing needs a chrome-free shell too, by `folder-route.tsx`/`file-route.tsx`
 * for a *signed-out* visitor of a shared resource (`sharedByEmail`/`returnTo` set). A
 * signed-in recipient gets `AppShell` instead, same as the owner — see that
 * component's doc comment.
 */
export function Header({ sharedByEmail, returnTo }: HeaderProps = {}) {
  return (
    <header className="flex h-17 items-center justify-between gap-3 border-b-2 border-border px-6 sm:px-8">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-sm text-sm font-extrabold tracking-tight text-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="size-4.5 shrink-0 bg-accent" />
        Data Red Room
      </Link>

      <div className="flex items-center gap-3">
        {sharedByEmail && <ReadOnlyBadge sharedByEmail={sharedByEmail} />}
        <Button variant="outline" onClick={() => signInWithGoogle(returnTo)}>
          Sign in
        </Button>
      </div>
    </header>
  );
}
