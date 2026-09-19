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
  cron.includes('via: "koe", truffetAf: null') &&
  cron.includes('a.trin !== "underskrevet"') &&
  !cron.includes('.from("ansoegninger").update(');

/** ÅRSAGEN (19/9): faktura_sendt_at — ikke dagstallet — afgør, om der lukkes
    «betalte ikke» eller «udløbet», og BEGGE grene skal findes. Stemplet skal
    hentes med i opslaget, ellers er dommen truffet på undefined. */
export const aarsagenFoelgerFakturaen = (cron: string): boolean =>
  cron.includes("faktura_sendt_at") &&
  cron.includes("const betalteIkke = fakturaSendt !== \"\";") &&
  cron.includes('({ art: "betalte_ikke" } as const)') &&
  cron.includes('({ art: "udloeb" } as const)') &&
  cron.includes("const handling = betalteIkke ?") &&
  // Klokken må ikke påstå en faktura, der ikke findes.
  cron.includes("der blev ALDRIG sendt en faktura");
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
  it("årsagen følger fakturaen (19/9): begge grene findes, og stemplet hentes med", () => {
    expect(aarsagenFoelgerFakturaen(udenKommentarer(laes(CRON)))).toBe(true);
    // «udløbet» er kendt af koden i forvejen — ingen migration følger med.
    expect(LUKKEAARSAGER).toContain("udloebet");
    expect(SYSTEM_HANDLINGER).toContain("udloeb");
  });
  it("selvbevis", () => {
    const cron = udenKommentarer(laes(CRON));
    expect(doedGaarGennemMotoren(cron.replace('via: "koe", truffetAf: null', 'via: "raadgiver", truffetAf: null'))).toBe(false);
    // Årsagen: fjernes den ene gren, er alle døde pludselig «betalte ikke» igen.
    expect(aarsagenFoelgerFakturaen(cron.replace('({ art: "udloeb" } as const)', '({ art: "betalte_ikke" } as const)'))).toBe(false);
    // — eller dømmes på dagstallet frem for stemplet.
    expect(aarsagenFoelgerFakturaen(cron.replace("const betalteIkke = fakturaSendt !== \"\";", "const betalteIkke = dage >= 31;"))).toBe(false);
    expect(doedGaarGennemMotoren(cron.replace("if (erAftaleDoed(tilstand)) {", "if (false) {"))).toBe(false);
    expect(doedGaarGennemMotoren(cron + '\n.from("ansoegninger").update({ trin: "lukket" })')).toBe(false);
    expect(blevMedlemGennemVirksomheden(udenKommentarer(laes(HOOK)), udenKommentarer(laes(VISNING)), "ansoegninger")).toBe(false);
  });
});
