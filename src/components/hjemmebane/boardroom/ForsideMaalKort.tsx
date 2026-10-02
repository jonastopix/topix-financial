import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MaalKort as MaalKortDom } from "@/lib/hjemmebane/maalTal";
import { bane, chipTone, KORT_ORD, skridtFremdrift, stregTekst, talUndertekst } from "@/lib/hjemmebane/dineMaalFlade";
import { FORSIDE_MAAL_ORD } from "@/lib/hjemmebane/forsideMaal";
import { fristKort } from "@/lib/hjemmebane/forsideDato";
import { Chip } from "../milestones/MaalKort";

/**
 * Ét mål på FORSIDEN i Dine mål-sproget (2/10-2026 aften — Jonas' ja til
 * mockuppen «Din plan i tre tilstande», tilstand A). Venstre halvdel er
 * motorens kort (maalTal.maalKort gennem useDineMaalGrundlag — SAMME dom som
 * /milestones): statuschip + frist, målet som serif-sætning, det store tal og
 * banen med stregen «hvor I burde være». Højre halvdel er kalderens (children):
 * skridtene med forsidens egne knapper (PlanSkridtRaekke — Gjort / Udskyd /
 * Tag den / Nej tak), så «Svar på forsiden» fra /milestones stadig holder.
 *
 * TEGNER KUN — ingen regnestykker. `kort` er null, mens motoren henter, eller
 * hvis målet ikke er blandt dens kort; så står titlen og skridt-fremdriften
 * (forsidePlanDom) alene, så kortet aldrig blinker tomt.
 *
 * Et GAMMELT mål (art null) har intet tal: kortet siger det roligt og peger på
 * «Gør målet skarpt» på Dine mål (guiden bor dér). Mobil: halvdelene stables.
 */

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";
const fokus = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

type Props = {
  kort: MaalKortDom | null;
  /** Fald-tilbage, når motorens kort mangler (forsidePlanDom). */
  titel: string;
  fremdrift: number;
  fristTekst: string | null;
  fristForfalden: boolean;
  /** Guiden «Gør målet skarpt» for dette mål (forsideMaal.skarptSti). */
  skarptHref: string;
  /** Målets frist («YYYY-MM-DD») — FORSIDE V3: fristen står i forsidens ene datoformat (fristKort). */
  fristDato?: string | null;
  children: React.ReactNode;
};

const SkridtBar = ({ pct, stille = false }: { pct: number; stille?: boolean }) => (
  <div className={cn("overflow-hidden rounded-full bg-hb-line", stille ? "h-1" : "h-1.5")} aria-hidden>
    <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", stille ? "bg-hb-ink/30" : "bg-hb-evergreen/80")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

const Venstre = ({ kort, titel, fremdrift, fristTekst, fristForfalden, skarptHref, fristDato = null }: Omit<Props, "children">) => {
  if (!kort) {
    return (
      <div data-forside-maal-venstre="uden-motor">
        {fristTekst && <p className={cn("text-xs", fristForfalden ? "font-medium text-hb-rust" : "text-hb-ink-soft")}>{fristTekst}</p>}
        <h3 className="mt-2 font-editorial text-xl font-medium leading-snug text-hb-ink">{titel}</h3>
        <div className="mt-4"><SkridtBar pct={fremdrift} /></div>
        <p className="mt-1.5 text-xs text-hb-ink-soft">{Math.round(fremdrift)} %</p>
      </div>
    );
  }
  // FORSIDE V3 (docs/forside-v3.md §0): fristen i forsidens ENE datoformat («frist 30. mar. 2027», «frist i
  // dag» i rust). Uden dato: motorens ord («Ingen frist»).
  const fk = fristDato ? fristKort(fristDato, new Date()) : null;
  const forfalden = fk ? fk.forfalden || fk.iDag : kort.sporet.dageTilbage !== null && kort.sporet.dageTilbage < 0;
  const fristLinje = (
    <span className={cn("text-xs", forfalden ? "font-medium text-hb-rust" : "text-hb-ink-soft")} data-maal-frist-tekst>{fk ? fk.tekst : kort.fristTekst}</span>
  );

  if (kort.goerSkarpt) {
    // GAMMELT MÅL (art null — i dag ALLE mål i prod, målt 2/10): ingen tal, ingen spor. Kortet siger det
    // roligt («Uden tal endnu», aldrig motorens «Kan ikke afgøres endnu»), viser skridtene med etiket
    // (aldrig en bar uden forklaring — Jonas' skærm 2/10 19:29: «2 mio. i omsætning» så næsten nået ud)
    // og gør «Sæt et tal på» til kortets ENE handling: guiden «Gør målet skarpt» for præcis dette mål.
    const sf = skridtFremdrift(kort);
    // FORSIDE V3 (mockup v3, §4): chip + frist, serif-titlen, den STILLE bar og ÉN linje «N af M skridt gjort ·
    // Sæt et tal på →» — handlingen er linket i linjen, ikke en boks (kortet står i en liste af mål).
    return (
      <div data-forside-maal-venstre="gammel">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Chip tone="neutral" data-maal-chip>{FORSIDE_MAAL_ORD.udenTal}</Chip>
          {fristLinje}
        </div>
        <h3 className="mt-2 font-editorial text-lg font-medium leading-snug text-hb-ink">{kort.titel}</h3>
        {sf.alle > 0 && (
          <div className="mt-2" data-maal-skridt-fremdrift={`${sf.gjorte}/${sf.alle}`}>
            {/* STILLE bar: skridtene, ikke målet — må ikke ligne «næsten nået» (Jonas' skærm 2/10). */}
            <SkridtBar pct={Math.round(sf.andel * 1000) / 10} stille />
          </div>
        )}
        <p className="mt-1.5 text-xs text-hb-ink-soft" data-maal-saet-tal>
          {sf.alle > 0 && <>{sf.tekst} · </>}
          <Link to={skarptHref} className={cn("font-medium text-hb-evergreen underline-offset-4 hover:underline", fokus)} data-handling="saet-tal-paa">
            {FORSIDE_MAAL_ORD.saetTalPaa} →
          </Link>
        </p>
      </div>
    );
  }

  const erTal = kort.art === "tal";
  const tone = chipTone(kort.sporet.status);
  const b = bane(kort);
  const sf = erTal ? null : skridtFremdrift(kort);
  const undertekst = talUndertekst(kort);
  return (
    <div data-forside-maal-venstre={kort.art ?? "gammel"} data-maal-status={kort.sporet.status}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Chip tone={erTal ? tone : "neutral"} data-maal-chip>{erTal ? kort.statusOrd : sf?.tekst}</Chip>
        {fristLinje}
      </div>
      <h3 className="mt-3 font-editorial text-xl font-medium leading-snug text-hb-ink md:text-[22px]">{kort.titel}</h3>
      {erTal ? (
        <>
          <div className="mt-3" data-maal-tal>
            {kort.talTekst ? (
              <>
                <p className="font-editorial text-[2.25rem] font-medium leading-none tabular-nums text-hb-ink">{kort.talTekst}</p>
                {undertekst && <p className="mt-1.5 text-xs text-hb-ink-soft">{undertekst}</p>}
              </>
            ) : (
              <p className="text-sm leading-relaxed text-hb-ink-soft" data-maal-tal-mangler>{kort.tal?.status === "mangler" ? kort.tal.grund : kort.grundTekst}</p>
            )}
          </div>
          <div className="mt-4" data-maal-bane data-maal-bane-fyldt={b.fyldtPct} data-maal-bane-streg={b.stregPct ?? "ingen"}>
            <div className="relative h-1.5 rounded-full bg-hb-line" aria-hidden>
              <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", tone === "advarsel" ? "bg-hb-rust/70" : "bg-hb-evergreen/80")} style={{ width: `${b.fyldtPct}%` }} />
              {b.stregPct !== null && <span className="absolute -top-1 h-3.5 w-px bg-hb-ink" style={{ left: `${b.stregPct}%` }} />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px] text-hb-ink-soft">
              <span className="min-w-0 truncate"><span className={mikro}>{KORT_ORD.start}</span> {kort.udgangspunktTekst ?? "—"}</span>
              {b.stregPct !== null && <span className="order-last basis-full sm:order-none sm:basis-auto"><span className="mr-1 inline-block h-2.5 w-px bg-hb-ink align-[-1px]" aria-hidden />{stregTekst(kort)}</span>}
              <span className="min-w-0 truncate text-right"><span className={mikro}>{KORT_ORD.maal}</span> {kort.maaltalTekst ?? "—"}</span>
            </div>
          </div>
        </>
      ) : (
        sf && <div className="mt-4" data-maal-skridt-fremdrift={`${sf.gjorte}/${sf.alle}`}><SkridtBar pct={Math.round(sf.andel * 1000) / 10} /></div>
      )}
    </div>
  );
};

/* FORSIDE V3 (2/10-2026, docs/forside-v3.md §4 — mockup v3): målet er en RÆKKE i «Din plan»s ene kort
   (kalderen giver kortet og listen) — venstre målet, højre mikro «Skridt» og skridtene. Mobil: stablet. */
export const ForsideMaalKort = (p: Props) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-6" data-forside-maal-kort={p.kort?.id ?? "uden-motor"}>
    <div className="min-w-0">
      <Venstre kort={p.kort} titel={p.titel} fremdrift={p.fremdrift} fristTekst={p.fristTekst} fristForfalden={p.fristForfalden} skarptHref={p.skarptHref} fristDato={p.fristDato} />
    </div>
    <div className="min-w-0" data-forside-maal-skridt>
      <p className={mikro}>{FORSIDE_MAAL_ORD.skridt}</p>
      <div className="mt-1">{p.children}</div>
    </div>
  </div>
);

/** Linjen over kortene, når der OGSÅ venter forslag eller kvartalstjek (tilstand A). */
export const VenterLinje = ({ tekster }: { tekster: string[] }) => (
  <Link
    to="/milestones"
    className={cn("mb-4 flex items-center gap-3 rounded-hb border border-hb-amber/40 bg-hb-amber/10 px-4 py-3 text-sm text-hb-ink transition-colors hover:bg-hb-amber/15", fokus)}
    data-forside-venter-linje
  >
    <span className="h-2 w-2 shrink-0 rounded-full bg-hb-amber" aria-hidden />
    <span className="min-w-0 flex-1">{tekster.join(" · ")}</span>
    <span className="shrink-0 font-medium text-hb-evergreen">{FORSIDE_MAAL_ORD.tagStilling}</span>
    <ArrowRight className="h-4 w-4 shrink-0 text-hb-evergreen" aria-hidden />
  </Link>
);
