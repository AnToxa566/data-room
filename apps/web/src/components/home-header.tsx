import { Plus } from 'lucide-react';

import { Button } from '@dataroom/ui';

/**
 * The "Data Rooms" title row, shared by every state of the room list (empty and
 * populated alike). The "New Data Room" action has no handler yet — creating a Data
 * Room isn't implemented, so the button is intentionally inert.
 */
export function HomeHeader() {
  return (
    <div className="flex flex-wrap items-end gap-4 border-b-2 border-border pb-4">
      <div className="min-w-55 flex-1">
        <h1 className="text-[34px] font-extrabold tracking-tight text-foreground">
          Data Rooms
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Confidential document repositories. One room per deal.
        </p>
      </div>
      <Button variant="default">
        <Plus className="size-4" aria-hidden="true" />
        New Data Room
      </Button>
    </div>
  );
}
