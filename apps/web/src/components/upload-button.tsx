import { useRef, type ComponentProps, type ReactNode } from 'react';

import { Button } from '@dataroom/ui';

import { useUploadManager } from '../lib/upload-manager';

interface UploadButtonProps {
  folderId: string;
  folderName: string;
  variant?: ComponentProps<typeof Button>['variant'];
  children: ReactNode;
}

/**
 * The real "Upload" / "Upload PDFs" button — replaces the inert `<Button>` blocks that
 * used to sit in `folder-toolbar.tsx`, `folder-empty-state.tsx`, and
 * `folder-empty-subfolder-state.tsx`. Renders whatever's passed as `children` (so each
 * caller keeps its own icon/label) around a visually-hidden native file input; clicking
 * the visible button opens the OS picker, and a selection hands the files straight to
 * `useUploadManager().enqueueFiles` — see `lib/upload-manager.tsx` for what happens next.
 *
 * `accept="application/pdf"` scopes the OS picker's default filter, but browsers still
 * let a user override it and pick anything — the manager's own PDF/size check on
 * `enqueueFiles` (not this component) is the real gate, surfaced as tray errors.
 */
export function UploadButton({ folderId, folderName, variant, children }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { enqueueFiles } = useUploadManager();

  return (
    <>
      <Button type="button" variant={variant} onClick={() => inputRef.current?.click()}>
        {children}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            enqueueFiles(Array.from(files), folderId, folderName);
          }
          // Reset so picking the exact same file(s) again still fires `onChange`.
          event.target.value = '';
        }}
      />
    </>
  );
}
