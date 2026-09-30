import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { bredde, feltDom, FELT_FEJL_TEKST, foldUdsnit, visAlleTekst, type FeltSlags, type FeltTone } from "@/lib/hjemmebane/hoejreKolonne";

/** Byggestenene i højre kolonne på rådgivernes forside (30/9-2026; lib/
    hjemmebane/hoejreKolonne). Kun opsætning: ingen hentning, ingen dom —
    kalderen giver tallene, som dommene allerede har regnet.

    FORMEN er husets (docs/hjemmebane-designsprog.md): hvid flade på papiret,
    hairline, rounded-hb; mikrolabels i uppercase-tracking; Fraunces i
    font-medium til store tal; evergreen til handling, rust kun til det der
    er galt. Ingen hover-elevation på kortene (HbCard har den) — de er ikke
    klikbare som helhed.

    PRIKKERNE: grøn = i orden, orange = noget venter. Ingen af dem findes som
    Hb-token (evergreen er næsten sort i en 6 px prik); de står HER alene, som
    okkeren i SvartidsUret. Prikken er aria-hidden — ordet ved siden af bærer
    betydningen. */

export const KORT = "rounded-hb border border-hb-line bg-hb-surface p-5";
export const EYEBROW = "text-xs font-medium uppercase tracking-[0.14em] text-hb-rust";
export const MIKRO = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";

const PRIK: Record<FeltTone, string> = {
  i_orden: "bg-[hsl(155_40%_38%)]",
  venter: "bg-[hsl(30_85%_50%)]",
};

export const Prik = ({ tone, className }: { tone: FeltTone | "fejl"; className?: string }) => (
  <span aria-hidden className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", tone === "fejl" ? "bg-hb-rust" : PRIK[tone], className)} />
);

export type FeltTilstand = { art: "henter" } | { art: "fejl" } | { art: "tal"; antal: number };

/** Ét felt i «I dag»-gitteret: stort tal, kort etiket, prik + ord. */
export const TalFelt = ({ slags, etiket, tilstand, children }: { slags: FeltSlags; etiket: string; tilstand: FeltTilstand; children?: ReactNode }) => {
  if (tilstand.art === "henter") {
    return (
      <div aria-hidden className="min-w-0 rounded-hb border border-hb-line/70 p-3" data-felt={slags} data-felt-tilstand="henter">
        <div className="h-7 w-8 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-hb-line/40" />
      </div>
    );
  }
  if (tilstand.art === "fejl") {
    return (
      <div className="min-w-0 rounded-hb border border-hb-line/70 p-3" data-felt={slags} data-felt-tilstand="fejl">
        <p className="font-editorial text-2xl font-medium leading-none text-hb-ink-soft">—</p>
        <p className="mt-1.5 text-xs font-medium text-hb-ink">{etiket}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-hb-rust">
          <Prik tone="fejl" />
          {FELT_FEJL_TEKST}
        </p>
      </div>
    );
  }
  const d = feltDom(slags, tilstand.antal);
  return (
    <div
      className={cn("min-w-0 rounded-hb border p-3", d.rolig ? "border-hb-line/70" : "border-hb-line bg-hb-paper/60")}
      data-felt={slags}
      data-felt-tone={d.tone}
      data-felt-antal={tilstand.antal}
    >
      <p className={cn("font-editorial font-medium leading-none tabular-nums", d.rolig ? "text-2xl text-hb-ink-soft" : "text-3xl text-hb-ink")}>
        {tilstand.antal}
      </p>
      <p className="mt-1.5 text-xs font-medium text-hb-ink">{etiket}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-hb-ink-soft">
        <Prik tone={d.tone} />
        {d.statusTekst}
      </p>
      {children}
    </div>
  );
};

/** En fremdriftsbjælke: etiket (link når der er et), «X af Y», bjælken.
    role="progressbar" med tallene, så skærmlæsere får det samme som øjet. */
export const Fremdrift = ({ noegle, etiket, x, y, to, linkKlasse }: { noegle: string; etiket: string; x: number; y: number; to: string | null; linkKlasse: string }) => (
  <div data-fremdrift={noegle} data-fremdrift-x={x} data-fremdrift-y={y}>
    <div className="flex items-baseline justify-between gap-3">
      {to ? <Link to={to} className={linkKlasse}>{etiket}</Link> : <span className="text-hb-ink">{etiket}</span>}
      <span className="shrink-0 tabular-nums text-hb-ink-soft">
        <span className="font-medium text-hb-ink">{x}</span> af {y}
      </span>
    </div>
    <div
      role="progressbar"
      aria-label={etiket}
      aria-valuemin={0}
      aria-valuemax={y}
      aria-valuenow={x}
      aria-valuetext={`${x} af ${y}`}
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hb-line/70"
    >
      <div className="h-full rounded-full bg-hb-evergreen" style={{ width: bredde(x, y) }} />
    </div>
  </div>
);

/** Lille mærke (pille). Link når der er et; rust kun som advarsel. */
export const Maerke = ({ tekst, to, advarsel, linkKlasse }: { tekst: string; to: string | null; advarsel: boolean; linkKlasse: string }) => {
  const klasse = cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs", advarsel ? "border-hb-rust/40 text-hb-rust" : "border-hb-line text-hb-ink-soft");
  return to ? (
    <Link to={to} className={cn(klasse, linkKlasse, advarsel && "text-hb-rust")}>{tekst}</Link>
  ) : (
    <span className={klasse}>{tekst}</span>
  );
};

/** En foldbar række: knappen (aria-expanded) med etiket og tal-mærke;
    åbnet én virksomhed pr. linje, fem ad gangen + «Vis alle N». Tilstanden
    er lokal og forsvinder med siden — intet gemmes. */
export function FoldRaekke<T extends { id: string }>({
  etiket,
  liste,
  visNavn,
  linkKlasse,
  data,
}: {
  etiket: string;
  liste: readonly T[];
  /** Linjen for én virksomhed — kalderens link, så linket står hos kalderen. */
  visNavn: (v: T) => ReactNode;
  linkKlasse: string;
  data?: Record<string, string | number>;
}) {
  const [aaben, setAaben] = useState(false);
  const [visAlle, setVisAlle] = useState(false);
  const id = useId();
  const { viste, skjulte } = foldUdsnit(liste, visAlle);
  return (
    <div {...data}>
      <button
        type="button"
        aria-expanded={aaben}
        aria-controls={id}
        onClick={() => setAaben((a) => !a)}
        className="flex w-full items-center gap-2 rounded-hb py-2 text-left text-sm text-hb-ink transition-colors hover:bg-hb-sage/20"
      >
        <Prik tone="venter" />
        <span className="min-w-0 flex-1 font-medium">{etiket}</span>
        <span className="shrink-0 rounded-full bg-hb-sage px-2 py-0.5 text-xs font-medium tabular-nums text-hb-ink">{liste.length}</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-hb-ink-soft transition-transform", aaben && "rotate-180")} />
      </button>
      {aaben && (
        <div id={id} className="pb-2 pl-3.5">
          <ul className="space-y-1">
            {viste.map((v) => (
              <li key={v.id} className="truncate">
                {visNavn(v)}
              </li>
            ))}
          </ul>
          {skjulte > 0 && (
            <button type="button" onClick={() => setVisAlle(true)} className={cn("mt-1 text-xs", linkKlasse)}>
              {visAlleTekst(liste.length)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
