import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for VENTELISTEN (udkast 18/9-2026). Kildelæsning med selvbevis på
// kopier (dineMaal.guard-mønstret). Det der låses:
//   1. MIGRATIONEN: egen tabel (ikke et nyt trin), CHECK på status og tilbud,
//      ét tilbud pr. virksomhed, trappen «venteplads» og handlingen
//      «venteplads_udloeb» i A's kø, ingen SECURITY DEFINER, ingen anon,
//      ansoegninger_trin_check urørt (A's guard læser 200000-filen).
//   2. INGEN MAIL AF SIG SELV: det eneste sted et menneske starter køen er
//      venteliste-handling «tilbyd» (Bucket A, has_role FØR service role);
//      cronen og linket kalder kun videre-i-køen (pladsUdloebet / svarPaaPlads).
//   3. KØEN GÅR SELV VIDERE: cronen har grenen venteplads_udloeb → pladsUdloebet,
//      og annullerer trappen når intet tilbud er ude; svarPaaPlads: nej →
//      tilbydPladsen(næste), ja → genaabn i A's motor + trukket i alle andre køer.
//   4. RÆKKEFØLGEN er anciennitet (ansoegninger.lukket_at) — sorterKoe.
//   5. DEN BLØDE UDGAVE: mailbyggeren forgrener på venteplads.bloed, og cronen
//      regner bloed af a.lukket_at med erBloedUdgave.
//   6. FORSIDEN: dommen viser kun ledige pladser (erPladsLedig), datalaget
//      giver { betaltIkkeOprettet, venteliste }, fladen har grenen.
//   7. Linket (ansøgeren) svarer FØR erAabentTrin-tjekket (ansøgningen er lukket).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");
const udenSql = (k: string) => k.replace(/^\s*--[^\n]*/gm, "");

const MIGRATION = "supabase/migrations/20260918240000_venteliste.sql";
const IO = "supabase/functions/_shared/venteliste.ts";
const HANDLING = "supabase/functions/venteliste-handling/index.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const LINK = "supabase/functions/ansoegning-link/index.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";
const DOM = "src/lib/forsidensDom.ts";
const DASH = "src/components/AdvisorDashboard.tsx";
const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";

const sql = udenSql(laes(MIGRATION));
const io = udenKommentarer(laes(IO));
const handling = udenKommentarer(laes(HANDLING));
const cron = udenKommentarer(laes(CRON));
const link = udenKommentarer(laes(LINK));
const mails = udenKommentarer(laes(MAILS));
const dom = udenKommentarer(laes(DOM));
const dash = udenKommentarer(laes(DASH));
const flade = udenKommentarer(laes(FLADE));

/** 1: migrationen. */
export function migrationDom(k: string): string[] {
  const f: string[] = [];
  if (!k.includes("create table if not exists public.ventepladser")) f.push("tabellen mangler");
  if (!/status in \('venter', 'tilbudt', 'accepteret', 'udloebet', 'afslaaet', 'trukket'\)/.test(k)) f.push("status-CHECK");
  if (!k.includes("ventepladser_et_tilbud_pr_virksomhed")) f.push("ét tilbud pr. virksomhed mangler");
  if (!/trappe in \('kladde', 'indkaldt', 'booket', 'aftalegrundlag', 'pause', 'venteplads'\)/.test(k)) f.push("trappen venteplads mangler i CHECK");
  if (!/'pause_slut', 'venteplads_udloeb'\)/.test(k)) f.push("handlingen venteplads_udloeb mangler i CHECK");
  if (/security definer/i.test(k)) f.push("SECURITY DEFINER");
  if (/to anon/i.test(k)) f.push("anon-grant");
  if (/ansoegninger_trin_check|alter table public\.ansoegninger/i.test(k)) f.push("rører ansoegninger");
  return f;
}

/** 2: ingen mail af sig selv — «tilbyd» er rådgiverens, bag Bucket A. */
export function menneskeDom(handlingK: string, cronK: string, linkK: string): string[] {
  const f: string[] = [];
  const auth = handlingK.indexOf("authenticateUser(");
  const rolle = handlingK.indexOf('_role: "advisor"');
  const client = handlingK.indexOf("createClient(");
  if (auth < 0 || rolle < 0 || client < 0 || !(auth < rolle && rolle < client)) f.push("handling: auth → has_role → createClient holder ikke");
  if (!handlingK.includes("await tilbydPladsen(admin, companyId, nu, 1)")) f.push("handling: tilbyd kalder ikke tilbydPladsen som første tilbud");
  if (/tilbydPladsen\(/.test(cronK)) f.push("cronen starter selv et tilbud");
  if (/tilbydPladsen\(/.test(linkK)) f.push("linket starter selv et tilbud");
  return f;
}

/** 3: køen går selv videre. */
export function koenDom(ioK: string, cronK: string): string[] {
  const f: string[] = [];
  if (!/if \(raekke\.handling === "venteplads_udloeb"\) \{[\s\S]{0,400}await pladsUdloebet\(admin, a\.id, nu\)/.test(cronK)) f.push("cron: venteplads_udloeb kalder ikke pladsUdloebet");
  if (!/raekke\.trappe === "venteplads"\s*\?\s*\(!a \|\| !venteplads\)/.test(cronK)) f.push("cron: venteplads-trappen annulleres ikke uden tilbud ude");
  const udl = ioK.slice(ioK.indexOf("export async function pladsUdloebet("));
  if (!/status: "udloebet"[\s\S]{0,300}\.eq\("status", "tilbudt"\)[\s\S]{0,400}await tilbydPladsen\(admin, tilbudt\.company_id, nu, tilbudt\.tilbud_nr \+ 1\)/.test(udl)) f.push("pladsUdloebet: udløb → næste holder ikke");
  const svar = ioK.slice(ioK.indexOf("export async function svarPaaPlads("), ioK.indexOf("export async function pladsUdloebet("));
  if (!svar.includes("afgoerSvar(pladser, tilbudt.id, udfald)")) f.push("svarPaaPlads dømmer ikke med afgoerSvar");
  if (!/handling: \{ art: "genaabn" \}, via: "ansoeger_link"/.test(svar)) f.push("ja genåbner ikke i A's motor");
  if (!/udfald === "afslaaet"[\s\S]{0,300}await tilbydPladsen\(admin, tilbudt\.company_id, nu, tilbudt\.tilbud_nr \+ 1\)/.test(svar)) f.push("nej går ikke videre til næste");
  if (!svar.includes('annullerTrapper(admin, ansoegningId, ["venteplads"]')) f.push("svar annullerer ikke trappen");
  return f;
}

/** 4+5: anciennitet og den bløde udgave. */
export function reglerDom(ioK: string, cronK: string, mailsK: string): string[] {
  const f: string[] = [];
  const tilbyd = ioK.slice(ioK.indexOf("export async function tilbydPladsen("), ioK.indexOf("export async function svarPaaPlads("));
  if (!tilbyd.includes("const naeste = naesteIKoen(koe);")) f.push("tilbydPladsen tager ikke den første efter anciennitet");
  if (!tilbyd.includes("if (harTilbudUde(koe)) return { udfald: \"tilbud_ude\" };")) f.push("tilbydPladsen tillader to tilbud ude");
  if (!tilbyd.includes('trappe: "venteplads", anker: nu')) f.push("trappen planlægges ikke med ankeret = nu");
  if (!cronK.includes("bloed: erBloedUdgave(a.lukket_at, nu),")) f.push("cronen regner ikke den bløde udgave af lukket_at");
  const tilbud = mailsK.slice(mailsK.indexOf('"ansoegning-venteplads-tilbud": (k) => {'), mailsK.indexOf('"ansoegning-venteplads-rykker": (k) => {'));
  if (!tilbud.includes("if (v?.bloed) {") || !tilbud.includes("er det stadig aktuelt?")) f.push("mailen har ikke den bløde udgave");
  if (/ikkeNu: true/.test(tilbud)) f.push("venteplads-mailen bærer «ikke nu»");
  return f;
}

/** 6: forsiden. */
export function forsideDom(domK: string, dashK: string, fladeK: string): string[] {
  const f: string[] = [];
  if (!domK.includes('| "venteliste";') || !domK.includes('venteliste: "haendelse",') || !domK.includes("venteliste: 1,")) f.push("slags/FORM/INDSATS mangler");
  if (!domK.includes("export const ALVOR_VENTELISTE = 80;")) f.push("alvor");
  if (!domK.includes("if (!grund || erLukket(grund, v.kvittering)) continue;")) f.push("lukningen mangler");
  if (!domK.includes("grundlag: `venteliste:${v.naeste.ansoegningId}`,")) f.push("grundlaget bærer ikke den første i køen");
  if (!domK.includes("...ventelister,")) f.push("linjerne splejses ikke ind");
  if (!dashK.includes("if (!erPladsLedig(tilstand.status)) continue;")) f.push("datalaget viser ikke-ledige pladser");
  if (!dashK.includes("afgoerForsidensDom(virksomhederTilDom, now, { betaltIkkeOprettet, ansoegninger: ansoegningerTilForside, venteliste })")) f.push("datalaget giver ikke ventelisten til dommen");
  if (!fladeK.includes('if (l.linje === "venteliste") {') || !fladeK.includes("data-venteliste={l.antal}")) f.push("fladen mangler grenen");
  return f;
}

/** 7: linket svarer før åbent-trin-tjekket. */
export function linkDom(k: string): string | null {
  const svar = k.indexOf('if (handling === "tag_pladsen" || handling === "afslaa_pladsen") {');
  const aabent = k.indexOf("if (!erAabentTrin(a.trin)) return json(");
  const verify = k.indexOf("await verifyAnsoegningslink(token, admin)");
  if (svar < 0) return "grenen mangler";
  if (!(verify < svar && svar < aabent)) return "svaret står ikke mellem prædikatet og åbent-trin-tjekket";
  if (!k.includes('handling === "tag_pladsen" ? "accepteret" : "afslaaet"')) return "ja/nej oversættes ikke";
  return null;
}

describe("venteliste.guard — de syv domme", () => {
  it("1. migrationen", () => expect(migrationDom(sql)).toEqual([]));
  it("2. ingen mail af sig selv — «tilbyd» er rådgiverens, bag Bucket A", () => expect(menneskeDom(handling, cron, link)).toEqual([]));
  it("3. køen går selv videre: udløb og nej → næste; ja → genåbn + ude af alle køer", () => expect(koenDom(io, cron)).toEqual([]));
  it("4+5. anciennitet, ét tilbud ad gangen, den bløde udgave uden «ikke nu»", () => expect(reglerDom(io, cron, mails)).toEqual([]));
  it("6. forsiden: kun ledige pladser, lukning, datalag og flade", () => expect(forsideDom(dom, dash, flade)).toEqual([]));
  it("7. linket svarer før åbent-trin-tjekket", () => expect(linkDom(link)).toBeNull());
});

describe("venteliste.guard — selvbevis: hvert prædikat fælder en muteret kopi", () => {
  it("1. et nyt trin på ansoegninger, eller en SECURITY DEFINER, falder", () => {
    expect(migrationDom(sql + "\nalter table public.ansoegninger drop constraint ansoegninger_trin_check;")).not.toEqual([]);
    expect(migrationDom(sql + "\ncreate function public.x() returns void language sql security definer as $$ select 1 $$;")).not.toEqual([]);
  });
  it("2. cronen der selv starter et tilbud, eller createClient før rollen, falder", () => {
    expect(menneskeDom(handling, cron + "\nawait tilbydPladsen(admin, x, nu, 1);\n", link)).not.toEqual([]);
    expect(menneskeDom(handling.replace('_role: "advisor"', '_role: "member"'), cron, link)).not.toEqual([]);
  });
  it("3. et nej der ikke går videre, eller et ja uden genåbning, falder", () => {
    expect(koenDom(io.replace('handling: { art: "genaabn" }, via: "ansoeger_link"', 'handling: { art: "genaabn" }, via: "koe"'), cron)).not.toEqual([]);
    expect(koenDom(io, cron.replace("await pladsUdloebet(admin, a.id, nu)", "await Promise.resolve()"))).not.toEqual([]);
  });
  it("4+5. «ikke nu» i venteplads-mailen, eller den bløde udgave fjernet, falder", () => {
    expect(reglerDom(io, cron, mails.replace("if (v?.bloed) {", "if (false) {"))).not.toEqual([]);
    expect(reglerDom(io, cron.replace("bloed: erBloedUdgave(a.lukket_at, nu),", "bloed: false,"), mails)).not.toEqual([]);
  });
  it("6. datalag uden ledig-filteret, eller dom uden lukning, falder", () => {
    expect(forsideDom(dom, dash.replace("if (!erPladsLedig(tilstand.status)) continue;", ""), flade)).not.toEqual([]);
    expect(forsideDom(dom.replace("if (!grund || erLukket(grund, v.kvittering)) continue;", "if (!grund) continue;"), dash, flade)).not.toEqual([]);
  });
  it("7. svaret flyttet under åbent-trin-tjekket falder", () => {
    const flyttet = link.replace('if (handling === "tag_pladsen" || handling === "afslaa_pladsen") {', "if (false) {") + '\nif (handling === "tag_pladsen" || handling === "afslaa_pladsen") {}\n';
    expect(linkDom(flyttet)).not.toBeNull();
  });
});
