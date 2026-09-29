import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for platformens før-webinar-mails (22/9-2026). Elleve domme, hver
 * bevist på en kopi med fejlen indsat:
 *
 *   1. BUCKET B + LÅS: webinar-mail-cron kalder authenticateServiceRole FØRST,
 *      tørkører som standard, og sender kun rigtigt ved dry_run: false OG
 *      (låsen ELLER én navngiven adresse). Låsen læses fail-closed.
 *   2. EU, OG SPORING SLÅET FRA: afsendelsen går til api.eu.mailgun.net (aldrig
 *      api.mailgun.net), og o:tracking/-clicks/-opens er alle «no».
 *      Nøglen læses ÉT sted — cronen — og aldrig i afsendelsesfilen.
 *      (Dømmes på RÅ kilde uden blok-kommentarer: en URL bærer to skråstreger.)
 *   3. SPORET EFTER AFSENDELSEN: rækken i webinar_mails skrives EFTER kaldet,
 *      og et 23505 tælles som dublet frem for at vælte kørslen. Det unikke
 *      indeks findes i migrationen.
 *   4. TOKENET FØRST i webinar-afmeld: laesAfmeldToken FØR createClient, og
 *      svaret røber aldrig, om adressen findes.
 *   5. INGEN KLAVIYO-TAGS i skabelonerne, og afmeldingslinket er vores eget.
 *   6. LINKENE ER PERSONLIGE: join_link, kalender_link og replay_link står på
 *      webinar-delts forbudte nøgler — de må aldrig ud til en ekstern.
 *   7. ÉT KLIK, ÉN BETYDNING: webinar-afmeld kalder afmeldHvisNoegle med
 *      kilden «webinar_mail», og den værdi står BÅDE i AFMELD_KILDER og i
 *      migrationens CHECK. Kaldet er fail-soft og kommer EFTER vores egen
 *      skrivning — Klaviyo må ikke kunne forhindre en afmelding hos os.
 *   8. INVITATIONEN GÅR GENNEM MIME'EN: arterne i dommens MED_INVITATION
 *      (bekraeftelse, fjorten_dage) bruger sendMailgunMime — cronen dømmer på
 *      LISTEN (baererInvitation), ikke på et artsnavn — invitationen hentes
 *      fail-soft, og Content-Type'en er ORDRET den, Outlook kræver for Ja/Nej.
 *   9. BEKRÆFTELSEN GÅR ALDRIG BAGUD: BEKRAEFTELSE_FRA står ORDRET som
 *      22/9-2026 17:03Z i BEGGE spejle, dommen sammenligner tilmeldingens
 *      registreret_at mod den fail-closed, og cronen LÆSER kolonnen.
 *      Uden den linje ville 216 mennesker få en bekræftelse, de har fået før.
 *  10. ART-LISTERNE ER I TAKT MED DATABASEN (28/9): ARTER og MED_INVITATION i
 *      dommen er tegn for tegn de to CHECK'er i den nyeste migration, i begge
 *      spejle — og «fjorten_dage» står i begge med sin plan (14 dage, 08:00).
 *      En art, CHECK'en ikke kender, ville sende mailen, tabe sin række i
 *      sporet og sende IGEN fem minutter senere.
 *  11. TEKSTEN FØLGER INVITATIONEN (28/9): cronen henter filen FØR mailen
 *      bygges og giver `invitationVedhaeftet: ics !== null` videre; feltet er
 *      KRÆVET på MailArgs (ikke `?`), og `indhold` får flaget — aldrig en
 *      konstant. Uden det siger en fail-soft-mail «vedhæftet» om en fil, der
 *      ikke er der.
 *  12. LOFTET FØR LØKKEN, STOP I LØKKEN (29/9, mailFejl.guard-mønstret): cronen
 *      kalder beregnKoerselsLoft FØR løkken, sender intet ved pause, forsøger
 *      højst maks, og bryder løkken (break) ved 403/420/429 — EFTER sporet er
 *      skrevet. Loftet er 90 og stop-koderne 403 · 420 · 429 i motoren. Uden
 *      det blev 211 mails forsøgt 2.125 gange på to timer, og Mailgun spærrede.
 *  13. DE FEJLEDE INDHENTES, BEKRÆFTELSER FØRST (29/9): cronen læser
 *      webinar_mails med udfald <> 'ok' med SAMME afgrænsning som de sendte
 *      (session_tid >= graense), bygger nøglerne med noegle() og giver dem til
 *      planlaegKoersel som `fejlede`; `sprunget` kender for_sent_efter_fejl.
 *      I begge spejle giver planlaegKoersel `fejlede` videre til doemMail, som
 *      slår nøglen op, og sorteringen sætter «straks»-arter (bekræftelsen) FØR
 *      ældste planlagte. Uden det bliver en mail, VI fejlede med, for_sent to
 *      timer efter sit tidspunkt — og en ny tilmeldts bekræftelse venter bag 211
 *      indhentede under et loft på 90 i timen.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
/**
 * KUN blok-kommentarerne væk. `udenKommentarer` sletter alt efter to
 * skråstreger — og en URL BÆRER to skråstreger, så «api.eu.mailgun.net»-linjen
 * forsvandt sammen med kommentaren. Det åd værnets eget bevis, første gang det
 * blev kørt (tredje gang i huset: også eksterntLink.guard og cvrKilde.guard
 * har måttet læse råt for at dømme på en URL).
 *
 * Blokkene ryger stadig — det er DÉR, filhovedet citerer Mailguns egen sætning
 * «substitute "https://api.mailgun.net" with …», og den citation må ikke kunne
 * læses som om koden bruger US-endepunktet.
 */
const udenBlokke = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
/**
 * SQL'ens kommentarlinjer væk. Migrationerne CITERER deres egen ROLLBACK —
 * altså den GAMLE CHECK — i filhovedet, og en dom, der læser den første
 * forekomst, ville dømme på rollbacken i stedet for på den, der køres.
 * Det fældede dom 7, første gang den blev kørt.
 */
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const CRON = "supabase/functions/webinar-mail-cron/index.ts";
const AFMELD = "supabase/functions/webinar-afmeld/index.ts";
const SEND = "supabase/functions/_shared/mailgunAfsendelse.ts";
const TEKSTER = "supabase/functions/_shared/webinarMailTekster.ts";
const SVAR = "supabase/functions/_shared/webinarDelingSvar.ts";
const AFMELDING = "supabase/functions/_shared/klaviyoAfmelding.ts";
const MIG_KILDE = "supabase/migrations/20260922180000_klaviyo_afmeldinger_webinar_mail.sql";
const MIME = "supabase/functions/_shared/mimeInvitation.ts";
const MIG = "supabase/migrations/20260922171000_webinar_mails.sql";
const MIG_ARTER = "supabase/migrations/20260928120000_webinar_mails_fjorten_dage.sql";
const CONFIG = "supabase/config.toml";
const DOM = "supabase/functions/_shared/webinarMailDom.ts";
const DOM_SPEJL = "src/lib/webinar/mailDom.ts";
const LOFT = "supabase/functions/_shared/webinarMailLoft.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const bucketBOgLaas = (cron: string, config: string): boolean => {
  const f = udenKommentarer(cron);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const blok = config.slice(config.indexOf("[functions.webinar-mail-cron]"), config.indexOf("[functions.webinar-mail-cron]") + 80);
  return (
    foer(serve, "await authenticateServiceRole(req)", "createClient(supabaseUrl, serviceKey") &&
    /verify_jwt = true/.test(blok) &&
    f.includes('export const KENDTE_FELTER = ["dry_run", "email", "art", "nu"] as const;') &&
    f.includes("ukendteFelter(raaBody, KENDTE_FELTER)") &&
    // Tørkørsel er STANDARD: alt andet end et eksplicit false er en tørkørsel.
    f.includes("const toerKoersel = raaBody.dry_run !== false;") &&
    // Rigtig afsendelse kræver BEGGE.
    f.includes("const senderRigtigt = !a.toerKoersel && (a.laas || a.email !== null);") &&
    f.includes("if (!senderRigtigt) return r;") &&
    f.includes('export const LAAS_NOEGLE = "webinar_mail_aktiv";') &&
    // Låsen fail-closed: kan den ikke læses, sendes der intet.
    /catch \(e\) \{[\s\S]{0,200}return false;/.test(f)
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const euOgIngenSporing = (send: string, cron: string): boolean => {
  // RÅT (på nær blokkene): dommene her læser URL'er — se udenBlokke ovenfor.
  const s = udenBlokke(send), c = udenKommentarer(cron);
  return (
    s.includes('export const MAILGUN_EU_BASE = "https://api.eu.mailgun.net/v3";') &&
    !/["']https:\/\/api\.mailgun\.net/.test(s) &&
    s.includes('fd.set("o:tracking", "no");') &&
    s.includes('fd.set("o:tracking-clicks", "no");') &&
    s.includes('fd.set("o:tracking-opens", "no");') &&
    s.includes('fd.set("h:Reply-To", b.svarTil);') &&
    s.includes('fd.set("h:List-Unsubscribe", `<${b.afmeldUrl}>`);') &&
    // Nøglen læses ÉT sted — i cronen, ikke i afsendelsen.
    !/Deno\.env\.get/.test(s) &&
    c.includes("Deno.env.get(MAILGUN_SECRET)")
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const sporetEfterAfsendelsen = (cron: string, migration: string): boolean => {
  const f = udenKommentarer(cron);
  return (
    foer(f, "await sendMailgun(", 'from("webinar_mails").insert(') &&
    f.includes('if ((error as { code?: string }).code === "23505") {') &&
    f.includes("r.dublet++;") &&
    migration.includes("create unique index if not exists webinar_mails_en_pr_person_uidx") &&
    /on public\.webinar_mails \(email, session_tid, art\)\s+where udfald = 'ok'/.test(migration)
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const tokenetFoerst = (afmeld: string, config: string): boolean => {
  const f = udenKommentarer(afmeld);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const blok = config.slice(config.indexOf("[functions.webinar-afmeld]"), config.indexOf("[functions.webinar-afmeld]") + 80);
  return (
    foer(serve, "await laesAfmeldToken(secret, token)", "createClient(Deno.env.get(") &&
    (serve.match(/createClient\(/g) ?? []).length === 1 &&
    /verify_jwt = false/.test(blok) &&
    // Svaret røber aldrig, om adressen findes: samme tekst til begge udfald.
    serve.includes('side("Linket virker ikke"') &&
    !/findes ikke|ukendt adresse|ikke tilmeldt/i.test(serve)
  );
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const ingenKlaviyoTags = (tekster: string): boolean => {
  const t = udenKommentarer(tekster);
  return (
    !/\{%\s*unsubscribe/.test(t) &&
    !/\{\{\s*person/.test(t) &&
    t.includes("a.afmeldUrl") &&
    t.includes("webinarTekst(new Date(a.sessionTid))") &&
    // De seks påmindelser har en emnelinje, i rækkefølge; bekraeftelse står
    // først i EMNER, før fjorten_dage (28/9) og syv_dage.
    /bekraeftelse:[\s\S]{0,80}fjorten_dage:[\s\S]{0,80}syv_dage:[\s\S]{0,80}tre_dage:[\s\S]{0,80}en_dag:[\s\S]{0,60}dagen:[\s\S]{0,40}en_time:/.test(t)
  );
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const linkeneErPersonlige = (svar: string): boolean => {
  const s = udenKommentarer(svar);
  return s.includes('"join_link", "kalender_link", "replay_link"');
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const etKlikEnBetydning = (afmeld: string, kilder: string, migration: string): boolean => {
  const f = udenKommentarer(afmeld);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const listen = udenKommentarer(kilder).match(/export const AFMELD_KILDER = \[([^\]]*)\]/)?.[1] ?? "";
  const navne = [...listen.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  // udenSql: filhovedets ROLLBACK citerer den GAMLE check — se ovenfor.
  const check = udenSql(migration).match(/check \(kilde in \(([^)]*)\)\)/)?.[1] ?? "";
  const iCheck = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  return (
    f.includes('import { afmeldHvisNoegle } from "../_shared/klaviyoAfsendelse.ts";') &&
    serve.includes('afmeldHvisNoegle(admin, { email: dom.email, kilde: "webinar_mail" }, new Date())') &&
    // VORES FØRST: Klaviyo må ikke kunne forhindre en afmelding hos os.
    foer(serve, 'from("webinar_afmeldinger")', "afmeldHvisNoegle(") &&
    // Og kaldet stopper ikke svaret — der er ingen return mellem det og svaret.
    !/afmeldHvisNoegle\([\s\S]{0,400}?return json\(\{ error/.test(serve) &&
    // De to lister er i takt, tegn for tegn.
    navne.includes("webinar_mail") && iCheck.includes("webinar_mail") &&
    navne.join(",") === iCheck.join(",")
  );
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const bekraeftelsenGaarGennemMime = (cron: string, mime: string): boolean => {
  const c = udenKommentarer(cron), m = udenBlokke(mime);
  return (
    // På LISTEN (MED_INVITATION via baererInvitation), ikke på et artsnavn —
    // ellers ville en ny art med invitation gå ad den almindelige vej uden.
    c.includes('if (baererInvitation(s.art)) {') &&
    !/s\.art === "bekraeftelse"/.test(c) &&
    /import \{[^}]*\bbaererInvitation\b[^}]*\} from "\.\.\/_shared\/webinarMailDom\.ts";/.test(c) &&
    c.includes("await hentInvitation(s.kalenderLink)") &&
    c.includes("spor = await sendMailgunMime(mailgunNoegle, s.email, mime);") &&
    // FAIL-SOFT: der er ingen `return` eller `continue` mellem hentningen og afsendelsen.
    !/hentInvitation\([\s\S]{0,300}?(return|continue);/.test(c) &&
    c.includes("invitation = inv.udfald;") &&
    c.includes("invitation,") &&
    // Typen er ORDRET den, Outlook kræver.
    m.includes(`export const INVITATION_TYPE = 'text/calendar; charset=utf-8; method=REQUEST';`) &&
    // Og indholdet dømmes fail-closed: en HTML-fejlside vedhæftes aldrig.
    m.includes('if (!/BEGIN:VCALENDAR/i.test(tekst) || !/BEGIN:VEVENT/i.test(tekst)) {')
  );
};

// ── 9 ──────────────────────────────────────────────────────────────────────
/**
 * Konstanten er ét øjeblik, ét sted — og den er en STRENG, ikke et regnestykke,
 * så en læser kan se datoen uden at regne. Dommen skal både sammenligne mod
 * den OG afvise et ulæseligt registreret_at; kun den ene halvdel er værre end
 * ingenting, for `Date.parse("")` er NaN, og NaN < noget er false.
 */
export const bekraeftelsenKunFremad = (dom: string, spejl: string, cron: string): boolean => {
  const ORDRET = 'export const BEKRAEFTELSE_FRA = "2026-09-22T17:03:00Z";';
  const f = udenKommentarer(dom);
  return (
    dom.includes(ORDRET) && spejl.includes(ORDRET) &&
    // Fail-closed: BÅDE «kan ikke læses» OG «før grænsen» giver samme svar.
    f.includes('const registreret = Date.parse(i.registreretAt ?? "");') &&
    f.includes("if (!Number.isFinite(registreret) || registreret < BEKRAEFTELSE_FRA_MS) {") &&
    f.includes('return { send: false, art, grund: "for_tidlig_tilmelding" };') &&
    // KUN bekræftelsen — porten må aldrig gælde påmindelserne.
    f.includes('if (art === "bekraeftelse") {') &&
    // Og tilmeldingstidspunktet skal faktisk NÅ dommen: kolonnen i selectet,
    // feltet på rækken, og feltet videre i kaldet.
    f.includes("registreret_at: string | null;") &&
    f.includes("registreretAt: r.registreret_at,") &&
    udenKommentarer(cron).includes("session_tid, registreret_at,")
  );
};

// ── 10 ─────────────────────────────────────────────────────────────────────
/**
 * Listerne læses ud af DOMMEN (`export const ARTER … = [...]`,
 * `MED_INVITATION`) og ud af den NYESTE migration, der sætter CHECK'ene
 * (udenSql: filhovedets ROLLBACK citerer de GAMLE), og sammenlignes tegn for
 * tegn og i rækkefølge. Rækkefølgen tæller: ARTER er «i den rækkefølge de
 * sendes», og CHECK'en skal kunne læses som den samme liste.
 */
const listeIKode = (k: string, navn: string): string[] => {
  const m = udenKommentarer(k).match(new RegExp(`export const ${navn}: readonly MailArt\\[\\] = \\[([^\\]]*)\\];`));
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
};
const listeICheck = (sql: string, form: RegExp): string[] => {
  const m = udenSql(sql).match(form);
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
};
export const arterITakt = (dom: string, spejl: string, migration: string, cron: string): boolean => {
  const arter = listeIKode(dom, "ARTER"), med = listeIKode(dom, "MED_INVITATION");
  const artCheck = listeICheck(migration, /check \(art in \(([^)]*)\)\)/);
  const invCheck = listeICheck(migration, /check \(invitation is null or art in \(([^)]*)\)\)/);
  const PLAN = '{ art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, kraeverIkkeBegyndt: false },';
  return (
    arter.length === 7 && arter.join(",") === artCheck.join(",") &&
    med.length === 2 && med.join(",") === invCheck.join(",") &&
    arter.includes("fjorten_dage") && med.includes("fjorten_dage") &&
    med.every((a) => arter.includes(a)) &&
    // Begge spejle.
    listeIKode(spejl, "ARTER").join(",") === arter.join(",") &&
    listeIKode(spejl, "MED_INVITATION").join(",") === med.join(",") &&
    dom.includes(PLAN) && spejl.includes(PLAN) &&
    // Migrationen bærer husets første linje (IKKE KØRT → KØRT, når den er
    // kørt) og siger selv, at den skal køres FØR functionen udrulles.
    /^-- (IKKE KØRT\. DEPLOY: manuelt i Lovable|KØRT i prod)/.test(migration) &&
    /FØR webinar-mail-cron UDRULLES/.test(migration) &&
    // Og cronen dømmer på listen — dom 8 siger det samme fra sin side.
    udenKommentarer(cron).includes("if (baererInvitation(s.art)) {")
  );
};

// ── 11 ─────────────────────────────────────────────────────────────────────
export const tekstenFoelgerInvitationen = (cron: string, tekster: string): boolean => {
  const c = udenKommentarer(cron), t = udenKommentarer(tekster);
  // Løkkehovedet er indekseret siden 29/9 (loftet tæller resten ved et stop).
  const loekke = c.slice(c.indexOf("for (let i = 0; i < sendinger.length; i++) {"));
  return (
    // Hentningen FØR byggeren — ellers kan flaget ikke være sandt.
    foer(loekke, "await hentInvitation(s.kalenderLink)", "const mail = bygWebinarMail({") &&
    loekke.includes("ics = inv.ics;") &&
    loekke.includes("invitationVedhaeftet: ics !== null,") &&
    // Og MIME'en bærer den samme fil, som teksten blev dømt på.
    /bygMime\(\{[\s\S]{0,300}?\bics,/.test(loekke) &&
    // Feltet er KRÆVET, flaget når dommen, og dommen har begge grene.
    t.includes("invitationVedhaeftet: boolean;") &&
    !/invitationVedhaeftet\?:/.test(t) &&
    t.includes("const i = indhold(a.art, tid, a.invitationVedhaeftet);") &&
    t.includes("const inv = invitationsTekst(medInvitation);") &&
    t.includes("export function invitationsTekst(medInvitation: boolean)") &&
    /if \(medInvitation\) \{/.test(t)
  );
};

// ── 12 ─────────────────────────────────────────────────────────────────────
export const loftetFoerLoekken = (cron: string, loft: string): boolean => {
  const f = udenKommentarer(cron), l = udenKommentarer(loft);
  const LOEKKE = "for (let i = 0; i < sendinger.length; i++) {";
  const start = f.indexOf(LOEKKE), slut = f.indexOf("Deno.serve(");
  if (start === -1 || slut === -1) return false;
  const loekke = f.slice(start, slut);
  const stop = loekke.indexOf("if (erStopStatus(spor.status)) {");
  return (
    f.includes('from "../_shared/webinarMailLoft.ts"') &&
    // Loftet regnes FØR løkken — og på rigtig tid, ikke på dommens `nu`.
    foer(f, "const loft = beregnKoerselsLoft({ seneste: loftRaekker, loft: MAILGUN_LOFT_PR_TIME, nu: loftNu });", LOEKKE) &&
    f.includes("const loftNu = new Date();") &&
    f.includes('a.admin.from("webinar_mails").select("forsoegt_at, udfald, status")') &&
    // Pause = intet sendes; over maks = intet forsøges (heller ikke ics-hentningen).
    foer(f, "if (loft.pause) return r;", LOEKKE) &&
    loekke.includes("if (forsoegt >= loft.maks) { r.over_loft++; continue; }") &&
    foer(loekke, "if (forsoegt >= loft.maks) { r.over_loft++; continue; }", "await hentInvitation(s.kalenderLink)") &&
    // Stoppet: EFTER sporet, og blokken er kort — tælleren, én console.error og break.
    stop !== -1 &&
    foer(loekke, 'from("webinar_mails").insert(', "if (erStopStatus(spor.status)) {") &&
    loekke.slice(stop, stop + 500).includes("break;") &&
    loekke.slice(stop, stop + 500).includes("r.over_loft += sendinger.length - i - 1;") &&
    // Motoren: loftet og stop-koderne står ordret.
    l.includes("export const MAILGUN_LOFT_PR_TIME = 90;") &&
    l.includes("export const STOP_STATUSSER: readonly number[] = [403, 420, 429];") &&
    l.includes("return { maks: Math.max(0, loft - forsoeg), pause: null };")
  );
};

// ── 13 ─────────────────────────────────────────────────────────────────────
export const fejledeIndhentes = (cron: string, dom: string, spejl: string): boolean => {
  const f = udenKommentarer(cron);
  const iDommen = (k: string) => {
    const d = udenKommentarer(k);
    return (
      d.includes("fejlede?: ReadonlySet<string>;") &&
      d.includes("if (!(i.fejlede?.has(noegle(mail, i.sessionTid, art)) ?? false)) {") &&
      d.includes("fejlede: i.fejlede,") &&
      d.includes("const erStraks = (art: MailArt) => PLANEN.find((p) => p.art === art)?.straks === true;") &&
      d.includes("Number(erStraks(b.art)) - Number(erStraks(a.art)) ||") &&
      foer(d, "Number(erStraks(b.art)) - Number(erStraks(a.art)) ||", "a.planlagt.localeCompare(b.planlagt) ||")
    );
  };
  return (
    f.includes('a.admin.from("webinar_mails").select("email, session_tid, art").neq("udfald", "ok")\n      .gte("session_tid", graense)') &&
    f.includes("const fejlede = new Set(fejledeRaekker.map((x) => noegle(x.email, x.session_tid, x.art)));") &&
    f.includes("const plan = planlaegKoersel({ raekker, afmeldte, sendte, fejlede, nu: a.nu });") &&
    foer(f, "const fejlede = new Set(", "const plan = planlaegKoersel(") &&
    f.includes("for_sent_efter_fejl: 0") &&
    iDommen(dom) && iDommen(spejl)
  );
};

describe("webinarMail.guard — platformens før-webinar-mails", () => {
  it("1. Bucket B, tørkørsel som standard, og låsen fail-closed", () => expect(bucketBOgLaas(laes(CRON), laes(CONFIG))).toBe(true));
  it("2. Mailgun EU, ingen sporing, nøglen ét sted", () => expect(euOgIngenSporing(laes(SEND), laes(CRON))).toBe(true));
  it("3. sporet skrives efter afsendelsen, og indekset er dommeren", () => expect(sporetEfterAfsendelsen(laes(CRON), laes(MIG))).toBe(true));
  it("4. tokenet verificeres før service role, og svaret røber intet", () => expect(tokenetFoerst(laes(AFMELD), laes(CONFIG))).toBe(true));
  it("5. ingen Klaviyo-tags, og afmeldingslinket er vores eget", () => expect(ingenKlaviyoTags(laes(TEKSTER))).toBe(true));
  it("6. de tre personlige links kan aldrig gå ud til en ekstern", () => expect(linkeneErPersonlige(laes(SVAR))).toBe(true));
  it("7. afmeldingen rammer også Klaviyo, og kilde-listen er i takt med CHECK'en", () => expect(etKlikEnBetydning(laes(AFMELD), laes(AFMELDING), laes(MIG_KILDE))).toBe(true));
  it("8. bekræftelsen går gennem MIME'en med den rigtige Content-Type", () => expect(bekraeftelsenGaarGennemMime(laes(CRON), laes(MIME))).toBe(true));
  it("9. bekræftelsen sendes aldrig bagud, og tidspunktet når dommen", () => expect(bekraeftelsenKunFremad(laes(DOM), laes(DOM_SPEJL), laes(CRON))).toBe(true));
  it("10. ARTER og MED_INVITATION er i takt med CHECK'ene, i begge spejle", () => expect(arterITakt(laes(DOM), laes(DOM_SPEJL), laes(MIG_ARTER), laes(CRON))).toBe(true));
  it("11. teksten følger invitationen: hentet FØR byggeren, flaget krævet og brugt", () => expect(tekstenFoelgerInvitationen(laes(CRON), laes(TEKSTER))).toBe(true));
  it("12. loftet regnes før løkken, pause sender intet, og 403/420/429 bryder løkken efter sporet", () => expect(loftetFoerLoekken(laes(CRON), laes(LOFT))).toBe(true));
  it("13. de fejlede læses med samme afgrænsning og gives til dommen, og bekræftelser sorteres først", () => expect(fejledeIndhentes(laes(CRON), laes(DOM), laes(DOM_SPEJL))).toBe(true));
});

describe("webinarMail.guard — dommene fanger fejlen på en kopi", () => {
  const cron = laes(CRON), afmeld = laes(AFMELD), send = laes(SEND), tekster = laes(TEKSTER), svar = laes(SVAR), mig = laes(MIG), config = laes(CONFIG);

  it("fejlede ikke givet ind, læst som ok, uden afgrænsning, ikke slået op i dommen, eller bekræftelser ikke først, fælder dom 13", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL);
    // Selve fejlen, opgaven nævner: fejlede læses, men gives IKKE til planlaegKoersel.
    expect(fejledeIndhentes(cron.split("planlaegKoersel({ raekker, afmeldte, sendte, fejlede, nu: a.nu })").join("planlaegKoersel({ raekker, afmeldte, sendte, nu: a.nu })"), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron.split('.neq("udfald", "ok")').join('.eq("udfald", "ok")'), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron.split('.neq("udfald", "ok")\n      .gte("session_tid", graense)').join('.neq("udfald", "ok")\n     '), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron.split("for_sent_efter_fejl: 0").join(""), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron, dom.split("        fejlede: i.fejlede,\n").join(""), spejl)).toBe(false);
    expect(fejledeIndhentes(cron, dom, spejl.split("if (!(i.fejlede?.has(noegle(mail, i.sessionTid, art)) ?? false)) {").join("if (true) {"))).toBe(false);
    expect(fejledeIndhentes(cron, dom.split("    Number(erStraks(b.art)) - Number(erStraks(a.art)) ||\n").join(""), spejl)).toBe(false);
  });

  it("loftet fjernet, break fjernet, stop før sporet, eller et andet loft i motoren, fælder dom 12", () => {
    const loft = laes(LOFT);
    expect(loftetFoerLoekken(cron, loft)).toBe(true);
    // Løkken uden loft: kaldet væk.
    expect(loftetFoerLoekken(cron.split("const loft = beregnKoerselsLoft({ seneste: loftRaekker, loft: MAILGUN_LOFT_PR_TIME, nu: loftNu });").join("const loft = { maks: 999, pause: null };"), loft)).toBe(false);
    // Pausen ignoreret.
    expect(loftetFoerLoekken(cron.split("  if (loft.pause) return r;\n").join(""), loft)).toBe(false);
    // Maks ignoreret.
    expect(loftetFoerLoekken(cron.split("    if (forsoegt >= loft.maks) { r.over_loft++; continue; }\n").join(""), loft)).toBe(false);
    // Break væk: løkken fortsætter mod samme mur.
    const udenBreak = cron.split("      console.error(`${LOG} STOP: Mailgun svarede ${spor.status} — kørslen stopper; ${sendinger.length - i - 1} mails venter til efter pausen`);\n      break;").join("      console.error(`${LOG} STOP: Mailgun svarede ${spor.status}`);");
    expect(udenBreak).not.toBe(cron);
    expect(loftetFoerLoekken(udenBreak, loft)).toBe(false);
    // Stoppet flyttet FØR sporet: rækken, næste kørsel skal regne pausen af, findes ikke.
    const stopBlok = cron.slice(cron.indexOf("    if (erStopStatus(spor.status)) {"), cron.indexOf("      break;\n    }\n") + "      break;\n    }\n".length);
    const foerSporet = cron.split(stopBlok).join("").replace('    const { error } = await a.admin.from("webinar_mails").insert({', `${stopBlok}    const { error } = await a.admin.from("webinar_mails").insert({`);
    expect(foerSporet).not.toBe(cron);
    expect(loftetFoerLoekken(foerSporet, loft)).toBe(false);
    // Motoren med et andet loft eller andre stop-koder.
    expect(loftetFoerLoekken(cron, loft.split("export const MAILGUN_LOFT_PR_TIME = 90;").join("export const MAILGUN_LOFT_PR_TIME = 100;"))).toBe(false);
    expect(loftetFoerLoekken(cron, loft.split("[403, 420, 429]").join("[429]"))).toBe(false);
  });

  it("en tørkørsel, der sender, eller en lås der springes over, fælder dom 1", () => {
    expect(bucketBOgLaas(cron.split("const toerKoersel = raaBody.dry_run !== false;").join("const toerKoersel = raaBody.dry_run === true;"), config)).toBe(false);
    expect(bucketBOgLaas(cron.split("const senderRigtigt = !a.toerKoersel && (a.laas || a.email !== null);").join("const senderRigtigt = !a.toerKoersel;"), config)).toBe(false);
    expect(bucketBOgLaas(cron.split("if (!senderRigtigt) return r;").join(""), config)).toBe(false);
  });

  it("US-endepunktet, eller sporing slået TIL, fælder dom 2", () => {
    expect(euOgIngenSporing(send.split("https://api.eu.mailgun.net/v3").join("https://api.mailgun.net/v3"), cron)).toBe(false);
    expect(euOgIngenSporing(send.split('fd.set("o:tracking", "no");').join('fd.set("o:tracking", "yes");'), cron)).toBe(false);
    // Nøglen læst i afsendelsesfilen i stedet for ét sted.
    expect(euOgIngenSporing(`${send}\nconst n = Deno.env.get("MAILGUN_SENDING_KEY");\n`, cron)).toBe(false);
  });

  it("sporet skrevet FØR afsendelsen, eller en dublet der vælter kørslen, fælder dom 3", () => {
    const byttet = cron
      .split('    const { error } = await a.admin.from("webinar_mails").insert({').join("    const SENERE = 1;")
      .replace("    const spor = await sendMailgun(", '    const { error } = await a.admin.from("webinar_mails").insert({});\n    const spor = await sendMailgun(');
    expect(byttet).not.toBe(cron);
    expect(sporetEfterAfsendelsen(byttet, mig)).toBe(false);
    expect(sporetEfterAfsendelsen(cron, mig.split("where udfald = 'ok'").join(""))).toBe(false);
  });

  it("service role før tokenet, eller et svar der røber adressen, fælder dom 4", () => {
    const foerst = afmeld
      .split("  const admin = createClient(Deno.env.get(\"SUPABASE_URL\")!, Deno.env.get(\"SUPABASE_SERVICE_ROLE_KEY\")!, {\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n").join("")
      .replace("  const url = new URL(req.url);", "  const admin = createClient(Deno.env.get(\"SUPABASE_URL\")!, Deno.env.get(\"SUPABASE_SERVICE_ROLE_KEY\")!, {\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n  const url = new URL(req.url);");
    expect(foerst).not.toBe(afmeld);
    expect(tokenetFoerst(foerst, config)).toBe(false);
    expect(tokenetFoerst(`${afmeld}\nconst x = side("Adressen findes ikke", "");\n`, config)).toBe(false);
  });

  it("et Klaviyo-tag tilbage i en skabelon fælder dom 5", () => {
    expect(ingenKlaviyoTags(`${tekster}\nconst rest = "{% unsubscribe 'Afmeld' %}";\n`)).toBe(false);
    expect(ingenKlaviyoTags(tekster.split("a.afmeldUrl").join('"#"'))).toBe(false);
  });

  it("et personligt link fjernet fra de forbudte nøgler fælder dom 6", () => {
    expect(linkeneErPersonlige(svar.split('"join_link", "kalender_link", "replay_link"').join('"kalender_link"'))).toBe(false);
  });

  it("Klaviyo-kaldet fjernet, sat FØR vores egen skrivning, eller en kilde ude af takt, fælder dom 7", () => {
    const kilder = laes(AFMELDING), migKilde = laes(MIG_KILDE);
    expect(etKlikEnBetydning(afmeld.split("afmeldHvisNoegle(admin,").join("noop(admin,"), kilder, migKilde)).toBe(false);
    // Listen og CHECK'en ude af takt — den ene får en værdi, den anden ikke.
    expect(etKlikEnBetydning(afmeld, kilder.split('"bagud", "webinar_mail"').join('"bagud", "webinar_mail", "noget_nyt"'), migKilde)).toBe(false);
    expect(etKlikEnBetydning(afmeld, kilder, migKilde.split("'bagud', 'webinar_mail'").join("'bagud'"))).toBe(false);
  });

  it("bekræftelsen sendt ad den almindelige vej, en tom Content-Type, en hentning der stopper mailen, eller en dom på artsnavnet, fælder dom 8", () => {
    const mime = laes(MIME);
    expect(bekraeftelsenGaarGennemMime(cron.split("spor = await sendMailgunMime(mailgunNoegle, s.email, mime);").join("spor = await sendMailgun(mailgunNoegle, {} as never);"), mime)).toBe(false);
    // Tilbage til artsnavnet: «fjorten_dage» ville så gå UDEN sin invitation.
    const paaNavn = cron.split("if (baererInvitation(s.art)) {").join('if (s.art === "bekraeftelse") {');
    expect(paaNavn).not.toBe(cron);
    expect(bekraeftelsenGaarGennemMime(paaNavn, mime)).toBe(false);
    expect(bekraeftelsenGaarGennemMime(cron, mime.split("text/calendar; charset=utf-8; method=REQUEST").join("text/calendar"))).toBe(false);
    // Fail-soft brudt: hentningen springer mailen over i stedet for at sende uden.
    const haard = cron.replace("      invitation = inv.udfald;", "      invitation = inv.udfald;\n      if (inv.udfald !== \"hentet\") continue;");
    expect(haard).not.toBe(cron);
    expect(bekraeftelsenGaarGennemMime(haard, mime)).toBe(false);
    // Indholdsdommen fjernet: en HTML-fejlside kunne vedhæftes.
    expect(bekraeftelsenGaarGennemMime(cron, mime.split("if (!/BEGIN:VCALENDAR/i.test(tekst) || !/BEGIN:VEVENT/i.test(tekst)) {").join("if (false) {"))).toBe(false);
  });

  it("en flyttet dato, en halv fail-closed, en port over alle arter, eller en manglende kolonne fælder dom 9", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL);
    const FRA = 'export const BEKRAEFTELSE_FRA = "2026-09-22T17:03:00Z";';
    // Datoen flyttet — i det ene spejl, eller i begge.
    const flyttet = 'export const BEKRAEFTELSE_FRA = "2020-01-01T00:00:00Z";';
    expect(bekraeftelsenKunFremad(dom.split(FRA).join(flyttet), spejl, cron)).toBe(false);
    expect(bekraeftelsenKunFremad(dom, spejl.split(FRA).join(flyttet), cron)).toBe(false);
    // Kun halvdelen af fail-closed: et ulæseligt tidspunkt ville slippe igennem
    // som «ikke før grænsen», fordi NaN < tal er false.
    expect(bekraeftelsenKunFremad(
      dom.split("if (!Number.isFinite(registreret) || registreret < BEKRAEFTELSE_FRA_MS) {")
         .join("if (registreret < BEKRAEFTELSE_FRA_MS) {"), spejl, cron)).toBe(false);
    // Porten lagt over ALLE arter — så ville påmindelserne også stoppe.
    expect(bekraeftelsenKunFremad(dom.split('if (art === "bekraeftelse") {').join("if (true) {"), spejl, cron)).toBe(false);
    // Tidspunktet når aldrig dommen: feltet droppet i kaldet, eller kolonnen
    // droppet i cronens select.
    expect(bekraeftelsenKunFremad(dom.split("registreretAt: r.registreret_at,").join(""), spejl, cron)).toBe(false);
    expect(bekraeftelsenKunFremad(dom, spejl, cron.split("session_tid, registreret_at,").join("session_tid,"))).toBe(false);
  });

  it("en art uden plads i CHECK'en, en invitation uden plads, en plan der er flyttet, eller et spejl ude af takt, fælder dom 10", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL), migArter = laes(MIG_ARTER);
    expect(arterITakt(dom, spejl, migArter, cron)).toBe(true);
    // CHECK'en kender ikke fjorten_dage — mailen ville sendes og sporet afvises.
    const udenArt = migArter.split("check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage'").join("check (art in ('bekraeftelse', 'syv_dage'");
    expect(udenArt).not.toBe(migArter);
    expect(arterITakt(dom, spejl, udenArt, cron)).toBe(false);
    // Invitations-CHECK'en kender kun bekræftelsen.
    const udenInv = migArter.split("check (invitation is null or art in ('bekraeftelse', 'fjorten_dage'))").join("check (invitation is null or art in ('bekraeftelse'))");
    expect(udenInv).not.toBe(migArter);
    expect(arterITakt(dom, spejl, udenInv, cron)).toBe(false);
    // En ottende art i koden uden migration.
    const enTil = dom.split('"dagen", "en_time"];').join('"dagen", "en_time", "spoegelse"];');
    expect(enTil).not.toBe(dom);
    expect(arterITakt(enTil, spejl, migArter, cron)).toBe(false);
    // Planen flyttet (13 dage) — i det ene spejl, eller i begge.
    const PLAN = '{ art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, kraeverIkkeBegyndt: false },';
    const flyttet = PLAN.replace("dageFoer: 14", "dageFoer: 13");
    expect(arterITakt(dom.split(PLAN).join(flyttet), spejl, migArter, cron)).toBe(false);
    expect(arterITakt(dom.split(PLAN).join(flyttet), spejl.split(PLAN).join(flyttet), migArter, cron)).toBe(false);
    // Spejlet ude af takt på MED_INVITATION.
    expect(arterITakt(dom, spejl.split('MED_INVITATION: readonly MailArt[] = ["bekraeftelse", "fjorten_dage"]').join('MED_INVITATION: readonly MailArt[] = ["bekraeftelse"]'), migArter, cron)).toBe(false);
    // Migrationens første linje forkert, eller uden ordren «FØR … UDRULLES».
    // Første linje uden husets markør — uanset om den står som «IKKE KØRT» eller (efter kørslen) «KØRT i prod».
    const udenMarkoer = migArter.replace(/^-- (IKKE KØRT\. DEPLOY:|KØRT i prod)/, "-- DEPLOY:");
    expect(udenMarkoer).not.toBe(migArter);
    expect(arterITakt(dom, spejl, udenMarkoer, cron)).toBe(false);
    expect(arterITakt(dom, spejl, migArter.split("FØR webinar-mail-cron UDRULLES").join("efter udrulningen"), cron)).toBe(false);
    // Og den gamle CHECK i ROLLBACK-kommentaren dømmes IKKE på: den er i filen.
    expect(migArter).toContain("check (art in ('bekraeftelse', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time'));");
  });

  it("mailen bygget FØR hentningen, et flag der er konstant eller valgfrit, eller en dom der ignorerer det, fælder dom 11", () => {
    expect(tekstenFoelgerInvitationen(cron, tekster)).toBe(true);
    // Byggeren flyttet op FØR hentningen (den gamle rækkefølge fra 22/9).
    const BYG = "    const mail = bygWebinarMail({";
    const HENT = "      const inv = await hentInvitation(s.kalenderLink);";
    const foerst = cron.split(BYG).join("    const SENERE = 1;").replace(HENT, `${BYG}\n      art: s.art, sessionTid: s.sessionTid, webinarTitel: s.webinarTitel, joinLink: s.joinLink, kalenderLink: s.kalenderLink, afmeldUrl: link, invitationVedhaeftet: ics !== null,\n    });\n${HENT}`);
    expect(foerst).not.toBe(cron);
    expect(tekstenFoelgerInvitationen(foerst, tekster)).toBe(false);
    // Flaget hårdkodet — så ville «vedhæftet» stå i alle mails igen.
    expect(tekstenFoelgerInvitationen(cron.split("invitationVedhaeftet: ics !== null,").join("invitationVedhaeftet: true,"), tekster)).toBe(false);
    // Filen tabt før hentningens svar når MIME'en.
    expect(tekstenFoelgerInvitationen(cron.split("ics = inv.ics;").join(""), tekster)).toBe(false);
    // Feltet gjort valgfrit — en glemt værdi ville blive «false» i stilhed, eller «true» hos en kalder med default.
    expect(tekstenFoelgerInvitationen(cron, tekster.split("invitationVedhaeftet: boolean;").join("invitationVedhaeftet?: boolean;"))).toBe(false);
    // Dommen ignorerer flaget.
    expect(tekstenFoelgerInvitationen(cron, tekster.split("const i = indhold(a.art, tid, a.invitationVedhaeftet);").join("const i = indhold(a.art, tid, true);"))).toBe(false);
    expect(tekstenFoelgerInvitationen(cron, tekster.split("const inv = invitationsTekst(medInvitation);").join("const inv = invitationsTekst(true);"))).toBe(false);
  });
});
