import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MaalKort as MaalKortDom } from "@/lib/hjemmebane/maalTal";
import type { MedlemsHandlinger, SkridtLinje } from "@/lib/hjemmebane/dineMaal";
import { danskDato } from "@/lib/hjemmebane/skridtForslag";
import { bane, chipTone, flereSkridtTekst, KORT_ORD, skridtFremdrift, stregTekst, talUndertekst, type ChipTone } from "@/lib/hjemmebane/dineMaalFlade";
import { HbCard } from "../HbCard";
import { HbButton } from "../HbButton";
import { HbPopover } from "./HbOverlejring";
import { TilfoejSkridtForm } from "./HbMaalRaekke";

/**
 * Ét mål som KORT på det nye «Dine mål» (designet Jonas sagde ja til 1/10-2026
 * kl. 21:04): status-chip + «om N mdr.» øverst, målet som serif-sætning, TALLET
 * stort med «pr. august (godkendt)» eller «tastet», banen fra udgangspunkt til
 * mål med fyldt del og en tynd streg «hvor I burde være», og nederst ÉT næste
 * skridt med «Gjort». Et begivenhedsmål viser skridt-fremdrift i stedet for
 * banen. Et GAMMELT mål (art null) viser titlen og ÉN handling: «Gør målet skarpt».
 *
 * TEGNER KUN: alt kommer færdigt fra motoren (maalTal.maalKort) og fladens ord
 * (dineMaalFlade) — ingen regnestykker her. Handlingerne er medlemmets
 * (dineMaal.MedlemsHandlinger, samme dom som før): Gjort går gennem opgave-luk,
 * Tilføj skridt gennem skridt-tilfoej (TilfoejSkridtForm — SAMME formular som
 * før og som forsiden), «…»-menuen gennem useMilestones' skrivere i DineMaalView.
 * Slet bekræftes i siden (SletMilestoneDialog) — aldrig confirm().
 *
 * Rådets fund (1/10 aften): (10) stregens forklaring «hvor I burde være pr. …»
 * står SYNLIGT på alle bredder (egen linje på mobil, inline fra sm) — ikke kun
 * som title; (17) et begivenhedsmåls «N af M skridt gjort» står ÉT sted
 * (chippen) — baren under viser kun fristen; (21) «Gør målet skarpt» er låst
 * (onGoerSkarpt null), når fladen ikke har målets rå række at forudfylde af.
 */

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";
const fokus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

const TONE: Record<ChipTone, string> = {
  god: "bg-hb-sage text-hb-ink",
  advarsel: "bg-hb-rust/10 text-hb-rust",
  neutral: "bg-hb-paper text-hb-ink-soft",
};

export const Chip = ({ tone, children, ...rest }: { tone: ChipTone; children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", TONE[tone])} {...rest}>
    {children}
  </span>
);

type Props = {
  kort: MaalKortDom;
  handlinger: MedlemsHandlinger;
  /** Alle skridt under målet i planens form (dineMaal.skridtLinjer) — foldes ud under det næste skridt. */
  skridtLinjer: readonly SkridtLinje[];
  busy: boolean;
  onGjort: (skridtId: string) => void;
  onTilfoejSkridt: (maalId: string, titel: string, dueDate: string) => Promise<string | null>;
  onRediger: () => void;
  onParker: () => void;
  onNaaet: () => void;
  onSlet: () => void;
  /** null = kan ikke gøres skarpt lige nu (fladen mangler målets rå række) — knappen er låst (fund 21). */
  onGoerSkarpt: (() => void) | null;
};

/** Menupunkt i «…»-menuen. */
const Punkt = ({ onClick, tone = "normal", children, busy, handling }: { onClick: () => void; tone?: "normal" | "rust"; children: React.ReactNode; busy: boolean; handling: string }) => (
  <li role="none">
    <button
      type="button"
      role="menuitem"
      disabled={busy}
      onClick={onClick}
      data-handling={handling}
      className={cn("block w-full px-3.5 py-2 text-left text-sm hover:bg-hb-sage/40 disabled:opacity-50", tone === "rust" ? "text-hb-rust" : "text-hb-ink", "focus-visible:outline-none focus-visible:bg-hb-sage/60")}
    >
      {children}
    </button>
  </li>
);

const kortDato = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? danskDato(d).replace(/ \d{4}$/, "") : null;
};

export const MaalKort = ({ kort, handlinger, skridtLinjer, busy, onGjort, onTilfoejSkridt, onRediger, onParker, onNaaet, onSlet, onGoerSkarpt }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const [menuAaben, setMenuAaben] = useState(false);
  const [flereAabne, setFlereAabne] = useState(false);
  const [tilfoejAaben, setTilfoejAaben] = useState(false);
  const flereId = useId();

  const O = KORT_ORD;
  const n = kort.naeste;
  const naesteId = n.skridt?.id ?? "";
  const b = bane(kort);
  const flere = flereSkridtTekst(kort);
  const oevrige = skridtLinjer.filter((l) => l.id !== n.skridt?.id);
  const tone = chipTone(kort.sporet.status);
  const erTal = kort.art === "tal";
  const erBegivenhed = kort.art === "begivenhed";
  const fremdrift = erBegivenhed ? skridtFremdrift(kort) : null;
  const undertekst = talUndertekst(kort);

  const menu = (
    <HbPopover
      open={menuAaben}
      onOpenChange={setMenuAaben}
      ariaLabel={O.menu}
      panelClassName="absolute right-0 top-full mt-1 min-w-[11rem] py-1"
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={O.menu}
          title={O.menu}
          disabled={busy}
          className={cn("rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-ink disabled:opacity-50", fokus)}
          data-maal-menu
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      )}
    >
      <ul role="menu" aria-label={O.menu}>
        {!kort.goerSkarpt && <Punkt busy={busy} handling="rediger" onClick={() => { setMenuAaben(false); onRediger(); }}>{O.rediger}</Punkt>}
        {handlinger.kanParkere && <Punkt busy={busy} handling="parker" onClick={() => { setMenuAaben(false); onParker(); }}>{O.parker}</Punkt>}
        {handlinger.kanMarkereNaaet && <Punkt busy={busy} handling="naaet" onClick={() => { setMenuAaben(false); onNaaet(); }}>{O.markerNaaet}</Punkt>}
        {handlinger.kanSlette && <Punkt busy={busy} handling="slet" tone="rust" onClick={() => { setMenuAaben(false); onSlet(); }}>{O.slet}</Punkt>}
      </ul>
    </HbPopover>
  );

  // ── Gammelt mål: titlen og ÉN handling ──
  if (kort.goerSkarpt) {
    return (
      <HbCard className="flex flex-col p-5 md:p-6" data-maal-kort={kort.id} data-maal-art="gammel" data-maal-status={kort.sporet.status}>
        <div className="flex items-start justify-between gap-3">
          <Chip tone="neutral" data-maal-chip>{kort.statusOrd}</Chip>
          {menu}
        </div>
        <h3 className="mt-3 font-editorial text-xl font-medium leading-snug text-hb-ink">{kort.titel}</h3>
        <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">{O.gammeltMaal}</p>
        <div className="mt-auto pt-5">
          <HbButton onClick={onGoerSkarpt ?? undefined} disabled={busy || onGoerSkarpt === null} className="h-10 w-full px-5 text-sm sm:w-auto" data-handling="goer-skarpt">
            {O.goerSkarpt}
          </HbButton>
        </div>
      </HbCard>
    );
  }

  return (
    <HbCard className="flex flex-col p-5 md:p-6" data-maal-kort={kort.id} data-maal-art={kort.art ?? "gammel"} data-maal-status={kort.sporet.status}>
      {/* Toppen: chip + frist + menu */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {erTal ? (
            <Chip tone={tone} data-maal-chip>{kort.statusOrd}</Chip>
          ) : (
            <Chip tone="neutral" data-maal-chip>{fremdrift?.tekst}</Chip>
          )}
          <span className={cn("text-xs", kort.sporet.dageTilbage !== null && kort.sporet.dageTilbage < 0 ? "font-medium text-hb-rust" : "text-hb-ink-soft")} data-maal-frist-tekst>
            {kort.fristTekst}
          </span>
        </div>
        {menu}
      </div>

      {/* Målet som én sætning */}
      <h3 className="mt-3 font-editorial text-xl font-medium leading-snug text-hb-ink md:text-[22px]">{kort.titel}</h3>

      {/* Tallet */}
      {erTal && (
        <div className="mt-4" data-maal-tal>
          {kort.talTekst ? (
            <>
              <p className="font-editorial text-4xl font-medium leading-none tabular-nums text-hb-ink md:text-[2.75rem]">{kort.talTekst}</p>
              {undertekst && <p className="mt-1.5 text-xs text-hb-ink-soft" data-maal-tal-undertekst>{undertekst}</p>}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-hb-ink-soft" data-maal-tal-mangler>{kort.tal?.status === "mangler" ? kort.tal.grund : kort.grundTekst}</p>
          )}
        </div>
      )}

      {/* Banen (tal) eller skridt-fremdriften (begivenhed) */}
      {erTal ? (
        <div className="mt-4" data-maal-bane data-maal-bane-fyldt={b.fyldtPct} data-maal-bane-streg={b.stregPct ?? "ingen"}>
          <div className="relative h-1.5 overflow-visible rounded-full bg-hb-line" aria-hidden>
            <div
              className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", tone === "advarsel" ? "bg-hb-rust/70" : "bg-hb-evergreen/80")}
              style={{ width: `${b.fyldtPct}%` }}
            />
            {b.stregPct !== null && (
              <span
                className="absolute -top-1 h-3.5 w-px bg-hb-ink"
                style={{ left: `${b.stregPct}%` }}
                title={stregTekst(kort)}
                data-maal-streg
              />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px] text-hb-ink-soft">
            <span className="min-w-0 truncate" data-maal-udgangspunkt>
              <span className={mikro}>{O.start}</span> {kort.udgangspunktTekst ?? "—"}
            </span>
            {/* Fund 10: synlig på alle bredder — egen linje nederst på mobil (order-last + basis-full), inline fra sm. */}
            {b.stregPct !== null && <span className="order-last basis-full sm:order-none sm:basis-auto" data-maal-streg-tekst><span className="mr-1 inline-block h-2.5 w-px bg-hb-ink align-[-1px]" aria-hidden />{stregTekst(kort)}</span>}
            <span className="min-w-0 truncate text-right" data-maal-maaltal>
              <span className={mikro}>{O.maal}</span> {kort.maaltalTekst ?? "—"}
              {kort.fristDato && <span> · {kort.fristDato}</span>}
            </span>
          </div>
          {kort.sporet.status === "kan_ikke_afgoeres" && kort.talTekst && kort.grundTekst && (
            <p className="mt-2 text-xs text-hb-ink-soft" data-maal-grund>{kort.grundTekst}</p>
          )}
        </div>
      ) : (
        fremdrift && (
          <div className="mt-4" data-maal-skridt-fremdrift={`${fremdrift.gjorte}/${fremdrift.alle}`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-hb-line" aria-hidden>
              <div className="h-full rounded-full bg-hb-evergreen/80 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.round(fremdrift.andel * 1000) / 10}%` }} />
            </div>
            {/* Fund 17: «N af M skridt gjort» står kun i chippen øverst — her kun fristen. */}
            {kort.fristDato && (
              <div className="mt-1.5 flex items-baseline justify-end text-[11px] text-hb-ink-soft">
                <span><span className={mikro}>{O.maal}</span> {kort.fristDato}</span>
              </div>
            )}
          </div>
        )
      )}

      {/* Næste skridt */}
      <div className="mt-auto border-t border-hb-line pt-4" data-maal-naeste={n.skridt ? n.skridt.status : "ingen"}>
        {n.skridt ? (
          <>
            <p className={mikro}>{O.naesteSkridt}</p>
            <div className="mt-1.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-hb-ink">{n.skridt.titel}</p>
                <p className="mt-0.5 text-xs text-hb-ink-soft" data-maal-naeste-meta>
                  {n.skridt.frist && (
                    <span className={cn(n.skridt.forfalden && "font-medium text-hb-rust")}>
                      {O.senest} {danskDato(n.skridt.frist)}
                    </span>
                  )}
                  {n.skridt.frist && n.skridt.foreslaaetAf && " · "}
                  {n.skridt.foreslaaetAf && <span>{O.foreslaaetAf} {n.skridt.foreslaaetAf}</span>}
                  {n.skridt.status === "proposed" && <span>{(n.skridt.frist || n.skridt.foreslaaetAf) ? " · " : ""}{O.venterPaaSvar}</span>}
                </p>
              </div>
              {n.skridt.status === "active" ? (
                <HbButton onClick={() => onGjort(naesteId)} disabled={busy} className="h-9 shrink-0 gap-1.5 px-4 text-xs" data-handling="gjort">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {O.gjort}
                </HbButton>
              ) : (
                <Link to="/boardroom#dine-skridt" className={cn("shrink-0 text-xs font-medium text-hb-evergreen underline-offset-4 hover:underline", fokus)}>
                  {O.svarPaaForsiden}
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="font-editorial text-base font-medium leading-snug text-hb-ink">{O.foersteSkridt}</p>
          </>
        )}

        {/* Flere skridt — foldet */}
        {flere && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setFlereAabne((v) => !v)}
              aria-expanded={flereAabne}
              aria-controls={flereId}
              className={cn("inline-flex items-center gap-1 rounded-sm text-xs text-hb-ink-soft underline-offset-4 hover:underline", fokus)}
              data-maal-flere
            >
              {flere}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", flereAabne && "rotate-180")} aria-hidden />
            </button>
            <ul id={flereId} hidden={!flereAabne} className="mt-2 space-y-1">
              {oevrige.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-xs" data-skridt-status={l.status}>
                  <span className={l.tegn === "◻" ? "text-hb-ink" : "text-hb-ink-soft"}>
                    {l.tegn} {l.titel}
                    {l.frist && <span className="text-hb-ink-soft"> · {O.senest} {danskDato(l.frist)}</span>}
                    {l.ord && <span className="text-hb-ink-soft"> · {l.ord}</span>}
                    {l.tegn === "✓" && kortDato(l.lukket) && <span className="text-hb-ink-soft"> · gjort {kortDato(l.lukket)}</span>}
                  </span>
                  {l.kanMarkeresGjort && (
                    <button type="button" disabled={busy} onClick={() => onGjort(l.id)} className={cn("rounded-sm text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50", fokus)}>
                      {O.gjort}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tilføj skridt — kun under aktive mål (dommen: kanTilfoejeSkridt). SAMME formular som før. */}
        {handlinger.kanTilfoejeSkridt && (
          tilfoejAaben ? (
            <TilfoejSkridtForm maalId={kort.id} maalFrist={kort.frist} busy={busy} onTilfoej={(titel, dueDate) => onTilfoejSkridt(kort.id, titel, dueDate)} onLuk={() => setTilfoejAaben(false)} />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setTilfoejAaben(true)}
              className={cn("mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50", fokus)}
              data-handling="tilfoej-skridt"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {O.tilfoejSkridt}
            </button>
          )
        )}
      </div>
    </HbCard>
  );
};

/** Den stiplede plads: «Plads til ét mål mere». */
export const TomPladsKort = ({ onSaetMaal, disabled, grund }: { onSaetMaal: () => void; disabled?: boolean; grund?: string }) => (
  <div className="flex min-h-[14rem] flex-col items-start justify-center rounded-hb border border-dashed border-hb-ink/25 p-5 md:p-6" data-maal-tom-plads>
    <p className={mikro}>{KORT_ORD.tomPladsTitel}</p>
    <p className="mt-2 font-editorial text-lg font-medium leading-snug text-hb-ink">{KORT_ORD.tomPladsTekst}</p>
    <HbButton onClick={onSaetMaal} disabled={disabled} title={grund} className="mt-4 h-10 gap-1.5 px-5 text-sm" data-handling="saet-maal">
      <Plus className="h-4 w-4" aria-hidden />
      {KORT_ORD.saetMaal}
    </HbButton>
  </div>
);
