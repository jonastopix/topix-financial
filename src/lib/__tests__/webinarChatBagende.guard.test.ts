import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { klassificer } from "../../../supabase/functions/_shared/klokkeMail.ts";
import { alleFunktionsfiler, klokkeTyperIKoden, legacyTyperIKoden, typerneErDaekket } from "./klokkeMail.guard.test";

/**
 * Kildeværn for webinarchattens bagende (spec'ens skive 5, 3/10-2026;
 * docs/webinarmotor.md §7.10), rettet efter CTO-rådets ni fund 3/10. Hver dom har
 * en MUTATION, der viser, at værnet fælder den fejl, det er sat til.
 *
 *   1. LÅSEN ER FAIL-CLOSED: dommen åbner kun på true/«true»; I/O-læsningen giver
 *      false ved fejl og ved en manglende række; afsendelsen kræver dry_run: false
 *      OG (låsen ELLER prøven); migrationen lægger låsen som false.
 *   2. INGEN MAIL TIL AFMELDTE (webinar_afmeldinger OG «Unsubscribed»; læsefejl → intet).
 *   3. ÉN MAIL PR. SPØRGSMÅL: rækken TAGES med en UPDATE vagtet på leveret IS NULL
 *      FØR den eneste sendMailgun; pulsens «live» har samme vagt; et ukendt udfald
 *      giver aldrig rækken fri; en afvisning giver den fri KUN vagtet på vores stempel.
 *   4. TJENESTEKONTI FÅR KLOKKEN (fund 2 — husets regel): klokkens I/O filtrerer
 *      IKKE; mailen filtreres i klokke-mail-cron (udenTjenestekonti).
 *   5. KLOKKETYPEN STÅR PÅ EN LISTE (MORGEN) — klokkeMail.guards egen dom.
 *   6. PULSEN: klokken ringes HØJST ÉN GANG PR. KALD, EFTER handlingsløkken og kun
 *      når et spørgsmål blev «ok» (fund 4); fail-soft, tavs, med frist; én INSERT
 *      pr. rådgiver, så en 23505 ikke taber de andres (fund 5).
 *   7. CRONEN: passet er ISOLERET og står EFTER fremmødet (fund 9: rækkefølgen),
 *      Mailgun EU, alarmen kun til driftModtager(), `email` i den STRIKSE body.
 *   8. KONSOLLENS TEKST FØLGER LÅSEN — med forbeholdet «hvis seeren kan modtage
 *      mail» — og leveringen skelner sendt / ukendt / afvist (fund 7).
 *   9. BUDGETTET (fund 1): passet springes HELT over — før første læsning — når
 *      fremmødet har brugt tiden.
 *  10. STØJ (fund 3): morgenmailen springer webinarklokken over uden et ubesvaret
 *      spørgsmål i sessionen; konsollen markerer sessionens klokke læst — gated af
 *      laeseMarkeringTilladt.
 *  11. LOFT PÅ AFVISNINGER (fund 6): højst 6 pr. spørgsmål, talt i loggen; uden
 *      Mailgun-nøgle TAGES intet.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const foer = (s: string, a: string, b: string) => s.indexOf(a) >= 0 && s.indexOf(b) >= 0 && s.indexOf(a) < s.indexOf(b);

const DOM = "supabase/functions/_shared/webinarMotor/svarMail.ts";
const IO = "supabase/functions/_shared/webinarSvarMailKoersel.ts";
const KLOKKE_IO = "supabase/functions/_shared/webinarSpoergsmaalKlokke.ts";
const KLOKKE_DOM = "supabase/functions/_shared/webinarMotor/klokke.ts";
const KLOKKE_MAIL = "supabase/functions/_shared/klokkeMail.ts";
const KLOKKE_CRON = "supabase/functions/klokke-mail-cron/index.ts";
const PULS = "supabase/functions/webinar-puls/index.ts";
const CRON = "supabase/functions/webinar-motor-cron/index.ts";
const MIG = "supabase/migrations/20261003080000_webinar_chat_bagende.sql";
const FLADE = "src/components/hjemmebane/webinarMotor/WebinarKonsol.tsx";
const HOOK = "src/hooks/webinarKonsol.ts";
const KONSOL = "src/lib/webinarMotorAdmin/konsol.ts";
const KLOKKE_HOOK = "src/hooks/webinarKonsolKlokke.ts";
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
const TAG = '.update({ leveret: "mail", leveret_at: taget, mail_udfald: null })\n      .eq("id", s.id).eq("status", "besvaret").is("leveret", null)';
const SEND = "await sendMailgun(a.mailgunNoegle, { til: email,";
const FRI = '.update({ leveret: null, leveret_at: null, mail_udfald: MAIL_UDFALD.afvist })\n        .eq("id", s.id).eq("leveret", "mail").eq("leveret_at", taget)';
export function enPrSpoergsmaal(io: string, puls: string): boolean {
  const i = udenKommentarer(io), p = udenKommentarer(puls);
  const ukendt = i.slice(i.indexOf('else if (art === "ukendt") {'), i.indexOf("} else {", i.indexOf('else if (art === "ukendt") {')));
  return i.includes(TAG) && foer(i, TAG, SEND) && (i.match(/sendMailgun\(/g) ?? []).length === 1 &&
    i.includes("if (!tag || tag.length !== 1) { r.taget_imens++; continue; }") &&
    !ukendt.includes("leveret: null") &&
    i.includes(FRI) && (i.match(/leveret: null/g) ?? []).length === 1 &&
    i.includes('const email = (t.email ?? "").trim().toLowerCase();') &&
    /\.update\(\{ leveret: "live", leveret_at: [^}]+\}\)\s*\.in\("id", ids\)\s*\.is\("leveret", null\)/.test(p);
}

// ── 4 ──────────────────────────────────────────────────────────────────────
export function tjenestekontiFaarKlokken(klokkeIo: string, klokkeCron: string): boolean {
  const i = udenKommentarer(klokkeIo), c = udenKommentarer(klokkeCron);
  return !/udenTjenestekonti|hentTjenestekonti|tjenestekonti/.test(i) &&
    i.includes('.from("user_roles").select("user_id").in("role", ["advisor", "admin"])') &&
    i.includes("raadgivereUdenUlaestKlokke(raadgivere, ") &&
    // Mailen filtreres i klokke-mail-cron.
    c.includes("udenTjenestekonti(alle, tjenestekonti)");
}

// ── 6 ──────────────────────────────────────────────────────────────────────
const RING = "await ringSpoergsmaalKlokke(admin, { sessionId: d.session_id, webinarTitel: rd.webinar.titel ?? null });";
export function pulsenRingerEnGang(puls: string, io: string): boolean {
  const p = udenKommentarer(puls), i = udenKommentarer(io);
  const handling = p.slice(p.indexOf("async function udfoerHandling("), p.indexOf("Deno.serve("));
  const loekke = "for (const h of krop.handlinger) {\n        const udfald = await udfoerHandling(";
  const betingelse = 'if (krop.handlinger.some((h, i) => h.art === "spoergsmaal" && handlingerUd[i]?.udfald === "ok")) {';
  return !handling.includes("ringSpoergsmaalKlokke") &&
    (p.match(/ringSpoergsmaalKlokke\(/g) ?? []).length === 1 &&
    foer(p, loekke, betingelse) && foer(p, betingelse, RING) &&
    p.includes(RING + "\n        if (klokke.fejl !== null) noterFejl(klokke.fejl);") &&
    !/\bthrow\b/.test(i) && !/\bconsole\./.test(i) &&
    i.includes("return await Promise.race([ring(admin, a), frist]);") &&
    /async function ring\([\s\S]*?try \{[\s\S]*\} catch \{\s*ud\.fejl = "klokke:uventet";\s*return ud;\s*\}/.test(i) &&
    // Én INSERT pr. rådgiver — aldrig en liste.
    /for \(const advisorId of mangler\) \{\s*const \{ error: insFejl \} = await admin\.from\("advisor_notifications"\)\.insert\(\{/.test(i) &&
    !/\.insert\(\s*raekker\s*\)/.test(i) &&
    i.includes('else if ((insFejl as { code?: string }).code === "23505") ud.fandtes++;');
}

// ── 7 ──────────────────────────────────────────────────────────────────────
export function cronenErIsoleret(cron: string, io: string): boolean {
  const c = udenKommentarer(cron), i = udenKommentarer(io);
  const serve = c.slice(c.indexOf("Deno.serve("));
  const pas = serve.slice(serve.indexOf("const svarLaas = await svarMailLaasAktiv(admin);"), serve.indexOf("if (r === null) return json("));
  return c.includes('export const KENDTE_FELTER = ["dry_run", "session_id", "nu", "email"] as const;') &&
    foer(serve, "r = await koer({", "const svarLaas = await svarMailLaasAktiv(admin);") &&
    foer(serve, "r = await koer({", "const svarMail = await koerSvarMail(admin, {") &&
    pas.length > 0 && !/\br\.(ok|fejl|sender_rigtigt|udsat|sessioner)\b/.test(pas) &&
    serve.includes("return json({ ...r, svar_mail: svarMail });") &&
    serve.includes("await alarmerSvarMail(admin, svarMail, new Date());") &&
    /try \{\s*await koer\(admin, a, r\);\s*\} catch \(err\) \{/.test(i) &&
    i.includes('import { PAUSE_MS, sendMailgun } from "./mailgunAfsendelse.ts";') &&
    (i.match(/sendManagedEmail\(/g) ?? []).length === 1 && i.includes("to: driftModtager(),") &&
    i.includes("if (!skalSvarMailAlarmere(r)) return;");
}

// ── 8 ──────────────────────────────────────────────────────────────────────
export function konsolTekstFoelgerLaasen(flade: string, konsol: string, hook: string): boolean {
  const f = udenKommentarer(flade), k = udenKommentarer(konsol), h = udenKommentarer(hook);
  const lev = k.slice(k.indexOf("export function leveringTekst("), k.indexOf("export function laasFraRaekke("));
  return f.includes("{svarLoefteTekst(svarMailLaas.isError ? null : svarMailLaas.data ?? null)}") &&
    f.includes("const svarMailLaas = useSvarMailLaas();") && !f.includes("der sendes intet på mail") &&
    k.includes("hvis seeren kan modtage mail") &&
    lev.includes('s.mail_udfald === "sendt"') && lev.includes('s.mail_udfald === "ukendt"') && lev.includes('s.mail_udfald === "afvist"') &&
    h.includes("leveret, leveret_at, mail_udfald, tilmelding:webinar_tilmeldinger(fornavn)");
}

// ── 9 ──────────────────────────────────────────────────────────────────────
export function budgettetFoerst(io: string, dom: string): boolean {
  const i = udenKommentarer(io), d = udenKommentarer(dom);
  const fn = i.slice(i.indexOf("export async function koerSvarMail("), i.indexOf("async function koer("));
  return d.includes("export const svarPassetMaaBegynde = (forloebetMs: number): boolean => svarMailBudgetTillader(forloebetMs);") &&
    d.includes("export const SVAR_MAIL_SENESTE_START_MS = SVAR_MAIL_JOB_TIMEOUT_MS - SVAR_MAIL_MARGIN_MS - SVAR_MAIL_RESTTID_MS;") &&
    fn.includes("if (!svarPassetMaaBegynde(forloebet)) { r.sprunget_over_af_budget = true; return r; }") &&
    foer(fn, "if (!svarPassetMaaBegynde(forloebet))", "await koer(admin, a, r);") && !/admin\.from\(/.test(fn);
}

// ── 10 ─────────────────────────────────────────────────────────────────────
export function stoejenErVaek(klokkeMail: string, klokkeCron: string, hook: string, flade: string): boolean {
  const m = udenKommentarer(klokkeMail), c = udenKommentarer(klokkeCron), h = udenKommentarer(hook), f = udenKommentarer(flade);
  const marker = h.slice(h.indexOf("export function useMarkerKonsolKlokkeLaest("));
  return m.includes("if (r.type === WEBINARKLOKKEN && !(r.reference_id !== null && sessionerMedUbesvarede.has(r.reference_id))) { sprunget++; continue; }") &&
    m.includes("if (sessionerMedUbesvarede === null) return { raekker: [...raekker], sprunget: 0 };") &&
    c.includes('.from("webinar_spoergsmaal").select("session_id").eq("status", "ny").in("session_id", webinarSessioner);') &&
    // Cronens læsefejl er FAIL-OPEN: null → klokken mailes som før (aldrig et tomt sæt, der ville tie den ihjel).
    c.includes("if (error) medUbesvarede = null;") &&
    foer(c, "const webinarDom = udenBesvaredeWebinarKlokker(raekker, medUbesvarede);", "const f = fordel(webinarDom.raekker, a.nu);") &&
    marker.includes("if (!laeseMarkeringTilladt || !user || !sessionId) return;") &&
    foer(marker, "if (!laeseMarkeringTilladt", '.update({ read_at:') &&
    marker.includes('.eq("advisor_id", user.id)') && marker.includes(".eq(\"type\", TYPE_WEBINAR_SPOERGSMAAL)") && marker.includes('.eq("reference_id", sessionId)') &&
    f.includes("useMarkerKonsolKlokkeLaest(sessionId, koe.dataUpdatedAt);");
}

// ── 11 ─────────────────────────────────────────────────────────────────────
export function afvisningerHarLoft(dom: string, io: string): boolean {
  const d = udenKommentarer(dom), i = udenKommentarer(io);
  return d.includes("export const SVAR_MAIL_MAKS_AFVISNINGER = 6;") &&
    d.includes('if (k.afvisningerFoer >= SVAR_MAIL_MAKS_AFVISNINGER) return { send: false, grund: "opgivet" };') &&
    i.includes('if (d.art === "afvist" && typeof d.spoergsmaal_id === "string") afvisninger.set(') &&
    i.includes("afvisningerFoer: afvisninger.get(s.id) ?? 0,") &&
    foer(i, 'if (!(a.mailgunNoegle ?? "").trim()) {', TAG.split("\n")[0]) &&
    i.includes('if (!(a.mailgunNoegle ?? "").trim()) { r.fejl.push("MAILGUN_SENDING_KEY mangler — intet taget, intet sendt"); r.udsat += skal.length; return; }');
}

describe("webinarChatBagende.guard", () => {
  it("1. låsen er fail-closed (dom, I/O, migration)", () => expect(laasenErFailClosed(laes(DOM), laes(IO), laes(MIG))).toBe(true));
  it("2. ingen mail til afmeldte", () => expect(afmeldteAldrig(laes(DOM), laes(IO))).toBe(true));
  it("3. én mail pr. spørgsmål (vagtet UPDATE før den eneste afsendelse)", () => expect(enPrSpoergsmaal(laes(IO), laes(PULS))).toBe(true));
  it("4. tjenestekonti FÅR klokken (husets regel) — mailen filtreres i klokke-mail-cron", () => expect(tjenestekontiFaarKlokken(laes(KLOKKE_IO), laes(KLOKKE_CRON))).toBe(true));
  it("5. klokketypen står på en liste (MORGEN) — og findes i koden", () => {
    const filer = alleFunktionsfiler();
    const typer = klokkeTyperIKoden(filer);
    expect(typer.has("webinar_spoergsmaal")).toBe(true);
    expect(typerneErDaekket(typer, legacyTyperIKoden(filer), (t) => klassificer(t)).ok).toBe(true);
    expect(klassificer("webinar_spoergsmaal")).toBe("morgen");
    expect(laes(KLOKKE_DOM)).toContain('export const TYPE_WEBINAR_SPOERGSMAAL = "webinar_spoergsmaal";');
  });
  it("6. pulsen ringer højst én gang pr. kald, efter løkken, fail-soft, én insert pr. rådgiver", () => expect(pulsenRingerEnGang(laes(PULS), laes(KLOKKE_IO))).toBe(true));
  it("7. cronens pas er isoleret og står efter fremmødet, Mailgun EU, alarm kun til drift", () => expect(cronenErIsoleret(laes(CRON), laes(IO))).toBe(true));
  it("8. konsollens tekst følger låsen, med forbehold, og leveringen skelner udfaldene", () => expect(konsolTekstFoelgerLaasen(laes(FLADE), laes(KONSOL), laes(HOOK))).toBe(true));
  it("9. budgettet: passet springes over før første læsning", () => expect(budgettetFoerst(laes(IO), laes(DOM))).toBe(true));
  it("10. støjen: morgenmailen uden besvarede sessioner, konsollen markerer klokken læst (gated)", () => expect(stoejenErVaek(laes(KLOKKE_MAIL), laes(KLOKKE_CRON), laes(KLOKKE_HOOK), laes(FLADE))).toBe(true));
  it("11. loft på afvisninger (6, talt i loggen) og intet taget uden nøgle", () => expect(afvisningerHarLoft(laes(DOM), laes(IO))).toBe(true));
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
    const send = "    const spor = await sendMailgun(a.mailgunNoegle, { til: email, fra: AFSENDER, emne: mail.subject, html: mail.html, tekst: mail.text, svarTil: SVAR_TIL, afmeldUrl: link });\n";
    expect(i).toContain(send);
    expect(enPrSpoergsmaal(i.replace(send, "").replace("    // 3. TAG rækken", send + "    // 3. TAG rækken"), p)).toBe(false);
    expect(enPrSpoergsmaal(i + "\nawait sendMailgun(a.mailgunNoegle, brev);\n", p)).toBe(false);
    expect(enPrSpoergsmaal(i.replace("r.ukendte++;", 'r.ukendte++; await admin.from("webinar_spoergsmaal").update({ leveret: null, leveret_at: null }).eq("id", s.id);'), p)).toBe(false);
    expect(enPrSpoergsmaal(i.replace('.eq("id", s.id).eq("leveret", "mail").eq("leveret_at", taget)\n        .select', '.eq("id", s.id)\n        .select'), p)).toBe(false);
    expect(enPrSpoergsmaal(i, p.replace('.in("id", ids)\n          .is("leveret", null)', '.in("id", ids)'))).toBe(false);
  });
  it("4. et tjenestekonto-filter i klokkens I/O, eller uden filter i mailen, fælder", () => {
    const k = laes(KLOKKE_IO), c = laes(KLOKKE_CRON);
    const kilde = "    if (raadgivere.length === 0) return ud;";
    expect(k).toContain(kilde);
    expect(tjenestekontiFaarKlokken(k.replace(kilde, "    const tk = await hentTjenestekonti(admin);\n    const rg = udenTjenestekonti(raadgivere, tk);\n" + kilde), c)).toBe(false);
    expect(tjenestekontiFaarKlokken(k, c.replace("udenTjenestekonti(alle, tjenestekonti)", "alle"))).toBe(false);
  });
  it("5. typen fjernet fra MORGEN fælder klokkeMail-dommen", () => {
    const filer = alleFunktionsfiler();
    const typer = klokkeTyperIKoden(filer);
    const r = typerneErDaekket(typer, legacyTyperIKoden(filer), (t) => (t === "webinar_spoergsmaal" ? "ukendt" : klassificer(t)));
    expect(r.ok).toBe(false);
    expect(r.udenPlads).toContain("webinar_spoergsmaal");
  });
  it("6. klokken inde i løkken, uden «ok»-betingelsen, et kast, en log, uden frist, eller én insert for alle fælder", () => {
    const p = laes(PULS), i = laes(KLOKKE_IO);
    const betingelse = 'if (krop.handlinger.some((h, i) => h.art === "spoergsmaal" && handlingerUd[i]?.udfald === "ok")) {';
    expect(pulsenRingerEnGang(p.replace(betingelse, "if (true) {"), i)).toBe(false);
    expect(pulsenRingerEnGang(p.replace('    if (error) { noterFejl("spoergsmaal"); return "fejl"; }\n    return "ok";', '    if (error) { noterFejl("spoergsmaal"); return "fejl"; }\n    await ringSpoergsmaalKlokke(admin, { sessionId: a.sessionId, webinarTitel: null });\n    return "ok";'), i)).toBe(false);
    expect(pulsenRingerEnGang(p.replace("if (klokke.fejl !== null) noterFejl(klokke.fejl);", 'if (klokke.fejl !== null) throw new Error("klokke");'), i)).toBe(false);
    expect(pulsenRingerEnGang(p, i.replace('else ud.fejl = "klokke:insert";', 'else { console.error("x"); ud.fejl = "klokke:insert"; }'))).toBe(false);
    expect(pulsenRingerEnGang(p, i.replace("return await Promise.race([ring(admin, a), frist]);", "return await ring(admin, a);"))).toBe(false);
    expect(pulsenRingerEnGang(p, i + '\nconst raekker = [];\nawait admin.from("advisor_notifications").insert(raekker);\n')).toBe(false);
  });
  it("7. passet FØR fremmødet (rækkefølgen byttet), passet rører `r`, Lovables mail-API mod seeren, eller `email` ikke i body'en", () => {
    const c = laes(CRON), i = laes(IO);
    // Fund 9: byt rækkefølgen — svarpasset flyttes op foran fremmødet.
    const startPas = c.indexOf("  // 5. SVAR PÅ MAIL — ISOLERET");
    const slutPas = c.indexOf("  if (r === null) return json(");
    const startKoer = c.indexOf("  let r: MotorResultat | null = null;");
    expect(startPas > startKoer && slutPas > startPas).toBe(true);
    const pasBlok = c.slice(startPas, slutPas);
    const byttet = c.slice(0, startKoer) + pasBlok + c.slice(startKoer, startPas) + c.slice(slutPas);
    expect(byttet).not.toBe(c);
    expect(cronenErIsoleret(byttet, i)).toBe(false);
    expect(cronenErIsoleret(c.replace("  await alarmerSvarMail(admin, svarMail, new Date());", "  await alarmerSvarMail(admin, svarMail, new Date());\n  if (r) r.fejl.push(...svarMail.fejl);"), i)).toBe(false);
    expect(cronenErIsoleret(c.replace('"nu", "email"] as const;', '"nu"] as const;'), i)).toBe(false);
    expect(cronenErIsoleret(c, i.replace("const spor = await sendMailgun(", "await sendManagedEmail({ adminClient: admin, to: email }); const spor = await sendMailgun("))).toBe(false);
    expect(cronenErIsoleret(c, i.replace("if (!skalSvarMailAlarmere(r)) return;", ""))).toBe(false);
  });
  it("8. den faste sætning tilbage, forbeholdet væk, eller leveringen uden «ukendt» fælder", () => {
    const f = laes(FLADE), k = laes(KONSOL), h = laes(HOOK);
    expect(konsolTekstFoelgerLaasen(f.replace("{svarLoefteTekst(svarMailLaas.isError ? null : svarMailLaas.data ?? null)}", "Svaret vises for seeren ved næste puls, hvis seeren stadig er i rummet — der sendes intet på mail."), k, h)).toBe(false);
    expect(konsolTekstFoelgerLaasen(f, k.replace("hvis seeren kan modtage mail", "altid"), h)).toBe(false);
    expect(konsolTekstFoelgerLaasen(f, k.replace('s.mail_udfald === "ukendt"', "false"), h)).toBe(false);
    expect(konsolTekstFoelgerLaasen(f, k, h.replace("leveret_at, mail_udfald, tilmelding", "leveret_at, tilmelding"))).toBe(false);
  });
  it("9. budgettet tjekket efter læsningerne, eller slet ikke, fælder", () => {
    const i = laes(IO), d = laes(DOM);
    const tjek = "  if (!svarPassetMaaBegynde(forloebet)) { r.sprunget_over_af_budget = true; return r; }\n";
    expect(i).toContain(tjek);
    expect(budgettetFoerst(i.replace(tjek, ""), d)).toBe(false);
    expect(budgettetFoerst(i.replace(tjek, '  await admin.from("webinar_spoergsmaal").select("id");\n' + tjek), d)).toBe(false);
  });
  it("10. morgenmailen uden sessionsdommen, fail-closed ved læsefejl, eller markeringen uden port, fælder", () => {
    const m = laes(KLOKKE_MAIL), c = laes(KLOKKE_CRON), h = laes(KLOKKE_HOOK), f = laes(FLADE);
    expect(stoejenErVaek(m, c.replace("const f = fordel(webinarDom.raekker, a.nu);", "const f = fordel(raekker, a.nu);"), h, f)).toBe(false);
    expect(stoejenErVaek(m.replace("if (sessionerMedUbesvarede === null) return { raekker: [...raekker], sprunget: 0 };", "if (sessionerMedUbesvarede === null) return { raekker: [], sprunget: raekker.length };"), c, h, f)).toBe(false);
    // Rådets LAV 3/10: cronens læsefejl gjort fail-closed (et tomt sæt) skal fælde.
    const failClosed = c.replace("if (error) medUbesvarede = null;", "if (error) medUbesvarede = new Set();");
    expect(failClosed).not.toBe(c);
    expect(stoejenErVaek(m, failClosed, h, f)).toBe(false);
    expect(stoejenErVaek(m, c, h.replace("if (!laeseMarkeringTilladt || !user || !sessionId) return;", "if (!user || !sessionId) return;"), f)).toBe(false);
    expect(stoejenErVaek(m, c, h, f.replace("useMarkerKonsolKlokkeLaest(sessionId, koe.dataUpdatedAt);", ""))).toBe(false);
  });
  it("11. uden loftet, eller rækken taget uden nøgle, fælder", () => {
    const d = laes(DOM), i = laes(IO);
    expect(afvisningerHarLoft(d.replace('  if (k.afvisningerFoer >= SVAR_MAIL_MAKS_AFVISNINGER) return { send: false, grund: "opgivet" };\n', ""), i)).toBe(false);
    expect(afvisningerHarLoft(d.replace("export const SVAR_MAIL_MAKS_AFVISNINGER = 6;", "export const SVAR_MAIL_MAKS_AFVISNINGER = 60;"), i)).toBe(false);
    const noegle = '  if (!(a.mailgunNoegle ?? "").trim()) { r.fejl.push("MAILGUN_SENDING_KEY mangler — intet taget, intet sendt"); r.udsat += skal.length; return; }\n';
    expect(i).toContain(noegle);
    expect(afvisningerHarLoft(d, i.replace(noegle, ""))).toBe(false);
  });
});
