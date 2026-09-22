import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for platformens før-webinar-mails (22/9-2026). Seks domme, hver
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
 *   8. BEKRÆFTELSEN GÅR GENNEM MIME'EN: kun `bekraeftelse` bruger
 *      sendMailgunMime, invitationen hentes fail-soft, og Content-Type'en er
 *      ORDRET den, Outlook kræver for at vise Ja/Nej.
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
const CONFIG = "supabase/config.toml";

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
    // Alle fem arter har en emnelinje.
    /syv_dage:[\s\S]{0,80}tre_dage:[\s\S]{0,80}en_dag:[\s\S]{0,60}dagen:[\s\S]{0,40}en_time:/.test(t)
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
    c.includes('if (s.art === "bekraeftelse") {') &&
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

describe("webinarMail.guard — platformens før-webinar-mails", () => {
  it("1. Bucket B, tørkørsel som standard, og låsen fail-closed", () => expect(bucketBOgLaas(laes(CRON), laes(CONFIG))).toBe(true));
  it("2. Mailgun EU, ingen sporing, nøglen ét sted", () => expect(euOgIngenSporing(laes(SEND), laes(CRON))).toBe(true));
  it("3. sporet skrives efter afsendelsen, og indekset er dommeren", () => expect(sporetEfterAfsendelsen(laes(CRON), laes(MIG))).toBe(true));
  it("4. tokenet verificeres før service role, og svaret røber intet", () => expect(tokenetFoerst(laes(AFMELD), laes(CONFIG))).toBe(true));
  it("5. ingen Klaviyo-tags, og afmeldingslinket er vores eget", () => expect(ingenKlaviyoTags(laes(TEKSTER))).toBe(true));
  it("6. de tre personlige links kan aldrig gå ud til en ekstern", () => expect(linkeneErPersonlige(laes(SVAR))).toBe(true));
  it("7. afmeldingen rammer også Klaviyo, og kilde-listen er i takt med CHECK'en", () => expect(etKlikEnBetydning(laes(AFMELD), laes(AFMELDING), laes(MIG_KILDE))).toBe(true));
  it("8. bekræftelsen går gennem MIME'en med den rigtige Content-Type", () => expect(bekraeftelsenGaarGennemMime(laes(CRON), laes(MIME))).toBe(true));
});

describe("webinarMail.guard — dommene fanger fejlen på en kopi", () => {
  const cron = laes(CRON), afmeld = laes(AFMELD), send = laes(SEND), tekster = laes(TEKSTER), svar = laes(SVAR), mig = laes(MIG), config = laes(CONFIG);

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

  it("bekræftelsen sendt ad den almindelige vej, en tom Content-Type, eller en hentning der stopper mailen, fælder dom 8", () => {
    const mime = laes(MIME);
    expect(bekraeftelsenGaarGennemMime(cron.split("spor = await sendMailgunMime(mailgunNoegle, s.email, mime);").join("spor = await sendMailgun(mailgunNoegle, {} as never);"), mime)).toBe(false);
    expect(bekraeftelsenGaarGennemMime(cron, mime.split("text/calendar; charset=utf-8; method=REQUEST").join("text/calendar"))).toBe(false);
    // Fail-soft brudt: hentningen springer mailen over i stedet for at sende uden.
    const haard = cron.replace("      invitation = inv.udfald;", "      invitation = inv.udfald;\n      if (inv.udfald !== \"hentet\") continue;");
    expect(haard).not.toBe(cron);
    expect(bekraeftelsenGaarGennemMime(haard, mime)).toBe(false);
    // Indholdsdommen fjernet: en HTML-fejlside kunne vedhæftes.
    expect(bekraeftelsenGaarGennemMime(cron, mime.split("if (!/BEGIN:VCALENDAR/i.test(tekst) || !/BEGIN:VEVENT/i.test(tekst)) {").join("if (false) {"))).toBe(false);
  });
});
