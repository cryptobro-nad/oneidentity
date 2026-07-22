const MONO = { fontFamily: "var(--font-mono)" } as const;
const SANS = { fontFamily: "var(--font-sans)" } as const;

/**
 * The wallet convergence diagram: three source wallets (one primary, two
 * secondary) flowing into one combined view. Decorative but labelled. The four
 * animated pulses use pathLength="100" and stop under reduced motion (see the
 * .strand-pulse rules in globals.css).
 *
 * Result wording is accurate: this is the combined watch-only view, not a
 * Verified ONE identity — the distinction is explained in the "Two ways"
 * section.
 */
export function NetworkDiagram({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 22 560 336"
      role="img"
      aria-label="Three Monad wallets converging into one combined view"
      className={`h-auto w-full overflow-visible ${className}`}
    >
      {/* static strands */}
      <g fill="none" stroke="var(--line-strong)" strokeWidth="1.25">
        <path d="M222 62 C 268 62, 262 190, 300 190" />
        <path d="M222 190 H 300" />
        <path d="M222 318 C 268 318, 262 190, 300 190" />
        <path d="M306 190 H 348" />
      </g>

      {/* four normalized animated pulses */}
      <path className="strand-pulse" pathLength="100" d="M222 62 C 268 62, 262 190, 300 190" />
      <path className="strand-pulse p2" pathLength="100" d="M222 190 H 300" />
      <path className="strand-pulse p3" pathLength="100" d="M222 318 C 268 318, 262 190, 300 190" />
      <path className="strand-pulse p4" pathLength="100" d="M306 190 H 348" />
      <circle cx="303" cy="190" r="4.5" fill="var(--accent)" />

      {/* wallet chips */}
      <g>
        <rect
          x="8"
          y="36"
          width="214"
          height="52"
          rx="13"
          fill="var(--surface)"
          stroke="var(--accent-deep)"
          strokeOpacity="0.55"
        />
        <circle cx="30" cy="62" r="3.4" fill="var(--accent-deep)" />
        <text x="44" y="66" style={MONO} fontSize="13.5" fill="var(--ink)">
          Wallet A
        </text>
        <text x="140" y="66" style={MONO} fontSize="10.5" letterSpacing="0.1em" fill="var(--ink-3)">
          SECONDARY
        </text>
      </g>
      <g>
        <rect
          x="8"
          y="164"
          width="214"
          height="52"
          rx="13"
          fill="var(--surface-2)"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <circle cx="30" cy="190" r="3.4" fill="var(--accent)" />
        <text x="44" y="194" style={MONO} fontSize="13.5" fill="var(--ink)">
          Wallet B
        </text>
        <text
          x="152"
          y="194"
          style={MONO}
          fontSize="10.5"
          letterSpacing="0.1em"
          fill="var(--accent-deep)"
        >
          PRIMARY
        </text>
      </g>
      <g>
        <rect
          x="8"
          y="292"
          width="214"
          height="52"
          rx="13"
          fill="var(--surface)"
          stroke="var(--accent-deep)"
          strokeOpacity="0.55"
        />
        <circle cx="30" cy="318" r="3.4" fill="var(--accent-deep)" />
        <text x="44" y="322" style={MONO} fontSize="13.5" fill="var(--ink)">
          Wallet C
        </text>
        <text x="140" y="322" style={MONO} fontSize="10.5" letterSpacing="0.1em" fill="var(--ink-3)">
          SECONDARY
        </text>
      </g>

      {/* combined view */}
      <rect x="348" y="112" width="204" height="156" rx="17" fill="var(--surface-2)" stroke="var(--accent)" />
      <circle cx="372" cy="140" r="3.6" fill="var(--accent)" />
      <text x="385" y="145" style={SANS} fontSize="14.5" fontWeight="600" fill="var(--ink)">
        ONE combined view
      </text>
      <line x1="368" y1="162" x2="532" y2="162" stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 4" />
      <text x="368" y="184" style={SANS} fontSize="12.5" fill="var(--ink-2)">
        MON · stablecoins
      </text>
      <text x="368" y="204" style={SANS} fontSize="12.5" fill="var(--ink-2)">
        Supported memecoins
      </text>
      <text x="368" y="224" style={SANS} fontSize="12.5" fill="var(--ink-2)">
        NFTs
      </text>
      <text x="368" y="250" style={MONO} fontSize="10.5" letterSpacing="0.1em" fill="var(--accent-live)">
        MANY WALLETS, ONE VIEW
      </text>
    </svg>
  );
}
