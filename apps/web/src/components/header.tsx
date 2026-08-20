import { Link } from '@tanstack/react-router';

import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dataroom/ui';

import { signInWithGoogle, useSignOut } from '../lib/auth';
import { rootRoute } from '../routes/root-route';

/** Rendered once, in the root layout — never re-queries auth itself. */
export function Header() {
  const { auth } = rootRoute.useRouteContext();
  const signOut = useSignOut();

  return (
    <header className="flex h-17 items-center justify-between border-b-2 border-border px-6 sm:px-8">
      <Link
        to={auth.status === 'authenticated' ? '/home' : '/'}
        className="flex items-center gap-2 rounded-sm text-sm font-extrabold tracking-tight text-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="size-4.5 shrink-0 bg-accent" />
        Data Red Room
      </Link>

      {auth.status === 'authenticated' ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Avatar>
              <AvatarFallback>{initials(auth.user)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium text-foreground sm:inline">
              {auth.user.name ?? auth.user.email}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" onClick={signInWithGoogle}>Sign in</Button>
      )}
    </header>
  );
}

function initials(user: { name: string | null; email: string }): string {
  const source = user.name ?? user.email;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
