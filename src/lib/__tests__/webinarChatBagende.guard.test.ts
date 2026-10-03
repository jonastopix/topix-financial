import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { klassificer } from "../../../supabase/functions/_shared/klokkeMail.ts";
import { alleFunktionsfiler, klokkeTyperIKoden, legacyTyperIKoden, typerneErDaekket } from "./klokkeMail.guard.test";

/**
 * Kildeværn for webinarchattens bagende (spec'ens skive 5, 3/10-2026;
 * docs/webinarmotor.md §7.10). Hver dom har en MUTATION, der viser, at værnet
 * fælder den fejl, det er sat til.
 *
 *   1. LÅSEN ER FAIL-CLOSED: dommen åbner kun på true/«true»; I/O-læsningen giver
 *      false ved fejl og ved en manglende række; afsendelsen kræver dry_run: false
 *      OG (låsen ELLER prøven); migrationen lægger låsen som false (ON CONFLICT DO
 *      NOTHING) med husets første linje.
 *   2. INGEN MAIL TIL AFMELDTE: dommen afviser «afmeldt» før alt om personen;
 *      I/O'en dømmer afmeldt af BÅDE webinar_afmeldinger og rækkens «Unsubscribed»
 *      (erAfmeldt), og kan afmeldingerne ikke læses, sendes INTET.
 *   3. ÉN MAIL PR. SPØRGSMÅL: rækken TAGES med en UPDATE vagtet på leveret IS NULL
 *      FØR den eneste sendMailgun; pulsens «live» har samme vagt; et ukendt udfald
 *      giver aldrig rækken fri; en afvisning giver den fri KUN vagtet på vores eget
 *      stempel; mailen går til tilmeldingens egen adresse.
 *   4. TJENESTEKONTI FÅR INGEN KLOKKE: klokkens I/O filtrerer med udenTjenestekonti
 *      FØR dedup-dommen, og kan tjenestekonti ikke læses, ringer klokken ikke.
 *   5. KLOKKETYPEN STÅR PÅ EN LISTE (MORGEN) — klokkeMail.guards egen dom over hele koden.
 *   6. PULSEN ER FAIL-SOFT: klokken ringes EFTER indsættelsen og før «ok», resultatet
 *      går i fejlsummen; I/O-filen kaster aldrig, logger aldrig og har en frist.
 *   7. CRONEN: passet er ISOLERET (efter fremmødet, egne felter, rører aldrig `r`),
 *      Mailgun EU (aldrig Lovables mail-API mod seeren), alarmen kun i en rigtig
 *      kørsel og kun til driftModtager(), `email` i den STRIKSE body.
 *   8. KONSOLLENS TEKST FØLGER LÅSEN: fladen skriver svarLoefteTekst(…) og ikke længere
 *      en fast sætning om mail.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const foer = (s: string, a: string, b: string) => s.indexOf(a) >= 0 && s.indexOf(b) >= 0 && s.indexOf(a) < s.indexOf(b);

const DOM = "supabase/functions/_shared/webinarMotor/svarMail.ts";
const IO = "supabase/functions/_shared/webinarSvarMailKoersel.ts";
const KLOKKE_IO = "supabase/functions/_shared/webinarSpoergsmaalKlokke.ts";
const KLOKKE_DOM = "supabase/functions/_shared/webinarMotor/klokke.ts";
const PULS = "supabase/functions/webinar-puls/index.ts";
const CRON = "supabase/functions/webinar-motor-cron/index.ts";
const MIG = "supabase/migrations/20261003080000_webinar_chat_bagende.sql";
const FLADE = "src/components/hjemmebane/webinarMotor/WebinarKonsol.tsx";
const FOERSTE = "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";

// ── 1 ──────────────────────────────────────────────────────────────────────
export function laasenErFailClosed(dom: string, io: string, mig: string): boolean {
  const d = udenKommentarer(dom), i = udenKommentarer(io);
  const laesIo = i.slice(i.indexOf("export async function svarMailLaasAktiv("), i.indexOf("interface Spoergsmaal"));
  return d.includes('export const SVAR_MAIL_LAAS_NOEGLE = "webinar_svar_mail_aktiv";') &&
    d.includes('return v === true || v === "true";') &&
    d.includes("return !a.toerKoersel && (a.laas || a.proeveEmail !== null);") &&
    laesIo.includes("if (error) return false;") && laesIo.includes("} catch {\n    return false;") &&
    laesIo.includes("return laesSvarMailLaas(") &&
    // Tørkørslen (og lukket lås uden prøve) returnerer FØR noget tages eller sendes.
    foer(i, "if (!r.sender_rigtigt || skal.length === 0) return;", '.update({ leveret: "mail"') &&
    mig.split("\n")[0] === FOERSTE &&
    /insert into public\.app_config \(config_key, config_value, description\)\s*values \('webinar_svar_mail_aktiv', 'false'::jsonb,[\s\S]*?on conflict \(config_key\) do nothing;/.test(mig) &&
    /^begin;$/m.test(mig) && /^commit;$/m.test(mig) && !/security definer/i.test(mig.replace(/--[^\n]*/g, ""));
}

// ── 2 ──────────────────────────────────────────────────────────────────────
export function afmeldteAldrig(dom: string, io: string): boolean {
  const d = udenKommentarer(dom), i = udenKommentarer(io);
  const fn = d.slice(d.indexOf("export function svarMailDom("), d.indexOf("export function svarUdfaldArt("));
  return fn.includes('if (k.afmeldt) return { send: false, grund: "afmeldt" };') &&
    foer(fn, 'if (k.afmeldt) return { send: false, grund: "afmeldt" };', 'if (a.proeveEmail !== null') &&
    i.includes("afmeldt: t !== null && (afmeldte.has(email) || erAfmeldt(t)),") &&
    /\.from\("webinar_afmeldinger"\)\.select\("email"\)\.in\("email", b\);\s*if \(error\) \{ r\.fejl\.push\(`webinar_afmeldinger: \$\{error\.message\}`\); return; \}/.test(i);
}

// ── 3 ──────────────────────────────────────────────────────────────────────
const TAG = '.update({ leveret: "mail", leveret_at: taget })\n      .eq("id", s.id).eq("status", "besvaret").is("leveret", null)';
export function enPrSpoergsmaal(io: string, puls: string): boolean {
  const i = udenKommentarer(io), p = udenKommentarer(puls);
  const send = "await sendMailgun(a.mailgunNoegle, { til: email,";
  const ukendt = i.slice(i.indexOf('else if (art === "ukendt") {'), i.indexOf("} else {", i.indexOf('else if (art === "ukendt") {')));
  return i.includes(TAG) && foer(i, TAG, send) && (i.match(/sendMailgun\(/g) ?? []).length === 1 &&
    i.includes("if (!tag || tag.length !== 1) { r.taget_imens++; continue; }") &&
    !ukendt.includes("leveret: null") &&
    i.includes('.update({ leveret: null, leveret_at: null })\n        .eq("id", s.id).eq("leveret", "mail").eq("leveret_at", taget)') &&
    (i.match(/leveret: null/g) ?? []).length === 1 &&
    i.includes('const email = (t.email ?? "").trim().toLowerCase();') &&
    // Pulsens «live» har samme vagt.
    /\.update\(\{ leveret: "live", leveret_at: [^}]+\}\)\s*\.in\("id", ids\)\s*\.is\("leveret", null\)/.test(p);
}

// ── 4 ──────────────────────────────────────────────────────────────────────
export function tjenestekontiUdenKlokke(io: string): boolean {
  const i = udenKommentarer(io);
  return i.includes("const raadgivere = udenTjenestekonti(alle, tjenestekonti);") &&
    i.includes('try { tjenestekonti = await hentTjenestekonti(admin); } catch { ud.fejl = "klokke:tjenestekonti"; return ud; }') &&
    i.includes("raadgivereUdenUlaestKlokke(raadgivere, ") && i.includes(".in(\"advisor_id\", raadgivere)") &&
    foer(i, "const raadgivere = udenTjenestekonti(alle, tjenestekonti);", 'from("advisor_notifications").insert(raekker)');
}

// ── 6 ──────────────────────────────────────────────────────────────────────
export function pulsenFailSoft(puls: string, io: string): boolean {
  const p = udenKommentarer(puls), i = udenKommentarer(io);
  const gren = p.slice(p.indexOf('if (h.art === "spoergsmaal") {'), p.indexOf("// reaktion", p.indexOf('if (h.art === "spoergsmaal") {')));
  return foer(gren, '.from("webinar_spoergsmaal").insert({', "await ringSpoergsmaalKlokke(admin,") &&
    foer(gren, 'if (error) { noterFejl("spoergsmaal"); return "fejl"; }', "await ringSpoergsmaalKlokke(admin,") &&
    foer(gren, "await ringSpoergsmaalKlokke(admin,", 'return "ok";') &&
    gren.includes("if (klokke.fejl !== null) noterFejl(klokke.fejl);") &&
    !/\bthrow\b/.test(i) && !/\bconsole\./.test(i) &&
    i.includes("return await Promise.race([ring(admin, a), frist]);") &&
    /async function ring\([\s\S]*?try \{[\s\S]*\} catch \{\s*ud\.fejl = "klokke:uventet";\s*return ud;\s*\}/.test(i);
}

// ── 7 ──────────────────────────────────────────────────────────────────────
export function cronenErIsoleret(cron: string, io: string): boolean {
  const c = udenKommentarer(cron), i = udenKommentarer(io);
  const serve = c.slice(c.indexOf("Deno.serve("));
  const pas = serve.slice(serve.indexOf("const svarLaas = await svarMailLaasAktiv(admin);"), serve.indexOf("if (r === null) return json("));
  return c.includes('export const KENDTE_FELTER = ["dry_run", "session_id", "nu", "email"] as const;') &&
    foer(serve, "r = await koer({", "const svarMail = await koerSvarMail(admin, {") &&
    pas.length > 0 && !/\br\.(ok|fejl|sender_rigtigt|udsat|sessioner)\b/.test(pas) &&
    serve.includes("return json({ ...r, svar_mail: svarMail });") &&
    serve.includes("await alarmerSvarMail(admin, svarMail, new Date());") &&
    // Kaster aldrig: hele passet i try/catch.
    /try \{\s*await koer\(admin, a, r\);\s*\} catch \(err\) \{/.test(i) &&
    // Mailgun EU mod seeren; Lovables mail-API KUN i alarmen til driftModtager().
    i.includes('import { PAUSE_MS, sendMailgun } from "./mailgunAfsendelse.ts";') &&
    (i.match(/sendManagedEmail\(/g) ?? []).length === 1 && i.includes("to: driftModtager(),") &&
    i.includes("if (!skalSvarMailAlarmere(r)) return;");
}

// ── 8 ──────────────────────────────────────────────────────────────────────
export function konsolTekstFoelgerLaasen(flade: string): boolean {
  const f = udenKommentarer(flade);
  return f.includes("{svarLoefteTekst(svarMailLaas.isError ? null : svarMailLaas.data ?? null)}") &&
    f.includes("const svarMailLaas = useSvarMailLaas();") && !f.includes("der sendes intet på mail");
}

describe("webinarChatBagende.guard", () => {
  it("1. låsen er fail-closed (dom, I/O, migration)", () => expect(laasenErFailClosed(laes(DOM), laes(IO), laes(MIG))).toBe(true));
  it("2. ingen mail til afmeldte", () => expect(afmeldteAldrig(laes(DOM), laes(IO))).toBe(true));
  it("3. én mail pr. spørgsmål (vagtet UPDATE før den eneste afsendelse)", () => expect(enPrSpoergsmaal(laes(IO), laes(PULS))).toBe(true));
  it("4. tjenestekonti får ingen klokke", () => expect(tjenestekontiUdenKlokke(laes(KLOKKE_IO))).toBe(true));
  it("5. klokketypen står på en liste (MORGEN) — og findes i koden", () => {
    const filer = alleFunktionsfiler();
    const typer = klokkeTyperIKoden(filer);
    expect(typer.has("webinar_spoergsmaal")).toBe(true);
    expect(typerneErDaekket(typer, legacyTyperIKoden(filer), (t) => klassificer(t)).ok).toBe(true);
    expect(klassificer("webinar_spoergsmaal")).toBe("morgen");
    expect(laes(KLOKKE_DOM)).toContain('export const TYPE_WEBINAR_SPOERGSMAAL = "webinar_spoergsmaal";');
  });
  it("6. pulsen er fail-soft", () => expect(pulsenFailSoft(laes(PULS), laes(KLOKKE_IO))).toBe(true));
  it("7. cronens pas er isoleret, Mailgun EU, alarm kun til drift", () => expect(cronenErIsoleret(laes(CRON), laes(IO))).toBe(true));
  it("8. konsollens tekst følger låsen", () => expect(konsolTekstFoelgerLaasen(laes(FLADE))).toBe(true));
});

describe("webinarChatBagende.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  it("1. låsen åben ved fejl, «alt undtagen false» åbner, ingen prøvegrænse, eller migrationen uden false", () => {
    const d = laes(DOM), i = laes(IO), m = laes(MIG);
    expect(laasenErFailClosed(d.replace('return v === true || v === "true";', "return v !== false;"), i, m)).toBe(false);
    expect(laasenErFailClosed(d, i.replace("if (error) return false;", "if (error) return true;"), m)).toBe(false);
    expect(laasenErFailClosed(d.replace("(a.laas || a.proeveEmail !== null)", "true"), i, m)).toBe(false);
    expect(laasenErFailClosed(d, i, m.replace("'webinar_svar_mail_aktiv', 'false'::jsonb", "'webinar_svar_mail_aktiv', 'true'::jsonb"))).toBe(false);
    expect(laasenErFailClosed(d, i, m.replace(FOERSTE, "-- KØRT"))).toBe(false);
  });
  it("2. afmeldt-tjekket fjernet, kun den ene kilde, eller fail-open på afmeldingerne", () => {
    const d = laes(DOM), i = laes(IO);
    expect(afmeldteAldrig(d.replace('  if (k.afmeldt) return { send: false, grund: "afmeldt" };\n', ""), i)).toBe(false);
    expect(afmeldteAldrig(d, i.replace("(afmeldte.has(email) || erAfmeldt(t))", "afmeldte.has(email)"))).toBe(false);
    expect(afmeldteAldrig(d, i.replace("if (error) { r.fejl.push(`webinar_afmeldinger: ${error.message}`); return; }", "if (error) { r.fejl.push(`webinar_afmeldinger: ${error.message}`); }"))).toBe(false);
  });
  it("3. uden vagten, afsendelsen før vagten, en afsendelse nr. to, eller et ukendt udfald givet fri", () => {
    const i = laes(IO), p = laes(PULS);
    const utenVagt = i.replace('.eq("id", s.id).eq("status", "besvaret").is("leveret", null)', '.eq("id", s.id).eq("status", "besvaret")');
    expect(utenVagt).not.toBe(i);
    expect(enPrSpoergsmaal(utenVagt, p)).toBe(false);
    // Afsendelsen flyttet FØR vagten.
    const send = "    const spor = await sendMailgun(a.mailgunNoegle, { til: email, fra: AFSENDER, emne: mail.subject, html: mail.html, tekst: mail.text, svarTil: SVAR_TIL, afmeldUrl: link });\n";
    expect(i).toContain(send);
    expect(enPrSpoergsmaal(i.replace(send, "").replace("    // 3. TAG rækken", send + "    // 3. TAG rækken"), p)).toBe(false);
    expect(enPrSpoergsmaal(i + "\nawait sendMailgun(a.mailgunNoegle, brev);\n", p)).toBe(false);
    expect(enPrSpoergsmaal(i.replace("r.ukendte++;", 'r.ukendte++; await admin.from("webinar_spoergsmaal").update({ leveret: null, leveret_at: null }).eq("id", s.id);'), p)).toBe(false);
    expect(enPrSpoergsmaal(i.replace('.eq("id", s.id).eq("leveret", "mail").eq("leveret_at", taget)', '.eq("id", s.id)'), p)).toBe(false);
    expect(enPrSpoergsmaal(i, p.replace('.in("id", ids)\n          .is("leveret", null)', '.in("id", ids)'))).toBe(false);
  });
  it("4. tjenestekonti med i listen, eller fail-open, når de ikke kan læses", () => {
    const i = laes(KLOKKE_IO);
    expect(tjenestekontiUdenKlokke(i.replace("const raadgivere = udenTjenestekonti(alle, tjenestekonti);", "const raadgivere = alle;"))).toBe(false);
    expect(tjenestekontiUdenKlokke(i.replace('catch { ud.fejl = "klokke:tjenestekonti"; return ud; }', "catch { tjenestekonti = new Set(); }"))).toBe(false);
  });
  it("5. typen fjernet fra MORGEN fælder klokkeMail-dommen", () => {
    const filer = alleFunktionsfiler();
    const typer = klokkeTyperIKoden(filer);
    const r = typerneErDaekket(typer, legacyTyperIKoden(filer), (t) => (t === "webinar_spoergsmaal" ? "ukendt" : klassificer(t)));
    expect(r.ok).toBe(false);
    expect(r.udenPlads).toContain("webinar_spoergsmaal");
  });
  it("6. klokken FØR indsættelsen, et kast, en log eller uden frist fælder", () => {
    const p = laes(PULS), i = laes(KLOKKE_IO);
    const kald = "    const klokke = await ringSpoergsmaalKlokke(admin, { sessionId: a.sessionId, webinarTitel: a.webinarTitel });\n    if (klokke.fejl !== null) noterFejl(klokke.fejl);\n";
    expect(p).toContain(kald);
    const flyttet = p.replace(kald, "").replace('    const { error } = await admin.from("webinar_spoergsmaal").insert({', kald + '    const { error } = await admin.from("webinar_spoergsmaal").insert({');
    expect(pulsenFailSoft(flyttet, i)).toBe(false);
    expect(pulsenFailSoft(p.replace("if (klokke.fejl !== null) noterFejl(klokke.fejl);", 'if (klokke.fejl !== null) throw new Error("klokke");'), i)).toBe(false);
    expect(pulsenFailSoft(p, i.replace('ud.fejl = "klokke:insert";', 'console.error("x"); ud.fejl = "klokke:insert";'))).toBe(false);
    expect(pulsenFailSoft(p, i.replace("return await Promise.race([ring(admin, a), frist]);", "return await ring(admin, a);"))).toBe(false);
  });
  it("7. passet før fremmødet, passet rører `r`, Lovables mail-API mod seeren, eller `email` ikke i body'en", () => {
    const c = laes(CRON), i = laes(IO);
    expect(cronenErIsoleret(c.replace("  await alarmerSvarMail(admin, svarMail, new Date());", "  await alarmerSvarMail(admin, svarMail, new Date());\n  if (r) r.fejl.push(...svarMail.fejl);"), i)).toBe(false);
    expect(cronenErIsoleret(c.replace('"nu", "email"] as const;', '"nu"] as const;'), i)).toBe(false);
    expect(cronenErIsoleret(c, i.replace("const spor = await sendMailgun(", "await sendManagedEmail({ adminClient: admin, to: email }); const spor = await sendMailgun("))).toBe(false);
    expect(cronenErIsoleret(c, i.replace("if (!skalSvarMailAlarmere(r)) return;", ""))).toBe(false);
  });
  it("8. den faste sætning tilbage i fladen fælder", () => {
    const f = laes(FLADE).replace("{svarLoefteTekst(svarMailLaas.isError ? null : svarMailLaas.data ?? null)}", "Svaret vises for seeren ved næste puls, hvis seeren stadig er i rummet — der sendes intet på mail.");
    expect(konsolTekstFoelgerLaasen(f)).toBe(false);
  });
});
