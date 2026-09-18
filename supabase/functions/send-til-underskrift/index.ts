// send-til-underskrift — rådgiveren sender aftalegrundlaget til e-underskrift
// (UDKAST 18/9). Bucket A: authenticateUser + advisor-gate bag verify_jwt =
// true (config.toml). Body: { ansoegning_id } ELLER { company_id, prisniveau_oere? },
// plus erstat?.
//
// TO VEJE (D1, Jonas 18/9 «Ved underskrift»): virksomheden oprettes først når
// aftalen underskrives. Kommer aftalen fra en ANSØGNING (A's motor,
// _shared/ansoegningMotor.ts), findes der ingen virksomhed endnu — navn,
// CVR, kontakt og pris læses fra ansoegninger (pris = ansoegninger.pris_oere,
// som rådgiveren sætter senest ved «tilbud»), og trinnet skiftes med motorens
// udfoerOvergang({ art: "tilbud" }, via "raadgiver", aftaleUrl = /aftale?token=…)
// — så A's rykkere i aftalegrundlags-trappen linker til DENNE aftale. Står
// ansøgningen allerede på «aftalegrundlag_sendt» (gensendelse/erstatning),
// kaldes motoren ikke; kun aftale_url opdateres. Kommer aftalen fra en
// EKSISTERENDE virksomhed (fornyelse, genindtræden), er det som før:
// virksomhedssiden, prisen som parameter.
//
// FORM: saet-indgangs-prisniveau — authenticateUser FØRST, derefter has_role
// mod callerClient, og først derefter service-role-klienten.
//
// HVAD DER SKER, i rækkefølge:
//   1. Virksomheden slås op; uden contact_email kan intet sendes (422).
//   2. Findes der allerede en ÅBEN aftale (status 'sendt'), svares 409 —
//      medmindre body.erstat er true; så annulleres den gamle FØRST (spor
//      «annulleret»), og den nye sendes. Unik-indekset
//      aftale_underskrift_en_aaben_pr_virksomhed er værnet mod kapløbet.
//   3. Den AKTIVE skabelon læses; pladsholderne udfyldes fra virksomheden
//      og prisen. Efterlades en pladsholder, sendes der IKKE (422 med
//      navnene) — og en skabelon der stadig bærer udkastets
//      «INDSÆT AFTALEGRUNDLAGETS TEKST»-mærke sendes aldrig.
//   4. Teksten FASTFRYSES: kanoniskTekst → SHA-256 → rækken skrives med
//      tekst, aftryk, modtager og sendt_af = rådgiveren.
//   5. Linkmailen sendes. Fejler den, annulleres rækken igen (der må aldrig
//      findes en sendt aftale ingen har fået mail om), og der svares 502.
//   6. Spor «link_sendt». Svar: aftale_id, udløb, aftryk.
//
// PRISEN er en parameter her (som saet-indgangs-prisniveau), ikke læst fra
// Monday: aftalen LYDER på et beløb, og det er det beløb der bliver
// company_betalingslink.prisniveau_oere ved underskriften (koblingen). Null
// er tilladt — så indeholder skabelonen ingen {{pris_kr}}, eller kaldet
// afvises af pladsholder-tjekket.
//
// FELTERNE (18/9, anden runde): listen bor i _shared/aftalefelter.ts —
// funktionen udfylder præcis den (kildeværn aftalefelter.guard.test.ts).
// Adressen (adresse/postnummer/by) kommer fra companies eller fra CVR-
// opslaget: cvr_opslag_cache.svar (DataCVR's address/zipcode/city, gemt af
// ansoegning-cvr), ellers ét friskt DataCVR-opslag. Et felt teksten bruger,
// som koden ikke kender, stopper afsendelsen (422 pladsholdere_mangler) —
// aldrig et dokument med rå {{…}}.
//
// FORHÅNDSVISNING (body.forhaandsvis: true): alt op til den udfyldte tekst,
// INTET skrives, INTET sendes — svaret bærer teksten, felterne og det der
// mangler. Det er sådan Jonas ser et færdigt dokument med rigtige tal uden
// at sende det til nogen (knappen «Forhåndsvis» på virksomhedssiden).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { INDGANGS_PRISPUNKTER_OERE, alleIndgangsmuligheder } from "../_shared/indgangspris.ts";
import { BETALINGSFRIST_DAGE } from "../_shared/betalingsfrist.ts";
import { kanoniskTekst, linkUdloeb, udfyldSkabelon } from "../_shared/underskriftDom.ts";
import { sha256Hex } from "../_shared/aftryk.ts";
import { formatKr } from "../_shared/indgangsMail.ts";
import { betalingsfristDato, fornavnAf, formatDanskDato, sendIndgangsMail } from "../_shared/indgangsMailAfsendelse.ts";
import { aftaleLinkMail, aftaleUrl } from "../_shared/underskriftMail.ts";
import { hentAnsoegning, udfoerOvergang, virksomhedsnavnAf, type AnsoegningRaekke } from "../_shared/ansoegningMotor.ts";
import { KENDTE_FELTNAVNE } from "../_shared/aftalefelter.ts";
import { slaaCvrOp } from "../_shared/virksomhedsOprettelse.ts";
import type { CvrSvar } from "../_shared/virksomhedsraekke.ts";

const LOG = "[send-til-underskrift]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLADSHOLDER_MAERKE = "INDSÆT AFTALEGRUNDLAGETS TEKST";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Adresse { adresse: string | null; postnummer: string | null; by: string | null }
const INGEN_ADRESSE: Adresse = { adresse: null, postnummer: null, by: null };

function adresseAfCvrSvar(svar: CvrSvar | null | undefined): Adresse {
  if (!svar) return INGEN_ADRESSE;
  return { adresse: svar.address?.trim() || null, postnummer: svar.zipcode?.trim() || null, by: svar.city?.trim() || null };
}

/**
 * Adressen fra CVR: først cachen (ansoegning-cvr gemmer DataCVR's svar med
 * address/zipcode/city — intet nyt opslag), ellers ét friskt opslag. Kaster
 * aldrig; uden adresse svares tomt, og pladsholder-tjekket afviser så.
 */
async function hentCvrAdresse(admin: SupabaseClient, cvr: string | null): Promise<Adresse> {
  if (!cvr || !/^\d{8}$/.test(cvr)) return INGEN_ADRESSE;
  const { data, error } = await admin.from("cvr_opslag_cache").select("svar").eq("cvr", cvr).maybeSingle();
  if (error) console.warn(`${LOG} cvr_opslag_cache fejlede for ${cvr}:`, error.message);
  const fraCache = adresseAfCvrSvar((data?.svar ?? null) as CvrSvar | null);
  if (fraCache.adresse || fraCache.postnummer || fraCache.by) return fraCache;
  const opslag = await slaaCvrOp(cvr);
  return opslag.udfald === "fundet" ? adresseAfCvrSvar(opslag.svar) : INGEN_ADRESSE;
}

/**
 * Skabelonen → felterne → den udfyldte tekst. Felterne er PRÆCIS
 * _shared/aftalefelter.ts' liste (kildeværnet låser det); et felt teksten
 * bruger uden for listen står i `manglende`, et kendt felt uden værdi i `tomme`.
 * Svarer en Response ved fejl (ingen aktiv skabelon, pladsholder-mærket).
 */
async function bygUdfyldning(
  admin: SupabaseClient,
  ejer: { navn: string; cvr: string | null; kontaktperson: string | null; adresse: string | null; postnummer: string | null; by: string | null },
  prisniveauOere: number | null,
): Promise<Response | { skabelon: { id: string; navn: string; version: number; titel: string; tekst: string }; felter: Record<string, string>; udfyldt: { tekst: string; manglende: string[] }; tomme: string[] }> {
  const { data: skabelon, error: skErr } = await admin
    .from("aftale_skabelon")
    .select("id, navn, version, titel, tekst")
    .eq("aktiv", true)
    .maybeSingle();
  if (skErr) throw new Error(`skabelonopslag fejlede: ${skErr.message}`);
  if (!skabelon) return jsonResponse({ error: "ingen_aktiv_skabelon" }, 500);
  if (skabelon.tekst.includes(PLADSHOLDER_MAERKE)) {
    return jsonResponse({ error: "skabelon_er_pladsholder", skabelon: `${skabelon.navn} v${skabelon.version}` }, 422);
  }

  const nu = new Date();
  const felter: Record<string, string> = {
    virksomhed: ejer.navn,
    cvr: ejer.cvr ?? "",
    adresse: ejer.adresse ?? "",
    postnummer: ejer.postnummer ?? "",
    by: ejer.by ?? "",
    kontaktperson: ejer.kontaktperson ?? "",
    dato: formatDanskDato(nu),
    frist_dage: String(BETALINGSFRIST_DAGE),
  };
  // Fristen som dato regnes fra NU — aftalens 30 dage løber fra
  // underskriften, som endnu ikke er sket; datoen i teksten er derfor
  // vejledende («senest 30 dage efter underskrift» er det bindende).
  felter.frist_dato = formatDanskDato(betalingsfristDato(nu));
  felter.kontrakt_maaneder = "12";
  if (prisniveauOere !== null) {
    // Prisen og de tre betalingsmodeller fra husets motor (indgangspris.ts,
    // spejlet, paritetstestet) — samme tal som betalingssiden viser.
    felter.pris_kr = formatKr(prisniveauOere / 100);
    const m = alleIndgangsmuligheder(prisniveauOere);
    if (m.ok) {
      for (const x of m.muligheder) {
        if (x.betalingsmodel === "rate2") felter.pris_rate2_kr = formatKr(x.rate_oere / 100);
        if (x.betalingsmodel === "rate12") {
          felter.pris_rate12_kr = formatKr(x.rate_oere / 100);
          felter.pris_rate12_samlet_kr = formatKr(x.samlet_oere / 100);
        }
      }
    }
  }
  // Værn i drift: funktionen må ikke udfylde noget, listen ikke kender (og omvendt låser testen).
  const uforListen = Object.keys(felter).filter((k) => !KENDTE_FELTNAVNE.includes(k));
  if (uforListen.length > 0) throw new Error(`felter uden for aftalefelter.ts: ${uforListen.join(", ")}`);

  const udfyldt = udfyldSkabelon(skabelon.tekst, felter);
  const tomme = Object.entries(felter).filter(([k, v]) => !v && skabelon.tekst.includes(`{{${k}}}`)).map(([k]) => k);
  return { skabelon, felter, udfyldt, tomme };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) FØR alt andet, derefter advisor-gaten ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  const { data: callerIsAdvisor, error: callerRoleError } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (callerRoleError || !callerIsAdvisor) {
    console.warn(`${LOG} caller not advisor`, { callerId });
    return jsonResponse({ error: "Forbidden — advisor role required" }, 403);
  }

  try {
    // ── 2. Input ──
    const body = await req.json().catch(() => null);
    const companyId = typeof body?.company_id === "string" ? body.company_id.trim() : "";
    const ansoegningId = typeof body?.ansoegning_id === "string" ? body.ansoegning_id.trim() : "";
    if ((companyId ? 1 : 0) + (ansoegningId ? 1 : 0) !== 1) {
      return jsonResponse({ error: "Angiv præcis én af company_id og ansoegning_id" }, 400);
    }
    if (companyId && !UUID_RE.test(companyId)) return jsonResponse({ error: "Ugyldigt company_id" }, 400);
    if (ansoegningId && !UUID_RE.test(ansoegningId)) return jsonResponse({ error: "Ugyldigt ansoegning_id" }, 400);

    let prisniveauOere: number | null = null;
    if (body?.prisniveau_oere !== undefined && body?.prisniveau_oere !== null) {
      const p = Number(body.prisniveau_oere);
      const kendte = INDGANGS_PRISPUNKTER_OERE as readonly number[];
      if (!Number.isInteger(p) || !kendte.includes(p)) {
        return jsonResponse({ error: "ukendt_prisniveau", kendte_prisniveauer_oere: [...kendte] }, 400);
      }
      prisniveauOere = p;
    }
    const erstat = body?.erstat === true;
    const forhaandsvis = body?.forhaandsvis === true;

    // ── 3. Service-role-klient, virksomheden ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Ejeren: virksomhed ELLER ansøgning — samme felter til skabelonen.
    interface Ejer extends Adresse { navn: string; cvr: string | null; kontaktperson: string | null; email: string; pris: number | null }
    let ejer: Ejer;
    let ansoegning: AnsoegningRaekke | null = null;
    if (companyId) {
      const { data: c, error: companyErr } = await admin
        .from("companies")
        .select("id, name, cvr_number, contact_person, contact_email, address, postal_code, city")
        .eq("id", companyId)
        .maybeSingle();
      if (companyErr) throw new Error(`companies-opslag fejlede: ${companyErr.message}`);
      if (!c) return jsonResponse({ error: "ukendt_virksomhed", company_id: companyId }, 404);
      // Adressen: virksomhedens egne felter; mangler de, CVR-opslaget.
      const egen: Adresse = { adresse: c.address?.trim() || null, postnummer: c.postal_code?.trim() || null, by: c.city?.trim() || null };
      const adresse = egen.adresse && egen.postnummer && egen.by ? egen : { ...(await hentCvrAdresse(admin, c.cvr_number ?? null)), ...Object.fromEntries(Object.entries(egen).filter(([, v]) => v)) };
      ejer = {
        navn: c.name ?? "",
        cvr: c.cvr_number ?? null,
        kontaktperson: c.contact_person || null,
        email: (c.contact_email ?? "").trim().toLowerCase(),
        pris: prisniveauOere,
        ...adresse,
      };
    } else {
      ansoegning = await hentAnsoegning(admin, ansoegningId);
      if (!ansoegning) return jsonResponse({ error: "ukendt_ansoegning", ansoegning_id: ansoegningId }, 404);
      if (!ansoegning.indsendt_at) return jsonResponse({ error: "ansoegning_ikke_indsendt" }, 409);
      if (ansoegning.trin !== "afholdt" && ansoegning.trin !== "aftalegrundlag_sendt") {
        // Motoren tillader «tilbud» kun fra «afholdt» (ingen direkte tilbud);
        // «aftalegrundlag_sendt» er gensendelsen. Alt andet afvises her, FØR
        // der skrives noget.
        return jsonResponse({ error: "ansoegning_forkert_trin", trin: ansoegning.trin }, 409);
      }
      if (prisniveauOere !== null && prisniveauOere !== ansoegning.pris_oere) {
        // Én pris, ét sted: motoren læser ansoegninger.pris_oere ved
        // «underskrevet». Sæt prisen på ansøgningen først (A's flade).
        return jsonResponse({ error: "pris_saettes_paa_ansoegningen", pris_oere: ansoegning.pris_oere }, 409);
      }
      ejer = {
        navn: virksomhedsnavnAf(ansoegning),
        cvr: ansoegning.cvr,
        kontaktperson: ansoegning.navn,
        email: (ansoegning.email ?? "").trim().toLowerCase(),
        pris: ansoegning.pris_oere,
        // Ansøgningen har ingen adresse selv — CVR-opslaget (cachen, ellers live).
        ...(await hentCvrAdresse(admin, ansoegning.cvr)),
      };
      prisniveauOere = ejer.pris;
    }
    const til = ejer.email;
    if (!til && !forhaandsvis) return jsonResponse({ error: "ingen_kontakt_email", company_id: companyId || null, ansoegning_id: ansoegningId || null }, 422);
    const ejerFilter = companyId ? { kolonne: "company_id", vaerdi: companyId } : { kolonne: "ansoegning_id", vaerdi: ansoegningId };

    // ── 3b. Skabelonen → teksten (deles af forhåndsvisningen og afsendelsen) ──
    const udfyldning = await bygUdfyldning(admin, ejer, prisniveauOere);
    if (udfyldning instanceof Response) return udfyldning;
    const { skabelon, felter, udfyldt, tomme } = udfyldning;
    if (forhaandsvis) {
      // INTET skrives, INTET sendes. Teksten som modtageren ville se den — med
      // rå {{…}} stående, hvis noget mangler, så Jonas kan se præcis hvad.
      return jsonResponse({
        forhaandsvis: true,
        kan_sendes: udfyldt.manglende.length === 0 && tomme.length === 0 && Boolean(til),
        skabelon: `${skabelon.navn} v${skabelon.version}`,
        titel: skabelon.titel,
        til: til || null,
        felter,
        manglende: udfyldt.manglende,
        tomme,
        tekst: udfyldt.tekst,
      });
    }
    if (udfyldt.manglende.length > 0) {
      return jsonResponse({ error: "pladsholdere_mangler", manglende: udfyldt.manglende, kendte: [...KENDTE_FELTNAVNE] }, 422);
    }
    if (tomme.length > 0) {
      // Pladsholderen ER udfyldt — med ingenting. «CVR » i et aftalegrundlag er en fejl, ikke en aftale.
      return jsonResponse({ error: "felter_tomme", tomme }, 422);
    }

    // ── 4. En åben aftale i forvejen? ──
    const { data: aaben, error: aabenErr } = await admin
      .from("aftale_underskrift")
      .select("id, sendt_at")
      .eq(ejerFilter.kolonne, ejerFilter.vaerdi)
      .eq("status", "sendt")
      .maybeSingle();
    if (aabenErr) throw new Error(`aftaleopslag fejlede: ${aabenErr.message}`);
    if (aaben && !erstat) {
      return jsonResponse({ error: "aftale_allerede_sendt", aftale_id: aaben.id, sendt_at: aaben.sendt_at }, 409);
    }
    if (aaben && erstat) {
      const nuIso = new Date().toISOString();
      const { data: annulleret, error: annErr } = await admin
        .from("aftale_underskrift")
        .update({ status: "annulleret", annulleret_at: nuIso, annulleret_af: callerId, annulleret_grund: "erstattet af ny aftale", updated_at: nuIso })
        .eq("id", aaben.id)
        .eq("status", "sendt")
        .select("id");
      if (annErr) throw new Error(`annullering fejlede: ${annErr.message}`);
      if (!annulleret || annulleret.length === 0) return jsonResponse({ error: "aftale_aendret_imens", aftale_id: aaben.id }, 409);
      await admin.from("aftale_spor").insert({ aftale_id: aaben.id, haendelse: "annulleret", detaljer: { grund: "erstattet af ny aftale", af: callerId } });
      console.log(`${LOG} aftale ${aaben.id} annulleret af ${callerId} (erstattes)`);
    }

    const nu = new Date();

    // ── 6. Fastfrysning og rækken ──
    const tekst = kanoniskTekst(udfyldt.tekst);
    const aftryk = await sha256Hex(tekst);
    const { data: aftale, error: insErr } = await admin
      .from("aftale_underskrift")
      .insert({
        company_id: companyId || null,
        ansoegning_id: ansoegningId || null,
        skabelon_id: skabelon.id,
        dokument_titel: skabelon.titel,
        dokument_tekst: tekst,
        dokument_aftryk: aftryk,
        prisniveau_oere: prisniveauOere,
        modtager_email: til,
        modtager_navn: ejer.kontaktperson,
        sendt_at: nu.toISOString(),
        sendt_af: callerId,
      })
      .select("id, token, sendt_at")
      .single();
    if (insErr?.code === "23505") return jsonResponse({ error: "aftale_allerede_sendt", [ejerFilter.kolonne]: ejerFilter.vaerdi }, 409);
    if (insErr || !aftale) throw new Error(`aftale-indsættelse fejlede: ${insErr?.message ?? "ingen række"}`);

    // ── 7. Linkmailen — fejler den, annulleres rækken ──
    const udloeb = linkUdloeb(aftale.sendt_at) ?? new Date(nu.getTime() + 21 * 86_400_000);
    const mail = aftaleLinkMail({
      fornavn: fornavnAf(ejer.kontaktperson),
      virksomhed: ejer.navn || "jeres virksomhed",
      url: aftaleUrl(aftale.token),
      udloeberDato: formatDanskDato(udloeb),
    });
    // companyId i loggen: virksomheden når den findes, ellers ansøgningens id (bliver virksomhedens id ved konvertering, A §2.1).
    const ok = await sendIndgangsMail({ adminClient: admin, til, subject: mail.subject, html: mail.html, label: "aftale-link", companyId: companyId || ansoegningId });
    if (!ok) {
      const nuIso = new Date().toISOString();
      await admin
        .from("aftale_underskrift")
        .update({ status: "annulleret", annulleret_at: nuIso, annulleret_af: callerId, annulleret_grund: "linkmail kunne ikke sendes", updated_at: nuIso })
        .eq("id", aftale.id);
      await admin.from("aftale_spor").insert({ aftale_id: aftale.id, haendelse: "annulleret", detaljer: { grund: "linkmail kunne ikke sendes" } });
      return jsonResponse({ error: "link_mail_fejlede", aftale_id: aftale.id }, 502);
    }

    // ── 8. Spor ──
    await admin.from("aftale_spor").insert({ aftale_id: aftale.id, haendelse: "link_sendt", detaljer: { til, af: callerId, skabelon: `${skabelon.navn} v${skabelon.version}` } });

    // ── 9. Ansøgningsvejen: motorens trin. Fra «afholdt» er det «tilbud»
    //       (aftale_url = dette link; A's rykkere i aftalegrundlags-trappen
    //       linker dertil). Fra «aftalegrundlag_sendt» (gensendelse) kaldes
    //       motoren ikke — kun aftale_url skiftes, så rykkerne peger på den
    //       nye aftale. Fejler det, ER aftalen sendt og mailen gået; det
    //       meldes i svaret, og rådgiveren kan sætte trinnet i A's flade. ──
    let motor: Record<string, unknown> | null = null;
    if (ansoegning) {
      const url = aftaleUrl(aftale.token);
      if (ansoegning.trin === "afholdt") {
        // startFraTrinNr: 1 (recon-sammenhæng §2, 19/9): linkmailen ER sendt ovenfor — køens dag 0
        // med samme link springes over, så ansøgeren ikke får aftalegrundlaget to gange. Rykkerne kører.
        const o = await udfoerOvergang(admin, { ansoegning, handling: { art: "tilbud" }, via: "raadgiver", truffetAf: callerId, aftaleUrl: url, nu, startFraTrinNr: 1 });
        motor = o.ok ? { ok: true, fra: o.fra, til: o.til, planlagt: o.planlagt } : { ok: false, status: o.status, grund: o.grund };
        if (!o.ok) console.error(`${LOG} aftale ${aftale.id} sendt, men motorens «tilbud» fejlede for ansøgning ${ansoegning.id}: ${o.grund}`);
      } else {
        const { error: urlErr } = await admin.from("ansoegninger").update({ aftale_url: url }).eq("id", ansoegning.id);
        motor = urlErr ? { ok: false, grund: urlErr.message } : { ok: true, fra: ansoegning.trin, til: ansoegning.trin, aftale_url_opdateret: true };
        if (urlErr) console.error(`${LOG} aftale_url kunne ikke opdateres på ansøgning ${ansoegning.id}:`, urlErr);
      }
    }

    // ── 10. Svar ──
    console.log(`${LOG} aftale ${aftale.id} sendt til ${til} for ${ejerFilter.kolonne} ${ejerFilter.vaerdi} af ${callerId}; aftryk ${aftryk}; udløber ${udloeb.toISOString()}`);
    return jsonResponse({
      ok: true,
      aftale_id: aftale.id,
      [ejerFilter.kolonne]: ejerFilter.vaerdi,
      motor,
      til,
      sendt_at: aftale.sendt_at,
      udloeber_at: udloeb.toISOString(),
      aftryk,
      prisniveau_oere: prisniveauOere,
      skabelon: `${skabelon.navn} v${skabelon.version}`,
    });
  } catch (err) {
    console.error(`${LOG} Error:`, err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
