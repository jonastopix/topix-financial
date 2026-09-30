import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import {
  aeldsteTekst,
  GUL_TIMER,
  MIN_N,
  samtaleSti,
  streakTekst,
  svartidsUret,
  timerTekst,
  trendTekst,
  URET_OVERSKRIFT,
  vindueTekst,
  type SvartidInput,
  type Tone,
} from "@/lib/svartid";

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

    FÆLLES TEAMTAL: ingen tal pr. rådgiver, ingen rangliste (analysen R1).
    Målt i chatten: telefon, mail og «Kræver ikke svar» kan ikke ses
    (analysen §1.4), og det siges på kortet. */

const TONE_KLASSE: Record<Tone, string> = {
  groen: "text-hb-evergreen",
  gul: "text-[hsl(38_70%_36%)]",
  roed: "text-hb-rust",
  neutral: "text-hb-ink",
};

const TEKSTLINK = "text-hb-evergreen underline-offset-4 hover:underline";

export const SvartidsUret = ({
  hentning,
}: {
  hentning: { isLoading: boolean; isError: boolean; error: unknown; data: Omit<SvartidInput, "nu"> | undefined };
}) => {
  const { isAdvisor } = useAuth();
  if (!isAdvisor) return null;

  return (
    <div className="pb-6" data-svartids-uret>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{URET_OVERSKRIFT}</p>
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
          return (
            <div className="space-y-1" data-svartid-tone={dom.tone} data-svartid-n={u.n}>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Median svartid · 7 dage</p>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("font-editorial text-4xl font-medium leading-none", TONE_KLASSE[dom.tone])} data-svartid-median>
                  {u.forFaa || u.medianHverdagstimer === null ? "—" : timerTekst(u.medianHverdagstimer)}
                </span>
                {!u.forFaa && u.medianRaaTimer !== null && (
                  <span className="text-xs">hverdagstimer · {timerTekst(u.medianRaaTimer)} rå</span>
                )}
              </p>
              {u.forFaa && <p className="text-xs">For få svar til en median ({u.n} af mindst {MIN_N}).</p>}
              {trend && (
                <p className={cn(dom.trend?.retning === "hurtigere" && "text-hb-evergreen")} data-svartid-trend={dom.trend?.retning}>
                  {trend}
                </p>
              )}
              {!u.forFaa && <p>{vindueTekst("7 dage", u, false)}</p>}
              <p>{vindueTekst("30 dage", dom.maaned, true)}</p>
              <p className="pt-2" data-svartid-venter={dom.antalVenter}>
                {a ? (
                  <>
                    Ældste ubesvarede:{" "}
                    {a.companyId ? (
                      <Link
                        to={samtaleSti(a.companyId)}
                        className={cn(TEKSTLINK, a.hverdagstimer > GUL_TIMER && "text-hb-rust")}
                      >
                        {aeldsteTekst(a)}
                      </Link>
                    ) : (
                      aeldsteTekst(a)
                    )}
                    <span> ({timerTekst(a.raaTimer)} rå)</span>
                    {dom.antalVenter > 1 && <span> · og {dom.antalVenter - 1} mere</span>}
                  </>
                ) : (
                  "Intet venter på svar lige nu."
                )}
              </p>
              <p className="flex items-start gap-2" data-svartid-streak={dom.streak.dage}>
                <Flame aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", dom.streak.dage > 0 ? "text-hb-rust" : "text-hb-line")} />
                <span>{streakTekst(dom.streak)}</span>
              </p>
              <p className="pt-1 text-[11px] text-hb-ink-soft">
                Fælles for teamet. Hverdagstimer kl. 07–17. Målt i chatten — telefon, mail og «Kræver ikke svar» ses ikke.
              </p>
            </div>
          );
        })()
      ) : null}
    </div>
  );
};
