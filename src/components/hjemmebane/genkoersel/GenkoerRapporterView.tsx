/**
 * GenkoerRapporterView — «Genkør flere rapporter» for rådgivere (17/9-2026).
 *
 * Klikvejen: vælg virksomhed(er) → «Hent rapporter» → filtrér på skabeloner → sæt kryds ved dem
 * der skal med (højst HOLD_LOFT pr. kørsel) → «Kør de valgte» → læs pr. rapport: ebt før → efter,
 * udækket før → efter, validering → «Godkend» pr. rapport eller «Godkend alle der er PASS».
 * Dommene: lib/genkoerselBrowser.ts (rene, testede). Kørslen: lib/genkoerselBrowserKoersel.ts
 * (samme payload som uploadzonen, altid eksisterende reportId, aldrig overwrite).
 *
 * Manuelt rettede vises med mærket «Manuelt rettet» og springes over som standard; perioder ejet af
 * en anden rapport vises med mærket «Ejes af anden rapport» og springes over med grunden.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { cn } from "@/lib/utils";
import {
  afgoerMasseGenkoersel,
  HOLD_LOFT,
  koerselsRaekkefoelge,
  MASSE_TEKST,
  opsummer,
  periodeNoegleAf,
  SKABELON_GRUPPER,
  skabelonAf,
  talTekst,
  type MasseDom,
  type RapportTilMasse,
  type Resultat,
} from "@/lib/genkoerselBrowser";
import { godkend, koerHold } from "@/lib/genkoerselBrowserKoersel";
import { HbButton } from "../HbButton";
import { HbTag } from "../HbTag";
import { hbControlClasses } from "../admin/HbField";

/** JSON-stierne som ikke-literal streng (supabase-js' typeparser, TS2589 — se genkoerselBrowserKoersel). */
export const RAPPORT_SELECT: string =
  "id, company_id, file_name, file_path, status, validation_status, report_period, report_type, manual_override_status, manual_report_period_key, extraction_method, deleted_at, quality_signals, template_id:normalized_data->template_id, routing_template_id:raw_extracted_data->routing_trace->deterministic_template_id, metrics:normalized_data->metrics";

type FactsRaekke = { id: string; company_id: string; period_key: string; source_report_id: string | null; metrics: Record<string, number> | null };

async function hentRapporter(companyIds: string[], navne: ReadonlyMap<string, string>): Promise<RapportTilMasse[]> {
  const [rapRes, factsRes] = await Promise.all([
    supabase.from("financial_reports").select(RAPPORT_SELECT).in("company_id", companyIds).is("deleted_at", null).eq("status", "processed").order("report_period", { ascending: true }),
    // data_basis-undtagelse: eksistens- og ejerskabstjek (source_report_id / period_key), ingen beregning — FINDES der en facts-række, er rapporten godkendt, målt eller estimeret (samme undtagelse som genkoer-rapport).
    supabase.from("financial_report_facts").select("id, company_id, period_key, source_report_id, metrics").in("company_id", companyIds),
  ]);
  const raa = kraevRaekker(rapRes as { data: unknown[] | null; error: { message: string } | null }, "financial_reports") as Record<string, unknown>[];
  const facts = kraevRaekker(factsRes as { data: unknown[] | null; error: { message: string } | null }, "financial_report_facts") as FactsRaekke[];
  const factsAfRapport = new Map<string, FactsRaekke>();
  const factsAfPeriode = new Map<string, FactsRaekke>();
  for (const f of facts) {
    if (f.source_report_id) factsAfRapport.set(f.source_report_id, f);
    factsAfPeriode.set(`${f.company_id}|${f.period_key}`, f);
  }
  return raa.map((r) => {
    const id = String(r.id);
    const egen = factsAfRapport.get(id) ?? null;
    const delvis = {
      report_period: (r.report_period as string | null) ?? null,
      manual_override_status: (r.manual_override_status as string | null) ?? null,
      manual_report_period_key: (r.manual_report_period_key as string | null) ?? null,
      facts_period_key: egen?.period_key ?? null,
    };
    const noegle = periodeNoegleAf(delvis);
    const ejer = noegle ? factsAfPeriode.get(`${String(r.company_id)}|${noegle}`) : undefined;
    return {
      id,
      company_id: String(r.company_id),
      virksomhed: navne.get(String(r.company_id)) ?? "",
      file_name: (r.file_name as string | null) ?? null,
      file_path: (r.file_path as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      validation_status: (r.validation_status as string | null) ?? null,
      report_type: (r.report_type as string | null) ?? null,
      extraction_method: (r.extraction_method as string | null) ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
      template_id: typeof r.template_id === "string" ? r.template_id : null,
      routing_template_id: typeof r.routing_template_id === "string" ? r.routing_template_id : null,
      metrics: (r.metrics as Record<string, number | null> | null) ?? null,
      quality_signals: r.quality_signals ?? null,
      facts_ebt: typeof egen?.metrics?.ebt === "number" ? egen.metrics.ebt : null,
      periode_ejes_af: ejer && ejer.source_report_id && ejer.source_report_id !== id ? ejer.source_report_id : null,
      ...delvis,
    };
  });
}

const skabelonLabel = (skabelon: string): string => SKABELON_GRUPPER.find((g) => g.skabelon === skabelon)?.label ?? skabelon;

export const GenkoerRapporterView = () => {
  const queryClient = useQueryClient();
  const [valgteVirksomheder, setValgteVirksomheder] = useState<Set<string>>(new Set());
  const [soeg, setSoeg] = useState("");
  const [skabeloner, setSkabeloner] = useState<Set<string>>(new Set(SKABELON_GRUPPER.map((g) => g.skabelon)));
  const [medManuelle, setMedManuelle] = useState(false);
  const [rapporter, setRapporter] = useState<RapportTilMasse[] | null>(null);
  const [henter, setHenter] = useState(false);
  const [valgte, setValgte] = useState<Set<string>>(new Set());
  const [resultater, setResultater] = useState<Map<string, Resultat>>(new Map());
  const [koerer, setKoerer] = useState<{ index: number; antal: number; fil: string | null } | null>(null);
  const [godkender, setGodkender] = useState(false);
  const afbryd = useRef<AbortController | null>(null);

  const virksomheder = useQuery({
    queryKey: ["genkoer-virksomheder"],
    queryFn: async () => kraevRaekker(await supabase.from("companies").select("id, name").is("data_slettet_at", null).order("name"), "companies") as { id: string; name: string }[],
  });
  const navne = useMemo(() => new Map((virksomheder.data ?? []).map((v) => [v.id, v.name])), [virksomheder.data]);

  const domme = useMemo(() => {
    const m = new Map<string, MasseDom>();
    for (const r of rapporter ?? []) m.set(r.id, afgoerMasseGenkoersel(r, { skabeloner, medManuelle }));
    return m;
  }, [rapporter, skabeloner, medManuelle]);
  const sorteret = useMemo(() => koerselsRaekkefoelge(rapporter ?? []), [rapporter]);
  const kandidater = sorteret.filter((r) => domme.get(r.id)?.kan);
  const summen = opsummer([...resultater.values()]);

  const hent = async () => {
    if (valgteVirksomheder.size === 0) { toast.info("Vælg mindst én virksomhed."); return; }
    setHenter(true);
    setResultater(new Map());
    try {
      const rows = await hentRapporter([...valgteVirksomheder], navne);
      setRapporter(rows);
      setValgte(new Set());
    } catch (e) {
      toast.error("Rapporterne kunne ikke hentes", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setHenter(false);
    }
  };

  const vaelgNaesteHold = () => {
    const uden = kandidater.filter((r) => !resultater.has(r.id)).slice(0, HOLD_LOFT);
    setValgte(new Set(uden.map((r) => r.id)));
  };

  const koer = async () => {
    const hold = kandidater.filter((r) => valgte.has(r.id)).slice(0, HOLD_LOFT);
    if (hold.length === 0) { toast.info("Sæt kryds ved de rapporter der skal køres."); return; }
    afbryd.current = new AbortController();
    setKoerer({ index: 0, antal: hold.length, fil: hold[0]?.file_name ?? null });
    try {
      await koerHold(hold, navne, (res, i) => {
        setResultater((m) => new Map(m).set(res.report_id, res));
        setKoerer({ index: i + 1, antal: hold.length, fil: hold[i + 1]?.file_name ?? null });
      }, afbryd.current.signal);
    } finally {
      setKoerer(null);
      afbryd.current = null;
      queryClient.invalidateQueries({ queryKey: ["company-facts"] });
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
    }
  };

  const godkendEn = async (reportId: string) => {
    const fejl = await godkend(reportId);
    setResultater((m) => {
      const r = m.get(reportId);
      if (!r) return m;
      return new Map(m).set(reportId, { ...r, godkendt: fejl === null, godkend_fejl: fejl });
    });
    if (fejl) toast.error("Kunne ikke godkende", { description: fejl });
    queryClient.invalidateQueries({ queryKey: ["company-facts"] });
  };

  const godkendAllePass = async () => {
    const klar = [...resultater.values()].filter((r) => r.udfald === "genlaest" && !r.godkendt && r.godkendelse.automatisk);
    if (klar.length === 0) { toast.info("Ingen rapporter er PASS uden advarsler."); return; }
    setGodkender(true);
    try {
      for (const r of klar) await godkendEn(r.report_id);
      toast.success(`${klar.length} ${klar.length === 1 ? "rapport" : "rapporter"} godkendt`);
    } finally {
      setGodkender(false);
    }
  };

  const listeVirksomheder = (virksomheder.data ?? []).filter((v) => v.name.toLowerCase().includes(soeg.trim().toLowerCase()));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      <div className="pt-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Rådgiver</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Genkør rapporter</h1>
        <p className="mt-3 max-w-2xl text-sm text-hb-ink-soft">
          Filen læses igen fra lageret med samme rapport-id — ingen ny række, ingen dublet. Højst {HOLD_LOFT} ad gangen, én efter én med en pause imellem. Manuelt rettede rapporter og perioder der ejes af en anden rapport springes over. <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">Tilbage til virksomhederne</Link>
        </p>
      </div>

      {/* Virksomheder */}
      <div className="mt-6 rounded-hb border border-hb-line bg-hb-paper p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Virksomheder</p>
        <input className={cn(hbControlClasses, "mt-2 max-w-sm")} placeholder="Søg virksomhed…" value={soeg} onChange={(e) => setSoeg(e.target.value)} />
        <div className="mt-3 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
          {listeVirksomheder.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-center gap-2 text-sm text-hb-ink">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--hb-evergreen))]" checked={valgteVirksomheder.has(v.id)} onChange={(e) => setValgteVirksomheder((s) => { const n = new Set(s); if (e.target.checked) n.add(v.id); else n.delete(v.id); return n; })} />
              <span className="truncate">{v.name}</span>
            </label>
          ))}
          {virksomheder.isLoading && <p className="text-sm text-hb-ink-soft">Henter…</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <HbButton type="button" className="h-9 px-4 text-sm" onClick={() => void hent()} disabled={henter || koerer !== null}>{henter ? "Henter…" : "Hent rapporter"}</HbButton>
          <span className="text-xs text-hb-ink-soft">{valgteVirksomheder.size} valgt</span>
        </div>
      </div>

      {/* Skabeloner */}
      <div className="mt-4 rounded-hb border border-hb-line bg-hb-paper p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Kun disse skabeloner</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {SKABELON_GRUPPER.map((g) => (
            <label key={g.skabelon} className="flex cursor-pointer items-center gap-2 text-sm text-hb-ink">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--hb-evergreen))]" checked={skabeloner.has(g.skabelon)} onChange={(e) => setSkabeloner((s) => { const n = new Set(s); if (e.target.checked) n.add(g.skabelon); else n.delete(g.skabelon); return n; })} />
              <span>{g.label} <span className="text-hb-ink-soft">— {g.grund}</span></span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-hb-ink">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--hb-rust))]" checked={medManuelle} onChange={(e) => setMedManuelle(e.target.checked)} data-med-manuelle />
            <span>Tag manuelt rettede med <span className="text-hb-ink-soft">— kun efter Jonas' beslutning; rettelsen har stadig forrang i tallene</span></span>
          </label>
        </div>
      </div>

      {/* Listen */}
      {rapporter && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-hb-ink">{rapporter.length} rapporter · {kandidater.length} kan køres · {valgte.size} valgt</p>
            <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={vaelgNaesteHold} disabled={koerer !== null}>Vælg næste hold ({HOLD_LOFT})</HbButton>
            <HbButton type="button" className="h-9 px-4 text-sm" onClick={() => void koer()} disabled={koerer !== null || valgte.size === 0}>{koerer ? `Kører ${koerer.index} af ${koerer.antal}…` : "Kør de valgte"}</HbButton>
            {koerer && <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={() => afbryd.current?.abort()}>Afbryd efter denne</HbButton>}
            <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={() => void godkendAllePass()} disabled={godkender || koerer !== null || summen.klarTilAuto === 0}>Godkend alle der er PASS ({summen.klarTilAuto})</HbButton>
          </div>
          {koerer && <p className="mt-2 text-xs text-hb-ink-soft" data-fremdrift>{koerer.index} af {koerer.antal} færdige{koerer.fil ? ` — læser ${koerer.fil}` : ""}</p>}
          {resultater.size > 0 && <p className="mt-2 text-xs text-hb-ink-soft">{summen.genlaest} genlæst · {summen.fejlet} fejlet · {summen.afbrudt} afbrudt · {summen.godkendt} godkendt</p>}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.12em] text-hb-ink-soft">
                <tr><th className="py-2 pr-2"></th><th className="py-2 pr-3">Virksomhed</th><th className="py-2 pr-3">Periode</th><th className="py-2 pr-3">Skabelon</th><th className="py-2 pr-3">Tilstand</th><th className="py-2 pr-3">Resultat før → efter</th><th className="py-2 pr-3">Udækket før → efter</th><th className="py-2 pr-3">Validering</th><th className="py-2 pr-3">Godkendelse</th></tr>
              </thead>
              <tbody>
                {sorteret.map((r) => {
                  const dom = domme.get(r.id)!;
                  const res = resultater.get(r.id);
                  const manuel = r.manual_override_status === "applied";
                  return (
                    <tr key={r.id} className="border-t border-hb-line align-top" data-rapport={r.id} data-dom={dom.grund}>
                      <td className="py-2 pr-2">{dom.kan && <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--hb-evergreen))]" checked={valgte.has(r.id)} disabled={koerer !== null} onChange={(e) => setValgte((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />}</td>
                      <td className="py-2 pr-3 text-hb-ink">{r.virksomhed}<br /><span className="text-xs text-hb-ink-soft">{r.file_name}</span></td>
                      <td className="py-2 pr-3 whitespace-nowrap text-hb-ink">{periodeNoegleAf(r) ?? r.report_period ?? "—"}</td>
                      <td className="py-2 pr-3 text-hb-ink">{skabelonLabel(skabelonAf(r))}<br /><span className="text-xs text-hb-ink-soft">{dom.filtype}</span></td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {r.facts_period_key && <HbTag className="bg-hb-sage px-2 py-0.5 text-[11px] text-hb-ink">Godkendt</HbTag>}
                          {manuel && <HbTag className="border border-hb-rust/40 bg-hb-rust/5 px-2 py-0.5 text-[11px] text-hb-rust">Manuelt rettet</HbTag>}
                          {r.periode_ejes_af && <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">Ejes af anden rapport</HbTag>}
                        </div>
                        {!dom.kan && <p className="mt-1 max-w-xs text-xs text-hb-ink-soft">{dom.tekst}</p>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-hb-ink">{talTekst(res?.ebt_foer ?? (r.metrics?.ebt ?? null))} → {res ? talTekst(res.ebt_efter) : "…"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-hb-ink">{res ? `${talTekst(res.udaekket_foer)} → ${talTekst(res.udaekket_efter)}` : "…"}</td>
                      <td className="py-2 pr-3 text-hb-ink">{res ? (res.udfald === "genlaest" ? `${res.validering_foer ?? "—"} → ${res.validering_efter ?? "—"}` : res.udfald === "afbrudt" ? "Afbrudt" : `Fejlede: ${res.fejl ?? ""}`) : (r.validation_status ?? "—")}</td>
                      <td className="py-2 pr-3">
                        {res?.udfald === "genlaest" && (
                          res.godkendt ? <HbTag className="bg-hb-sage px-2 py-0.5 text-[11px] text-hb-ink">Godkendt</HbTag> : (
                            <div>
                              <p className="max-w-xs text-xs text-hb-ink-soft">{res.godkendelse.grund}</p>
                              {res.godkendelse.maa && <HbButton type="button" variant="secondary" className="mt-1 h-8 px-3 text-xs" onClick={() => void godkendEn(r.id)} disabled={godkender || koerer !== null}>Godkend</HbButton>}
                              {res.godkend_fejl && <p className="mt-1 text-xs text-hb-rust">{res.godkend_fejl}</p>}
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-hb-ink-soft">{MASSE_TEKST.manuel_anvendt}</p>
        </div>
      )}
    </div>
  );
};

export default GenkoerRapporterView;
