import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { krTekst } from "@/lib/boardroomScore/score";
import type { ScoreDom } from "@/lib/boardroomScore/typer";
import {
  daekningTekst,
  ikkeNokDataTekst,
  loefterLinjer,
  retningTekst,
  SCORE_AFVENTER_OVERSKRIFT,
  SCORE_AFVENTER_TEKST,
  SCORE_FEJL_TEKST,
  SCORE_FORBEHOLD,
  SCORE_LOEFTER_OVERSKRIFT,
  soejleLinjer,
  streakLinjer,
  TAEL_OP_MS,
  taelOpVaerdi,
} from "@/lib/hjemmebane/scoreKort";
import { HbCard } from "../HbCard";

/** Boardroom Score-kortet på medlemmets forside (30/9-2026 — Jonas D3
    «Boardroom Score (0–1000) plus tal-streak først»; designet i
    docs/boardroom-score.md §7). TEGNER KUN: tallet, streaken, de fire søjler
    som hairline-barer og «Hvad løfter dit tal» (1–3 handlinger) kommer
    færdige fra motoren (lib/boardroomScore) gennem ordene i
    lib/hjemmebane/scoreKort — kortet regner intet og hårdkoder ingen
    handling. Data: ÉN hook (useBoardroomScore), kaldt i BoardroomViews
    topblok og givet ind her.

    FIRE TILSTANDE: henter (skelet i reserveret højde) · fejl (rust linje +
    «Prøv igen» — en fejl er ikke «ingen tal») · afventer migration (roligt
    «på vej», migration 20260930130000 ikke kørt — bliver rigtigt af sig
    selv) · dommen (med eller uden score).

    Animation: kun tallet tæller op (ease-out, TAEL_OP_MS), fra det sidst viste
    — samme tal ved genhentning/uret tæller ikke igen. prefers-reduced-motion
    → tallet står straks. Ingen konfetti, ingen farve for op/ned. */

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

export const ScoreKort = ({ dom, afventerMigration, isLoading, isError, onProevIgen }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const bevaegelse = useFaarBevaegelse();
  const vist = useTaelOp(dom?.score ?? null, bevaegelse);

  if (isLoading) {
    return (
      <HbCard className="p-6 md:p-8" data-score="henter" aria-busy="true">
        <div className="min-h-[320px] animate-pulse space-y-4">
          <div className="h-3 w-24 rounded bg-hb-line" />
          <div className="h-14 w-40 rounded bg-hb-line" />
          <div className="h-3 w-full rounded bg-hb-line/70" />
          <div className="h-3 w-5/6 rounded bg-hb-line/70" />
        </div>
      </HbCard>
    );
  }

  // En fejlet GENHENTNING med en dom i hånden viser stadig dommen (react-query bevarer data).
  if (isError && !dom && !afventerMigration) {
    return (
      <HbCard className="p-6" data-score="fejl">
        <p className="text-sm text-hb-rust">
          {SCORE_FEJL_TEKST}{" "}
          <button type="button" onClick={onProevIgen} className="underline-offset-4 hover:underline">Prøv igen</button>
        </p>
      </HbCard>
    );
  }

  if (afventerMigration || !dom) {
    return (
      <HbCard className="p-6" data-score="afventer">
        <h3 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">{SCORE_AFVENTER_OVERSKRIFT}</h3>
        <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">{SCORE_AFVENTER_TEKST}</p>
      </HbCard>
    );
  }

  const retning = retningTekst(dom.score, dom.forrige);
  const daekning = daekningTekst(dom);
  const mangler = ikkeNokDataTekst(dom);
  const streak = streakLinjer(dom.streak);
  const soejler = soejleLinjer(dom);
  const loefter = loefterLinjer(dom);

  return (
    <HbCard className="p-6 md:p-8" data-score={dom.score ?? "ingen"} data-score-daekning={dom.daekning}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
        {/* Tallet */}
        <div className="min-w-0" data-score-tal>
          <p className={mikro}>Din score</p>
          {dom.score !== null ? (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-editorial text-6xl font-medium leading-none tabular-nums text-hb-ink" aria-hidden>
                  {krTekst(vist ?? dom.score)}
                </span>
                <span className="text-sm text-hb-ink-soft" aria-hidden>/ 1.000</span>
                <span className="sr-only">{`Din Boardroom Score er ${dom.score} ud af 1.000`}</span>
              </p>
              {retning && <p className="mt-3 text-sm text-hb-ink-soft" data-score-retning>{retning}</p>}
              {daekning && <p className="mt-1 text-xs text-hb-ink-soft" data-score-daekning-tekst>{daekning}</p>}
            </>
          ) : (
            <>
              <p className="mt-2 font-editorial text-2xl font-medium leading-tight text-hb-ink">Ikke nok tal endnu</p>
              {mangler && <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft" data-score-mangler>{mangler}</p>}
            </>
          )}
        </div>

        {/* Streaken */}
        <div className="min-w-0 border-t border-hb-line pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0" data-score-streak={dom.streak.status}>
          <p className={mikro}>Tal-streak</p>
          <p className="mt-2 flex items-baseline gap-2">
            <Flame className={cn("h-6 w-6 shrink-0 self-center", dom.streak.status === "aktiv" ? "text-hb-evergreen" : "text-hb-ink-soft/60")} aria-hidden />
            <span className="font-editorial text-4xl font-medium leading-none tabular-nums text-hb-ink">{streak.laengde}</span>
            <span className="text-sm text-hb-ink-soft">{streak.enhed}</span>
          </p>
          <p className="mt-3 text-sm text-hb-ink">{streak.status}</p>
          <p className="mt-1 text-sm text-hb-ink-soft" data-score-frist>{streak.frist}</p>
          {streak.bedste && <p className="mt-1 text-xs text-hb-ink-soft">{streak.bedste}</p>}
        </div>
      </div>

      {/* De fire søjler som hairline-barer */}
      <dl className="mt-7 space-y-4" data-score-soejler>
        {soejler.map((s) => (
          <div key={s.navn} data-soejle={s.navn} data-soejle-point={s.point ?? "ingen"}>
            <div className="flex items-baseline justify-between gap-4">
              <dt className={mikro}>{s.label}</dt>
              <dd className="text-sm tabular-nums text-hb-ink">
                {s.point !== null ? (
                  <>
                    {s.point} <span className="text-hb-ink-soft">/ {s.max}</span>
                  </>
                ) : (
                  <span className="text-hb-ink-soft">—</span>
                )}
              </dd>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hb-line" aria-hidden>
              <div
                className="h-full rounded-full bg-hb-evergreen/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round(s.andel * 1000) / 10}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-hb-ink-soft">{s.detalje}</p>
          </div>
        ))}
      </dl>

      {/* Hvad løfter dit tal — 1–3 handlinger fra motoren (loefterMitTal) */}
      {loefter.length > 0 && (
        <div className="mt-7" data-score-loefter={loefter.length}>
          <p className={mikro}>{SCORE_LOEFTER_OVERSKRIFT}</p>
          <ul className="mt-2">
            {loefter.map((h) => {
              const indhold = (
                <>
                  <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-hb-ink">{h.tekst}</span>
                  <span className="shrink-0 whitespace-nowrap text-sm text-hb-ink-soft">{h.effekt}</span>
                  {h.sti && <ArrowRight className="h-4 w-4 shrink-0 self-center text-hb-evergreen" aria-hidden />}
                </>
              );
              return (
                <li key={`${h.soejle}:${h.tekst}`} className="border-t border-hb-line last:border-b" data-loefter-soejle={h.soejle}>
                  {h.sti ? (
                    <Link to={h.sti} className="flex items-baseline gap-3 py-3 hover:bg-hb-sage/20">
                      {indhold}
                    </Link>
                  ) : (
                    <div className="flex items-baseline gap-3 py-3">{indhold}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-6 text-xs text-hb-ink-soft">{SCORE_FORBEHOLD}</p>
    </HbCard>
  );
};
