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
 *
 * HENT PNG (14/9): én knap i topbjælken henter den åbne kreativ i dens eget
 * format gennem motoren kreativEksport.hentKreativSomPng (den kloner
 * elementet, fjerner skaleringen på klonen og tegner 1080×1080 / 1200×627
 * med html2canvas). Mens den tegner: HbButton med Loader2 og disabled —
 * husets mønster for en knap der arbejder (KontoView.tsx:165-183). Klik
 * nummer to ignoreres af `henter`. Fejl siges med sonner
 * (toast.error(titel, { description }), HbFeedbackDialog.tsx:80-84):
 * motoren kaster når lærredet er tomt eller spærret af et billede uden
 * CORS, eller når det ender i en forkert størrelse. Succes: toast.success
 * med filnavn og mål.
 *
 * Tomtilstanden er til forhåndsvisningen, aldrig til filen (Jonas 14/9):
 * mens der eksporteres, tegnes kreativen med visTomtilstand=false — sat
 * med flushSync, så DOM'en er uden pladsholdere FØR html2canvas kloner.
 */

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { KreativData } from "@/lib/delingskreativ";
import { hentKreativSomPng } from "@/lib/kreativEksport";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { SkaleretKreativ } from "./SkaleretKreativ";
import { kreativMaal, type KreativPost } from "./kreativer";

export interface KreativFuldskaermProps {
  kreativer: ReadonlyArray<KreativPost>;
  /** Hendes data — samme objekt som galleriet, så rettelser følger med. */
  data: KreativData;
  indeks: number;
  onSkift: (indeks: number) => void;
  onLuk: () => void;
}

export const KreativFuldskaerm = ({ kreativer, data, indeks, onSkift, onLuk }: KreativFuldskaermProps) => {
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
  const [henter, setHenter] = useState(false);

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

  const hentPng = async () => {
    if (henter) return;
    const element = panelRef.current?.querySelector<HTMLElement>("[data-kreativ]");
    if (!element) {
      toast.error("Kunne ikke hente PNG", { description: "Kreativen er ikke på skærmen endnu." });
      return;
    }
    // Pladsholderne ud af DOM'en før klonen tages — synkront.
    flushSync(() => setHenter(true));
    try {
      const r = await hentKreativSomPng(element, { layout: post.layout, udgave: post.udgave, format: post.format }, data.memberName);
      toast.success("PNG hentet", { description: `${r.filnavn} · ${r.bredde}×${r.hoejde} px` });
    } catch (e) {
      toast.error("Kunne ikke hente PNG", { description: e instanceof Error ? e.message : "Ukendt fejl under tegningen." });
    } finally {
      setHenter(false);
    }
  };

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
          <HbButton type="button" onClick={hentPng} disabled={henter} aria-busy={henter} className="h-9 gap-1.5 px-4 text-sm">
            {henter ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {henter ? "Tegner…" : "Hent PNG"}
          </HbButton>
          <button type="button" onClick={() => onSkift(indeks - 1)} disabled={!harForrige} aria-label="Forrige kreativ" className={pil}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" onClick={() => onSkift(indeks + 1)} disabled={!harNaeste} aria-label="Næste kreativ" className={pil}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Området er en flex-kolonne med definit højde (dialogen er fixed inset-0):
          SkaleretKreativ er selv flex-elementet og måler et tal, aldrig en procent. */}
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-8">
        <SkaleretKreativ bredde={maal.bredde} hoejde={maal.hoejde} tilpas="boks">
          <Kreativ
            udgave={post.udgave}
            format={post.format}
            memberName={data.memberName}
            companyName={data.companyName}
            dateLabel={data.dateLabel}
            portraetUrl={data.portraetUrl}
            logoUrl={data.logoUrl}
            visTomtilstand={!henter}
          />
        </SkaleretKreativ>
      </div>
    </div>
  );
};
