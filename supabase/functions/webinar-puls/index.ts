// webinar-puls — seerens hjerteslag (skive 1, 30/9-2026).
//
// LEGITIMATIONEN er deltagertokenet (verifyDeltagertoken FØR enhver anden
// service-role-handling; verify_jwt = false). Ét svar for alt ugyldigt: 403.
//
// ÉT KALD GØR TRE TING, og svaret bærer resultatet (ingen Realtime for seerne —
// spec §D3: Pro-loftet er 500 forbindelser, og målet er 500 seere):
//   1. PULSER (højst 4 pr. kald, pr. enhed): hvad der er SET afgøres KUN af
//      serverens ur (webinarMotor/puls.ts:pulsDom mod ur.ts:positionDom).
//      Kroppen bærer aldrig en forventet position — en klient, der sender en,
//      får 400. Bits OR'es i ÉN transaktion (SQL-funktionen webinar_puls_skriv:
//      dedup på seq, set_bit, antal nye, pulsrækkerne og — når procenten krydser
//      et helt tal — tilmeldingens set_procent på eWebinars skala).
//      Over loftet (for tidligt, for mange enheder): 200 med «ignoreret», intet
//      skrevet — ALDRIG 429, som ville få klienten til at gentage.
//   2. HANDLINGER (højst 10): svar på en interaktion (også CTA-klik og
//      feedback), et spørgsmål til værten, en reaktion. Idempotent på klient_id
//      (webinar_motor_log_klient_uidx) og for svar også på (deltagelse, interaktion).
//      LOFT pr. (tilmelding, time) på spørgsmål (10) og reaktioner (120) —
//      rådets fund 30/9; tallene og regnestykket i puls.ts:HANDLING_LOFT_PR_TIME.
//      Talt i webinar_motor_log FØR indsættelsen; over loftet: «over_loft»,
//      intet skrevet (en gentagelse af et allerede modtaget klient_id: «dublet»).
//   3. SVARET: serverens ur, rummet, set_procent, værtens svar på seerens
//      spørgsmål (leveret «live» i samme øjeblik), «i rummet» (kun fra 10, aldrig
//      pustet op) og tidslinjens version.
//
// LOGGER ALDRIG PR. KALD. Ved 500 seere er det ~33 kald i sekundet, og
// Supabases loft er 100 log-hændelser pr. 10 s pr. function. Fejl tælles i
// hukommelsen og skrives som ÉN sum, af det første kald efter et minutskifte
// (udskrivFejlsum — det ENESTE console-kald i filen; webinarMotor.guard holder det).
//
// BEVISET: `motor: "boardroom-3"` (MOTOR_VERSION; skive 2 svarede «boardroom-2»).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { verifyDeltagertoken } from "../_shared/webinarDeltagerAuth.ts";
import { antalIRummet, hentRumData } from "../_shared/webinarMotorHent.ts";
import { positionDom } from "../_shared/webinarMotor/ur.ts";
import {
  antalStykker,
  HANDLING_LOFT_VINDUE_MS,
  type HandlingRaa,
  handlingUnderLoft,
  type LoftArt,
  I_RUMMET_SEK,
  laesPulsKrop,
  PULS_KENDTE_FELTER,
  type PulsAnker,
  pulsDom,
  pulsLoft,
  type PulsRaa,
  pulsServerTid,
  STYKKE_SEK,
  visAntalIRummet,
} from "../_shared/webinarMotor/puls.ts";
import { doemSvar, svarKanModtages, type Tidslinje } from "../_shared/webinarMotor/interaktioner.ts";
import { findMotorForbudte, MOTOR_VERSION } from "../_shared/webinarMotor/svar.ts";

// ── Fejlsummen: ét log pr. minut, aldrig ét pr. kald ─────────────────────────
const fejlsum = { minut: -1, antal: 0, grunde: new Map<string, number>() };

function noterFejl(grund: string): void {
  fejlsum.antal++;
  fejlsum.grunde.set(grund, (fejlsum.grunde.get(grund) ?? 0) + 1);
}

function udskrivFejlsum(nuMs: number): void {
  const minut = Math.floor(nuMs / 60_000);
  if (minut === fejlsum.minut) return;
  if (fejlsum.antal > 0) {
    console.error(`[webinar-puls] fejl i minut ${fejlsum.minut}: ${fejlsum.antal} — ${[...fejlsum.grunde].map(([g, n]) => `${g}×${n}`).join(", ")}`);
  }
  fejlsum.minut = minut;
  fejlsum.antal = 0;
  fejlsum.grunde.clear();
}

function json(body: Record<string, unknown>, status = 200): Response {
  const ud = { motor: MOTOR_VERSION, ...body };
  if (findMotorForbudte(ud).length > 0) {
    noterFejl("svar_afvist");
    return new Response(JSON.stringify({ motor: MOTOR_VERSION, fejl: "svar_afvist" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify(ud), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

interface Deltagelse {
  id: string;
  set_procent: number;
  enhed_tilstand: Record<string, { seq: number; pos_sek: number; server_ms: number; tilstand: string }>;
}

async function hentEllerOpret(admin: SupabaseClient, tilmeldingId: string, sessionId: string): Promise<Deltagelse | null> {
  const felter = "id, set_procent, enhed_tilstand";
  const { data } = await admin.from("webinar_deltagelser").select(felter).eq("tilmelding_id", tilmeldingId).eq("session_id", sessionId).maybeSingle();
  if (data) return { id: data.id, set_procent: Number(data.set_procent ?? 0), enhed_tilstand: (data.enhed_tilstand ?? {}) as Deltagelse["enhed_tilstand"] };
  await admin.from("webinar_deltagelser").upsert({ tilmelding_id: tilmeldingId, session_id: sessionId }, { onConflict: "tilmelding_id,session_id", ignoreDuplicates: true });
  const { data: ny, error } = await admin.from("webinar_deltagelser").select(felter).eq("tilmelding_id", tilmeldingId).eq("session_id", sessionId).maybeSingle();
  if (error || !ny) return null;
  return { id: ny.id, set_procent: Number(ny.set_procent ?? 0), enhed_tilstand: (ny.enhed_tilstand ?? {}) as Deltagelse["enhed_tilstand"] };
}

/** Pulserne fra én enhed → ét kald til webinar_puls_skriv. */
async function skrivEnhed(
  admin: SupabaseClient,
  a: { deltagelse: Deltagelse; tilmeldingId: string; enhed: string; pulser: PulsRaa[]; rd: { ur: Parameters<typeof positionDom>[0]; varighedSek: number }; nuMs: number },
): Promise<{ udfald: "skrevet" | "dublet" | "for_tidligt" | "for_mange_enheder" | "fejl"; setProcent: number | null }> {
  const kendt = a.deltagelse.enhed_tilstand[a.enhed] ?? null;
  const loft = pulsLoft(Object.keys(a.deltagelse.enhed_tilstand), a.enhed, kendt ? kendt.server_ms : null, a.nuMs);
  if (loft !== "ok") return { udfald: loft, setProcent: null };
  const nye = a.pulser.filter((p) => kendt === null || p.seq > kendt.seq).sort((x, y) => x.seq - y.seq);
  if (nye.length === 0) return { udfald: "dublet", setProcent: null };

  let anker: PulsAnker | null = kendt ? { posSek: kendt.pos_sek, serverMs: kendt.server_ms, tilstand: kendt.tilstand } : null;
  const sidsteKlientMs = nye[nye.length - 1].klient_ms;
  const fra: number[] = [], til: number[] = [], sFra: number[] = [], sTil: number[] = [];
  const raekker: Record<string, unknown>[] = [];
  let maksPos = 0, korrektioner = 0, lyd = false;
  for (const p of nye) {
    const serverMs = pulsServerTid(a.nuMs, sidsteKlientMs, p.klient_ms, anker ? anker.serverMs : null);
    const pos = positionDom(a.rd.ur, serverMs);
    const dom = pulsDom(anker, { posSek: p.pos_sek, tilstand: p.tilstand }, serverMs, pos.forventetPosSek, a.rd.varighedSek);
    if (dom.stykker) {
      fra.push(dom.stykker[0]); til.push(dom.stykker[1]);
      if (p.synlig) { sFra.push(dom.stykker[0]); sTil.push(dom.stykker[1]); }
    }
    const iAfspilning = pos.rum === "afspilning";
    raekker.push({
      seq: p.seq, klient_ms: Math.round(p.klient_ms), pos_sek: p.pos_sek, tilstand: p.tilstand, synlig: p.synlig, lyd: p.lyd,
      forventet_pos_sek: iAfspilning ? pos.forventetPosSek : null,
      afvigelse_sek: iAfspilning ? Math.round((p.pos_sek - pos.forventetPosSek) * 100) / 100 : null,
      korrigeret: p.korrigeret, rum: pos.rum,
    });
    maksPos = Math.max(maksPos, Math.min(p.pos_sek, a.rd.varighedSek));
    if (p.korrigeret) korrektioner++;
    if (p.lyd && p.tilstand === "spiller") lyd = true;
    anker = { posSek: p.pos_sek, serverMs, tilstand: p.tilstand };
  }
  const sidste = nye[nye.length - 1];
  const { data, error } = await admin.rpc("webinar_puls_skriv", {
    p_deltagelse_id: a.deltagelse.id,
    p_tilmelding_id: a.tilmeldingId,
    p_enhed: a.enhed,
    p_seq: sidste.seq,
    p_enhed_tilstand: { seq: sidste.seq, pos_sek: anker!.posSek, server_ms: anker!.serverMs, tilstand: anker!.tilstand },
    p_fra: fra, p_til: til, p_synlig_fra: sFra, p_synlig_til: sTil,
    p_antal_stykker: antalStykker(a.rd.varighedSek),
    p_varighed_sek: a.rd.varighedSek,
    p_maks_pos: maksPos,
    p_lyd: lyd,
    p_korrektioner: korrektioner,
    p_pulser: raekker,
  });
  if (error) {
    noterFejl(`rpc:${error.code ?? "?"}`);
    return { udfald: "fejl", setProcent: null };
  }
  const r = (Array.isArray(data) ? data[0] : data) as { ud_dublet: boolean; ud_set_procent: number } | null;
  if (!r) return { udfald: "fejl", setProcent: null };
  return { udfald: r.ud_dublet ? "dublet" : "skrevet", setProcent: Number(r.ud_set_procent) };
}

/** Loggede handlinger af én art for én tilmelding i den seneste time (null = kunne ikke tælles). */
async function antalIVinduet(admin: SupabaseClient, tilmeldingId: string, art: LoftArt, nuMs: number): Promise<number | null> {
  const { count, error } = await admin
    .from("webinar_motor_log")
    .select("id", { count: "exact", head: true })
    .eq("tilmelding_id", tilmeldingId)
    .eq("art", art)
    .gte("tid", new Date(nuMs - HANDLING_LOFT_VINDUE_MS).toISOString());
  return error ? null : count ?? 0;
}

/** Én handling. Loggen (klient_id unik pr. tilmelding) er idempotensen. */
async function udfoerHandling(
  admin: SupabaseClient,
  h: HandlingRaa,
  a: { tilmeldingId: string; sessionId: string; deltagelseId: string; rum: string; posSek: number; tidslinje: Tidslinje | null; nuMs: number; talt: Map<LoftArt, number> },
): Promise<string> {
  const interaktion = h.interaktion_id && a.tidslinje ? a.tidslinje.interaktioner.find((i) => i.id === h.interaktion_id) ?? null : null;
  const logArt = h.art === "svar" ? (interaktion?.art === "cta" ? "cta_klik" : interaktion?.art === "feedback" ? "feedback" : "svar") : h.art;

  if (h.art === "svar") {
    if (!interaktion || !a.tidslinje) return "ukendt_interaktion";
    if (!svarKanModtages(interaktion, a.rum, a.posSek)) return "ikke_aktiv";
    const dom = doemSvar(interaktion, h.svar);
    if (!dom.ok) return `ugyldig:${dom.fejl}`;
    const { data: ind, error } = await admin.from("webinar_svar").upsert({
      deltagelse_id: a.deltagelseId, tilmelding_id: a.tilmeldingId, session_id: a.sessionId,
      interaktion_id: interaktion.id, tidslinje_version: a.tidslinje.version, art: interaktion.art, svar: dom.svar,
      pos_sek: a.rum === "afspilning" ? a.posSek : null,
    }, { onConflict: "deltagelse_id,interaktion_id", ignoreDuplicates: true }).select("id");
    if (error) { noterFejl("svar"); return "fejl"; }
    await admin.from("webinar_motor_log").upsert(
      { kilde: "klient", art: logArt, tilmelding_id: a.tilmeldingId, session_id: a.sessionId, klient_id: h.klient_id, data: { interaktion_id: interaktion.id, version: a.tidslinje.version, ...(interaktion.art === "feedback" ? { stjerner: (dom.svar as { stjerner: number }).stjerner } : {}), ...(interaktion.art === "cta" ? { maal: (dom.svar as { maal: string }).maal } : {}) } },
      { onConflict: "tilmelding_id,klient_id", ignoreDuplicates: true },
    );
    return ind && ind.length === 1 ? "ok" : "dublet";
  }

  // LOFTET — talt FØR indsættelsen. Én tælling pr. art pr. kald; resten af
  // kaldet lægger sine egne skrivninger til i hukommelsen (`talt`).
  const loftArt: LoftArt = h.art;
  let talt = a.talt.get(loftArt);
  if (talt === undefined) {
    const n = await antalIVinduet(admin, a.tilmeldingId, loftArt, a.nuMs);
    if (n === null) { noterFejl("loft"); return "fejl"; } // fail-closed: kan vi ikke tælle, skriver vi ikke
    talt = n;
    a.talt.set(loftArt, talt);
  }
  if (!handlingUnderLoft(loftArt, talt)) {
    // En gentagelse af et klient_id, der ALLEREDE er modtaget, er stadig «dublet» — ikke afvist.
    const { data: kendt } = await admin.from("webinar_motor_log").select("id").eq("tilmelding_id", a.tilmeldingId).eq("klient_id", h.klient_id).maybeSingle();
    return kendt ? "dublet" : "over_loft";
  }

  // Spørgsmål og reaktion: loggen FØRST — den er idempotensen (klient_id).
  const { data: logget, error: logFejl } = await admin.from("webinar_motor_log").upsert(
    { kilde: "klient", art: logArt, tilmelding_id: a.tilmeldingId, session_id: a.sessionId, klient_id: h.klient_id, data: h.art === "reaktion" ? { emoji: h.emoji, stykke: Math.floor(a.posSek / STYKKE_SEK) } : {} },
    { onConflict: "tilmelding_id,klient_id", ignoreDuplicates: true },
  ).select("id");
  if (logFejl) { noterFejl("log"); return "fejl"; }
  if (!logget || logget.length === 0) return "dublet";
  a.talt.set(loftArt, talt + 1);

  if (h.art === "spoergsmaal") {
    const { error } = await admin.from("webinar_spoergsmaal").insert({
      session_id: a.sessionId, tilmelding_id: a.tilmeldingId, tekst: h.tekst,
      pos_sek: a.rum === "afspilning" ? a.posSek : null, art: "spoergsmaal",
    });
    if (error) { noterFejl("spoergsmaal"); return "fejl"; }
    return "ok";
  }
  // reaktion
  if (a.rum !== "afspilning") return "ikke_aktiv";
  const { error } = await admin.rpc("webinar_reaktion_tael", { p_session_id: a.sessionId, p_stykke: Math.floor(a.posSek / STYKKE_SEK), p_emoji: h.emoji });
  if (error) { noterFejl("reaktion"); return "fejl"; }
  return "ok";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const nuMs = Date.now();
  udskrivFejlsum(nuMs);
  if (req.method !== "POST") return json({ fejl: "kun_post" }, 405);

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ukendte = ukendteFelter(body, PULS_KENDTE_FELTER);
    if (ukendte.length > 0) return json({ fejl: ukendteFelterBesked(ukendte, PULS_KENDTE_FELTER) }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── TOKENET FØRST ─────────────────────────────────────────────────────
    const dom = await verifyDeltagertoken(body?.t, admin);
    if (!dom.ok) return json({ fejl: "ukendt" }, 403);
    const d = dom.deltager;

    const krop = laesPulsKrop(body?.puls, body?.handlinger);
    if (!krop.ok) return json({ fejl: krop.fejl }, 400);

    const hentet = await hentRumData(admin, d.session_id, nuMs);
    if (!hentet.ok) { noterFejl("rumdata"); return json({ fejl: "session" }, 500); }
    const rd = hentet.data;
    const pos = positionDom(rd.ur, nuMs);
    const lukket = pos.rum === "foer_lobby" || pos.rum === "aflyst";

    const pulsUd = { modtaget: krop.pulser.length, skrevet: 0, dubletter: 0, ignoreret: {} as Record<string, number> };
    const handlingerUd: Array<{ klient_id: string; udfald: string }> = [];
    let setProcent: number | null = null;

    const deltagelse = lukket ? null : await hentEllerOpret(admin, d.id, d.session_id);
    if (!lukket && !deltagelse) noterFejl("deltagelse");

    if (deltagelse) {
      setProcent = deltagelse.set_procent;
      // 1. Pulserne — kun i et rum, hvor der kan ses noget.
      const enheder = new Map<string, PulsRaa[]>();
      for (const p of krop.pulser) enheder.set(p.enhed_id, [...(enheder.get(p.enhed_id) ?? []), p]);
      for (const [enhed, pulser] of enheder) {
        if (pos.rum === "afsluttet") { pulsUd.ignoreret.rum = (pulsUd.ignoreret.rum ?? 0) + pulser.length; continue; }
        const r = await skrivEnhed(admin, { deltagelse, tilmeldingId: d.id, enhed, pulser, rd: { ur: rd.ur, varighedSek: rd.webinar.varighed_sek }, nuMs });
        if (r.udfald === "skrevet") pulsUd.skrevet += pulser.length;
        else if (r.udfald === "dublet") pulsUd.dubletter += pulser.length;
        else pulsUd.ignoreret[r.udfald] = (pulsUd.ignoreret[r.udfald] ?? 0) + pulser.length;
        if (r.setProcent !== null) setProcent = Math.max(setProcent ?? 0, r.setProcent);
      }
      // 2. Handlingerne — loftet tælles én gang pr. art pr. kald.
      const talt = new Map<LoftArt, number>();
      for (const h of krop.handlinger) {
        const udfald = await udfoerHandling(admin, h, { tilmeldingId: d.id, sessionId: d.session_id, deltagelseId: deltagelse.id, rum: pos.rum, posSek: pos.forventetPosSek, tidslinje: rd.tidslinje, nuMs, talt });
        handlingerUd.push({ klient_id: h.klient_id, udfald });
      }
    } else {
      for (const h of krop.handlinger) handlingerUd.push({ klient_id: h.klient_id, udfald: "rummet_er_lukket" });
      if (krop.pulser.length > 0) pulsUd.ignoreret.rum = krop.pulser.length;
    }

    // 3. Værtens svar på seerens spørgsmål — leveret live i samme øjeblik.
    let svarUd: Array<{ spoergsmaal_id: string; spoergsmaal: string; svar: string; svaret_at: string | null }> = [];
    if (!lukket) {
      const { data: besvaret } = await admin
        .from("webinar_spoergsmaal")
        .select("id, tekst, svar_tekst, svaret_at")
        .eq("tilmelding_id", d.id)
        .eq("status", "besvaret")
        .is("leveret", null)
        .limit(10);
      if (besvaret && besvaret.length > 0) {
        const ids = besvaret.map((s) => s.id as string);
        const { data: leveret } = await admin
          .from("webinar_spoergsmaal")
          .update({ leveret: "live", leveret_at: new Date(nuMs).toISOString() })
          .in("id", ids)
          .is("leveret", null)
          .select("id");
        const lev = new Set((leveret ?? []).map((x) => x.id as string));
        svarUd = besvaret.filter((s) => lev.has(s.id as string)).map((s) => ({ spoergsmaal_id: s.id as string, spoergsmaal: s.tekst as string, svar: (s.svar_tekst as string) ?? "", svaret_at: (s.svaret_at as string | null) ?? null }));
      }
    }

    const iRummet = lukket ? null : await antalIRummet(admin, d.session_id, nuMs, I_RUMMET_SEK);

    return json({
      server_nu_ms: nuMs,
      rum: pos.rum,
      forventet_pos_sek: pos.forventetPosSek,
      sek_til_start: pos.sekTilStart,
      set_procent: setProcent,
      pulser: pulsUd,
      handlinger: handlingerUd,
      svar: svarUd,
      i_rummet: iRummet === null ? null : visAntalIRummet(iRummet),
      tidslinje_version: rd.tidslinje?.version ?? null,
    });
  } catch (_err) {
    noterFejl("uventet");
    return json({ fejl: "uventet" }, 500);
  }
});
