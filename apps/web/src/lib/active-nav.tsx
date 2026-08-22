import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ActiveNav {
  /** The Data Room currently being browsed, if any — see `NavSection`. */
  activeDataRoomId?: string;
  /** Ids of every `FOLDER`/`FILE`-type "Shared with me" entry active for the current
   * view — see `NavSection`. */
  activeSharedItemIds: string[];
}

/** `setActive`'s input — named `dataRoomId`/`sharedItemIds` (not the `active*` names
 * above) purely so a call site reads as "set the active nav to this" rather than
 * repeating the `active` prefix on both sides of the call. */
interface SetActiveNavInput {
  dataRoomId?: string;
  sharedItemIds: string[];
}

interface ActiveNavContextValue extends ActiveNav {
  setActive: (next: SetActiveNavInput) => void;
}

const ActiveNavContext = createContext<ActiveNavContextValue | null>(null);

export function useActiveNav(): ActiveNavContextValue {
  const ctx = useContext(ActiveNavContext);
  if (!ctx) throw new Error('useActiveNav must be used within an ActiveNavProvider');
  return ctx;
}

/**
 * Holds the sidebar's active Data Room / "Shared with me" item across navigations —
 * mounted once in `root-route.tsx`'s `RootLayout`, above the router's `<Outlet/>`, so it
 * survives every in-app navigation for the session, including a route-*identity* change
 * (folder → file and back) that unmounts and remounts `AppShell`/`AppSidebar` entirely.
 *
 * Why this exists instead of `folder-route.tsx`/`file-route.tsx` passing their own query
 * result straight down to `AppShell`: that query resets to `undefined` for every render
 * between a navigation starting and its fetch resolving (react-query's normal behaviour
 * on a query-key change), which flashed the sidebar's active item off and back on. This
 * context is written to in two ways instead — see `nav-section.tsx`'s `onClick` (fires
 * optimistically, the instant a nav item is clicked, using the id already known on that
 * item — no fetch needed) and `folder-route.tsx`/`file-route.tsx`'s `useEffect` (the
 * authoritative confirmation, once that route's own query resolves) — and it is only
 * ever *overwritten* by one of those, never reset to "nothing active" just because a
 * fetch started. See `lib/folders.ts`'s `useFolderQuery` doc comment for why the fix
 * doesn't instead live in the query layer (`placeholderData: keepPreviousData`): that
 * approach also froze the *content* area's own loading state, which risked rendering one
 * folder's/file's data under another's identity.
 */
export function ActiveNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActiveNav>({
    activeDataRoomId: undefined,
    activeSharedItemIds: [],
  });

  const setActive = useCallback((next: SetActiveNavInput) => {
    setState({ activeDataRoomId: next.dataRoomId, activeSharedItemIds: next.sharedItemIds });
  }, []);

  return (
    <ActiveNavContext.Provider
      value={{
        activeDataRoomId: state.activeDataRoomId,
        activeSharedItemIds: state.activeSharedItemIds,
        setActive,
      }}
    >
      {children}
    </ActiveNavContext.Provider>
  );
}
