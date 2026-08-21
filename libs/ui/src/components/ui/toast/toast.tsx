import * as React from 'react';

import { cn } from '@dataroom/ui/lib/utils';

export type ToastTone = 'default' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** How long a toast stays up before auto-dismissing — matches the design's toast timing. */
const TOAST_DURATION_MS = 3200;

/**
 * A minimal, hand-rolled toast — the app has no toast dependency, and this is small
 * enough not to need one. Pixel-matched to the design's toast (dark chip, colored
 * accent bar, bottom-center, single-line), backed by a small queue rather than a single
 * slot so two actions in quick succession each get their own toast instead of one
 * clobbering the other.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);

  const toast = React.useCallback((message: string, tone: ToastTone = 'default') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-5 z-70 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex max-w-105 items-stretch bg-foreground text-background shadow-lg"
          >
            <span
              className={cn('w-1 shrink-0', item.tone === 'danger' ? 'bg-destructive' : 'bg-accent')}
              aria-hidden="true"
            />
            <span className="px-3.5 py-2.5 text-sm">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Throws outside a `ToastProvider` — every route renders through `RootLayout`, which
 * mounts one, so any component reachable from a route can call this safely. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
