import { useId } from "react";
import { cn } from "@/lib/utils";
import type { TidslinjeDom } from "@/lib/hjemmebane/maalTal";
import { REJSEN_ORD, tidslinjeTegning } from "@/lib/hjemmebane/dineMaalFlade";
import { HbCard } from "../HbCard";

/**
 * «Rejsen» — de 12 måneder nederst på Dine mål (designet 1/10-2026): gjorte
 * skridt som prikker, «i dag», målenes frister og kvartalsmarkører på én
 * linje. Punkterne er motorens (maalTal.tidslinje); positionerne 0–1 er
 * dineMaalFlade.tidslinjeTegning. Tegnet som enkel SVG med husets tokens
 * gennem currentColor (som ScoreKorts ring), så begge temaer følger med.
 *
 * Mobil: viewBox'en strækkes i bredden (preserveAspectRatio none) — kun
 * linjen og prikkerne står i SVG'en; ordene (aksens måneder, forklaringen og
 * den fulde liste) er HTML under, så intet skaleres ulæseligt. Listen med
 * hvert punkt i ord er skærmlæserens vej (og mobilens, hvor prikkerne er små).
 */

const BREDDE = 1000;
const HOEJDE = 56;
const LINJE_Y = 32;
const RAND = 12;
const x = (andel: number) => RAND + andel * (BREDDE - 2 * RAND);

export const Rejsen = ({ tidslinje }: { tidslinje: TidslinjeDom | null }) => {
  const id = useId();
  if (!tidslinje) return null;
  const t = tidslinjeTegning(tidslinje);
  const O = REJSEN_ORD;

  return (
    <HbCard className="p-5 md:p-6" data-rejsen={t.tom ? "tom" : "punkter"} data-rejsen-start={tidslinje.start} data-rejsen-slut={tidslinje.slut}>
      <div className="relative pt-5">
        {/* «i dag» over linjen — HTML, så ordet ikke skaleres */}
        <span
          className={cn("absolute top-0 whitespace-nowrap text-[11px] font-medium text-hb-ink", t.nuX < 0.08 ? "" : t.nuX > 0.92 ? "-translate-x-full" : "-translate-x-1/2")}
          style={{ left: `${t.nuX * 100}%` }}
          aria-hidden
          data-rejsen-idag
        >
          {O.idag}
        </span>
        <svg
          viewBox={`0 0 ${BREDDE} ${HOEJDE}`}
          preserveAspectRatio="none"
          className="h-14 w-full"
          aria-labelledby={`${id}-titel`}
          role="img"
          focusable="false"
        >
          <title id={`${id}-titel`}>{O.titel}</title>
          {/* Linjen */}
          <line x1={x(0)} x2={x(1)} y1={LINJE_Y} y2={LINJE_Y} stroke="currentColor" strokeWidth="2" className="text-hb-line" vectorEffect="non-scaling-stroke" />
          {/* Den del, der er gået */}
          <line x1={x(0)} x2={x(t.nuX)} y1={LINJE_Y} y2={LINJE_Y} stroke="currentColor" strokeWidth="2" className="text-hb-evergreen/50" vectorEffect="non-scaling-stroke" />
          {/* Kvartalsmærker */}
          {t.akse.map((a) => (
            <line key={`akse-${a.punkt.dato}`} x1={x(a.x)} x2={x(a.x)} y1={LINJE_Y - 6} y2={LINJE_Y + 6} stroke="currentColor" strokeWidth="1" className="text-hb-ink-soft/60" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Gjorte skridt — prikker under linjen */}
          {t.skridt.map((s, i) => (
            <g key={`skridt-${s.punkt.dato}-${i}`} transform={`translate(${x(s.x)} ${LINJE_Y})`}>
              <circle r="4.5" fill="currentColor" className="text-hb-evergreen" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {/* Målenes frister — flag over linjen */}
          {t.frister.map((f, i) => (
            <g key={`frist-${f.punkt.dato}-${i}`} transform={`translate(${x(f.x)} ${LINJE_Y})`}>
              <line x1="0" x2="0" y1="0" y2="-16" stroke="currentColor" strokeWidth="1.5" className={f.punkt.naaet ? "text-hb-evergreen" : "text-hb-rust"} vectorEffect="non-scaling-stroke" />
              <circle cy="-18" r="4" fill="currentColor" className={f.punkt.naaet ? "text-hb-evergreen" : "text-hb-rust"} />
            </g>
          ))}
          {/* I dag */}
          <g transform={`translate(${x(t.nuX)} ${LINJE_Y})`}>
            <line x1="0" x2="0" y1="-10" y2="14" stroke="currentColor" strokeWidth="2" className="text-hb-ink" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        {/* Aksens ord — HTML, så de ikke skaleres med SVG'en */}
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

      {/* Punkterne i ord — skærmlæserens og mobilens vej */}
      {t.tom ? (
        <p className="mt-3 text-sm text-hb-ink-soft">{O.tom}</p>
      ) : (
        <ul className="sr-only" data-rejsen-liste>
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
