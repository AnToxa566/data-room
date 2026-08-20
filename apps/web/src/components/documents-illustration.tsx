interface DocumentsIllustrationProps {
  className?: string;
}

/**
 * Original, flat, abstract depiction of documents and folders in a shared space — drawn
 * entirely from the app's own colour tokens (see libs/ui/src/styles.css), no external
 * assets. Purely decorative: hidden from assistive tech.
 */
export function DocumentsIllustration({ className }: DocumentsIllustrationProps) {
  return (
    <svg
      viewBox="0 0 320 280"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Shared surface */}
      <rect x="8" y="24" width="304" height="232" rx="24" className="fill-muted" />

      {/* Back folder — border/foreground-derived, not secondary/accent: those tokens sit
          at the same near-white value as the surface behind them in this theme and would
          be invisible here. */}
      <g transform="rotate(-6 100 150)">
        <path
          d="M60 120h50l14 14h96a8 8 0 0 1 8 8v78a8 8 0 0 1-8 8H60a8 8 0 0 1-8-8v-92a8 8 0 0 1 8-8Z"
          className="fill-foreground/10"
        />
      </g>

      {/* Front folder */}
      <g transform="rotate(4 190 160)">
        <path
          d="M120 140h48l13 13h91a8 8 0 0 1 8 8v72a8 8 0 0 1-8 8H120a8 8 0 0 1-8-8v-85a8 8 0 0 1 8-8Z"
          className="fill-foreground/20"
        />
      </g>

      {/* Document peeking out, back */}
      <g transform="rotate(-8 130 110)">
        <rect
          x="96"
          y="56"
          width="72"
          height="96"
          rx="6"
          className="fill-background stroke-border"
          strokeWidth="2"
        />
        <line x1="110" y1="80" x2="150" y2="80" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
        <line x1="110" y1="94" x2="154" y2="94" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
        <line x1="110" y1="108" x2="138" y2="108" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* Document peeking out, front */}
      <g transform="rotate(7 210 100)">
        <rect
          x="168"
          y="46"
          width="68"
          height="90"
          rx="6"
          className="fill-background stroke-border"
          strokeWidth="2"
        />
        <line x1="182" y1="68" x2="220" y2="68" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
        <line x1="182" y1="82" x2="224" y2="82" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
        <line x1="182" y1="96" x2="206" y2="96" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* Primary folder, front-most */}
      <path
        d="M96 168h46l12 12h108a10 10 0 0 1 10 10v58a10 10 0 0 1-10 10H96a10 10 0 0 1-10-10v-70a10 10 0 0 1 10-10Z"
        className="fill-primary"
      />
    </svg>
  );
}
