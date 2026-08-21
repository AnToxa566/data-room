import { Skeleton } from '@dataroom/ui';

// Same placeholder widths as `FolderChildrenTableSkeleton` — see that file's comment; the
// source design has no dedicated "Home loading" scenario, so this reuses its Browser
// skeleton's row widths against `HomeDataRoomsTable`'s own columns instead.
const ROW_WIDTHS = ['38%', '52%', '30%', '61%', '44%', '35%'] as const;

/**
 * Shown in place of a text "Loading your Data Rooms…" chip while `HomeDataRoomsTable`'s
 * data is still loading. Includes the "Owned by you" heading and column header so the
 * heading doesn't jump in after load — grid and row height are copied verbatim from
 * `HomeDataRoomsTable` so swapping skeleton → real rows causes no layout shift.
 */
export function HomeDataRoomsTableSkeleton() {
  return (
    <section className="pt-7" aria-labelledby="owned-by-you-heading">
      <h2
        id="owned-by-you-heading"
        className="mb-2 text-[13px] font-medium tracking-wide text-foreground/85 uppercase"
      >
        Owned by you
      </h2>
      <div className="grid grid-cols-[minmax(0,1fr)_44px] border-b-2 border-border pb-2 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase min-[900px]:grid-cols-[minmax(0,1fr)_140px_44px]">
        <div>Name</div>
        <div className="hidden min-[900px]:block">Created</div>
        <div />
      </div>
      <div aria-busy="true" aria-label="Loading Data Rooms">
        {ROW_WIDTHS.map((width, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_44px] px-2 items-center border-b border-border min-h-11.5 min-[900px]:grid-cols-[minmax(0,1fr)_140px_44px]"
          >
            <div className="flex items-center gap-2.5 py-1.5">
              <Skeleton className="size-4.5 shrink-0" />
              <Skeleton className="h-2.75" style={{ width }} />
            </div>
            <div className="hidden min-[900px]:block">
              <Skeleton className="h-2.25 w-21" />
            </div>
            <div />
          </div>
        ))}
      </div>
    </section>
  );
}
