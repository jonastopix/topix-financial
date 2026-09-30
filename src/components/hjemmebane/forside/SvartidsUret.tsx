import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import {
  aeldsteTekst,
  GUL_TIMER,
  samtaleSti,
  streakTekst,
  svartidsUret,
  timerTekst,
  trendTekst,
  URET_OVERSKRIFT,
  type SvartidInput,
  type Tone,
} from "@/lib/svartid";
import { forFaaNote, streakPille, svarKnapTekst, svartidRaekker } from "@/lib/hjemmebane/hoejreKolonne";
import { EYEBROW, KORT, MIKRO, Prik } from "./HoejreKolonne";

/** «Svartids-uret» (30/9-2026, rådgivernes første gamification-skive; dommen
    i lib/svartid, hentningen i hooks/svartid). KUN FOR RÅDGIVERE: kortet står
    kun på RaadgiverForsideView (Index.tsx' rådgivergren), forsidens query er
    `enabled` på isAdvisor, og kortet selv tegner intet uden rollen — tre
    lag, låst af kildeværnet svartidsUret.guard.

    Formen er husets: lille overskrift, skelet, fejllinje med husets
    rådgivertekst (aldrig et tomt kort der ligner «alt er fint»), ét stort
    tal i redaktionel skrift og resten som små linjer. Tonen (grøn/gul/rød)
    sidder KUN på det store tal: evergreen = ≤ 4 t, okker = ≤ 24 t, rust =
    over. Okker findes ikke som Hb-token; den står her alene.

    OPSÆTNINGEN (30/9, Jonas' godkendte redesign af højre kolonne): kortet
    er et kort (KORT); det store tal og farven er uændrede; 7 og 30 dage
    står som en lille tabel (median, andel < 4 t, andel < 24 t, antal svar —
    svartidRaekker, dommens tal sat op); «Ældste ubesvarede» er en markeret
    række med knappen «Svar <virksomhed> →» til chatten; streaken en lille
    pille (hele sætningen i title og for skærmlæsere). Gennemsnittet, der
    stod i de gamle sætninger, er ikke i tabellen — designet har fire rækker.

    FÆLLES TEAMTAL: ingen tal pr. rådgiver, ingen rangliste (analysen R1).
    Målt i chatten: telefon, mail og «Kræver ikke svar» kan ikke ses
    (analysen §1.4), og det siges på kortet. */

const TONE_KLASSE: Record<Tone, string> = {
  groen: "text-hb-evergreen",
  gul: "text-[hsl(38_70%_36%)]",
  roed: "text-hb-rust",
  neutral: "text-hb-ink",
};

export const SvartidsUret = ({
  hentning,
}: {
  hentning: { isLoading: boolean; isError: boolean; error: unknown; data: Omit<SvartidInput, "nu"> | undefined };
}) => {
  const { isAdvisor } = useAuth();
  if (!isAdvisor) return null;

  return (
    <div className={KORT} data-svartids-uret>
      <p className={cn(EYEBROW, "mb-3")}>{URET_OVERSKRIFT}</p>
      {hentning.isLoading ? (
        <div aria-hidden className="space-y-2 pb-2">
          <div className="h-8 w-1/3 animate-pulse rounded bg-hb-line/60" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/40" />
        </div>
      ) : hentning.isError ? (
        <p className="text-xs">{raadgiverHentefejlTekst(hentning.error, "forsiden")}</p>
      ) : hentning.data ? (
        (() => {
          const dom = svartidsUret({ ...hentning.data, nu: new Date() });
          const u = dom.uge;
          const a = dom.aeldsteUbesvarede;
          const trend = trendTekst(dom.trend);
          const note = forFaaNote(u, dom.maaned);
          return (
            <div className="space-y-4" data-svartid-tone={dom.tone} data-svartid-n={u.n}>
              {/* Det store tal med farve — uændret: tonen sidder KUN her. */}
              <div>
                <p className={MIKRO}>Median svartid · 7 dage</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className={cn("font-editorial text-4xl font-medium leading-none", TONE_KLASSE[dom.tone])} data-svartid-median>
                    {u.forFaa || u.medianHverdagstimer === null ? "—" : timerTekst(u.medianHverdagstimer)}
                  </span>
                  {!u.forFaa && u.medianRaaTimer !== null && (
                    <span className="text-xs">hverdagstimer · {timerTekst(u.medianRaaTimer)} rå</span>
                  )}
                </p>
                {trend && (
                  <p className={cn("mt-1 text-xs", dom.trend?.retning === "hurtigere" && "text-hb-evergreen")} data-svartid-trend={dom.trend?.retning}>
                    {trend}
                  </p>
                )}
              </div>
              {/* 7 og 30 dage som tabel (30/9): før to lange sætninger. */}
              <table className="w-full text-xs tabular-nums" data-svartid-tabel>
                <thead>
                  <tr className="text-hb-ink-soft">
                    <th scope="col" className="pb-1 text-left font-normal"><span className="sr-only">Mål</span></th>
                    <th scope="col" className="pb-1 text-right font-medium">7 dage</th>
                    <th scope="col" className="pb-1 text-right font-medium">30 dage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hb-line/70">
                  {svartidRaekker(u, dom.maaned).map((r) => (
                    <tr key={r.etiket}>
                      <th scope="row" className="py-1.5 text-left font-normal text-hb-ink-soft">{r.etiket}</th>
                      <td className="py-1.5 text-right text-hb-ink">{r.uge}</td>
                      <td className="py-1.5 text-right text-hb-ink">{r.maaned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {note && <p className="text-xs">{note}</p>}
              {/* Ældste ubesvarede som markeret række med én handling. */}
              {a ? (
                <div
                  className={cn("rounded-hb border p-3", a.hverdagstimer > GUL_TIMER ? "border-hb-rust/40 bg-hb-rust/5" : "border-hb-line bg-hb-paper/60")}
                  data-svartid-venter={dom.antalVenter}
                >
                  <p className={MIKRO}>Ældste ubesvarede</p>
                  <p className={cn("mt-1 text-sm text-hb-ink", a.hverdagstimer > GUL_TIMER && "text-hb-rust")}>
                    {aeldsteTekst(a)}
                    <span className="text-hb-ink-soft"> ({timerTekst(a.raaTimer)} rå)</span>
                    {dom.antalVenter > 1 && <span className="text-hb-ink-soft"> · og {dom.antalVenter - 1} mere</span>}
                  </p>
                  {a.companyId && (
                    <Link
                      to={samtaleSti(a.companyId)}
                      className="mt-2 inline-flex max-w-full items-center rounded-full bg-hb-evergreen px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      <span className="truncate">{svarKnapTekst(a.navn)}</span>
                    </Link>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm" data-svartid-venter={0}>
                  <Prik tone="i_orden" />
                  Intet venter på svar lige nu.
                </p>
              )}
              <p data-svartid-streak={dom.streak.dage}>
                <span
                  title={streakTekst(dom.streak)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
                    dom.streak.dage > 0 && !dom.streak.brudtNu ? "border-hb-rust/40 text-hb-ink" : "border-hb-line text-hb-ink-soft",
                  )}
                >
                  <Flame aria-hidden className={cn("h-3.5 w-3.5 shrink-0", dom.streak.dage > 0 ? "text-hb-rust" : "text-hb-line")} />
                  {streakPille(dom.streak)}
                  <span className="sr-only"> — {streakTekst(dom.streak)}</span>
                </span>
              </p>
              <p className="text-[11px] text-hb-ink-soft">
                Fælles for teamet. Hverdagstimer kl. 07–17. Målt i chatten — telefon, mail og «Kræver ikke svar» ses ikke.
              </p>
            </div>
          );
        })()
      ) : null}
    </div>
  );
};
