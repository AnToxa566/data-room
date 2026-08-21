interface HomeStepProps {
  index: string;
  title: string;
  description: string;
}

/** One numbered row (01 / 02 / 03) in `HomeEmptyState`'s walkthrough. */
export function HomeStep({ index, title, description }: HomeStepProps) {
  return (
    <div className="flex gap-3.5 border-b border-border py-3.5 last:border-b-0">
      <span className="w-5 shrink-0 font-heading text-[13px] font-extrabold text-accent">
        {index}
      </span>
      <div>
        <div className="font-heading text-sm font-extrabold text-foreground">{title}</div>
        <div className="text-[13px] text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}
