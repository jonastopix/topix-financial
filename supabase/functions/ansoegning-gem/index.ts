// Ansøgningsformularens gemme-vej: opret, hent, gem undervejs, indsend.
//
// KALDEREN HAR INGEN SESSION — en håndværker på en telefon om aftenen,
// uden konto og uden login. Legitimationen er ansøgningstokenet (uuid,
// 122 bits), verificeret af verifyAnsoegningstoken (_shared/
// ansoegningToken.ts) mod public.hent_ansoegning_til_gem, som kun svarer
// når ansøgningen findes og ikke er indsendt. Samme klasse som
// opret-indgangs-checkout/verifyBetalingstoken: prædikatet FØR enhver
// anden service-role-handling. verify_jwt = false i config.toml af samme
// grund som opret-indgangs-checkout (ingen JWT at verificere).
//
// DEN ENE VEJ UDEN TOKEN er «opret» — den skaber rækken og udleverer
// tokenet. Den er begrænset: honningfelt (et skjult felt en bot udfylder),
// højst OPRET_PR_IP_PR_TIME oprettelser pr. dagshash af IP'en og højst
// OPRET_PR_TIME_I_ALT i alt pr. time. IP'en gemmes ALDRIG rå: sha256(ip +
// dagens dato), så hashen skifter hver dag og kun bruges til at tælle.
//
// DOMMENE ER DELTE: validerDel/validerAlle/afgoerFremdrift fra
// _shared/ansoegningSkema.ts — byte-ens spejl af src/lib/ansoegning/
// skema.ts. Et svar der slap igennem på telefonen afvises aldrig her, og
// et svar der afvises her, ville også være afvist på telefonen.
//
// EFTER INDSENDELSE er tokenet dødt her (verifyAnsoegningstoken svarer null
// når indsendt_at er sat). Det der sker med en indsendt ansøgning er A's
// motor (udkast-ansoegning-motor): registrerIndsendelse kaldes i SAMME
// proces lige efter update'en (indgangsBetalingsmail-mønstret) og skriver
// anbefalingen + rådgiverens klokke. Fejler den, er ansøgningen stadig
// indsendt — det logges, og svaret er stadig ok.
//
// ÉN ÅBEN ANSØGNING PR. MAIL: A's partielle unikke indeks
// ansoegninger_aaben_email_uidx afviser en anden indsendt, åben ansøgning
// på samme mail med 23505 → 409 «du har allerede en ansøgning hos os».

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { brugbarMail, paabegyndt } from "../_shared/klaviyoHaendelser.ts";
import { sendHvisMail } from "../_shared/klaviyoAfsendelse.ts";
import { verifyAnsoegningstoken } from "../_shared/ansoegningToken.ts";
import { KONTAKT_ADRESSE } from "../_shared/indgangsMail.ts";
import { planlaegKladde, registrerIndsendelse } from "../_shared/ansoegningMotor.ts";
import {
  annoncesporAf,
  harAnnoncespor,
  type Annoncespor,
  afgoerFremdrift,
  type AnsoegningsSvar,
  KILDER,
  TOMME_SVAR,
  validerAlle,
  validerDel,
} from "../_shared/ansoegningSkema.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const HANDLINGER = ["opret", "hent", "gem", "indsend"] as const;

/**
 * DE ENESTE felter, body'en må bære — på tværs af de fire handlinger (21/9,
 * BAGLOG → STRIKS). Målt i src/lib/ansoegning/api.ts: opret sender kilde,
 * kilde_raa, annoncespor, svar, firma; hent token; gem token, svar,
 * cvr_bekraeftet, virksomhedsnavn; indsend token, svar. Kildeværnet
 * ansoegningGemKendteFelter.guard holder listen op mod api.ts — et nyt felt
 * i klienten uden plads her afvises med 400, og værnet går rødt først.
 */
const KENDTE_FELTER = ["handling", "token", "kilde", "kilde_raa", "annoncespor", "svar", "firma", "cvr_bekraeftet", "virksomhedsnavn"] as const;
type Handling = (typeof HANDLINGER)[number];

/**
 * Oprettelser pr. IP-dagshash pr. time. JONAS 18/9 (flow-gennemgangen §8): 30, ikke 5 —
 * mobilnet (CGNAT) og kontor-wifi deler én offentlig IP mellem mange, og et webinarhold
 * ansøger på én aften. Honningfeltet er botværnet; loftet er kun mod en bølge.
 */
const OPRET_PR_IP_PR_TIME = 30;
/**
 * Oprettelser i alt pr. time — et loft mod en bølge, ikke en forventning. 60 → 300 (18/9):
 * en webinaraften giver 15 samtidige ansøgere, og hver kan starte flere kladder (telefon +
 * laptop, en genindlæsning uden token, et nyt vindue) — 15 × 4 = 60 alene fra ét hold, og et
 * webinar med 100 deltagere kan give 300 påbegyndte kladder i timen. 300 er 20 × det forventede
 * og stadig et loft: en bot der rammer det, har passeret honningfeltet og IP-loftet (30) fra
 * mindst ti forskellige net. Loftet er ikke en kvote — det er alarmen i bunden.
 */
const OPRET_PR_TIME_I_ALT = 300;
const RAA_MAKS = 120;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256(ip + ":" + YYYY-MM-DD) — skifter dagligt, gemmes i stedet for IP'en. */
async function ipDagshash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ukendt";
  const dag = new Date().toISOString().slice(0, 10);
  return await sha256Hex(`${ip}:${dag}`);
}

async function antalSidsteTime(adminClient: SupabaseClient, ipHash: string | null): Promise<number> {
  const siden = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let q = adminClient.from("ansoegninger").select("id", { count: "exact", head: true }).gte("created_at", siden);
  if (ipHash) q = q.eq("ip_hash", ipHash);
  const { count, error } = await q;
  if (error) {
    console.error("[ansoegning-gem] tælling fejlede:", error);
    return Number.MAX_SAFE_INTEGER; // fail-closed: kan vi ikke tælle, opretter vi ikke
  }
  return count ?? 0;
}

/** Rækkens svar-kolonner → AnsoegningsSvar (kun de tolv felter). */
function svarAf(raekke: Record<string, unknown>): AnsoegningsSvar {
  const ud: Record<string, unknown> = { ...TOMME_SVAR };
  for (const k of Object.keys(TOMME_SVAR)) ud[k] = raekke[k] ?? null;
  return ud as unknown as AnsoegningsSvar;
}

/** Annoncesporet på rækken — kaster aldrig. Tomt spor = ingen update. */
async function gemAnnoncespor(admin: SupabaseClient, id: string, spor: Annoncespor): Promise<void> {
  if (!harAnnoncespor(spor)) return;
  const { error } = await admin.from("ansoegninger").update(spor).eq("id", id);
  if (error) console.error(`[ansoegning-gem] annoncesporet kunne ikke gemmes på ${id}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Kun POST" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const handling = body?.handling as Handling | undefined;
    if (!handling || !HANDLINGER.includes(handling)) return jsonResponse({ error: "Ukendt handling" }, 400);
    // En body, man ikke forstår, må aldrig blive til en stille standardkørsel
    // (_shared/kendteFelter.ts). Før tokenet: det er formen, der afvises, ikke rækken.
    const ukendte = ukendteFelter(body, KENDTE_FELTER);
    if (ukendte.length > 0) {
      const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
      console.error(`[ansoegning-gem] ${besked}`);
      return jsonResponse({ error: besked }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── OPRET: den ene vej uden token ──────────────────────────────────
    if (handling === "opret") {
      // Honningfeltet: et menneske ser det ikke, en bot udfylder det. Svar
      // som om alt gik godt, så botten ikke lærer noget.
      if (typeof body?.firma === "string" && body.firma.trim() !== "") {
        console.warn("[ansoegning-gem] honningfelt udfyldt — intet oprettet");
        return jsonResponse({ token: crypto.randomUUID(), fremdrift: afgoerFremdrift(TOMME_SVAR) });
      }

      // 429-teksten giver en udvej (Jonas 18/9): det er sjældent ansøgerens egen skyld.
      const FOR_MANGE = `Der er mange, der ansøger fra dit netværk lige nu. Prøv igen om lidt — eller skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig i gang.`;
      const ipHash = await ipDagshash(req);
      if ((await antalSidsteTime(adminClient, ipHash)) >= OPRET_PR_IP_PR_TIME) {
        return jsonResponse({ error: FOR_MANGE }, 429);
      }
      if ((await antalSidsteTime(adminClient, null)) >= OPRET_PR_TIME_I_ALT) {
        console.error("[ansoegning-gem] timeloftet for oprettelser er nået");
        return jsonResponse({ error: FOR_MANGE }, 429);
      }

      const kildeRaa = typeof body?.kilde === "string" ? body.kilde : "";
      const kilde = (KILDER as readonly string[]).includes(kildeRaa) ? kildeRaa : "andet";
      const kildeSpor = typeof body?.kilde_raa === "string" ? body.kilde_raa.trim().slice(0, RAA_MAKS) || null : null;

      const del = validerDel(body?.svar ?? {});
      if (!del.ok) return jsonResponse({ error: "Ugyldigt svar", fejl: del.fejl }, 400);

      const { data, error } = await adminClient
        .from("ansoegninger")
        .insert({ kilde, kilde_raa: kildeSpor, ip_hash: ipHash, ...del.svar })
        .select("id, token, email, updated_at, indsendt_at")
        .single();
      if (error || !data?.token) {
        console.error("[ansoegning-gem] insert fejlede:", error);
        return jsonResponse({ error: "Kunne ikke gemme — prøv igen." }, 500);
      }
      // ANNONCESPORET (udkast 2, 21/9): en EGEN update efter insert'en, fail-soft —
      // mangler kolonnerne (migration 20260921120000 ikke kørt), eller fejler
      // skrivningen, koster det ansøgeren intet. Sporet er en oplysning, ikke rækken.
      await gemAnnoncespor(adminClient, data.id, annoncesporAf(body?.annoncespor));

      // KLAVIYO: «Ansoegning paabegyndt» sendes IKKE her. Målt 19/9 kl. 22.22:
      // «opret» sker ved FØRSTE gem, og første skærm er CVR — mailen kommer
      // først på skærm 6. `data.email` er null her, og hændelsen kunne derfor
      // aldrig sendes. Den er flyttet til «gem»-grenen, hvor mailen kommer ind.

      // Kladde-påmindelsen er trappen «kladde» i den fælles rykkerkø (Jonas D6, 18/9):
      // én række dag 2 fra sidste gem, kun når der er en e-mail — ingen cron for sig.
      await planlaegKladde(adminClient, data, new Date());
      return jsonResponse({ token: data.token, fremdrift: afgoerFremdrift({ ...TOMME_SVAR, ...del.svar }) });
    }

    // ── Alt andet: tokenet FØRST ───────────────────────────────────────
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) return jsonResponse({ error: "Manglende token" }, 400);
    const ansoegning = await verifyAnsoegningstoken(token, adminClient);
    if (!ansoegning) return jsonResponse({ error: "Ukendt eller lukket ansøgning" }, 404);

    if (handling === "hent") {
      return jsonResponse({
        svar: ansoegning.svar,
        cvr_opslag: ansoegning.cvr_opslag,
        cvr_bekraeftet: ansoegning.cvr_bekraeftet,
        fremdrift: afgoerFremdrift(ansoegning.svar),
      });
    }

    if (handling === "gem") {
      const del = validerDel(body?.svar ?? {});
      if (!del.ok) return jsonResponse({ error: "Ugyldigt svar", fejl: del.fejl }, 400);

      const opdatering: Record<string, unknown> = { ...del.svar };
      // Et nyt CVR gør det gamle opslag og bekræftelsen ugyldig.
      if ("cvr" in del.svar && del.svar.cvr !== ansoegning.svar.cvr) {
        opdatering.cvr_opslag = null;
        opdatering.cvr_bekraeftet = false;
      }
      // «Rigtigt? Ja» — kun når der ER et opslag, og det gælder det CVR der står.
      if (body?.cvr_bekraeftet === true) {
        const opslagCvr = ansoegning.cvr_opslag?.cvr;
        const gaeldende = ("cvr" in del.svar ? del.svar.cvr : ansoegning.svar.cvr) ?? null;
        if (ansoegning.cvr_opslag && gaeldende && opslagCvr === gaeldende) opdatering.cvr_bekraeftet = true;
      }
      // Fallback (Jonas 18/9, flow-gennemgangen §9): kunne CVR ikke slås op, taster ansøgeren selv
      // navnet. Det gemmes som et opslag med kilde «ansoeger» — kun når der ikke allerede ligger et
      // rigtigt opslag (DataCVR) på det CVR. Aldrig bekræftet; motoren siger «CVR ikke slået op».
      const navnRaa = typeof body?.virksomhedsnavn === "string" ? body.virksomhedsnavn.replace(/\s+/g, " ").trim() : "";
      if (navnRaa) {
        if (navnRaa.length < 2 || navnRaa.length > 120) return jsonResponse({ error: "Skriv virksomhedens navn (2–120 tegn)." }, 400);
        const gaeldende = ("cvr" in del.svar ? del.svar.cvr : ansoegning.svar.cvr) ?? null;
        const eksisterende = opdatering.cvr_opslag === null ? null : ansoegning.cvr_opslag;
        const erRigtigtOpslag = eksisterende && eksisterende.kilde !== "ansoeger" && eksisterende.cvr === gaeldende;
        if (!erRigtigtOpslag) {
          opdatering.cvr_opslag = { cvr: gaeldende, navn: navnRaa, kilde: "ansoeger", stiftet_aar: null, antal_ansatte: null, selskabsform: null, branche: null, status: null, hjemmeside: null };
          opdatering.cvr_bekraeftet = false;
        }
      }

      const { data: gemt, error } = await adminClient
        .from("ansoegninger")
        .update(opdatering)
        .eq("id", ansoegning.id)
        .select("id, email, kilde, updated_at, indsendt_at")
        .single();
      if (error || !gemt) {
        console.error("[ansoegning-gem] update fejlede:", error);
        return jsonResponse({ error: "Kunne ikke gemme — prøv igen." }, 500);
      }

      // KLAVIYO (flyttet hertil 19/9 kl. 22.30): «Ansoegning paabegyndt».
      //
      // HER, og ikke ved «opret»: Klaviyos profil findes på MAILEN, og mailen
      // indtastes på skærm 6 («kontakt»). Ved første gem er der kun et
      // CVR-nummer, og hændelsen kunne aldrig sendes — målt i prod med nul
      // rækker i sporet.
      //
      // Betingelsen er, at mailen netop er KOMMET IND i dette gem. Det sker
      // én gang pr. ansøgning i praksis. Retter ansøgeren sin mail senere,
      // sendes den igen — og det er harmløst: `unique_id` er ansøgningens id,
      // og Klaviyo registrerer kun den første pr. (profil, metric, id).
      if ("email" in del.svar && brugbarMail(gemt?.email) !== null) {
        await sendHvisMail(adminClient, paabegyndt(ansoegning.id, gemt.email as string, (gemt.kilde as string | null) ?? null));
      }
      // Nyt gem = nyt anker: forrige kladde-række annulleres, en ny planlægges (regel 1 + Jonas D6).
      await planlaegKladde(adminClient, gemt, new Date());
      const samlet = { ...ansoegning.svar, ...del.svar } as AnsoegningsSvar;
      return jsonResponse({ ok: true, fremdrift: afgoerFremdrift(samlet) });
    }

    // handling === "indsend"
    const del = validerDel(body?.svar ?? {});
    if (!del.ok) return jsonResponse({ error: "Ugyldigt svar", fejl: del.fejl }, 400);
    const samlet = { ...ansoegning.svar, ...del.svar } as AnsoegningsSvar;
    const alle = validerAlle(samlet);
    if (!alle.ok) return jsonResponse({ error: "Ansøgningen er ikke færdig", fejl: alle.fejl }, 400);

    const { error } = await adminClient
      .from("ansoegninger")
      .update({ ...alle.svar, indsendt_at: new Date().toISOString() })
      .eq("id", ansoegning.id)
      .is("indsendt_at", null);
    if (error) {
      if (error.code === "23505") {
        console.warn(`[ansoegning-gem] ansøgning ${ansoegning.id}: mailen har allerede en åben ansøgning — ikke indsendt`);
        return jsonResponse({ error: "Du har allerede en ansøgning hos os — vi vender tilbage til dig.", allerede: true }, 409);
      }
      console.error("[ansoegning-gem] indsend fejlede:", error);
      return jsonResponse({ error: "Kunne ikke sende — prøv igen." }, 500);
    }
    console.log(`[ansoegning-gem] ansøgning ${ansoegning.id} indsendt`);
    // A's motor (samme proces, ikke HTTP — indgangsBetalingsmail-mønstret):
    // anbefalingen skrives, rådgiveren får en klokke. Idempotent; fejler den,
    // er ansøgningen stadig indsendt — det logges, og svaret er stadig ok.
    const motor = await registrerIndsendelse(adminClient, ansoegning.id, new Date());
    if (motor.ok === false) console.error(`[ansoegning-gem] registrerIndsendelse fejlede for ${ansoegning.id}: ${motor.grund}`);
    // Kvitteringens vej (straks / reserve i køen) gives til skærmen, så den siger det rigtige (Jonas 18/9: «med det samme»).
    return jsonResponse({ ok: true, indsendt: true, kvittering: motor.ok ? motor.kvittering : "reserve" });
  } catch (err) {
    console.error("[ansoegning-gem] uventet fejl:", err);
    return jsonResponse({ error: "Uventet fejl" }, 500);
  }
});
