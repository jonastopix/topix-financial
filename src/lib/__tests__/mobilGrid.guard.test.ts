import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * mobilGrid.guard — et responsivt grid skal have en BASIS-kolonne under
 * brudpunktet (2/10-2026 eftermiddag, designgennemsynet i drift).
 *
 * MÅLT i en rigtig browser på 375 px: medlemslistens kort var 585 px brede, og
 * teksten blev skåret af. Årsagen: `<ul className="grid gap-4 md:grid-cols-2
 * lg:grid-cols-3">` har under md INGEN grid-template-columns — gitteret får
 * én implicit kolonne med bredden `auto`, og en auto-kolonne er mindst lige så
 * bred som sit indholds min-content. En `truncate`/`whitespace-nowrap`-tekst
 * har min-content = hele teksten på én linje, så kolonnen (og kortet) bliver
 * lige så bred som den længste tekst og løber ud over skærmen.
 * `grid-cols-1` = `repeat(1, minmax(0, 1fr))`: kolonnen er skærmens bredde,
 * og min 0 lader truncate gøre sit arbejde. Når indholdet passer, er de to
 * ens — derfor fik ALLE fundne steder basis-klassen (52 + 1), ikke kun dem
 * med truncate i dag: en tekst, der bliver længere i morgen, må ikke kunne
 * skubbe en side ud.
 *
 * DOMMEN: i src/components/hjemmebane må ingen klasseliste have tokenet
 * `grid` (uden præfiks) sammen med et responsivt `sm:|md:|lg:|xl:|2xl:grid-cols-*`
 * uden et ubetinget `grid-cols-*` (grid-cols-1 eller en anden basis, fx
 * `grid-cols-[minmax(0,1fr)_…]`). Prøves (a) pr. strengliteral og (b) pr.
 * linje over flere literaler (`cn("grid gap-4", x && "lg:grid-cols-2")`).
 * `md:grid` (kun grid fra md, fx `hidden md:grid`) er ikke et grid på mobil og
 * dømmes ikke. En klasseliste i en konstant, der først sættes sammen et andet
 * sted (`cn("…", GRID)`), kan værnet ikke se — skriv basis-klassen i
 * konstanten eller ved siden af `grid`.
 *
 * UNDTAGELSER står i UNDTAGELSER med begrundelse (fil:linjeindhold → hvorfor).
 * Listen er tom: intet sted har i dag brug for en auto-kolonne under brudpunktet.
 */

const ROD = process.cwd();
const MAPPE = "src/components/hjemmebane";

/** "sti" → begrundelse. Nøglen er filens sti; et bevidst tilfælde skal begrundes her. */
const UNDTAGELSER: Record<string, string> = {};

const RESPONSIV = /^(sm|md|lg|xl|2xl):grid-cols-/;
const BASIS = /^grid-cols-/;
const LITERAL = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;

const filer = (mappe: string): string[] =>
  readdirSync(mappe).flatMap((navn) => {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) return navn === "__tests__" ? [] : filer(sti);
    return /\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn) ? [sti] : [];
  });

/** Er tokenlisten et grid uden basis-kolonne med et responsivt grid-cols? */
export const manglerBasis = (tokens: string[]): boolean =>
  tokens.includes("grid") && tokens.some((t) => RESPONSIV.test(t)) && !tokens.some((t) => BASIS.test(t));

/** Fund i én kilde: linjenumre (1-baseret) med et grid uden basis. */
export const fundIKilde = (kilde: string): number[] => {
  const fund = new Set<number>();
  // (a) pr. strengliteral
  for (const m of kilde.matchAll(LITERAL)) {
    const tekst = m[1] ?? m[2] ?? m[3] ?? "";
    if (manglerBasis(tekst.split(/\s+/))) fund.add(kilde.slice(0, m.index).split("\n").length);
  }
  // (b) pr. linje over flere literaler (cn("grid …", betingelse && "md:grid-cols-2"))
  kilde.split("\n").forEach((linje, i) => {
    const tokens = [...linje.matchAll(LITERAL)].flatMap((m) => (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/));
    if (manglerBasis(tokens)) fund.add(i + 1);
  });
  return [...fund].sort((a, b) => a - b);
};

describe("mobilGrid.guard — responsive grids har en basis-kolonne under brudpunktet", () => {
  it("ingen `grid … md:grid-cols-*` uden `grid-cols-1` (eller anden basis) i src/components/hjemmebane", () => {
    const fejl: string[] = [];
    for (const sti of filer(resolve(ROD, MAPPE))) {
      const rel = relative(ROD, sti);
      if (UNDTAGELSER[rel]) continue;
      for (const linje of fundIKilde(readFileSync(sti, "utf8"))) fejl.push(`${rel}:${linje}`);
    }
    expect(fejl, `grid uden basis-kolonne (tilføj grid-cols-1 — se filhovedet):\n${fejl.join("\n")}`).toEqual([]);
  });

  it("undtagelserne er begrundede og findes", () => {
    for (const [sti, grund] of Object.entries(UNDTAGELSER)) {
      expect(grund.trim().length, sti).toBeGreaterThan(20);
      expect(() => statSync(resolve(ROD, sti)), sti).not.toThrow();
    }
  });

  it("medlemslisten (det målte fund: 585 px på 375 px): alle tre lister har grid-cols-1", () => {
    const kilde = readFileSync(resolve(ROD, `${MAPPE}/members/MemberDirectoryView.tsx`), "utf8");
    const lister = kilde.match(/<ul className="[^"]*\bgrid\b[^"]*"/g) ?? [];
    expect(lister).toHaveLength(3);
    for (const l of lister) expect(l).toMatch(/\bgrid-cols-1\b/);
  });

  it("selvbevis: fanger det målte mønster, også delt over cn(), og lader basis, md:grid og andre basis-former stå", () => {
    expect(fundIKilde('<ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">')).toEqual([1]);
    expect(fundIKilde('<div className={cn("grid gap-4", aaben && "lg:grid-cols-2")}>')).toEqual([1]);
    expect(fundIKilde("const k = `grid gap-3 sm:grid-cols-2`;")).toEqual([1]);
    expect(fundIKilde('<ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">')).toEqual([]);
    expect(fundIKilde('<div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-3">')).toEqual([]);
    expect(fundIKilde('<div className="hidden md:grid md:grid-cols-3">')).toEqual([]);
    expect(fundIKilde('<div className="grid gap-4">')).toEqual([]);
    // «grid» som del af et andet token tæller ikke som grid.
    expect(fundIKilde('<div className="grid-flow-row md:grid-cols-2">')).toEqual([]);
  });
});
