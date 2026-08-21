import * as React from 'react';

import { cn } from '@dataroom/ui/lib/utils';

/**
 * A pulsing placeholder bar for content that hasn't loaded yet. No border-radius — this
 * design system is zero-corner-radius throughout (`--radius: 0px`, see
 * `libs/ui/src/styles.css`), and the source design's own loading skeleton
 * (`Data Red Room.dc.html`, "Browser — loading") draws plain rectangles, not rounded ones.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse bg-[var(--color-neutral-300)]', className)}
      {...props}
    />
  );
}

export { Skeleton };
