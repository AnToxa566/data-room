import { Skeleton } from '@dataroom/ui';

import { FolderChildrenTableSkeleton } from './folder-children-table-skeleton';

/**
 * Shown while `useFolderQuery`/`useFolderChildrenQuery` are still loading in
 * `folder-route.tsx` — the full page, not just the table. `FolderToolbar` (breadcrumbs +
 * title + New folder/Upload/Share) only renders once the folder query succeeds, so
 * without this the area above `FolderChildrenTableSkeleton` used to sit blank on every
 * navigation. Mirrors `FileViewerSkeleton`'s convention: hand-composed `Skeleton` bars
 * sized/positioned to match the real layout (`FolderBreadcrumbs`'s `min-h-7` nav,
 * `FolderToolbar`'s title/actions row, real buttons' `h-8.5` height), not a generic
 * spinner — so nothing shifts when the real content swaps in. Owner vs. recipient isn't
 * knowable yet at this point (that's exactly what's loading), so this always shows the
 * owner-shaped three-button placeholder, same as `FileViewerSkeleton` doesn't try to
 * pre-empt final state either.
 */
export function FolderPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading folder">
      <nav aria-hidden="true" className="flex min-h-7 flex-wrap items-center gap-1.5">
        <Skeleton className="h-2.25 w-20" />
        <Skeleton className="h-2.25 w-4" />
        <Skeleton className="h-2.25 w-28" />
      </nav>

      <div className="flex flex-wrap items-end gap-4 border-b-2 border-border pb-3.5">
        <div className="min-w-50 flex-1">
          <Skeleton className="h-[45px] w-56" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8.5 w-28" />
          <Skeleton className="h-8.5 w-24" />
          <Skeleton className="h-8.5 w-20" />
        </div>
      </div>

      <FolderChildrenTableSkeleton />
    </div>
  );
}
