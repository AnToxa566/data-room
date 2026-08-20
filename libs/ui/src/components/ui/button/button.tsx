import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@dataroom/ui/lib/utils';

/*
 * Variant colors/states mirror how the Modernist design system's own `.btn`/`.btn-primary`/
 * `.btn-secondary`/`.btn-ghost` classes are authored (libs/ui/src/styles.css's
 * `--color-accent-*` ramp, plus its readme: labels are the heading font at weight 800,
 * hover/pressed steps come from the ramp — not an opacity trick — and focus-visible is a
 * solid 2px accent ring with a 2px gap, matching the design's `outline: 2px solid
 * var(--color-accent); outline-offset: 2px`. Built with Tailwind's `ring`/`ring-offset`
 * (box-shadow), not `outline-*` — the base string's unconditional `outline-none` (needed to
 * suppress the browser's default outline on mouse focus) permanently zeroes Tailwind's
 * shared `--tw-outline-style` custom property, so any `outline-*` utility silently never
 * paints even under `:focus-visible`; `ring` doesn't share that property. See the design's
 * own button spec for the source values this was transcribed from.
 */
const buttonVariants = cva(
  "group/button cursor-pointer inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-heading text-sm font-extrabold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.45] aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-[var(--color-accent-600)] active:bg-[var(--color-accent-700)]',
        outline:
          'border-border bg-background hover:bg-foreground/[0.07] active:bg-foreground/[0.14] aria-expanded:bg-foreground/[0.07] dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),var(--foreground)_7%)] active:bg-[color-mix(in_srgb,var(--secondary),var(--foreground)_14%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'text-primary hover:bg-primary/10 active:bg-primary/[0.18] aria-expanded:bg-primary/10',
        destructive:
          'bg-destructive text-background hover:bg-[#6d0d27] active:bg-[#5c0b21] focus-visible:ring-destructive',
        link: 'text-primary underline-offset-[3px] hover:underline',
      },
      size: {
        default:
          'h-8.5 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-3 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-3.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-1.5 px-4.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
