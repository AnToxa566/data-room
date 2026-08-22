import { useEffect, useState } from 'react';
import { createRoute, redirect, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import { Button } from '@dataroom/ui';

import { Header } from '../components/header';
import { signInWithGoogle } from '../lib/auth';
import { useDocumentTitle } from '../lib/document-title';
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

const FEATURES = [
  {
    title: 'One room per deal',
    description:
      'A tree of folders and PDFs, owned by you, with totals rolled up from every nested folder.',
  },
  {
    title: 'Share a room, a folder, or one file',
    description:
      'A public link or named people by email. Read-only in every case — no editors, no comments.',
  },
  {
    title: 'Revocable at any moment',
    description:
      'Revoking takes effect immediately. Anyone still holding the link sees nothing but a revoked page.',
  },
] as const;

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
  useDocumentTitle('Data Red Rooms');

  useEffect(() => {
    if (!error) return;
    setMessage(ERROR_MESSAGES[error]);
    // Strip the param so a refresh doesn't re-show the message — it stays visible from
    // local state above.
    void navigate({ to: '/', search: {}, replace: true });
  }, [error, navigate]);

  return (
    <>
      <Header />
      <div data-testid="landing-page" className="flex flex-1 flex-col">
        <section className="grid flex-1 grid-cols-1 border-b-2 border-border md:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col justify-center gap-6 px-6 py-12 md:border-r-2 md:border-border md:px-12 md:py-16 lg:px-16">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Data Red Room
            </span>
            <h1 className="max-w-[24ch] text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              A shared room for the documents due diligence runs on
            </h1>
            <p className="max-w-[52ch] text-base leading-relaxed text-muted-foreground">
              Upload, organize, and share files with revocable access at the room, folder, or
              file level — built for deals where knowing exactly who saw what matters.
            </p>
            {message && (
              <p
                role="alert"
                className="flex items-start gap-2 border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {message}
              </p>
            )}
            <div>
              <Button size="lg" onClick={() => signInWithGoogle()}>
                Sign in
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-center divide-y-2 divide-border px-6 py-12 md:px-12 md:py-16 lg:px-16">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex flex-col gap-1 py-5 first:pt-0 last:pb-0">
                <h2 className="text-[15px] font-extrabold text-foreground">{feature.title}</h2>
                <p className="text-[13px] text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs text-muted-foreground sm:px-8">
          <span className="font-medium text-foreground">Data Red Room</span>
          <span>PDF only · read-only sharing · no version history</span>
        </footer>
      </div>
    </>
  );
}
