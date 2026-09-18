import { describe, expect, it } from "vitest";
import { aftaleSomRenTekst, erHeltFed, parseAftaleTekst, parseSpans } from "@/lib/aftaleMarkdown";

// Aftalegrundlagets Markdown → struktur (18/9 aften). Grammatikken er målt i aftalegrundlag-udkast.md:
// #, ## (10), **fed** hele linjer (15) og midt i linjer (11), *kursiv* (3), «- » lister (16), --- (2), > (1).
describe("parseSpans — kun **fed** og *kursiv*, aldrig HTML", () => {
  it("fed hele linjen, fed midt i, kursiv", () => {
    expect(parseSpans("**Mellem:**")).toEqual([{ tekst: "Mellem:", fed: true, kursiv: false }]);
    expect(parseSpans("**Akademiet:** Adgang til Akademiet")).toEqual([{ tekst: "Akademiet:", fed: true, kursiv: false }, { tekst: " Adgang til Akademiet", fed: false, kursiv: false }]);
    expect(parseSpans("*I denne aftale benævnes køber «Køber».*")).toEqual([{ tekst: "I denne aftale benævnes køber «Køber».", fed: false, kursiv: true }]);
  });
  it("umage markører står som tekst; HTML er tekst; 2 * 3 er tekst", () => {
    expect(parseSpans("pris **uden slut")).toEqual([{ tekst: "pris **uden slut", fed: false, kursiv: false }]);
    expect(parseSpans("<script>x</script> og <b>fed</b>")).toEqual([{ tekst: "<script>x</script> og <b>fed</b>", fed: false, kursiv: false }]);
    expect(parseSpans("2 * 3 = 6")).toEqual([{ tekst: "2 * 3 = 6", fed: false, kursiv: false }]);
  });
  it("erHeltFed: kun når alle tekstbærende spans er fede", () => {
    expect(erHeltFed(parseSpans("**1.1. Baggrund**"))).toBe(true);
    expect(erHeltFed(parseSpans("**Akademiet:** Adgang"))).toBe(false);
    expect(erHeltFed(parseSpans("almindelig"))).toBe(false);
  });
});

const DOK = `# Aftalegrundlag for deltagelse i The Boardroom

**Mellem:**

**Nordic Byg ApS**
CVR 12345678

*I denne aftale benævnes køber «Køber».*

## 1. Baggrund og Formål

**1.1. Baggrund**
Køber ønsker sparring.

## 2. Forløbets Indhold
Forløbet omfatter:
- **Akademiet:** Adgang til Akademiet på platformen.
- **Personlig chat:** Løbende sparring.
- Netværksdag

---
> ⚠️ Læses af en jurist.`;

describe("parseAftaleTekst — blokkene", () => {
  it("overskrifter, afsnit, liste, streg, citat i rækkefølge; tomme linjer skiller, ingen tomme blokke", () => {
    const b = parseAftaleTekst(DOK);
    expect(b.map((x) => x.slags)).toEqual(["overskrift", "afsnit", "afsnit", "afsnit", "afsnit", "overskrift", "afsnit", "afsnit", "overskrift", "afsnit", "liste", "streg", "citat"]);
    expect(b[0]).toMatchObject({ slags: "overskrift", niveau: 1 });
    expect(b[5]).toMatchObject({ slags: "overskrift", niveau: 2 });
    const liste = b[10]; if (liste.slags !== "liste") throw new Error("liste");
    expect(liste.punkter).toHaveLength(3);
    expect(liste.punkter[0][0]).toEqual({ tekst: "Akademiet:", fed: true, kursiv: false });
  });
  it("som ren tekst: ingen markører tilbage, lister med punkttegn", () => {
    const t = aftaleSomRenTekst(DOK);
    expect(t).not.toMatch(/[#*]|^- /m);
    expect(t).toContain("Aftalegrundlag for deltagelse i The Boardroom\nMellem:\nNordic Byg ApS");
    expect(t).toContain("• Akademiet: Adgang til Akademiet på platformen.");
    expect(t).toContain("———");
  });
  it("CRLF og hale-mellemrum tåles; en streg af stjerner er en streg", () => {
    expect(parseAftaleTekst("a\r\n\r\n***\r\nb  ").map((x) => x.slags)).toEqual(["afsnit", "streg", "afsnit"]);
  });
});
