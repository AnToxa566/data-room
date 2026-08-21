import { Plus } from 'lucide-react';

import { Button } from '@dataroom/ui';

import { HomeStep } from './home-step';

const STEPS = [
  {
    index: '01',
    title: 'Create a room and name it after the deal',
    description: 'One room per transaction keeps access boundaries clean.',
  },
  {
    index: '02',
    title: 'Build the folder tree and upload PDFs',
    description: 'Drag files straight onto the list, or use the picker.',
  },
  {
    index: '03',
    title: 'Share a room, a folder, or a single file',
    description: 'Read-only, by link or by email. Revocable at any time.',
  },
] as const;

interface HomeEmptyStateProps {
  onNewRoom: () => void;
}

/**
 * The "no Data Rooms yet" state. The CTA mirrors `HomeHeader`'s "New Data Room" button
 * and opens the same `CreateDataRoomDialog` — see routes/home-route.tsx.
 */
export function HomeEmptyState({ onNewRoom }: HomeEmptyStateProps) {
  return (
    <div className="pt-14 pb-6">
      <div aria-hidden="true" className="mb-6 size-7 bg-accent" />
      <h2 className="text-[28px] font-extrabold tracking-tight text-foreground">
        You have no Data Rooms yet
      </h2>
      <p className="text-[15px] leading-relaxed text-balance text-foreground/85">
        A Data Room holds the confidential documents for one deal. You upload PDFs
        into folders, then hand read-only access to the people who need it —
        auditors, counsel, the counterparty&apos;s team — and revoke it when the
        deal closes.
      </p>
      <div className="my-7 border-t-2 border-border">
        {STEPS.map((step) => (
          <HomeStep key={step.index} {...step} />
        ))}
      </div>
      <Button variant="default" onClick={onNewRoom}>
        <Plus className="size-4" aria-hidden="true" />
        Create your first Data Room
      </Button>
    </div>
  );
}
