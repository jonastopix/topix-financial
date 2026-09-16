// maal-skriv — RÅDGIVERENS skrivevej til virksomhedens mål («Én plan»,
// fase 2, 16/9-2026). Jonas 16/9: «Nej. Vi er rådgivere, men det er
// medlemmernes virksomheder.» — medlemmet EJER sine mål og skriver dem selv
// fra klienten (RLS uændret: egne/virksomhedens INSERT/UPDATE/DELETE).
// Rådgiveren har kun SELECT på milestones og går derfor herigennem: opret,
// rediger, aktivér, parkér, nået — og SLET (medlemmet kan slette, så
// rådgiveren kan det samme; valget står i README/rapporten). AI'en skriver
// aldrig mål (create_milestone og update_milestone_progress er ude).
// «Højst tre aktive» gælder ALLE skrivere: motoren (_shared/maal.ts
// kanOpretteMaal) dømmer her FØR skrivningen, og databasen dømmer igen
// (triggeren milestones_hoejst_tre_aktive, 20260917150000), så to samtidige
// kald ikke kan give fire.
//
// Handlinger (body.handling): opret · rediger · aktiver · parker · naaet · slet.
//   opret   { companyId, titel, kategori?, frist?, beskrivelse?, maaltal?, enhed?, status? }
//           status 'parked' er tilladt (løftestang → parkeret mål); default 'active'.
//   rediger { companyId, maalId, titel?, kategori?, frist?, beskrivelse?, maaltal?, enhed? }
//   aktiver { companyId, maalId }  — parkeret/nået → active (kræver plads)
//   parker  { companyId, maalId }  — active → parked
//   naaet   { companyId, maalId }  — active → completed (completed_at sættes af triggeren)
//   slet    { companyId, maalId }  — rækken slettes (skridt under målet får maal_id = NULL af FK'en, historik bliver stående)
//
// Bucket A-form fra foreslaa-opgave:
//   1. CORS  2. authenticateUser FØRST  3. validér input  4. virksomheden
//   med KALDERENS klient (RLS)  5. rolletjek has_role advisor  6. FØRST
//   derefter service-role: motoren dømmer «højst tre», skriv, svar.
//
// Svarene (ordret, til fladen):
//   200 { ok: true, maal: { id, status, … } }
//   400 { error: "Ugyldig handling — forventer opret, rediger, aktiver, parker, naaet eller slet" } · "Ugyldig companyId" · "Ugyldig maalId" · "Titlen mangler" · "Titlen er for lang (højst 120 tegn)" · "Ugyldig frist — forventer YYYY-MM-DD" · "Ugyldigt måltal"
//   403 { error: "Kun rådgivere kan skrive mål her — medlemmet skriver sine egne mål fra Milestones" }
//   404 { error: "Virksomheden findes ikke, eller du har ikke adgang til den" } · { error: "Målet findes ikke hos denne virksomhed" }
//   409 { error: "Virksomheden har allerede 3 aktive mål — parkér eller markér et som nået først", antalAktive } · { error: "Målet er allerede aktivt" } · { error: "Kun et aktivt mål kan parkeres" } · { error: "Kun et aktivt mål kan markeres som nået" } · { error: "Virksomheden har intet medlem — målet ville ingen ejer have" }
//   500 { error: "Intern fejl" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { kanOpretteMaal, MAX_AKTIVE_MAAL } from "../_shared/maal.ts";

const HANDLINGER = ["opret", "rediger", "aktiver", "parker", "naaet", "slet"] as const;
type Handling = (typeof HANDLINGER)[number];
const TITEL_MAX = 120;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Felter = { title?: string; category?: string; deadline?: string | null; description?: string | null; target_value?: number | null; unit?: string | null };

/** Felterne ved opret/rediger — valideret; null = «tøm feltet», undefined = «rør ikke». */
function laesFelter(b: Record<string, unknown>, kraevTitel: boolean): { ok: true; felter: Felter } | { ok: false; fejl: string } {
  const felter: Felter = {};
  if (b.titel !== undefined || kraevTitel) {
    const t = typeof b.titel === "string" ? b.titel.trim() : "";
    if (!t) return { ok: false, fejl: "Titlen mangler" };
    if (t.length > TITEL_MAX) return { ok: false, fejl: `Titlen er for lang (højst ${TITEL_MAX} tegn)` };
    felter.title = t;
  }
  if (b.kategori !== undefined) felter.category = typeof b.kategori === "string" && b.kategori.trim() ? b.kategori.trim() : "other";
  if (b.frist !== undefined) {
    if (b.frist === null || b.frist === "") felter.deadline = null;
    else if (typeof b.frist !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.frist) || Number.isNaN(new Date(b.frist).getTime())) return { ok: false, fejl: "Ugyldig frist — forventer YYYY-MM-DD" };
    else felter.deadline = b.frist;
  }
  if (b.beskrivelse !== undefined) felter.description = typeof b.beskrivelse === "string" && b.beskrivelse.trim() ? b.beskrivelse.trim() : null;
  if (b.maaltal !== undefined) {
    if (b.maaltal === null || b.maaltal === "") felter.target_value = null;
    else if (typeof b.maaltal !== "number" || !Number.isFinite(b.maaltal)) return { ok: false, fejl: "Ugyldigt måltal" };
    else felter.target_value = b.maaltal;
  }
  if (b.enhed !== undefined) felter.unit = typeof b.enhed === "string" && b.enhed.trim() ? b.enhed.trim() : null;
  return { ok: true, felter };
}

const MAAL_KOLONNER = "id, company_id, user_id, title, description, category, deadline, progress, status, source, target_value, current_value, unit, progress_updated_at, completed_at, created_at, updated_at";

Deno.serve(async (req) => {
  // ── 1. CORS-preflight ──
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 2. Auth (Bucket A) — MUST precede any service-role construction ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 3. Parse + validér input ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ugyldig JSON-body" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const handling = b.handling;
  if (typeof handling !== "string" || !(HANDLINGER as readonly string[]).includes(handling)) {
    return jsonResponse({ error: "Ugyldig handling — forventer opret, rediger, aktiver, parker, naaet eller slet" }, 400);
  }
  const companyId = b.companyId;
  if (typeof companyId !== "string" || companyId.trim() === "") {
    return jsonResponse({ error: "Ugyldig companyId" }, 400);
  }
  const maalId = b.maalId;
  if (handling !== "opret" && (typeof maalId !== "string" || maalId.trim() === "")) {
    return jsonResponse({ error: "Ugyldig maalId" }, 400);
  }
  const felterDom = handling === "opret" || handling === "rediger" ? laesFelter(b, handling === "opret") : { ok: true as const, felter: {} };
  if (!felterDom.ok) return jsonResponse({ error: felterDom.fejl }, 400);
  const opretStatus = handling === "opret" && b.status === "parked" ? "parked" : "active";

  // ── 4. Virksomheden, med KALDERENS klient (RLS gater adgangen) ──
  const { data: virksomhed, error: virkErr } = await callerClient
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (virkErr) {
    console.error("[maal-skriv] virksomheds-opslag fejlede:", virkErr);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
  if (!virksomhed) {
    return jsonResponse({ error: "Virksomheden findes ikke, eller du har ikke adgang til den" }, 404);
  }

  // ── 5. Rolletjek: kun rådgivere skriver her (admin arver via has_role).
  //       Medlemmet skriver sine egne mål direkte fra klienten (RLS). ──
  const { data: erRaadgiver, error: rolleErr } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (rolleErr || !erRaadgiver) {
    return jsonResponse({ error: "Kun rådgivere kan skrive mål her — medlemmet skriver sine egne mål fra Milestones" }, 403);
  }

  // ── 6. Service-role — konstrueres FØRST nu ──
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // «Højst tre aktive» — motoren dømmer på det tal databasen har NU; triggeren
  // dømmer igen ved skrivningen (to samtidige kald kan ikke give fire).
  const taelAktive = async (): Promise<number> => {
    const { count, error } = await adminClient
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active");
    if (error) throw new Error(`optælling fejlede: ${error.message}`);
    return count ?? 0;
  };
  const forFuld = (antal: number) =>
    jsonResponse({ error: `Virksomheden har allerede ${MAX_AKTIVE_MAAL} aktive mål — parkér eller markér et som nået først`, antalAktive: antal }, 409);

  try {
    if (handling === "opret") {
      if (opretStatus === "active") {
        const antal = await taelAktive();
        if (!kanOpretteMaal(antal)) return forFuld(antal);
      }
      // Ejeren (user_id NOT NULL på milestones): virksomhedens første medlem —
      // samme dom som foreslaa-opgave og run-company-agent.
      const { data: medlem, error: medlemErr } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (medlemErr) throw new Error(`medlems-opslag fejlede: ${medlemErr.message}`);
      if (!medlem) return jsonResponse({ error: "Virksomheden har intet medlem — målet ville ingen ejer have" }, 409);
      const f = felterDom.felter;
      const { data: maal, error: insErr } = await adminClient
        .from("milestones")
        .insert({
          company_id: companyId,
          user_id: medlem.user_id,
          title: f.title!,
          category: f.category ?? "other",
          deadline: f.deadline ?? null,
          description: f.description ?? null,
          target_value: f.target_value ?? null,
          unit: f.unit ?? null,
          progress: 0,
          status: opretStatus,
          // Kilden: hvem satte målet. 'advisor' er nyt (source har ingen CHECK).
          source: "advisor",
        })
        .select(MAAL_KOLONNER)
        .single();
      if (insErr) throw new Error(`skrivning fejlede: ${insErr.message}`);
      return jsonResponse({ ok: true, maal });
    }

    // De fem andre handlinger: målet skal findes hos SAMME virksomhed.
    const { data: eksisterende, error: findErr } = await adminClient
      .from("milestones")
      .select("id, status")
      .eq("id", maalId as string)
      .eq("company_id", companyId)
      .maybeSingle();
    if (findErr) throw new Error(`mål-opslag fejlede: ${findErr.message}`);
    if (!eksisterende) return jsonResponse({ error: "Målet findes ikke hos denne virksomhed" }, 404);
    const status = (eksisterende as { status: string }).status;

    if (handling === "slet") {
      // Sletning: skridt under målet beholder deres rækker (FK ON DELETE SET
      // NULL, fase 1) — historikken bliver stående uden mål.
      const { data: slettet, error: delErr } = await adminClient
        .from("milestones")
        .delete()
        .eq("id", maalId as string)
        .eq("company_id", companyId)
        .select("id");
      if (delErr) throw new Error(`sletning fejlede: ${delErr.message}`);
      if (!slettet || slettet.length === 0) return jsonResponse({ error: "Målet findes ikke hos denne virksomhed" }, 404);
      return jsonResponse({ ok: true, slettet: maalId });
    }

    let patch: Record<string, unknown>;
    if (handling === "rediger") {
      patch = { ...felterDom.felter };
      if (Object.keys(patch).length === 0) return jsonResponse({ error: "Intet at ændre" }, 400);
    } else if (handling === "aktiver") {
      if (status === "active") return jsonResponse({ error: "Målet er allerede aktivt" }, 409);
      const antal = await taelAktive();
      if (!kanOpretteMaal(antal)) return forFuld(antal);
      patch = { status: "active" };
    } else if (handling === "parker") {
      if (status !== "active") return jsonResponse({ error: "Kun et aktivt mål kan parkeres" }, 409);
      patch = { status: "parked" };
    } else {
      if (status !== "active") return jsonResponse({ error: "Kun et aktivt mål kan markeres som nået" }, 409);
      // completed_at sættes af triggeren milestone_completed_at (fase 1).
      patch = { status: "completed" };
    }

    const { data: maal, error: updErr } = await adminClient
      .from("milestones")
      .update(patch)
      .eq("id", maalId as string)
      .eq("company_id", companyId)
      .eq("status", status) // optimistisk lås: kun hvis målet stadig står som dømt
      .select(MAAL_KOLONNER)
      .maybeSingle();
    if (updErr) {
      // Triggeren milestones_hoejst_tre_aktive svarer med sin egen tekst (P0001) ved den fjerde aktive.
      if (/hoejst_tre|højst tre|aktive mål/i.test(updErr.message)) {
        return jsonResponse({ error: `Virksomheden har allerede ${MAX_AKTIVE_MAAL} aktive mål — parkér eller markér et som nået først`, antalAktive: MAX_AKTIVE_MAAL }, 409);
      }
      throw new Error(`skrivning fejlede: ${updErr.message}`);
    }
    if (!maal) return jsonResponse({ error: "Målet blev ændret i mellemtiden — genindlæs og prøv igen" }, 409);
    return jsonResponse({ ok: true, maal });
  } catch (err) {
    console.error(`[maal-skriv] ${handling} fejlede:`, err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Intern fejl" }, 500);
  }
});
