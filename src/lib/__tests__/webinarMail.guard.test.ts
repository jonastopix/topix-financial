import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for platformens før-webinar-mails (22/9-2026). Sytten domme, hver
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
 *      30/9 (udkast): ARTER er ORDFORRÅDET (= CHECK'en), og det, der SENDES, er
 *      AKTIVE_ARTER = PLANEN.map(art) — ordret i begge spejle, planlaegKoersel
 *      løber over den, og cronens prøve afviser alt uden for den.
 *      UDGAAEDE_ARTER (tre_dage, dagen) står i ARTER og i CHECK'en, men har
 *      ingen linje i PLANEN; AKTIVE + UDGÅEDE = ARTER. Sendes kun arter, CHECK'en
 *      kender, er sporet sikkert — derfor kræver det ingen migration at FJERNE.
 *  11. TEKSTEN FØLGER INVITATIONEN (28/9): cronen henter filen FØR mailen
 *      bygges og giver `invitationVedhaeftet: ics !== null` videre; feltet er
 *      KRÆVET på MailArgs (ikke `?`), og `indhold` får flaget — aldrig en
 *      konstant. Uden det siger en fail-soft-mail «vedhæftet» om en fil, der
 *      ikke er der.
 *  12. LOFTET FØR LØKKEN, STOP I LØKKEN (29/9, mailFejl.guard-mønstret): cronen
 *      kalder beregnKoerselsLoft FØR løkken, sender intet ved pause, forsøger
 *      højst maks, og bryder løkken (break) ved 403/420/429 — EFTER sporet er
 *      skrevet. Loftet er 1000 (Jonas 29/9, efter at Mailgun ophævede probationen;
 *      det er hans tal, ikke en dokumenteret Mailgun-grænse) og stop-koderne
 *      403 · 420 · 429 i motoren. Uden det blev 211 mails forsøgt 2.125 gange
 *      på to timer, og Mailgun spærrede.
 *  13. DE FEJLEDE INDHENTES, BEKRÆFTELSER FØRST (29/9): cronen læser
 *      webinar_mails med udfald <> 'ok' med SAMME afgrænsning som de sendte
 *      (session_tid >= graense), bygger nøglerne med noegle() og giver dem til
 *      planlaegKoersel som `fejlede`; `sprunget` kender for_sent_efter_fejl.
 *      I begge spejle giver planlaegKoersel `fejlede` videre til doemMail, som
 *      slår nøglen op, og sorteringen sætter «straks»-arter (bekræftelsen) FØR
 *      ældste planlagte. Uden det bliver en mail, VI fejlede med, for_sent to
 *      timer efter sit tidspunkt — og en ny tilmeldts bekræftelse venter bag 211
 *      indhentede under et loft i timen.
 *  14. ALARMEN KUN I EN RIGTIG KØRSEL (29/9, gensenderens form): efter koer
 *      kaldes skrivAlarm kun når r.sender_rigtigt OG skalAlarmere(r); i
 *      skrivAlarm slås email_send_log op på nøglen FØR sendManagedEmail, mailen
 *      går til driftModtager() (aldrig Mailgun), og klokken skrives med type
 *      WEBINAR_ALARM_KLOKKE_TYPE og reference_type WEBINAR_ALARM_REFERENCE.
 *      Uden det fejlede 211 mails 29/9 over to timer, og ingen fik besked.
 *  15. INGEN BLIND GENSENDELSE (29/9): cronen læser udfald og status på de
 *      fejlede og deler dem med afsendelseUkendt (timeout · fejl uden status ·
 *      fejl ≥ 500) i `fejlede` og `ukendte`; dommen slår `ukendte` op FØR nåden og
 *      indhentningen, i begge spejle, og svaret bærer ukendt_ikke_indhentet.
 *      Uden det blev en timeout — hvor Mailgun kan have taget imod — sendt igen
 *      ved næste kørsel: en dublet, som den en deltager klagede over 22/9.
 *  16. KUN NÆRMESTE SESSION FÅR PÅMINDELSER (29/9): planlaegKoersel regner den
 *      nærmeste IKKE-begyndte session pr. mail og giver `senereSession` til
 *      doemMail, som springer PÅMINDELSER (erPaamindelse, læst af PLANEN — ikke
 *      bekræftelsen) over FØR nåden. Uden det fik en person tilmeldt to sessioner
 *      to hele serier, to mails i samme minut (mail-worstcase §3 scenarie C).
 *  17. BUDGETTET DÆKKER DET VÆRSTE FORLØB (30/9, analyse-drift fund 4): et
 *      forsøg startes kun, hvis forløbet + (ics + Mailgun + spor) ≤ jobbets
 *      timeout − margin; tjekket står efter loftet og FØR hentningen og
 *      afsendelsen, et nej er endeligt i kørslen, JOB_TIMEOUT_MS er ORDRET
 *      kald_edge-timeouten i den nyeste migration, der planlægger 'webinar-mail',
 *      og intet andet await står mellem Mailguns svar og sporet. Uden det kunne
 *      det sidste forsøg ende ved 45 + 8 + 10 = 63 s mod en timeout på 60 s:
 *      pg_net afbryder, mailen er sendt, sporet er ikke — og næste slot sender igen.
 *  18. INDHENTNINGENS LOFT (30/9) — se dommen nedenfor.
 *  19. MORTENS HILSEN (udkast 30/9, _shared/webinarVideo.ts): KUN «en_dag» kan
 *      bære videoen — i cronen (s.art === VIDEO_ART) OG i byggeren (a.art ===
 *      VIDEO_ART); `video` er KRÆVET på MailArgs; konfigurationen læses fail-closed
 *      FØR tørkørslens return og dømmes af videoIKoerslen med prøven = én adresse;
 *      mail-rækkens id trækkes FØR byggeren og skrives i sporet (klik-linket og
 *      rækken bærer det samme id — aldrig en adresse); ingen afspiller i mailen.
 *      Klik-functionen webinar-video: formen FØR createClient, verifyVideoKlik FØR
 *      klikket skrives, kun mail_id i rækken (ingen ip/user agent), målet KUN fra
 *      bunnyAfspilUrl (fast vært) — ingen åben viderestilling; verify_jwt = false
 *      med begrundelse; prædikatet står i CI-værnet; klik-tabellen har ingen
 *      persondata og følger mail-rækken (cascade); konfig-migrationen er ÉN insert.
 *  20. «TI_MINUTTER» KUN FOR MOTORENS RÆKKER (3/10-2026): PLANENs linje bærer
 *      kunMotor og sit eget vindue (T−30 … T−5, udvidet 3/10 efter CTO-rådets
 *      fund 1) i begge spejle; doemMail svarer
 *      «ikke_motor» som det FØRSTE, fail-closed (`!== true`); planlaegKoersel
 *      giver motorRaekke af ewebinar_id (erMotorRaekke), aldrig en konstant;
 *      formen er ORDRET webinarMotor/mail.ts' MOTOR_ID_FORM; arten er ingen
 *      grænse i indhentningens kæde; cronens svar bærer beviset `ti_minutter`,
 *      talt efter prøvens filter (fund 5).
 *  21. PORTEN FOR «TI_MINUTTER» (3/10-2026, CTO-rådets fund 3): migrationen
 *      20261003040000 lægger app_config.webinar_ti_minutter_klar = true (ON
 *      CONFLICT DO NOTHING) i SAMME transaktion som art-CHECK'en, og CHECK'en
 *      skiftes i ÉT alter table (fund 6). Cronen læser nøglen fail-closed
 *      (læsefejl = «laesefejl», alt andet end true = «migration_mangler») FØR
 *      dommen og giver den til planlaegKoersel; dommen tager en kunMotor-art UD
 *      af kørslen uden «klar», i begge spejle; svaret bærer `ti_minutter.port`.
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
/**
 * Den NYESTE migration, der lægger hver af de to CHECK'e (3/10-2026: art-CHECK'en
 * flyttede til 20261003040000 med «ti_minutter»; invitations-CHECK'en står i
 * 20260928120000). Det er den nyeste, der gælder i prod, når den er kørt.
 */
const nyesteMed = (form: RegExp): string => {
  const mappe = "supabase/migrations";
  const filer = readdirSync(resolve(process.cwd(), mappe)).filter((n) => n.endsWith(".sql")).sort();
  const med = filer.filter((n) => form.test(udenSql(readFileSync(resolve(process.cwd(), mappe, n), "utf8"))));
  return med.length > 0 ? `${mappe}/${med[med.length - 1]}` : "";
};
const MIG_ARTER = nyesteMed(/add constraint webinar_mails_art_check\s+check \(art in/);
const MIG_INV = nyesteMed(/add constraint webinar_mails_invitation_arter_check\s+check \(invitation is null or art in/);
const CONFIG = "supabase/config.toml";
const DOM = "supabase/functions/_shared/webinarMailDom.ts";
const DOM_SPEJL = "src/lib/webinar/mailDom.ts";
const LOFT = "supabase/functions/_shared/webinarMailLoft.ts";
const ALARM = "supabase/functions/_shared/webinarMailAlarm.ts";
const BUDGET = "supabase/functions/_shared/webinarMailBudget.ts";
/** Den NYESTE migration, der planlægger cron-jobbet 'webinar-mail' — det er dens timeout, der gælder. */
const MIG_JOB = (() => {
  const mappe = "supabase/migrations";
  const filer = readdirSync(resolve(process.cwd(), mappe)).filter((n) => n.endsWith(".sql")).sort();
  const med = filer.filter((n) => /cron\.schedule\(\s*'webinar-mail',/.test(udenSql(readFileSync(resolve(process.cwd(), mappe, n), "utf8"))));
  return med.length > 0 ? `${mappe}/${med[med.length - 1]}` : "";
})();

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
export const arterITakt = (dom: string, spejl: string, migration: string, cron: string, migInv: string): boolean => {
  const arter = listeIKode(dom, "ARTER"), med = listeIKode(dom, "MED_INVITATION");
  const artCheck = listeICheck(migration, /check \(art in \(([^)]*)\)\)/);
  // 3/10: invitations-CHECK'en læses af SIN nyeste migration (20261003040000 rører kun art-CHECK'en).
  const invCheck = listeICheck(migInv, /check \(invitation is null or art in \(([^)]*)\)\)/);
  const PLAN = '{ art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, indhentesSenestDageFoer: 8, kraeverIkkeBegyndt: false },';
  // 30/9: det, der SENDES, er PLANEN — aldrig en håndskrevet liste — og de udgåede
  // har ingen linje i den. AKTIVE (læst af PLANENs art-felter) + UDGÅEDE = ARTER.
  const AKTIVE = 'export const AKTIVE_ARTER: readonly MailArt[] = PLANEN.map((p) => p.art);';
  const udgaaede = listeIKode(dom, "UDGAAEDE_ARTER");
  const planKrop = (k: string) => { const u = udenKommentarer(k), i = u.indexOf("export const PLANEN"); return i === -1 ? "" : u.slice(i, u.indexOf("];", i)); };
  const iPlan = [...planKrop(dom).matchAll(/\{ art: "([a-z_]+)"/g)].map((m) => m[1]);
  return (
    udgaaede.length > 0 && udgaaede.every((a) => arter.includes(a) && !iPlan.includes(a)) &&
    listeIKode(spejl, "UDGAAEDE_ARTER").join(",") === udgaaede.join(",") &&
    arter.filter((a) => !udgaaede.includes(a)).join(",") === iPlan.join(",") &&
    [...planKrop(spejl).matchAll(/\{ art: "([a-z_]+)"/g)].map((m) => m[1]).join(",") === iPlan.join(",") &&
    dom.includes(AKTIVE) && spejl.includes(AKTIVE) &&
    udenKommentarer(dom).includes("for (const art of AKTIVE_ARTER) {") &&
    udenKommentarer(spejl).includes("for (const art of AKTIVE_ARTER) {") &&
    !udenKommentarer(dom).includes("for (const art of ARTER) {") &&
    udenKommentarer(cron).includes("if (artRaa !== null && !(AKTIVE_ARTER as readonly string[]).includes(artRaa)) {") &&
    // 3/10: otte ord — «ti_minutter» sidst, og den bærer ALDRIG en kalenderfil.
    arter.length === 8 && arter.join(",") === artCheck.join(",") &&
    arter[7] === "ti_minutter" && !med.includes("ti_minutter") &&
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
    t.includes("const i = indhold(a.art, tid, a.invitationVedhaeftet, video, klokke);") &&
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
    loekke.includes("if (forsoegt >= loft.maks) { r.over_loft++; r.ventende.push({ art: s.art, session_tid: s.sessionTid }); continue; }") &&
    foer(loekke, "if (forsoegt >= loft.maks) { r.over_loft++; r.ventende.push({ art: s.art, session_tid: s.sessionTid }); continue; }", "await hentInvitation(s.kalenderLink)") &&
    // Stoppet: EFTER sporet, og blokken er kort — tælleren, én console.error og break.
    stop !== -1 &&
    foer(loekke, 'from("webinar_mails").insert(', "if (erStopStatus(spor.status)) {") &&
    loekke.slice(stop, stop + 500).includes("break;") &&
    loekke.slice(stop, stop + 500).includes("r.over_loft += sendinger.length - i - 1;") &&
    // Motoren: loftet og stop-koderne står ordret.
    l.includes("export const MAILGUN_LOFT_PR_TIME = 1000;") &&
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
    f.includes('a.admin.from("webinar_mails").select("email, session_tid, art, udfald, status").neq("udfald", "ok")\n      .gte("session_tid", graense)') &&
    f.includes("const fejlede = new Set(fejledeRaekker.filter((x) => !afsendelseUkendt(x)).map((x) => noegle(x.email, x.session_tid, x.art)));") &&
    f.includes("const plan = planlaegKoersel({ raekker, afmeldte, sendte, fejlede, ukendte, nu: a.nu, tiMinutterPort });") &&
    foer(f, "const fejlede = new Set(", "const plan = planlaegKoersel(") &&
    f.includes("for_sent_efter_fejl: 0") &&
    iDommen(dom) && iDommen(spejl)
  );
};

// ── 18 ─────────────────────────────────────────────────────────────────────
/**
 * 30/9: INDHENTNINGENS LOFT følger teksten. Uden tre_dage i PLANEN løb en fejlet
 * «om en uge» til dagen før en_dag (to dage før sessionen). Nu har hver tidssat
 * påmindelse et loft (indhentesSenestDageFoer: 8 · 4 · 1), indhentningSlut tager
 * den TIDLIGSTE af næste arts dato og loftet, et manglende loft er fail-closed —
 * i begge spejle — og alarmens frist læser SAMME funktion.
 */
export const indhentningFoelgerTeksten = (dom: string, spejl: string, alarm: string): boolean => {
  const iDommen = (k: string) => {
    const d = udenKommentarer(k);
    const doem = d.slice(d.indexOf("export function doemMail("), d.indexOf("export function erPaamindelse("));
    const slut = d.slice(d.indexOf("export function indhentningSlut("), d.indexOf("export function sammeDanskeDato("));
    return (
      d.includes('{ art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, indhentesSenestDageFoer: 8, kraeverIkkeBegyndt: false },') &&
      d.includes('{ art: "syv_dage", dageFoer: 7, time: 8, minut: 0, indhentesSenestDageFoer: 4, kraeverIkkeBegyndt: false },') &&
      d.includes('{ art: "en_dag", dageFoer: 1, time: 8, minut: 0, indhentesSenestDageFoer: 1, kraeverIkkeBegyndt: false },') &&
      doem.includes("const slut = indhentningSlut(i.sessionTid, art);") &&
      doem.includes("if (i.nu.getTime() < slut.getTime()) {") &&
      !doem.includes("planlagtTid(i.sessionTid, naeste)") && !doem.includes("sammeDanskeDato(") &&
      slut.includes("plan.indhentesSenestDageFoer === undefined) return null;") &&
      slut.includes("const a = danskMidnatDageFoer(naesteTid, 0);") &&
      slut.includes("const b = danskMidnatDageFoer(new Date(ms), plan.indhentesSenestDageFoer - 1);") &&
      slut.includes("return new Date(Math.min(a.getTime(), b.getTime()));")
    );
  };
  const a = udenKommentarer(alarm);
  const frist = a.slice(a.indexOf("export function fristFor("), a.indexOf("export interface Prognose"));
  return (
    iDommen(dom) && iDommen(spejl) &&
    a.includes("indhentningSlut") &&
    !a.includes("naesteTidssatteArt") &&
    frist.includes("const slut = indhentningSlut(sessionTid, art);") &&
    frist.includes("new Date(Math.max(efterNaade.getTime(), slut.getTime()))")
  );
};

// ── 15 ─────────────────────────────────────────────────────────────────────
/**
 * 29/9: et forsøg med UKENDT udfald (timeout, afbrudt forbindelse, 5xx) gensendes
 * aldrig automatisk. Cronen læser udfald og status, deler de fejlede efter
 * afsendelseUkendt og giver `ukendte` til dommen; dommen slår nøglen op FØR
 * nåden og indhentningen, i begge spejle.
 */
export const ukendteGensendesIkke = (cron: string, dom: string, spejl: string): boolean => {
  const f = udenKommentarer(cron);
  const iDommen = (k: string) => {
    const d = udenKommentarer(k);
    return (
      d.includes('if (forsoeg.udfald === "timeout") return true;') &&
      d.includes('if (forsoeg.udfald === "fejl" && (forsoeg.status === null || forsoeg.status >= 500)) return true;') &&
      d.includes("ukendte?: ReadonlySet<string>;") &&
      d.includes("if (i.ukendte?.has(noegle(mail, i.sessionTid, art)) ?? false) {") &&
      d.includes("ukendte: i.ukendte,") &&
      // FØR nåden og indhentningen — ellers ville et ukendt inden for to timer gå igen.
      foer(d, 'grund: "levering_ukendt"', "const forsinkelse = ") &&
      foer(d, 'grund: "levering_ukendt"', "if (plan.straks === true) return { send: true")
    );
  };
  return (
    f.includes('select("email, session_tid, art, udfald, status").neq("udfald", "ok")') &&
    f.includes("const ukendte = new Set(fejledeRaekker.filter((x) => afsendelseUkendt(x)).map((x) => noegle(x.email, x.session_tid, x.art)));") &&
    f.includes("const fejlede = new Set(fejledeRaekker.filter((x) => !afsendelseUkendt(x)).map(") &&
    f.includes("planlaegKoersel({ raekker, afmeldte, sendte, fejlede, ukendte, nu: a.nu, tiMinutterPort })") &&
    f.includes("r.ukendt_ikke_indhentet = plan.sprunget.levering_ukendt;") &&
    f.includes("levering_ukendt: 0") &&
    iDommen(dom) && iDommen(spejl)
  );
};

// ── 16 ─────────────────────────────────────────────────────────────────────
/**
 * 29/9: kun den NÆRMESTE kommende session pr. mail får påmindelser; bekræftelsen
 * går stadig pr. session. planlaegKoersel regner den nærmeste (ikke begyndt) og
 * giver `senereSession` til doemMail, der springer påmindelser (erPaamindelse,
 * læst af PLANEN) over FØR nåden — så en senere session aldrig «indhenter».
 */
export const kunNaermesteSession = (cron: string, dom: string, spejl: string): boolean => {
  const f = udenKommentarer(cron);
  const iDommen = (k: string) => {
    const d = udenKommentarer(k);
    return (
      d.includes("return plan !== undefined && plan.straks !== true;") &&
      d.includes("if (i.senereSession === true && erPaamindelse(art)) {") &&
      d.includes("if (!Number.isFinite(ms) || ms <= i.nu.getTime()) continue;") &&
      d.includes("if (har === undefined || ms < har) naermeste.set(mail, ms);") &&
      d.includes("const senereSession = foersteKommende !== undefined && Date.parse(r.session_tid as string) > foersteKommende;") &&
      /ukendte: i\.ukendte,\n\s*senereSession,\n/.test(d) &&
      foer(d, 'grund: "senere_session"', "const forsinkelse = ") &&
      foer(d, 'grund: "senere_session"', "if (plan.straks === true) return { send: true")
    );
  };
  return (
    f.includes("r.sprunget_senere_session = plan.sprunget.senere_session;") &&
    f.includes("senere_session: 0") &&
    iDommen(dom) && iDommen(spejl)
  );
};

// ── 17 ─────────────────────────────────────────────────────────────────────
/** Jobbets timeout, læst af kald_edge-kaldet i migrationen (kommentarlinjer og halekommentarer væk). */
export const jobTimeoutIMigrationen = (mig: string): number | null => {
  const k = udenSql(mig).replace(/--[^\n]*/g, "");
  const m = k.match(/kald_edge\(\s*'webinar-mail-cron',\s*'[^']*'::jsonb,\s*(\d+)\s*,/);
  return m ? Number(m[1]) : null;
};

export const budgetDaekkerVaersteForloeb = (cron: string, budget: string, mig: string): boolean => {
  const f = udenKommentarer(cron), b = udenKommentarer(budget);
  const LOEKKE = "for (let i = 0; i < sendinger.length; i++) {";
  const start = f.indexOf(LOEKKE), slut = f.indexOf("async function skrivAlarm(");
  if (start === -1 || slut === -1 || start > slut) return false;
  const loekke = f.slice(start, slut);
  const TJEK = "if (!budgetTillader({ forloebetMs, medInvitation: baererInvitation(s.art) })) {";
  const STOP = "if (r.budget.stoppet_af_budget) { r.udsat++; r.udsatte.push({ art: s.art, session_tid: s.sessionTid }); continue; }";
  // Fra det SIDSTE Mailgun-kald til sporet: intet andet await.
  const KALD = "spor = await sendMailgun";
  const sidsteKald = loekke.lastIndexOf(KALD);
  const insert = loekke.indexOf('await a.admin.from("webinar_mails").insert(');
  const mellem = sidsteKald !== -1 && insert > sidsteKald ? loekke.slice(sidsteKald + KALD.length, insert) : null;
  const jobTimeout = jobTimeoutIMigrationen(mig);
  const konst = (navn: string) => { const m = b.match(new RegExp(`export const ${navn} = ([\\d_]+);`)); return m ? Number(m[1].replace(/_/g, "")) : null; };
  const JOB = konst("JOB_TIMEOUT_MS"), MARGIN = konst("OPSTART_MARGIN_MS"), SPOR = konst("SPOR_RESERVE_MS");
  return (
    f.includes('from "../_shared/webinarMailBudget.ts"') &&
    // Det gamle, halve budget er væk.
    !/BUDGET_MS/.test(f) &&
    // Tjekket: forløbet regnes fra startMs, dømmes pr. art, og står EFTER loftet og FØR alt, der tager tid.
    loekke.includes("const forloebetMs = Date.now() - a.startMs;") &&
    loekke.includes(TJEK) &&
    loekke.includes(STOP) &&
    foer(loekke, "if (forsoegt >= loft.maks) {", TJEK) &&
    foer(loekke, TJEK, STOP) &&
    foer(loekke, STOP, "await byggAfmeldToken(") &&
    foer(loekke, STOP, "await hentInvitation(") &&
    foer(loekke, STOP, "await sendMailgun") &&
    // Et nej er endeligt: stoppet sættes, og forløbet bogføres.
    loekke.includes("r.budget.stoppet_af_budget = true;") &&
    loekke.includes("r.budget.forloebet_ved_stop_ms = forloebetMs;") &&
    // Beviset i svaret.
    f.includes("budget: BudgetBevis;") &&
    f.includes("budget: tomtBudgetBevis(),") &&
    // Sporet så tidligt som muligt: intet await mellem Mailguns svar og insertet.
    mellem !== null && !/\bawait\b/.test(mellem) &&
    // Motoren: resttiden er begge timeouts + spor, dommen er ≤ job − margin, fail-closed.
    b.includes('import { TIMEOUT_MS } from "./mailgunAfsendelse.ts";') &&
    b.includes('import { INVITATION_TIMEOUT_MS } from "./mimeInvitation.ts";') &&
    b.includes("return (medInvitation ? INVITATION_TIMEOUT_MS : 0) + TIMEOUT_MS + SPOR_RESERVE_MS;") &&
    b.includes("return a.forloebetMs + resttidKraevetMs(a.medInvitation) <= JOB_TIMEOUT_MS - OPSTART_MARGIN_MS;") &&
    b.includes("if (!Number.isFinite(a.forloebetMs) || a.forloebetMs < 0) return false;") &&
    // Tallene: jobbets timeout er ORDRET migrationens, og marginerne er ikke nul.
    jobTimeout !== null && JOB === jobTimeout &&
    MARGIN !== null && MARGIN >= 1_000 && SPOR !== null && SPOR >= 1_000
  );
};

// ── 14 ─────────────────────────────────────────────────────────────────────
/** Omdømt 29/9 14:04: alarmen kaldes kun i en rigtig kørsel, og KUN når doemAlarm siger ja; loft, tabt og frist har nøgle pr. dag, kun fejl pr. time. */
export const alarmenKunIRigtigKoersel = (cron: string, alarm: string): boolean => {
  const f = udenKommentarer(cron), a = udenKommentarer(alarm);
  const start = f.indexOf("async function skrivAlarm("), slut = f.indexOf("Deno.serve(");
  if (start === -1 || slut === -1 || start > slut) return false;
  const skriv = f.slice(start, slut);
  const serve = f.slice(slut);
  return (
    f.includes('from "../_shared/webinarMailAlarm.ts"') &&
    // Kaldet: efter koer, kun i en rigtig kørsel, kun når dommen siger ja — på rigtig tid.
    foer(serve, "const r = await koer(", "const alarmNu = new Date();") &&
    serve.includes("const alarm = r.sender_rigtigt ? doemAlarm(r, alarmNu) : null;") &&
    serve.includes("if (r.sender_rigtigt && alarm !== null) await skrivAlarm(admin, r, alarm, alarmNu);") &&
    (serve.match(/await skrivAlarm\(/g) ?? []).length === 1 &&
    // Nøglen er DOMMENS (art i nøglen), og opslaget står FØR afsendelsen.
    skriv.includes("const noegle = alarm.noegle;") &&
    foer(skriv, '.select("message_id").eq("message_id", noegle).limit(1);', "await sendManagedEmail({") &&
    skriv.includes('r.alarm_mail = "fandtes";') &&
    // Mailen: driftModtager, label og nøgle — aldrig Mailgun.
    skriv.includes("        to: driftModtager(),") &&
    skriv.includes("        label: WEBINAR_ALARM_MAIL_LABEL,") &&
    skriv.includes("        idempotencyKey: noegle,") &&
    !/sendMailgun/.test(skriv) &&
    // Klokken: typen og referencen fra motoren; titlen bærer nøglens dato (loft) eller dato+time.
    /skrivRaadgiverBesked\(admin, \{\s*type: WEBINAR_ALARM_KLOKKE_TYPE,\s*title: tekst\.titel,[\s\S]{0,300}?reference_type: "webinar_mails" satisfies typeof WEBINAR_ALARM_REFERENCE,\s*reference_id: null,/.test(skriv) &&
    // Kaster aldrig: to try/catch, og fejl til r.fejl.
    (skriv.match(/\} catch \(err\) \{/g) ?? []).length === 2 &&
    skriv.includes("r.fejl.push(`alarm_mail: ${grund}`);") &&
    skriv.includes("r.fejl.push(`alarm_klokke: ${grund}`);") &&
    // Motoren: aldrig i tørkørsel; loft, tabt og frist er ÉN pr. dansk DAG, fejl og ti_minutter pr. TIME;
    // alvorsorden fejl > ti_minutter > tabt > frist > loft (3/10).
    a.includes("if (!r.sender_rigtigt) return null;") &&
    a.includes('export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "tabt", "frist"];') &&
    a.includes("const hale = ARTER_PR_DAG.includes(art) ? webinarAlarmDato(nu) : webinarAlarmDatoOgTime(nu);") &&
    /fejl\.length > 0 \? "fejl"\s*: tiMinutter\.iFare\.length > 0 \|\| tiMinutter\.tabt > 0 \? "ti_minutter"\s*: tabt > 0 \? "tabt"\s*: iFare\.length > 0 \? "frist"\s*: loftStop \? "loft"\s*: null;/.test(a) &&
    a.includes("const loftStop = r.loft.pause !== null || r.loft.stoppet_ved !== null || r.over_loft > 0;") &&
    // Cronen giver dommen det, den behøver: ok pr. time og de ventende med art og session.
    f.includes('ok_60_min: loftRaekker.filter((x) => x.udfald === "ok").length,') &&
    f.includes("r.ventende = (loft.pause ? sendinger : sendinger.slice(loft.maks)).map((s) => ({ art: s.art, session_tid: s.sessionTid }));") &&
    f.includes("for (const v of sendinger.slice(i + 1)) r.ventende.push({ art: v.art, session_tid: v.sessionTid });") &&
    // 3/10 (CTO-rådets fund 1): de UDSATTE (budgettet) og de TABTE «ti_minutter» når alarmen.
    f.includes("if (r.budget.stoppet_af_budget) { r.udsat++; r.udsatte.push({ art: s.art, session_tid: s.sessionTid }); continue; }") &&
    // Runde 2, fund 2: de tabte NØGLER slås op med, og en aflyst session fraregnes (den rene hjælper).
    f.includes("const tabte = proevenTagerTi ? plan.kortNaadeTabte : [];") &&
    f.includes("const motorIds = [...new Set([...planlagte.map((s) => s.ewebinarId), ...tabte])].filter(erMotorId);") &&
    f.includes("tabt: taelTabteUdenAflyste(tabte, (id) => mailVejDom(id, motorOpslag.get(id), motorSecret !== null)),") &&
    a.includes('export const WEBINAR_ALARM_KLOKKE_TYPE = "drift";') &&
    a.includes('export const WEBINAR_ALARM_REFERENCE = "webinar_mails";')
  );
};

// ── 20 ─────────────────────────────────────────────────────────────────────
const MOTOR_MAIL = "supabase/functions/_shared/webinarMotor/mail.ts";
const TI_PLAN = '{ art: "ti_minutter", minutterFoer: 10, tidligstFoerMs: 20 * 60_000, naadeMs: 5 * 60_000, kunMotor: true, kraeverIkkeBegyndt: true },';
const IKKE_MOTOR_FOERST = '  const { art } = i;\n  if (kunMotor(art) && i.motorRaekke !== true) return { send: false, art, grund: "ikke_motor" };\n  if (i.afmeldt) return';
export const tiMinutterKunMotor = (dom: string, spejl: string, cron: string, motorMail: string): boolean => {
  const form = (k: string, navn: string) => udenKommentarer(k).match(new RegExp(`export const ${navn} = (\\/\\^P-[^\\n]*\\$\\/);`))?.[1] ?? null;
  const motorForm = form(motorMail, "MOTOR_ID_FORM");
  for (const k of [dom, spejl]) {
    // Uden kommentarer OG uden de tomme linjer, de efterlader — så «FØRST» kan læses som nabolinjer.
    const u = udenKommentarer(k).replace(/\n[ \t]*(?=\n)/g, "");
    if (!u.includes(TI_PLAN)) return false;
    if (!u.includes(IKKE_MOTOR_FOERST)) return false;
    if ((u.match(/grund: "ikke_motor"/g) ?? []).length !== 1) return false;
    if (!u.includes("return PLANEN.find((p) => p.art === art)?.kunMotor === true;")) return false;
    if (!u.includes("const motorRaekke = erMotorRaekke(r.ewebinar_id);")) return false;
    if (!/senereSession,\s*\n\s*motorRaekke,\s*\n\s*nu: i\.nu,/.test(u)) return false;
    if (!u.includes("p.straks !== true && p.kunMotor !== true")) return false;
    if (motorForm === null || form(k, "MOTOR_ID_FORM_DOM") !== motorForm) return false;
    // Runde 2, fund 1: «tabt» kun for en tilmeldt mindst ét helt hul før fristen.
    if (!u.includes("return !Number.isFinite(reg) || reg <= frist - STOERSTE_HUL_MS;")) return false;
    if (!u.includes("export const STOERSTE_HUL_MS = 10 * 60_000;")) return false;
    // Runde 2, fund 4: aldrig tre mails i samme kørsel — pr. ewebinar_id, efter dommen, før sorteringen.
    if (!u.includes('export const SAMME_KOERSEL_ARTER: readonly MailArt[] = ["bekraeftelse", "en_time"];')) return false;
    if (!u.includes("const fikAndenNu = new Set(sendinger.filter((s) => SAMME_KOERSEL_ARTER.includes(s.art)).map((s) => s.ewebinarId));")) return false;
    if (!u.includes("if (kunMotor(sendinger[n].art) && fikAndenNu.has(sendinger[n].ewebinarId)) {")) return false;
    if (!foer(u, "const fikAndenNu = new Set(", "sendinger.sort((a, b) =>")) return false;
  }
  const c = udenKommentarer(cron);
  // Beviset i svaret — og (fund 5) talt på SAMME grundlag som skal_sendes: efter prøvens filter.
  return c.includes("ti_minutter: { port: TiMinutterPort; ikke_motor: number; skal_sendes: number; tabt: number };") &&
    c.includes("const proevenTagerTi = a.art === null || kunMotor(a.art);") &&
    c.includes("ikke_motor: proevenTagerTi ? plan.sprunget.ikke_motor : 0,") &&
    c.includes("skal_sendes: sendinger.filter((s) => kunMotor(s.art)).length,");
};

// ── 19 ─────────────────────────────────────────────────────────────────────
const VIDEO = "supabase/functions/_shared/webinarVideo.ts";
const KLIK = "supabase/functions/webinar-video/index.ts";
const CI = "scripts/check-edge-function-auth.ts";
const MIG_VIDEO = "supabase/migrations/20260930180000_webinar_en_dag_video.sql";
const MIG_KLIK = "supabase/migrations/20260930181000_webinar_video_klik.sql";
export const videoKunEnDag = (a: { cron: string; tekster: string; video: string; klik: string; config: string; ci: string; migVideo: string; migKlik: string }): boolean => {
  const c = udenKommentarer(a.cron), t = udenKommentarer(a.tekster), v = udenBlokke(a.video), k = udenBlokke(a.klik);
  const LOEKKE = "for (let i = 0; i < sendinger.length; i++) {";
  const start = c.indexOf(LOEKKE), slut = c.indexOf("async function skrivAlarm(");
  if (start === -1 || slut === -1 || start > slut) return false;
  const loekke = c.slice(start, slut);
  const koer = c.slice(c.indexOf("async function koer("), start);
  const laesFn = c.slice(c.indexOf("async function laesVideoRaekke("), c.indexOf("async function alleSider<"));
  const serve = k.slice(k.indexOf("Deno.serve("));
  const blok = a.config.slice(a.config.indexOf("[functions.webinar-video]"), a.config.indexOf("[functions.webinar-video]") + 60);
  const klikTabel = udenSql(a.migKlik);
  const videoSql = udenSql(a.migVideo).trim();
  return (
    // ── Cronen ──
    c.includes('from "../_shared/webinarVideo.ts";') &&
    // Konfigurationen læses fail-closed: en fejl er «laesefejl», aldrig en video.
    laesFn.includes('.eq("config_key", VIDEO_KONFIG_NOEGLE).maybeSingle();') &&
    laesFn.includes('return "laesefejl";') &&
    laesFn.includes("return laesVideoKonfig(") &&
    // ... FØR tørkørslens return, så tørkørslen viser status — og prøven er ÉN adresse.
    foer(koer, "const videoDom = await laesVideoRaekke(a.admin);", "if (!senderRigtigt) return r;") &&
    koer.includes("videoIKoerslen(videoDom, a.email !== null)") &&
    koer.includes("r.video = { status: videoValg.status, grund: videoValg.grund, med_video: 0 };") &&
    // KUN en_dag, og id'et trækkes FØR byggeren og bæres til sporet.
    loekke.includes("const mailId = crypto.randomUUID();") &&
    loekke.includes("const video = s.art === VIDEO_ART && videoKonfig !== null ? mailVideo(videoKonfig, a.klikBasis, mailId) : null;") &&
    foer(loekke, "const mailId = crypto.randomUUID();", "const mail = bygWebinarMail({") &&
    /bygWebinarMail\(\{[\s\S]{0,400}?\n\s*video,\n/.test(loekke) &&
    /from\("webinar_mails"\)\.insert\(\{\s*id: mailId,/.test(loekke) &&
    c.includes("video: { status: VideoStatus; grund: string | null; med_video: number };") &&
    // ── Byggeren ──
    t.includes("video: MailVideo | null;") && !/video\?:/.test(t) &&
    t.includes("const video = a.art === VIDEO_ART ? a.video : null;") &&
    t.includes("const i = indhold(a.art, tid, a.invitationVedhaeftet, video, klokke);") &&
    !/<iframe|<video/i.test(t) &&
    // ── Motoren ──
    v.includes('export const VIDEO_ART: MailArt = "en_dag";') &&
    v.includes('export const VIDEO_KONFIG_NOEGLE = "webinar_en_dag_video";') &&
    v.includes('export const BUNNY_AFSPIL_VAERT = "iframe.mediadelivery.net";') &&
    v.includes("return u.host === BUNNY_AFSPIL_VAERT && u.protocol === \"https:\" ? u.toString() : null;") &&
    v.includes('if (raa === null || raa === undefined) return { status: "ikke_sat" };') &&
    v.includes('if (dom.konfig.aktiv) return { status: "taendt", konfig: dom.konfig, grund: null };') &&
    v.includes('if (proeve) return { status: "proeve", konfig: dom.konfig, grund: null };') &&
    v.includes('.eq("id", id).eq("art", VIDEO_ART).eq("udfald", "ok").maybeSingle();') &&
    // ── Klik-functionen ──
    foer(serve, "laesKlikId(raaId)", "createClient(") &&
    foer(serve, "await verifyVideoKlik(admin, raaId)", 'from("webinar_video_klik").insert(') &&
    serve.includes('.insert({ mail_id: dom.mailId });') &&
    serve.includes('if (k.status === "gyldig") maal = bunnyAfspilUrl(k.konfig);') &&
    (serve.match(/maal = /g) ?? []).length === 1 &&
    serve.includes("Location: maal,") &&
    // Kun «m» læses af URL'en, og ingen header om personen.
    (serve.match(/searchParams\.get\(/g) ?? []).length === 1 && serve.includes('searchParams.get("m")') &&
    !/req\.headers|user-agent|x-forwarded-for|cf-connecting-ip/i.test(serve) &&
    /verify_jwt = false/.test(blok) &&
    /\{ name: "verifyVideoKlik\(\)",\s*pattern: \/\\bverifyVideoKlik\\s\*\\\(\/ \}/.test(a.ci) &&
    // ── Migrationerne ──
    /^-- (IKKE KØRT\. DEPLOY: manuelt i Lovable|KØRT i prod)/.test(a.migVideo) &&
    /^-- (IKKE KØRT\. DEPLOY: manuelt i Lovable|KØRT i prod)/.test(a.migKlik) &&
    // Konfig-migrationen er ÉN insert med null og ON CONFLICT DO NOTHING — intet andet.
    /^insert into public\.app_config \(config_key, config_value, description\)\s+values \('webinar_en_dag_video', 'null'::jsonb, '[^']*'\)\s+on conflict \(config_key\) do nothing;$/.test(videoSql) &&
    // Klik-tabellen: fremmednøgle med cascade, og ingen persondata.
    /mail_id\s+uuid not null references public\.webinar_mails \(id\) on delete cascade/.test(klikTabel) &&
    !/\b(ip|user_agent|email)\b/.test(klikTabel.slice(klikTabel.indexOf("create table"), klikTabel.indexOf(");") + 2)) &&
    klikTabel.includes("enable row level security")
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
  it("10. ARTER og MED_INVITATION er i takt med CHECK'ene, og AKTIVE_ARTER er PLANEN (udgåede uden plan), i begge spejle", () => expect(arterITakt(laes(DOM), laes(DOM_SPEJL), laes(MIG_ARTER), laes(CRON), laes(MIG_INV))).toBe(true));
  it("11. teksten følger invitationen: hentet FØR byggeren, flaget krævet og brugt", () => expect(tekstenFoelgerInvitationen(laes(CRON), laes(TEKSTER))).toBe(true));
  it("12. loftet regnes før løkken, pause sender intet, og 403/420/429 bryder løkken efter sporet", () => expect(loftetFoerLoekken(laes(CRON), laes(LOFT))).toBe(true));
  it("13. de fejlede læses med samme afgrænsning og gives til dommen, og bekræftelser sorteres først", () => expect(fejledeIndhentes(laes(CRON), laes(DOM), laes(DOM_SPEJL))).toBe(true));
  it("14. alarmen kaldes kun i en rigtig kørsel, opslaget står før mailen, mailen går til driftModtager, klokken bærer referencen", () => expect(alarmenKunIRigtigKoersel(laes(CRON), laes(ALARM))).toBe(true));
  it("15. et forsøg med ukendt udfald gensendes aldrig automatisk, i begge spejle", () => expect(ukendteGensendesIkke(laes(CRON), laes(DOM), laes(DOM_SPEJL))).toBe(true));
  it("16. kun den nærmeste kommende session får påmindelser, i begge spejle", () => expect(kunNaermesteSession(laes(CRON), laes(DOM), laes(DOM_SPEJL))).toBe(true));
  it("17. budgettet dækker det værste forløb før jobbets timeout, og sporet skrives straks efter Mailgun", () => {
    expect(MIG_JOB).toBe("supabase/migrations/20260922172000_webinar_mail_cron.sql");
    expect(jobTimeoutIMigrationen(laes(MIG_JOB))).toBe(60_000);
    expect(budgetDaekkerVaersteForloeb(laes(CRON), laes(BUDGET), laes(MIG_JOB))).toBe(true);
  });
  it("18. indhentningens loft følger teksten (8 · 4 · 1 dage før), fail-closed, i begge spejle, og alarmens frist læser samme funktion", () =>
    expect(indhentningFoelgerTeksten(laes(DOM), laes(DOM_SPEJL), laes(ALARM))).toBe(true));
  it("19. Mortens hilsen: kun en_dag, fail-closed, id'et fra sporet i linket, og klikket anonymt uden åben viderestilling", () =>
    expect(videoKunEnDag(videoFiler())).toBe(true));
  it("20. ti_minutter KUN for motorens rækker: kunMotor i PLANEN, «ikke_motor» først, motorRaekke af id'et, samme form som motoren, beviset i svaret", () =>
    expect(tiMinutterKunMotor(laes(DOM), laes(DOM_SPEJL), laes(CRON), laes(MOTOR_MAIL))).toBe(true));
  it("21. porten for ti_minutter: migrationen lægger den med CHECK'en i én transaktion, cronen læser den fail-closed FØR dommen, dommen tager arten ud uden «klar»", () =>
    expect(tiMinutterPorten(laes(DOM), laes(DOM_SPEJL), laes(CRON), laes(MIG_TI))).toBe(true));
});

describe("webinarMail.guard dom 21 — porten for ti_minutter (mutationer)", () => {
  const dom = laes(DOM), spejl = laes(DOM_SPEJL), cron = laes(CRON), mig = laes(MIG_TI);
  const ud = (k: string, fra: string, til: string) => { const n = k.split(fra).join(til); expect(n, fra).not.toBe(k); return n; };
  it("udgangspunktet består", () => expect(tiMinutterPorten(dom, spejl, cron, mig)).toBe(true));
  it("MUTATION: porten fjernet i det ene spejl", () =>
    expect(tiMinutterPorten(dom, ud(spejl, PORT_GATE, ""), cron, mig)).toBe(false));
  it("MUTATION: porten fail-open (`=== \"laesefejl\"` i stedet for `!== \"klar\"`)", () =>
    expect(tiMinutterPorten(ud(dom, PORT_GATE, 'if (kunMotor(art) && i.tiMinutterPort === "laesefejl") continue;'), spejl, cron, mig)).toBe(false));
  it("MUTATION: en læsefejl giver «klar»", () =>
    expect(tiMinutterPorten(dom, spejl, ud(cron, 'return "laesefejl";', 'return "klar";'), mig)).toBe(false));
  it("MUTATION: porten læst EFTER dommen", () => {
    const c = ud(cron, "  const tiMinutterPort = await laesTiMinutterPort(a.admin);\n", "")
      .split("  r.sprunget = plan.sprunget;\n").join("  r.sprunget = plan.sprunget;\n  const tiMinutterPort = await laesTiMinutterPort(a.admin);\n");
    expect(tiMinutterPorten(dom, spejl, c, mig)).toBe(false);
  });
  it("MUTATION: porten ikke givet til dommen", () =>
    expect(tiMinutterPorten(dom, spejl, ud(cron, "nu: a.nu, tiMinutterPort })", "nu: a.nu })"), mig)).toBe(false));
  it("MUTATION: migrationen uden ON CONFLICT DO NOTHING", () =>
    expect(tiMinutterPorten(dom, spejl, cron, ud(mig, "on conflict (config_key) do nothing;\n\ncommit;", ";\n\ncommit;"))).toBe(false));
  it("MUTATION: porten uden for transaktionen", () =>
    expect(tiMinutterPorten(dom, spejl, cron, ud(mig, "\ncommit;\n", "\n").replace("\nbegin;\n", "\n"))).toBe(false));
  it("MUTATION: CHECK'en i to sætninger (drop; add) — et øjeblik uden CHECK", () =>
    expect(tiMinutterPorten(dom, spejl, cron, ud(mig, "  drop constraint if exists webinar_mails_art_check,\n  add constraint", "  drop constraint if exists webinar_mails_art_check;\nalter table public.webinar_mails\n  add constraint"))).toBe(false));
  it("MUTATION: en anden nøgle i cronen end i migrationen", () =>
    expect(tiMinutterPorten(dom, spejl, ud(cron, '"webinar_ti_minutter_klar"', '"webinar_ti_klar"'), mig)).toBe(false));
});

describe("webinarMail.guard dom 20 — eWebinar-rækker kan ALDRIG få ti_minutter (mutationer)", () => {
  const dom = laes(DOM), spejl = laes(DOM_SPEJL), cron = laes(CRON), motor = laes(MOTOR_MAIL);
  const begge = (fra: string, til: string): [string, string] => {
    const d = dom.split(fra).join(til), s = spejl.split(fra).join(til);
    expect(d, fra).not.toBe(dom);
    return [d, s];
  };
  it("udgangspunktet består", () => expect(tiMinutterKunMotor(dom, spejl, cron, motor)).toBe(true));
  it("MUTATION: kunMotor fjernet fra PLANENs linje — så fik alle rækker arten", () => {
    const [d, s] = begge("kunMotor: true, kraeverIkkeBegyndt: true },", "kraeverIkkeBegyndt: true },");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
  });
  it("MUTATION: porten slækket til `!== false` — en række uden motorRaekke (udeladt) slap igennem", () => {
    const [d, s] = begge("i.motorRaekke !== true) return", "i.motorRaekke !== false) return");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
  });
  it("MUTATION: porten flyttet efter afmeldingen (ikke længere FØRST)", () => {
    const linje = '  if (kunMotor(art) && i.motorRaekke !== true) return { send: false, art, grund: "ikke_motor" };\n';
    const [d, s] = begge(linje, "");
    const flyt = (k: string) => k.split('  if (i.alleredeSendt) return { send: false, art, grund: "allerede_sendt" };\n').join(`${linje}  if (i.alleredeSendt) return { send: false, art, grund: "allerede_sendt" };\n`);
    expect(tiMinutterKunMotor(flyt(d), flyt(s), cron, motor)).toBe(false);
  });
  it("MUTATION: planlaegKoersel giver motorRaekke som konstant true", () => {
    const [d, s] = begge("const motorRaekke = erMotorRaekke(r.ewebinar_id);", "const motorRaekke = true;");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
  });
  it("MUTATION: formen slækket til «P-» alene — eller kun i det ene spejl", () => {
    const fra = "export const MOTOR_ID_FORM_DOM = /^P-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;";
    const [d, s] = begge(fra, "export const MOTOR_ID_FORM_DOM = /^P-.*$/;");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
    expect(tiMinutterKunMotor(dom, s, cron, motor)).toBe(false);
  });
  it("MUTATION: ti_minutter som grænse i indhentningens kæde (en_time fik en «næste»)", () => {
    const [d, s] = begge("p.straks !== true && p.kunMotor !== true", "p.straks !== true");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
  });
  it("MUTATION: beviset `ti_minutter` fjernet fra cronens svar", () => {
    const c = cron.split("ti_minutter: { port: TiMinutterPort; ikke_motor: number; skal_sendes: number; tabt: number };").join("x: number;");
    expect(c).not.toBe(cron);
    expect(tiMinutterKunMotor(dom, spejl, c, motor)).toBe(false);
  });
  it("MUTATION: ikke_motor talt FØR prøvens filter (fund 5) — en prøve på en anden art ville vise eWebinar-tallet", () => {
    const c = cron.split("ikke_motor: proevenTagerTi ? plan.sprunget.ikke_motor : 0,").join("ikke_motor: plan.sprunget.ikke_motor,");
    expect(c).not.toBe(cron);
    expect(tiMinutterKunMotor(dom, spejl, c, motor)).toBe(false);
  });
  it("MUTATION (runde 2, fund 2): tabt talt som den rå liste — aflyste sessioner ville alarmere", () => {
    const c = cron.split("tabt: taelTabteUdenAflyste(tabte, (id) => mailVejDom(id, motorOpslag.get(id), motorSecret !== null)),").join("tabt: tabte.length,");
    expect(c).not.toBe(cron);
    expect(alarmenKunIRigtigKoersel(c, laes(ALARM))).toBe(false);
  });
  it("MUTATION (runde 2, fund 2): de tabte ikke slået op — mailVejDom ville se «ikke_fundet» for en aflyst", () => {
    const c = cron.split("const motorIds = [...new Set([...planlagte.map((s) => s.ewebinarId), ...tabte])].filter(erMotorId);").join("const motorIds = planlagte.map((s) => s.ewebinarId).filter(erMotorId);");
    expect(c).not.toBe(cron);
    expect(alarmenKunIRigtigKoersel(c, laes(ALARM))).toBe(false);
  });
  it("MUTATION (runde 2, fund 1): grænsen for «tabt» tilbage til fristen (uden det største hul)", () => {
    const [d, s] = begge("reg <= frist - STOERSTE_HUL_MS;", "reg <= frist;");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
  });
  it("MUTATION (runde 2, fund 4): «samme_koersel» fjernet i det ene spejl", () => {
    const linje = "    if (kunMotor(sendinger[n].art) && fikAndenNu.has(sendinger[n].ewebinarId)) {";
    const s2 = spejl.split(linje).join("    if (false) {");
    expect(s2).not.toBe(spejl);
    expect(tiMinutterKunMotor(dom, s2, cron, motor)).toBe(false);
  });
  it("MUTATION: vinduet snævret tilbage til T−15 (fund 1) fanges", () => {
    const [d, s] = begge("tidligstFoerMs: 20 * 60_000,", "tidligstFoerMs: 5 * 60_000,");
    expect(tiMinutterKunMotor(d, s, cron, motor)).toBe(false);
  });
});


// ── 21 ─────────────────────────────────────────────────────────────────────
const MIG_TI = "supabase/migrations/20261003040000_webinar_mails_ti_minutter.sql";
const PORT_GATE = 'if (kunMotor(art) && i.tiMinutterPort !== "klar") continue;';
export const tiMinutterPorten = (dom: string, spejl: string, cron: string, mig: string): boolean => {
  for (const k of [dom, spejl]) {
    const u = udenKommentarer(k);
    const plan = u.slice(u.indexOf("export function planlaegKoersel("), u.indexOf("export function erTabtKortNaade("));
    if (!plan.includes("tiMinutterPort?: TiMinutterPort;")) return false;
    if (!plan.includes(PORT_GATE)) return false;
    // Porten står FØRST i art-løkken — før dommen.
    if (!foer(plan, "for (const art of AKTIVE_ARTER) {", PORT_GATE) || !foer(plan, PORT_GATE, "const dom = doemMail({")) return false;
    if (!u.includes('export type TiMinutterPort = "klar" | "migration_mangler" | "laesefejl";')) return false;
  }
  const c = udenKommentarer(cron);
  const laes = c.slice(c.indexOf("async function laesTiMinutterPort("), c.indexOf("async function laasErAktiv("));
  const koer = c.slice(c.indexOf("async function koer("), c.indexOf("async function skrivAlarm("));
  const noegle = c.match(/export const TI_MINUTTER_PORT_NOEGLE = "([a-z_]+)";/)?.[1] ?? null;
  const m = udenSql(mig);
  const iTrans = m.slice(m.indexOf("begin;"), m.indexOf("commit;"));
  return (
    noegle === "webinar_ti_minutter_klar" &&
    laes.includes('.eq("config_key", TI_MINUTTER_PORT_NOEGLE).maybeSingle();') &&
    laes.includes("if (error) throw new Error(error.message);") &&
    laes.includes('return v === true || v === "true" ? "klar" : "migration_mangler";') &&
    laes.includes('return "laesefejl";') &&
    (laes.match(/"klar"/g) ?? []).length === 1 &&
    // Læst FØR dommen, givet til den, og vist i svaret.
    foer(koer, "const tiMinutterPort = await laesTiMinutterPort(a.admin);", "const plan = planlaegKoersel(") &&
    koer.includes("planlaegKoersel({ raekker, afmeldte, sendte, fejlede, ukendte, nu: a.nu, tiMinutterPort })") &&
    koer.includes("r.ti_minutter.port = tiMinutterPort;") &&
    // Migrationen: porten i SAMME transaktion som CHECK'en, ét alter table, ON CONFLICT DO NOTHING.
    m.indexOf("begin;") !== -1 && m.indexOf("commit;") > m.indexOf("begin;") &&
    new RegExp(`insert into public\\.app_config \\(config_key, config_value, description\\)\\s+values \\('${noegle}', 'true'::jsonb, '[^']*'\\)\\s+on conflict \\(config_key\\) do nothing;`).test(iTrans) &&
    /alter table public\.webinar_mails\s+drop constraint if exists webinar_mails_art_check,\s+add constraint webinar_mails_art_check\s+check \(art in/.test(iTrans) &&
    (m.match(/alter table public\.webinar_mails/g) ?? []).length === 1 &&
    (m.match(/drop constraint/g) ?? []).length === 1
  );
};

const videoFiler = () => ({
  cron: laes(CRON), tekster: laes(TEKSTER), video: laes(VIDEO), klik: laes(KLIK), config: laes(CONFIG), ci: laes(CI), migVideo: laes(MIG_VIDEO), migKlik: laes(MIG_KLIK),
});

describe("webinarMail.guard dom 19 — fanger fejlen på en kopi", () => {
  const f = videoFiler();
  const med = (felt: keyof ReturnType<typeof videoFiler>, fra: string, til: string) => {
    expect(f[felt], `${felt}: «${fra}»`).toContain(fra);
    return videoKunEnDag({ ...f, [felt]: f[felt].split(fra).join(til) });
  };

  it("originalen holder", () => expect(videoKunEnDag(f)).toBe(true));

  it("video til alle arter i cronen eller byggeren fælder dom 19", () => {
    expect(med("cron", "const video = s.art === VIDEO_ART && videoKonfig !== null ?", "const video = videoKonfig !== null ?")).toBe(false);
    expect(med("tekster", "const video = a.art === VIDEO_ART ? a.video : null;", "const video = a.video;")).toBe(false);
  });

  it("et valgfrit felt, en afspiller i mailen, eller et flag der ikke når indholdet, fælder dom 19", () => {
    expect(med("tekster", "video: MailVideo | null;", "video?: MailVideo | null;")).toBe(false);
    expect(med("tekster", "const i = indhold(a.art, tid, a.invitationVedhaeftet, video, klokke);", "const i = indhold(a.art, tid, a.invitationVedhaeftet, a.video);")).toBe(false);
    expect(videoKunEnDag({ ...f, tekster: `${f.tekster}\nconst X = "<iframe src=x>";` })).toBe(false);
  });

  it("konfigurationen fail-open, læst EFTER tørkørslens return, eller prøven løsnet, fælder dom 19", () => {
    expect(med("cron", 'return "laesefejl";', "return laesVideoKonfig(null);")).toBe(false);
    const flyttet = f.cron.split("  const videoDom = await laesVideoRaekke(a.admin);\n").join("").replace("  if (!senderRigtigt) return r;\n", "  if (!senderRigtigt) return r;\n  const videoDom = await laesVideoRaekke(a.admin);\n");
    expect(flyttet).not.toBe(f.cron);
    expect(videoKunEnDag({ ...f, cron: flyttet })).toBe(false);
    expect(med("cron", "videoIKoerslen(videoDom, a.email !== null)", "videoIKoerslen(videoDom, true)")).toBe(false);
    expect(med("video", 'if (proeve) return { status: "proeve", konfig: dom.konfig, grund: null };', 'return { status: "proeve", konfig: dom.konfig, grund: null };')).toBe(false);
  });

  it("id'et trukket efter byggeren, ikke skrevet i sporet, eller en adresse i linket, fælder dom 19", () => {
    expect(med("cron", "      id: mailId,\n", "")).toBe(false);
    expect(med("cron", "mailVideo(videoKonfig, a.klikBasis, mailId)", "mailVideo(videoKonfig, a.klikBasis, s.email)")).toBe(false);
    const sent = f.cron.split("    const mailId = crypto.randomUUID();\n").join("").replace("    if (spor.udfald === \"ok\" && video !== null)", "    const mailId = crypto.randomUUID();\n    if (spor.udfald === \"ok\" && video !== null)");
    expect(sent).not.toBe(f.cron);
    expect(videoKunEnDag({ ...f, cron: sent })).toBe(false);
  });

  it("klik-functionen: service role før formen, klik før verifikationen, persondata i rækken, et mål fra URL'en, eller en anden vært, fælder dom 19", () => {
    const tidlig = f.klik.replace("  const raaId = new URL(req.url).searchParams.get(\"m\");\n  const formOk = laesKlikId(raaId) !== null;\n", "").replace("  if (req.method === \"GET\" && formOk) {", "  const raaId = new URL(req.url).searchParams.get(\"m\");\n  const formOk = laesKlikId(raaId) !== null;\n  if (req.method === \"GET\" && formOk) {");
    expect(tidlig).not.toBe(f.klik);
    expect(videoKunEnDag({ ...f, klik: tidlig })).toBe(false);
    expect(med("klik", "const dom = await verifyVideoKlik(admin, raaId);", "const dom = { kendt: true as const, mailId: String(raaId) };")).toBe(false);
    expect(med("klik", ".insert({ mail_id: dom.mailId });", ".insert({ mail_id: dom.mailId, ip: req.headers.get(\"x-forwarded-for\") });")).toBe(false);
    expect(med("klik", 'if (k.status === "gyldig") maal = bunnyAfspilUrl(k.konfig);', 'if (k.status === "gyldig") maal = new URL(req.url).searchParams.get("til");')).toBe(false);
    expect(med("video", 'export const BUNNY_AFSPIL_VAERT = "iframe.mediadelivery.net";', 'export const BUNNY_AFSPIL_VAERT = "evil.example.com";')).toBe(false);
    expect(med("video", "return u.host === BUNNY_AFSPIL_VAERT && u.protocol === \"https:\" ? u.toString() : null;", "return u.toString();")).toBe(false);
    expect(med("video", '.eq("id", id).eq("art", VIDEO_ART).eq("udfald", "ok").maybeSingle();', '.eq("id", id).maybeSingle();')).toBe(false);
  });

  it("verify_jwt, prædikatet i CI-værnet, eller migrationerne ude af form, fælder dom 19", () => {
    expect(videoKunEnDag({ ...f, config: f.config.replace("[functions.webinar-video]\n    verify_jwt = false", "[functions.webinar-video]\n    verify_jwt = true") })).toBe(false);
    expect(med("ci", '{ name: "verifyVideoKlik()",', '{ name: "andet()",')).toBe(false);
    expect(videoKunEnDag({ ...f, migVideo: f.migVideo.replace(/^-- (IKKE KØRT\. DEPLOY:|KØRT i prod)/, "-- DEPLOY:") })).toBe(false);
    expect(med("migVideo", "on conflict (config_key) do nothing;", "on conflict (config_key) do update set config_value = excluded.config_value;")).toBe(false);
    expect(videoKunEnDag({ ...f, migVideo: `${f.migVideo}\nupdate public.app_config set config_value = 'true'::jsonb where config_key = 'webinar_mail_aktiv';\n` })).toBe(false);
    expect(med("migKlik", "on delete cascade", "on delete set null")).toBe(false);
    expect(med("migKlik", "  klikket_at  timestamptz not null default now()\n", "  klikket_at  timestamptz not null default now(),\n  ip text\n")).toBe(false);
  });
});

describe("webinarMail.guard — dommene fanger fejlen på en kopi", () => {
  const cron = laes(CRON), afmeld = laes(AFMELD), send = laes(SEND), tekster = laes(TEKSTER), svar = laes(SVAR), mig = laes(MIG), config = laes(CONFIG);

  it("fejlede ikke givet ind, læst som ok, uden afgrænsning, ikke slået op i dommen, eller bekræftelser ikke først, fælder dom 13", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL);
    // Selve fejlen, opgaven nævner: fejlede læses, men gives IKKE til planlaegKoersel.
    expect(fejledeIndhentes(cron.split("planlaegKoersel({ raekker, afmeldte, sendte, fejlede, ukendte, nu: a.nu, tiMinutterPort })").join("planlaegKoersel({ raekker, afmeldte, sendte, ukendte, nu: a.nu, tiMinutterPort })"), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron.split('.neq("udfald", "ok")').join('.eq("udfald", "ok")'), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron.split('.neq("udfald", "ok")\n      .gte("session_tid", graense)').join('.neq("udfald", "ok")\n     '), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron.split("for_sent_efter_fejl: 0").join(""), dom, spejl)).toBe(false);
    expect(fejledeIndhentes(cron, dom.split("        fejlede: i.fejlede,\n").join(""), spejl)).toBe(false);
    expect(fejledeIndhentes(cron, dom, spejl.split("if (!(i.fejlede?.has(noegle(mail, i.sessionTid, art)) ?? false)) {").join("if (true) {"))).toBe(false);
    expect(fejledeIndhentes(cron, dom.split("    Number(erStraks(b.art)) - Number(erStraks(a.art)) ||\n").join(""), spejl)).toBe(false);
  });

  it("et loft flyttet, fjernet eller fail-open, min byttet til max, loftet ikke inklusivt, den gamle regel tilbage i dommen, eller alarmen på næste art alene, fælder dom 18", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL), alarm = laes(ALARM);
    expect(indhentningFoelgerTeksten(dom, spejl, alarm)).toBe(true);
    // Loftet for «om en uge» flyttet til 2 dage før — i kun det ene spejl.
    expect(indhentningFoelgerTeksten(dom, spejl.split("indhentesSenestDageFoer: 4,").join("indhentesSenestDageFoer: 2,"), alarm)).toBe(false);
    // Loftet fjernet fra syv_dage.
    expect(indhentningFoelgerTeksten(dom.split(" indhentesSenestDageFoer: 4,").join(""), spejl, alarm)).toBe(false);
    // Fail-open: et manglende loft giver ikke længere null.
    expect(indhentningFoelgerTeksten(dom.split(" || plan.indhentesSenestDageFoer === undefined) return null;").join(") return null;"), spejl, alarm)).toBe(false);
    // Den SENESTE af de to grænser i stedet for den tidligste.
    expect(indhentningFoelgerTeksten(dom, spejl.split("Math.min(a.getTime(), b.getTime())").join("Math.max(a.getTime(), b.getTime())"), alarm)).toBe(false);
    // Loftet ikke inklusivt (en dag for tidligt).
    expect(indhentningFoelgerTeksten(dom.split("plan.indhentesSenestDageFoer - 1)").join("plan.indhentesSenestDageFoer)"), spejl, alarm)).toBe(false);
    // Den gamle regel (næste arts dato alene) tilbage i dommen.
    expect(indhentningFoelgerTeksten(dom.split("const slut = indhentningSlut(i.sessionTid, art);").join("const naesteTid = planlagtTid(i.sessionTid, naeste); const slut = naesteTid;"), spejl, alarm)).toBe(false);
    // Alarmen regner fristen af næste art selv — og kan blive uenig med dommen.
    expect(indhentningFoelgerTeksten(dom, spejl, alarm.split("const slut = indhentningSlut(sessionTid, art);").join("const slut = planlagtTid(sessionTid, naesteTidssatteArt(art));"))).toBe(false);
    expect(indhentningFoelgerTeksten(dom, spejl, alarm.split("Math.max(efterNaade.getTime(), slut.getTime())").join("efterNaade.getTime()"))).toBe(false);
  });

  it("ukendte ikke givet ind, timeout som afvisning, 5xx som afvisning, opslaget fjernet eller efter nåden, eller delingen byttet om, fælder dom 15", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL);
    expect(ukendteGensendesIkke(cron, dom, spejl)).toBe(true);
    // Selve fejlen: ukendte læses, men gives IKKE til dommen — timeouten indhentes som før.
    expect(ukendteGensendesIkke(cron.split("fejlede, ukendte, nu: a.nu, tiMinutterPort })").join("fejlede, nu: a.nu, tiMinutterPort })"), dom, spejl)).toBe(false);
    expect(ukendteGensendesIkke(cron.split('select("email, session_tid, art, udfald, status")').join('select("email, session_tid, art")'), dom, spejl)).toBe(false);
    expect(ukendteGensendesIkke(cron.split("filter((x) => afsendelseUkendt(x))").join("filter((x) => !afsendelseUkendt(x))"), dom, spejl)).toBe(false);
    expect(ukendteGensendesIkke(cron, dom.split('if (forsoeg.udfald === "timeout") return true;').join('if (forsoeg.udfald === "timeout") return false;'), spejl)).toBe(false);
    expect(ukendteGensendesIkke(cron, dom, spejl.split("forsoeg.status >= 500").join("forsoeg.status >= 600"))).toBe(false);
    expect(ukendteGensendesIkke(cron, dom, spejl.split("if (i.ukendte?.has(noegle(mail, i.sessionTid, art)) ?? false) {").join("if (false) {"))).toBe(false);
    expect(ukendteGensendesIkke(cron, dom.split("        ukendte: i.ukendte,\n").join(""), spejl)).toBe(false);
    // Opslaget flyttet ned efter nåden: et ukendt inden for to timer ville gå igen.
    const blok = dom.slice(dom.indexOf("  if (i.ukendte?.has("), dom.indexOf("  // BEKRÆFTELSEN KUN FREMAD."));
    const flyttet = dom.split(blok).join("").split("  return { send: true, art, planlagt: tid };\n}").join(blok + "  return { send: true, art, planlagt: tid };\n}");
    expect(flyttet).not.toBe(dom);
    expect(ukendteGensendesIkke(cron, flyttet, spejl)).toBe(false);
  });

  it("senereSession ikke givet ind, en begyndt session som nærmeste, den fjerneste som nærmeste, bekræftelsen holdt tilbage, eller tjekket efter nåden, fælder dom 16", () => {
    const dom = laes(DOM), spejl = laes(DOM_SPEJL);
    expect(kunNaermesteSession(cron, dom, spejl)).toBe(true);
    // Selve fejlen: planlaegKoersel regner den nærmeste, men giver den IKKE til doemMail.
    expect(kunNaermesteSession(cron, dom.split("        senereSession,\n").join(""), spejl)).toBe(false);
    expect(kunNaermesteSession(cron, dom, spejl.split("if (!Number.isFinite(ms) || ms <= i.nu.getTime()) continue;").join(""))).toBe(false);
    expect(kunNaermesteSession(cron, dom.split("ms < har) naermeste").join("ms > har) naermeste"), spejl)).toBe(false);
    expect(kunNaermesteSession(cron, dom, spejl.split("if (i.senereSession === true && erPaamindelse(art)) {").join("if (i.senereSession === true) {"))).toBe(false);
    expect(kunNaermesteSession(cron, dom.split("return plan !== undefined && plan.straks !== true;").join("return true;"), spejl)).toBe(false);
    expect(kunNaermesteSession(cron.split("r.sprunget_senere_session = plan.sprunget.senere_session;").join(""), dom, spejl)).toBe(false);
    const start = dom.indexOf("  // KUN NÆRMESTE SESSION FÅR PÅMINDELSER (29/9).");
    const blok = dom.slice(start, dom.indexOf("  const plan = PLANEN.find(", start));
    const flyttet = dom.split(blok).join("").split("  return { send: true, art, planlagt: tid };\n}").join(blok + "  return { send: true, art, planlagt: tid };\n}");
    expect(flyttet).not.toBe(dom);
    expect(kunNaermesteSession(cron, flyttet, spejl)).toBe(false);
  });

  it("alarm i tørkørsel, kald uden dommen, opslag efter mailen, Mailgun eller rådgiveradressen, en loft-nøgle pr. time, eller loft-grenen foran de rigtige, fælder dom 14", () => {
    const alarm = laes(ALARM);
    expect(alarmenKunIRigtigKoersel(cron, alarm)).toBe(true);
    // Kaldet uden sender_rigtigt-porten: en tørkørsel ville alarmere.
    expect(alarmenKunIRigtigKoersel(cron.split("if (r.sender_rigtigt && alarm !== null) await skrivAlarm(admin, r, alarm, alarmNu);").join("if (alarm !== null) await skrivAlarm(admin, r, alarm, alarmNu);"), alarm)).toBe(false);
    // Dommen sprunget over: alarm hver gang.
    expect(alarmenKunIRigtigKoersel(cron.split("const alarm = r.sender_rigtigt ? doemAlarm(r, alarmNu) : null;").join("const alarm = { art: \"loft\", noegle: \"x\" } as never;"), alarm)).toBe(false);
    // Kaldet helt væk.
    expect(alarmenKunIRigtigKoersel(cron.split("    if (r.sender_rigtigt && alarm !== null) await skrivAlarm(admin, r, alarm, alarmNu);\n").join(""), alarm)).toBe(false);
    // Opslaget flyttet EFTER afsendelsen: to mails på samme nøgle.
    const OPSLAG = '.select("message_id").eq("message_id", noegle).limit(1);';
    const efter = cron.replace(OPSLAG, ".select(\"x\");").replace("      r.alarm_mail = res.sent ? \"sendt\" : `fejlet: ${res.reason}`;", `      await admin.from("email_send_log")${OPSLAG}\n      r.alarm_mail = res.sent ? "sendt" : \`fejlet: \${res.reason}\`;`);
    expect(efter).not.toBe(cron);
    expect(alarmenKunIRigtigKoersel(efter, alarm)).toBe(false);
    // Nøglen regnet i cronen i stedet for dommens.
    expect(alarmenKunIRigtigKoersel(cron.split("  const noegle = alarm.noegle;").join("  const noegle = `webinar-mail-alarm:${nu.toISOString()}`;"), alarm)).toBe(false);
    // Mailen til rådgiveradressen, eller gennem Mailgun.
    expect(alarmenKunIRigtigKoersel(cron.split("        to: driftModtager(),").join("        to: raadgiverModtager(nu),"), alarm)).toBe(false);
    expect(alarmenKunIRigtigKoersel(cron.replace("      const res = await sendManagedEmail({", "      const res = await sendMailgun(mailgunNoegle, {} as never);\n      const res2 = await sendManagedEmail({"), alarm)).toBe(false);
    // Klokken med en anden reference, eller en anden type.
    expect(alarmenKunIRigtigKoersel(cron.split('      reference_type: "webinar_mails" satisfies typeof WEBINAR_ALARM_REFERENCE,').join('      reference_type: "klaviyo_haendelser",'), alarm)).toBe(false);
    expect(alarmenKunIRigtigKoersel(cron.split("      type: WEBINAR_ALARM_KLOKKE_TYPE,").join('      type: "traek_fejlet",'), alarm)).toBe(false);
    // De ventende ikke givet videre (frist-alarmen ville være blind).
    expect(alarmenKunIRigtigKoersel(cron.split("      for (const v of sendinger.slice(i + 1)) r.ventende.push({ art: v.art, session_tid: v.sessionTid });\n").join(""), alarm)).toBe(false);
    // Fejlen ikke skubbet til r.fejl.
    expect(alarmenKunIRigtigKoersel(cron.split("    r.fejl.push(`alarm_mail: ${grund}`);\n").join(""), alarm)).toBe(false);
    // MOTOREN: loft-, tabt- eller frist-nøglen pr. time (Jonas' «hele tiden»), eller loft-grenen foran de rigtige alarmer.
    expect(alarmenKunIRigtigKoersel(cron, alarm.split("const hale = ARTER_PR_DAG.includes(art) ? webinarAlarmDato(nu) : webinarAlarmDatoOgTime(nu);").join("const hale = webinarAlarmDatoOgTime(nu);"))).toBe(false);
    expect(alarmenKunIRigtigKoersel(cron, alarm.split('export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "tabt", "frist"];').join('export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "frist"];'))).toBe(false);
    expect(alarmenKunIRigtigKoersel(cron, alarm.split('export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "tabt", "frist"];').join('export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "tabt"];'))).toBe(false);
    expect(alarmenKunIRigtigKoersel(cron, alarm.replace(/fejl\.length > 0 \? "fejl"\s*: tiMinutter\.iFare\.length > 0 \|\| tiMinutter\.tabt > 0 \? "ti_minutter"\s*: tabt > 0 \? "tabt"\s*: iFare\.length > 0 \? "frist"\s*: loftStop \? "loft"\s*: null;/, 'loftStop ? "loft" : fejl.length > 0 ? "fejl" : tiMinutter.tabt > 0 ? "ti_minutter" : tabt > 0 ? "tabt" : iFare.length > 0 ? "frist" : null;'))).toBe(false);
    expect(alarmenKunIRigtigKoersel(cron, alarm.split("if (!r.sender_rigtigt) return null;").join(""))).toBe(false);
  });

  it("det gamle budget, et tjek efter hentningen, et stop der ikke holder, en anden timeout, en resttid uden ics, eller et await før sporet, fælder dom 17", () => {
    const budget = laes(BUDGET), migJob = laes(MIG_JOB);
    expect(budgetDaekkerVaersteForloeb(cron, budget, migJob)).toBe(true);
    const SLUT = "    if (r.budget.stoppet_af_budget) { r.udsat++; r.udsatte.push({ art: s.art, session_tid: s.sessionTid }); continue; }\n";
    const TJEK_BLOK = cron.slice(cron.indexOf("    if (!r.budget.stoppet_af_budget) {"), cron.indexOf(SLUT) + SLUT.length);
    expect(TJEK_BLOK.length).toBeGreaterThan(100);
    // Det gamle, halve budget tilbage: tjekket kun FØR forsøget, uden dets varighed.
    const gammelt = cron.split(TJEK_BLOK).join("    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }\n");
    expect(gammelt).not.toBe(cron);
    expect(budgetDaekkerVaersteForloeb(gammelt, budget, migJob)).toBe(false);
    // Tjekket flyttet EFTER ics-hentningen: hentningens 8 s ligger så uden for budgettet.
    const HENT = "      const inv = await hentInvitation(s.kalenderLink);\n";
    const efterHent = cron.split(TJEK_BLOK).join("").replace(HENT, HENT + TJEK_BLOK);
    expect(efterHent).not.toBe(cron);
    expect(budgetDaekkerVaersteForloeb(efterHent, budget, migJob)).toBe(false);
    // Stoppet ikke endeligt: dommen spørges igen ved hver mail, og rækkefølgen brydes.
    const ikkeEndeligt = cron.split("        r.budget.stoppet_af_budget = true;\n").join("");
    expect(ikkeEndeligt).not.toBe(cron);
    expect(budgetDaekkerVaersteForloeb(ikkeEndeligt, budget, migJob)).toBe(false);
    // Dommen spurgt uden art: ics-tiden ville aldrig tælle med.
    expect(budgetDaekkerVaersteForloeb(cron.split("medInvitation: baererInvitation(s.art) })").join("medInvitation: false })"), budget, migJob)).toBe(false);
    // Beviset væk fra svaret.
    expect(budgetDaekkerVaersteForloeb(cron.split("budget: tomtBudgetBevis(),").join(""), budget, migJob)).toBe(false);
    // Et await mellem Mailguns svar og sporet (fx en log-skrivning): mere tid, hvor en afbrydelse efterlader en mail uden spor.
    const ekstraAwait = cron.replace('    if (spor.udfald === "ok") r.sendt++;', '    await new Promise((klar) => setTimeout(klar, 1));\n    if (spor.udfald === "ok") r.sendt++;');
    expect(ekstraAwait).not.toBe(cron);
    expect(budgetDaekkerVaersteForloeb(ekstraAwait, budget, migJob)).toBe(false);
    // Motoren: en anden jobtimeout end migrationens, eller en migration med en kortere timeout.
    for (const andet of ["30_000", "90_000", "150_000"]) {
      expect(budgetDaekkerVaersteForloeb(cron, budget.split("export const JOB_TIMEOUT_MS = 60_000;").join(`export const JOB_TIMEOUT_MS = ${andet};`), migJob), andet).toBe(false);
    }
    const kortereJob = migJob.replace(/(kald_edge\(\s*'webinar-mail-cron',\s*'[^']*'::jsonb,\s*)60000/, "$130000");
    expect(kortereJob).not.toBe(migJob);
    expect(budgetDaekkerVaersteForloeb(cron, budget, kortereJob)).toBe(false);
    // Resttiden uden ics-hentningen, dommen uden margin, marginerne nul, eller fail-open.
    expect(budgetDaekkerVaersteForloeb(cron, budget.split("return (medInvitation ? INVITATION_TIMEOUT_MS : 0) + TIMEOUT_MS + SPOR_RESERVE_MS;").join("return TIMEOUT_MS + SPOR_RESERVE_MS;"), migJob)).toBe(false);
    expect(budgetDaekkerVaersteForloeb(cron, budget.split("<= JOB_TIMEOUT_MS - OPSTART_MARGIN_MS;").join("<= JOB_TIMEOUT_MS;"), migJob)).toBe(false);
    expect(budgetDaekkerVaersteForloeb(cron, budget.split("export const OPSTART_MARGIN_MS = 5_000;").join("export const OPSTART_MARGIN_MS = 0;"), migJob)).toBe(false);
    expect(budgetDaekkerVaersteForloeb(cron, budget.split("export const SPOR_RESERVE_MS = 5_000;").join("export const SPOR_RESERVE_MS = 0;"), migJob)).toBe(false);
    expect(budgetDaekkerVaersteForloeb(cron, budget.split("if (!Number.isFinite(a.forloebetMs) || a.forloebetMs < 0) return false;").join(""), migJob)).toBe(false);
  });

  it("loftet fjernet, break fjernet, stop før sporet, eller et andet loft i motoren, fælder dom 12", () => {
    const loft = laes(LOFT);
    expect(loftetFoerLoekken(cron, loft)).toBe(true);
    // Løkken uden loft: kaldet væk.
    expect(loftetFoerLoekken(cron.split("const loft = beregnKoerselsLoft({ seneste: loftRaekker, loft: MAILGUN_LOFT_PR_TIME, nu: loftNu });").join("const loft = { maks: 999, pause: null };"), loft)).toBe(false);
    // Pausen ignoreret.
    expect(loftetFoerLoekken(cron.split("  if (loft.pause) return r;\n").join(""), loft)).toBe(false);
    // Maks ignoreret.
    expect(loftetFoerLoekken(cron.split("    if (forsoegt >= loft.maks) { r.over_loft++; r.ventende.push({ art: s.art, session_tid: s.sessionTid }); continue; }\n").join(""), loft)).toBe(false);
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
    for (const andet of [90, 100, 999, 1001, 10000]) {
      expect(loftetFoerLoekken(cron, loft.split("export const MAILGUN_LOFT_PR_TIME = 1000;").join(`export const MAILGUN_LOFT_PR_TIME = ${andet};`)), String(andet)).toBe(false);
    }
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
    const dom = laes(DOM), spejl = laes(DOM_SPEJL), migArter = laes(MIG_ARTER), migInv = laes(MIG_INV);
    // 3/10: art-CHECK'en og invitations-CHECK'en bor i hver sin migration (den nyeste af hver).
    const takt = (d: string, s: string, m: string, c: string, i: string = migInv) => arterITakt(d, s, m, c, i);
    expect(MIG_ARTER).toBe("supabase/migrations/20261003040000_webinar_mails_ti_minutter.sql");
    expect(MIG_INV).toBe("supabase/migrations/20260928120000_webinar_mails_fjorten_dage.sql");
    expect(takt(dom, spejl, migArter, cron)).toBe(true);
    // CHECK'en kender ikke fjorten_dage — mailen ville sendes og sporet afvises.
    const udenArt = migArter.split("check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage'").join("check (art in ('bekraeftelse', 'syv_dage'");
    expect(udenArt).not.toBe(migArter);
    expect(takt(dom, spejl, udenArt, cron)).toBe(false);
    // 3/10: CHECK'en kender ikke ti_minutter — 23514, og næste kørsel sender IGEN.
    const udenTi = migArter.split("'en_time', 'ti_minutter'));").join("'en_time'));");
    expect(udenTi).not.toBe(migArter);
    expect(takt(dom, spejl, udenTi, cron)).toBe(false);
    // Invitations-CHECK'en kender kun bekræftelsen.
    const udenInv = migInv.split("check (invitation is null or art in ('bekraeftelse', 'fjorten_dage'))").join("check (invitation is null or art in ('bekraeftelse'))");
    expect(udenInv).not.toBe(migInv);
    expect(takt(dom, spejl, migArter, cron, udenInv)).toBe(false);
    // 3/10: ti_minutter i MED_INVITATION (en kalenderfil) — den må den aldrig bære.
    const tiMedInv = (k: string) => k.split('MED_INVITATION: readonly MailArt[] = ["bekraeftelse", "fjorten_dage"]').join('MED_INVITATION: readonly MailArt[] = ["bekraeftelse", "fjorten_dage", "ti_minutter"]');
    expect(tiMedInv(dom)).not.toBe(dom);
    expect(takt(tiMedInv(dom), tiMedInv(spejl), migArter, cron, migInv.split("art in ('bekraeftelse', 'fjorten_dage'))").join("art in ('bekraeftelse', 'fjorten_dage', 'ti_minutter'))"))).toBe(false);
    // En niende art i koden uden migration.
    const enTil = dom.split('"en_time", "ti_minutter"];').join('"en_time", "ti_minutter", "spoegelse"];');
    expect(enTil).not.toBe(dom);
    expect(takt(enTil, spejl, migArter, cron)).toBe(false);
    // Planen flyttet (13 dage) — i det ene spejl, eller i begge.
    const PLAN = '{ art: "fjorten_dage", dageFoer: 14, time: 8, minut: 0, indhentesSenestDageFoer: 8, kraeverIkkeBegyndt: false },';
    const flyttet = PLAN.replace("dageFoer: 14", "dageFoer: 13");
    expect(takt(dom.split(PLAN).join(flyttet), spejl, migArter, cron)).toBe(false);
    expect(takt(dom.split(PLAN).join(flyttet), spejl.split(PLAN).join(flyttet), migArter, cron)).toBe(false);
    // Spejlet ude af takt på MED_INVITATION.
    expect(takt(dom, spejl.split('MED_INVITATION: readonly MailArt[] = ["bekraeftelse", "fjorten_dage"]').join('MED_INVITATION: readonly MailArt[] = ["bekraeftelse"]'), migArter, cron)).toBe(false);
    // Migrationens første linje forkert, eller uden ordren «FØR … UDRULLES».
    // Første linje uden husets markør — uanset om den står som «IKKE KØRT» eller (efter kørslen) «KØRT i prod».
    const udenMarkoer = migArter.replace(/^-- (IKKE KØRT\. DEPLOY:|KØRT i prod)/, "-- DEPLOY:");
    expect(udenMarkoer).not.toBe(migArter);
    expect(takt(dom, spejl, udenMarkoer, cron)).toBe(false);
    expect(takt(dom, spejl, migArter.split("FØR webinar-mail-cron UDRULLES").join("efter udrulningen"), cron)).toBe(false);
    // Og den gamle CHECK i ROLLBACK-kommentaren dømmes IKKE på: den er i filen.
    expect(migArter).toContain("check (art in ('bekraeftelse', 'fjorten_dage', 'syv_dage', 'tre_dage', 'en_dag', 'dagen', 'en_time'));");
    // 30/9: en udgået art lagt tilbage i PLANEN uden at blive fjernet fra UDGAAEDE_ARTER.
    const EN_DAG = '  { art: "en_dag", dageFoer: 1, time: 8, minut: 0, indhentesSenestDageFoer: 1, kraeverIkkeBegyndt: false },\n';
    const TRE = '  { art: "tre_dage", dageFoer: 3, time: 8, minut: 0, kraeverIkkeBegyndt: false },\n';
    expect(dom).toContain(EN_DAG);
    expect(takt(dom.split(EN_DAG).join(TRE + EN_DAG), spejl.split(EN_DAG).join(TRE + EN_DAG), migArter, cron)).toBe(false);
    // En aktiv art fjernet fra PLANEN uden at stå i UDGAAEDE_ARTER — eller i kun det ene spejl.
    expect(takt(dom.split(EN_DAG).join(""), spejl.split(EN_DAG).join(""), migArter, cron)).toBe(false);
    expect(takt(dom, spejl.split(EN_DAG).join(""), migArter, cron)).toBe(false);
    // UDGAAEDE_ARTER ude af takt i spejlet.
    expect(takt(dom, spejl.split('UDGAAEDE_ARTER: readonly MailArt[] = ["tre_dage", "dagen"]').join('UDGAAEDE_ARTER: readonly MailArt[] = ["tre_dage"]'), migArter, cron)).toBe(false);
    // Løkken tilbage over ARTER (ordforrådet) — de udgåede ville blive dømt igen.
    const loekke = dom.split("for (const art of AKTIVE_ARTER) {").join("for (const art of ARTER) {");
    expect(loekke).not.toBe(dom);
    expect(takt(loekke, spejl, migArter, cron)).toBe(false);
    // AKTIVE_ARTER som håndskrevet liste i stedet for PLANEN.
    expect(takt(dom.split("PLANEN.map((p) => p.art);").join('["bekraeftelse", "fjorten_dage", "syv_dage", "en_dag", "en_time"];'), spejl, migArter, cron)).toBe(false);
    // Cronens prøve validerer mod ordforrådet — en udgået art kunne «prøves».
    expect(takt(dom, spejl, migArter, cron.split("!(AKTIVE_ARTER as readonly string[]).includes(artRaa)").join("!(ARTER as readonly string[]).includes(artRaa)"))).toBe(false);
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
    expect(tekstenFoelgerInvitationen(cron, tekster.split("const i = indhold(a.art, tid, a.invitationVedhaeftet, video, klokke);").join("const i = indhold(a.art, tid, true, video);"))).toBe(false);
    expect(tekstenFoelgerInvitationen(cron, tekster.split("const inv = invitationsTekst(medInvitation);").join("const inv = invitationsTekst(true);"))).toBe(false);
  });
});
