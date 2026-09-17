import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026, rådgivernes forside PR 1 — datalaget;
// analyse-raadgivernes-forside.md §1.2, §3.1 pkt. 4–6, §6 forslag 1 og 8).
// Seks domme, læst i kilden:
//   1. De syv hentninger uden aftager er VÆK fra hentAdvisorDashboard:
//      aktivitetsfeedet (financial_reports 7 dage), kpi_targets, nyligt
//      fuldførte milestones (status completed), handouts (to kald),
//      medlemsnavne (profiles) og sidste login (get_users_last_login) — og
//      deres produkter (activityFeed, recentReportsData, companyMemberNameMap,
//      goalHandoutDone, lastActiveAt, buckets.positive) er væk med dem.
//   2. financial_report_facts hentes gennem hentAlleSider (sider(...)) med
//      stabil orden (company_id, period_key, id) og .range — uden .limit og
//      UDEN periode-afgrænsning: harMaaltRapport er «findes NOGEN målt
//      række», også en historisk.
//   3. conversations, companies, company_members og budget_targets — de
//      øvrige tabeller uden konstant loft — hentes samme vej, hver med
//      .order("id") som tie-break og .range(fra, til).
//   4. Pagineringens fejl bliver til { message } så kraevRaekker kan nævne
//      kilden (forsidenKaster.guard låser selve de ni kraevRaekker-kald).
//   5. Filen er DATALAG alene: ingen React-komponent, ingen default export,
//      ingen MemberCard, ingen react/lucide-imports.
//   6. Fladen: «Måling: tærskel …»-linjen og «(§5)» er væk fra
//      RaadgiverForsideView; toppen siger «N ting kræver dig i dag.» uden
//      den døde ternær.
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const DASH = "src/components/AdvisorDashboard.tsx";
const VIEW = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";

/** Udsnittet fra `export const hentAdvisorDashboard` til `export type AdvisorDashboardData`. */
export function hentning(kilde: string): string {
  const start = kilde.indexOf("export const hentAdvisorDashboard");
  const slut = kilde.indexOf("export type AdvisorDashboardData");
  if (start === -1 || slut === -1 || slut < start) throw new Error("hentAdvisorDashboard/AdvisorDashboardData mangler");
  return kilde.slice(start, slut);
}

const DE_SYV = [
  '.from("kpi_targets")',
  '.from("handouts")',
  '.from("profiles")',
  "get_users_last_login",
  '.gte("uploaded_at"',
  '.eq("status", "completed")',
  "activityFeed",
  "recentReportsData",
  "companyMemberNameMap",
  "goalHandout",
  "lastActiveByCompany",
  "bPositive",
] as const;

/** Dom 1. */
export const deSyvErVaek = (kilde: string): boolean => {
  const h = udenKommentarer(hentning(kilde));
  return DE_SYV.every((s) => !h.includes(s));
};

/** Ét pagineret kald: fra `sider<` (eller `hentAlleSider<`) til og med `.range(fra, til),`. */
function kaldFor(h: string, tabel: string): string | null {
  const fra = h.indexOf(`.from("${tabel}")`);
  if (fra === -1) return null;
  const start = Math.max(h.lastIndexOf("sider<", fra), h.lastIndexOf("hentAlleSider<", fra));
  const slut = h.indexOf(".range(fra, til),", fra);
  if (start === -1 || slut === -1) return null;
  return h.slice(start, slut + ".range(fra, til),".length);
}

/** Dom 2: facts pagineret, stabilt ordnet, uden loft og uden periode-afgrænsning. */
export const factsGennemAlleSider = (kilde: string): boolean => {
  const h = udenKommentarer(hentning(kilde));
  const kald = kaldFor(h, "financial_report_facts");
  if (!kald) return false;
  return (
    kald.startsWith("sider<") &&
    /\.order\("company_id"\)\s*\.order\("period_key"\)\s*\.order\("id"\)\s*\.range\(fra, til\),/.test(kald) &&
    !kald.includes(".limit(") &&
    !/\.(gte|gt|lte|lt|in|eq)\("period_key"/.test(kald) &&
    !/\.(gte|gt)\("committed_at"/.test(kald)
  );
};

const DE_FIRE = ["conversations", "companies", "company_members", "budget_targets"] as const;

/** Dom 3. */
export const deFireGennemAlleSider = (kilde: string): boolean => {
  const h = udenKommentarer(hentning(kilde));
  return DE_FIRE.every((tabel) => {
    const kald = kaldFor(h, tabel);
    return !!kald && kald.startsWith("sider<") && /\.order\("id"\)\s*\.range\(fra, til\),/.test(kald) && !kald.includes(".limit(");
  });
};

/** Dom 4. */
export const fejlenBaererKilden = (kilde: string): boolean => {
  const h = udenKommentarer(hentning(kilde));
  return (
    h.includes("const sider = <T,>(") &&
    /\(e: unknown\): Svar<T> => \(\{ data: null, error: \{ message: fejlbesked\(e\) \} \}\)/.test(h)
  );
};

/** Dom 5. */
export const kunDatalag = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  return (
    !k.includes("export default") &&
    !k.includes("<AdvisorDashboard") &&
    !k.includes("function MemberCard") &&
    !/from "react"/.test(k) &&
    !/from "lucide-react"/.test(k) &&
    !/from "react-router-dom"/.test(k) &&
    k.includes('import { hentAlleSider } from "@/lib/budgetEngine";')
  );
};

/** Dom 6 — på kommentar-strippet kilde: filhovedet må gerne NÆVNE
    målingslinjen og §5; det er brugerteksten der ikke må. */
export const fladenUdenMaaling = (view: string): boolean => {
  const v = udenKommentarer(view);
  return (
    !v.includes("Måling: tærskel") &&
    !v.includes("(§5)") &&
    !v.includes('"ting kræver" : "ting kræver"') &&
    v.includes("`${dom.antalOpgaver} ting kræver dig i dag.`")
  );
};

describe("forsideDatalag.guard — rådgivernes forside PR 1: datalaget", () => {
  const dash = laes(DASH);
  const view = laes(VIEW);

  it("1. de syv hentninger uden aftager er væk", () => {
    expect(deSyvErVaek(dash)).toBe(true);
  });
  it("2. financial_report_facts gennem hentAlleSider — stabil orden, intet loft, ingen periode-afgrænsning", () => {
    expect(factsGennemAlleSider(dash)).toBe(true);
  });
  it("3. conversations, companies, company_members og budget_targets gennem hentAlleSider med id-tie-break", () => {
    expect(deFireGennemAlleSider(dash)).toBe(true);
  });
  it("4. pagineringens fejl bærer kilden (kraevRaekker kan nævne den)", () => {
    expect(fejlenBaererKilden(dash)).toBe(true);
  });
  it("5. filen er datalag alene — ingen komponent, ingen default export", () => {
    expect(kunDatalag(dash)).toBe(true);
  });
  it("6. fladen: målingslinjen og «(§5)» er væk; toppen uden den døde ternær", () => {
    expect(fladenUdenMaaling(view)).toBe(true);
  });
});

describe("forsideDatalag.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const dash = laes(DASH);
  const view = laes(VIEW);
  const indsaet = (kilde: string, tekst: string) =>
    kilde.replace("export type AdvisorDashboardData", `${tekst}\nexport type AdvisorDashboardData`);

  it("1. én af de syv tilbage fælder dom 1", () => {
    for (const s of DE_SYV) expect(deSyvErVaek(indsaet(dash, `const x = \`${s}\`;`)), s).toBe(false);
    expect(deSyvErVaek(indsaet(dash, 'await supabase.from("kpi_targets").select("company_id")'))).toBe(false);
  });
  it("2. facts med .limit, uden hentAlleSider, uden id-orden eller med periode-afgrænsning fælder dom 2", () => {
    expect(factsGennemAlleSider(dash.replace('.order("period_key")\n            .order("id")\n            .range(fra, til),', '.order("period_key")\n            .limit(1000),'))).toBe(false);
    expect(factsGennemAlleSider(dash.replace('.from("financial_report_facts")\n            .select("company_id, period_key, period_label, metrics, data_basis, committed_at")\n', '.from("financial_report_facts")\n            .select("company_id, period_key, period_label, metrics, data_basis, committed_at")\n            .gte("period_key", "2026-03")\n'))).toBe(false);
    expect(factsGennemAlleSider(dash.replace('.order("company_id")\n            .order("period_key")\n            .order("id")\n            .range(fra, til),', '.order("company_id")\n            .range(fra, til),'))).toBe(false);
  });
  it("3. en af de fire uden id-orden eller med loft fælder dom 3", () => {
    expect(deFireGennemAlleSider(dash.replace('.order("name")\n            .order("id")\n            .range(fra, til),', '.order("name")\n            .range(fra, til),'))).toBe(false);
    expect(deFireGennemAlleSider(dash.replace('.order("created_at", { ascending: true })\n            .order("id")\n            .range(fra, til),', '.order("created_at", { ascending: true })\n            .order("id")\n            .limit(1000)\n            .range(fra, til),'))).toBe(false);
  });
  it("4. en fejl der ikke oversættes til { message } fælder dom 4", () => {
    expect(fejlenBaererKilden(dash.replace("(e: unknown): Svar<T> => ({ data: null, error: { message: fejlbesked(e) } })", "(e: unknown): Svar<T> => ({ data: null, error: e as { message: string } })"))).toBe(false);
  });
  it("5. en komponent, en default export eller en react-import fælder dom 5", () => {
    expect(kunDatalag(dash + "\nexport default hentAdvisorDashboard;\n")).toBe(false);
    expect(kunDatalag('import React from "react";\n' + dash)).toBe(false);
    expect(kunDatalag(dash + "\nfunction MemberCard() { return null; }\n")).toBe(false);
  });
  it("6. målingslinjen, «(§5)» eller den døde ternær tilbage fælder dom 6", () => {
    expect(fladenUdenMaaling(view.replace("</aside>", "<p>Måling: tærskel 70</p></aside>"))).toBe(false);
    // 17/9 (PR 4, bølgen): flagets sætning bor nu i forsidensDom (usaedvanligtMangeTekst) — var
    // `view.replace("ikke at dagen er.", "ikke at dagen er (§5).")`; «(§5)» indsættes nu ved kaldet.
    expect(fladenUdenMaaling(view.replace("{usaedvanligtMangeTekst(dom)}", "{usaedvanligtMangeTekst(dom)} (§5)"))).toBe(false);
    expect(fladenUdenMaaling(view.replace("`${dom.antalOpgaver} ting kræver dig i dag.`", '`${dom.antalOpgaver} ${dom.antalOpgaver === 1 ? "ting kræver" : "ting kræver"} dig i dag.`'))).toBe(false);
  });
});
