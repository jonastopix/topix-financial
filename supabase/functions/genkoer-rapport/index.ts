// genkoer-rapport — genkør en STRANDET rapport fra filen i storage (10/9-2026)
//
// HVORFOR: recon-genkoersel.md. extract-financial-data læser aldrig filen fra
// storage; den får payloaden fra browseren. Derfor blev seks filer liggende
// som «Kunne ikke behandles» efter at deres domme var rettet (#783, #784).
// Denne funktion er RØRFØRINGEN: hent bytes fra financial-documents (samme
// kald som hash-sammenligningen i extract-financial-data :576-586), lav
// præcis det browseren ville have sendt, og kald extract-financial-data
// over HTTP med rådgiverens eget JWT og det EKSISTERENDE reportId — så
// resten af kæden (fingerprint, skabeloner, canonical, dublet-gate,
// persistens, notifikation) kører uændret og skriver på den samme række.
//
// AFGJORT: ny funktion, ikke en gren i extract-financial-data. Den funktion
// er 1.800 linjer, Bucket A for MEDLEMMET (RLS-adgang) og kaldes fra fire
// steder; en gren «kroppen mangler indhold → hent selv» ville give medlemmets
// kaldere en ny vej ind og blande to auth-modeller. Her: rådgiver-gate,
// tørkørsel som standard, og kæden røres ikke.
//
// ALDRIG en ny række: kun UPDATE via extract-financial-datas egen persistens
// på reportId. Bemærk dublet-gaten dér (:1416-1431): findes en ANDEN
// behandlet rapport med samme periodetekst, hårdsletter den rækken og svarer
// { duplicate: true } — det rapporteres her som «raekke_slettet_af_dubletgaten».
//
// PDF afvises med ord (dommen i _shared/genkoersel.ts): pdfjs findes kun i
// browseren. Tom body = tørkørsel over de strandede fra de sidste 90 dage.
// Kun { "dry_run": false, "report_ids": [...] } kører — højst ti pr. kald.
//
// TVUNGET (17/9-2026, udkast-genkoersel-tvunget — saldobalance-rettelsen): 36 committede
// saldobalancer (Fjeldgaardshop 15, Brick Works 21) har forkerte tal fra skabelonen og
// kan ikke genkøres af dommen (har_facts / ikke_strandet). { "overskriv_facts": true }
// sammen med NAVNGIVNE report_ids lader rådgiveren tvinge dem igennem: dommen får
// tvunget = true, kæden læser filen igen på samme reportId, og derefter kaldes
// commit_report_facts med RÅDGIVERENS eget JWT (callerClient — RPC'en kræver auth.uid()
// og rådgiverrollen, og skriver på samme source_report_id → UPDATE af metrics), så facts
// er rettet i samme tur. Svaret bærer FØR/EFTER pr. rapport (revenue, gross_profit,
// facility_costs, other_costs, other_operating_income, ebitda, ebit, ebt, committed_at)
// og et BEVIS på fire tal: ebt_foer → ebt_efter (facts) og udaekket_foer → udaekket_efter
// (rapportens quality_signals.udaekket — kontrolsummen, 17/9), så genkørslen kan bevises
// uden SQL bagefter. Tørkørsel med overskriv_facts viser FØR-tallene og dommen uden at
// røre noget. Aldrig uden report_ids: tørkørslen over 90 dage kan ikke tvinges.
//
// TO VEJE (17/9, vindue A's «Genkør flere rapporter» i browseren): XLSX/CSV genkøres HER på
// serveren (filen hentes fra storage); PDF kan ikke (pdfjs findes kun i browseren) og
// genkøres i A's flade, som kalder extract-financial-data med det SAMME reportId (aldrig
// overwrite) og godkender med det SAMME commit_report_facts. Dommen her afviser PDF som før.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import * as XLSX from "npm:xlsx@0.18.5";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import {
  afgoerGenkoersel,
  base64AfBytes,
  csvTekstAfBytes,
  regnearkTekst,
  udaekketAf,
  type GenkoerselDom,
  type GenkoerselRaekke,
} from "../_shared/genkoersel.ts";

const LOG = "[genkoer-rapport]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PR_KALD = 10;
const KANDIDAT_DAGE = 90;

const RAEKKE_FELTER =
  "id, company_id, file_name, file_path, status, validation_status, deleted_at, manual_override_status, report_period, report_type, uploaded_at, quality_signals";

interface RapportRaekke {
  id: string;
  company_id: string;
  file_name: string | null;
  file_path: string | null;
  status: string | null;
  validation_status: string | null;
  deleted_at: string | null;
  manual_override_status: string | null;
  report_period: string | null;
  report_type: string | null;
  uploaded_at: string;
  quality_signals: Record<string, unknown> | null;
}

/** Det udsnit af facts svaret viser FØR og EFTER (tvunget): tallene rettelsen handler om. */
const FACTS_FELTER = "source_report_id, period_key, data_basis, committed_at, metrics";
const FOER_EFTER_NOEGLER = ["revenue", "gross_profit", "facility_costs", "other_costs", "other_operating_income", "ebitda", "ebit", "ebt"] as const;

interface FactsRaekke {
  source_report_id: string | null;
  period_key: string | null;
  data_basis: string | null;
  committed_at: string | null;
  metrics: Record<string, unknown> | null;
}

interface FactsUdsnit {
  period_key: string | null;
  data_basis: string | null;
  committed_at: string | null;
  tal: Record<string, number | null>;
}

function factsUdsnit(f: FactsRaekke): FactsUdsnit {
  const tal: Record<string, number | null> = {};
  for (const k of FOER_EFTER_NOEGLER) {
    const v = f.metrics?.[k];
    tal[k] = typeof v === "number" ? v : v == null ? null : Number(v);
  }
  return { period_key: f.period_key, data_basis: f.data_basis, committed_at: f.committed_at, tal };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function needsManualEntry(qs: Record<string, unknown> | null): boolean {
  const v = qs?.needs_manual_entry;
  return v === true || v === "true";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) FØR alt andet, derefter advisor-gaten — en
  //       rådgiverhandling, ikke medlemmets (samme form som saet-indgangs-prisniveau) ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient, authHeader } = auth;

  const { data: callerIsAdvisor, error: callerRoleError } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (callerRoleError || !callerIsAdvisor) {
    console.warn(`${LOG} caller not advisor`, { callerId });
    return jsonResponse({ error: "Forbidden — advisor role required" }, 403);
  }

  try {
    // ── 2. Input: tørkørsel medmindre { dry_run: false }; report_ids valgfrit i tørkørsel, krævet ved kørsel ──
    const body = await req.json().catch(() => null);
    const dryRun = body?.dry_run !== false;
    const overskrivFacts = body?.overskriv_facts === true;
    const rawIds: unknown = body?.report_ids ?? (typeof body?.report_id === "string" ? [body.report_id] : undefined);
    let reportIds: string[] | null = null;
    if (rawIds !== undefined) {
      if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some((x) => typeof x !== "string" || !UUID_RE.test(x))) {
        return jsonResponse({ error: "report_ids skal være en ikke-tom liste af uuid'er" }, 400);
      }
      reportIds = Array.from(new Set(rawIds as string[]));
    }
    if (!dryRun && !reportIds) {
      return jsonResponse({ error: "Kørsel kræver report_ids — tom body er en tørkørsel over de strandede fra de sidste 90 dage" }, 400);
    }
    if (!dryRun && reportIds && reportIds.length > MAX_PR_KALD) {
      return jsonResponse({ error: `Højst ${MAX_PR_KALD} rapporter pr. kald (${reportIds.length} sendt)` }, 400);
    }
    if (overskrivFacts && !reportIds) {
      return jsonResponse({ error: "overskriv_facts kræver navngivne report_ids — den brede tørkørsel kan ikke tvinges" }, 400);
    }

    // ── 3. Service-role-klient: rækkerne, facts og virksomhedsnavne ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let raekker: RapportRaekke[];
    let kilde: "report_ids" | "kandidater_90_dage";
    if (reportIds) {
      kilde = "report_ids";
      const { data, error } = await admin.from("financial_reports").select(RAEKKE_FELTER).in("id", reportIds);
      if (error) throw new Error(`financial_reports-opslag fejlede: ${error.message}`);
      raekker = (data ?? []) as RapportRaekke[];
    } else {
      kilde = "kandidater_90_dage";
      const siden = new Date(Date.now() - KANDIDAT_DAGE * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from("financial_reports")
        .select(RAEKKE_FELTER)
        .gte("uploaded_at", siden)
        .is("deleted_at", null)
        .in("status", ["error", "processed"])
        .not("report_type", "in", "(aarsrapport,annual_report)")
        .not("file_name", "like", "\\_annual\\_baseline\\_sentinel\\_%")
        .order("uploaded_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(`kandidat-opslag fejlede: ${error.message}`);
      raekker = (data ?? []) as RapportRaekke[];
    }

    const ids = raekker.map((r) => r.id);
    const medFacts = new Set<string>();
    // FØR-tallene (kun læst når der tvinges — ellers er facts et eksistenstjek som før).
    const factsFoer = new Map<string, FactsUdsnit>();
    if (ids.length > 0) {
      // data_basis-undtagelse: eksistenstjek, ingen beregning — FINDES der en facts-række fra rapporten (målt eller estimeret), må den ikke genkøres
      const { data: facts, error: factsErr } = await admin
        .from("financial_report_facts")
        .select(FACTS_FELTER)
        .in("source_report_id", ids);
      if (factsErr) throw new Error(`facts-opslag fejlede: ${factsErr.message}`);
      for (const f of (facts ?? []) as FactsRaekke[]) {
        if (!f.source_report_id) continue;
        medFacts.add(f.source_report_id);
        if (overskrivFacts) factsFoer.set(f.source_report_id, factsUdsnit(f));
      }
    }

    const companyIds = Array.from(new Set(raekker.map((r) => r.company_id)));
    const navne = new Map<string, string>();
    if (companyIds.length > 0) {
      const { data: comps, error: compErr } = await admin.from("companies").select("id, name").in("id", companyIds);
      if (compErr) throw new Error(`companies-opslag fejlede: ${compErr.message}`);
      for (const c of comps ?? []) navne.set(c.id as string, (c.name as string) ?? "");
    }

    // ── 4. Dommen pr. række + dublet-advarsel (kæden hårdsletter ved !overwrite) ──
    const domme = raekker.map((r) => {
      const input: GenkoerselRaekke = {
        id: r.id,
        file_name: r.file_name,
        file_path: r.file_path,
        status: r.status,
        validation_status: r.validation_status,
        deleted_at: r.deleted_at,
        manual_override_status: r.manual_override_status,
        needs_manual_entry: needsManualEntry(r.quality_signals),
        har_facts: medFacts.has(r.id),
        tvunget: overskrivFacts,
      };
      return { raekke: r, dom: afgoerGenkoersel(input) };
    });

    const advarsler = new Map<string, string>();
    for (const { raekke, dom } of domme) {
      if (!dom.kan || !raekke.report_period) continue;
      const { data: andre } = await admin
        .from("financial_reports")
        .select("id")
        .eq("company_id", raekke.company_id)
        .eq("report_period", raekke.report_period)
        .eq("status", "processed")
        .is("deleted_at", null)
        .neq("id", raekke.id)
        .limit(1);
      if (andre && andre.length > 0) {
        advarsler.set(
          raekke.id,
          `En anden behandlet rapport for «${raekke.report_period}» findes (${andre[0].id}). Kædens dublet-gate vil HÅRDSLETTE denne række hvis genkørslen lander på samme periode.`,
        );
      }
    }

    const beskriv = ({ raekke, dom }: { raekke: RapportRaekke; dom: GenkoerselDom }) => ({
      report_id: raekke.id,
      virksomhed: navne.get(raekke.company_id) ?? null,
      file_name: raekke.file_name,
      uploaded_at: raekke.uploaded_at,
      status: raekke.status,
      validation_status: raekke.validation_status,
      report_period: raekke.report_period,
      filtype: dom.filtype,
      grund: dom.grund,
      tekst: dom.tekst,
      ...(advarsler.has(raekke.id) ? { advarsel: advarsler.get(raekke.id) } : {}),
      ...(overskrivFacts ? { tvunget: true, foer: factsFoer.get(raekke.id) ?? null, udaekket_foer: udaekketAf(raekke.quality_signals) } : {}),
    });

    const villeGenkoere = domme.filter((d) => d.dom.kan).map(beskriv);
    const afvist = domme.filter((d) => !d.dom.kan).map(beskriv);
    const ukendteIds = reportIds ? reportIds.filter((id) => !raekker.some((r) => r.id === id)) : [];

    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        tvunget: overskrivFacts,
        kilde,
        ville_genkoere: villeGenkoere,
        afvist,
        ukendte_report_ids: ukendteIds,
        naeste_skridt: villeGenkoere.length > 0
          ? `Kør med { "dry_run": false, "report_ids": [...] } — højst ${MAX_PR_KALD} ad gangen.`
          : "Intet at genkøre.",
      });
    }

    // ── 5. Kørsel: hent filen, byg browserens payload, kald kæden på det eksisterende reportId ──
    const koert: Array<Record<string, unknown>> = [];
    for (const { raekke, dom } of domme) {
      if (!dom.kan) continue;
      const start = Date.now();
      try {
        // Rørføringen fra extract-financial-data :583-586 — samme bucket, samme sti.
        const { data: fileData, error: dlError } = await admin.storage
          .from("financial-documents")
          .download(raekke.file_path!);
        if (dlError || !fileData) {
          koert.push({ report_id: raekke.id, udfald: "fil_kunne_ikke_hentes", fejl: dlError?.message ?? "tomt svar" });
          continue;
        }
        const bytes = new Uint8Array(await fileData.arrayBuffer());

        // Præcis det browseren sender (reportUploadEngine.ts): CSV = file.text();
        // XLSX = base64 + «=== Sheet: … ===»-tekst; ingen pdf-felter.
        const payload: Record<string, unknown> = {
          reportId: raekke.id,
          fileName: raekke.file_name,
          knownCompanyName: navne.get(raekke.company_id) || undefined,
        };
        if (dom.filtype === "csv") {
          payload.fileContent = csvTekstAfBytes(bytes);
        } else {
          const wb = XLSX.read(bytes, { type: "array" });
          payload.excelBase64 = base64AfBytes(bytes);
          payload.fileContent = regnearkTekst(
            wb.SheetNames.map((navn) => ({ navn, csv: XLSX.utils.sheet_to_csv(wb.Sheets[navn], { FS: "\t", RS: "\n" }) })),
          );
        }

        const res = await fetch(`${supabaseUrl}/functions/v1/extract-financial-data`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
          body: JSON.stringify(payload),
        });
        const svar = await res.json().catch(() => ({ error: "svaret var ikke JSON" }));

        // Sandheden er rækken, ikke svaret: læs den igen. Mangler den, tog dublet-gaten den.
        const { data: efter } = await admin
          .from("financial_reports")
          .select("id, status, validation_status, validation_errors, extraction_method, report_period, quality_signals, deleted_at")
          .eq("id", raekke.id)
          .maybeSingle();

        // TVUNGET: godkend igen i samme tur — med rådgiverens eget JWT (RPC'en kræver auth.uid() +
        // rolle; samme source_report_id → UPDATE af metrics, kollisionsvagten rammer ikke).
        let commit: { koert: boolean; ok: boolean; fejl: string | null } = { koert: false, ok: false, fejl: null };
        let factsEfter: FactsUdsnit | null = null;
        if (overskrivFacts && efter && efter.status === "processed") {
          const { error: commitErr } = await callerClient.rpc("commit_report_facts", { p_report_id: raekke.id });
          commit = { koert: true, ok: !commitErr, fejl: commitErr?.message ?? null };
          const { data: fe } = await admin.from("financial_report_facts").select(FACTS_FELTER).eq("source_report_id", raekke.id).maybeSingle();
          factsEfter = fe ? factsUdsnit(fe as FactsRaekke) : null;
        }

        koert.push({
          report_id: raekke.id,
          virksomhed: navne.get(raekke.company_id) ?? null,
          file_name: raekke.file_name,
          http_status: res.status,
          ms: Date.now() - start,
          udfald: !efter
            ? "raekke_slettet_af_dubletgaten"
            : efter.status === "processed" && efter.validation_status === "PASS"
              ? "behandlet_pass"
              : efter.status === "processed"
                ? "behandlet_fail_eller_manuel"
                : "fejlet",
          svar: {
            status: svar?.status ?? null,
            error: svar?.error ?? null,
            message: svar?.message ?? null,
            // Den fulde vej svarer med hele udtrækket — grunden står i validation.errors,
            // ikke i error/message (10/9: «Serveren gav ingen fejlgrund» var opsummeringens fejl).
            validation_errors: Array.isArray(svar?.validation?.errors) ? svar.validation.errors : null,
            duplicate: svar?.duplicate ?? null,
            existing_report_id: svar?.existing_report_id ?? null,
            needs_manual_entry: svar?.needs_manual_entry ?? null,
            reason: svar?.reason ?? null,
          },
          raekke_efter: efter
            ? {
                status: efter.status,
                validation_status: efter.validation_status,
                // Rækkens egen fejlgrund — det kortet viser som «Fejlede: …».
                validation_errors: Array.isArray(efter.validation_errors) ? efter.validation_errors : null,
                extraction_method: efter.extraction_method,
                report_period: efter.report_period,
                routing_branch: (efter.quality_signals as Record<string, unknown> | null)?.routing_branch ?? null,
                needs_manual_entry: needsManualEntry(efter.quality_signals as Record<string, unknown> | null),
              }
            : null,
          ...(overskrivFacts
            ? {
                tvunget: true,
                foer: factsFoer.get(raekke.id) ?? null,
                commit,
                efter: factsEfter,
                // Beviset: fire tal, ingen SQL bagefter. ebt fra facts (før: den vendte; efter: saldobalancens),
                // udækket fra rapportens quality_signals.udaekket (før: null hvis udtrukket før kontrolsummen).
                bevis: {
                  ebt_foer: factsFoer.get(raekke.id)?.tal.ebt ?? null,
                  ebt_efter: factsEfter?.tal.ebt ?? null,
                  udaekket_foer: udaekketAf(raekke.quality_signals),
                  udaekket_efter: udaekketAf(efter?.quality_signals ?? null),
                },
              }
            : {}),
        });
      } catch (e) {
        console.error(`${LOG} genkørsel af ${raekke.id} kastede:`, e);
        koert.push({ report_id: raekke.id, udfald: "kastede", fejl: e instanceof Error ? e.message : String(e) });
      }
    }

    return jsonResponse({ dry_run: false, tvunget: overskrivFacts, kilde, koert, afvist, ukendte_report_ids: ukendteIds });
  } catch (e) {
    console.error(`${LOG} fejl:`, e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Ukendt fejl" }, 500);
  }
});
