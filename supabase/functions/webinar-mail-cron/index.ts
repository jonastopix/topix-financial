// webinar-mail-cron — platformens syv før-webinar-mails (22/9-2026; den syvende 28/9).
//
// JONAS 22/9: platformen sender selv mailene før en session; Klaviyo beholder
// efter-webinaret, og eWebinars danske bekræftelse (med sin rigtige invite.ics)
// bliver. Grunden er målt: 159 af 384 tilmeldte så webinaret 22/9 — ca. 40 %.
//
// SAMME FORM SOM meta-send-cron: HTTP-indgang, authenticateServiceRole FØRST
// bag verify_jwt = true (Bucket B), TØRKØRSEL SOM STANDARD, og en LÅS
// (app_config['webinar_mail_aktiv'], standard false). Uden body regnes der og
// svares med tallene; intet sendes, og intet skrives i sporet.
//
//   RIGTIG AFSENDELSE KRÆVER BEGGE: dry_run: false OG låsen.
//   Ét felt mere — `email` — begrænser kørslen til ÉN adresse, og `art` til
//   ÉN mail. Det er prøven: én mail af hver art til jonas@topix.dk, FØR låsen
//   slås til. Prøven virker uden låsen, netop fordi den er begrænset til én
//   adresse; det er den ene undtagelse, og den står her, ikke i en kommentar.
//
// BEKRÆFTELSEN GÅR IKKE BAGUD (Jonas 22/9 ca. 19:05): dommens BEKRAEFTELSE_FRA
// = 22/9-2026 17:03Z holder arten «bekraeftelse» til tilmeldinger, der er
// kommet EFTER eWebinars egen bekræftelse blev slukket. De ældre tælles som
// «for_tidlig_tilmelding». De seks påmindelser er urørte og går til alle.
//
// «FJORTEN_DAGE» (Jonas 28/9): de ~217, der tilmeldte sig 13/10 FØR 22/9 kl.
// 19:03, har aldrig fået en kalenderinvitation — og bekræftelsen går ikke bagud.
// Derfor bærer «om to uger»-påmindelsen den samme invite.ics som bekræftelsen
// (dommens MED_INVITATION) og går ad samme MIME-vej. Den går til ALLE tilmeldte
// til en kommende session, uden BEKRAEFTELSE_FRA-port; nåden er den samme to
// timer som de andre påmindelser. Migrationen 20260928120000 (CHECK'ene på art
// og invitation) SKAL være kørt, FØR den her udrulles: ellers sendes mailen,
// rækken i sporet afvises, og næste kørsel sender den IGEN.
//
// HVEM, HVAD, HVORNÅR bor i _shared/webinarMailDom.ts (ren, spejlet, prøvet).
// TEKSTEN bor i _shared/webinarMailTekster.ts (Mortens fire fra Klaviyo-flowet
// UiECQS + den nye «om en time»). AFSENDELSEN i _shared/mailgunAfsendelse.ts
// (Mailgun EU — Lovables loft er 300 app-mails/time pr. workspace, og én
// udsendelse til 384 overskrider det i sig selv).
//
// «ÉN MAIL PR. (PERSON, SESSION, ART)» ER DATABASENS DOM, ikke kodens:
// webinar_mails har et delvist unikt indeks WHERE udfald = 'ok'. Vi læser de
// allerede sendte FØRST for ikke at bygge 384 mails for at få 384 afvisninger
// — men det er indekset, der forhindrer to samtidige kørsler i at sende det
// samme. Skrivningen sker DERFOR EFTER afsendelsen, og et 23505 dér er ikke
// en fejl: det betyder, at en anden kørsel nåede det først.
//
// LOFTET (29/9-2026, _shared/webinarMailLoft.ts): 29/9 kl. 08:09 gik
// «fjorten_dage» til 319, Mailgun-kontoen er på probation med 100 mails i
// timen, og de 211, der ikke kom igennem, blev forsøgt igen ved HVER kørsel —
// 2.125 forsøg — fordi løkken hverken havde en grænse eller et stop. Nu regner
// beregnKoerselsLoft FØR løkken, hvor mange kald kørslen må gøre (loft − alle
// forsøg de sidste 60 min), og er der et 403/420/429 i vinduet, sendes INTET
// før timen er gået (pause). I løkken stopper et 403/420/429 kørslen med det
// samme — EFTER sporet er skrevet. Det, der ikke nås, hedder «over_loft» i
// svaret og er ikke en fejl: det tages i en senere kørsel, så længe dommens
// nåde holder. Rækkefølgen i sendinger er dommens: bekræftelser først, derefter
// ældste planlagte (webinarMailDom.planlaegKoersel).
//
// INDHENTNINGEN (Jonas 29/9-2026): en mail, vi HAR forsøgt og fejlede med, er
// bevis for, at personen var klar til tiden — den droppes ikke efter nåden, men
// indhentes til den næste arts dato (dommens INDHENTNING i doemMail). Cronen
// læser derfor de fejlede nøgler (udfald <> 'ok') med SAMME afgrænsning som de
// sendte og giver dem til planlaegKoersel som `fejlede`. Uden dem er dommen
// ordret som før, og en fejlet mail bliver for_sent to timer efter sit tidspunkt.
//
// BODY (STRIKS, bodyFelter.guard): dry_run · email · art · nu.
//
// KASTER ALDRIG mod én mail: fejler én, tælles den, og de andre sendes.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { ARTER, baererInvitation, type MailArt, noegle, planlaegKoersel, type Sending, type Springgrund, type Tilmeldt } from "../_shared/webinarMailDom.ts";
import { AFSENDER, bygWebinarMail, SVAR_TIL } from "../_shared/webinarMailTekster.ts";
import { MAILGUN_DOMAENE, MAILGUN_SECRET, PAUSE_MS, sendMailgun, sendMailgunMime } from "../_shared/mailgunAfsendelse.ts";
import { beregnKoerselsLoft, erStopStatus, LOFT_VINDUE_MS, type LoftRaekke, MAILGUN_LOFT_PR_TIME } from "../_shared/webinarMailLoft.ts";
import { bygMime, hentInvitation, type InvitationUdfald } from "../_shared/mimeInvitation.ts";
import { AFMELD_SECRET, afmeldUrl, byggAfmeldToken } from "../_shared/webinarAfmeldToken.ts";

const LOG = "[webinar-mail-cron]";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "email", "art", "nu"] as const;

/** Låsen. Standard false — som meta_send_aktiv og ga_send_aktiv. */
export const LAAS_NOEGLE = "webinar_mail_aktiv";

/** Tidsbudget: cron-timeouten er 60 s (kald_edge); hver mail op til 10 s. */
export const BUDGET_MS = 45_000;
const SIDE = 1000;
const EKSEMPLER_MAKS = 10;

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export interface MailResultat {
  ok: boolean;
  dry_run: boolean;
  laas_aktiv: boolean;
  /** dry_run: false OG (låsen ELLER kørslen er begrænset til én adresse). */
  sender_rigtigt: boolean;
  nu: string;
  email: string | null;
  art: string | null;
  tilmeldinger_laest: number;
  afmeldte_laest: number;
  sendte_foer: number;
  /** Nøgler med mindst ét fejlet forsøg (udfald <> 'ok') i vinduet — grundlaget for indhentningen. */
  fejlede_foer: number;
  /** Mails, der SKAL sendes nu. */
  skal_sendes: number;
  sprunget: Record<Springgrund, number>;
  /** Af skal_sendes: mails, der indhentes efter et fejlet forsøg (dommens `indhentning`). */
  indhentet: number;
  sendt: number;
  fejlede: number;
  /** Ikke nået inden for budgettet — tages om fem minutter. */
  udsat: number;
  /** Den anden kørsel nåede det først (23505 på det unikke indeks). */
  dublet: number;
  /** Mails af en art i MED_INVITATION (bekraeftelse, fjorten_dage) sendt MED den vedhæftede invitation. */
  med_invitation: number;
  /** Samme arter sendt UDEN — hentningen fejlede (fail-soft), grunden står i sporet. */
  uden_invitation: number;
  /** Loftet for denne kørsel (webinarMailLoft.ts): forsøg de sidste 60 min, maks, og en pause, hvis Mailgun har sagt stop. */
  loft: {
    forsoeg_60_min: number;
    maks: number;
    pause: { grund: string; til: string } | null;
    /** Statuskoden, der stoppede løkken i DENNE kørsel (403/420/429) — ellers null. */
    stoppet_ved: number | null;
  };
  /** Mails, der skulle sendes, men ikke blev forsøgt: loftet var nået, eller Mailgun sagde stop. Tages i en senere kørsel — ikke en fejl. */
  over_loft: number;
  eksempler: { email: string; art: MailArt; session_tid: string; indhentning?: true; udfald?: string }[];
  fejl: string[];
}

/** Hent alle rækker i sider — aldrig et tavst loft. */
async function alleSider<T>(byg: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const ud: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await byg(fra, fra + SIDE - 1);
    if (error) throw new Error(error.message);
    const side = data ?? [];
    ud.push(...side);
    if (side.length < SIDE) return ud;
  }
}

async function laasErAktiv(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin.from("app_config").select("config_value").eq("config_key", LAAS_NOEGLE).maybeSingle();
    const v = (data as { config_value?: unknown } | null)?.config_value;
    return v === true || v === "true";
  } catch (e) {
    console.error(`${LOG} kunne ikke læse låsen — fail-closed:`, e);
    return false;
  }
}

const tomt = (a: { toer: boolean; laas: boolean; email: string | null; art: string | null; nu: Date; senderRigtigt: boolean }): MailResultat => ({
  ok: true, dry_run: a.toer, laas_aktiv: a.laas, sender_rigtigt: a.senderRigtigt,
  nu: a.nu.toISOString(), email: a.email, art: a.art,
  tilmeldinger_laest: 0, afmeldte_laest: 0, sendte_foer: 0, fejlede_foer: 0, skal_sendes: 0,
  sprunget: { afmeldt: 0, ingen_session: 0, ingen_mail: 0, for_sent: 0, endnu_ikke: 0, sessionen_begyndt: 0, allerede_sendt: 0, for_tidlig_tilmelding: 0, for_sent_efter_fejl: 0 },
  indhentet: 0, sendt: 0, fejlede: 0, udsat: 0, dublet: 0, med_invitation: 0, uden_invitation: 0,
  loft: { forsoeg_60_min: 0, maks: MAILGUN_LOFT_PR_TIME, pause: null, stoppet_ved: null }, over_loft: 0,
  eksempler: [], fejl: [],
});

async function koer(a: { admin: SupabaseClient; toerKoersel: boolean; laas: boolean; email: string | null; art: MailArt | null; nu: Date; startMs: number; basis: string }): Promise<MailResultat> {
  // RIGTIG AFSENDELSE: dry_run: false OG (låsen ELLER én navngiven adresse).
  const senderRigtigt = !a.toerKoersel && (a.laas || a.email !== null);
  const r = tomt({ toer: a.toerKoersel, laas: a.laas, email: a.email, art: a.art, nu: a.nu, senderRigtigt });

  // 1. Tilmeldingerne. Kun sessioner i fremtiden eller lige overstået — en
  //    session fra i fjor har ingen mails til gode, og at læse dem alle ville
  //    være at bygge 600 domme for at kaste dem væk.
  const graense = new Date(a.nu.getTime() - 3 * 86_400_000).toISOString();
  const raekker = await alleSider<Tilmeldt>((fra, til) => {
    let q = a.admin.from("webinar_tilmeldinger")
      .select("ewebinar_id, email, navn, session_tid, registreret_at, webinar_titel, subscribed, sidste_action, join_link, kalender_link, replay_link")
      .gte("session_tid", graense);
    if (a.email) q = q.eq("email", a.email);
    return q.order("ewebinar_id", { ascending: true }).range(fra, til);
  });
  r.tilmeldinger_laest = raekker.length;

  // 2. De afmeldte (vores egen tabel; eWebinars «unsubscribed» læses af dommen).
  const afmeldteRaekker = await alleSider<{ email: string }>((fra, til) =>
    a.admin.from("webinar_afmeldinger").select("email").order("email", { ascending: true }).range(fra, til));
  const afmeldte = new Set(afmeldteRaekker.map((x) => x.email.trim().toLowerCase()));
  r.afmeldte_laest = afmeldte.size;

  // 3. Det, der ALLEREDE er sendt.
  const sendteRaekker = await alleSider<{ email: string; session_tid: string; art: MailArt }>((fra, til) =>
    a.admin.from("webinar_mails").select("email, session_tid, art").eq("udfald", "ok")
      .gte("session_tid", graense).order("id", { ascending: true }).range(fra, til));
  const sendte = new Set(sendteRaekker.map((x) => noegle(x.email, x.session_tid, x.art)));
  r.sendte_foer = sendte.size;

  // 3b. Det, vi har FORSØGT og fejlet med (29/9) — samme afgrænsning som de
  //     sendte. En nøgle med både et fejlet og et ok-forsøg er sendt:
  //     allerede_sendt går foran indhentningen i dommen.
  const fejledeRaekker = await alleSider<{ email: string; session_tid: string; art: MailArt }>((fra, til) =>
    a.admin.from("webinar_mails").select("email, session_tid, art").neq("udfald", "ok")
      .gte("session_tid", graense).order("id", { ascending: true }).range(fra, til));
  const fejlede = new Set(fejledeRaekker.map((x) => noegle(x.email, x.session_tid, x.art)));
  r.fejlede_foer = fejlede.size;

  // 4. Dommen.
  const plan = planlaegKoersel({ raekker, afmeldte, sendte, fejlede, nu: a.nu });
  r.sprunget = plan.sprunget;
  const sendinger = a.art ? plan.sendinger.filter((s) => s.art === a.art) : plan.sendinger;
  r.skal_sendes = sendinger.length;
  r.indhentet = sendinger.filter((s) => s.indhentning === true).length;
  for (const s of sendinger.slice(0, EKSEMPLER_MAKS)) {
    r.eksempler.push({ email: s.email, art: s.art, session_tid: s.sessionTid, ...(s.indhentning === true ? { indhentning: true as const } : {}) });
  }

  // 4b. LOFTET (29/9): hvor mange kald må denne kørsel gøre hos Mailgun? Alle
  //     forsøg de sidste 60 min tælles — også de afviste. Regnes på RIGTIG tid,
  //     ikke på `nu`: `nu` flytter uret for dommen (prøven), men Mailguns time
  //     går i virkeligheden. Én forespørgsel, tre felter.
  const loftNu = new Date();
  const loftRaekker = await alleSider<LoftRaekke>((fra, til) =>
    a.admin.from("webinar_mails").select("forsoegt_at, udfald, status")
      .gte("forsoegt_at", new Date(loftNu.getTime() - LOFT_VINDUE_MS).toISOString())
      .order("forsoegt_at", { ascending: true }).range(fra, til));
  const loft = beregnKoerselsLoft({ seneste: loftRaekker, loft: MAILGUN_LOFT_PR_TIME, nu: loftNu });
  r.loft = {
    forsoeg_60_min: loftRaekker.length,
    maks: loft.maks,
    pause: loft.pause ? { grund: loft.pause.grund, til: loft.pause.til.toISOString() } : null,
    stoppet_ved: null,
  };
  // Det, denne kørsel IKKE når: alt ved pause, ellers resten over maks. Tælles
  // her, så en tørkørsel viser det; den rigtige løkke tæller forfra.
  r.over_loft = loft.pause ? sendinger.length : Math.max(0, sendinger.length - loft.maks);
  if (loft.pause) console.error(`${LOG} PAUSE: ${loft.pause.grund} — ${sendinger.length} mails venter til ${loft.pause.til.toISOString()}`);

  if (!senderRigtigt) return r;

  // 5. Afsendelsen — én ad gangen, inden for budgettet.
  const mailgunNoegle = Deno.env.get(MAILGUN_SECRET);
  const afmeldSecret = Deno.env.get(AFMELD_SECRET);
  if (!afmeldSecret) {
    // Uden afmeldingslink sendes INTET. En servicemail uden en vej ud er ikke
    // en servicemail — og List-Unsubscribe-headeren ville pege på ingenting.
    r.fejl.push(`${AFMELD_SECRET} mangler — intet sendt`);
    console.error(`${LOG} ${AFMELD_SECRET} mangler — intet sendt`);
    return r;
  }

  // Mailgun har sagt stop inden for den sidste time: intet sendes, alt står som over_loft.
  if (loft.pause) return r;

  r.over_loft = 0;
  let forsoegt = 0;
  for (let i = 0; i < sendinger.length; i++) {
    const s = sendinger[i];
    // LOFTET FØRST: over maks forsøges intet — heller ikke ics-hentningen.
    if (forsoegt >= loft.maks) { r.over_loft++; continue; }
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    const token = await byggAfmeldToken(afmeldSecret, s.email);
    const link = afmeldUrl(a.basis, token);
    // BEKRÆFTELSEN OG «OM TO UGER» BÆRER INVITATIONEN (dommens MED_INVITATION)
    // — og den hentes FØR mailen bygges, fordi TEKSTEN skal vide, om den kom
    // med (Jonas 28/9): «invitationen er vedhæftet» må kun stå i en mail, der
    // faktisk bærer den. FAIL-SOFT: kan filen ikke hentes, går mailen alligevel
    // — uden filen, og med en tekst, der peger på kalenderrækken i stedet.
    let invitation: InvitationUdfald | null = null;
    let ics: string | null = null;
    if (baererInvitation(s.art)) {
      const inv = await hentInvitation(s.kalenderLink);
      invitation = inv.udfald;
      ics = inv.ics;
      if (inv.udfald === "hentet") r.med_invitation++; else r.uden_invitation++;
      if (inv.udfald !== "hentet") console.error(`${LOG} invitationen kunne ikke hentes (${inv.udfald}): ${inv.grund ?? ""}`);
    }
    const mail = bygWebinarMail({
      art: s.art,
      sessionTid: s.sessionTid,
      webinarTitel: s.webinarTitel,
      joinLink: s.joinLink,
      kalenderLink: s.kalenderLink,
      afmeldUrl: link,
      invitationVedhaeftet: ics !== null,
    });
    // Mailguns `/messages` kan ikke sætte Content-Type pr. vedhæftning (se
    // _shared/mimeInvitation.ts). Derfor bygges MIME'en selv og sendes til
    // `/messages.mime`. De fem andre påmindelser har ingen vedhæftning og
    // bliver på den almindelige vej.
    let spor;
    forsoegt++;
    if (baererInvitation(s.art)) {
      const mime = bygMime({
        til: s.email, fra: AFSENDER, emne: mail.subject, html: mail.html, tekst: mail.text,
        svarTil: SVAR_TIL, afmeldUrl: link, ics, domaene: MAILGUN_DOMAENE,
      });
      spor = await sendMailgunMime(mailgunNoegle, s.email, mime);
    } else {
      spor = await sendMailgun(mailgunNoegle, {
        til: s.email, fra: AFSENDER, emne: mail.subject, html: mail.html, tekst: mail.text,
        svarTil: SVAR_TIL, afmeldUrl: link,
      });
    }
    if (spor.udfald === "ok") r.sendt++; else { r.fejlede++; r.fejl.push(`${s.art}: ${spor.udfald}${spor.grund ? ` — ${spor.grund}` : ""}`); }
    const eks = r.eksempler.find((e) => e.email === s.email && e.art === s.art);
    if (eks) eks.udfald = spor.udfald;

    // 6. Sporet — EFTER afsendelsen. Et 23505 betyder, at en anden kørsel nåede
    //    det først; mailen er så sendt to gange, og DET skal kunne ses.
    const { error } = await a.admin.from("webinar_mails").insert({
      email: s.email, session_tid: s.sessionTid, art: s.art, udfald: spor.udfald,
      status: spor.status, varighed_ms: spor.varighed_ms, mailgun_id: spor.mailgun_id,
      emne: mail.subject, svar: spor.svar, grund: spor.grund, ewebinar_id: s.ewebinarId,
      invitation,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        r.dublet++;
        console.error(`${LOG} DUBLET: ${s.art} til en adresse for ${s.sessionTid} var allerede sendt — to kørsler har kørt samtidig`);
      } else {
        r.fejl.push(`sporet kunne ikke skrives (${s.art}): ${error.message}`);
        console.error(`${LOG} sporet kunne IKKE skrives:`, error.message);
      }
    }
    // MAILGUN SAGDE STOP (29/9): 403 · 420 · 429 — resten af kørslen venter.
    // Sporet er skrevet ovenfor, så rækken med svaret findes, når næste kørsel
    // regner sin pause. De næste ville få nøjagtig samme svar.
    if (erStopStatus(spor.status)) {
      r.loft.stoppet_ved = spor.status;
      r.over_loft += sendinger.length - i - 1;
      console.error(`${LOG} STOP: Mailgun svarede ${spor.status} — kørslen stopper; ${sendinger.length - i - 1} mails venter til efter pausen`);
      break;
    }
    if (PAUSE_MS > 0) await new Promise((klar) => setTimeout(klar, PAUSE_MS));
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startMs = Date.now();

  const auth = await authenticateServiceRole(req);
  if (auth instanceof Response) return auth;

  // En tom body er en tørkørsel — kald_edge sender altid '{}', men en
  // håndkørsel uden krop skal ikke være en fejl.
  const raaBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ error: "ukendte_felter", besked }, 400);
  }

  const toerKoersel = raaBody.dry_run !== false;
  const email = typeof raaBody.email === "string" && raaBody.email.includes("@") ? raaBody.email.trim().toLowerCase() : null;
  const artRaa = typeof raaBody.art === "string" ? raaBody.art : null;
  if (artRaa !== null && !(ARTER as readonly string[]).includes(artRaa)) {
    return json({ error: "art_ugyldig", kendte: ARTER }, 400);
  }
  const nu = typeof raaBody.nu === "string" && Number.isFinite(Date.parse(raaBody.nu)) ? new Date(raaBody.nu) : new Date();

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const laas = await laasErAktiv(admin);
  // Afmeldingslinkets base: functionens søsterendepunkt i samme projekt.
  const basis = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/webinar-afmeld`;

  try {
    const r = await koer({ admin, toerKoersel, laas, email, art: artRaa as MailArt | null, nu, startMs, basis });
    console.log(`${LOG} ${r.dry_run ? "TØRKØRSEL" : r.sender_rigtigt ? "SENDER" : "LÅST"} — skal_sendes ${r.skal_sendes} (indhentet ${r.indhentet}), sendt ${r.sendt}, fejlede ${r.fejlede}, udsat ${r.udsat}, over_loft ${r.over_loft} (maks ${r.loft.maks}${r.loft.pause ? ", PAUSE" : ""})`);
    return json(r);
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
});
