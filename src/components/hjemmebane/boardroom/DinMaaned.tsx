import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDKK } from "@/lib/financialUtils";
import { sparklineKoordinater, type DinMaanedDom } from "@/lib/hjemmebane/dinMaaned";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { EstimatMaerke } from "../EstimatMaerke";

/** «Din måned» (forside PR 2, 17/9 — Jonas «A» til valg 2) — afløste
    tal-strippen nederst på forsiden. Samme kilder (facts-laget via
    dinMaanedDom: alle tre tal fra den viste måned — bank kun målt, ellers
    «ikke opgjort for {måned}» (3/10); estimat-mærket efter data_basis), med RETNING I ORD mod forrige måned og en
    SPARKLINE over de seneste 12 måneder med tal. Ingen procent, ingen
    farve for op/ned — kun ord (negativt beløb er rust som i resten af
    huset). Uden tal: hvad det bliver til + «Upload din første rapport».

    FLYTTET (seks steder, skridt 2, 2/10-2026 — Jonas 2/10: «Din måned»
    forlader forsiden): kortet er tegn for tegn det samme, men bor nu i sin
    egen fil og tegnes ØVERST på Dine tals rapporteringsside
    (RapporteringView), ikke på forsiden — tallene bor i Dine tal; forsiden
    siger med Score, hvordan virksomheden har det. `udenCta`: på /reports
    peger den tomme tilstands knap («Upload din første rapport» → /reports)
    på siden selv, og upload-zonen står lige under — så knappen udelades
    dér. Værn: forsideTop.guard dom 2 (ingen procent) læser denne fil. */
const Sparkline = ({ dom }: { dom: Extract<DinMaanedDom, { tom: false }> }) => {
  const k = sparklineKoordinater(dom.sparkline);
  if (k.length < 2) return null;
  const B = 100, H = 32;
  const punkter = k.map((p) => `${(p.x * B).toFixed(1)},${(2 + p.y * (H - 4)).toFixed(1)}`).join(" ");
  const sidste = k[k.length - 1];
  return (
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="mt-3 h-9 w-full" aria-hidden data-sparkline={k.length}>
      <polyline points={punkter} fill="none" stroke="hsl(var(--hb-evergreen))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(sidste.x * B).toFixed(1)} cy={(2 + sidste.y * (H - 4)).toFixed(1)} r="2.5" fill="hsl(var(--hb-evergreen))" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const lilleMaaned = (t: string): string => (t ? t.charAt(0).toLocaleLowerCase("da-DK") + t.slice(1) : t);

export const DinMaaned = ({ dom, udenCta = false }: { dom: DinMaanedDom; udenCta?: boolean }) => {
  // strict=false: `if (dom.tom)` snævrer ikke unionen — sammenlign med true (husets regel).
  if (dom.tom === true) {
    return (
      <HbCard className="p-6" data-din-maaned="tom">
        <h3 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">{dom.overskrift}</h3>
        <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">{dom.linje}</p>
        {!udenCta && (
          <Link to={dom.cta.to} className="mt-4 inline-block">
            <HbButton className="h-9 px-4 text-sm">{dom.cta.label}</HbButton>
          </Link>
        )}
      </HbCard>
    );
  }
  return (
    <HbCard className="p-6" data-din-maaned={dom.periodLabel}>
      <p className="text-sm text-hb-ink-soft">
        {/* Månedsnavnet med lille midt i sætningen («Senest godkendt: august 2026» — UX-rådet 2/10). */}
        {dom.estimeret ? <>Seneste tal: {lilleMaaned(dom.periodLabel)} <EstimatMaerke className="align-middle" /></> : <>Senest godkendt: {lilleMaaned(dom.periodLabel)}</>}
      </p>
      <dl className="mt-3 divide-y divide-hb-line">
        {dom.tal.map((t) => (
          <div key={t.felt} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0" data-tal={t.felt}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{t.label}</dt>
            <dd className="text-right">
              {/* Fortegns-tonen: samme udtryk som resten af platformen (HbBudgetEditTable:625). */}
              <p className={cn("font-editorial text-2xl font-medium leading-none", t.value != null && t.value < 0 ? "text-hb-rust" : "text-hb-ink")}>
                {t.value != null ? formatDKK(t.value) : "—"}
              </p>
              {t.retning && <p className="mt-1 text-xs text-hb-ink-soft" data-retning>{t.retning}</p>}
              {/* 3/10 (g03-bank-som-i-november): mangler den viste måned tallet, siges det ærligt — aldrig et ældre tal. */}
              {t.mangler && <p className="mt-1 text-xs text-hb-ink-soft" data-mangler>{t.mangler}</p>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{dom.sparklineTekst}</p>
      <Sparkline dom={dom} />
    </HbCard>
  );
};
