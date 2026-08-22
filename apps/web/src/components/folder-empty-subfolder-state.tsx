import { Upload } from 'lucide-react';

import { Button } from '@dataroom/ui';

import { UploadButton } from './upload-button';

interface FolderEmptySubfolderStateProps {
  /** The current folder — where `UploadButton` uploads into, and its display name for
   * tray copy ("Uploaded to {folderName}"). */
  folderId: string;
  folderName: string;
  /** Whether the current caller owns this Data Room — a non-owner (share recipient)
   * gets the heading only, no New-folder/Upload actions. */
  isOwner: boolean;
  /** Opens `CreateFolderDialog` — see `routes/folder-route.tsx`, which owns its open state. */
  onNewFolder: () => void;
}

/**
 * The "Browser — empty folder" design: a plain non-root folder with no children yet.
 * Simpler than `FolderEmptyState` (the *Data Room root*'s empty design, kept for `isRoot`
 * folders) — no side panel, no numbered steps, just the two actions. Unlike the toolbar's
 * "New folder" button, the design gives this one no icon — matched here rather than
 * "fixed" to be consistent, since this is a direct transcription of that state.
 *
 * "Upload PDFs" opens the native file picker via `UploadButton`. "New folder" opens
 * `CreateFolderDialog`.
 */
export function FolderEmptySubfolderState({
  folderId,
  folderName,
  isOwner,
  onNewFolder,
}: FolderEmptySubfolderStateProps) {
  return (
    <div className="max-w-[460px] py-13">
      <h2 className="mb-1.5 text-xl font-extrabold tracking-tight text-foreground">
        This folder is empty
      </h2>
      <p className="mb-5 text-[13px] text-foreground/85">
        Drag PDFs here to upload, or create a subfolder to keep the tree organised.
      </p>
      {isOwner && (
        <div className="flex flex-wrap gap-2">
          <UploadButton folderId={folderId} folderName={folderName} variant="default">
            <Upload className="size-4" aria-hidden="true" />
            Upload PDFs
          </UploadButton>
          <Button variant="outline" onClick={onNewFolder}>
            New folder
          </Button>
        </div>
      )}
    </div>
  );
}
