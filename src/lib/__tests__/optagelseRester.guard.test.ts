import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KENDTE_LINKS, WEBINAR } from "@/lib/marketing/grundlag";
import { kontrollerUdkast } from "@/lib/marketing/udkastVaern";

/**
 * Optagelsen sendes ikke (Jonas 28/9-2026), og topix.dk/webinar/optagelse er
 * taget ned. To rester fandt B's grep 28/9, og de låses her:
 *   1. webinar-afmelds kvitteringsside lovede «du får optagelsen som aftalt».
 *      Ordet «optagelse» må ikke stå i functionens svar.
 *   2. grundlagets optagelseslink stod i KENDTE_LINKS, så en agent kunne
 *      linke til en nedtaget side. Linket må hverken stå i grundlaget eller
 *      slippe gennem udkastværnets R5.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
/**
 * Blokke væk, og KUN linjekommentarer, der starter linjen. `udenKommentarer`
 * sletter alt efter to skråstreger — og en URL BÆRER to skråstreger, så
 * «https://www.topix.dk/webinar/optagelse» i en kodelinje forsvandt, og dom 2's
 * selvbevis kunne ikke fælde linket (samme fælde som webinarMail.guard dom 2).
 */
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const AFMELD = "supabase/functions/webinar-afmeld/index.ts";
const GRUNDLAG = "src/lib/marketing/grundlag.ts";
const OPTAGELSE = "https://www.topix.dk/webinar/optagelse";

export const afmeldLoverIngenOptagelse = (afmeld: string): boolean => {
  const f = udenKommentarer(afmeld);
  return !/optagels/i.test(f) && f.includes("gælder din plads stadig");
};

export const grundlagetKenderIkkeOptagelsen = (grundlag: string): boolean => {
  const g = udenKommentarer(grundlag);
  return !g.includes("optagelseslink") && !g.includes("/webinar/optagelse");
};

describe("optagelseRester.guard — ingen rester af optagelsen", () => {
  it("1. webinar-afmelds svar nævner ingen optagelse — pladsen gælder, linket virker", () => {
    expect(afmeldLoverIngenOptagelse(laes(AFMELD))).toBe(true);
    expect(laes(AFMELD)).toContain("gælder din plads stadig — og dit personlige link virker, hvis du dukker op.");
  });

  it("2. grundlaget har intet optagelseslink, og KENDTE_LINKS er ansøgningslinket alene", () => {
    expect(grundlagetKenderIkkeOptagelsen(laes(GRUNDLAG))).toBe(true);
    expect(KENDTE_LINKS).toEqual(["https://app.theboardroom.dk/ansoeg?kilde=webinar"]);
    expect("optagelseslink" in WEBINAR).toBe(false);
  });

  it("3. udkastværnets R5 fælder det gamle optagelseslink — og lader ansøgningslinket gå", () => {
    const fejl = kontrollerUdkast(`Optagelsen ligger her: ${OPTAGELSE}`).fejl.map((f) => f.regel);
    expect(fejl).toContain("R5 link");
    const ok = kontrollerUdkast("Send en ansøgning: https://app.theboardroom.dk/ansoeg?kilde=webinar").fejl.map((f) => f.regel);
    expect(ok).not.toContain("R5 link");
  });
});

describe("optagelseRester.guard — dommene fanger fejlen på en kopi", () => {
  it("den gamle sætning tilbage i webinar-afmeld fælder dom 1", () => {
    const afmeld = laes(AFMELD);
    const gammel = afmeld.replace("og dit personlige link virker, hvis du dukker op.", "og du får optagelsen som aftalt.");
    expect(gammel).not.toBe(afmeld);
    expect(afmeldLoverIngenOptagelse(gammel)).toBe(false);
    expect(afmeldLoverIngenOptagelse(afmeld.replace("gælder din plads stadig", "er du stadig med"))).toBe(false);
  });

  it("linket tilbage i grundlaget fælder dom 2", () => {
    const g = laes(GRUNDLAG);
    expect(grundlagetKenderIkkeOptagelsen(`${g}\nexport const X = "${OPTAGELSE}";\n`)).toBe(false);
    expect(grundlagetKenderIkkeOptagelsen(g.replace("export const KENDTE_LINKS", 'const optagelseslink = "x";\nexport const KENDTE_LINKS'))).toBe(false);
  });
});
