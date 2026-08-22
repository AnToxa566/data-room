import { useState, type DragEvent, type ReactNode } from 'react';
import { Upload } from 'lucide-react';

import { useUploadManager } from '../lib/upload-manager';

interface FolderDropZoneProps {
  /** The folder being viewed — where a drop uploads into, same as `UploadButton`'s. */
  folderId: string;
  /** Display name for the "Drop to upload into {folderName}" overlay copy. */
  folderName: string;
  /** Non-owners (share recipients) can't upload — no listeners, no overlay, just the
   * children, same gating every `UploadButton` caller already applies. */
  isOwner: boolean;
  children: ReactNode;
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/**
 * The "Drag over list" design: wraps whichever of `FolderChildrenTable`,
 * `FolderEmptyState`, or `FolderEmptySubfolderState` is currently showing (see
 * `routes/folder-route.tsx`) so dragging a file over any of the three shows a dashed
 * overlay, and dropping it uploads.
 *
 * Deliberately reuses `useUploadManager().enqueueFiles` — the exact call `UploadButton`
 * makes on file-picker selection (see `upload-button.tsx`) — rather than any new upload
 * logic. Drag-and-drop and the "Upload" button are two interfaces onto one business
 * logic: PDF/size filtering, the upload tray, and conflict/retry handling all come from
 * the same place regardless of which one the user used.
 */
export function FolderDropZone({ folderId, folderName, isOwner, children }: FolderDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { enqueueFiles } = useUploadManager();

  if (!isOwner) return children;

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        // Moving between child rows re-fires dragenter/dragleave on each of them — only
        // treat this as "left the drop zone" once the pointer is actually outside it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!hasFiles(event)) return;
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) enqueueFiles(files, folderId, folderName);
      }}
    >
      {children}

      {isDragging && (
        <div
          onClick={() => setIsDragging(false)}
          onDragLeave={() => setIsDragging(false)}
          className="absolute inset-0 z-20 flex items-center gap-3.5 border-2 border-dashed border-accent bg-background/90 pl-6"
        >
          <Upload className="size-7 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <div className="font-heading text-[17px] font-extrabold text-foreground">
              Drop to upload into {folderName}
            </div>
            <div className="text-xs text-muted-foreground">
              PDF only, up to 100 MB. Anything else is rejected in the tray.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
