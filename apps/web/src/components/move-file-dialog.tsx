import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowUp, ChevronRight, Folder, Loader2 } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@dataroom/ui';

import { useDataRoomsQuery } from '../lib/data-rooms';
import { errorMessage } from '../lib/error-message';
import { useFolderChildrenQuery, useFolderQuery } from '../lib/folders';
import { useMoveFileMutation } from '../lib/files';

interface MoveFileDialogProps {
  file: { id: string; name: string; folderId: string } | null;
  /** The file's folder *at the time the dialog opened* — needed to invalidate the old
   * location's children list (the destination invalidates itself, see
   * `useMoveFileMutation`). */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Move" modal — a folder navigator the design (`dlgMove` in the imported canvas)
 * always opens at the Data Room root, not the file's current folder. There's no existing
 * folder-tree picker anywhere in this app to reuse, so this is built from the same
 * `useFolderQuery`/`useFolderChildrenQuery` pair `routes/folder-route.tsx` itself uses —
 * just browsed locally (plain buttons, not router `Link`s) instead of navigated to.
 *
 * The conflict check reuses whatever's already loaded for the picker list (no extra
 * request) — it only sees the browsed folder's first page of children, so it's a
 * convenience, not the source of truth: the mutation's own 409 is still what actually
 * guards against a name collision, and its message surfaces inline if one slips through
 * (e.g. beyond the first page, or created concurrently).
 */
export function MoveFileDialog({ file, parentId, open, onOpenChange }: MoveFileDialogProps) {
  const [browseId, setBrowseId] = useState<string | null>(null);
  const mutation = useMoveFileMutation(parentId);
  const { toast } = useToast();
  const dataRooms = useDataRoomsQuery();

  // The file's own folder, fetched only to read its `breadcrumbs[0].id` — the Data Room's
  // root — which seeds where the picker opens.
  const homeFolder = useFolderQuery(file?.folderId ?? '', { enabled: open && !!file });

  // Reset for the next time the dialog opens, whether it closed via success, Cancel, the
  // close button, Escape, or an overlay click.
  useEffect(() => {
    if (!open) {
      setBrowseId(null);
      mutation.reset();
    }
    // `mutation` is a fresh object every render (react-query); only `open` should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Seed the picker's starting folder once the file's own folder (and thus the room root)
  // resolves. Guarded on `browseId === null` so navigating deeper doesn't get stomped by a
  // stale refetch of `homeFolder`.
  useEffect(() => {
    if (open && browseId === null && homeFolder.isSuccess) {
      setBrowseId(homeFolder.data.body.breadcrumbs[0].id);
    }
  }, [open, browseId, homeFolder.isSuccess, homeFolder.data]);

  const browseFolder = useFolderQuery(browseId ?? '', { enabled: !!browseId });
  const browseChildren = useFolderChildrenQuery(browseId ?? '', { enabled: !!browseId });

  // The root folder's stored `name` is a fixed `'/'` constant, never the room's display
  // name — same substitution `FolderBreadcrumbs` does for the page's own breadcrumb trail.
  function roomNameFor(dataRoomId: string) {
    return dataRooms.data?.body.items.find((room) => room.id === dataRoomId)?.name;
  }

  const roomName = browseFolder.isSuccess
    ? (roomNameFor(browseFolder.data.body.dataRoomId) ?? browseFolder.data.body.name)
    : '';
  const breadcrumbs =
    browseFolder.data?.body.breadcrumbs.map((crumb, index) => ({
      id: crumb.id,
      name: index === 0 ? roomName : crumb.name,
    })) ?? [];
  const destinationName = breadcrumbs[breadcrumbs.length - 1]?.name ?? '';
  const homeFolderName = homeFolder.isSuccess
    ? homeFolder.data.body.isRoot
      ? (roomNameFor(homeFolder.data.body.dataRoomId) ?? homeFolder.data.body.name)
      : homeFolder.data.body.name
    : '';

  const subfolders = (browseChildren.data?.body.items ?? []).filter(
    (item) => item.kind === 'folder',
  );
  const conflict =
    !!file &&
    (browseChildren.data?.body.items ?? []).some(
      (item) =>
        item.kind === 'file' &&
        item.id !== file.id &&
        item.name.toLowerCase() === file.name.toLowerCase(),
    );
  const same = !!file && browseId === file.folderId;
  const isLoadingBrowse = browseFolder.isPending || browseChildren.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !browseId || same || conflict || isLoadingBrowse || mutation.isPending) return;
    mutation.mutate(
      { params: { id: file.id }, body: { folderId: browseId } },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast(`Moved to "${destinationName}"`);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return; // don't let an in-flight move be abandoned
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Move file</DialogTitle>
            <div className="text-[12.5px] text-foreground/85">{file?.name}</div>
            <div className="text-xs text-muted-foreground">
              Currently in {homeFolderName} · stays in this Data Room
            </div>
          </DialogHeader>

          <div className="border border-border">
            <div className="flex items-center gap-2 border-b-2 border-border bg-muted/40 p-2">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label="Up one level"
                disabled={!browseFolder.data || browseFolder.data.body.isRoot}
                onClick={() => {
                  const target = browseFolder.data?.body.parentId;
                  if (target) setBrowseId(target);
                }}
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </Button>
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
                {breadcrumbs.map((crumb, index) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className="text-foreground/85 hover:text-primary"
                      onClick={() => setBrowseId(crumb.id)}
                    >
                      {crumb.name}
                    </button>
                    {index < breadcrumbs.length - 1 && (
                      <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="max-h-60 overflow-auto">
              {isLoadingBrowse && (
                <div
                  className="flex items-center justify-center py-8"
                  aria-busy="true"
                  aria-label="Loading folders"
                >
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              {!isLoadingBrowse && subfolders.length === 0 && (
                <p className="p-3 text-[12.5px] text-muted-foreground">
                  No subfolders here. You can still move the file into this folder.
                </p>
              )}
              {!isLoadingBrowse &&
                subfolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="flex w-full items-center gap-2.5 border-b border-border p-2.5 text-left hover:bg-foreground/6"
                    onClick={() => setBrowseId(folder.id)}
                  >
                    <Folder className="size-4.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-heading text-[13px] font-extrabold">
                      {folder.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {conflict && (
            <div className="bg-destructive/10 p-2.5">
              <p className="flex items-start gap-2 text-[12.5px] text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {destinationName} already contains a file called &quot;{file?.name}&quot;.
                Rename this file first, then move it.
              </p>
            </div>
          )}
          {same && !conflict && (
            <p className="text-[12.5px] text-muted-foreground">
              The file is already in this folder.
            </p>
          )}
          {mutation.isError && (
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {errorMessage(mutation.error)}
            </p>
          )}

          <DialogFooter className="items-center">
            <div className="mr-auto text-xs text-muted-foreground">
              Destination ·{' '}
              <span className="font-heading font-extrabold text-foreground">
                {destinationName}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!browseId || same || conflict || isLoadingBrowse || mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Moving…' : 'Move here'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
