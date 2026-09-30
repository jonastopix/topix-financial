import { useRef, useState } from "react";

/** Den altid-tilstedeværende reaktionsbjælke (spec §A6). Tælles pr. 5-sekundersstykke på serveren. */
export const REAKTIONER = [
  { emoji: "👍", navn: "Enig" },
  { emoji: "💡", navn: "Godt råd" },
  { emoji: "❤️", navn: "Elsker det" },
  { emoji: "😂", navn: "Sjovt" },
] as const;

/** Højst én reaktion pr. så mange ms fra samme seer — en finger, der hamrer, er ikke fem meninger. */
export const REAKTION_AFSTAND_MS = 1500;

export function Reaktioner({ onReaktion }: { onReaktion: (emoji: string) => void }) {
  const sidst = useRef(0);
  const [vist, setVist] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Reagér">
      {REAKTIONER.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-label={r.navn}
          onClick={() => {
            const nu = Date.now();
            if (nu - sidst.current < REAKTION_AFSTAND_MS) return;
            sidst.current = nu;
            onReaktion(r.emoji);
            setVist(r.emoji);
            window.setTimeout(() => setVist((v) => (v === r.emoji ? null : v)), 900);
          }}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-xl transition-transform hover:bg-hb-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen ${vist === r.emoji ? "scale-125" : ""}`}
        >
          <span aria-hidden="true">{r.emoji}</span>
        </button>
      ))}
    </div>
  );
}
