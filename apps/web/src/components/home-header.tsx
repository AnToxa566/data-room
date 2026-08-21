import { Plus } from 'lucide-react';

import { Button } from '@dataroom/ui';

interface HomeHeaderProps {
  onNewRoom: () => void;
}

/**
 * The "Data Rooms" title row, shared by every state of the room list (empty and
 * populated alike). "New Data Room" opens `CreateDataRoomDialog` — see
 * routes/home-route.tsx, which owns the dialog's open state and passes it down here.
 */
export function HomeHeader({ onNewRoom }: HomeHeaderProps) {
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
      <Button variant="default" onClick={onNewRoom}>
        <Plus className="size-4" aria-hidden="true" />
        New Data Room
      </Button>
    </div>
  );
}
