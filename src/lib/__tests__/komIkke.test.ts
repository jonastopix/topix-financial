import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { foelgeLinje, knapperFor } from "@/lib/ansoegninger/ansoegningHandlinger";
import { HANDLING_ORD } from "@/lib/ansoegninger/ansoegningSpor";
import { MENNESKE_HANDLINGER, SYSTEM_HANDLINGER, TRIN, type Trin } from "@/lib/ansoegningTrin";
import { MENNESKE_HANDLINGER as MENNESKE_DENO, SYSTEM_HANDLINGER as SYSTEM_DENO } from "../../../supabase/functions/_shared/ansoegningTrin.ts";
import type { udfoerHandling } from "@/hooks/ansoegninger";

/**
 * «Kom ikke» som knap på «afholdt» (Jonas 21/9-2026, udkast-kom-ikke). Køen markerer «afholdt» ved
 * samtalens sluttid, uanset om ansøgeren kom; uden knappen står et no-show som afholdt, og et
 * «Giv afslag» ville takke for en snak, der aldrig fandt sted.
 *
 * Dommen er urørt (ikke_moedt: afholdt → indkaldt fra trin 1, ansoegningTrin.test). Serveren tog
 * allerede imod handlingen (RAADGIVER_SAMTALE i ansoegning-handling). Det, der manglede, var
 * (1) knapperFor's filter — ikke_moedt står nu i MENNESKE_HANDLINGER som afholdt (menneske OG
 * system), (2) ordet i sporet, og (3) databasens CHECK — migrationen 20260921180000.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");
const HANDLING_FN = "supabase/functions/ansoegning-handling/index.ts";
const HANDLINGER = "src/lib/ansoegninger/ansoegningHandlinger.ts";
const MIGRATION = "supabase/migrations/20260921180000_ansoegning_beslutninger_ikke_moedt.sql";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const ctx = (trin: Trin, paaPause = false) => ({ trin, paaPause, lukketFraTrin: null });
const HANDLINGSARTER = [...new Set([...MENNESKE_HANDLINGER, ...SYSTEM_HANDLINGER])];

describe("komIkke — knappen på «afholdt»", () => {
  it("knapperFor på «afholdt» indeholder ikke_moedt som LILLE knap med bekræftelse — «Kom ikke», foran «Sæt på pause»", () => {
    const k = knapperFor(ctx("afholdt"));
    const komIkke = k.find((x) => x.handling === "ikke_moedt");
    expect(komIkke).toMatchObject({ tekst: "Kom ikke", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverAfslagsgrund: false });
    expect(k.filter((x) => !x.stor).map((x) => x.handling)).toEqual(["ikke_moedt", "saet_pause"]);
    expect(k.filter((x) => x.stor).map((x) => x.handling)).toEqual(["afslag", "luk"]);
  });
  it("følge-linjen udledes af dommen: præcis «ingen mail nu — rykkere dag 2, 7 og 11»", () => {
    expect(foelgeLinje(ctx("afholdt"), "ikke_moedt")).toBe("ingen mail nu — rykkere dag 2, 7 og 11");
  });
  it("knappen findes IKKE på andre trin — dommen tillader kun ikke_moedt fra «afholdt»", () => {
    for (const trin of TRIN.filter((t) => t !== "afholdt")) {
      expect(knapperFor(ctx(trin)).map((x) => x.handling), trin).not.toContain("ikke_moedt");
      expect(knapperFor({ trin, paaPause: false, lukketFraTrin: "afholdt" }).map((x) => x.handling), trin).not.toContain("ikke_moedt");
    }
  });
  it("hook'ens type tillader den (tsc: MenneskeHandling udelukker kun systemets seks)", () => {
    type HandlingIHooken = Parameters<typeof udfoerHandling>[0]["handling"];
    const kanSendes: HandlingIHooken = "ikke_moedt";
    expect(kanSendes).toBe("ikke_moedt");
  });
  it("ikke_moedt står i BEGGE lister, som afholdt (menneske OG system), lige efter afholdt — og spejlene er ens", () => {
    expect([...MENNESKE_HANDLINGER]).toEqual([...MENNESKE_DENO]);
    expect([...SYSTEM_HANDLINGER]).toEqual([...SYSTEM_DENO]);
    for (const liste of [MENNESKE_HANDLINGER, SYSTEM_HANDLINGER]) {
      expect(liste).toContain("afholdt");
      expect(liste.indexOf("ikke_moedt")).toBe(liste.indexOf("afholdt") + 1);
    }
    expect(HANDLINGSARTER).toHaveLength(17);
  });
  it("sporet har ordet — og det siger, at ANSØGEREN udeblev (sætningen er «{hvem} {hvad}»)", () => {
    expect(HANDLING_ORD.ikke_moedt).toBe("markerede «kom ikke» — ansøgeren dukkede ikke op");
  });
});

// ── Kildeværn ───────────────────────────────────────────────────────────────
/** Serverens RAADGIVER_SAMTALE, læst af kilden. null = linjen findes ikke (samtaleBooking.guard låser dens form). */
export function serverensRaadgiverSamtale(handling: string): string[] | null {
  const m = udenKommentarer(handling).match(/const RAADGIVER_SAMTALE: readonly string\[\] = \[([^\]]*)\];/);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
}
/** Fladen har ÉT filter — MENNESKE_HANDLINGER — og ingen egen liste ved siden af. */
export const etFilter = (k: string): boolean => {
  const u = udenKommentarer(k);
  return u.includes("if (!MENNESKE_HANDLINGER.includes(art)) continue;") && !u.includes("RAADGIVER_SAMTALE_KNAPPER");
};
/** Migrationen: bogført KØRT i prod (21/9 12:37, FØR merge — var «IKKE KØRT» i udkastet), drop if exists, listen = HANDLINGSARTER (17), FØR-tallet ordret, EFTER-SQL sidst. */
export const migrationenErRigtig = (sql: string, arter: readonly string[]): boolean => {
  const k = udenSqlKommentarer(sql);
  const m = k.match(/ansoegning_beslutninger_handling_check\s*check\s*\(\s*handling\s+in\s*\(([^)]*)\)/);
  if (!m) return false;
  const db = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  const sidsteStatement = k.trim().split(";").filter((s) => s.trim()).pop() ?? "";
  return sql.startsWith("-- KØRT i prod — 21/9-2026 kl. 12:37") &&
    k.includes("drop constraint if exists ansoegning_beslutninger_handling_check") &&
    db.length === 17 && arter.every((a) => db.includes(a)) && db.every((a) => arter.includes(a)) &&
    sql.includes("'genaabn','saet_pause','genoptag','betalte_ikke'])))") && sql.includes("16 værdier, betalte_ikke med") &&
    sql.includes("pg_get_constraintdef(oid)") && /select conname, pg_get_constraintdef/.test(sidsteStatement) &&
    !/security definer/i.test(sql);
};
/** Motoren skriver beslutningsrækken betingelsesløst med h.art — derfor er migrationen alene nok for knappen OG Calendly. */
export const motorenSkriverArten = (k: string): boolean => {
  const u = udenKommentarer(k);
  const i = u.indexOf('from("ansoegning_beslutninger").insert({');
  const blok = i === -1 ? "" : u.slice(i, u.indexOf("});", i));
  return blok.includes("handling: h.art,") && !/if \([^)]*beslutning[^)]*\)\s*\{?\s*[\s\S]{0,80}from\("ansoegning_beslutninger"\)/.test(u);
};

describe("komIkke.guard", () => {
  it("serveren tager stadig imod ikke_moedt i RAADGIVER_SAMTALE (urørt), og fladen har ét filter", () => {
    expect(serverensRaadgiverSamtale(laes(HANDLING_FN))).toEqual(["book", "aflys_booking", "ikke_moedt"]);
    expect(etFilter(laes(HANDLINGER))).toBe(true);
  });
  it("migrationen: bogført KØRT i prod (12:37), 17 værdier = koden, FØR-tallet ordret, EFTER-SQL sidst", () => {
    expect(migrationenErRigtig(laes(MIGRATION), HANDLINGSARTER)).toBe(true);
  });
  it("motoren skriver h.art betingelsesløst — migrationen alene lukker hullet for knappen og for Calendly", () => {
    expect(motorenSkriverArten(laes(MOTOR))).toBe(true);
  });
  it("selvbevis: en egen liste i fladen, en migration uden ikke_moedt eller med et filhoved tilbage på IKKE KØRT, en motor der skriver noget andet — falder", () => {
    expect(etFilter(laes(HANDLINGER) + '\nexport const RAADGIVER_SAMTALE_KNAPPER = ["ikke_moedt"];')).toBe(false);
    const sql = laes(MIGRATION);
    expect(migrationenErRigtig(sql.replace("'afholdt', 'ikke_moedt', 'tilbud'", "'afholdt', 'tilbud'"), HANDLINGSARTER)).toBe(false);
    // Filhovedet må ikke falde tilbage til «IKKE KØRT» — migrationen ER kørt (12:37).
    expect(migrationenErRigtig(sql.replace("-- KØRT i prod — 21/9-2026 kl. 12:37", "-- IKKE KØRT. DEPLOY:"), HANDLINGSARTER)).toBe(false);
    expect(migrationenErRigtig(sql, [...HANDLINGSARTER, "spoegelse"])).toBe(false);
    expect(motorenSkriverArten(laes(MOTOR).replace("handling: h.art,", 'handling: "luk",'))).toBe(false);
    expect(serverensRaadgiverSamtale("ingen liste her")).toBeNull();
  });
});
