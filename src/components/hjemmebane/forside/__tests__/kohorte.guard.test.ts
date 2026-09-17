import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RAADGIVER_KILDE_ORD, raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { HentningsFejl } from "@/lib/kraevRaekker";

// Kildeværn (16/9-2026): kohortelinjen «Nye medlemmer (30 dage)» på
// rådgiverens forside (Jonas, godkendt). RaadgiverForsideView er react-query +
// supabase uden ren funktion at kalde (ubesvaredeOpslag.guard-mønstret), så
// seks ting læses i kilden:
//   1. Linjen dømmer gennem kohorteLinje( fra lib/hjemmebane/kohorte — ingen
//      egen filtrering i fladen.
//   2. Én nøgle (KOHORTE_KEY); hooken henter companies, company_members (to
//      trin — kandidater, så ALLE rækker for dem, fordi ankeret er den første
//      række) og user_login_log gennem kraevRaekker; tallet rendres kun under
//      `kohorteQuery.data`.
//   3. Fejlgrenen findes: `kohorteQuery.isError` → raadgiverHentefejlTekst —
//      aldrig «Ingen nye medlemmer» ved en fejl.
//   4. Linjen står i højre spalte EFTER «Siden sidst» og FØR «Ubesvarede opslag».
//   5. Dommen bruger dansk dato (TZ fra lib/maanedsnoegle) — aldrig
//      getDate()/toISOString().slice(0, 10) — og husets udelukkelser (erKunde,
//      is_legat).
//   6. Hooken er i topblokken, før den første betingede return (React #310).
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem på
// kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const HOOK = "src/hooks/kohorte.ts";
const LIB = "src/lib/hjemmebane/kohorte.ts";

/** Linjeblokken: fra `{KOHORTE_OVERSKRIFT}` til `{KORT_OVERSKRIFT}` (Ubesvarede opslag). */
export function linjeBlok(kilde: string): string {
  const start = kilde.indexOf("{KOHORTE_OVERSKRIFT}");
  const slut = kilde.indexOf("{KORT_OVERSKRIFT}", start);
  if (start === -1 || slut === -1) return "";
  return kilde.slice(start, slut);
}

export const doemmerGennemDommen = (flade: string): boolean =>
  /import \{[^}]*\bkohorteLinje\b[^}]*\} from "@\/lib\/hjemmebane\/kohorte"/.test(flade) &&
  linjeBlok(flade).includes("kohorteLinje({ ...kohorteQuery.data, nu: new Date() })") &&
  !/\.filter\(/.test(linjeBlok(flade));

export const enNoegleAltGennemKraev = (flade: string, hook: string): boolean =>
  linjeBlok(flade).includes("kohorteQuery.data ? (") &&
  flade.includes("queryKey: KOHORTE_KEY,") &&
  hook.includes('kraevRaekker(companiesRes, "companies")') &&
  hook.includes('kraevRaekker(nyeRes, "company_members")') &&
  hook.includes('.then(side<KohorteMedlem>("company_members"))') &&
  hook.includes('.in("company_id", kandidatIds)') &&
  hook.includes('.then(side<KohorteLogin>("user_login_log"))') &&
  hook.includes("({ data: kraevRaekker(res, kilde), error: null })") &&
  (hook.match(/useQuery\(/g) ?? []).length === 0;

/** Dom 7 (rettelse 16/9): user_login_log og medlemsrækkerne hentes SIDE FOR
    SIDE gennem husets hentAlleSider — stabil orden (logged_in_at, id) og
    .range pr. side — og aldrig som én ubegrænset hentning. PostgREST klipper
    stille ved 1.000 rækker; SIGNED_IN fyrer ved hvert faneskift. */
/** Kaldet fra `.from("<tabel>")` til dets afslutning (`.then(` eller `;`/`,` på linjeslut). */
const kaldene = (hook: string, tabel: string): string[] =>
  hook.split(`.from("${tabel}")`).slice(1).map((seg) => {
    const slut = seg.search(/\.then\(|[;,]\s*\n/);
    return slut === -1 ? seg : seg.slice(0, slut);
  });

export const henterSideForSide = (hook: string): boolean => {
  const loginKald = kaldene(hook, "user_login_log");
  const medlemKald = kaldene(hook, "company_members").filter((k) => k.includes('.in("company_id", kandidatIds)'));
  return hook.includes('import { hentAlleSider } from "@/lib/budgetEngine";') &&
    (hook.match(/await hentAlleSider</g) ?? []).length === 2 &&
    loginKald.length === 1 &&
    /\.order\("logged_in_at", \{ ascending: true \}\)\s*\.order\("id"\)\s*\.range\(fra, til\)/.test(loginKald[0]) &&
    medlemKald.length === 1 &&
    /\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id"\)\s*\.range\(fra, til\)/.test(medlemKald[0]) &&
    !/\.limit\(/.test(hook);
};

export const harFejlgren = (flade: string): boolean => {
  const blok = linjeBlok(flade);
  const fejl = blok.indexOf("kohorteQuery.isError ? (");
  const data = blok.indexOf("kohorteQuery.data ? (");
  return fejl !== -1 && data > fejl &&
    blok.includes('raadgiverHentefejlTekst(kohorteQuery.error, "forsiden")') &&
    !blok.slice(fejl, data).includes("kohorteTekst(");
};

export const staarMellemSidenSidstOgOpslag = (flade: string): boolean => {
  const sidenSidst = flade.indexOf("Siden sidst{");
  const kohorte = flade.indexOf("{KOHORTE_OVERSKRIFT}");
  const opslag = flade.indexOf("{KORT_OVERSKRIFT}");
  return sidenSidst !== -1 && kohorte > sidenSidst && opslag > kohorte;
};

export const danskDatoOgHusetsUdelukkelser = (lib: string): boolean =>
  lib.includes('import { TZ } from "@/lib/maanedsnoegle";') &&
  lib.includes('import { erKunde } from "@/lib/raadgiverensKunder";') &&
  /toLocaleDateString\("sv-SE", \{ timeZone: TZ/.test(lib) &&
  !/getDate\(|getUTCDate\(|toISOString\(\)\.slice\(0, 10\)|toDateString\(/.test(lib) &&
  lib.includes("if (v.is_legat === true) continue;") &&
  lib.includes("if (!erKunde(v)) continue;") &&
  lib.includes("if (startdag >= idag) {");

describe("kohorte.guard — kohortelinjen på forsiden", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = udenKommentarer(laes(HOOK));
  const lib = udenKommentarer(laes(LIB));

  it("1. linjen dømmer gennem kohorteLinje( — ingen egen filtrering i fladen", () => {
    expect(doemmerGennemDommen(flade)).toBe(true);
  });
  it("2. én nøgle; companies, company_members (to trin, alle rækker for kandidaterne) og user_login_log gennem kraevRaekker; tallet kun under data", () => {
    expect(enNoegleAltGennemKraev(flade, hook)).toBe(true);
  });
  it("3. fejlgrenen findes — husets hentefejltekst, aldrig «Ingen nye medlemmer» ved fejl", () => {
    expect(harFejlgren(flade)).toBe(true);
    expect(RAADGIVER_KILDE_ORD.user_login_log).toBe("login-historikken");
    expect(raadgiverHentefejlTekst(new HentningsFejl("user_login_log", "x"), "forsiden")).toBe("Login-historikken kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.");
  });
  it("4. linjen står efter «Siden sidst» og før «Ubesvarede opslag»", () => {
    expect(staarMellemSidenSidstOgOpslag(flade)).toBe(true);
  });
  it("5. dommen bruger dansk dato (TZ) og husets udelukkelser; startet i dag udelades af M", () => {
    expect(danskDatoOgHusetsUdelukkelser(lib)).toBe(true);
    expect(linjeBlok(flade)).toContain("startetIDagTekst(linje.udeladtIDag)");
    // 17/9 (PR 3, links på navnene): var «ikkeKommetIgenTekst(linje.ikkeKommetIgen)» —
    // fladen tegner nu navnene som links gennem delene (samme dom, samme loft).
    expect(linjeBlok(flade)).toContain("ikkeKommetIgenDele(linje.ikkeKommetIgenVirksomheder)");
  });
  it("6. hooken er i topblokken: kohorteQuery står før den første betingede return", () => {
    const krop = flade.slice(flade.indexOf("export const RaadgiverForsideView = () => {"));
    expect(krop.indexOf("const kohorteQuery = useQuery(")).toBeLessThan(krop.indexOf("\n  if (isError) {"));
    expect(flade).toContain("staleTime: 5 * 60_000,");
  });
  it("7. user_login_log og medlemsrækkerne hentes side for side (hentAlleSider, stabil orden, .range) — aldrig én ubegrænset hentning", () => {
    expect(henterSideForSide(hook)).toBe(true);
  });
});

describe("kohorte.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = udenKommentarer(laes(HOOK));
  const lib = udenKommentarer(laes(LIB));

  it("1. en egen dom i fladen fælder dom 1", () => {
    const egen = flade.replace("kohorteLinje({ ...kohorteQuery.data, nu: new Date() })", "({ m: kohorteQuery.data.virksomheder.filter((c) => !c.is_legat).length, n: 0, ikkeKommetIgen: [], udeladtIDag: 0 })");
    expect(egen).not.toBe(flade);
    expect(doemmerGennemDommen(egen)).toBe(false);
  });
  it("2. logins uden kraevRaekker, eller kun de sidste 31 døgns rækker som anker, fælder dom 2", () => {
    const udenKraev = hook.replace('.then(side<KohorteLogin>("user_login_log"))', ".then((r) => ({ data: r.data ?? [], error: null }))");
    expect(udenKraev).not.toBe(hook);
    expect(enNoegleAltGennemKraev(flade, udenKraev)).toBe(false);
    expect(enNoegleAltGennemKraev(flade, hook.replace('.in("company_id", kandidatIds)', '.gte("created_at", siden)'))).toBe(false);
    expect(enNoegleAltGennemKraev(flade.replace("kohorteQuery.data ? (", "true ? ("), hook)).toBe(false);
  });
  it("3. en flade uden fejlgren fælder dom 3", () => {
    expect(harFejlgren(flade.replace("kohorteQuery.isError ? (", "false ? ("))).toBe(false);
  });
  it("4. linjen flyttet under «Ubesvarede opslag» fælder dom 4", () => {
    const blok = linjeBlok(flade);
    const flyttet = flade.replace(blok, "").replace("{KORT_OVERSKRIFT}", `{KORT_OVERSKRIFT}${blok}`);
    expect(flyttet).not.toBe(flade);
    expect(staarMellemSidenSidstOgOpslag(flyttet)).toBe(false);
  });
  it("7. den gamle form — én hentning af user_login_log uden orden og .range, eller med .limit(1000) — fælder dom 7", () => {
    const udenRange = hook.replace(/\.order\("logged_in_at", \{ ascending: true \}\)\s*\.order\("id"\)\s*\.range\(fra, til\)/, "");
    expect(udenRange).not.toBe(hook);
    expect(henterSideForSide(udenRange)).toBe(false);
    const medLoft = hook.replace(".range(fra, til)\n            .then(side<KohorteLogin>", ".limit(1000)\n            .then(side<KohorteLogin>");
    expect(medLoft).not.toBe(hook);
    expect(henterSideForSide(medLoft)).toBe(false);
    const medlemUdenRange = hook.replace(/\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id"\)\s*\.range\(fra, til\)/, "");
    expect(medlemUdenRange).not.toBe(hook);
    expect(henterSideForSide(medlemUdenRange)).toBe(false);
  });
  it("5. UTC-dato (toISOString().slice(0, 10)) eller manglende legat-udelukkelse fælder dom 5", () => {
    expect(danskDatoOgHusetsUdelukkelser(lib.replace(/toLocaleDateString\("sv-SE", \{ timeZone: TZ[^)]*\)/, "toISOString().slice(0, 10)"))).toBe(false);
    expect(danskDatoOgHusetsUdelukkelser(lib.replace("if (v.is_legat === true) continue;", ""))).toBe(false);
  });
});
