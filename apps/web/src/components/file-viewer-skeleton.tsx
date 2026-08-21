import { Skeleton } from '@dataroom/ui';

/**
 * Shown while `FileQuery`/`FolderQuery` are still loading in `file-route.tsx` — shaped
 * like the real header (back button, filename + stats, action buttons) plus one large
 * block standing in for the document, same "mimic the real layout" convention as
 * `FolderChildrenTableSkeleton`.
 */
export function FileViewerSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading file">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-border bg-background px-4 py-2.5">
        <Skeleton className="h-8.5 w-24" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="mt-1.5 h-2.25 w-32" />
        </div>
        <Skeleton className="size-8" />
        <Skeleton className="h-8.5 w-20" />
        <Skeleton className="size-8" />
      </div>
      <div className="flex-1 bg-secondary p-4">
        <Skeleton className="h-full min-h-[70vh] w-full" />
      </div>
    </div>
  );
}
