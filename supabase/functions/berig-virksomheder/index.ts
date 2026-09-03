// Engangs-berigelse af eksisterende virksomheder (3/9 2026) — DATARETTELSE,
// ikke ny funktionalitet. Udfylder TOMME felter på aktive virksomheder:
// adresse, branche og label fra CVR-registret; contact_email fra
// virksomhedens ejer. Overskriver aldrig noget nogen har skrevet — med én
// undtagelse: en REGISTERKODE i industry_code (rene cifre) erstattes af
// motorens oversættelse, når motoren rammer. Reglen er den samme som ved
// oprettelsen (#556, #560); planen regnes i _shared/berigelse.ts (ren,
// testet), og opslaget genbruger hentCvrData og udledBranchekode.
//
// SAMME FORM SOM indgangs-paamindelser-cron: HTTP-indgang, Bucket B
// (authenticateServiceRole bag verify_jwt = true), og TØRKØRSEL SOM
// STANDARD — uden body findes kandidaterne og rapporteres, men intet
// skrives. Kun et eksplicit { "dry_run": false } skriver.
//
// CVRAPI'S KVOTE (målt 3/9 i cvrapi.dk/documentation): «Du har 50 gratis
// opslag om dagen» — derover svarer den QUOTA_EXCEEDED. Og User-Agent med
// firma- og projektnavn er et krav (INVALID_UA); husets UA i hentCvrData
// har virket i prod. Konsekvens:
//   - TØRKØRSLEN KALDER IKKE CVRAPI. Målt 3/9 kræver 27 virksomheder et
//     opslag; en tørkørsel med opslag + en rigtig kørsel = 54 > 50, og
//     den rigtige kørsel ville løbe tør midt i listen. Tørkørslen viser i
//     stedet, pr. virksomhed og pr. felt, hvad der ER tomt, hvad der kan
//     udledes UDEN opslag (branche fra raw_cvr_data, mail fra medlemmet),
//     og hvad der «kræver CVR-opslag» — og tæller hvor mange opslag den
//     rigtige kørsel vil bruge.
//   - Den rigtige kørsel slår kun op hvor det nytter (felterDerKraeverCvr),
//     holder PAUSE_MS mellem opslag, og standser ved MAKS_OPSLAG (45) af
//     hensyn til kvoten — resten rapporteres som «dagskvote-værn», og
//     næste kørsel tager dem. Kvoten er pr. dag; kør ikke to gange samme dag.
//
// IDEMPOTENT: planen regnes af rækkens nuværende værdier og skriver kun
// felter der var tomme. En gentagelse rammer nul rækker (og bruger nul
// opslag, fordi der ikke længere er noget at udfylde).
//
// KALD (SQL editoren, samme vej som cronen):
//   SELECT net.http_post(
//     url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/berig-virksomheder',
//     headers := jsonb_build_object(
//       'Content-Type', 'application/json',
//       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
//     ),
//     body := '{}'::jsonb              -- tørkørsel; '{"dry_run": false}' skriver
//   ) AS request_id;
//   -- svaret: SELECT status_code, content::text FROM net._http_response WHERE id = <request_id>;

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { hentCvrData } from "../_shared/virksomhedsOprettelse.ts";
import {
  BERIGELSES_FELTER,
  beregnBerigelse,
  felterDerKraeverCvr,
  harCvr,
  type BerigelsesFelt,
  type BerigelsesVirksomhed,
  type MedlemsEmail,
} from "../_shared/berigelse.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Pause mellem cvrapi-opslag. Ingen dokumenteret grænse pr. sekund — så vi er varsomme. */
const PAUSE_MS = 500;
/** Loft pr. kørsel, under kvoten på 50/dag, så der er plads til et par manuelle opslag samme dag. */
const MAKS_OPSLAG = 45;

interface VirksomhedsRapport {
  id: string;
  navn: string;
  cvr: string | null;
  /** Felter der blev sat (tørkørsel: ville blive sat). */
  sat: Partial<Record<BerigelsesFelt, string>>;
  /** Tomme felter der ikke kunne udfyldes, med grund. */
  sprunget_over: { felt: BerigelsesFelt; grund: string }[];
  fejl?: string;
}

interface BerigelsesRapport {
  ok: boolean;
  dry_run: boolean;
  virksomheder_i_alt: number;
  virksomheder_aendret: number;
  sat_pr_felt: Record<BerigelsesFelt, number>;
  opslag: {
    /** Rigtig kørsel: brugte cvrapi-opslag. */
    brugt: number;
    /** Tørkørsel: så mange opslag ville den rigtige kørsel bruge. */
    ville_bruges: number;
    maks: number;
    /** Opslag der gav intet svar (ukendt CVR, netværk, eller kvote — se loggen). */
    uden_svar: number;
    /** Sprunget over fordi MAKS_OPSLAG var nået. */
    sprunget_over_kvote: number;
  };
  /** Kun virksomheder hvor noget blev sat eller sprunget over. */
  virksomheder: VirksomhedsRapport[];
  /** Navngivet, så de kan tages i hånden bagefter. */
  ikke_kunne_hjaelpes: {
    uden_cvr: string[];
    uden_db25: string[];
    motor_rammer_ikke: { navn: string; kode: string }[];
    uden_medlem_til_email: { navn: string; grund: string }[];
    cvr_uden_svar: string[];
  };
  error?: string;
}

function tomRapport(dryRun: boolean): BerigelsesRapport {
  return {
    ok: true,
    dry_run: dryRun,
    virksomheder_i_alt: 0,
    virksomheder_aendret: 0,
    sat_pr_felt: { address: 0, postal_code: 0, city: 0, industry_code: 0, industry_label: 0, contact_email: 0 },
    opslag: { brugt: 0, ville_bruges: 0, maks: MAKS_OPSLAG, uden_svar: 0, sprunget_over_kvote: 0 },
    virksomheder: [],
    ikke_kunne_hjaelpes: { uden_cvr: [], uden_db25: [], motor_rammer_ikke: [], uden_medlem_til_email: [], cvr_uden_svar: [] },
  };
}

const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Virksomhedens medlem til contact_email (besluttet 3/9): ejeren
 * (company_members.role = 'owner'). Ét medlem = det medlem. Flere uden en
 * ejer = spring over og notér. Mailen fra profiles.email, ellers auth.
 */
async function findMedlemsEmail(supabase: SupabaseClient, companyId: string): Promise<MedlemsEmail> {
  const { data: medlemmer, error } = await supabase
    .from("company_members")
    .select("user_id, role, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`company_members-opslag fejlede: ${error.message}`);
  const liste = (medlemmer ?? []) as { user_id: string; role: string; created_at: string }[];
  if (liste.length === 0) return { email: null, grund: "ingen_medlemmer" };

  let valgt: { user_id: string } | null = null;
  if (liste.length === 1) valgt = liste[0];
  else {
    const ejere = liste.filter((m) => m.role === "owner");
    if (ejere.length >= 1) valgt = ejere[0];
    else return { email: null, grund: "flere_medlemmer_ingen_ejer" };
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", valgt.user_id)
    .maybeSingle();
  let email = (profil?.email ?? "").trim();
  if (!email) {
    const { data: userData } = await supabase.auth.admin.getUserById(valgt.user_id);
    email = (userData?.user?.email ?? "").trim();
  }
  return email ? { email } : { email: null, grund: "medlem_uden_mail" };
}

async function koerBerigelse(supabase: SupabaseClient, dryRun: boolean): Promise<BerigelsesRapport> {
  const rapport = tomRapport(dryRun);

  const { data: raekker, error } = await supabase
    .from("companies")
    .select("id, name, cvr_number, address, postal_code, city, industry_code, industry_label, contact_email, application_context")
    .eq("status", "active")
    .order("name");
  if (error) {
    console.error("[berig-virksomheder] companies-opslag fejlede:", error.message);
    return { ...rapport, ok: false, error: error.message };
  }
  const virksomheder = (raekker ?? []).map((r: Record<string, unknown>): BerigelsesVirksomhed => {
    const ctx = (r.application_context ?? null) as { raw_cvr_data?: { industry_code?: string | number | null } | null } | null;
    const raw = ctx?.raw_cvr_data?.industry_code;
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      cvr_number: (r.cvr_number as string | null) ?? null,
      address: (r.address as string | null) ?? null,
      postal_code: (r.postal_code as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      industry_code: (r.industry_code as string | null) ?? null,
      industry_label: (r.industry_label as string | null) ?? null,
      contact_email: (r.contact_email as string | null) ?? null,
      raw_industry_code: raw === null || raw === undefined ? null : String(raw),
    };
  });
  rapport.virksomheder_i_alt = virksomheder.length;

  for (const v of virksomheder) {
    const linje: VirksomhedsRapport = { id: v.id, navn: v.name, cvr: v.cvr_number, sat: {}, sprunget_over: [] };
    try {
      // 1. CVR-opslag — kun hvor det nytter, aldrig i tørkørsel (kvoten).
      const kraever = felterDerKraeverCvr(v);
      let cvrSvar: Awaited<ReturnType<typeof hentCvrData>> = null;
      if (kraever.length > 0 && harCvr(v)) {
        if (dryRun) {
          rapport.opslag.ville_bruges++;
        } else if (rapport.opslag.brugt >= MAKS_OPSLAG) {
          rapport.opslag.sprunget_over_kvote++;
          for (const felt of kraever) linje.sprunget_over.push({ felt, grund: "dagskvote-værn: MAKS_OPSLAG nået — kør igen i morgen" });
        } else {
          if (rapport.opslag.brugt > 0) await sov(PAUSE_MS);
          rapport.opslag.brugt++;
          cvrSvar = await hentCvrData(v.cvr_number!.trim());
          if (!cvrSvar) {
            rapport.opslag.uden_svar++;
            rapport.ikke_kunne_hjaelpes.cvr_uden_svar.push(v.name);
          }
        }
      }

      // 2. Medlemmets mail — kun når feltet er tomt (DB-læsning, også i tørkørsel).
      const medlem = (v.contact_email ?? "").trim() ? null : await findMedlemsEmail(supabase, v.id);

      // 3. Planen (ren). Ved kvote-værn er cvrSvar null → felterne står som
      //    «kræver CVR-opslag», hvilket er sandt; vi lader den grund stå
      //    ovenfor og fjerner dubletten.
      const plan = beregnBerigelse(v, cvrSvar, medlem);
      const kvoteFelter = new Set(linje.sprunget_over.map((s) => s.felt));
      for (const s of plan.sprunget_over) if (!kvoteFelter.has(s.felt)) linje.sprunget_over.push(s);
      linje.sat = plan.opdatering;

      // 4. Bogfør «kan ikke hjælpes», navngivet.
      for (const s of plan.sprunget_over) {
        if (s.felt === "industry_code") {
          if (s.grund.startsWith("motoren rammer ikke")) {
            const kode = (s.grund.match(/DB25-koden (\d+)/) ?? [])[1] ?? "?";
            rapport.ikke_kunne_hjaelpes.motor_rammer_ikke.push({ navn: v.name, kode });
          } else if (!s.grund.includes("kræver CVR-opslag")) {
            rapport.ikke_kunne_hjaelpes.uden_db25.push(v.name);
          }
        }
        if (s.felt === "contact_email") rapport.ikke_kunne_hjaelpes.uden_medlem_til_email.push({ navn: v.name, grund: s.grund });
      }
      if (!harCvr(v) && (kraever.length > 0 || plan.sprunget_over.some((s) => s.felt !== "contact_email"))) {
        rapport.ikke_kunne_hjaelpes.uden_cvr.push(v.name);
      }

      // 5. Skriv — kun rigtig kørsel, kun de felter planen satte.
      const felter = Object.keys(plan.opdatering) as BerigelsesFelt[];
      if (felter.length > 0) {
        if (!dryRun) {
          const { error: skrivErr } = await supabase.from("companies").update(plan.opdatering).eq("id", v.id);
          if (skrivErr) throw new Error(`skrivning fejlede: ${skrivErr.message}`);
        }
        rapport.virksomheder_aendret++;
        for (const f of felter) rapport.sat_pr_felt[f]++;
        console.log(`[berig-virksomheder] ${dryRun ? "TØRKØRSEL ville sætte" : "satte"} ${felter.join(", ")} på ${v.name} (${v.id})`);
      }
    } catch (err) {
      linje.fejl = err instanceof Error ? err.message : String(err);
      console.error(`[berig-virksomheder] fejl for ${v.name} (${v.id}):`, linje.fejl);
    }
    if (Object.keys(linje.sat).length > 0 || linje.sprunget_over.length > 0 || linje.fejl) {
      rapport.virksomheder.push(linje);
    }
  }

  // Dedup af navnelister (samme virksomhed kan ramme flere grunde).
  const unik = (a: string[]) => Array.from(new Set(a));
  rapport.ikke_kunne_hjaelpes.uden_cvr = unik(rapport.ikke_kunne_hjaelpes.uden_cvr);
  rapport.ikke_kunne_hjaelpes.uden_db25 = unik(rapport.ikke_kunne_hjaelpes.uden_db25);
  rapport.ikke_kunne_hjaelpes.cvr_uden_svar = unik(rapport.ikke_kunne_hjaelpes.cvr_uden_svar);
  for (const f of BERIGELSES_FELTER) if (!(f in rapport.sat_pr_felt)) rapport.sat_pr_felt[f] = 0;
  return rapport;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TØRKØRSEL default — præcis som indgangs-paamindelser-cron: kun et
  // eksplicit { "dry_run": false } skriver.
  let dryRun = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) dryRun = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rapport = await koerBerigelse(supabase, dryRun);
  console.log("[berig-virksomheder] Summary:", JSON.stringify({ ...rapport, virksomheder: rapport.virksomheder.length }));

  return new Response(JSON.stringify(rapport), {
    status: rapport.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
