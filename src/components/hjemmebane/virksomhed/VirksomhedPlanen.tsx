import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { erMedlemmetsEget, fremdriftTekst, MEDLEMMETS_EGET_TEKST, planenDom, udenBevaegelseTekst, type MaalIPlanen, type MaalRaekke, type SkridtRaekke } from "@/lib/hjemmebane/planen";
import { MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";
import { HbButton } from "../HbButton";
import { HbSection } from "../HbSection";
import { HbField, HbInput, HbTextarea, hbControlClasses } from "../admin/HbField";

/**
 * «Planen» på rådgiverens virksomhedsside — «Én plan pr. virksomhed», fase 2
 * (16/9-2026), og fra 17/9 BLOK 3 I FULD BREDDE (virksomhedssiden PR 1,
 * ~/Downloads/analyse-virksomhedssiden.md §4; Jonas 17/9 «Ja på alle»):
 * sessionens genstand står før tallene, som egen sektion, ikke som tredje
 * kolonne i «Aktivitet» (målt: 184–333 px tekst). Målene som rækker, skridtene
 * ÅBNE (◻ aktive · ? venter · ✓ gjorte · – ikke gjort; op til seks pr. mål,
 * resten «Vis alle»), handlingerne som ord; parkerede og nåede foldet. Jonas:
 * rådgiveren sætter målene sammen med medlemmet; højst tre aktive; ingen af
 * de eksisterende mål parkeres uden et klik.
 *
 * Dommen er REN (lib/hjemmebane/planen.planenDom): aktive/parkerede/nåede,
 * skridt under hvert mål, knappernes tilstand og GENNEMGANGEN (flere end
 * tre aktive: behold/parkér/nået pr. mål, indtil der er højst tre). Alle
 * skrivninger går gennem edge function maal-skriv (Bucket A + rådgiver) —
 * aldrig direkte til milestones herfra (RLS-migrationen 20260917160000).
 * Efter en skrivning awaites onOpdateret, så kortet viser den nye tilstand
 * i samme render (OVERLEVERING DEL 4-lærdommen).
 *
 * «Foreslå skridt» (fase 3): samme vej som chattens «Foreslå skridt» — edge
 * function foreslaa-opgave med companyId, samtalen (samtaleId fra Blok6: den
 * med seneste besked; null = ingen samtale → knappen er slået fra og siger
 * hvorfor) og et VALGFRIT maalId. JONAS 16/9 (ordret: «B»): målvælgeren er
 * valgfri — standard er målet knappen står under (ellers det ældste aktive),
 * «Uden mål» er et tydeligt valg; ingen aktive mål → knappen står under
 * kortet uden valg, og skridtet sendes uden mål (lander som «uden mål»).
 * Forslaget lander i medlemmets «Dine skridt» på forsiden; skridtet står som
 * «venter» her.
 *
 * FULDE TITLER (Jonas 16/9: «Vi kan ikke se hele opgaveskriften på
 * virksomhedssiden»): målenes og skridtenes titler ombrydes — ingen
 * truncate/line-clamp (dineMaal.guard dom 8 og virksomhedsside.guard låser
 * det). Sektionen har hele indholdsbredden (704–1152 px); under md står alt
 * i én kolonne som før.
 *
 * ANKERET id="section-milestones" bor HER (forsideMaal.guard dom 5 læser denne
 * fil): forsidens maal_uden_bevaegelse og ingen_maal lander på sektionen.
 */

/** Skridt vist åbent pr. mål før «Vis alle» (Jonas 17/9, valg 4). */
export const SKRIDT_VIST = 6;

type Handling = "opret" | "rediger" | "aktiver" | "parker" | "naaet";

/** Fejl-body'en bærer husets tekst (409/404/400) — vis den, ikke «Edge Function returned a non-2xx status code». */
async function laesFejl(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = error.context as { json?: () => Promise<{ error?: string }> } | undefined;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = await ctx.json();
      if (b?.error) return b.error;
    } catch { /* falder til error.message */ }
  }
  return error.message;
}

async function kaldMaalSkriv(body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; fejl: string }> {
  const { data, error } = await supabase.functions.invoke("maal-skriv", { body });
  if (error) return { ok: false, fejl: await laesFejl(error) };
  const svar = data as { ok?: boolean; error?: string } | null;
  if (!svar?.ok) return { ok: false, fejl: svar?.error ?? "Målet blev ikke skrevet" };
  return { ok: true };
}

/** «Foreslå skridt» (fase 3) — foreslaa-opgave, samme function som chatten. */
async function kaldForeslaaOpgave(body: Record<string, unknown>): Promise<{ ok: true; beskedSkrevet: boolean } | { ok: false; fejl: string }> {
  const { data, error } = await supabase.functions.invoke("foreslaa-opgave", { body });
  if (error) return { ok: false, fejl: await laesFejl(error) };
  const svar = data as { beskedSkrevet?: boolean } | null;
  return { ok: true, beskedSkrevet: svar?.beskedSkrevet !== false };
}

const formatDato = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
};

export function VirksomhedPlanen({
  companyId, maal, skridt, samtaleId, onOpdateret,
}: {
  companyId: string;
  maal: MaalRaekke[];
  skridt: SkridtRaekke[];
  /** Samtalen forslaget skrives i (Blok6: den med seneste besked); null = ingen samtale → ingen forslag herfra. */
  samtaleId: string | null;
  onOpdateret: () => Promise<void>;
}) {
  const dom = planenDom(maal, skridt, new Date());
  const [arbejder, setArbejder] = useState<string | null>(null);
  const [opretAaben, setOpretAaben] = useState(false);
  const [titel, setTitel] = useState("");
  const [kategori, setKategori] = useState("");
  const [frist, setFrist] = useState("");
  // «Foreslå skridt» (fase 3): hvor formularen står («uden» = under kortet,
  // når der ingen aktive mål er) og hvilket mål der er valgt ("uden" = uden mål).
  const [foreslaaFor, setForeslaaFor] = useState<string | null>(null);
  const [skridtMaalValg, setSkridtMaalValg] = useState("uden");
  const [skridtTitel, setSkridtTitel] = useState("");
  const [skridtBegrundelse, setSkridtBegrundelse] = useState("");
  // «Vis alle N skridt» pr. mål (PR 1): op til SKRIDT_VIST åbne, resten på klik.
  const [visAlleSkridt, setVisAlleSkridt] = useState<Set<string>>(() => new Set());
  const aabnForeslaa = (sted: string) => {
    if (foreslaaFor === sted) { setForeslaaFor(null); return; }
    setForeslaaFor(sted); setSkridtMaalValg(sted); setSkridtTitel(""); setSkridtBegrundelse("");
  };

  const foreslaaSkridt = async () => {
    const t = skridtTitel.trim();
    if (!t || !samtaleId) return;
    const maalId = skridtMaalValg === "uden" ? null : skridtMaalValg;
    setArbejder(`skridt:${foreslaaFor ?? "uden"}`);
    try {
      // Jonas «B»: maalId kun med når et mål er valgt — uden lander skridtet som «uden mål».
      const r = await kaldForeslaaOpgave({ companyId, conversationId: samtaleId, titel: t, ...(skridtBegrundelse.trim() ? { begrundelse: skridtBegrundelse.trim() } : {}), ...(maalId ? { maalId } : {}) });
      if (r.ok === false) {
        toast.error("Skridtet blev ikke foreslået", { description: r.fejl });
        return;
      }
      await onOpdateret();
      setSkridtTitel(""); setSkridtBegrundelse(""); setForeslaaFor(null);
      if (r.beskedSkrevet) toast.success("Skridtet er foreslået", { description: "Medlemmet svarer under Dine skridt på forsiden." });
      else toast.warning("Skridtet er foreslået, men kom ikke med i samtalen", { description: "Medlemmet ser det stadig under Dine skridt." });
    } finally {
      setArbejder(null);
    }
  };

  const skriv = async (noegle: string, handling: Handling, ekstra: Record<string, unknown> = {}) => {
    setArbejder(noegle);
    try {
      const r = await kaldMaalSkriv({ handling, companyId, ...ekstra });
      // strict er slået fra i tsconfig: diskriminanten narrowes kun med === false.
      if (r.ok === false) {
        toast.error("Målet blev ikke skrevet", { description: r.fejl });
        return false;
      }
      await onOpdateret();
      return true;
    } finally {
      setArbejder(null);
    }
  };

  const opret = async () => {
    const t = titel.trim();
    if (!t) return;
    const ok = await skriv("opret", "opret", { titel: t, kategori: kategori.trim() || undefined, frist: frist || undefined });
    if (ok) {
      setTitel(""); setKategori(""); setFrist(""); setOpretAaben(false);
      toast.success("Målet er sat", { description: t });
    }
  };

  return (
    // id="section-milestones": ankeret for forsidens maal_uden_bevaegelse og ingen_maal (fase 4/5).
    <HbSection id="section-milestones" eyebrow="Planen" hairline className="mt-12 scroll-mt-24" data-planen-gennemgang={dom.gennemgang ? "1" : "0"} data-planen-aktive={dom.aktive.length}>
      <p className={dom.gennemgang ? "text-sm font-medium text-hb-rust" : "text-sm text-hb-ink"} data-planen-tekst>{dom.tekst}</p>
      {dom.gennemgang && (
        <p className="mt-1 text-xs text-hb-ink-soft">
          Målene er fra før planen (seneste fremdrift kan ligge måneder tilbage). Behold dem der stadig gælder — højst {MAX_AKTIVE_MAAL} — og parkér eller markér resten som nået. Intet parkeres af sig selv.
        </p>
      )}

      {dom.aktive.length > 0 && (
        <ul className="mt-4 divide-y divide-hb-line">
          {dom.aktive.map((x) => (
            <MaalLinje
              key={x.maal.id}
              x={x}
              arbejder={arbejder}
              gennemgang={dom.gennemgang}
              visAlle={visAlleSkridt.has(x.maal.id)}
              onVisAlle={() => setVisAlleSkridt((prev) => new Set(prev).add(x.maal.id))}
              onParker={() => void skriv(x.maal.id, "parker", { maalId: x.maal.id })}
              onNaaet={() => void skriv(x.maal.id, "naaet", { maalId: x.maal.id })}
              samtaleId={samtaleId}
              foreslaaAaben={foreslaaFor === x.maal.id}
              onForeslaaAabn={() => aabnForeslaa(x.maal.id)}
              form={foreslaaFor === x.maal.id ? (
                <SkridtForm
                  noegle={x.maal.id}
                  aktive={dom.aktive.map((a) => ({ id: a.maal.id, title: a.maal.title }))}
                  maalValg={skridtMaalValg}
                  onMaalValg={setSkridtMaalValg}
                  titel={skridtTitel}
                  begrundelse={skridtBegrundelse}
                  onTitel={setSkridtTitel}
                  onBegrundelse={setSkridtBegrundelse}
                  sender={arbejder === `skridt:${x.maal.id}`}
                  laast={arbejder !== null}
                  onSend={() => void foreslaaSkridt()}
                />
              ) : null}
            />
          ))}
        </ul>
      )}

      {dom.parkerede.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-hb-ink-soft">Parkerede · {dom.parkerede.length}</summary>
          <ul className="mt-2 divide-y divide-hb-line">
            {dom.parkerede.map((x) => (
              <li key={x.maal.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 break-words text-hb-ink">{x.maal.title}{x.maal.source === "handout" && <span className="text-hb-ink-soft"> · forslag fra handout</span>}</span>
                {x.handlinger.kanAktivere && (
                  <button type="button" disabled={arbejder !== null} onClick={() => void skriv(x.maal.id, "aktiver", { maalId: x.maal.id })} className="shrink-0 text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50">
                    {arbejder === x.maal.id ? "Gemmer…" : "Aktivér"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {dom.naaede.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-hb-ink-soft">Nåede · {dom.naaede.length}</summary>
          <ul className="mt-2 divide-y divide-hb-line">
            {dom.naaede.map((x) => (
              <li key={x.maal.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 break-words text-hb-ink">{x.maal.title}{formatDato(x.maal.completed_at) && <span className="text-hb-ink-soft"> · nået {formatDato(x.maal.completed_at)}</span>}</span>
                {x.handlinger.kanAktivere && (
                  <button type="button" disabled={arbejder !== null} onClick={() => void skriv(x.maal.id, "aktiver", { maalId: x.maal.id })} className="shrink-0 text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50">
                    {arbejder === x.maal.id ? "Gemmer…" : "Genåbn"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {dom.udenMaal.length > 0 && (
        <p className="mt-3 text-xs text-hb-ink-soft">{dom.udenMaal.length} {dom.udenMaal.length === 1 ? "skridt" : "skridt"} uden mål (fra før planen)</p>
      )}

      {/* Foreslå skridt UDEN mål (Jonas «B»): kun når der ingen aktive mål er —
          ellers står knappen under hvert mål. Lukket under gennemgangen. */}
      {dom.aktive.length === 0 && !dom.gennemgang && (
        <div className="mt-3">
          <button
            type="button"
            disabled={arbejder !== null || !samtaleId}
            onClick={() => aabnForeslaa("uden")}
            title={samtaleId ? "Foreslå et skridt uden mål — medlemmet svarer på forsiden" : "Ingen samtale med virksomheden endnu — forslaget skrives i chatten"}
            className="text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
            data-foreslaa-skridt="uden"
          >
            {foreslaaFor === "uden" ? "Fortryd" : "Foreslå skridt (uden mål)"}
          </button>
          {foreslaaFor === "uden" && samtaleId && (
            <SkridtForm
              noegle="uden"
              aktive={[]}
              maalValg="uden"
              onMaalValg={setSkridtMaalValg}
              titel={skridtTitel}
              begrundelse={skridtBegrundelse}
              onTitel={setSkridtTitel}
              onBegrundelse={setSkridtBegrundelse}
              sender={arbejder === "skridt:uden"}
              laast={arbejder !== null}
              onSend={() => void foreslaaSkridt()}
            />
          )}
        </div>
      )}

      {/* Sæt mål — sammen med medlemmet. Låst ved tre aktive og under gennemgangen. */}
      <div className="mt-4">
        {!opretAaben ? (
          <HbButton type="button" variant="secondary" className="h-9 px-4 text-xs" disabled={!dom.kanSaetteMaal || arbejder !== null} onClick={() => setOpretAaben(true)} title={dom.kanSaetteMaal ? "Sæt et mål sammen med medlemmet" : `Højst ${MAX_AKTIVE_MAAL} aktive mål — parkér eller markér et som nået først`}>
            Sæt mål sammen med medlemmet
          </HbButton>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void opret(); }}>
            <HbField label="Målet" htmlFor="planen-titel" help="Ét mål, kort — som medlemmet selv ville sige det. Højst 120 tegn.">
              <HbInput id="planen-titel" value={titel} maxLength={120} onChange={(e) => setTitel(e.target.value)} autoFocus />
            </HbField>
            <div className="grid gap-3 sm:grid-cols-2">
              <HbField label="Kategori" htmlFor="planen-kategori" help="Fri tekst (fx økonomi, salg). Tom = «other».">
                <HbInput id="planen-kategori" value={kategori} onChange={(e) => setKategori(e.target.value)} />
              </HbField>
              <HbField label="Frist" htmlFor="planen-frist" help="Valgfri.">
                <HbInput id="planen-frist" type="date" value={frist} onChange={(e) => setFrist(e.target.value)} />
              </HbField>
            </div>
            <div className="flex items-center gap-2">
              <HbButton type="submit" className="h-9 px-4 text-xs" disabled={!titel.trim() || arbejder !== null}>{arbejder === "opret" ? "Gemmer…" : "Sæt målet"}</HbButton>
              <HbButton type="button" variant="secondary" className="h-9 px-4 text-xs" disabled={arbejder !== null} onClick={() => setOpretAaben(false)}>Fortryd</HbButton>
            </div>
          </form>
        )}
      </div>
    </HbSection>
  );
}

/** Formularen «Foreslå skridt» — under et mål (med målvælger: standard = målet
    knappen står under, ellers de andre aktive, og «Uden mål») eller under
    kortet uden aktive mål (ingen vælger). */
function SkridtForm({
  noegle, aktive, maalValg, onMaalValg, titel, begrundelse, onTitel, onBegrundelse, sender, laast, onSend,
}: {
  noegle: string; aktive: { id: string; title: string }[]; maalValg: string; onMaalValg: (v: string) => void;
  titel: string; begrundelse: string; onTitel: (v: string) => void; onBegrundelse: (v: string) => void;
  sender: boolean; laast: boolean; onSend: () => void;
}) {
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); onSend(); }} data-skridt-form={noegle}>
      {aktive.length > 0 && (
        <HbField label="Mod målet" htmlFor={`skridt-maal-${noegle}`} help="Valgfrit — «Uden mål» lander som skridt uden mål.">
          <select id={`skridt-maal-${noegle}`} value={maalValg} onChange={(e) => onMaalValg(e.target.value)} className={hbControlClasses} data-maalvaelger>
            {aktive.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            <option value="uden">Uden mål</option>
          </select>
        </HbField>
      )}
      <HbField label="Skridtet" htmlFor={`skridt-titel-${noegle}`} help="Hvad skal medlemmet gøre? Højst 200 tegn.">
        <HbInput id={`skridt-titel-${noegle}`} value={titel} maxLength={200} onChange={(e) => onTitel(e.target.value)} autoFocus />
      </HbField>
      <HbField label="Hvorfor" htmlFor={`skridt-hvorfor-${noegle}`} help="Valgfri.">
        <HbTextarea id={`skridt-hvorfor-${noegle}`} value={begrundelse} rows={2} onChange={(e) => onBegrundelse(e.target.value)} />
      </HbField>
      <div className="flex items-center gap-2">
        <HbButton type="submit" className="h-8 px-3 text-xs" disabled={!titel.trim() || laast}>{sender ? "Sender…" : "Foreslå skridtet"}</HbButton>
      </div>
    </form>
  );
}

/** Skridtene under et mål i planens rækkefølge: aktive (◻), ventende (?),
    gjorte (✓), ikke gjort/droppet (–). dismissed/expired vises ikke — de var
    aldrig skridt. Dommen (grupperingen) er planen.ts'; her kun tegn og ord. */
function skridtLinjer(s: MaalIPlanen["skridt"]): { id: string; tegn: string; titel: string; ord: string | null; klasse: string; eget: boolean }[] {
  const frist = (d: string | null) => (d ? `frist ${formatDato(d)}` : null);
  // «medlemmets eget» (skridt-tilfoej, 17/9): mærket på skridt med source_type 'manual' — dommen er planen.ts' (erMedlemmetsEget).
  return [
    ...s.aktive.map((k) => ({ id: k.id, tegn: "◻", titel: k.title, ord: frist(k.due_date), klasse: "text-hb-ink", eget: erMedlemmetsEget(k) })),
    ...s.venter.map((k) => ({ id: k.id, tegn: "?", titel: k.title, ord: "venter på svar", klasse: "text-hb-ink-soft", eget: erMedlemmetsEget(k) })),
    ...s.gjorte.map((k) => ({ id: k.id, tegn: "✓", titel: k.title, ord: "gjort", klasse: "text-hb-ink-soft", eget: erMedlemmetsEget(k) })),
    ...s.andre
      .filter((k) => k.status === "not_done" || k.status === "dropped")
      .map((k) => ({ id: k.id, tegn: "–", titel: k.title, ord: k.status === "not_done" ? "ikke gjort" : "droppet", klasse: "text-hb-ink-soft", eget: erMedlemmetsEget(k) })),
  ];
}

function MaalLinje({
  x, arbejder, gennemgang, visAlle, onVisAlle, onParker, onNaaet, samtaleId, foreslaaAaben, onForeslaaAabn, form,
}: {
  x: MaalIPlanen; arbejder: string | null; gennemgang: boolean;
  /** «Vis alle N skridt» er klikket for dette mål. */
  visAlle: boolean; onVisAlle: () => void;
  onParker: () => void; onNaaet: () => void;
  samtaleId: string | null; foreslaaAaben: boolean; onForeslaaAabn: () => void;
  /** Formularen når den står under dette mål (SkridtForm) — ellers null. */
  form: ReactNode;
}) {
  const bevaegelse = udenBevaegelseTekst(x.dageUdenBevaegelse);
  const s = x.skridt;
  const linjer = skridtLinjer(s);
  const viste = visAlle ? linjer : linjer.slice(0, SKRIDT_VIST);
  const skjulte = linjer.length - viste.length;
  return (
    <li className="py-3 text-sm" data-maal-id={x.maal.id} data-maal-fremdrift={x.fremdrift}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 basis-64 break-words text-[15px] leading-snug text-hb-ink">{x.maal.title}</span>
        {x.dom.forfalden ? (
          <span className="shrink-0 text-xs font-medium text-hb-rust">Fristen var {formatDato(x.maal.deadline)}</span>
        ) : (
          <span className="shrink-0 text-xs text-hb-ink-soft">{x.maal.deadline ? formatDato(x.maal.deadline) : "Ingen frist"}</span>
        )}
      </div>
      <div className="mt-1 h-1 rounded-full bg-hb-sage/60">
        <span className="block h-1 rounded-full bg-hb-evergreen" style={{ width: `${x.fremdrift}%` }} aria-hidden />
      </div>
      <p className="mt-1 text-xs text-hb-ink-soft">
        {fremdriftTekst(x)}
        {bevaegelse && <span className="text-hb-rust"> · {bevaegelse}</span>}
        {s.venter.length > 0 && <span> · {s.venter.length} {s.venter.length === 1 ? "skridt venter" : "skridt venter"} på svar</span>}
      </p>
      {/* Skridtene ÅBNE (PR 1, Jonas valg 4): op til SKRIDT_VIST, resten «Vis alle».
          Hele titler — break-words, aldrig truncate. */}
      {linjer.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" data-skridt-viste={viste.length} data-skridt-alle={linjer.length}>
          {viste.map((l) => (
            <li key={l.id} className={`flex items-baseline gap-2 ${l.klasse}`} data-skridt-id={l.id} data-skridt-eget={l.eget ? "1" : "0"}>
              <span aria-hidden className="w-4 shrink-0 text-center">{l.tegn}</span>
              <span className="min-w-0 break-words">
                {l.titel}
                {l.ord && <span className="text-hb-ink-soft"> · {l.ord}</span>}
                {l.eget && <span className="text-hb-ink-soft"> · {MEDLEMMETS_EGET_TEKST}</span>}
              </span>
            </li>
          ))}
          {skjulte > 0 && (
            <li>
              <button type="button" onClick={onVisAlle} className="text-xs text-hb-evergreen underline-offset-4 hover:underline" data-vis-alle-skridt>
                Vis alle {linjer.length} skridt
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {x.handlinger.kanParkere && (
          <button type="button" disabled={arbejder !== null} onClick={onParker} className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50">{arbejder === x.maal.id ? "Gemmer…" : "Parkér"}</button>
        )}
        {x.handlinger.kanMarkereNaaet && (
          <button type="button" disabled={arbejder !== null} onClick={onNaaet} className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50">{gennemgang ? "Markér som nået" : "Nået"}</button>
        )}
        {/* Foreslå skridt (fase 3): lukket under gennemgangen (planens dom) og uden samtale. */}
        {x.handlinger.kanForeslaaSkridt && (
          <button
            type="button"
            disabled={arbejder !== null || !samtaleId}
            onClick={onForeslaaAabn}
            title={samtaleId ? "Foreslå et skridt mod målet — medlemmet svarer på forsiden" : "Ingen samtale med virksomheden endnu — forslaget skrives i chatten"}
            className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
            data-foreslaa-skridt={x.maal.id}
          >
            {foreslaaAaben ? "Fortryd" : "Foreslå skridt"}
          </button>
        )}
      </div>
      {foreslaaAaben && samtaleId && form}
    </li>
  );
}
