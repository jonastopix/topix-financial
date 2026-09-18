import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRAPPER } from "@/lib/rykkerkoe";
import { knapperFor } from "@/lib/ansoegninger/ansoegningHandlinger";

// Generalprøvens brist 1 og 3 (18/9): e-underskriften nås fra ansøgningen, og
// forklaringerne under knapperne siger det køen faktisk gør. Kildeværn med
// selvbevis på kopier med fejlen sat ind.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

const KOMPONENT = "src/components/hjemmebane/virksomhed/SendTilUnderskrift.tsx";
const ANSOEGNING = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const VIRKSOMHED = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";

/** Dagene i en trappe, som teksten skal nævne: mails efter dag 0, og den afsluttende handling. */
function dageAf(trappe: keyof typeof TRAPPER): { rykkere: number[]; slut: { dag: number; handling: string } | null } {
  const rows = TRAPPER[trappe];
  const rykkere = rows.filter((r) => r.handling === "send_mail" && r.dag > 0).map((r) => r.dag);
  const sidste = rows.find((r) => r.handling !== "send_mail");
  return { rykkere, slut: sidste ? { dag: sidste.dag, handling: sidste.handling } : null };
}
const dageSomTekst = (d: number[]) => (d.length <= 1 ? d.join("") : `${d.slice(0, -1).join(", ")} og ${d[d.length - 1]}`);
const forklaringFor = (trin: "ny" | "afholdt", handling: string): string =>
  knapperFor({ trin, paaPause: false, lukketFraTrin: null }).find((k) => k.handling === handling)?.forklaring ?? "";

// 1) komponenten tager en ansøgning som ejer, sender ansoegning_id, og skriver prisen på ansøgningen FØR kaldet
export const komponentenTagerAnsoegning = (k: string): boolean =>
  k.includes("export type UnderskriftEjer = { companyId: string; ansoegningId?: undefined } | { ansoegningId: string; companyId?: undefined };") &&
  k.includes("{ ansoegning_id: ejer.ansoegningId }") && k.includes("{ company_id: ejer.companyId }") &&
  k.includes("body: { ...ejerBody(ejer), prisniveau_oere: oere, erstat }") &&
  /await gemNoteOgPris\(ejer\.ansoegningId, \{ pris_oere: oere \}\);[\s\S]*?supabase\.functions\.invoke\("send-til-underskrift"/.test(k) &&
  k.includes('kode === "ansoegning_forkert_trin"') && k.includes('kode === "pris_saettes_paa_ansoegningen"') &&
  k.includes("motor.ok === false");
// 2) ansøgningssiden monterer den for afholdt/aftalegrundlag_sendt, ikke på pause, med ansoegningId
export const ansoegningssidenMonterer = (k: string): boolean =>
  k.includes('import { SendTilUnderskrift } from "../virksomhed/SendTilUnderskrift";') &&
  /\(a\.trin === "afholdt" \|\| a\.trin === "aftalegrundlag_sendt"\) && a\.paa_pause_til === null && \([\s\S]{0,400}<SendTilUnderskrift ansoegningId=\{a\.id\}/.test(k);
// 3) virksomhedssiden er urørt: stadig companyId
export const virksomhedssidenUroert = (k: string): boolean => k.includes("<SendTilUnderskrift companyId={c.id} onOpdateret={onOpdateret} />");
// 4) forklaringerne nævner præcis køens dage
export const forklaringPasserTilKoeen = (forklaring: string, trappe: "indkaldt" | "aftalegrundlag"): boolean => {
  const d = dageAf(trappe);
  const m = forklaring.match(/rykkere dag (\d+(?:, \d+)*(?: og \d+)?)/);
  if (!m) return false;
  const naevnt = m[1].replace(" og ", ", ").split(", ").map(Number);
  if (naevnt.join(",") !== d.rykkere.join(",")) return false;
  return d.slut ? forklaring.includes(`dag ${d.slut.dag}`) : true;
};

describe("underskriftFraAnsoegning.guard — brist 1: e-underskriften nås fra ansøgningen", () => {
  it("komponenten tager companyId ELLER ansoegningId, sender det rigtige body-felt, og sætter prisen på ansøgningen først", () => {
    expect(komponentenTagerAnsoegning(udenKommentarer(laes(KOMPONENT)))).toBe(true);
  });
  it("ansøgningssiden monterer den for «afholdt» og «aftalegrundlag_sendt», aldrig på pause", () => {
    expect(ansoegningssidenMonterer(udenKommentarer(laes(ANSOEGNING)))).toBe(true);
  });
  it("virksomhedssiden er uændret", () => {
    expect(virksomhedssidenUroert(udenKommentarer(laes(VIRKSOMHED)))).toBe(true);
  });
});

describe("underskriftFraAnsoegning.guard — brist 3: forklaringerne siger det køen gør", () => {
  it("«Indkald til samtale»: rykkere dag 2, 7 og 11 — lukkes dag 14 (dag 4 udgik i #992)", () => {
    expect(dageAf("indkaldt")).toEqual({ rykkere: [2, 7, 11], slut: { dag: 14, handling: "luk_svarer_ikke" } });
    expect(forklaringFor("ny", "tal_med_dem")).toContain(`rykkere dag ${dageSomTekst([2, 7, 11])}`);
    expect(forklaringPasserTilKoeen(forklaringFor("ny", "tal_med_dem"), "indkaldt")).toBe(true);
  });
  it("«Send aftalegrundlag»: rykkere dag 2, 5, 9 og 14 — udløber dag 21", () => {
    expect(dageAf("aftalegrundlag")).toEqual({ rykkere: [2, 5, 9, 14], slut: { dag: 21, handling: "udloeb" } });
    expect(forklaringPasserTilKoeen(forklaringFor("afholdt", "tilbud"), "aftalegrundlag")).toBe(true);
  });
});

describe("underskriftFraAnsoegning.guard — VÆRNET VIRKER", () => {
  const komp = udenKommentarer(laes(KOMPONENT)); const side = udenKommentarer(laes(ANSOEGNING)); const virk = udenKommentarer(laes(VIRKSOMHED));
  it("prisen ikke sat før kaldet → falsk; body med company_id for en ansøgning → falsk", () => {
    expect(komponentenTagerAnsoegning(komp.replace("await gemNoteOgPris(ejer.ansoegningId, { pris_oere: oere });", ""))).toBe(false);
    expect(komponentenTagerAnsoegning(komp.replace("{ ansoegning_id: ejer.ansoegningId }", "{ company_id: ejer.ansoegningId }"))).toBe(false);
  });
  it("monteret på pause → falsk; monteret fra «ny» → falsk; virksomhedssiden skiftet til ansoegningId → falsk", () => {
    expect(ansoegningssidenMonterer(side.replace(" && a.paa_pause_til === null", ""))).toBe(false);
    expect(ansoegningssidenMonterer(side.replace('a.trin === "afholdt"', 'a.trin === "ny"'))).toBe(false);
    expect(virksomhedssidenUroert(virk.replace("<SendTilUnderskrift companyId={c.id}", "<SendTilUnderskrift ansoegningId={c.id}"))).toBe(false);
  });
  it("den gamle tekst «dag 2, 4, 7 og 11» → falsk; uden lukkedagen → falsk", () => {
    expect(forklaringPasserTilKoeen("indkaldelsen sendes i dag i sendevinduet, rykkere dag 2, 4, 7 og 11.", "indkaldt")).toBe(false);
    expect(forklaringPasserTilKoeen("rykkere dag 2, 7 og 11.", "indkaldt")).toBe(false);
    expect(forklaringPasserTilKoeen("rykkere dag 2, 7 og 11 — uden svar lukkes den «svarer ikke» dag 14.", "indkaldt")).toBe(true);
  });
});
