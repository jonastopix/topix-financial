import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SORTERINGER, STANDARD_SORTERING } from "@/lib/hjemmebane/branchefilter";

/**
 * Kildeværn for medlemsoverblikket på /virksomheder (29/9-2026). Fire domme,
 * hver bevist på en kopi med fejlen indsat:
 *
 *   1. HOOKEN BRUGER MOTOREN: hooks/medlemsOverblik.ts importerer
 *      sessionStatus, aktiviteterAf og overbliksDom fra lib/medlemsOverblik
 *      og kalder alle tre — og har INGEN egen sessionsregel (ingen
 *      sammenligning mod "booked"/"booking_sent"/"cancelled", ingen egen
 *      30-dages-grænse). Kun motoren dømmer.
 *   2. ALDRIG ET TAVST LOFT: hver kilde i hooken går gennem hentAlleSider
 *      (eller login-løkken, der stopper på brugere, ikke på et tal) med
 *      kraevRaekker pr. side — intet `.limit(` i hooken.
 *   3. FLADEN LÆSER MÆRKERNE GENNEM harMaerke: filtret og chipsene spørger
 *      dommen; fladen regner ingen egen regel (ingen `dom.maerker.includes`),
 *      og sessionsordene kommer fra sessionOrd. «Afholdt» bærer sin title.
 *   4. STANDARDSORTERINGEN ER «OVERBLIK»: første valg i SORTERINGER, og
 *      sorterRaekker kender nøglen.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const HOOK = "src/hooks/medlemsOverblik.ts";
const VIEW = "src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx";
const ORD = "src/lib/hjemmebane/overblikOrd.ts";
const SORT = "src/lib/hjemmebane/branchefilter.ts";
const MOTOR = "src/lib/medlemsOverblik.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
/** Siden 29/9 (statusmailen): hooken HENTER kun og kalder byggOverblik — joinen og dommene bor i motoren. */
export const hookenBrugerMotoren = (hook: string, motor: string): boolean => {
  const h = udenKommentarer(hook), m = udenKommentarer(motor);
  return (
    /import \{[^}]*\bbyggOverblik\b[^}]*\} from "@\/lib\/medlemsOverblik";/.test(h) &&
    h.includes("return byggOverblik({ companies, medlemmer, bookinger, logins, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal }, nu);") &&
    // Ingen join og ingen dom i hooken: hverken motorens tre kald, kort pr. virksomhed eller et univers-filter.
    !/aktiviteterAf\(|sessionStatus\(|overbliksDom\(|new Map<string, string\[\]>|is_legat \|\||erKunde\(/.test(h) &&
    // Ingen egen sessionsregel og ingen egen dagsgrænse i hooken.
    !/=== "(booked|booking_sent|cancelled|pending)"|"booked"|"booking_sent"|"cancelled"|slut_tid <|slut_tid >|\* 86_?400_?000|30 \* /.test(h) &&
    // Motoren gør det: de tre kald i byggOverblik, og universet (inkl. is_demo) ét sted.
    (m.match(/sessionStatus\(\{ raadgiver: "(morten|jonas)"/g) ?? []).length === 2 &&
    m.includes("const aktivitet = aktiviteterAf(input, nu);") &&
    m.includes("const dom = overbliksDom({") &&
    m.includes("if (c.is_demo === true) return false;") &&
    m.includes("if (!iUniverset(c)) continue;") &&
    // is_demo hentes — ellers er filtret tomt for hooken.
    h.includes('select("id, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at")')
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const aldrigEtTavstLoft = (hook: string): boolean => {
  const h = udenKommentarer(hook);
  const kilder = ["companies", "company_members", "session_bookings", "financial_report_facts", "financial_reports", "pulse_checkins", "conversations", "event_registrations", "member_progress", "community_traade", "community_svar", "community_reaktioner", "milestones"];
  return (
    !/\.limit\(/.test(h) &&
    kilder.every((k) => new RegExp(`hentAlleSider<[^>]*>\\(\\(fra, til\\) =>\\s*supabase\\.from\\("${k}"\\)[\\s\\S]{0,400}?\\.range\\(fra, til\\)\\.then\\(side\\("${k}"\\)\\)`).test(h)) &&
    // Logins: nyeste først, og løkken stopper på brugerne (mangler.size), ikke på et tal.
    h.includes('supabase.from("user_login_log").select("user_id, logged_in_at").in("user_id", del)') &&
    h.includes("for (let fra = 0; mangler.size > 0; fra += SIDE) {") &&
    h.includes('"user_login_log",')
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const fladenLaeserDommen = (view: string, ord: string): boolean => {
  const v = udenKommentarer(view), o = udenKommentarer(ord);
  return (
    v.includes("if (maerke) resultat = resultat.filter((r) => !!r.overblik && harMaerke(r.overblik.dom, maerke));") &&
    v.includes("{FILTER_MAERKER.filter((m) => harMaerke(o.dom, m)).map((m) => (") &&
    !/maerker\.includes|dom\.maerker/.test(v) &&
    v.includes("const ord = sessionOrd(r.overblik.sessioner[raadgiver]);") &&
    v.includes("title={ord.title ?? undefined}") &&
    !/"booked"|"booking_sent"|"afholdt"|"Afholdt"/.test(v) &&
    o.includes('export const AFHOLDT_TITLE = "udledt: sessionen var booket, og tiden er passeret";') &&
    /case "afholdt": \{[\s\S]{0,200}?title: AFHOLDT_TITLE \};/.test(o) &&
    // Tomt filter: rolig linje, ingen fejl.
    v.includes("tomMaerkeTekst(maerke)") &&
    v.includes("const maerke = laesMaerkeParam(searchParams.get(MAERKE_PARAM));")
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const standardErOverblik = (sort: string, sorteringer: readonly { id: string; noegle: string }[], standard: { id: string }): boolean => {
  const s = udenKommentarer(sort);
  return (
    standard.id === "overblik" && sorteringer[0].id === "overblik" && sorteringer[0].noegle === "overblik" &&
    s.includes('else if (sortering.noegle === "overblik") cmp = tal(a.overbliksVaegt ?? null, b.overbliksVaegt ?? null, sortering.retning);')
  );
};

describe("medlemsOverblikFlade.guard — overblikket på /virksomheder", () => {
  it("1. hooken henter kun og kalder byggOverblik — joinen, dommene og universet (inkl. is_demo) bor i motoren", () => expect(hookenBrugerMotoren(laes(HOOK), laes(MOTOR))).toBe(true));
  it("2. aldrig et tavst loft: alle kilder side for side, logins til alle brugere er set", () => expect(aldrigEtTavstLoft(laes(HOOK))).toBe(true));
  it("3. fladen læser mærkerne gennem harMaerke og ordene gennem sessionOrd; «Afholdt» bærer sin title", () => expect(fladenLaeserDommen(laes(VIEW), laes(ORD))).toBe(true));
  it("4. standardsorteringen er «Overblik»", () => expect(standardErOverblik(laes(SORT), SORTERINGER, STANDARD_SORTERING)).toBe(true));
});

describe("medlemsOverblikFlade.guard — dommene fanger fejlen på en kopi", () => {
  const hook = laes(HOOK), view = laes(VIEW), ord = laes(ORD), sort = laes(SORT);

  it("en join tilbage i hooken, byggOverblik sprunget over, is_demo glemt, eller en egen sessionsregel, fælder dom 1", () => {
    const motor = laes(MOTOR);
    expect(hookenBrugerMotoren(`${hook}\nconst x = rk[0]?.status === "booked" ? "afholdt" : "booket";\n`, motor)).toBe(false);
    expect(hookenBrugerMotoren(hook.replace("return byggOverblik({ companies, medlemmer, bookinger, logins, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal }, nu);", "return new Map();"), motor)).toBe(false);
    expect(hookenBrugerMotoren(`${hook}\nconst brugereByCompany = new Map<string, string[]>();\n`, motor)).toBe(false);
    expect(hookenBrugerMotoren(hook.replace('select("id, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at")', 'select("id, status, is_legat, er_kunde, intro_session_used_at, jonas_session_used_at")'), motor)).toBe(false);
    expect(hookenBrugerMotoren(hook, motor.replace("if (c.is_demo === true) return false;", ""))).toBe(false);
    expect(hookenBrugerMotoren(hook, motor.replace("const aktivitet = aktiviteterAf(input, nu);", "const aktivitet = {} as never;"))).toBe(false);
  });

  it("et .limit(, en kilde uden sider, eller en login-løkke der stopper på et tal, fælder dom 2", () => {
    expect(aldrigEtTavstLoft(hook.replace('.order("created_at").order("id").range(fra, til).then(side("pulse_checkins"))', '.limit(1000).then(side("pulse_checkins"))'))).toBe(false);
    expect(aldrigEtTavstLoft(hook.replace("for (let fra = 0; mangler.size > 0; fra += SIDE) {", "for (let fra = 0; fra < 3000; fra += SIDE) {"))).toBe(false);
    expect(aldrigEtTavstLoft(hook.replace('.then(side("milestones"))', ".then((r) => r)"))).toBe(false);
  });

  it("et filter uden harMaerke, en egen regel på mærkerne, ord uden sessionOrd, eller «Afholdt» uden title, fælder dom 3", () => {
    expect(fladenLaeserDommen(view.replace("harMaerke(r.overblik.dom, maerke)", "r.overblik.dom.maerker.includes(maerke)"), ord)).toBe(false);
    expect(fladenLaeserDommen(view.replace("const ord = sessionOrd(r.overblik.sessioner[raadgiver]);", 'const ord = { tekst: r.overblik.sessioner[raadgiver].status === "afholdt" ? "Afholdt" : "—", title: null };'), ord)).toBe(false);
    expect(fladenLaeserDommen(view.replace("title={ord.title ?? undefined}", ""), ord)).toBe(false);
    expect(fladenLaeserDommen(view, ord.replace("title: AFHOLDT_TITLE };", "title: null };"))).toBe(false);
    expect(fladenLaeserDommen(view.replace("tomMaerkeTekst(maerke)", '"Fejl"'), ord)).toBe(false);
  });

  it("navn som standard, eller en sortering der ikke kender vægten, fælder dom 4", () => {
    expect(standardErOverblik(sort, [SORTERINGER[1], SORTERINGER[0]], SORTERINGER[1])).toBe(false);
    expect(standardErOverblik(sort.replace('else if (sortering.noegle === "overblik") cmp = tal(a.overbliksVaegt ?? null, b.overbliksVaegt ?? null, sortering.retning);', ""), SORTERINGER, STANDARD_SORTERING)).toBe(false);
  });
});
