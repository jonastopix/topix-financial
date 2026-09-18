import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AFSLAGSGRUNDE, KILDER, LUKKEAARSAGER, MENNESKE_HANDLINGER, SYSTEM_HANDLINGER, TRAPPER_NAVNE, TRIN } from "@/lib/ansoegningTrin";
import { VENTEPLADS_STATUSSER } from "@/lib/ventelisteDom";
import { AFTALE_STATUSSER } from "@/lib/underskriftDom";
import { START_TIDSPUNKTER } from "@/lib/ansoegning/skema";
import { TRAPPER } from "@/lib/rykkerkoe";
import { TRAPPER_NAVNE as TRAPPER_NAVNE_DENO } from "../../../supabase/functions/_shared/ansoegningTrin.ts";

// KODEN OG DATABASEN SKAL KENDE DE SAMME VÆRDIER (18/9-2026). Tredje gang hullet ramte:
// «venteplads» (240000) og «afslag» (250000) måtte tilføjes hver for sig, og «indsendt» (#992)
// kunne aldrig skrives — planlagte_haendelser_trappe_check kendte den ikke, så kvitteringen gik
// aldrig (bevist i prod 18/9 17:35: 0 rækker, 0 mails). Værnet læser den SENESTE CHECK-liste i
// migrationerne (i filnavnsorden, kommentarlinjer fjernet) og koden, og fejler begge veje:
// en værdi koden kender, som databasen afviser, OG en værdi databasen tillader, som koden ikke
// kender. Nye enum-værdier tilføjes altså som migration + kode i samme PR — ellers rød.
const ROD = process.cwd();
const MIG = "supabase/migrations";

const filer = readdirSync(resolve(ROD, MIG)).filter((f) => f.endsWith(".sql")).sort();
const udenKommentarlinjer = (s: string) => s.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const migrationer = filer.map((fil) => ({ fil, tekst: udenKommentarlinjer(readFileSync(resolve(ROD, MIG, fil), "utf8")) }));

/** Den seneste liste for et mønster på tværs af alle migrationer — sidste fil, sidste forekomst. */
export function senesteListe(m: readonly { fil: string; tekst: string }[], moenster: RegExp, kunFilerMed?: string): { fil: string; vaerdier: string[] } | null {
  let fundet: { fil: string; vaerdier: string[] } | null = null;
  for (const { fil, tekst } of m) {
    if (kunFilerMed && !tekst.includes(kunFilerMed)) continue;
    for (const hit of tekst.matchAll(new RegExp(moenster.source, "g" + moenster.flags.replace("g", "")))) {
      fundet = { fil, vaerdier: [...hit[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) };
    }
  }
  return fundet;
}

/** Forskellene, i ord — tom liste = ens. */
export function sammenlign(navn: string, kode: readonly string[], db: readonly string[] | null): string[] {
  if (!db) return [`${navn}: ingen CHECK-liste fundet i migrationerne`];
  const f: string[] = [];
  for (const v of kode) if (!db.includes(v)) f.push(`${navn}: koden kender «${v}», databasen gør ikke — en migration mangler`);
  for (const v of db) if (!kode.includes(v)) f.push(`${navn}: databasen tillader «${v}», koden kender den ikke — død værdi eller manglende kode`);
  return f;
}

const M = {
  trappe: /planlagte_haendelser_trappe_check\s*check\s*\(\s*trappe\s+in\s*\(([^)]*)\)/,
  trin: /ansoegninger_trin_check\s*check\s*\(\s*trin\s+in\s*\(([^)]*)\)/,
  lukkeaarsag: /ansoegninger_lukkeaarsag_check\s*check\s*\(\s*lukkeaarsag is null or lukkeaarsag in \(([^)]*)\)/,
  afslagsgrund: /ansoegninger_afslagsgrund_check\s*check\s*\(\s*afslagsgrund is null or afslagsgrund in \(([^)]*)\)/,
  kilde: /check\s*\(kilde in \(([^)]*)\)\)/,
  start: /check\s*\(start_tidspunkt is null or start_tidspunkt in \(([^)]*)\)/,
  // Recon 18/9 §6 pkt. 8: de tre tabeller længere væk, hvor koden og databasen også kan glide.
  handling: /ansoegning_beslutninger_handling_check\s*check\s*\(\s*handling\s+in\s*\(([^)]*)\)/,
  ventepladsStatus: /ventepladser_status_check\s*check\s*\(\s*status\s+in\s*\(([^)]*)\)/,
  aftaleStatus: /aftale_underskrift_status_check\s*check\s*\(\s*status\s+in\s*\(([^)]*)\)/,
};
/** Alle handlingsarter i koden: mennesket + systemet, uden gentagelser («afholdt» står i begge). */
const HANDLINGSARTER = [...new Set([...MENNESKE_HANDLINGER, ...SYSTEM_HANDLINGER])];

describe("enumsMatcherDatabasen.guard — koden og databasen kender de samme værdier", () => {
  it("trapperne (planlagte_haendelser_trappe_check) = TRAPPER_NAVNE, begge spejle, og rykkerkoe.TRAPPER", () => {
    const db = senesteListe(migrationer, M.trappe);
    expect(sammenlign("trappe", TRAPPER_NAVNE, db?.vaerdier ?? null)).toEqual([]);
    expect([...TRAPPER_NAVNE_DENO]).toEqual([...TRAPPER_NAVNE]);
    expect(sammenlign("TRAPPER-nøgler", Object.keys(TRAPPER), [...TRAPPER_NAVNE])).toEqual([]);
    expect(db?.vaerdier).toContain("indsendt"); // #992's kvittering — det hul der udløste værnet
  });
  it("trin = TRIN", () => expect(sammenlign("trin", TRIN, senesteListe(migrationer, M.trin)?.vaerdier ?? null)).toEqual([]));
  it("lukkeårsager = LUKKEAARSAGER", () => expect(sammenlign("lukkeaarsag", LUKKEAARSAGER, senesteListe(migrationer, M.lukkeaarsag)?.vaerdier ?? null)).toEqual([]));
  it("afslagsgrunde = AFSLAGSGRUNDE", () => expect(sammenlign("afslagsgrund", AFSLAGSGRUNDE, senesteListe(migrationer, M.afslagsgrund)?.vaerdier ?? null)).toEqual([]));
  it("kilder = KILDER (ansoegninger-migrationerne)", () => expect(sammenlign("kilde", KILDER, senesteListe(migrationer, M.kilde, "public.ansoegninger")?.vaerdier ?? null)).toEqual([]));
  it("starttidspunkter = START_TIDSPUNKTER", () => expect(sammenlign("start_tidspunkt", START_TIDSPUNKTER.map((s) => s.noegle), senesteListe(migrationer, M.start)?.vaerdier ?? null)).toEqual([]));
  it("handlingsarter (ansoegning_beslutninger_handling_check) = MENNESKE_HANDLINGER ∪ SYSTEM_HANDLINGER", () => {
    expect(HANDLINGSARTER.length).toBeGreaterThanOrEqual(14);
    expect(sammenlign("handling", HANDLINGSARTER, senesteListe(migrationer, M.handling)?.vaerdier ?? null)).toEqual([]);
  });
  it("ventepladsens statusser (ventepladser_status_check) = VENTEPLADS_STATUSSER", () => expect(sammenlign("ventepladser.status", VENTEPLADS_STATUSSER, senesteListe(migrationer, M.ventepladsStatus)?.vaerdier ?? null)).toEqual([]));
  it("aftalens statusser (aftale_underskrift_status_check) = AFTALE_STATUSSER", () => expect(sammenlign("aftale_underskrift.status", AFTALE_STATUSSER, senesteListe(migrationer, M.aftaleStatus)?.vaerdier ?? null)).toEqual([]));

  it("VÆRNET VIRKER: en migration uden «indsendt» → koden kender en trappe, databasen ikke; en ekstra DB-værdi → død værdi; kommentarlinjer tæller ikke", () => {
    const uden = migrationer.map((x) => ({ fil: x.fil, tekst: x.tekst.replace("'kladde', 'indsendt', 'indkaldt'", "'kladde', 'indkaldt'") }));
    expect(sammenlign("trappe", TRAPPER_NAVNE, senesteListe(uden, M.trappe)!.vaerdier)).toEqual(["trappe: koden kender «indsendt», databasen gør ikke — en migration mangler"]);
    expect(sammenlign("trappe", TRAPPER_NAVNE, [...TRAPPER_NAVNE, "spoegelse"])).toEqual(["trappe: databasen tillader «spoegelse», koden kender den ikke — død værdi eller manglende kode"]);
    const medKommentar = [...migrationer, { fil: "zz_kommentar.sql", tekst: udenKommentarlinjer("-- alter table x add constraint planlagte_haendelser_trappe_check check (trappe in ('kun_kommentar'))") }];
    expect(senesteListe(medKommentar, M.trappe)!.vaerdier).toContain("indsendt");
    expect(sammenlign("x", ["a"], null)).toEqual(["x: ingen CHECK-liste fundet i migrationerne"]);
  });
});
