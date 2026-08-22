import { Link } from '@tanstack/react-router';
import { Archive, FileText, Folder as FolderIcon } from 'lucide-react';

import type { SharedWithMeItem } from '@dataroom/contracts';

const KIND_LABEL: Record<SharedWithMeItem['resourceType'], string> = {
  DATA_ROOM: 'Data Room',
  FOLDER: 'Folder',
  FILE: 'File',
};

const KIND_ICON: Record<SharedWithMeItem['resourceType'], typeof Archive> = {
  DATA_ROOM: Archive,
  FOLDER: FolderIcon,
  FILE: FileText,
};

interface HomeSharedWithMeTableProps {
  items: SharedWithMeItem[];
}

/**
 * The "Shared with me" list on the populated Home page — a Data Room, folder, or file
 * shared directly with the current user (see `SharesService.listSharedWithMe`). Rows are
 * read-only entry points, not management surfaces: no row action menu, unlike
 * `HomeDataRoomsTable` — matches the design, which gives these rows a role tag instead.
 * Same hand-rolled layout convention as the rest of this repo's list UIs (no table
 * library — see `folder-children-table.tsx`'s doc comment), but a flex row rather than a
 * CSS grid, since there's no second/third column here worth aligning across rows.
 */
export function HomeSharedWithMeTable({ items }: HomeSharedWithMeTableProps) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const Icon = KIND_ICON[item.resourceType];
        const linkClassName =
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-sm py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
        const label = (
          <>
            <Icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-heading text-sm font-extrabold text-foreground">
                {item.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {KIND_LABEL[item.resourceType]} · Shared by {item.sharedByEmail}
              </span>
            </span>
          </>
        );

        return (
          <li
            key={`${item.resourceType}-${item.resourceId}`}
            className="flex min-h-11.5 items-center gap-3 border-b border-border px-2 py-2 hover:bg-foreground/4"
          >
            {item.resourceType === 'FILE' ? (
              <Link
                to="/files/$fileId"
                params={{ fileId: item.resourceId }}
                className={linkClassName}
              >
                {label}
              </Link>
            ) : (
              <Link
                to="/folders/$id"
                params={{ id: item.folderId ?? item.resourceId }}
                className={linkClassName}
              >
                {label}
              </Link>
            )}
            <span className="shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {item.role}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
