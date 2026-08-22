import { Search } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Button } from '@dataroom/ui';

import { signInWithGoogle } from '../lib/auth';

interface NotFoundStateProps {
  /** Which resource 404'd — only changes the copy ("This file"/"This folder" etc.), not
   * the layout. */
  kind: 'file' | 'folder';
  /** Whether the current visitor is signed in — the design's two structurally different
   * layouts: signed-in stays inside the app shell with a single "Go to your Data Rooms"
   * CTA; signed-out gets "Sign in" + "About Data Red Room" instead. */
  signedIn: boolean;
  /** Only used when `signedIn` — the current account's email, for the "You are signed in
   * as…" line that explains why a share to a different address 404s here. */
  email?: string;
}

/**
 * The design's four "Not found" states (`Data Red Room.dc.html`'s `nfKind`/`nfAuth`
 * combinations) as one component — `folder-route.tsx`/`file-route.tsx` pick `kind` from
 * which query 404'd and `signedIn`/`email` from `auth`. Rendered in place of the generic
 * "Couldn't load…" message only for a confirmed 404 (see `isTsRestErrorWithStatus` in
 * `lib/api.ts`) — every other error status keeps that generic message.
 *
 * Expects a flex-column ancestor to center within (`AppShell`'s `<main>`, or the routes'
 * own chrome-free `<main>` for a signed-out visitor) — it brings no outer page shell of
 * its own.
 */
export function NotFoundState({ kind, signedIn, email }: NotFoundStateProps) {
  const noun = kind === 'file' ? 'This file' : 'This folder';
  const title = `${noun} can’t be found`;
  const body = `The address may be mistyped, or the ${kind} may no longer exist.`;
  // The design's own footer line references a fictional short-URL scheme
  // ("drr.io/f/…") this app doesn't have — the actual attempted path carries the same
  // information as a real address.
  const requestedAddress = window.location.pathname;

  return (
    <div className="flex flex-1 items-center px-6 py-16 sm:px-10">
      <div className="w-full max-w-[560px]">
        <span className="mb-5 inline-flex items-center gap-1.5 border border-border px-2.5 py-1 text-[11px] font-medium tracking-wide text-foreground/85 uppercase">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          Not found
        </span>
        <h1 className="mb-2.5 text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mb-2 max-w-[52ch] text-sm leading-relaxed text-foreground/85">{body}</p>
        {signedIn ? (
          <>
            <p className="mb-6 max-w-[52ch] text-[13px] text-muted-foreground">
              You are signed in as {email}. If it was shared with another address, open the
              link from that account.
            </p>
            <Button variant="default" asChild>
              <Link to="/home">Go to your Data Rooms</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mb-6 max-w-[52ch] text-[13px] text-muted-foreground">
              If it was shared with your account by email, sign in and open the link again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                onClick={() => signInWithGoogle(window.location.pathname)}
              >
                Sign in
              </Button>
              <Button variant="outline" asChild>
                <Link to="/">About Data Red Room</Link>
              </Button>
            </div>
          </>
        )}
        <div className="mt-6 border-t-2 border-border pt-3.5 text-xs text-muted-foreground">
          Requested address · {requestedAddress}
        </div>
      </div>
    </div>
  );
}
