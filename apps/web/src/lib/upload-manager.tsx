import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { apiClient, queryClient } from './api';
import { useDeleteFileMutation } from './files';

/** Mirrors `apps/api`'s `MAX_FILE_SIZE_BYTES` default (see `.env.example`). There's no
 * config-fetch endpoint to source this from, so it's a deliberately duplicated constant —
 * a fast client-side reject, not the source of truth. The server's own `413` on
 * `createUploadUrl` stays authoritative if this ever drifts from the real env value. */
const MAX_FILE_SIZE_BYTES = 104_857_600;

/** Only PDF is accepted — matches `apps/api`'s `ALLOWED_MIME_TYPES` default. A blank
 * `file.type` (some OS/browser combinations don't populate it) is accepted on a `.pdf`
 * extension alone and normalized to `application/pdf` before it's sent anywhere. */
const PDF_MIME_TYPE = 'application/pdf';

/** How many files upload at once; the rest sit `queued` until a slot frees. */
const MAX_CONCURRENT_UPLOADS = 3;

export type UploadErrorKind = 'conflict' | 'toolarge' | 'unsupported' | 'network';
export type UploadState = 'queued' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  /** May change on "Rename & retry" — `file.name` never does. */
  name: string;
  size: number;
  folderId: string;
  folderName: string;
  state: UploadState;
  /** 0–100, meaningful only while `state === 'uploading'`. */
  pct: number;
  errKind?: UploadErrorKind;
  /** Set once `createUploadUrl` succeeds; cleared on a name change (a rename claims a
   * different `File` row, so the old reservation no longer applies). */
  fileId?: string;
  uploadUrl?: string;
  uploadUrlExpiresAt?: string;
}

interface UploadManagerContextValue {
  items: UploadItem[];
  trayOpen: boolean;
  trayCollapsed: boolean;
  enqueueFiles: (files: File[], folderId: string, folderName: string) => void;
  cancel: (itemId: string) => void;
  retry: (itemId: string) => void;
  renameAndRetry: (itemId: string) => void;
  toggleCollapse: () => void;
  dismissTray: () => void;
}

const UploadManagerContext = createContext<UploadManagerContextValue | null>(null);

export function useUploadManager(): UploadManagerContextValue {
  const ctx = useContext(UploadManagerContext);
  if (!ctx) throw new Error('useUploadManager must be used within an UploadProvider');
  return ctx;
}

function isPdf(file: File): boolean {
  return file.type === PDF_MIME_TYPE || (!file.type && /\.pdf$/i.test(file.name));
}

/** "report.pdf" -> "report (2).pdf"; "report (2).pdf" -> "report (3).pdf". No sibling
 * lookup (unlike the design's `suggest()`) — the server's own `UNIQUE (folderId, name)`
 * constraint is the real check; a repeat conflict just surfaces the error again. */
function nextSuggestedName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const match = /^(.*) \((\d+)\)$/.exec(base);
  if (match) return `${match[1]} (${Number(match[2]) + 1})${ext}`;
  return `${base} (2)${ext}`;
}

/** Raw `XMLHttpRequest` PUT, not `fetch` — only `XMLHttpRequest` exposes upload progress
 * events, and the tray's per-file progress bar needs them. Returns the live `xhr` too, so
 * the caller can store it for `cancel()` to `.abort()`. */
function putToSignedUrl(
  url: string,
  file: File,
  mimeType: string,
  onProgress: (pct: number) => void,
): { promise: Promise<void>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', url);
    // Must match the mimeType `createUploadUrl` signed the URL with — GCS's V4 signature
    // bakes the Content-Type in; a mismatched header fails the PUT.
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload PUT failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.send(file);
  });
  return { promise, xhr };
}

/**
 * Owns the upload queue and tray state. Mounted once in `routes/root-route.tsx` (not
 * `folder-route.tsx`) so an upload started in one folder survives navigating to another —
 * matches the design keeping the tray fixed regardless of which view is showing.
 *
 * The two-phase flow per `ARCHITECTURE.md` §5 — `POST /files/upload-url` (reserve),
 * `PUT <uploadUrl>` (bytes, straight to GCS), `POST /files/:id/complete` (confirm) — runs
 * through `apiClient` (see `lib/api.ts`), not `tsr`'s react-query hooks: the queue
 * processor drives these two calls itself, on whatever item's turn it is, not in
 * response to one component's click.
 *
 * Reservation timing: `createUploadUrl` is only called when an item actually starts
 * uploading, not when it's enqueued — a file sitting behind the concurrency cap hasn't
 * claimed a `File` row or a name yet, so cancelling it while still `queued` is purely
 * local (nothing to tell the server about).
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const deleteFile = useDeleteFileMutation();

  // Kept in sync every render so async queue-processing code (which can't re-render to
  // pick up fresh closures) always reads the latest item list.
  const itemsRef = useRef<UploadItem[]>(items);
  itemsRef.current = items;
  const xhrsRef = useRef(new Map<string, XMLHttpRequest>());
  // Guards against the scheduler effect starting the same queued item twice — see the
  // comment on the scheduler effect below.
  const startingRef = useRef(new Set<string>());

  const patchItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const processItem = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      patchItem(id, { state: 'uploading', pct: 0 });

      const mimeType = item.file.type || PDF_MIME_TYPE;
      let { fileId, uploadUrl, uploadUrlExpiresAt } = item;

      const needsReservation =
        !fileId || !uploadUrl || !uploadUrlExpiresAt || new Date(uploadUrlExpiresAt) <= new Date();
      if (needsReservation) {
        const res = await apiClient.files.createUploadUrl({
          body: { folderId: item.folderId, name: item.name, mimeType, size: item.size },
        });
        if (res.status !== 201) {
          const errKind: UploadErrorKind =
            res.status === 409 ? 'conflict' : res.status === 413 ? 'toolarge' : 'network';
          patchItem(id, { state: 'error', errKind, fileId: undefined, uploadUrl: undefined });
          return;
        }
        fileId = res.body.fileId;
        uploadUrl = res.body.uploadUrl;
        uploadUrlExpiresAt = res.body.expiresAt;
        patchItem(id, { fileId, uploadUrl, uploadUrlExpiresAt });
      }

      // Guaranteed set by this point (either carried over from a prior attempt, or just
      // reserved above) — narrows the types for TS as much as it documents the invariant.
      if (!fileId || !uploadUrl) {
        patchItem(id, { state: 'error', errKind: 'network' });
        return;
      }

      // `cancel()` may have removed this item while the reservation round-trip above was
      // in flight — `cleanupItem` ran against the stale (pre-reservation) snapshot then,
      // so it had no `fileId` to release. Release it now instead of leaving it for
      // `PendingSweepService` to notice up to `PENDING_TTL_MINUTES` later.
      if (!itemsRef.current.some((i) => i.id === id)) {
        await apiClient.files.delete({ params: { id: fileId }, body: undefined });
        return;
      }

      const { promise, xhr } = putToSignedUrl(uploadUrl, item.file, mimeType, (pct) =>
        patchItem(id, { pct }),
      );
      xhrsRef.current.set(id, xhr);
      try {
        await promise;
      } catch (error) {
        xhrsRef.current.delete(id);
        // `cancel()` already removed the item and fired its own cleanup — nothing left
        // to patch.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        patchItem(id, { state: 'error', errKind: 'network' });
        return;
      }
      xhrsRef.current.delete(id);

      const completeRes = await apiClient.files.complete({
        params: { id: fileId },
        body: undefined,
      });
      if (completeRes.status !== 200) {
        patchItem(id, { state: 'error', errKind: 'network' });
        return;
      }
      patchItem(id, { state: 'done', pct: 100 });
      void queryClient.invalidateQueries({ queryKey: ['folders', item.folderId, 'children'] });
    },
    [patchItem],
  );

  // The scheduler: whenever the item list changes, start the next queued item if there's
  // a free concurrency slot. `startingRef` closes the gap between calling `processItem`
  // (which patches state to 'uploading' asynchronously) and that patch actually landing —
  // without it, two effect runs in the same tick could both pick the same queued item.
  useEffect(() => {
    const uploading = items.filter((i) => i.state === 'uploading').length;
    if (uploading >= MAX_CONCURRENT_UPLOADS) return;
    const next = items.find((i) => i.state === 'queued' && !startingRef.current.has(i.id));
    if (!next) return;
    startingRef.current.add(next.id);
    void processItem(next.id).finally(() => startingRef.current.delete(next.id));
  }, [items, processItem]);

  // Warn on tab close/reload only while something would actually be lost — a `queued` or
  // `uploading` item. Nothing to do about `done`/`error` items: those are just local tray
  // state the user already agreed is fine to lose. See the plan doc for why this doesn't
  // try to persist or resume in-flight uploads (resumable upload sessions are an explicit
  // non-goal — `ARCHITECTURE.md` §9).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      const active = itemsRef.current.some((i) => i.state === 'queued' || i.state === 'uploading');
      if (!active) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const enqueueFiles = useCallback((files: File[], folderId: string, folderName: string) => {
    const newItems: UploadItem[] = files.map((file) => {
      const base: UploadItem = {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        folderId,
        folderName,
        state: 'queued',
        pct: 0,
      };
      if (!isPdf(file)) return { ...base, state: 'error', errKind: 'unsupported' };
      if (file.size > MAX_FILE_SIZE_BYTES) return { ...base, state: 'error', errKind: 'toolarge' };
      return base;
    });
    setItems((prev) => [...prev, ...newItems]);
    setTrayOpen(true);
    setTrayCollapsed(false);
  }, []);

  /** Aborts the live XHR (if any) and, for anything that already claimed a `File` row,
   * fires a best-effort `DELETE` to release it — same cleanup `dismissTray` reuses. */
  const cleanupItem = useCallback(
    (item: UploadItem) => {
      const xhr = xhrsRef.current.get(item.id);
      if (xhr) {
        xhr.abort();
        xhrsRef.current.delete(item.id);
      }
      if (item.fileId && item.state !== 'done') {
        deleteFile.mutate({ params: { id: item.fileId }, body: undefined });
      }
    },
    [deleteFile],
  );

  const cancel = useCallback(
    (itemId: string) => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (item) cleanupItem(item);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    },
    [cleanupItem],
  );

  const retry = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId && i.errKind === 'network'
          ? { ...i, state: 'queued', errKind: undefined, pct: 0 }
          : i,
      ),
    );
  }, []);

  const renameAndRetry = useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId && i.errKind === 'conflict'
          ? {
              ...i,
              name: nextSuggestedName(i.name),
              state: 'queued',
              errKind: undefined,
              pct: 0,
              fileId: undefined,
              uploadUrl: undefined,
              uploadUrlExpiresAt: undefined,
            }
          : i,
      ),
    );
  }, []);

  const toggleCollapse = useCallback(() => setTrayCollapsed((c) => !c), []);

  const dismissTray = useCallback(() => {
    itemsRef.current.forEach(cleanupItem);
    setItems([]);
    setTrayOpen(false);
  }, [cleanupItem]);

  return (
    <UploadManagerContext.Provider
      value={{
        items,
        trayOpen,
        trayCollapsed,
        enqueueFiles,
        cancel,
        retry,
        renameAndRetry,
        toggleCollapse,
        dismissTray,
      }}
    >
      {children}
    </UploadManagerContext.Provider>
  );
}
