import { FolderPlus, Upload } from 'lucide-react';

import { Button } from '@dataroom/ui';

import { UploadButton } from './upload-button';

const SETUP_STEPS = [
  { index: '01', text: 'One folder per workstream — Financial, Legal, Commercial, Tax.' },
  { index: '02', text: 'PDFs only, up to 100 MB each. Drag them onto the list to upload.' },
  { index: '03', text: 'Share a folder rather than the whole room to limit what each side sees.' },
] as const;

interface FolderEmptyStateProps {
  /** The Data Room's display name, for the "Nothing in {name} yet" heading. */
  roomName: string;
  /** The root folder — where `UploadButton` uploads into. */
  folderId: string;
  /** Whether the current caller owns this Data Room — a non-owner (share recipient)
   * gets the heading and reference list only, no New-folder/Upload actions. */
  isOwner: boolean;
  /** Opens `CreateFolderDialog` — see `routes/folder-route.tsx`, which owns its open state. */
  onNewFolder: () => void;
}

/**
 * The "Browser root — empty state" design: two columns, left is the CTA panel (mirrors
 * `HomeEmptyState`'s shape but with folder-scoped copy and two buttons instead of one),
 * right is a static "how rooms are usually set up" reference list. "New folder" opens
 * `CreateFolderDialog`, same as `FolderToolbar`'s button; "Upload PDFs" opens the native
 * file picker via `UploadButton`.
 */
export function FolderEmptyState({
  roomName,
  folderId,
  isOwner,
  onNewFolder,
}: FolderEmptyStateProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-10 border-b-2 border-border py-13 min-[900px]:grid-cols-2">
      <div>
        <div className="mb-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Empty Data Room
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
          Nothing in {roomName} yet
        </h2>
        <p className="mt-2 mb-5.5 max-w-[44ch] text-sm leading-relaxed text-foreground/85">
          Start with the top-level folders you want counterparties to see, then upload
          PDFs into them. Nothing is visible to anyone until you share it.
        </p>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={onNewFolder}>
              <FolderPlus className="size-4" aria-hidden="true" />
              New folder
            </Button>
            <UploadButton folderId={folderId} folderName={roomName} variant="outline">
              <Upload className="size-4" aria-hidden="true" />
              Upload PDFs
            </UploadButton>
          </div>
        )}
      </div>
      <div className="border-t border-border pt-6 min-[900px]:border-t-0 min-[900px]:border-l-2 min-[900px]:pt-0 min-[900px]:pl-6">
        <div className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          How rooms are usually set up
        </div>
        <div className="flex flex-col">
          {SETUP_STEPS.map((step) => (
            <div
              key={step.index}
              className="flex gap-3 border-b border-border py-2.5 last:border-b-0"
            >
              <span className="w-5 shrink-0 font-heading text-[13px] font-extrabold text-accent tabular-nums">
                {step.index}
              </span>
              <span className="text-sm text-foreground/85">{step.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
