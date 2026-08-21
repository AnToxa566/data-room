import * as React from 'react';

import { cn } from '@dataroom/ui/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 border border-border bg-background px-3 py-1 text-sm text-foreground outline-none transition-[color,border-color] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-[0.45]',
        'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent',
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
