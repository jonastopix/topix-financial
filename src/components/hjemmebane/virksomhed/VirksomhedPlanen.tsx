import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fremdriftTekst, planenDom, udenBevaegelseTekst, type MaalIPlanen, type MaalRaekke, type SkridtRaekke } from "@/lib/hjemmebane/planen";
import { MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbField, HbInput } from "../admin/HbField";

/**
 * «Planen» på rådgiverens virksomhedsside (blok 6; kortet der før hed
 * «Milestones») — «Én plan pr. virksomhed», fase 2 (16/9-2026). Jonas:
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
 * «Foreslå skridt» pr. mål kommer i fase 3 (foreslaa-opgave med målvælger i
 * chatten) — her vises skridtene kun.
 */

type Handling = "opret" | "rediger" | "aktiver" | "parker" | "naaet";

async function kaldMaalSkriv(body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; fejl: string }> {
  const { data, error } = await supabase.functions.invoke("maal-skriv", { body });
  if (error) {
    // Fejl-body'en bærer husets tekst (409/404/400) — vis den, ikke «Edge Function returned a non-2xx status code».
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = (await ctx.json()) as { error?: string };
        if (b?.error) return { ok: false, fejl: b.error };
      } catch { /* falder til error.message */ }
    }
    return { ok: false, fejl: error.message };
  }
  const svar = data as { ok?: boolean; error?: string } | null;
  if (!svar?.ok) return { ok: false, fejl: svar?.error ?? "Målet blev ikke skrevet" };
  return { ok: true };
}

const formatDato = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
};

export function VirksomhedPlanen({
  companyId, maal, skridt, onOpdateret,
}: {
  companyId: string;
  maal: MaalRaekke[];
  skridt: SkridtRaekke[];
  onOpdateret: () => Promise<void>;
}) {
  const dom = planenDom(maal, skridt, new Date());
  const [arbejder, setArbejder] = useState<string | null>(null);
  const [opretAaben, setOpretAaben] = useState(false);
  const [titel, setTitel] = useState("");
  const [kategori, setKategori] = useState("");
  const [frist, setFrist] = useState("");

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
    <HbCard id="section-milestones" className="scroll-mt-24 p-5" data-planen-gennemgang={dom.gennemgang ? "1" : "0"}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Planen</p>
      <p className={dom.gennemgang ? "mt-3 text-sm font-medium text-hb-rust" : "mt-3 text-sm text-hb-ink"}>{dom.tekst}</p>
      {dom.gennemgang && (
        <p className="mt-1 text-xs text-hb-ink-soft">
          Målene er fra før planen (seneste fremdrift kan ligge måneder tilbage). Behold dem der stadig gælder — højst {MAX_AKTIVE_MAAL} — og parkér eller markér resten som nået. Intet parkeres af sig selv.
        </p>
      )}

      {dom.aktive.length > 0 && (
        <ul className="mt-3 divide-y divide-hb-line">
          {dom.aktive.map((x) => (
            <MaalLinje key={x.maal.id} x={x} arbejder={arbejder} gennemgang={dom.gennemgang} onParker={() => void skriv(x.maal.id, "parker", { maalId: x.maal.id })} onNaaet={() => void skriv(x.maal.id, "naaet", { maalId: x.maal.id })} />
          ))}
        </ul>
      )}

      {dom.parkerede.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-hb-ink-soft">Parkerede · {dom.parkerede.length}</summary>
          <ul className="mt-2 divide-y divide-hb-line">
            {dom.parkerede.map((x) => (
              <li key={x.maal.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-hb-ink">{x.maal.title}{x.maal.source === "handout" && <span className="text-hb-ink-soft"> · forslag fra handout</span>}</span>
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
                <span className="min-w-0 truncate text-hb-ink">{x.maal.title}{formatDato(x.maal.completed_at) && <span className="text-hb-ink-soft"> · nået {formatDato(x.maal.completed_at)}</span>}</span>
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
    </HbCard>
  );
}

function MaalLinje({ x, arbejder, gennemgang, onParker, onNaaet }: { x: MaalIPlanen; arbejder: string | null; gennemgang: boolean; onParker: () => void; onNaaet: () => void }) {
  const bevaegelse = udenBevaegelseTekst(x.dageUdenBevaegelse);
  const s = x.skridt;
  return (
    <li className="py-2 text-sm" data-maal-id={x.maal.id}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-hb-ink">{x.maal.title}</span>
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
      {(s.aktive.length > 0 || s.gjorte.length > 0 || s.venter.length > 0) && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-hb-ink-soft">Skridtene</summary>
          <ul className="mt-1 space-y-0.5 text-xs">
            {s.aktive.map((k) => <li key={k.id} className="text-hb-ink">◻ {k.title}{k.due_date ? <span className="text-hb-ink-soft"> · frist {formatDato(k.due_date)}</span> : null}</li>)}
            {s.venter.map((k) => <li key={k.id} className="text-hb-ink-soft">? {k.title} · venter på svar</li>)}
            {s.gjorte.map((k) => <li key={k.id} className="text-hb-ink-soft">✓ {k.title}</li>)}
          </ul>
        </details>
      )}
      <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
        {x.handlinger.kanParkere && (
          <button type="button" disabled={arbejder !== null} onClick={onParker} className="text-hb-ink-soft underline-offset-4 hover:underline disabled:opacity-50">{arbejder === x.maal.id ? "Gemmer…" : "Parkér"}</button>
        )}
        {x.handlinger.kanMarkereNaaet && (
          <button type="button" disabled={arbejder !== null} onClick={onNaaet} className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50">{gennemgang ? "Markér som nået" : "Nået"}</button>
        )}
      </div>
    </li>
  );
}
