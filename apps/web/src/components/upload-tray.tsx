import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@dataroom/ui';

import { formatBytes } from '../lib/format-bytes';
import { useUploadManager, type UploadItem } from '../lib/upload-manager';

const ERROR_COPY: Record<NonNullable<UploadItem['errKind']>, (item: UploadItem) => string> = {
  conflict: (item) => `A file named "${item.name}" already exists in ${item.folderName}`,
  toolarge: (item) => `Too large — ${formatBytes(String(item.size))} exceeds the 100 MB limit`,
  unsupported: () => 'Unsupported type — PDF only',
  network: (item) => `Connection lost at ${item.pct}%`,
};

/**
 * Fixed bottom-right upload panel — see `lib/upload-manager.tsx` for the state machine
 * this reads from and `routes/root-route.tsx` for why it's mounted at the root rather
 * than inside the folder route. Cancel (`×`) always works; "Retry" only appears on a
 * network error, "Rename & retry" only on a name conflict — matches the reference design
 * (`Data Red Room.dc.html`'s upload tray), translated to this app's own tokens rather
 * than the mockup's literal colors.
 */
export function UploadTray() {
  const { items, trayOpen, trayCollapsed, cancel, retry, renameAndRetry, toggleCollapse, dismissTray } =
    useUploadManager();

  if (!trayOpen || items.length === 0) return null;

  const done = items.filter((i) => i.state === 'done').length;
  const failed = items.filter((i) => i.state === 'error').length;
  const summary = `${done} of ${items.length} complete${failed ? ` · ${failed} failed` : ''}`;

  return (
    <div
      role="region"
      aria-label="Uploads"
      className="fixed right-5 bottom-5 z-70 w-[min(390px,calc(100vw-40px))] border border-border bg-background shadow-lg"
    >
      <div className="flex items-center gap-2.5 border-b-2 border-border bg-secondary px-3 py-2.5">
        <Upload className="size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[13px] font-extrabold text-foreground">Uploads</div>
          <div className="text-[11px] text-muted-foreground">{summary}</div>
        </div>
        <Button
          type="button"
          variant="muted"
          size="icon-sm"
          aria-label={trayCollapsed ? 'Expand uploads' : 'Collapse uploads'}
          aria-expanded={!trayCollapsed}
          onClick={toggleCollapse}
        >
          {trayCollapsed ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          variant="muted"
          size="icon-sm"
          aria-label="Dismiss uploads"
          onClick={dismissTray}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      {!trayCollapsed && (
        <div className="max-h-85 overflow-auto">
          {items.map((item) => (
            <div key={item.id} className="border-b border-border px-3 py-2.5 last:border-b-0">
              <div className="flex items-start gap-2.5">
                {item.state === 'done' && (
                  <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                )}
                {item.state === 'error' && (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                )}
                {item.state === 'uploading' && (
                  <Loader2
                    className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {item.state === 'queued' && (
                  <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-foreground">{item.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.state === 'done' && `Uploaded to ${item.folderName} · ${formatBytes(String(item.size))}`}
                    {item.state === 'queued' && `Queued · ${formatBytes(String(item.size))}`}
                    {item.state === 'uploading' && `Uploading ${item.pct}% · ${formatBytes(String(item.size))}`}
                    {item.state === 'error' && item.errKind && (
                      <span className="text-destructive">{ERROR_COPY[item.errKind](item)}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  {item.errKind === 'conflict' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => renameAndRetry(item.id)}
                    >
                      Rename &amp; retry
                    </Button>
                  )}
                  {item.errKind === 'network' && (
                    <Button type="button" variant="outline" size="xs" onClick={() => retry(item.id)}>
                      Retry
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="muted"
                    size="icon-xs"
                    aria-label={`Cancel ${item.name}`}
                    onClick={() => cancel(item.id)}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {item.state === 'uploading' && (
                <div className="mt-2 h-0.75 bg-secondary">
                  <div className="h-0.75 bg-primary" style={{ width: `${item.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
