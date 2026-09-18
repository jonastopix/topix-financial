import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INDGANGS_PRISPUNKTER_OERE, STANDARD_PRISNIVEAU_OERE } from "@/lib/indgangspris";
import { STANDARD_PRISNIVEAU_OERE as STANDARD_DENO } from "../../../supabase/functions/_shared/indgangspris.ts";

// ÉN VEJ TIL AFTALEN (Jonas 18/9 aften): «Send aftalegrundlag» med indtastet link er væk fra fladen og afvises
// af handlingen; e-underskriften laver aftalen, sætter prisen, sender mailen og flytter trinnet i ét. Papirvejen
// («Underskrevet på papir») findes for de sjældne tilfælde og kræver prisen. Prisen er FORUDFYLDT (50.000),
// synlig ved knappen, kan skiftes til 40.000 — ingen aftale uden pris.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const TABEL = "src/lib/ansoegninger/ansoegningHandlinger.ts";
const DIALOG = "src/components/hjemmebane/ansoegninger/AnsoegningHandlinger.tsx";
const SEND = "src/components/hjemmebane/virksomhed/SendTilUnderskrift.tsx";
const HANDLING = "supabase/functions/ansoegning-handling/index.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";

export const tilbudErUdeAfFladen = (tabel: string, dialog: string): boolean =>
  !/RAEKKEFOELGE[^\n]*"tilbud"/.test(tabel) && !tabel.includes("kraeverAftaleUrl") && !tabel.includes("erGyldigtAftaleLink") &&
  !dialog.includes("data-aftale-url") && !dialog.includes("aftaleUrl") && !dialog.includes("erGyldigtAftaleLink");
export const papirvejenKraeverPris = (tabel: string, dialog: string): boolean =>
  /underskrevet: \{ tekst: "Underskrevet på papir"[^\n]*kraeverPris: true/.test(tabel) &&
  dialog.includes("prisOere: k.kraeverPris ? prisOere : null,") && dialog.includes("useState<number>(STANDARD_PRISNIVEAU_OERE)") &&
  dialog.includes("data-pris-valg") && dialog.includes("dialog?.kraeverPris === true && !(INDGANGS_PRISPUNKTER_OERE as readonly number[]).includes(prisOere)");
export const handlingenAfviserTilbudOgKraeverPris = (k: string): boolean =>
  k.includes('if (handling.art === "tilbud") return json({ error: "brug_e_underskriften"') &&
  k.includes('if (prisOere !== null && handling.art === "underskrevet") {') &&
  k.includes('if (handling.art === "underskrevet" && ansoegning.pris_oere === null) return json({ error: "pris_mangler"');
export const motorenKraeverPris = (k: string): boolean => {
  const i = k.indexOf('if (h.art === "underskrevet" && a.pris_oere === null) return { ok: false, status: 409');
  const j = k.indexOf('if (h.art === "underskrevet") {\n    konvertering = await konverterTilVirksomhed(admin, a, nu);');
  return i > 0 && j > i; // prisværnet FØR konverteringen (A's «konvertering før trin» står urørt)
};
export const eUnderskriftenErForudfyldt = (k: string): boolean =>
  k.includes("useState<number>(STANDARD_PRISNIVEAU_OERE)") && k.includes("data-pris-valg") && k.includes("data-send-aftale={valgtOere}") &&
  k.includes("onClick={() => void send(valgtOere)}") && k.includes("onClick={() => void forhaandsvis(valgtOere)}") && k.includes("(standard)");

describe("enVejTilAftalen.guard", () => {
  it("standardprisen er 50.000, et af prispunkterne, ens i begge spejle", () => {
    expect(STANDARD_PRISNIVEAU_OERE).toBe(5_000_000);
    expect(INDGANGS_PRISPUNKTER_OERE).toContain(STANDARD_PRISNIVEAU_OERE);
    expect(STANDARD_DENO).toBe(STANDARD_PRISNIVEAU_OERE);
  });
  it("«Send aftalegrundlag» (indtastet link) er ude af fladen — tabel og dialog", () => expect(tilbudErUdeAfFladen(udenKommentarer(laes(TABEL)), udenKommentarer(laes(DIALOG)))).toBe(true));
  it("papirvejen kræver prisen — forudfyldt, synligt valg i dialogen; knappen låst uden gyldig pris", () => expect(papirvejenKraeverPris(udenKommentarer(laes(TABEL)), udenKommentarer(laes(DIALOG)))).toBe(true));
  it("ansoegning-handling afviser «tilbud» (409 brug_e_underskriften) og kræver pris ved «underskrevet»", () => expect(handlingenAfviserTilbudOgKraeverPris(udenKommentarer(laes(HANDLING)))).toBe(true));
  it("motoren afviser «underskrevet» uden pris — uanset hvem der kalder", () => expect(motorenKraeverPris(udenKommentarer(laes(MOTOR)))).toBe(true));
  it("e-underskriften: prisen står forudfyldt ved knappen (50.000 standard), kan skiftes, sendes og forhåndsvises med det valgte", () => expect(eUnderskriftenErForudfyldt(udenKommentarer(laes(SEND)))).toBe(true));
  it("VÆRNET VIRKER: tilbud tilbage i rækkefølgen → falsk; papirvejen uden pris → falsk; handlingen tager tilbud igen → falsk; motoren uden værn → falsk; skjult standard → falsk", () => {
    const tabel = udenKommentarer(laes(TABEL)); const dialog = udenKommentarer(laes(DIALOG));
    expect(tilbudErUdeAfFladen(tabel.replace('"tal_med_dem", "afvis", "afslag",', '"tal_med_dem", "afvis", "tilbud", "afslag",'), dialog)).toBe(false);
    expect(papirvejenKraeverPris(tabel.replace("kraeverPris: true", "kraeverPris: false"), dialog)).toBe(false);
    expect(handlingenAfviserTilbudOgKraeverPris(udenKommentarer(laes(HANDLING)).replace('if (handling.art === "tilbud") return json({ error: "brug_e_underskriften"', "if (false) return json({"))).toBe(false);
    expect(motorenKraeverPris(udenKommentarer(laes(MOTOR)).replace('if (h.art === "underskrevet" && a.pris_oere === null) return { ok: false, status: 409', "if (false) return { ok: false, status: 409"))).toBe(false);
    expect(eUnderskriftenErForudfyldt(udenKommentarer(laes(SEND)).replace("data-pris-valg", "data-x"))).toBe(false);
  });
});
