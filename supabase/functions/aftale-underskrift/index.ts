// aftale-underskrift — den offentlige side af e-underskriften (UDKAST 18/9).
//
// KALDEREN HAR INGEN SESSION. Personen kommer fra linkmailen via
// /aftale?token=<uuid> og har ingen konto endnu. Legitimationen er tokenet,
// verificeret af verifyAftaletoken (_shared/aftaletokenAuth.ts) FØR enhver
// anden service-role-handling — samme invariant og samme klasse som
// opret-indgangs-checkout (verifyBetalingstoken, docs/indgangen-design.md
// §23). verify_jwt = false i config.toml, bevidst: gatewayen ville ellers
// afvise kaldet før koden kører.
//
// ÉN FUNKTION, FIRE HANDLINGER (body.handling), fordi alle fire skal skrive
// i sporet med IP og browser fra request-headerne, og fordi tokenet er den
// eneste legitimation i dem alle:
//   hent           aftalegrundlaget + tilstand; logger «link åbnet»
//   send_kode      ny sekscifret kode pr. mail; erstatter den gamle; pause
//   underskriv     navn + kryds + kode → underskrift → PDF → kvittering →
//                  KOBLINGEN til indgangen (company_betalingslink + dag 0)
//   hent_dokument  signeret URL (10 min) til det underskrevne dokument
//
// KODEN STÅR ALDRIG I EN LOG og aldrig i et svar. Sammenligningen af
// hash'ene er konstant-tid (erKonstantTidLig). Forkerte forsøg tælles
// atomisk i SQL (registrer_kodeforsoeg), aldrig med læs-og-skriv herfra.
//
// UNDERSKRIFTEN ER ATOMISK OG FØRST: rækken skifter status 'sendt' →
// 'underskrevet' med WHERE status = 'sendt' (nul rækker = en anden fane
// nåede det først → 409). Alt EFTER — PDF, kvittering, koblingen — er
// best effort og må ALDRIG vælte en gennemført underskrift: hver del
// fanges, logges og meldes i svarets `efter`, så en rådgiver kan se hvad
// der mangler. Samme regel som stripe-webhookens invitation (§25).
//
// AFTRYKKET REGNES IGEN ved underskriften over den gemte tekst og skal
// være det aftryk der blev skrevet ved afsendelsen — ellers underskrives
// der ikke (500 aftryk_afviger). Ingen kan senere påstå at teksten var en
// anden: teksten, aftrykket og underskriften hænger sammen i én række.
//
// TO EJERE (D1, Jonas 18/9 «Ved underskrift»): aftalen hører til en
// ANSØGNING (ansoegning_id) eller en eksisterende VIRKSOMHED (company_id).
// Efter underskriften går ansøgningsvejen gennem A's motor:
// udfoerOvergang({ art: "underskrevet" }, via "e_signatur") opretter
// virksomheden (konverterTilVirksomhed: B3/B4 + B7 + B8) og starter
// betalingsforløbet. Virksomhedsvejen kalder B7 + B8 selv, som før.
//
// IP OG BROWSER: cf-connecting-ip, ellers første led af x-forwarded-for,
// ellers null; user-agent afkortet til 512 tegn. IKKE MÅLT i prod hvilke
// headere edge-runtimen faktisk bærer (README §5) — koden tåler at begge
// mangler, og sporet siger så «IP ukendt».

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { verifyAftaletoken, type AftaleRaekke } from "../_shared/aftaletokenAuth.ts";
import {
  KODE_GYLDIG_MINUTTER,
  KODE_MAX_FORSOEG,
  afgoerAftaletilstand,
  afgoerIndtastning,
  afgoerNavn,
  kanoniskTekst,
  maaBestilleNyKode,
  maskerEmail,
  nyKode,
  rensKode,
  type KodeInput,
} from "../_shared/underskriftDom.ts";
import { kodeHash, sha256Hex } from "../_shared/aftryk.ts";
import { erKonstantTidLig } from "../_shared/konstantTidLighed.ts";
import { beskrivBrowser, formaterDanskTid, sporTilLinjer, type Haendelse, type Sporraekke } from "../_shared/revisionsspor.ts";
import { aftaleKodeMail, aftaleKvitteringMail, aftaleKvitteringRaadgiverMail, aftaleUrl } from "../_shared/underskriftMail.ts";
import { bygUnderskrevetPdf } from "../_shared/underskriftPdf.ts";
import { fornavnAf, sendIndgangsMail } from "../_shared/indgangsMailAfsendelse.ts";
import { udloesIndgangsBetalingsmail } from "../_shared/indgangsBetalingsmail.ts";
import { hentAnsoegning, udfoerOvergang, virksomhedsnavnAf } from "../_shared/ansoegningMotor.ts";

const LOG = "[aftale-underskrift]";
const BUCKET = "aftaler";
const SIGNERET_URL_SEK = 600;
const HANDLINGER = ["hent", "send_kode", "underskriv", "hent_dokument"] as const;
type Handling = (typeof HANDLINGER)[number];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Kalder {
  ip: string | null;
  user_agent: string | null;
}

function laesKalder(req: Request): Kalder {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = req.headers.get("user-agent")?.trim().slice(0, 512);
  return { ip: cf || xff || null, user_agent: ua || null };
}

/** Skriver én sporrække. Kaster aldrig — et spor der ikke kunne skrives, logges højt. */
async function skrivSpor(
  admin: SupabaseClient,
  aftaleId: string,
  haendelse: Haendelse,
  kalder: Kalder,
  detaljer: Record<string, unknown> | null = null,
): Promise<void> {
  const { error } = await admin.from("aftale_spor").insert({
    aftale_id: aftaleId,
    haendelse,
    ip: kalder.ip,
    user_agent: kalder.user_agent,
    detaljer,
  });
  if (error) console.error(`${LOG} SPOR IKKE SKREVET (${haendelse}) for aftale ${aftaleId}:`, error);
}

/** Et ciffer 0–9 fra crypto, uden skævhed (rejection sampling over 0–249). */
function tilfaeldigtCiffer(): number {
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) return buf[0] % 10;
  }
}

async function senesteKode(admin: SupabaseClient, aftaleId: string): Promise<(KodeInput & { id: string; kode_hash: string }) | null> {
  const { data, error } = await admin
    .from("aftale_kode")
    .select("id, kode_hash, oprettet_at, forsoeg, brugt_at, erstattet_at")
    .eq("aftale_id", aftaleId)
    .order("oprettet_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`kodeopslag fejlede: ${error.message}`);
  return (data as (KodeInput & { id: string; kode_hash: string }) | null) ?? null;
}

/** Navn og CVR til siden/PDF'en — fra virksomheden når den findes, ellers fra ansøgningen. */
async function ejerNavn(admin: SupabaseClient, aftale: AftaleRaekke): Promise<{ navn: string | null; cvr: string | null; contact_person: string | null; company_id: string | null }> {
  if (aftale.company_id) {
    const { data: c } = await admin.from("companies").select("id, name, cvr_number, contact_person").eq("id", aftale.company_id).maybeSingle();
    return { navn: c?.name ?? null, cvr: c?.cvr_number ?? null, contact_person: c?.contact_person ?? null, company_id: aftale.company_id };
  }
  if (aftale.ansoegning_id) {
    const a = await hentAnsoegning(admin, aftale.ansoegning_id);
    // company_id er sat når motoren har konverteret (efter underskriften).
    return a ? { navn: virksomhedsnavnAf(a), cvr: a.cvr, contact_person: a.navn, company_id: a.company_id } : { navn: null, cvr: null, contact_person: null, company_id: null };
  }
  return { navn: null, cvr: null, contact_person: null, company_id: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── 1. Body: token + handling; resten afhænger af handlingen ──
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const handling = body?.handling as Handling;
    if (!token) return jsonResponse({ error: "Manglende token" }, 400);
    if (!HANDLINGER.includes(handling)) return jsonResponse({ error: "Ugyldig handling" }, 400);

    // ── 2. Legitimation FØRST — tokenet er kalderens bevis ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const aftale = await verifyAftaletoken(token, admin);
    if (!aftale) return jsonResponse({ error: "Linket kendes ikke." }, 403);

    const nu = new Date();
    const kalder = laesKalder(req);
    const tilstand = afgoerAftaletilstand(aftale, nu);

    // ── 3a. hent ──
    if (handling === "hent") {
      await skrivSpor(admin, aftale.id, tilstand.tilstand === "udloebet" ? "afvist_udloebet" : "link_aabnet", kalder, { tilstand: tilstand.tilstand });
      const c = await ejerNavn(admin, aftale);
      const visTekst = tilstand.tilstand === "kan_underskrives" || tilstand.tilstand === "underskrevet";
      return jsonResponse({
        tilstand: tilstand.tilstand,
        virksomhed: c.navn,
        cvr: c.cvr,
        titel: aftale.dokument_titel,
        tekst: visTekst ? aftale.dokument_tekst : null,
        aftryk: aftale.dokument_aftryk,
        email_hint: maskerEmail(aftale.modtager_email),
        udloeber_at: tilstand.tilstand === "kan_underskrives" ? tilstand.udloeber_at : null,
        dage_tilbage: tilstand.tilstand === "kan_underskrives" ? tilstand.dage_tilbage : null,
        udloeb_at: tilstand.tilstand === "udloebet" ? tilstand.udloeb_at : null,
        underskrevet_at: aftale.underskrevet_at,
        underskrevet_navn: aftale.underskrevet_navn,
        underskrevet_tid: aftale.underskrevet_at ? formaterDanskTid(aftale.underskrevet_at) : null,
        dokument_klar: Boolean(aftale.pdf_sti),
        kode_gyldig_minutter: KODE_GYLDIG_MINUTTER,
        kode_max_forsoeg: KODE_MAX_FORSOEG,
      });
    }

    // ── 3b. hent_dokument — kun efter underskrift, og kun når PDF'en findes ──
    if (handling === "hent_dokument") {
      if (tilstand.tilstand !== "underskrevet" || !aftale.pdf_sti) {
        return jsonResponse({ error: "dokument_ikke_klar", tilstand: tilstand.tilstand }, 409);
      }
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(aftale.pdf_sti, SIGNERET_URL_SEK, { download: "aftalegrundlag-underskrevet.pdf" });
      if (error || !data?.signedUrl) {
        console.error(`${LOG} signeret URL fejlede for aftale ${aftale.id}:`, error);
        return jsonResponse({ error: "dokument_kunne_ikke_hentes" }, 500);
      }
      return jsonResponse({ url: data.signedUrl, gyldig_sekunder: SIGNERET_URL_SEK, pdf_aftryk: aftale.pdf_aftryk });
    }

    // send_kode og underskriv kræver at aftalen KAN underskrives.
    if (tilstand.tilstand !== "kan_underskrives") {
      if (tilstand.tilstand === "udloebet") await skrivSpor(admin, aftale.id, "afvist_udloebet", kalder, { handling });
      return jsonResponse({ error: "kan_ikke_underskrives", tilstand: tilstand.tilstand }, 409);
    }

    // ── 3c. send_kode ──
    if (handling === "send_kode") {
      const seneste = await senesteKode(admin, aftale.id);
      const pause = maaBestilleNyKode(seneste?.oprettet_at ?? null, nu);
      if (!pause.ok) return jsonResponse({ error: "vent", vent_sekunder: pause.vent_sekunder }, 429);

      const { error: annullerErr } = await admin.rpc("annuller_gamle_koder", { p_aftale_id: aftale.id });
      if (annullerErr) throw new Error(`annuller_gamle_koder fejlede: ${annullerErr.message}`);

      const kode = nyKode(tilfaeldigtCiffer);
      const hash = await kodeHash(aftale.id, kode);
      const { data: kodeRaekke, error: kodeErr } = await admin
        .from("aftale_kode")
        .insert({ aftale_id: aftale.id, kode_hash: hash, ip: kalder.ip, user_agent: kalder.user_agent })
        .select("id")
        .single();
      if (kodeErr || !kodeRaekke) throw new Error(`kode-indsættelse fejlede: ${kodeErr?.message ?? "ingen række"}`);

      const mail = aftaleKodeMail({ fornavn: fornavnAf(aftale.modtager_navn), kode });
      const ok = await sendIndgangsMail({
        adminClient: admin,
        til: aftale.modtager_email,
        subject: mail.subject,
        html: mail.html,
        label: "aftale-kode",
        companyId: aftale.company_id ?? aftale.ansoegning_id ?? aftale.id,
      });
      if (!ok) {
        // Koden nåede ikke frem — den må ikke kunne bruges, og kalderen skal vide det.
        await admin.from("aftale_kode").update({ erstattet_at: nu.toISOString() }).eq("id", kodeRaekke.id);
        return jsonResponse({ error: "kode_mail_fejlede" }, 502);
      }
      await skrivSpor(admin, aftale.id, "kode_sendt", kalder, { til: maskerEmail(aftale.modtager_email) });
      console.log(`${LOG} kode sendt for aftale ${aftale.id} (company ${aftale.company_id})`);
      return jsonResponse({ ok: true, email_hint: maskerEmail(aftale.modtager_email), gyldig_minutter: KODE_GYLDIG_MINUTTER });
    }

    // ── 3d. underskriv ──
    if (body?.accepteret !== true) return jsonResponse({ error: "kryds_mangler" }, 400);
    const navnDom = afgoerNavn(typeof body?.navn === "string" ? body.navn : "");
    if (!navnDom.ok) return jsonResponse({ error: "navn_ugyldigt", grund: navnDom.grund }, 400);
    const kode = rensKode(typeof body?.kode === "string" ? body.kode : "");
    if (!kode) return jsonResponse({ error: "kode_format" }, 400);

    const kodeRaekke = await senesteKode(admin, aftale.id);
    const matcher = kodeRaekke ? erKonstantTidLig(kodeRaekke.kode_hash, await kodeHash(aftale.id, kode)) : false;
    const dom = afgoerIndtastning(kodeRaekke, matcher, nu);

    if (dom.udfald === "forkert" || dom.udfald === "laast") {
      // Tæl forsøget atomisk. null = rækken var ikke længere åben (kapløb) → låst.
      let talt: number | null = null;
      if (kodeRaekke) {
        const { data, error } = await admin.rpc("registrer_kodeforsoeg", { p_kode_id: kodeRaekke.id });
        if (error) console.error(`${LOG} registrer_kodeforsoeg fejlede for ${kodeRaekke.id}:`, error);
        talt = typeof data === "number" ? data : null;
      }
      const laast = dom.udfald === "laast" || talt === null || talt >= KODE_MAX_FORSOEG;
      if (laast) {
        await skrivSpor(admin, aftale.id, "kode_laast", kalder);
        return jsonResponse({ error: "kode_laast" }, 401);
      }
      const forsoeg_tilbage = KODE_MAX_FORSOEG - (talt as number);
      await skrivSpor(admin, aftale.id, "kode_forkert", kalder, { forsoeg_tilbage });
      return jsonResponse({ error: "kode_forkert", forsoeg_tilbage }, 401);
    }
    if (dom.udfald !== "ok") {
      await skrivSpor(admin, aftale.id, "kode_udloebet", kalder, { grund: dom.udfald });
      return jsonResponse({ error: "kode_ugyldig", grund: dom.udfald }, 401);
    }

    // Koden bruges ÉN gang: WHERE brugt_at IS NULL, nul rækker = brugt imens.
    const { data: brugt, error: brugtErr } = await admin
      .from("aftale_kode")
      .update({ brugt_at: nu.toISOString() })
      .eq("id", (kodeRaekke as { id: string }).id)
      .is("brugt_at", null)
      .select("id");
    if (brugtErr) throw new Error(`kode-brug fejlede: ${brugtErr.message}`);
    if (!brugt || brugt.length === 0) return jsonResponse({ error: "kode_ugyldig", grund: "brugt" }, 401);

    // Aftrykket regnes igen — teksten SKAL være den der blev sendt.
    const aftryk = await sha256Hex(kanoniskTekst(aftale.dokument_tekst));
    if (!erKonstantTidLig(aftryk, aftale.dokument_aftryk)) {
      console.error(`${LOG} AFTRYK AFVIGER for aftale ${aftale.id}: gemt ${aftale.dokument_aftryk}, regnet ${aftryk} — der underskrives IKKE`);
      return jsonResponse({ error: "aftryk_afviger" }, 500);
    }

    // UNDERSKRIFTEN — atomisk: kun fra 'sendt'.
    const { data: underskrevet, error: usErr } = await admin
      .from("aftale_underskrift")
      .update({
        status: "underskrevet",
        underskrevet_at: nu.toISOString(),
        underskrevet_navn: navnDom.navn,
        underskrevet_ip: kalder.ip,
        underskrevet_user_agent: kalder.user_agent,
        updated_at: nu.toISOString(),
      })
      .eq("id", aftale.id)
      .eq("status", "sendt")
      .select("id");
    if (usErr) throw new Error(`underskrift-opdatering fejlede: ${usErr.message}`);
    if (!underskrevet || underskrevet.length === 0) return jsonResponse({ error: "allerede_underskrevet" }, 409);

    await skrivSpor(admin, aftale.id, "underskrevet", kalder, { navn: navnDom.navn, aftryk });
    console.log(`${LOG} UNDERSKREVET: aftale ${aftale.id}, ${aftale.company_id ? `company ${aftale.company_id}` : `ansøgning ${aftale.ansoegning_id}`}, af «${navnDom.navn}» kl. ${nu.toISOString()}`);

    // ── 4. Alt herefter må ikke vælte underskriften ──
    const efter: Record<string, unknown> = {};
    const underskrevetTid = formaterDanskTid(nu.toISOString());
    const browser = beskrivBrowser(kalder.user_agent);

    // 4a′. KOBLINGEN — FØRST, fordi den giver virksomheden (D1). Ansøgningsvejen:
    //      A's motor gør «underskrevet» (opretter virksomheden = B3/B4, linkrækken
    //      = B7, dag 0 = B8, klokke, beslutning). Virksomhedsvejen: B7 + B8 her.
    //      Fejler koblingen, STÅR underskriften; rådgiveren får det i `efter`
    //      og kan stemple «underskrevet» i A's flade (ansoegning-handling) —
    //      motoren er idempotent på company_id/trin.
    let koblingsCompanyId: string | null = aftale.company_id;
    if (aftale.ansoegning_id) {
      try {
        const a = await hentAnsoegning(admin, aftale.ansoegning_id);
        if (!a) throw new Error(`ansøgning ${aftale.ansoegning_id} findes ikke`);
        const o = await udfoerOvergang(admin, { ansoegning: a, handling: { art: "underskrevet" }, via: "e_signatur", truffetAf: null, nu });
        if (!o.ok) throw new Error(`motorens «underskrevet» afvist (${o.status}): ${o.grund}`);
        koblingsCompanyId = o.konvertering && o.konvertering.ok ? o.konvertering.company_id : a.company_id;
        efter.indgang = { vej: "ansoegning", fra: o.fra, til: o.til, konvertering: o.konvertering, company_id: koblingsCompanyId };
      } catch (e) {
        console.error(`${LOG} KOBLING FEJLEDE for aftale ${aftale.id} (ansøgning ${aftale.ansoegning_id}) — underskriften står; stempl «underskrevet» i ansøgningsfladen:`, e);
        efter.indgang = { vej: "ansoegning", fejl: e instanceof Error ? e.message : String(e) };
      }
    } else if (aftale.company_id) {
      try {
        const { error: linkErr } = await admin.from("company_betalingslink").insert({
          company_id: aftale.company_id,
          prisniveau_oere: aftale.prisniveau_oere,
          underskrevet_at: nu.toISOString(),
        });
        if (linkErr && linkErr.code !== "23505") throw new Error(`company_betalingslink: ${linkErr.message}`);
        const linkOprettet = !linkErr;
        if (!linkOprettet) console.log(`${LOG} company_betalingslink findes allerede for ${aftale.company_id} — rækken bevares`);
        const dag0 = await udloesIndgangsBetalingsmail(aftale.company_id, admin);
        efter.indgang = { vej: "virksomhed", betalingslink_oprettet: linkOprettet, dag0_status: dag0.status, dag0: dag0.body };
        if (dag0.status !== 200) console.error(`${LOG} dag 0 fejlede for ${aftale.company_id} (status ${dag0.status}):`, JSON.stringify(dag0.body));
      } catch (e) {
        console.error(`${LOG} koblingen til indgangen fejlede for ${aftale.company_id}:`, e);
        efter.indgang = { vej: "virksomhed", fejl: e instanceof Error ? e.message : String(e) };
      }
    }

    const ejer = await ejerNavn(admin, aftale);
    const virksomhed = ejer.navn ?? "Virksomheden";
    const company = { cvr_number: ejer.cvr, contact_person: ejer.contact_person };
    const logCompanyId = koblingsCompanyId ?? aftale.ansoegning_id ?? aftale.id;

    // 4a. PDF med underskriftsside bagerst → bucket aftaler
    try {
      const { data: sporRaekker } = await admin
        .from("aftale_spor")
        .select("tidspunkt, haendelse, ip, user_agent, detaljer")
        .eq("aftale_id", aftale.id)
        .order("tidspunkt", { ascending: true });
      const bytes = await bygUnderskrevetPdf({
        titel: aftale.dokument_titel,
        tekst: aftale.dokument_tekst,
        virksomhed,
        cvr: company?.cvr_number ?? null,
        underskrevetNavn: navnDom.navn,
        underskrevetTid,
        underskrevetIso: nu.toISOString(),
        aftryk,
        modtagerEmail: aftale.modtager_email,
        ip: kalder.ip,
        browser,
        sporLinjer: sporTilLinjer((sporRaekker ?? []) as Sporraekke[]),
      });
      const sti = `${aftale.id}/aftale-underskrevet.pdf`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(sti, bytes, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(`upload fejlede: ${upErr.message}`);
      const pdfAftryk = await sha256Hex(bytes);
      const { error: stiErr } = await admin.from("aftale_underskrift").update({ pdf_sti: sti, pdf_aftryk: pdfAftryk }).eq("id", aftale.id);
      if (stiErr) throw new Error(`pdf_sti kunne ikke skrives: ${stiErr.message}`);
      efter.pdf = { sti, bytes: bytes.length, aftryk: pdfAftryk };
    } catch (e) {
      console.error(`${LOG} PDF fejlede for aftale ${aftale.id}:`, e);
      efter.pdf = { fejl: e instanceof Error ? e.message : String(e) };
    }

    // 4b. Kvittering til begge parter
    try {
      const url = aftaleUrl(token);
      const modtager = aftaleKvitteringMail({
        fornavn: fornavnAf(aftale.modtager_navn), virksomhed, navn: navnDom.navn, tidspunkt: underskrevetTid, aftryk, url,
      });
      const okModtager = await sendIndgangsMail({
        adminClient: admin, til: aftale.modtager_email, subject: modtager.subject, html: modtager.html, label: "aftale-kvittering", companyId: logCompanyId,
      });
      const raadgiverTil = (Deno.env.get("RAADGIVER_MAIL_TIL") ?? "").trim();
      let okRaadgiver: boolean | null = null;
      if (raadgiverTil) {
        const r = aftaleKvitteringRaadgiverMail({ virksomhed, navn: navnDom.navn, tidspunkt: underskrevetTid, aftryk, companyId: koblingsCompanyId, ansoegningId: aftale.ansoegning_id, ip: kalder.ip, browser });
        okRaadgiver = await sendIndgangsMail({
          adminClient: admin, til: raadgiverTil, subject: r.subject, html: r.html, label: "aftale-kvittering-raadgiver", companyId: logCompanyId,
        });
      } else {
        console.error(`${LOG} RAADGIVER_MAIL_TIL er ikke sat — ingen rådgiverkvittering for aftale ${aftale.id}`);
      }
      if (okModtager) {
        await admin.from("aftale_underskrift").update({ kvittering_sendt_at: new Date().toISOString() }).eq("id", aftale.id);
        await skrivSpor(admin, aftale.id, "kvittering_sendt", kalder, { til: maskerEmail(aftale.modtager_email) });
      }
      efter.kvittering = { modtager: okModtager, raadgiver: okRaadgiver };
    } catch (e) {
      console.error(`${LOG} kvittering fejlede for aftale ${aftale.id}:`, e);
      efter.kvittering = { fejl: e instanceof Error ? e.message : String(e) };
    }

    // INGEN invitation her — AFGJORT (Jonas 18/9): adgangen åbner ved
    // BETALINGEN, som i dag. Invitationen og kontraktåret skrives af
    // stripe-webhook, når pengene er modtaget. Underskriften er ét faktum
    // (aftale_underskrift.underskrevet_at), betalingen et andet
    // (companies.contract_end_date) — de ses hver for sig på
    // virksomhedssiden.

    return jsonResponse({
      ok: true,
      tilstand: "underskrevet",
      underskrevet_at: nu.toISOString(),
      underskrevet_tid: underskrevetTid,
      navn: navnDom.navn,
      aftryk,
      efter,
    });
  } catch (err) {
    console.error(`${LOG} Error:`, err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
