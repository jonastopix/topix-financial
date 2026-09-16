import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for forløbslinjen (16/9-2026). Fund 5: forsiden sagde «Eller
// fortsæt dit forløb» til en konto der aldrig var begyndt, fordi
// BoardroomView havde sin EGEN dom under kommentaren «samme dom som
// Akademi-forsiden». Nu bor dommen i lib/hjemmebane/forloeb.ts. Tre ting låses:
//   1. ForsideView og BoardroomView importerer afgoerForloeb derfra.
//   2. Ingen af dem har en egen dom: intet `.find(` over drip.unlocked/state
//      på entries, ingen `drip.unlocked`, ingen `state !== "done"` og ingen
//      `state === "untouched"` i view-koden.
//   3. BoardroomView har ikke «Eller fortsæt dit forløb» som fast streng —
//      teksten kommer fra forloebslinje og følger tilstanden.
//   4. useAkademiData.isTrackedItem delegerer til erSporetVideo (ét prædikat).
// React-kode uden ren funktion at kalde → kildelæsning (agentforslagVenter.
// guard-mønstret), og værnet beviser sig selv på en KOPI med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/akademi/views/ForsideView.tsx";
const BOARDROOM = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const AKADEMI_DATA = "src/components/hjemmebane/akademi/useAkademiData.ts";
const FORLOEB = "src/lib/hjemmebane/forloeb.ts";

/** Dom 1: importerer afgoerForloeb fra forloeb.ts. */
export const importererDommen = (kilde: string): boolean =>
  /import \{[^}]*\bafgoerForloeb\b[^}]*\} from "@\/lib\/hjemmebane\/forloeb";/.test(kilde);

/** Dom 2: har en egen forløbsdom. */
export const harEgenDom = (kilde: string): boolean =>
  /\.find\(\s*\(\s*entry\s*\)\s*=>[\s\S]{0,200}?(drip\.unlocked|state\s*!==\s*"done"|state\s*===\s*"untouched")/.test(kilde) ||
  /\bdrip\.unlocked\b/.test(kilde) ||
  /state\s*!==\s*"done"/.test(kilde) ||
  /state\s*===\s*"untouched"/.test(kilde);

/** Dom 3: teksten som fast streng. */
export const harFastFortsaetTekst = (kilde: string): boolean => /Eller fortsæt dit forløb/.test(kilde);

/** Dom 4: isTrackedItem delegerer. */
export const delegererSporet = (kilde: string): boolean =>
  /export function isTrackedItem\(item: ContentItem\): boolean \{\s*return erSporetVideo\(item\);\s*\}/.test(kilde) &&
  !/media_provider === "bunny"/.test(kilde);

describe("forloeb.guard — én dom, to flader", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const boardroom = udenKommentarer(laes(BOARDROOM));
  const akademiData = udenKommentarer(laes(AKADEMI_DATA));
  const forloeb = udenKommentarer(laes(FORLOEB));

  it("1. ForsideView og BoardroomView importerer afgoerForloeb fra lib/hjemmebane/forloeb", () => {
    expect(importererDommen(forside)).toBe(true);
    expect(importererDommen(boardroom)).toBe(true);
    expect(boardroom).toContain("forloebslinje(");
    expect(forside).toContain("const { continueEntry, nextEntry, started } = afgoerForloeb({");
  });

  it("2. ingen af dem har en egen dom over entries (drip.unlocked / state !== done / state === untouched)", () => {
    expect(harEgenDom(forside)).toBe(false);
    expect(harEgenDom(boardroom)).toBe(false);
    // Dommen findes derimod i forloeb.ts — ordret som før flytningen.
    expect(forloeb).toContain('.sort((a, b) => b.updated_at.localeCompare(a.updated_at))');
    expect(forloeb).toContain('entry.state !== "done"');
    expect(forloeb).toContain('entry.state === "untouched"');
    expect(forloeb).toContain("entry.item.id !== continueEntry?.item.id");
    expect(forloeb).toContain("started: Boolean(continueEntry), harBegyndt");
    // Linjen: «start» kun når hun aldrig har begyndt.
    expect(forloeb).toContain("const praefiks = forloeb.harBegyndt ? FORTSAET_PRAEFIKS : START_PRAEFIKS;");
    expect(forloeb).toContain('.some((entry) => erSporetVideo(entry.item) && entry.state !== "untouched")');
  });

  it("3. BoardroomView har ikke «Eller fortsæt dit forløb» som fast streng — linjen rendrer linje.tekst og linje.sti", () => {
    expect(harFastFortsaetTekst(boardroom)).toBe(false);
    expect(boardroom).toContain("{!loading && linje && (");
    expect(boardroom).toContain("to={linje.sti}");
    expect(boardroom).toContain("{linje.tekst}");
    expect(boardroom).not.toContain("nextEntry");
  });

  it("4. useAkademiData.isTrackedItem delegerer til erSporetVideo — reglen står ét sted", () => {
    expect(delegererSporet(akademiData)).toBe(true);
    expect(akademiData).toContain('import { erSporetVideo } from "@/lib/hjemmebane/forloeb";');
    expect(forloeb.match(/media_provider === "bunny" && Boolean\(item\.bunny_video_id\)/g) ?? []).toHaveLength(1);
  });

  it("forloeb.ts er ren: ingen react-, tanstack-, supabase- eller hook-imports; kun type-importen og lektionsSti", () => {
    const imports = forloeb.match(/^import .*$/gm) ?? [];
    expect(imports).toEqual([
      'import type { ItemProgressState } from "./akademiApi";',
      'import { lektionsSti } from "./lektionerForModul";',
    ]);
    expect(udenKommentarer(laes("src/lib/hjemmebane/lektionerForModul.ts")).match(/^import /gm) ?? []).toHaveLength(0);
  });
});

describe("forloeb.guard — dommene fanger fejlen på en kopi af kilden", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const boardroom = udenKommentarer(laes(BOARDROOM));
  const akademiData = udenKommentarer(laes(AKADEMI_DATA));

  it("1. en kopi uden importen fælder dom 1", () => {
    expect(importererDommen(forside.replace(/import \{[^}]*afgoerForloeb[^}]*\} from "@\/lib\/hjemmebane\/forloeb";/, ""))).toBe(false);
  });

  it("2. den gamle egen-dom (BoardroomView før 16/9) fælder dom 2", () => {
    const gammel = `
  const nextEntry = useMemo(() => {
    return AREAS.filter((area) => area.akademi)
      .flatMap((area) => akademi.orderedByArea.get(area.key) ?? [])
      .find(
        (entry) =>
          isTrackedEntry(entry) && entry.drip.unlocked && entry.state !== "done",
      );
  }, [akademi.orderedByArea]);
`;
    expect(harEgenDom(boardroom + gammel)).toBe(true);
    expect(harEgenDom(forside + '\n  const x = entries.find((entry) => entry.state === "untouched");\n')).toBe(true);
  });

  it("3. teksten som fast streng fælder dom 3", () => {
    expect(harFastFortsaetTekst(boardroom + "\n<Link>Eller fortsæt dit forløb: {x}</Link>\n")).toBe(true);
  });

  it("4. en isTrackedItem med reglen inline fælder dom 4", () => {
    const inline = akademiData.replace("return erSporetVideo(item);", 'return item.media_provider === "bunny" && Boolean(item.bunny_video_id);');
    expect(delegererSporet(inline)).toBe(false);
  });
});
