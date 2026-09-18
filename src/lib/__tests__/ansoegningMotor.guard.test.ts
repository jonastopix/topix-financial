import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KOE_SKABELONER } from "@/lib/rykkerkoe";
import { TRIN, LUKKEAARSAGER, KILDER } from "@/lib/ansoegningTrin";
import { KILDER as SKEMA_KILDER } from "@/lib/ansoegning/skema";
import { PAUSE, PROCESTEKST, RYKKER_SKABELONER, bygRykkerMail } from "../../../supabase/functions/_shared/ansoegningRykkerMails.ts";
import { KONTAKT_ADRESSE } from "../../../supabase/functions/_shared/indgangsMail.ts";

// Kildeværn for ansøgningsmotoren (18/9-2026). Otte domme låser det der ikke
// kan testes som en ren funktion — rækkefølger, SQL og filhoveder — og hver
// dom beviser sig selv på en kopi med fejlen indsat (betalEfterFristen.guard-
// mønstret):
//   1. Reglerne står ordret i rykkerkoe.ts' filhoved (Jonas 18/9).
//   2. Cronen: authenticateServiceRole FØR createClient; idempotencyKey er
//      rækkens idempotensnoegle; tørkørsel er standard.
//   3. Migrationen: IKKE KØRT; UNIQUE (idempotensnoegle); ingen SECURITY
//      DEFINER; trin-CHECK'en er de syv fra ansoegningTrin; kilderne er B's;
//      ingen politik for anon; protect-triggeren er på ansoegninger, ikke
//      auth.users.
//   4. Motoren: underskrevet konverterer FØR trinnet skrives; virksomheden
//      får ansøgningens id; opdateringen låser på .eq("trin", a.trin).
//   5. Calendly-webhooken: ansøgningsgrenen kommer EFTER session_bookings i
//      begge grene (book og aflys) — en session_bookings-række vinder altid.
//   6. Handling (Bucket A): authenticateUser FØR createClient; kun
//      MENNESKE_HANDLINGER kan kaldes. Link: verifyAnsoegningslink FØR
//      udfoerOvergang; svaret bærer aldrig anbefalingen.
//   7. Mailbyggerne dækker præcis køens skabeloner — hverken flere eller
//      færre; hver rykker bærer «ikke nu»-linket (ikke samtale-/kladde-
//      påmindelserne); Jonas inviterer (D4), procesteksten står ordret.
//   8. config.toml: handling og cron bag verify_jwt = true, link bag false.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const RYKKERKOE = "supabase/functions/_shared/rykkerkoe.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const MIGRATION = "supabase/migrations/20260918200000_ansoegninger.sql";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const CALENDLY = "supabase/functions/calendly-webhook/index.ts";
const HANDLING = "supabase/functions/ansoegning-handling/index.ts";
const LINK = "supabase/functions/ansoegning-link/index.ts";
const CONFIG = "supabase/config.toml";

const REGLER = [
  "Enhver reaktion fra ansøgeren annullerer resten af trappen.",
  "Hverdage, aldrig efter 16 eller i weekenden.",
  "Højst én mail pr. person pr. dag på tværs af trapper.",
  "«Ikke nu»-linket sætter på pause i tre måneder.",
];

// ── Dommene ──
export const foer = (kilde: string, a: string, b: string): boolean => {
  const ia = kilde.indexOf(a);
  const ib = kilde.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
};
export const reglerneStaarIHovedet = (hoved: string): boolean => REGLER.every((r) => hoved.includes(r));
/** 2: cronen (k) — service-role først, tørkørsel som standard; idempotensnøglen er message_id i motorens sendKoeMail (m), som cronen sender igennem (19/9). */
export const cronErRigtig = (k: string, m: string = k): boolean =>
  foer(k, "authenticateServiceRole(req)", "createClient(") &&
  m.includes("idempotencyKey: raekke.idempotensnoegle") &&
  k.includes("await sendKoeMail(admin, raekke, a, nu,") &&
  k.includes("let toer = true;") &&
  k.includes('if (body?.dry_run === false) toer = false;');
export const sqlCheckListe = (sql: string, kolonne: string): string[] | null => {
  const m = sql.match(new RegExp(`${kolonne} in \\(([^)]*)\\)`));
  return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")) : null;
};
export const migrationenErRigtig = (sql: string): boolean =>
  sql.includes("constraint planlagte_haendelser_idempotens_unik unique (idempotensnoegle)") &&
  !/security definer/i.test(sql) &&
  !/\bto anon\b/.test(sql) &&
  !/auth\.users\s+for each row/.test(sql) &&
  sql.includes("before update on public.ansoegninger\n  for each row execute function public.protect_ansoegning_motor_fields()") &&
  JSON.stringify(sqlCheckListe(sql, "trin")) === JSON.stringify([...TRIN]) &&
  JSON.stringify(sqlCheckListe(sql, "lukkeaarsag is null or lukkeaarsag")) === JSON.stringify([...LUKKEAARSAGER]) &&
  JSON.stringify(sqlCheckListe(sql, "kilde")) === JSON.stringify([...SKEMA_KILDER]);
export const motorenErRigtig = (k: string): boolean =>
  foer(k, 'if (h.art === "underskrevet") {\n    konvertering = await konverterTilVirksomhed(admin, a, nu);', '.from("ansoegninger")\n    .update(opd)') &&
  k.includes(".eq(\"id\", a.id)\n    .eq(\"trin\", a.trin)") &&
  k.includes("{ id: a.id },") &&
  k.includes("opretEllerGenbrugVirksomhed(");
export const calendlyErRigtig = (k: string): boolean => {
  const book = k.indexOf('dom.handling === "book"');
  const aflys = k.indexOf("const cancelerType = event?.payload?.cancellation?.canceler_type;");
  const bookGren = k.slice(book, aflys);
  const aflysGren = k.slice(aflys);
  return (
    foer(bookGren, '.from("session_bookings")', "hentAnsoegning(admin, bookingId)") &&
    foer(aflysGren, '.from("session_bookings")', "hentAnsoegning(admin, bookingId)") &&
    aflysGren.includes('handling: { art: "aflys_booking" }') &&
    bookGren.includes('handling: { art: "book" }')
  );
};
export const handlingErRigtig = (k: string): boolean =>
  foer(k, "authenticateUser(req)", "createClient(") &&
  foer(k, 'rpc("has_role"', "createClient(") &&
  k.includes("MENNESKE_HANDLINGER.includes(") &&
  k.includes('via: "raadgiver", truffetAf: userId');
export const linkErRigtig = (k: string): boolean =>
  foer(k, "verifyAnsoegningslink(token, admin)", "udfoerOvergang(") &&
  !/anbefaling/.test(udenKommentarer(k)) &&
  k.includes('via: "ansoeger_link", truffetAf: null');
export const configErRigtig = (t: string): boolean =>
  /\[functions\.ansoegning-handling\]\n\s*verify_jwt = true/.test(t) &&
  /\[functions\.ansoegning-rykker-cron\]\n\s*verify_jwt = true/.test(t) &&
  /\[functions\.ansoegning-link\]\n\s*verify_jwt = false/.test(t);

const KONTEKST = {
  fornavn: "Lisbeth",
  virksomhedsnavn: "Nordic Byg ApS",
  bookingUrl: "https://calendly.com/x/y?salesforce_uuid=1",
  statusUrl: "https://app.theboardroom.dk/ansoeg/status?t=abc",
  ikkeNuUrl: "https://app.theboardroom.dk/ansoeg/status?t=abc&handling=ikke_nu",
  samtaleStart: new Date("2026-09-21T07:00:00Z"),
  aftaleUrl: "https://app.theboardroom.dk/aftale?token=def",
  token: "abc",
  manglerSvar: 3,
  afslag: null,
  svar: { udfordring: "Vi har travlt, men ingen penge tilbage.", proevet: "Sat priserne op.", omTolvMaaneder: "Overskud hver måned." },
};

describe("ansoegningMotor.guard — de otte domme på repoets filer", () => {
  it("1. reglerne står ordret i rykkerkoe.ts' filhoved", () => {
    const hoved = laes(RYKKERKOE).split("*/")[0];
    expect(reglerneStaarIHovedet(hoved)).toBe(true);
  });
  it("2. cronen: service-role FØRST, idempotensnøglen er message_id, tørkørsel er standard", () => {
    expect(cronErRigtig(udenKommentarer(laes(CRON)), udenKommentarer(laes(MOTOR)))).toBe(true);
  });
  it("3. migrationen: IKKE KØRT, UNIQUE, ingen SECURITY DEFINER, trin/årsager/kilder = koden, ingen anon, triggeren på egen tabel", () => {
    const raa = laes(MIGRATION);
    expect(raa.startsWith("-- IKKE KØRT.")).toBe(true);
    expect(migrationenErRigtig(udenSqlKommentarer(raa))).toBe(true);
    expect([...KILDER]).toEqual([...SKEMA_KILDER]);
  });
  it("4. motoren: konvertering før trin, samme id, optimistisk lås", () => {
    expect(motorenErRigtig(udenKommentarer(laes(MOTOR)))).toBe(true);
  });
  it("5. calendly-webhook: session_bookings først, så ansøgningen — i begge grene", () => {
    expect(calendlyErRigtig(udenKommentarer(laes(CALENDLY)))).toBe(true);
  });
  it("6. handling (Bucket A) og link (token) har prædikatet først; linket røber aldrig anbefalingen", () => {
    expect(handlingErRigtig(udenKommentarer(laes(HANDLING)))).toBe(true);
    expect(linkErRigtig(laes(LINK))).toBe(true);
  });
  it("7. mailbyggerne dækker præcis køens skabeloner; pause-knappen sidder på rykkerne — aldrig på den sidste i trappen, kvitteringen, samtale-påmindelserne, ventelisten og afslaget", () => {
    expect([...RYKKER_SKABELONER].sort()).toEqual([...KOE_SKABELONER].sort());
    for (const s of KOE_SKABELONER) {
      const m = bygRykkerMail(s, KONTEKST);
      expect(m, s).not.toBeNull();
      // Uden pause (Jonas 18/9): kvitteringen, samtale-påmindelserne, kladden, ventepladsen
      // (svaret er ja/nej til pladsen), afslaget (et nej har ingen pause at sætte) — og den
      // SIDSTE mail i indkaldt- og aftalegrundlags-trappen (Jonas 6: «der skal de vælge»).
      const udenPause = s === "ansoegning-kvittering" || s.startsWith("ansoegning-samtale-") || s === "ansoegning-kladde-paamindelse" || s.startsWith("ansoegning-venteplads-") || s === "ansoegning-afslag" ||
        s === "ansoegning-indkaldt-rykker-3" || s === "ansoegning-aftalegrundlag-rykker-4";
      // Pausen er en KNAP (Jonas 1): linket står i en href (bulletproofButton escaper « " », ikke «&»), og teksten bærer knapteksten.
      expect(m!.html.includes(`href="${KONTEKST.ikkeNuUrl}"`), s).toBe(!udenPause);
      expect(m!.html.includes(PAUSE.knap), s).toBe(!udenPause);
      expect(m!.tekst.includes(KONTEKST.ikkeNuUrl), s).toBe(!udenPause);
      expect(m!.html).toContain("Lisbeth");
      // Jonas D4: det er Jonas der inviterer og taler med dem — aldrig «med Morten».
      expect(m!.tekst, s).toContain("Jonas Herlev");
      expect(m!.tekst, s).not.toMatch(/samtale med Morten|snak med Morten|med Morten/);
      // Jonas 2, 5 og 7 (18/9): ingen mail beder om svar på TIDER; ingen «hårde følelser»-tone; «ApSs» findes ikke.
      expect(m!.tekst, s).not.toMatch(/et par forslag|svar .{0,40}tidspunkt|hårde følelser|sure miner|ApSs\b/i);
      // Husets ramme (indgangsMailHtml): den grønne linje, kontaktadressen i footeren.
      expect(m!.html, s).toContain("height:3px;background-color:#27AE82");
      expect(m!.html, s).toContain(`mailto:${KONTAKT_ADRESSE}`);
    }
    // Jonas 3: procesteksten hører til i kvitteringen — ikke i indkaldelsen; «på vegne af».
    const indkaldelse = bygRykkerMail("ansoegning-indkaldelse", KONTEKST)!.tekst;
    expect(indkaldelse).not.toContain(PROCESTEKST);
    expect(indkaldelse).toContain("på vegne af Nordic Byg ApS");
    expect(indkaldelse).toContain("Vi tager begge stilling til, om der er et match.");
    // Jonas 4: dagen før — intet regnskab.
    expect(bygRykkerMail("ansoegning-samtale-i-morgen", KONTEKST)!.tekst).not.toMatch(/regnskab|nøgletal/);
    // Jonas 5: genitiv med apostrof.
    expect(bygRykkerMail("ansoegning-aftalegrundlag", KONTEKST)!.tekst).toContain("Nordic Byg ApS' medlemskab");
    // Jonas 7: ventelisten har TO knapper — ja og nej — i tilbud (normal og blød) og rykker, i HTML og tekst; første person.
    const vp = { bloed: false, svarfrist: new Date("2026-09-25T08:00:00Z"), tagPladsenUrl: "https://app.theboardroom.dk/ansoeg/status?t=abc&handling=tag_pladsen", afslaaPladsenUrl: "https://app.theboardroom.dk/ansoeg/status?t=abc&handling=afslaa_pladsen" };
    for (const [s, ctx] of [
      ["ansoegning-venteplads-tilbud", { ...KONTEKST, venteplads: vp }],
      ["ansoegning-venteplads-tilbud", { ...KONTEKST, venteplads: { ...vp, bloed: true } }],
      ["ansoegning-venteplads-rykker", { ...KONTEKST, venteplads: vp }],
    ] as const) {
      const m = bygRykkerMail(s, ctx)!;
      for (const [tekst, url] of [["Ja tak, jeg vil have pladsen →", vp.tagPladsenUrl], ["Nej tak — giv den videre →", vp.afslaaPladsenUrl]]) {
        expect(m.html, s).toContain(`>${tekst}</a>`);
        expect(m.html, s).toContain(`href="${url}"`);
        expect(m.tekst, s).toContain(`${tekst} ${url}`);
      }
      expect(m.tekst, s).not.toMatch(/Jonas Herlev dig|Hører vi|tager snakken/);
    }
    expect(bygRykkerMail("ansoegning-kladde-paamindelse", KONTEKST)!.tekst).toContain("/ansoeg?t=abc");
    expect(bygRykkerMail("findes-ikke", KONTEKST)).toBeNull();
    // Uden bookinglink: indkaldelsen linker til ansøgerens side, aldrig en tom href.
    const uden = bygRykkerMail("ansoegning-aftalegrundlag", { ...KONTEKST, aftaleUrl: null })!;
    expect(uden.html).toContain(KONTEKST.statusUrl);
    expect(uden.html).not.toContain('href=""');
  });
  it("8. config.toml: handling og cron bag verify_jwt = true, link bag false", () => {
    expect(configErRigtig(laes(CONFIG))).toBe(true);
  });
});

describe("ansoegningMotor.guard — dommene fanger fejlen på en kopi", () => {
  it("1. en regel der forsvinder fra hovedet, fælder dom 1", () => {
    const hoved = laes(RYKKERKOE).split("*/")[0];
    expect(reglerneStaarIHovedet(hoved.replace("aldrig efter 16", "aldrig efter 17"))).toBe(false);
  });
  it("2. createClient før auth, en tilfældig nøgle eller live som standard fælder dom 2", () => {
    const k = udenKommentarer(laes(CRON)), m = udenKommentarer(laes(MOTOR));
    expect(cronErRigtig(k.replace("const auth = authenticateServiceRole(req);\n  if (auth !== true) return auth;", ""), m)).toBe(false);
    expect(cronErRigtig(k, m.replace("idempotencyKey: raekke.idempotensnoegle", "idempotencyKey: crypto.randomUUID()"))).toBe(false);
    expect(cronErRigtig(k.replace("await sendKoeMail(admin, raekke, a, nu,", "await x("), m)).toBe(false);
    expect(cronErRigtig(k.replace("let toer = true;", "let toer = false;"), m)).toBe(false);
  });
  it("3. SECURITY DEFINER, en ottende trin-værdi, en anon-grant eller triggeren på auth.users fælder dom 3", () => {
    const sql = udenSqlKommentarer(laes(MIGRATION));
    expect(migrationenErRigtig(sql.replace("language plpgsql", "language plpgsql\nsecurity definer"))).toBe(false);
    expect(migrationenErRigtig(sql.replace("'underskrevet', 'lukket')", "'underskrevet', 'lukket', 'kladde')"))).toBe(false);
    expect(migrationenErRigtig(sql + "\ngrant select on public.ansoegninger to anon;")).toBe(false);
    expect(migrationenErRigtig(sql.replace("before update on public.ansoegninger\n  for each row execute function public.protect_ansoegning_motor_fields()", "after insert on auth.users\n  for each row execute function public.protect_ansoegning_motor_fields()"))).toBe(false);
    expect(migrationenErRigtig(sql.replace("constraint planlagte_haendelser_idempotens_unik unique (idempotensnoegle)", ""))).toBe(false);
  });
  it("4. konvertering efter trinnet, uden id, eller uden lås fælder dom 4", () => {
    const k = udenKommentarer(laes(MOTOR));
    expect(motorenErRigtig(k.replace("{ id: a.id },", "{},"))).toBe(false);
    expect(motorenErRigtig(k.replace('.eq("id", a.id)\n    .eq("trin", a.trin)', '.eq("id", a.id)'))).toBe(false);
    const konv = 'if (h.art === "underskrevet") {\n    konvertering = await konverterTilVirksomhed(admin, a, nu);';
    expect(motorenErRigtig(k.replace(konv, "").replace('const annulleret = await annullerTrapper(admin, a.id, o.annuller', konv + "\n  }\n  const annulleret = await annullerTrapper(admin, a.id, o.annuller"))).toBe(false);
  });
  it("5. ansøgningen slået op FØR session_bookings fælder dom 5", () => {
    const k = udenKommentarer(laes(CALENDLY));
    expect(calendlyErRigtig(k.replace('dom.handling === "book"', 'dom.handling === "book" && !(await hentAnsoegning(admin, bookingId))'))).toBe(false);
  });
  it("6. service-role før auth i handling, eller anbefalingen i linkets svar, fælder dom 6", () => {
    const h = udenKommentarer(laes(HANDLING));
    expect(handlingErRigtig(h.replace("authenticateUser(req)", "null as never").replace("const nu = new Date();", "const nu = new Date(); await authenticateUser(req);"))).toBe(false);
    expect(handlingErRigtig(h.replace("MENNESKE_HANDLINGER.includes(", "[...MENNESKE_HANDLINGER, ...SYSTEM_HANDLINGER].includes("))).toBe(false);
    const l = laes(LINK);
    expect(linkErRigtig(l.replace("virksomhedsnavn: virksomhedsnavnAf(a),", "virksomhedsnavn: virksomhedsnavnAf(a),\n    anbefaling: a.anbefaling,"))).toBe(false);
  });
  it("8. link bag verify_jwt = true eller cron bag false fælder dom 8", () => {
    const t = laes(CONFIG);
    expect(configErRigtig(t.replace("[functions.ansoegning-link]\n    verify_jwt = false", "[functions.ansoegning-link]\n    verify_jwt = true"))).toBe(false);
    expect(configErRigtig(t.replace("[functions.ansoegning-rykker-cron]\n    verify_jwt = true", "[functions.ansoegning-rykker-cron]\n    verify_jwt = false"))).toBe(false);
  });
});
