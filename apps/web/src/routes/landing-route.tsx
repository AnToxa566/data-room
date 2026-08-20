import { useEffect, useState } from 'react';
import { createRoute, redirect, useNavigate } from '@tanstack/react-router';

import { Button } from '@dataroom/ui';

import { DocumentsIllustration } from '../components/documents-illustration';
import { signInWithGoogle } from '../lib/auth';
import { rootRoute } from './root-route';

type OAuthError = 'unverified_email' | 'oauth_failed';

function isOAuthError(value: unknown): value is OAuthError {
  return value === 'unverified_email' || value === 'oauth_failed';
}

/**
 * The API redirects back here with `?error=unverified_email` or `?error=oauth_failed` —
 * see apps/api/src/auth/filters/google-auth-exception.filter.ts, the only two values it
 * ever sends. A plain function (not zod) is enough for one param and avoids adding zod as
 * a direct apps/web dependency for it.
 */
function validateSearch(search: Record<string, unknown>): { error?: OAuthError } {
  return { error: isOAuthError(search['error']) ? search['error'] : undefined };
}

const ERROR_MESSAGES: Record<OAuthError, string> = {
  unverified_email:
    "That Google account's email isn't verified. Verify it with Google, then try again.",
  oauth_failed: "Sign-in didn't complete. Please try again.",
};

export const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch,
  beforeLoad: ({ context }) => {
    if (context.auth.status === 'authenticated') {
      throw redirect({ to: '/home' });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  const { error } = landingRoute.useSearch();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    setMessage(ERROR_MESSAGES[error]);
    // Strip the param so a refresh doesn't re-show the message — it stays visible from
    // local state above.
    void navigate({ to: '/', search: {}, replace: true });
  }, [error, navigate]);

  return (
    <div
      data-testid="landing-page"
      className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 px-6 py-16 sm:px-8 md:grid-cols-2 md:py-24"
    >
      <div className="flex flex-col gap-6">
        <span className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Data Red Room
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          A shared room for the documents due diligence runs on
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Upload, organize, and share files with revocable access at the room, folder, or
          file level — built for deals where knowing exactly who saw what matters.
        </p>
        {message && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {message}
          </p>
        )}
        <div>
          <Button size="lg" onClick={signInWithGoogle}>
            Sign in
          </Button>
        </div>
      </div>
      <DocumentsIllustration className="mx-auto w-full max-w-md" />
    </div>
  );
}
