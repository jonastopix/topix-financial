import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { klassificer, MORGEN_TYPER } from "../../../supabase/functions/_shared/klokkeMail.ts";
import { KLOKKE_REFERENCE, KLOKKE_TYPE, OPBEVARING_DAGE, SAMTYKKE_ORDLYD } from "@/lib/opkald/dom";
import { raadgiverSti } from "@/lib/hjemmebane/klokke";
import { readdirSync } from "node:fs";

/**
 * Kildeværn for «Må vi ringe til dig?» (2/10-2026, docs/samtykke-og-opkald.md del 2;
 * Jonas' fem svar 2/10 kl. 07:38–07:39). Hver dom bevist nedenfor på en kopi med
 * fejlen indsat, hvor det kan gøres billigt.
 *
 *   1. KUN DELTAGERE (Jonas: «Kun dem, der deltog i webinaret — ja»): ring-mig-op
 *      læser tokenet (laesRingToken) FØR createClient, slår tilmeldingen op og dømmer
 *      harDeltaget(doemSetGrad(…)) FØR enhver skrivning til opkaldsanmodninger; ukendt
 *      token og «deltog ikke» giver samme svar (403 «ukendt»). Tokenet udstedes
 *      KUN for en «deltog»-overgang (webinarHaendelser: ring_op_url nulstilles ellers —
 *      både som hændelsesegenskab og som PROFILEGENSKAB, Jonas 08:17; webhooken regner
 *      det kun for overgang === "deltog", og importen giver det samme link videre).
 *   2. NUMMERET ALDRIG TIL KLAVIYO (Jonas: «… uden nummer — ja»): sendHvisMail-kaldets
 *      argument nævner hverken telefon eller navn og sætter ingen profilegenskaber;
 *      egenskaberne er tilmeldingens id'er.
 *      Og aldrig i klokken: skrivRaadgiverBesked-kaldet nævner ikke telefon.
 *   3. KLOKKEN ER MORGEN OG GÅR TIL ALLE RÅDGIVERE (Jonas: «Besked i morgenmailen, ikke
 *      straks — ja» · «Både Morten og Jonas får klokken — ja»): typen står på MORGEN_TYPER
 *      (klassificer → «morgen»), functionen skriver den med literal type gennem
 *      skrivRaadgiverBesked (én række pr. rådgiver, user_roles advisor/admin), og
 *      klokke-mail-cron udelader tjenestekonti fra mailen (udenTjenestekonti). Klikket
 *      fører til /opkald (klokke.ts). ALDRIG sendManagedEmail i ring-mig-op (ingen straks-mail).
 *   4. 90 DAGE (Jonas: «Slet nummeret efter 90 dage — ja»): OPBEVARING_DAGE = 90, cron-jobbet
 *      i migrationen sletter på samtykke_at < now() − 90 days, og slottet 05:33 rører ingen
 *      time-plan og ikke minut 52 (webinarDeling.guard dom 10).
 *   5. TOMT KRYDS SOM STANDARD: RingMigOp.tsx starter kryds som useState(false), binder
 *      checked={kryds} og bruger aldrig defaultChecked; ordlyden ved krydset er
 *      SAMTYKKE_ORDLYD (ikke en tekst skrevet i fladen).
 *   6. ORDLYDEN GEMMES ORDRET: doemAnmodning afviser en anden ordlyd; functionen skriver
 *      samtykke_ordlyd: anm.ordlyd; CHECK'en på kolonnen findes.
 *   8. RÅDETS FUND 2/10 — INDSEND (punkt 1 og 3): indsendVej dømmes FØR loftet og enhver
 *      skrivning; «for_snart» (10 min, sidst_indsendt_at i rækken) og «aaben» returnerer FØR
 *      skrivRaadgiverBesked/sendHvisMail; en åben række overskrives aldrig (kun stemplet);
 *      genåbningen er guardet på ringet_at IS NOT NULL og det læste stempel og skifter
 *      runde_id; klokkens reference_id og Klaviyos unikke id er runde_id.
 *   9. RÅDETS FUND 2/10 — RLS (punkt 4 og 5): SELECT- og UPDATE-politikken udelukker
 *      tjenestekonti; fortrydelsen er bevidst åben for enhver rådgiver og bogført i
 *      migrationen (triggeren kræver ikke OLD.ringet_af = auth.uid()).
 *  10. RÅDETS FUND 2/10 — IP-HASH (punkt 6): ring-mig-op's ipDagshash er ordret
 *      ansoegning-gem's (husets ene måde), og svagheden står i filhovedet.
 *   7. HUSETS REGLER: config.toml verify_jwt = false med begrundelse; laesRingToken er
 *      registreret som prædikat i CI-værnet; STRIKS body (ukendteFelter); migrationens
 *      første linje er «IKKE KØRT»; anon har intet, authenticated kun SELECT/UPDATE, og
 *      triggeren afgrænser rådgiverens UPDATE til ringet_at/ringet_af.
 */

const ROD = process.cwd();

/** Minutterne i et cron-udtryks første felt (samme regnestykke som webinarDeling.guard.minutterI). */
function minutterI(udtryk: string): number[] {
  const felt = udtryk.trim().split(/\s+/)[0];
  const ud = new Set<number>();
  for (const del of felt.split(",")) {
    const m = del.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`minutterI: ukendt form «${del}»`);
    const [, basis, trin] = m;
    let fra = 0, til = 59;
    if (basis !== "*") { const [a, b] = basis.split("-").map(Number); fra = a; til = b ?? (trin ? 59 : a); }
    const step = trin ? Number(trin) : 1;
    for (let i = fra; i <= til; i += step) ud.add(i);
  }
  return [...ud].sort((a, b) => a - b);
}
/** Alle cron.schedule i migrationsmappen (uden SQL-kommentarer). */
function cronUdtryk(dir: string): { fil: string; job: string; udtryk: string }[] {
  const ud: { fil: string; job: string; udtryk: string }[] = [];
  for (const fil of readdirSync(resolve(process.cwd(), dir)).filter((f) => f.endsWith(".sql")).sort()) {
    const t = readFileSync(resolve(process.cwd(), dir, fil), "utf8").split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    for (const m of t.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi)) ud.push({ fil, job: m[1], udtryk: m[2] });
  }
  return ud;
}
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/ [^\n]*/g, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };
/** Argumentet til et kald: teksten fra kaldet og et stykke frem. */
const argumentTil = (k: string, kald: string, laengde = 700) => { const i = k.indexOf(kald); return i === -1 ? "" : k.slice(i, i + laengde); };

const FUNKTION = "supabase/functions/ring-mig-op/index.ts";
const HAENDELSER = "supabase/functions/_shared/webinarHaendelser.ts";
const WEBHOOK = "supabase/functions/ewebinar-webhook/index.ts";
const IMPORT = "supabase/functions/ewebinar-import/index.ts";
const KLOKKE_CRON = "supabase/functions/klokke-mail-cron/index.ts";
const DOM = "supabase/functions/_shared/opkaldDom.ts";
const MIGRATION = "supabase/migrations/20261002270000_opkaldsanmodninger.sql";
const CONFIG = "supabase/config.toml";
const CI = "scripts/check-edge-function-auth.ts";
const SIDE = "src/pages/RingMigOp.tsx";
const MIG_DIR = "supabase/migrations";

// ── 1 ──
export const kunDeltagere = (fn: string, haendelser: string, webhook: string, imp: string = laes(IMPORT)): boolean => {
  const k = udenKommentarer(fn), h = udenKommentarer(haendelser), w = udenKommentarer(webhook), im = udenKommentarer(imp);
  return (
    foer(k, "await laesRingToken(", "createClient(") &&
    foer(k, "createClient(", 'from("webinar_tilmeldinger")') &&
    foer(k, "harDeltaget(grad)", ".insert(") &&
    !k.includes(".upsert(") &&
    k.includes("if (!tilmelding || !harDeltaget(grad) || tokenUdloebet(tilmelding.session_tid, nu)) {") &&
    (k.match(/json\(403, \{ error: "ukendt" \}\)/g) ?? []).length === 2 &&
    h.includes('ring_op_url: o === "deltog" ? (i.ringOpUrl ?? null) : null,') &&
    // Profilegenskaben (Jonas 08:17) bag SAMME dom — aldrig for «mødte ikke op».
    h.includes('profilEgenskaber: { ring_op_url: o === "deltog" ? (i.ringOpUrl ?? null) : null },') &&
    // Importen bærer samme link (ellers kasseres webhookens senere hændelse som dublet uden link).
    im.includes("doemFremmoedeForImport(foer, flettet, nu, ringOpUrl)") &&
    w.includes('const ringOpUrl = overgang === "deltog"') &&
    foer(w, "const ringOpUrl = overgang", "byggFremmoede(overgang, {")
  );
};

// ── 2 ──
export const nummeretAldrigUd = (fn: string): boolean => {
  const k = udenKommentarer(fn);
  const klaviyo = argumentTil(k, "await sendHvisMail(admin, {");
  const klokke = argumentTil(k, "await skrivRaadgiverBesked(admin, {", 400);
  return (
    klaviyo !== "" && !/telefon|anm\.navn|\.navn\b/.test(klaviyo) &&
    klaviyo.includes("metric: HAENDELSE.badOmOpkald") &&
    // «Bad om opkald» skriver INTET på profilen (heller ikke nummeret som profilegenskab).
    !klaviyo.includes("profilEgenskaber") &&
    klokke !== "" && !/telefon/.test(klokke) &&
    klokke.includes("title: klokkeTitel(anm.navn, tilmelding.session_tid)") &&
    !/telefon/.test(argumentTil(k, "return json(200, {", 300)) &&
    !k.includes("sendManagedEmail(")
  );
};

// ── 3 ──
export const klokkenErMorgen = (fn: string, cron: string): boolean => {
  const k = udenKommentarer(fn), c = udenKommentarer(cron);
  const klokke = argumentTil(k, "await skrivRaadgiverBesked(admin, {", 400);
  return (
    klassificer(KLOKKE_TYPE) === "morgen" &&
    (MORGEN_TYPES_HAR(KLOKKE_TYPE)) &&
    klokke.includes(`type: "${KLOKKE_TYPE}"`) &&
    klokke.includes(`reference_type: KLOKKE_REFERENCE`) &&
    raadgiverSti({ type: KLOKKE_TYPE, reference_type: KLOKKE_REFERENCE, reference_id: "x", company_id: null }) === "/opkald" &&
    c.includes("udenTjenestekonti(")
  );
};
const MORGEN_TYPES_HAR = (t: string) => (MORGEN_TYPER as readonly string[]).includes(t);

// ── 4 ──
export const niTiDage = (mig: string, dom: string): boolean => {
  const m = udenSql(mig), d = udenKommentarer(dom);
  const job = m.match(/\$job\$([\s\S]*?)\$job\$/)?.[1] ?? "";
  return (
    OPBEVARING_DAGE === 90 &&
    d.includes("export const OPBEVARING_DAGE = 90;") &&
    m.includes("'opkald-opbevaring'") &&
    m.includes("'33 5 * * *'") &&
    /DELETE FROM public\.opkaldsanmodninger\s+WHERE samtykke_at < now\(\) - interval '90 days'/.test(job) &&
    !/UPDATE/i.test(job)
  );
};

// ── 5 ──
export const tomtKryds = (side: string): boolean => {
  const s = udenKommentarer(side);
  return (
    s.includes("const [kryds, setKryds] = useState(false);") &&
    s.includes("checked={kryds}") &&
    !s.includes("defaultChecked") &&
    s.includes("<span>{SAMTYKKE_ORDLYD}</span>") &&
    s.includes("samtykke: { kryds, ordlyd: SAMTYKKE_ORDLYD }")
  );
};

// ── 6 ──
export const ordlydenGemmes = (fn: string, dom: string, mig: string): boolean => {
  const k = udenKommentarer(fn), d = udenKommentarer(dom), m = udenSql(mig);
  return (
    d.includes('if (ordlyd !== SAMTYKKE_ORDLYD) return { ok: false, grund: "ordlyd" };') &&
    k.includes("samtykke_ordlyd: anm.ordlyd,") &&
    k.includes("telefon: anm.telefon,") &&
    m.includes("samtykke_ordlyd  text not null") &&
    m.includes("constraint opkaldsanmodninger_telefon_form check (telefon ~ '^\\+45[2-9][0-9]{7}$')")
  );
};

// ── 7 ──
export const husetsRegler = (fn: string, config: string, ci: string, mig: string): boolean => {
  const k = udenKommentarer(fn), m = udenSql(mig);
  const blok = config.slice(config.indexOf("[functions.ring-mig-op]"), config.indexOf("[functions.ring-mig-op]") + 80);
  const begrundelse = config.slice(config.indexOf("[functions.ring-mig-op]") - 900, config.indexOf("[functions.ring-mig-op]"));
  return (
    blok.includes("verify_jwt = false") &&
    begrundelse.includes("laesRingToken") &&
    ci.includes('{ name: "laesRingToken()",') &&
    k.includes("ukendteFelter(body, KENDTE_FELTER)") && k.includes("ukendteFelterBesked(") &&
    laes(MIGRATION).startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).") &&
    m.includes("revoke all on public.opkaldsanmodninger from anon;") &&
    m.includes("grant select, update on public.opkaldsanmodninger to authenticated;") &&
    !/grant[^;]*(insert|delete)[^;]*to authenticated/i.test(m) &&
    m.includes("tilladte constant text[] := array['ringet_at', 'ringet_af'];") &&
    m.includes("create trigger opkald_raadgiver_kolonnevaern") &&
    m.includes("on delete cascade")
  );
};

// ── 8 ──
export const indsendDom = (fn: string): boolean => {
  const k = udenKommentarer(fn);
  const aaben = k.slice(k.indexOf('if (vej === "aaben" && findes) {'), k.indexOf("const ipHash = await ipDagshash(req);"));
  return (
    foer(k, "const vej = indsendVej(findes, nu);", 'if (vej === "for_snart") {') &&
    foer(k, 'if (vej === "for_snart") {', 'if (vej === "aaben" && findes) {') &&
    foer(k, 'if (vej === "aaben" && findes) {', "loftetNaaet(") &&
    foer(k, "loftetNaaet(", ".insert(") &&
    foer(k, ".insert(", "await skrivRaadgiverBesked(") &&
    // Den åbne: KUN stemplet, aldrig navn/telefon/samtykke, og 409 — intet sendes.
    aaben.includes(".update({ sidst_indsendt_at: nu.toISOString() })") &&
    aaben.includes('.is("ringet_at", null)') &&
    aaben.includes('return json(409, { error: "allerede_anmodet", grund: "allerede_anmodet" });') &&
    !/telefon|samtykke_ordlyd|navn:/.test(aaben) &&
    // Genåbningen: kun en lukket, compare-and-swap på stemplet, ny runde.
    k.includes('.update({ ...felter, ringet_at: null, ringet_af: null, runde_id: crypto.randomUUID() })') &&
    k.includes('.not("ringet_at", "is", null)') &&
    (k.match(/\.eq\("sidst_indsendt_at", findes\.sidst_indsendt_at\)/g) ?? []).length === 2 &&
    k.includes("reference_id: rundeId,") &&
    k.includes("uniktId: rundeId,") &&
    !k.includes("reference_id: anmodningId")
  );
};

// ── 9 ──
export const rlsFund = (mig: string): boolean => {
  const m = udenSql(mig);
  const select = m.slice(m.indexOf('create policy "Advisors can view opkaldsanmodninger"'), m.indexOf('drop policy if exists "Advisors can mark'));
  const update = m.slice(m.indexOf('create policy "Advisors can mark opkaldsanmodninger ringet"'), m.indexOf('drop policy if exists "Service role'));
  const tk = "not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())";
  return (
    select.includes(tk) &&
    (update.match(/not exists \(select 1 from public\.tjenestekonti tk where tk\.user_id = auth\.uid\(\)\)/g) ?? []).length === 2 &&
    mig.includes("FORTRYD «RINGET» — BEVIDST: enhver rådgiver kan fortryde") &&
    !/old\.ringet_af/i.test(m) &&
    m.includes("sidst_indsendt_at timestamptz not null default now(),") &&
    m.includes("runde_id         uuid not null default gen_random_uuid(),")
  );
};

// ── 10 ──
export const ipHashSomHuset = (fn: string, gem: string): boolean => {
  const krop = (k: string) => {
    const i = k.indexOf("async function ipDagshash(req: Request): Promise<string> {");
    return i === -1 ? "" : k.slice(i, k.indexOf("\n}\n", i) + 3).replace(/\s+/g, " ");
  };
  const a = krop(udenKommentarer(fn)), b = krop(udenKommentarer(gem));
  return a !== "" && a === b && fn.includes("SVAGHEDEN, BOGFØRT") && fn.includes("2^32");
};

describe("ringMigOp.guard — «Må vi ringe til dig?»", () => {
  const fn = laes(FUNKTION);
  it("1. kun deltagere: token før service role, harDeltaget før skrivning, ét svar, token kun for «deltog»", () => {
    expect(kunDeltagere(fn, laes(HAENDELSER), laes(WEBHOOK))).toBe(true);
    expect(kunDeltagere(fn.replace("if (!tilmelding || !harDeltaget(grad) || tokenUdloebet(tilmelding.session_tid, nu)) {", "if (!tilmelding || tokenUdloebet(tilmelding.session_tid, nu)) {"), laes(HAENDELSER), laes(WEBHOOK))).toBe(false);
    // Rådets fund 2: et udløbet link får samme 403 — fjernes udløbet, fælder dommen.
    expect(kunDeltagere(fn.replace("if (!tilmelding || !harDeltaget(grad) || tokenUdloebet(tilmelding.session_tid, nu)) {", "if (!tilmelding || !harDeltaget(grad)) {"), laes(HAENDELSER), laes(WEBHOOK))).toBe(false);
    expect(kunDeltagere(fn, laes(HAENDELSER).replace('o === "deltog" ? (i.ringOpUrl ?? null) : null', "i.ringOpUrl ?? null"), laes(WEBHOOK))).toBe(false);
    expect(kunDeltagere(fn, laes(HAENDELSER).replace('profilEgenskaber: { ring_op_url: o === "deltog" ? (i.ringOpUrl ?? null) : null },', "profilEgenskaber: { ring_op_url: i.ringOpUrl ?? null },"), laes(WEBHOOK))).toBe(false);
    expect(kunDeltagere(fn, laes(HAENDELSER), laes(WEBHOOK), laes(IMPORT).replace("doemFremmoedeForImport(foer, flettet, nu, ringOpUrl)", "doemFremmoedeForImport(foer, flettet, nu)"))).toBe(false);
  });
  it("2. nummeret går aldrig til Klaviyo, klokken eller svaret — og ingen straks-mail", () => {
    expect(nummeretAldrigUd(fn)).toBe(true);
    expect(nummeretAldrigUd(fn.replace("egenskaber: { ewebinar_id: tilmelding.ewebinar_id,", "egenskaber: { telefon: anm.telefon, ewebinar_id: tilmelding.ewebinar_id,"))).toBe(false);
    expect(nummeretAldrigUd(fn.replace("body: KLOKKE_BODY,", "body: anm.telefon,"))).toBe(false);
    expect(nummeretAldrigUd(fn.replace("metric: HAENDELSE.badOmOpkald,", "metric: HAENDELSE.badOmOpkald, profilEgenskaber: { x: 1 },"))).toBe(false);
  });
  it("3. klokken er MORGEN, skrives til alle rådgivere, mailen udelader tjenestekonti, klikket fører til /opkald", () => {
    expect(klokkenErMorgen(fn, laes(KLOKKE_CRON))).toBe(true);
    expect(klokkenErMorgen(fn.replace('type: "opkald_anmodet"', 'type: "drift"'), laes(KLOKKE_CRON))).toBe(false);
    expect(klassificer("opkald_anmodet")).toBe("morgen");
  });
  it("4. 90 dage: konstanten, cron-jobbets DELETE, og slottet 05:33 uden kollision", () => {
    expect(niTiDage(laes(MIGRATION), laes(DOM))).toBe(true);
    expect(niTiDage(laes(MIGRATION).split("interval '90 days'").join("interval '180 days'"), laes(DOM))).toBe(false);
    const planer = cronUdtryk(MIG_DIR);
    expect(planer.some((p) => p.job === "opkald-opbevaring" && p.udtryk === "33 5 * * *")).toBe(true);
    // Ingen time-plan (fem felter med * i time-feltet) rammer minut 33, og ingen anden plan står på 05:33.
    const timePlaner = planer.filter((p) => p.udtryk.trim().split(/\s+/)[1] === "*");
    expect(timePlaner.filter((p) => minutterI(p.udtryk).includes(33)).map((p) => p.job)).toEqual([]);
    expect(planer.filter((p) => p.job !== "opkald-opbevaring" && p.udtryk.trim().split(/\s+/)[1] === "5" && minutterI(p.udtryk).includes(33))).toEqual([]);
    expect(planer.some((p) => p.job === "opkald-opbevaring" && minutterI(p.udtryk).includes(52))).toBe(false);
  });
  it("5. krydset er tomt som standard, og ordlyden ved det er SAMTYKKE_ORDLYD", () => {
    expect(tomtKryds(laes(SIDE))).toBe(true);
    expect(tomtKryds(laes(SIDE).replace("useState(false)", "useState(true)"))).toBe(false);
    expect(SAMTYKKE_ORDLYD).toBe("Ja, Morten eller Jonas må ringe til mig om The Boardroom");
  });
  it("6. ordlyden gemmes ordret, nummeret i E.164 med CHECK", () => {
    expect(ordlydenGemmes(fn, laes(DOM), laes(MIGRATION))).toBe(true);
    expect(ordlydenGemmes(fn.replace("samtykke_ordlyd: anm.ordlyd,", "samtykke_ordlyd: SAMTYKKE_ORDLYD,"), laes(DOM), laes(MIGRATION))).toBe(false);
  });
  it("8. indsend: for_snart og den åbne anmodning før enhver skrivning; genåbning kun af en lukket, ny runde", () => {
    expect(indsendDom(fn)).toBe(true);
    expect(indsendDom(fn.replace('.update({ sidst_indsendt_at: nu.toISOString() })', '.update({ sidst_indsendt_at: nu.toISOString(), telefon: anm.telefon })'))).toBe(false);
    expect(indsendDom(fn.replace('.not("ringet_at", "is", null)', '.is("ringet_at", null)'))).toBe(false);
    expect(indsendDom(fn.replace("reference_id: rundeId,", "reference_id: raekke.id,"))).toBe(false);
    expect(indsendDom(fn.replace("uniktId: rundeId,", "uniktId: raekke.id,"))).toBe(false);
  });
  it("9. RLS: tjenestekonti ude af SELECT og UPDATE; fortrydelsen bevidst åben og bogført", () => {
    expect(rlsFund(laes(MIGRATION))).toBe(true);
    expect(rlsFund(laes(MIGRATION).replace("    and not exists (select 1 from public.tjenestekonti tk where tk.user_id = auth.uid())\n  );\n\n-- UPDATE", "  );\n\n-- UPDATE"))).toBe(false);
  });
  it("10. IP-hashen er husets (ansoegning-gem) og svagheden står i filhovedet", () => {
    const gem = laes("supabase/functions/ansoegning-gem/index.ts");
    expect(ipHashSomHuset(fn, gem)).toBe(true);
    expect(ipHashSomHuset(fn.replace("const dag = new Date().toISOString().slice(0, 10);", "const dag = 'x';"), gem)).toBe(false);
  });
  it("7. husets regler: verify_jwt = false med begrundelse, CI-prædikat, STRIKS body, IKKE KØRT, RLS og kolonneværn", () => {
    expect(husetsRegler(fn, laes(CONFIG), laes(CI), laes(MIGRATION))).toBe(true);
    expect(husetsRegler(fn, laes(CONFIG), laes(CI).replace('{ name: "laesRingToken()",', '{ name: "x()",'), laes(MIGRATION))).toBe(false);
    expect(husetsRegler(fn, laes(CONFIG), laes(CI), laes(MIGRATION).replace("grant select, update on", "grant select, insert, update on"))).toBe(false);
  });
});
