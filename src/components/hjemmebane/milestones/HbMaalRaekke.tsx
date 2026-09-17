import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, BookOpen, Check, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MILESTONE_CATEGORIES } from "@/lib/milestoneCategories";
import { TILFOEJ_SKRIDT_KNAP_TEKST, type MaalForMedlem, type SkridtLinje } from "@/lib/hjemmebane/dineMaal";
import { dagsdatoDansk, doemFrist, foreslaaetFrist, FORESLAAET_FRIST_DAGE } from "@/lib/hjemmebane/skridtForslag";
import { HbButton } from "../HbButton";
import { HbField, HbInput } from "../admin/HbField";
import { HbTag } from "../HbTag";
import type { Milestone } from "./useMilestones";

/**
 * Ét mål som række på «Dine mål» — «Én plan», fase 3 (16/9-2026). Afløser
 * HbMilestoneRaekke (etape 1, 4/9); formen er den samme (HbItemRow: prik,
 * titel, meta, handlinger til højre, stille hairline-bar under), og
 * kategoritag/kilde-tags er flyttet ordret. Nyt: SKRIDTENE under målet og
 * handlingerne som ord frem for en prik der skifter tilstand.
 *
 * DOMMEN bor i lib/hjemmebane/dineMaal (→ planen → milepaelDom): rækken
 * læser x.plan.dom, x.plan.fremdrift/beregnet, x.handlinger og
 * x.skridtLinjer — og afgør intet selv. Fremdriften i ord er planens
 * («2 af 3 skridt gjort · 67 %»), så rådgiverens «Planen» og medlemmets
 * «Dine mål» siger det samme.
 *
 * SKYDEREN (klik på baren, 5 %-trin — som før): KUN når dommen siger
 * kanSaetteFremdrift, dvs. aktivt mål UDEN tællende skridt. Har målet
 * skridt, regnes fremdriften af dem (opgave-luk skriver den), og baren er
 * læs-kun. Målbare mål (target_value + unit) sættes via «nuværende værdi»
 * i detaljen — også kun når kanSaetteFremdrift.
 *
 * SKRIDTENE: ◻ aktive med frist og en «Gjort»-knap (opgave-luk, udfald
 * done — samme skrivevej som forsiden; fremdriften rykker i samme render
 * via genhentning), ? venter på dit svar (svares på forsiden, «Dine
 * skridt»), ✓ gjorte som historik («gjort 12. sep.») foldet under «vis
 * gjorte», – ikke gjort/droppet ligeså.
 *
 * FORFALDEN stikker ud som før: dato i rust og «Fristen var …».
 * data-attributter til skærmbevis: data-maal-id, data-maal-tilstand,
 * data-maal-fremdrift, data-maal-beregnet, data-skridt-status.
 */

const formatDato = (d: Date | string | null): string => {
  if (!d) return "Ingen frist";
  const dato = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dato.getTime()) ? "Ingen frist" : dato.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
};
const formatKort = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
};

/** Tilstandsprik: ● nået · ◐ i gang · ○ ikke startet · ▢ parkeret — kun visning; handlingerne er ord nedenfor. */
const Tilstandsprik = ({ x }: { x: MaalForMedlem }) => {
  const dom = x.plan.dom;
  if (dom.faerdig)
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hb-evergreen" aria-hidden>
        <Check className="h-3 w-3 text-white" />
      </span>
    );
  if (dom.parkeret)
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-hb-line" aria-hidden>
        <Archive className="h-3 w-3 text-hb-ink-soft" />
      </span>
    );
  const paabegyndt = x.plan.fremdrift > 0;
  return (
    <span
      aria-hidden
      className={cn(
        "block h-5 w-5 rounded-full border",
        dom.forfalden
          ? paabegyndt
            ? "border-hb-rust [background:linear-gradient(90deg,hsl(var(--hb-rust))_50%,transparent_50%)]"
            : "border-hb-rust"
          : paabegyndt
            ? "border-hb-evergreen [background:linear-gradient(90deg,hsl(var(--hb-evergreen))_50%,transparent_50%)]"
            : "border-hb-line",
      )}
    />
  );
};

/** Titlens mindstelængde — dommen bor i functionen (validerSkridtTitel,
    _shared/foreslaaOpgaveValidering.ts, som src ikke kan importere); her kun
    så knappen er slået fra før kaldet. Samme tal, samme tekst. */
const SKRIDT_TITEL_MIN_LAENGDE = 3;

/** «Tilføj skridt» under et AKTIVT mål (skridt-tilfoej, 17/9 — Jonas «ja»).
    EKSPORTERET (forside PR 3): forsidens «Din plan» bruger SAMME formular —
    én formular, én dom (foreslaaetFrist/doemFrist), ingen kopi.
    JONAS 17/9 (ordret: «1»): fristen er OBLIGATORISK — forudfyldt med i dag
    + 14 dage i dansk tid (foreslaaetFrist), kan ændres, ikke tømmes, og ikke
    før i dag (doemFrist — samme dom som functionen). Fejl fra functionen
    vises ordret under feltet; oprettelsen genhenter skridt og mål. */
export const TilfoejSkridtForm = ({ maalId, busy, onTilfoej, onLuk, knapTekst }: {
  maalId: string;
  busy: boolean;
  onTilfoej: (titel: string, dueDate: string) => Promise<string | null>;
  onLuk: () => void;
  /** Knappens tekst — «Tilføj skridt» (standard) eller «Tilføj det første skridt» (forsidens plan, PR 3). */
  knapTekst?: string;
}) => {
  const [titel, setTitel] = useState("");
  const [frist, setFrist] = useState(() => foreslaaetFrist(new Date()));
  const [fejl, setFejl] = useState<string | null>(null);
  const idag = dagsdatoDansk(new Date());
  const titelOk = titel.trim().length >= SKRIDT_TITEL_MIN_LAENGDE;
  const send = async () => {
    const fristDom = doemFrist(frist, new Date());
    // strict=false: `!fristDom.ok` snævrer ikke — sammenlign med false (husets regel).
    if (fristDom.ok === false) { setFejl(fristDom.grund); return; }
    if (!titelOk) { setFejl(`Skriv hvad du vil gøre — mindst ${SKRIDT_TITEL_MIN_LAENGDE} tegn`); return; }
    setFejl(null);
    const svar = await onTilfoej(titel.trim(), fristDom.dato);
    if (svar) setFejl(svar);
    else { setTitel(""); setFrist(foreslaaetFrist(new Date())); onLuk(); }
  };
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }} data-tilfoej-skridt-form={maalId}>
      <HbField label="Skridtet" htmlFor={`tilfoej-titel-${maalId}`} help={`Hvad vil du gøre? Mindst ${SKRIDT_TITEL_MIN_LAENGDE} tegn, højst 200.`}>
        <HbInput id={`tilfoej-titel-${maalId}`} value={titel} maxLength={200} onChange={(e) => setTitel(e.target.value)} autoFocus className="py-1.5 text-sm" />
      </HbField>
      <HbField label="Frist" htmlFor={`tilfoej-frist-${maalId}`} help={`Foreslået: om ${FORESLAAET_FRIST_DAGE} dage. Ikke før i dag.`} error={fejl}>
        <HbInput id={`tilfoej-frist-${maalId}`} type="date" value={frist} min={idag} required onChange={(e) => setFrist(e.target.value)} className="py-1.5 text-sm" />
      </HbField>
      <div className="flex items-center gap-2">
        <HbButton type="submit" className="h-8 px-3 text-xs" disabled={busy || !titelOk || !frist}>{busy ? "Gemmer…" : knapTekst ?? TILFOEJ_SKRIDT_KNAP_TEKST}</HbButton>
        <HbButton type="button" variant="secondary" className="h-8 px-3 text-xs" disabled={busy} onClick={onLuk}>Fortryd</HbButton>
      </div>
    </form>
  );
};

const Skridt = ({ l, busy, onGjort }: { l: SkridtLinje; busy: boolean; onGjort: () => void }) => (
  <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs" data-skridt-id={l.id} data-skridt-status={l.status}>
    <span className={l.tegn === "◻" ? "text-hb-ink" : "text-hb-ink-soft"}>
      {l.tegn} {l.titel}
      {l.frist && <span className="text-hb-ink-soft"> · frist {formatDato(l.frist)}</span>}
      {l.ord && <span className="text-hb-ink-soft"> · {l.ord}</span>}
      {l.tegn === "✓" && formatKort(l.lukket) && <span className="text-hb-ink-soft"> · gjort {formatKort(l.lukket)}</span>}
    </span>
    {l.kanMarkeresGjort && (
      <button type="button" disabled={busy} onClick={onGjort} className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50">
        Gjort
      </button>
    )}
    {l.tegn === "?" && (
      <Link to="/boardroom#dine-skridt" className="text-hb-evergreen underline-offset-4 hover:underline">Svar på forsiden</Link>
    )}
  </li>
);

export const HbMaalRaekke = ({
  x, ms, busy, onAabn, onFremgang, onNaaet, onGenaabn, onParker, onAktiver, onSlet, onSkridtGjort, onTilfoejSkridt,
}: {
  x: MaalForMedlem;
  /** Rækken fra useMilestones — kategori, kilde, målbarhed (target_value/unit). */
  ms: Milestone;
  busy: boolean;
  /** Åbner detalje/rediger (MilestoneDialoger). */
  onAabn: () => void;
  /** Kun når dommen siger kanSaetteFremdrift og målet ikke er målbart: klik på baren, 5 %-trin. */
  onFremgang: (p: number) => void;
  onNaaet: () => void;
  onGenaabn: () => void;
  onParker: () => void;
  onAktiver: () => void;
  onSlet: () => void;
  onSkridtGjort: (skridtId: string) => void;
  /** «Tilføj skridt» (skridt-tilfoej): returnerer fejlteksten ordret, eller null når skridtet er tilføjet. */
  onTilfoejSkridt: (maalId: string, titel: string, dueDate: string) => Promise<string | null>;
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [visHistorik, setVisHistorik] = useState(false);
  const [tilfoejAaben, setTilfoejAaben] = useState(false);
  const cfg = MILESTONE_CATEGORIES[ms.category] || MILESTONE_CATEGORIES.other;
  const Ikon = cfg.icon;
  const maalbar = !!(ms.target_value && ms.unit);
  const dom = x.plan.dom;
  const h = x.handlinger;
  const klikbarBar = h.kanSaetteFremdrift && !maalbar;
  const fremdrift = Math.min(100, Math.max(0, x.plan.fremdrift));
  const aabne = x.skridtLinjer.filter((l) => l.tegn === "◻" || l.tegn === "?");
  const historik = x.skridtLinjer.filter((l) => l.tegn === "✓" || l.tegn === "–");

  // Klik-position → 5 %-trin (som HbMilestoneRaekke / MilestonesList.ClickableProgressBar).
  const fremgangAf = (clientX: number): number => {
    if (!barRef.current) return fremdrift;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    return Math.min(100, Math.max(0, Math.round(pct / 5) * 5));
  };

  const fristTekst = dom.forfalden ? `Fristen var ${formatDato(ms.deadline)}` : formatDato(ms.deadline);

  return (
    <li
      className={cn("py-3", dom.parkeret && "opacity-60")}
      data-maal-id={ms.id}
      data-maal-tilstand={x.plan.dom.tilstand}
      data-maal-fremdrift={fremdrift}
      data-maal-beregnet={x.plan.beregnet ? "1" : "0"}
    >
      <div className="flex items-start gap-3.5">
        <div className="pt-0.5">
          <Tilstandsprik x={x} />
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onAabn} className="block w-full text-left">
            <p className={cn("text-[15px] leading-snug", dom.faerdig ? "text-hb-ink-soft line-through" : "text-hb-ink")}>{ms.title}</p>
            <p className="mt-0.5 text-xs text-hb-ink-soft">
              <span className={cn(dom.forfalden && "font-medium text-hb-rust")}>{fristTekst}</span>
              {ms.baseline && <span> · {ms.baseline}</span>}
              {dom.faerdig && formatKort(ms.completed_at) && <span> · nået {formatKort(ms.completed_at)}</span>}
            </p>
          </button>
          <div className="mt-2 flex items-center gap-3">
            <div
              ref={barRef}
              onClick={klikbarBar ? (e) => onFremgang(fremgangAf(e.clientX)) : undefined}
              title={klikbarBar ? "Klik for at ændre fremgang" : x.plan.beregnet ? "Fremdriften regnes af skridtene" : undefined}
              className={cn("flex-1 py-1.5", klikbarBar && "cursor-pointer")}
            >
              <div className="h-[3px] overflow-hidden rounded-full bg-hb-line">
                <div className={dom.faerdig ? "h-full rounded-full bg-hb-evergreen" : "h-full rounded-full bg-hb-evergreen/70"} style={{ width: `${fremdrift}%` }} />
              </div>
            </div>
            <span className="shrink-0 text-xs text-hb-ink-soft">
              {dom.faerdig ? "Nået" : dom.parkeret ? "Parkeret" : maalbar && !x.plan.beregnet ? `${ms.current_value ?? 0} af ${ms.target_value} ${ms.unit}` : x.fremdriftTekst}
            </span>
          </div>

          {/* Skridtene under målet — åbne først; historikken foldet. */}
          {(aabne.length > 0 || historik.length > 0) && (
            <div className="mt-2">
              {aabne.length > 0 && (
                <ul className="space-y-0.5">
                  {aabne.map((l) => <Skridt key={l.id} l={l} busy={busy} onGjort={() => onSkridtGjort(l.id)} />)}
                </ul>
              )}
              {historik.length > 0 && (
                <div className="mt-1">
                  <button type="button" onClick={() => setVisHistorik((v) => !v)} className="text-xs text-hb-ink-soft underline-offset-4 hover:underline" data-vis-gjorte={visHistorik ? "1" : "0"}>
                    {visHistorik ? "Skjul gjorte" : `Vis gjorte · ${historik.length}`}
                  </button>
                  {visHistorik && (
                    <ul className="mt-1 space-y-0.5">
                      {historik.map((l) => <Skridt key={l.id} l={l} busy={busy} onGjort={() => undefined} />)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* «Tilføj skridt» — kun under aktive mål (dommen: kanTilfoejeSkridt). */}
          {h.kanTilfoejeSkridt && (
            tilfoejAaben ? (
              <TilfoejSkridtForm maalId={ms.id} busy={busy} onTilfoej={(titel, dueDate) => onTilfoejSkridt(ms.id, titel, dueDate)} onLuk={() => setTilfoejAaben(false)} />
            ) : (
              <button type="button" disabled={busy} onClick={() => setTilfoejAaben(true)} className="mt-2 text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-handling="tilfoej-skridt">
                + {TILFOEJ_SKRIDT_KNAP_TEKST}
              </button>
            )
          )}

          {/* Handlingerne som ord — medlemmet ejer målet. */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {h.kanMarkereNaaet && (
              <button type="button" disabled={busy} onClick={onNaaet} className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-handling="naaet">Marker som nået</button>
            )}
            {h.kanGenaabne && (
              <button type="button" disabled={busy} onClick={onGenaabn} className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-handling="genaabn">Genåbn</button>
            )}
            {h.kanAktivere && (
              <button type="button" disabled={busy} onClick={onAktiver} className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-handling="aktiver">Aktivér</button>
            )}
            <button type="button" disabled={busy} onClick={onAabn} className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50" data-handling="rediger">Redigér</button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <HbTag className="gap-1 px-2 py-0.5 text-[11px]">
            <Ikon className="h-3 w-3" />
            {cfg.label}
          </HbTag>
          {ms.source === "ai" && (
            <HbTag className="gap-1 bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">
              <Sparkles className="h-3 w-3" /> AI
            </HbTag>
          )}
          {ms.source === "handout" && (
            ms.source_report ? (
              <Link to={`/handouts?module=${ms.source_report}`} className="inline-flex items-center gap-1 rounded-full bg-hb-paper px-2 py-0.5 text-[11px] font-medium text-hb-evergreen underline-offset-4 hover:underline">
                <BookOpen className="h-3 w-3" /> Fra handout
              </Link>
            ) : (
              <HbTag className="gap-1 bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">
                <BookOpen className="h-3 w-3" /> Fra handout
              </HbTag>
            )
          )}
          {h.kanParkere && (
            <button type="button" disabled={busy} onClick={onParker} title="Parkér" aria-label="Parkér" className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-ink disabled:opacity-50">
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          {h.kanSlette && (
            <button type="button" disabled={busy} onClick={onSlet} title="Slet" aria-label="Slet" className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-rust disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
};
