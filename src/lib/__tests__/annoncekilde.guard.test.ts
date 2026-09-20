import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { KILDE_NAVNE, kildeNavn } from "@/lib/webinar/annoncekilde";

// Kildeværn for annoncekilde (20/9-2026, recon-meta-kaeden/fund-utm_source.md §4).
// To domme med selvbevis:
//   1. FIXTUREN ER PROD. Hver utm_source-værdi, der er MÅLT i prod, oversættes til
//      et kanalnavn — ingen af dem står råt på fladen. Prøven kan ikke se prod,
//      så listen herunder ER målingen; en ny værdi føjes til listen, og så er
//      den rød, til nogen oversætter den. Det er hele pointen: næste ukendte
//      værdi bliver en rød prøve, ikke et råt ord på et dashboard.
//   2. ÉT HJEM. KILDE_NAVNE defineres i annoncekilde.ts (+ spejlet) og ingen andre
//      steder; dashboard.ts importerer kildeNavn og bruger den i kildeAf — og
//      rækkefølgen utm → fbclid → referrer (webinarFlade.guard dom 9) står urørt.

/** Målt i prod 20/9-2026 (Jonas' SQL): fb 358 · facebook 182 · ig 60 · th 1 · an 1. */
export const MAALT_I_PROD = ["fb", "facebook", "ig", "th", "an"] as const;

/** Dom 1 — over en VILKÅRLIG tabel, så selvbeviset kan give den en hullet kopi. */
export const alleMaalteOversaettes = (tabel: Readonly<Record<string, string>>, maalt: readonly string[]): boolean =>
  maalt.every((v) => {
    const navn = tabel[v.toLowerCase()];
    return typeof navn === "string" && navn.trim() !== "" && navn !== v;
  });

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const DASHBOARD = "src/lib/webinar/dashboard.ts";
const HJEM = ["src/lib/webinar/annoncekilde.ts", "supabase/functions/_shared/annoncekilde.ts"];

/** Dom 2a — dashboard.ts har ingen egen tabel og går gennem kildeNavn. */
export const dashboardGaarGennemHjemmet = (k: string): boolean =>
  !/KILDE_NAVNE/.test(k) &&
  k.includes('import { kildeNavn } from "@/lib/webinar/annoncekilde";') &&
  k.includes("const kilde = tekst(r.utm_source);") &&
  k.includes("if (kilde !== null) return kildeNavn(kilde);") &&
  k.indexOf("const kilde = tekst(r.utm_source);") < k.indexOf('if (tekst(r.fbclid) !== null) return "Facebook";');

/** Alle .ts/.tsx under en mappe (ikke prøver), til dom 2b. */
function filerUnder(mappe: string): string[] {
  const ud: string[] = [];
  const gaa = (sti: string) => {
    for (const navn of readdirSync(sti)) {
      const fuld = join(sti, navn);
      if (navn === "node_modules" || navn === "__tests__" || navn.endsWith(".test.ts")) continue;
      if (statSync(fuld).isDirectory()) gaa(fuld);
      else if (/\.tsx?$/.test(navn)) ud.push(fuld);
    }
  };
  gaa(resolve(process.cwd(), mappe));
  return ud;
}

/** Dom 2b — tabellen DEFINERES kun i hjemmet (og spejlet). */
export const kunEtHjem = (filer: readonly { sti: string; kilde: string }[]): boolean =>
  filer.every((f) => HJEM.some((h) => f.sti.endsWith(h)) || !/KILDE_NAVNE\s*[:=]/.test(f.kilde));

describe("annoncekilde.guard — fixturen er prod, og oversættelsen har ét hjem", () => {
  it("1. hver målt utm_source oversættes til et kanalnavn", () => {
    expect(alleMaalteOversaettes(KILDE_NAVNE, MAALT_I_PROD)).toBe(true);
    // og navnene er dem, fladen skal vise
    expect(MAALT_I_PROD.map((v) => kildeNavn(v))).toEqual(["Facebook", "Facebook", "Instagram", "Threads", "Audience Network"]);
    expect(kildeNavn("msg")).toBe("Messenger");
    expect(kildeNavn("FB")).toBe("Facebook");
    // reglen: ukendt står råt, tomt er null — aldrig en «andet»-spand
    expect(kildeNavn("podcast-x")).toBe("podcast-x");
    expect(kildeNavn("   ")).toBeNull();
    expect(kildeNavn(null)).toBeNull();
  });

  it("2. dashboard.ts går gennem kildeNavn, og tabellen findes kun i hjemmet", () => {
    expect(dashboardGaarGennemHjemmet(udenKommentarer(laes(DASHBOARD)))).toBe(true);
    const filer = [...filerUnder("src/lib"), ...filerUnder("supabase/functions/_shared")].map((sti) => ({ sti, kilde: udenKommentarer(laes(sti)) }));
    expect(filer.some((f) => f.sti.endsWith(HJEM[0]))).toBe(true);
    expect(kunEtHjem(filer)).toBe(true);
  });
});

describe("annoncekilde.guard — dommene fanger fejlen på en kopi", () => {
  it("1. en tabel uden th (eller med th → 'th') fælder dom 1", () => {
    const uden = Object.fromEntries(Object.entries(KILDE_NAVNE).filter(([k]) => k !== "th"));
    expect(alleMaalteOversaettes(uden, MAALT_I_PROD)).toBe(false);
    expect(alleMaalteOversaettes({ ...KILDE_NAVNE, th: "th" }, MAALT_I_PROD)).toBe(false);
    expect(alleMaalteOversaettes({ ...KILDE_NAVNE, an: "" }, MAALT_I_PROD)).toBe(false);
    // og porten åbner: en ny værdi på listen, som ingen har oversat, er rød
    expect(alleMaalteOversaettes(KILDE_NAVNE, [...MAALT_I_PROD, "tiktok"])).toBe(false);
  });

  it("2. en lokal tabel tilbage, eller kildeAf uden om hjemmet, fælder dom 2", () => {
    const d = udenKommentarer(laes(DASHBOARD));
    expect(dashboardGaarGennemHjemmet(d.split("if (kilde !== null) return kildeNavn(kilde);").join("if (kilde !== null) return KILDE_NAVNE[kilde.toLowerCase()] ?? kilde;"))).toBe(false);
    expect(dashboardGaarGennemHjemmet(d.split('import { kildeNavn } from "@/lib/webinar/annoncekilde";').join(""))).toBe(false);
    expect(dashboardGaarGennemHjemmet(d + "\nconst KILDE_NAVNE = {};")).toBe(false);
    expect(kunEtHjem([{ sti: "/x/src/lib/webinar/dashboard.ts", kilde: 'const KILDE_NAVNE: Record<string, string> = { fb: "Facebook" };' }])).toBe(false);
    expect(kunEtHjem([{ sti: "/x/src/lib/webinar/annoncekilde.ts", kilde: "export const KILDE_NAVNE = {};" }])).toBe(true);
  });
});
