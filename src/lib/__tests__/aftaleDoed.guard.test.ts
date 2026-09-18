import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LUKKEAARSAGER, SYSTEM_HANDLINGER } from "@/lib/ansoegningTrin";

// Kildeværn (18/9 aften): «død på dag 60» går ÉN vej — betalingsforløbets cron spørger erAftaleDoed FØR
// påmindelserne og lukker ansøgningen gennem motoren (betalte_ikke, via koe); listen dømmer «blev medlem»
// gennem virksomheden (companies.contract_end_date), aldrig gennem en ny kolonne eller stripe-webhook.
// Selvbevis: hver regel falder, når kilden vrides.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CRON = "supabase/functions/indgangs-paamindelser-cron/index.ts";
const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";
const HOOK = "src/hooks/ansoegninger.ts";
const VISNING = "src/lib/ansoegninger/ansoegningVisning.ts";

export const doedGaarGennemMotoren = (cron: string): boolean =>
  cron.includes("if (erAftaleDoed(tilstand)) {") &&
  cron.indexOf("if (erAftaleDoed(tilstand)) {") < cron.indexOf("const trin = tilstand.paamindelse_forfalden;") &&
  cron.includes('handling: { art: "betalte_ikke" }, via: "koe"') &&
  cron.includes('a.trin !== "underskrevet"') &&
  !cron.includes('.from("ansoegninger").update(');
export const blevMedlemGennemVirksomheden = (hook: string, visning: string, webhook: string): boolean =>
  hook.includes('tabel("companies").select("id, contract_end_date")') &&
  visning.includes('a.trin === "underskrevet" && !!a.virksomhed_slutdato') &&
  !webhook.includes("ansoegninger");

describe("aftaleDoed.guard — dag 60 og «blev medlem»", () => {
  it("cronen: erAftaleDoed før påmindelserne; lukning gennem motoren; ingen rå update", () => {
    expect(doedGaarGennemMotoren(udenKommentarer(laes(CRON)))).toBe(true);
  });
  it("«blev medlem» dømmes gennem virksomheden; stripe-webhook kender stadig ikke ansøgningen", () => {
    expect(blevMedlemGennemVirksomheden(udenKommentarer(laes(HOOK)), udenKommentarer(laes(VISNING)), udenKommentarer(laes(WEBHOOK)))).toBe(true);
  });
  it("koden kender betalte_ikke som lukkeårsag og systemhandling (databasen: enumsMatcherDatabasen.guard)", () => {
    expect(LUKKEAARSAGER).toContain("betalte_ikke");
    expect(SYSTEM_HANDLINGER).toContain("betalte_ikke");
  });
  it("selvbevis", () => {
    const cron = udenKommentarer(laes(CRON));
    expect(doedGaarGennemMotoren(cron.replace('handling: { art: "betalte_ikke" }, via: "koe"', 'handling: { art: "luk", aarsag: "andet" }, via: "koe"'))).toBe(false);
    expect(doedGaarGennemMotoren(cron.replace("if (erAftaleDoed(tilstand)) {", "if (false) {"))).toBe(false);
    expect(doedGaarGennemMotoren(cron + '\n.from("ansoegninger").update({ trin: "lukket" })')).toBe(false);
    expect(blevMedlemGennemVirksomheden(udenKommentarer(laes(HOOK)), udenKommentarer(laes(VISNING)), "ansoegninger")).toBe(false);
  });
});
