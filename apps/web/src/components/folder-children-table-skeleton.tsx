import { Skeleton } from '@dataroom/ui';

// The design's own placeholder widths ("Browser — loading", `Data Red Room.dc.html`'s
// `skeletons` array) — six rows, name bar widths varied so the skeleton doesn't read as a
// grid of identical bars.
const ROW_WIDTHS = ['38%', '52%', '30%', '61%', '44%', '35%'] as const;

/**
 * The "Browser — loading" design: a skeleton table shown while `FolderChildrenTable`'s data
 * is still loading, in place of a text "Loading…" chip. Column grid and row height are
 * copied verbatim from `FolderChildrenTable` so swapping skeleton → real rows causes no
 * layout shift. The kebab column stays empty, same as the design — it has no placeholder
 * there either.
 */
export function FolderChildrenTableSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-x-2 border-b-2 border-border pt-2.5 pb-2 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase min-[900px]:grid-cols-[minmax(0,1fr)_120px_140px_44px]">
        <div>Name</div>
        <div className="hidden min-[900px]:block">Size</div>
        <div className="hidden min-[900px]:block">Modified</div>
        <div />
      </div>
      <div aria-busy="true" aria-label="Loading folder contents">
        {ROW_WIDTHS.map((width, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-2 border-b border-border px-2 min-h-11.5 min-[900px]:grid-cols-[minmax(0,1fr)_120px_140px_44px]"
          >
            <div className="flex items-center gap-2.5 py-1.5">
              <Skeleton className="size-4.5 shrink-0" />
              <Skeleton className="h-2.75" style={{ width }} />
            </div>
            <div className="hidden min-[900px]:block">
              <Skeleton className="h-2.25 w-13" />
            </div>
            <div className="hidden min-[900px]:block">
              <Skeleton className="h-2.25 w-21" />
            </div>
            <div />
          </div>
        ))}
      </div>
    </div>
  );
}
