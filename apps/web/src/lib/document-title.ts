import { useEffect } from 'react';

/**
 * Sets `document.title` for the lifetime of the calling route component. There's no
 * shared chrome across routes to hang a `<title>` on (see root-route.tsx), and the one
 * dynamic case — the folder page's display name — only exists after a TanStack Query
 * fetch resolves, which is client-only data a router `head()` function can't see. A
 * plain effect keeps all three routes on the same mechanism instead of splitting
 * static routes onto router `head`/`HeadContent` and the dynamic one onto this.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
