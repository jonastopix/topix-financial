import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  erKundeMedlemskab,
  optaelBrugbarPrLektion,
  synligeMedlemmer,
  udelukFraBrugbar,
  type UdelukMedlem,
} from "../lektionBrugbar";

// m16-brugbar-er-kunde, legat-delen (30/9-2026): listMembers filtrerede
// legat-medlemskaberne fra, FØR udelukFraBrugbar så dem. En legatmodtager
// stod derfor ikke i medlemmer, blev ikke udelukket, og hans svar talte med
// i «Svar pr. lektion». Nu kommer legaterne med, markeret, og holdes ude.

const m = (userId: string, companyErKunde: boolean, companyErLegat?: boolean): UdelukMedlem => ({
  userId,
  companyErKunde,
  companyErLegat,
});

describe("erKundeMedlemskab — kunde og ikke legat", () => {
  it("kunde uden legat → ja; legat → nej, også når er_kunde er true; ikke-kunde → nej", () => {
    expect(erKundeMedlemskab(m("a", true))).toBe(true);
    expect(erKundeMedlemskab(m("a", true, false))).toBe(true);
    expect(erKundeMedlemskab(m("a", true, true))).toBe(false);
    expect(erKundeMedlemskab(m("a", false, false))).toBe(false);
  });
});

describe("udelukFraBrugbar — legatmodtagere tæller ikke", () => {
  it("en bruger, hvis ENESTE medlemskab er et legat, er i sættet", () => {
    expect(udelukFraBrugbar([], [m("legat", true, true), m("kunde", true, false)])).toEqual(new Set(["legat"]));
  });

  it("PR. BRUGER som før: legat + kunde → tæller med", () => {
    expect(udelukFraBrugbar([], [m("begge", true, true), m("begge", true, false)])).toEqual(new Set());
  });

  it("udeladt companyErLegat er det samme som false (ældre form)", () => {
    expect(udelukFraBrugbar([], [m("x", true)])).toEqual(new Set());
  });

  it("hele vejen: legatmodtagerens svar er ikke i tallet", () => {
    const udeluk = udelukFraBrugbar([], [m("legat", true, true), m("kunde", true, false)]);
    const tal = optaelBrugbarPrLektion(
      [
        { user_id: "legat", content_item_id: "l1", acknowledged_at: "2026-09-30T08:00:00Z", brugbar: false },
        { user_id: "kunde", content_item_id: "l1", acknowledged_at: "2026-09-30T08:00:00Z", brugbar: true },
      ],
      udeluk,
    );
    expect(tal.l1).toEqual({ gennemfoert: 1, ja: 1, nej: 0, ubesvaret: 0 });
  });
});

describe("synligeMedlemmer — Fremdrift-fanens liste er som før: uden legat", () => {
  it("fjerner legat-medlemskaber og bevarer rækkefølgen; rører ikke input", () => {
    const ind = [m("b", true, false), m("legat", true, true), m("a", false)];
    const kopi = JSON.stringify(ind);
    expect(synligeMedlemmer(ind).map((x) => x.userId)).toEqual(["b", "a"]);
    expect(JSON.stringify(ind)).toBe(kopi);
  });
});

describe("kildeværn — listMembers markerer legat i stedet for at filtrere, og fanen skjuler dem", () => {
  const udenKommentarer = (k: string) =>
    k.replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
  const admin = udenKommentarer(readFileSync(resolve(process.cwd(), "src/lib/hjemmebane/adminContentApi.ts"), "utf8"));
  const view = udenKommentarer(readFileSync(resolve(process.cwd(), "src/components/hjemmebane/admin/views/ProgressView.tsx"), "utf8"));
  const blok = admin.slice(admin.indexOf("export async function listMembers("), admin.indexOf("\n}", admin.indexOf("export async function listMembers(")));

  const markererLegat = (b: string) =>
    b.includes("companyErLegat: companyById.get(m.company_id)?.is_legat === true,") && !/\.filter\([^\n]*is_legat/.test(b);
  const fanenSkjuler = (v: string) => v.includes("const members = synligeMedlemmer(membersQuery.data ?? []);");

  it("listMembers bærer companyErLegat og filtrerer ikke legat fra", () => {
    expect(markererLegat(blok)).toBe(true);
  });
  it("ProgressView viser synligeMedlemmer — udelukkelsen får HELE listen", () => {
    expect(fanenSkjuler(view)).toBe(true);
    expect(view).toContain("udelukFraBrugbar(raadgivereQuery.data, membersQuery.data)");
  });
  it("værnet virker: det gamle filter i listMembers, eller en fane uden synligeMedlemmer → falsk", () => {
    const gammel = blok.replace(
      "return (membersRes.data ?? [])\n    .map(",
      "return (membersRes.data ?? [])\n    .filter((m) => companyById.get(m.company_id)?.is_legat !== true)\n    .map(",
    );
    expect(gammel).not.toBe(blok);
    expect(markererLegat(gammel)).toBe(false);
    expect(fanenSkjuler(view.replace("synligeMedlemmer(membersQuery.data ?? [])", "membersQuery.data ?? []"))).toBe(false);
  });
});
