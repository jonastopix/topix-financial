import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { krTekst } from "@/lib/boardroomScore/score";
import type { ScoreDom } from "@/lib/boardroomScore/typer";
import {
  daekningTekst,
  ikkeNokDataTekst,
  LOEFTER_MAAL_MAERKE,
  loefterLinjer,
  retningTekst,
  RING_RADIUS,
  ringBue,
  SCORE_AFVENTER_OVERSKRIFT,
  SCORE_AFVENTER_TEKST,
  SCORE_DETALJER_KNAP,
  SCORE_DETALJER_KNAP_LUK,
  SCORE_FEJL_TEKST,
  SCORE_FORBEHOLD,
  SCORE_INGEN_TAL,
  SCORE_LOEFTER_OVERSKRIFT,
  SCORE_OEVRIGE_OVERSKRIFT,
  SCORE_SOEJLER_OVERSKRIFT,
  soejleLinjer,
  streakKortLinje,
  streakLinjer,
  TAEL_OP_MS,
  taelOpVaerdi,
  type LoefterLinje,
} from "@/lib/hjemmebane/scoreKort";
import { HbCard } from "../HbCard";

/** Boardroom Score-kortet på medlemmets forside (30/9-2026 — Jonas D3
    «Boardroom Score (0–1000) plus tal-streak først»; designet i
    docs/boardroom-score.md §7). TEGNER KUN: tallet, streaken, de fire søjler
    og «Hvad løfter dit tal» kommer færdige fra motoren (lib/boardroomScore)
    gennem ordene i lib/hjemmebane/scoreKort — kortet regner intet og
    hårdkoder ingen handling. Data: ÉN hook (useBoardroomScore), kaldt i
    BoardroomViews topblok og givet ind her.

    KOMPAKT (Jonas 30/9 20:43: «meget stor på forsiden … mere kompakt, og
    måske også lidt mere interessant at kigge på»; målt 669–760 px høj på
    1440 px bredde): ÉN række — til venstre scoren i en tynd RING (SVG-bue i
    skala 0–1000, ringBue), til højre de fire søjler som små barer (navn +
    point/250), streaken som én linje med flammen og KUN den øverste løfter.
    Resten (de øvrige løftere, søjlernes tal i ord, streakens status og
    bedste) ligger bag «Se hvad der tæller» (lukket som standard,
    aria-expanded + aria-controls; fokus bliver på knappen, synlig ring).
    Regnet højde på desktop i hvile ≈ 260 px:
      p-6 (24 + 24) + ringkolonnen (ring 128 + to linjer à 16 + mellemrum 8 ≈ 168)
      + bunden (mt-4 16 + pt-3 12 + knaplinje 20 ≈ 48) ≈ 264 px.
    Højre kolonne (barer ≈ 26 + streak 20 + løfter ≈ 52 + 2 × 16 mellemrum ≈ 130)
    er lavere end ringen og bestemmer ikke højden.

    FIRE TILSTANDE: henter (skelet i samme højde) · fejl (rust linje +
    «Prøv igen» — en fejl er ikke «ingen tal») · afventer migration (roligt
    «på vej», migration 20260930130000 ikke kørt — bliver rigtigt af sig
    selv) · dommen (med eller uden score; uden score står ringen tom med
    «Ikke nok tal endnu» — samme ramme, samme højde).

    Animation: tallet OG buen tæller op sammen (ease-out, TAEL_OP_MS) fra det
    sidst viste — samme tal ved genhentning/uret tæller ikke igen.
    prefers-reduced-motion → tallet og buen står straks. Ingen konfetti,
    ingen farve for op/ned. Før den første ramme vises 0 (ikke det endelige
    tal), så tallet ikke blinker endeligt → 0 → optælling (rådets fund 4).
    Skærmlæserteksten (sr-only = position:absolute) står INDE i ringens
    `relative`-boks, så den aldrig positioneres mod en fjern forfader.

    Overskriften er sektionens eyebrow «Boardroom Score» (BoardroomView) —
    kortet har ingen egen «Din score» over tallet (rådets fund 7). */

type Props = {
  dom: ScoreDom | null;
  afventerMigration: boolean;
  isLoading: boolean;
  isError: boolean;
  onProevIgen: () => void;
};

/** prefers-reduced-motion — læst ved mount og fulgt, hvis brugeren skifter. Uden matchMedia (test/SSR): ingen bevægelse. */
function useFaarBevaegelse(): boolean {
  const [bevaegelse, setBevaegelse] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const skift = () => setBevaegelse(!mq.matches);
    mq.addEventListener?.("change", skift);
    return () => mq.removeEventListener?.("change", skift);
  }, []);
  return bevaegelse;
}

/** Tallet undervejs: tæller fra det sidst viste til `til` (taelOpVaerdi). */
function useTaelOp(til: number | null, bevaegelse: boolean): number | null {
  const [vist, setVist] = useState<number | null>(bevaegelse ? (til === null ? null : 0) : til);
  const sidst = useRef<number>(0);
  useEffect(() => {
    if (til === null) {
      // Næste tal tæller fra 0 — samme værdi, som kortet viser før første ramme.
      sidst.current = 0;
      setVist(null);
      return;
    }
    const fra = sidst.current;
    if (!bevaegelse || fra === til || typeof window.requestAnimationFrame !== "function") {
      sidst.current = til;
      setVist(til);
      return;
    }
    let ramme = 0;
    const start = performance.now();
    const trin = (t: number) => {
      const v = taelOpVaerdi(fra, til, t - start, TAEL_OP_MS);
      setVist(v);
      if (v !== til) ramme = window.requestAnimationFrame(trin);
    };
    ramme = window.requestAnimationFrame(trin);
    sidst.current = til;
    return () => window.cancelAnimationFrame(ramme);
  }, [til, bevaegelse]);
  return vist;
}

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";
const fokus = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

/** Én løfter-linje — samme form øverst og i detaljerne. Teksten og effekten er motorens (loefterLinjer). */
function LoefterRaekke({ h }: { h: LoefterLinje }) {
  const indhold = (
    <>
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-hb-ink">
        {h.art === "maal" && <span className={cn(mikro, "mr-2")} data-loefter-maal>{LOEFTER_MAAL_MAERKE}</span>}
        {h.tekst}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-hb-ink-soft">{h.effekt}</span>
      {h.sti && <ArrowRight className="h-4 w-4 shrink-0 self-center text-hb-evergreen" aria-hidden />}
    </>
  );
  return (
    <li className="border-t border-hb-line" data-loefter-soejle={h.soejle} data-loefter-art={h.art}>
      {h.sti ? (
        <Link to={h.sti} className={cn("flex items-baseline gap-3 py-2 hover:bg-hb-sage/20", fokus)}>
          {indhold}
        </Link>
      ) : (
        <div className="flex items-baseline gap-3 py-2">{indhold}</div>
      )}
    </li>
  );
}

export const ScoreKort = ({ dom, afventerMigration, isLoading, isError, onProevIgen }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const bevaegelse = useFaarBevaegelse();
  const vist = useTaelOp(dom?.score ?? null, bevaegelse);
  const [aaben, setAaben] = useState(false);
  const detaljerId = useId();

  if (isLoading) {
    return (
      <HbCard className="p-5 md:p-6" data-score="henter" aria-busy="true">
        <div className="flex min-h-[200px] animate-pulse flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="h-24 w-24 shrink-0 rounded-full border-[5px] border-hb-line sm:h-32 sm:w-32" />
          <div className="flex-1 space-y-3">
            <div className="h-3 w-full rounded bg-hb-line/70" />
            <div className="h-3 w-5/6 rounded bg-hb-line/70" />
            <div className="h-3 w-2/3 rounded bg-hb-line/70" />
          </div>
        </div>
      </HbCard>
    );
  }

  // En fejlet GENHENTNING med en dom i hånden viser stadig dommen (react-query bevarer data).
  if (isError && !dom && !afventerMigration) {
    return (
      <HbCard className="p-5" data-score="fejl">
        <p className="text-sm text-hb-rust">
          {SCORE_FEJL_TEKST}{" "}
          <button type="button" onClick={onProevIgen} className={cn("underline-offset-4 hover:underline", fokus)}>Prøv igen</button>
        </p>
      </HbCard>
    );
  }

  if (afventerMigration || !dom) {
    return (
      <HbCard className="p-5" data-score="afventer">
        <h3 className="font-editorial text-xl font-medium leading-tight text-hb-ink">{SCORE_AFVENTER_OVERSKRIFT}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{SCORE_AFVENTER_TEKST}</p>
      </HbCard>
    );
  }

  const retning = retningTekst(dom.score, dom.forrige);
  const daekning = daekningTekst(dom);
  const mangler = ikkeNokDataTekst(dom);
  const streak = streakLinjer(dom.streak);
  const streakKort = streakKortLinje(dom.streak);
  const soejler = soejleLinjer(dom);
  const loefter = loefterLinjer(dom);
  const [oeverst, ...oevrige] = loefter;
  // Før første ramme: 0 med bevægelse (optællingen starter derfra), ellers tallet selv — aldrig det endelige tal i én frame.
  const tallet = dom.score === null ? null : vist ?? (bevaegelse ? 0 : dom.score);
  // Buen følger det VISTE tal, så den vokser med optællingen (og står straks uden bevægelse).
  const bue = ringBue(tallet);

  return (
    <HbCard className="p-5 md:p-6" data-score={dom.score ?? "ingen"} data-score-daekning={dom.daekning}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        {/* Ringen med tallet */}
        <div className="flex shrink-0 items-center gap-4 sm:w-36 sm:flex-col sm:gap-2" data-score-tal>
          <div className="relative h-24 w-24 shrink-0 sm:h-32 sm:w-32" data-score-ring>
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden focusable="false">
              <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-hb-line" />
              {bue.laengde > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${bue.laengde} ${bue.omkreds}`}
                  className="text-hb-evergreen"
                  data-score-bue
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {tallet !== null ? (
                <>
                  <span className="font-editorial text-3xl font-medium leading-none tabular-nums text-hb-ink sm:text-4xl" aria-hidden>
                    {krTekst(tallet)}
                  </span>
                  <span className="mt-1 text-[11px] text-hb-ink-soft" aria-hidden>/ 1.000</span>
                </>
              ) : (
                <span className="font-editorial text-3xl leading-none text-hb-ink-soft" aria-hidden>—</span>
              )}
            </div>
            {dom.score !== null && <span className="sr-only">{`Din Boardroom Score er ${dom.score} ud af 1.000`}</span>}
          </div>
          <div className="min-w-0 sm:text-center">
            {dom.score !== null ? (
              <>
                {retning && <p className="text-xs text-hb-ink-soft" data-score-retning>{retning}</p>}
                {daekning && <p className="text-xs text-hb-ink-soft" data-score-daekning-tekst>{daekning}</p>}
              </>
            ) : (
              <p className="font-editorial text-lg font-medium leading-tight text-hb-ink">{SCORE_INGEN_TAL}</p>
            )}
          </div>
        </div>

        {/* Søjlerne, streaken og den øverste løfter */}
        <div className="min-w-0 flex-1 space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4" data-score-soejler>
            {soejler.map((s) => (
              <div key={s.navn} className="min-w-0" data-soejle={s.navn} data-soejle-point={s.point ?? "ingen"}>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className={cn(mikro, "truncate")}>{s.label}</dt>
                  <dd className="shrink-0 text-xs tabular-nums text-hb-ink">
                    {s.point !== null ? (
                      <>
                        {s.point}<span className="text-hb-ink-soft">/{s.max}</span>
                      </>
                    ) : (
                      <span className="text-hb-ink-soft">—</span>
                    )}
                  </dd>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-hb-line" aria-hidden>
                  <div
                    className="h-full rounded-full bg-hb-evergreen/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.round(s.andel * 1000) / 10}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>

          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm" data-score-streak={dom.streak.status}>
            <Flame className={cn("h-4 w-4 shrink-0 self-center", dom.streak.status === "aktiv" ? "text-hb-evergreen" : "text-hb-ink-soft/60")} aria-hidden />
            <span className="font-medium tabular-nums text-hb-ink">{streakKort.tal}</span>
            <span className="text-hb-ink-soft" data-score-frist>{streakKort.frist}</span>
          </p>

          {mangler && <p className="text-sm leading-relaxed text-hb-ink-soft" data-score-mangler>{mangler}</p>}

          {oeverst && (
            <div data-score-loefter={loefter.length}>
              <p className={mikro}>{SCORE_LOEFTER_OVERSKRIFT}</p>
              <ul className="mt-1">
                <LoefterRaekke h={oeverst} />
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Bunden: knappen til detaljerne og forbeholdet */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hb-line pt-3">
        <button
          type="button"
          onClick={() => setAaben((v) => !v)}
          aria-expanded={aaben}
          aria-controls={detaljerId}
          className={cn("inline-flex items-center gap-1 text-sm font-medium text-hb-evergreen underline-offset-4 hover:underline", fokus)}
          data-score-detaljer-knap
        >
          {aaben ? SCORE_DETALJER_KNAP_LUK : SCORE_DETALJER_KNAP}
          <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", aaben && "rotate-180")} aria-hidden />
        </button>
        <p className="text-xs text-hb-ink-soft">{SCORE_FORBEHOLD}</p>
      </div>

      <div id={detaljerId} hidden={!aaben} data-score-detaljer>
        {aaben && (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="min-w-0 space-y-3">
              <p className={mikro}>{SCORE_SOEJLER_OVERSKRIFT}</p>
              <ul className="space-y-2">
                {soejler.map((s) => (
                  <li key={s.navn} className="text-sm leading-relaxed">
                    <span className="font-medium text-hb-ink">{s.label}</span>
                    {s.detalje && <span className="text-hb-ink-soft" data-soejle-detalje> — {s.detalje}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-hb-ink" data-score-streak-status>{streak.status}</p>
              {streak.bedste && <p className="text-xs text-hb-ink-soft">{streak.bedste}</p>}
            </div>
            {oevrige.length > 0 && (
              <div className="min-w-0">
                <p className={mikro}>{SCORE_OEVRIGE_OVERSKRIFT}</p>
                <ul className="mt-1 [&>li:last-child]:border-b [&>li:last-child]:border-hb-line">
                  {oevrige.map((h) => (
                    <LoefterRaekke key={`${h.soejle}:${h.tekst}`} h={h} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </HbCard>
  );
};
