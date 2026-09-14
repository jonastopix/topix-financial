/**
 * KreativFuldskaerm — én kreativ stor, med skift mellem kreativerne og en
 * vej tilbage til overblikket (Jonas 14/9).
 *
 * HVORFOR IKKE shadcn Dialog/Sheet: de findes i src/components/ui, men
 * Hjemmebane bruger dem bevidst ikke — Radix portalerer til <body>, uden
 * for .theme-hjemmebane, og arver appens mørke tokens (HbSidebar.tsx
 * «bevidst IKKE shadcn Sheet», HbOnboardingTjekliste.tsx «IKKE EN
 * RADIX-DIALOG», HbOverlejring.tsx:6-12). Husets egen dialog, HbDialog i
 * milestones/HbOverlejring.tsx, er et panel på højst max-w-lg (512 px) —
 * for smalt til en kreativ der skal fylde skærmen. Så denne følger
 * HbDialogs mønster (fixed i skallens eget DOM-træ, role="dialog",
 * aria-modal, Escape lukker, fokus ind ved åbning og tilbage ved lukning),
 * men fylder hele skærmen og har pile til at skifte.
 *
 * Tastatur: Escape = tilbage til overblikket; ← / → = forrige / næste.
 */

import { useEffect, useId, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PROEVETEKSTER } from "@/lib/delingskreativ";
import { SkaleretKreativ } from "./SkaleretKreativ";
import { kreativMaal, type KreativPost } from "./kreativer";

export interface KreativFuldskaermProps {
  kreativer: ReadonlyArray<KreativPost>;
  indeks: number;
  onSkift: (indeks: number) => void;
  onLuk: () => void;
}

export const KreativFuldskaerm = ({ kreativer, indeks, onSkift, onLuk }: KreativFuldskaermProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onLukRef = useRef(onLuk);
  onLukRef.current = onLuk;
  const onSkiftRef = useRef(onSkift);
  onSkiftRef.current = onSkift;
  const indeksRef = useRef(indeks);
  indeksRef.current = indeks;
  const antalRef = useRef(kreativer.length);
  antalRef.current = kreativer.length;
  const titelId = useId();

  useEffect(() => {
    const forrige = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onLukRef.current();
      } else if (e.key === "ArrowLeft" && indeksRef.current > 0) {
        onSkiftRef.current(indeksRef.current - 1);
      } else if (e.key === "ArrowRight" && indeksRef.current < antalRef.current - 1) {
        onSkiftRef.current(indeksRef.current + 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      forrige?.focus?.();
    };
  }, []);

  const post = kreativer[indeks];
  if (!post) return null;
  const maal = kreativMaal(post);
  const Kreativ = post.komponent;
  const harForrige = indeks > 0;
  const harNaeste = indeks < kreativer.length - 1;

  const pil = "rounded-full border border-hb-line bg-hb-surface p-2 text-hb-ink transition-colors hover:bg-hb-sage/50 disabled:opacity-30 disabled:hover:bg-hb-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60";

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titelId}
      className="fixed inset-0 z-50 flex flex-col bg-hb-paper focus:outline-none"
    >
      <div className="flex items-center gap-3 border-b border-hb-line px-4 py-3 sm:px-6">
        <button type="button" onClick={onLuk} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-hb-ink transition-colors hover:bg-hb-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60">
          <X className="h-4 w-4" aria-hidden />
          Tilbage til overblikket
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 id={titelId} className="truncate font-brand text-base font-semibold text-hb-ink">{post.titel}</h2>
          <p className="text-xs text-hb-ink-soft">
            {indeks + 1} af {kreativer.length} · {maal.bredde}×{maal.hoejde}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onSkift(indeks - 1)} disabled={!harForrige} aria-label="Forrige kreativ" className={pil}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => onSkift(indeks + 1)} disabled={!harNaeste} aria-label="Næste kreativ" className={pil}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4 sm:p-8">
        <SkaleretKreativ bredde={maal.bredde} hoejde={maal.hoejde} tilpas="boks">
          <Kreativ
            udgave={post.udgave}
            format={post.format}
            memberName={PROEVETEKSTER.memberName}
            companyName={PROEVETEKSTER.companyName}
            dateLabel={PROEVETEKSTER.dateLabel}
            visTomtilstand
          />
        </SkaleretKreativ>
      </div>
    </div>
  );
};
