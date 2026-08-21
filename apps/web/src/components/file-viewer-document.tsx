import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { useFileDownloadUrlQuery } from '../lib/files';

interface FileViewerDocumentProps {
  fileId: string;
  fileName: string;
  mimeType: string;
  status: 'PENDING' | 'READY';
}

/**
 * The document itself. Per `ARCHITECTURE.md` §9 ("Document preview beyond native
 * browser PDF rendering" is an explicit non-goal), this is a bare `<iframe>` pointed at
 * the signed GCS URL from `useFileDownloadUrlQuery` — the browser's own PDF renderer
 * does the work, not `pdfjs`/`react-pdf` (neither is installed anywhere in this repo).
 *
 * Two guards before the request even fires: a still-`PENDING` file (upload in progress —
 * there's no route to reach this page for one yet, but the field exists) would 400 on
 * `downloadUrl` (see `FilesService.downloadUrl`), and a non-PDF `mimeType` has nothing
 * useful to embed even once uploads eventually accept more than PDF.
 */
export function FileViewerDocument({ fileId, fileName, mimeType, status }: FileViewerDocumentProps) {
  const isPdf = mimeType === 'application/pdf';
  const downloadUrl = useFileDownloadUrlQuery(fileId, { enabled: status === 'READY' && isPdf });

  if (status !== 'READY') {
    return (
      <FileViewerMessage>This file is still being processed and can&apos;t be previewed yet.</FileViewerMessage>
    );
  }

  if (!isPdf) {
    return <FileViewerMessage>Preview isn&apos;t available for this file type.</FileViewerMessage>;
  }

  if (downloadUrl.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy="true" aria-label="Loading document">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (downloadUrl.isError) {
    return <FileViewerMessage>Couldn&apos;t load this file. Try refreshing the page.</FileViewerMessage>;
  }

  return (
    <iframe
    title={fileName}
      src={downloadUrl.data.body.url}
      className="h-full min-h-[70vh] w-full flex-1 border-0 bg-white"
    />
  );
}

function FileViewerMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
