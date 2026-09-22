/**
 * The "Loading splash" design (`Data Red Room.dc.html`'s `isSplash` state) — shown while
 * `auth.status === 'loading'` (see app.tsx), before the router mounts and commits to a
 * signed-in or signed-out shell.
 */
export function LoadingSplash() {
  return (
    <div
      role="status"
      aria-label="Loading Data Red Room"
      className="flex min-h-dvh flex-col justify-center bg-background px-10 text-foreground"
    >
      <div className="flex items-center gap-3.5">
        <span aria-hidden="true" className="size-6 shrink-0 bg-accent min-[900px]:size-[34px]" />
        <span className="font-heading text-[21px] font-extrabold tracking-tight min-[900px]:text-[30px]">
          DATA RED ROOM
        </span>
      </div>
      <div className="mt-7 h-0.5 max-w-[520px] overflow-hidden bg-foreground/12">
        <div className="h-full w-[22%] animate-bar-slide bg-accent" />
      </div>
    </div>
  );
}
