import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SORTERINGER, STANDARD_SORTERING } from "@/lib/hjemmebane/branchefilter";

/**
 * Kildeværn for medlemsoverblikket (29/9-2026) — FORENKLET 29/9 (Jonas: «Det
 * her overblik er virkelig blevet noget rod … Jeg skal bare vide hvor mange
 * der mangler.»). Fire domme, hver bevist på en kopi med fejlen indsat:
 *
 *   1. HOOKEN BRUGER MOTOREN: hooks/medlemsOverblik.ts henter kun og kalder
 *      byggOverblik — ingen join, ingen egen sessionsregel, ingen egen
 *      dagsgrænse; universet (inkl. is_demo) og navnet (name) fra companies.
 *      Siden oprydningen 29/9 henter den KUN de tre kilder, forsiden læser.
 *   2. ALDRIG ET TAVST LOFT: de tre kilder side for side, ingen .limit(.
 *   3. /VIRKSOMHEDER ER TILBAGE (som før #1122): listen nævner hverken
 *      useMedlemsOverblik, motoren, overblikOrd eller ?maerke=; standard-
 *      sorteringen er navn, og branchefilter kender ingen «overblik».
 *   4. FORSIDEBLOKKEN TÆLLER GENNEM manglerAtBooke: forsiden henter med
 *      useMedlemsOverblik og giver hentningen til ManglerAtBooke; linjerne
 *      bygges af manglerAtBookeLinjer, som spørger motorens manglerAtBooke —
 *      ingen af de tre filer har en egen sessionsregel (ingen statusord, ingen
 *      .sessioner/.status), og blokken bærer ingen mærker eller statusord.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const HOOK = "src/hooks/medlemsOverblik.ts";
const VIEW = "src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx";
const SORT = "src/lib/hjemmebane/branchefilter.ts";
const MOTOR = "src/lib/medlemsOverblik.ts";
const FORSIDE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const BLOK = "src/components/hjemmebane/forside/ManglerAtBooke.tsx";
const BLOK_LIB = "src/lib/hjemmebane/manglerAtBookeBlok.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
/** Hooken HENTER kun og kalder byggOverblik — sammenkoblingen og dommene bor i motoren. */
export const hookenBrugerMotoren = (hook: string, motor: string): boolean => {
  const h = udenKommentarer(hook), m = udenKommentarer(motor);
  return (
    /import \{[^}]*\bbyggOverblik\b[^}]*\} from "@\/lib\/medlemsOverblik";/.test(h) &&
    h.includes("return byggOverblik({ companies, medlemmer, bookinger }, nu);") &&
    // Ingen join og ingen dom i hooken: hverken sessionStatus, kort pr. virksomhed eller et univers-filter.
    !/sessionStatus\(|manglerAtBooke\(|new Map<|is_legat \|\||erKunde\(/.test(h) &&
    // Ingen egen sessionsregel og ingen egen dagsgrænse i hooken.
    !/=== "(booked|booking_sent|cancelled|pending)"|"booked"|"booking_sent"|"cancelled"|slut_tid <|slut_tid >|\* 86_?400_?000|30 \* /.test(h) &&
    // Motoren gør det: de to sessionsdomme i byggOverblik, og universet (inkl. is_demo) ét sted.
    (m.match(/sessionStatus\(\{ raadgiver: "(morten|jonas)"/g) ?? []).length === 2 &&
    m.includes("if (c.is_demo === true) return false;") &&
    m.includes("if (!iUniverset(c)) continue;") &&
    m.includes('ud.set(c.id, { companyId: c.id, navn: c.name || "", medlemSiden: medlemSidenByCompany.get(c.id) ?? null, sessioner });') &&
    // is_demo og name hentes — ellers er filtret tomt og navnene tomme.
    h.includes('select("id, name, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at")')
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
/** De tre kilder — og kun dem (oprydningen 29/9): ingen tabel, forsiden ikke læser. */
export const KILDER = ["companies", "company_members", "session_bookings"] as const;
export const aldrigEtTavstLoft = (hook: string): boolean => {
  const h = udenKommentarer(hook);
  const tabeller = [...h.matchAll(/supabase\.from\("([a-z_]+)"\)/g)].map((x) => x[1]);
  return (
    !/\.limit\(/.test(h) &&
    tabeller.length === KILDER.length && KILDER.every((k) => tabeller.includes(k)) &&
    KILDER.every((k) => new RegExp(`hentAlleSider<[^>]*>\\(\\(fra, til\\) =>\\s*supabase\\.from\\("${k}"\\)[\\s\\S]{0,400}?\\.range\\(fra, til\\)\\.then\\(side\\("${k}"\\)\\)`).test(h)) &&
    h.includes('.eq("amount_dkk", 0)')
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const virksomhederErTilbage = (view: string, sort: string, sorteringer: readonly { id: string; noegle: string }[], standard: { id: string }): boolean => {
  const v = udenKommentarer(view), s = udenKommentarer(sort);
  return (
    !/useMedlemsOverblik|medlemsOverblik|overblikOrd|MAERKE_PARAM|harMaerke|sessionOrd|overbliksVaegt/.test(v) &&
    standard.id === "navn" && sorteringer[0].id === "navn" &&
    !sorteringer.some((x) => x.id === "overblik" || x.noegle === "overblik") &&
    !/overblik/i.test(s)
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
const STATUSORD = /"(ikke_brugt|link_sendt|booket|afholdt|aflyst|markeret_uden_booking|ikke_omfattet)"|\.sessioner\b|\.status\b/;
export const forsidenTaellerGennemMotoren = (k: { forside: string; blok: string; blokLib: string; motor: string }): boolean => {
  const f = udenKommentarer(k.forside), b = udenKommentarer(k.blok), l = udenKommentarer(k.blokLib), m = udenKommentarer(k.motor);
  const krop = (() => { const i = m.indexOf("export function manglerAtBooke("); return i === -1 ? "" : m.slice(i); })();
  return (
    f.includes("const overblikQuery = useMedlemsOverblik(!!user);") &&
    f.includes("<ManglerAtBooke hentning={overblikQuery} virksomhedsLink={virksomhedsLink} linkKlasse={TEKSTLINK} />") &&
    !/manglerAtBooke\(|\.sessioner\b/.test(f) &&
    b.includes("{manglerAtBookeLinjer(hentning.data.values()).map((l) => (") &&
    b.includes("raadgiverHentefejlTekst(hentning.error, \"forsiden\")") &&
    !STATUSORD.test(b) && !/MAERKE_ORD|sessionOrd|HbTag|harMaerke|omfattet/i.test(b) &&
    /import \{[^}]*\bmanglerAtBooke\b[^}]*\} from "@\/lib\/medlemsOverblik";/.test(l) &&
    l.includes("const mangler = manglerAtBooke(r);") &&
    !STATUSORD.test(l) &&
    krop.includes("const mangler = (s: SessionStatus) => MANGLER_STATUSSER.includes(s);") &&
    krop.includes("jonas: erNytMedlem(raekke.medlemSiden) && mangler(raekke.sessioner.jonas.status),")
  );
};

describe("medlemsOverblikFlade.guard — overblikket på /virksomheder", () => {
  it("1. hooken henter kun og kalder byggOverblik — joinen, dommene og universet (inkl. is_demo) bor i motoren", () => expect(hookenBrugerMotoren(laes(HOOK), laes(MOTOR))).toBe(true));
  it("2. aldrig et tavst loft: alle kilder side for side, logins til alle brugere er set", () => expect(aldrigEtTavstLoft(laes(HOOK))).toBe(true));
  it("3. /virksomheder er tilbage: intet overblik i listen, standard er navn", () => expect(virksomhederErTilbage(laes(VIEW), laes(SORT), SORTERINGER, STANDARD_SORTERING)).toBe(true));
  it("4. forsidens «Mangler at booke» tæller gennem manglerAtBooke — ingen egen sessionsregel", () =>
    expect(forsidenTaellerGennemMotoren({ forside: laes(FORSIDE), blok: laes(BLOK), blokLib: laes(BLOK_LIB), motor: laes(MOTOR) })).toBe(true));
});

describe("medlemsOverblikFlade.guard — dommene fanger fejlen på en kopi", () => {
  const hook = laes(HOOK), view = laes(VIEW), sort = laes(SORT);

  it("en join tilbage i hooken, byggOverblik sprunget over, is_demo eller name glemt, eller en egen sessionsregel, fælder dom 1", () => {
    const motor = laes(MOTOR);
    expect(hookenBrugerMotoren(hook, motor)).toBe(true);
    expect(hookenBrugerMotoren(`${hook}\nconst x = rk[0]?.status === "booked" ? "afholdt" : "booket";\n`, motor)).toBe(false);
    expect(hookenBrugerMotoren(hook.replace("return byggOverblik({ companies, medlemmer, bookinger }, nu);", "return new Map();"), motor)).toBe(false);
    expect(hookenBrugerMotoren(`${hook}\nconst brugereByCompany = new Map<string, string[]>();\n`, motor)).toBe(false);
    expect(hookenBrugerMotoren(hook.replace('select("id, name, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at")', 'select("id, name, status, is_legat, er_kunde, intro_session_used_at, jonas_session_used_at")'), motor)).toBe(false);
    expect(hookenBrugerMotoren(hook.replace('select("id, name, status,', 'select("id, status,'), motor)).toBe(false);
    expect(hookenBrugerMotoren(hook, motor.replace("if (c.is_demo === true) return false;", ""))).toBe(false);
  });

  it("et .limit(, en kilde uden sider, en kilde mindre, eller en fjerde tabel tilbage, fælder dom 2", () => {
    expect(aldrigEtTavstLoft(hook)).toBe(true);
    expect(aldrigEtTavstLoft(hook.replace('.order("created_at").order("id").range(fra, til).then(side("session_bookings"))', '.limit(1000).then(side("session_bookings"))'))).toBe(false);
    expect(aldrigEtTavstLoft(hook.replace('.then(side("company_members"))', ".then((r) => r)"))).toBe(false);
    expect(aldrigEtTavstLoft(hook.replace('.eq("amount_dkk", 0)', ""))).toBe(false);
    expect(aldrigEtTavstLoft(`${hook}\nconst x = supabase.from("user_login_log").select("user_id");\n`)).toBe(false);
  });

  /** Én mutation = præcis én forekomst byttet — ellers er beviset tavst. */
  const byt = (k: string, a: string, b: string) => {
    expect(k.split(a).length - 1, a).toBe(1);
    return k.split(a).join(b);
  };

  it("overblikket tilbage i listen, eller en «overblik»-sortering, fælder dom 3", () => {
    expect(virksomhederErTilbage(view, sort, SORTERINGER, STANDARD_SORTERING)).toBe(true);
    const medHook = byt(view, 'import { HbTag } from "../HbTag";', 'import { HbTag } from "../HbTag";\nimport { useMedlemsOverblik } from "@/hooks/medlemsOverblik";');
    expect(virksomhederErTilbage(medHook, sort, SORTERINGER, STANDARD_SORTERING)).toBe(false);
    const overblikFoerst = [{ id: "overblik", noegle: "overblik" }, ...SORTERINGER];
    expect(virksomhederErTilbage(view, sort, overblikFoerst, overblikFoerst[0])).toBe(false);
    const sortMedOverblik = byt(sort, 'export type SortNoegle = "navn" | "sidste_kontakt" | "sidste_rapportering";', 'export type SortNoegle = "navn" | "sidste_kontakt" | "sidste_rapportering" | "overblik";');
    expect(virksomhederErTilbage(view, sortMedOverblik, SORTERINGER, STANDARD_SORTERING)).toBe(false);
  });

  it("en egen sessionsregel i forsiden, blokken eller linjerne, et mærke i blokken, eller en motor uden erNytMedlem, fælder dom 4", () => {
    const ok = { forside: laes(FORSIDE), blok: laes(BLOK), blokLib: laes(BLOK_LIB), motor: laes(MOTOR) };
    expect(forsidenTaellerGennemMotoren(ok)).toBe(true);
    // Linjerne med egen regel i stedet for motoren.
    const egenRegel = byt(ok.blokLib, "const mangler = manglerAtBooke(r);", 'const mangler = { morten: r.sessioner.morten.status === "ikke_brugt", jonas: false };');
    expect(forsidenTaellerGennemMotoren({ ...ok, blokLib: egenRegel })).toBe(false);
    // Blokken med et statusord pr. virksomhed.
    const statusord = byt(ok.blok, "<Link to={virksomhedsLink(v.id)} className={linkKlasse}>{v.navn}</Link>", '<Link to={virksomhedsLink(v.id)} className={linkKlasse}>{v.navn}</Link>{" (ikke omfattet)"}');
    expect(forsidenTaellerGennemMotoren({ ...ok, blok: statusord })).toBe(false);
    // Forsiden tæller selv.
    const forsideTaeller = byt(ok.forside, "const overblikQuery = useMedlemsOverblik(!!user);", "const overblikQuery = useMedlemsOverblik(!!user);\n  const n = [...(overblikQuery.data?.values() ?? [])].filter((r) => r.sessioner.morten.status !== \"afholdt\").length;");
    expect(forsidenTaellerGennemMotoren({ ...ok, forside: forsideTaeller })).toBe(false);
    // Blokken uden forsidens hentning.
    const udenBlok = byt(ok.forside, "<ManglerAtBooke hentning={overblikQuery} virksomhedsLink={virksomhedsLink} linkKlasse={TEKSTLINK} />", "");
    expect(forsidenTaellerGennemMotoren({ ...ok, forside: udenBlok })).toBe(false);
    // Motoren glemmer, at Jonas kun gælder nye.
    const alleJonas = byt(ok.motor, "jonas: erNytMedlem(raekke.medlemSiden) && mangler(raekke.sessioner.jonas.status),", "jonas: mangler(raekke.sessioner.jonas.status),");
    expect(forsidenTaellerGennemMotoren({ ...ok, motor: alleJonas })).toBe(false);
  });
});
