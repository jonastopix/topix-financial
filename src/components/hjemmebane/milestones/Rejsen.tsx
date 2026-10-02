import { useId } from "react";
import { cn } from "@/lib/utils";
import type { TidslinjeDom } from "@/lib/hjemmebane/maalTal";
import { REJSEN_ORD, tidslinjeTegning, type TidslinjeMarkoer } from "@/lib/hjemmebane/dineMaalFlade";
import { HbCard } from "../HbCard";

/**
 * «Rejsen» — de 12 måneder nederst på Dine mål (designet 1/10-2026): gjorte
 * skridt som prikker, «i dag», målenes frister og kvartalsmarkører på én
 * linje. Punkterne er motorens (maalTal.tidslinje); positionerne 0–1 er
 * dineMaalFlade.tidslinjeTegning.
 *
 * Tegnet som HTML (rådets fund 11, 1/10 aften): den første udgave var en SVG
 * med preserveAspectRatio="none", som strakte prikkerne til ellipser på
 * 375 px. Nu er linjen en div, og hvert mærke er et element positioneret med
 * left: x % — prikker er runde på alle bredder, og husets tokens følger med
 * gennem Tailwind-klasserne. Ordene (aksens måneder, «i dag», forklaringen)
 * er HTML som før. Listen med hvert punkt i ord er SYNLIG på mobil (hvor
 * prikkerne er små og uden titel) og sr-only fra sm — skærmlæserens vej på
 * alle bredder.
 */

/**
 * Vandret placering for et mærke: translate holder det centreret om sin x — ved
 * kanterne (x ≈ 0/1) skubbes det ind, så det ikke klippes af kortet. Samme dom
 * for «i dag», skridt og frister (runde 2, fund 10).
 */
const kant = (x: number) => (x < 0.04 ? "translate-x-0" : x > 0.96 ? "-translate-x-full" : "-translate-x-1/2");

const Maerke = ({ p, art }: { p: TidslinjeMarkoer; art: "skridt" | "frist" }) => {
  const naaet = p.punkt.art === "maal_frist" && p.punkt.naaet;
  return (
    <span
      className={cn("absolute top-1/2", kant(p.x))}
      style={{ left: `${p.x * 100}%` }}
      title={`${p.dato}: ${p.punkt.titel}`}
      aria-hidden
      data-rejsen-maerke={art}
    >
      {art === "skridt" ? (
        <span className="block h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-hb-evergreen" />
      ) : (
        <span className="flex -translate-y-full flex-col items-center">
          <span className={cn("block h-2 w-2 rounded-full", naaet ? "bg-hb-evergreen" : "bg-hb-rust")} />
          <span className={cn("block h-4 w-px", naaet ? "bg-hb-evergreen" : "bg-hb-rust")} />
        </span>
      )}
    </span>
  );
};

export const Rejsen = ({ tidslinje }: { tidslinje: TidslinjeDom | null }) => {
  const id = useId();
  if (!tidslinje) return null;
  const t = tidslinjeTegning(tidslinje);
  const O = REJSEN_ORD;

  return (
    <HbCard className="p-5 md:p-6" data-rejsen={t.tom ? "tom" : "punkter"} data-rejsen-start={tidslinje.start} data-rejsen-slut={tidslinje.slut}>
      <div className="relative pt-5">
        {/* «i dag» over linjen */}
        <span
          className={cn("absolute top-0 whitespace-nowrap text-[11px] font-medium text-hb-ink", kant(t.nuX))}
          style={{ left: `${t.nuX * 100}%` }}
          aria-hidden
          data-rejsen-idag
        >
          {O.idag}
        </span>
        {/* Linjen og mærkerne — HTML, positioneret med left: x % (fund 11) */}
        <div className="relative h-14" role="img" aria-labelledby={`${id}-titel`} data-rejsen-linje>
          <span id={`${id}-titel`} className="sr-only">{O.titel}</span>
          <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hb-line" aria-hidden />
          <div className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hb-evergreen/50" style={{ width: `${t.nuX * 100}%` }} aria-hidden />
          {/* Kvartalsmærker */}
          {t.akse.map((a) => (
            <span key={`akse-${a.punkt.dato}`} className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-hb-ink-soft/60" style={{ left: `${a.x * 100}%` }} aria-hidden />
          ))}
          {/* Gjorte skridt — prikker på linjen */}
          {t.skridt.map((s, i) => <Maerke key={`skridt-${s.punkt.dato}-${i}`} p={s} art="skridt" />)}
          {/* Målenes frister — flag over linjen */}
          {t.frister.map((f, i) => <Maerke key={`frist-${f.punkt.dato}-${i}`} p={f} art="frist" />)}
          {/* I dag */}
          <span className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-[40%] bg-hb-ink" style={{ left: `${t.nuX * 100}%` }} aria-hidden />
        </div>
        {/* Aksens ord */}
        <div className="relative mt-1 h-5 text-[11px] text-hb-ink-soft" aria-hidden>
          {t.akse.map((a) => (
            <span
              key={`ord-${a.punkt.dato}`}
              className={cn("absolute top-0 whitespace-nowrap", a.x === 0 ? "" : a.x === 1 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${a.x * 100}%` }}
            >
              {a.punkt.art === "kvartal" ? a.punkt.titel : a.dato}
            </span>
          ))}
        </div>
      </div>

      {/* Forklaringen */}
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-hb-ink-soft" aria-hidden>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-hb-evergreen" />{O.forklaring.skridt_gjort}</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-hb-rust" />{O.forklaring.maal_frist}</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-hb-ink" />{O.idag}</li>
        <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-px bg-hb-ink-soft/60" />{O.forklaring.kvartal}</li>
      </ul>

      {/* Punkterne i ord — synlige på mobil, skærmlæserens vej på alle bredder (fund 11) */}
      {t.tom ? (
        <p className="mt-3 text-sm text-hb-ink-soft">{O.tom}</p>
      ) : (
        <ul className="mt-3 space-y-1 text-xs text-hb-ink-soft sm:sr-only" data-rejsen-liste>
          {[...t.skridt, ...t.frister].map((p, i) => (
            <li key={`${p.punkt.art}-${p.punkt.dato}-${i}`}>
              {p.dato}: {p.punkt.art === "skridt_gjort" ? `${O.forklaring.skridt_gjort} — ${p.punkt.titel}` : `${O.forklaring.maal_frist} — ${p.punkt.titel}${p.punkt.naaet ? ` (${O.forklaring.naaet})` : ""}`}
            </li>
          ))}
        </ul>
      )}
    </HbCard>
  );
};
