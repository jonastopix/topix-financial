import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AREAS, MEDLEM_SKJULTE_OMRAADER } from "@/lib/hjemmebane/adminContentApi";
import { TILLADTE_OMRAADER } from "@/lib/hjemmebane/communityDokument";

/* Kildeværn (1/10-2026, Jonas: «Quick Wins skal væk fra Akademiet»):
   området quick_wins må ikke tegnes for medlemmet. Indholdsrækkerne er
   uberørte, og rådgivernes admin (adminFane) ser det stadig. */

const laes = (sti: string) => readFileSync(resolve(__dirname, "../../../../", sti), "utf8");
const udenKommentarer = (kilde: string) =>
  kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const QUICK = /quick[ _-]?wins?/i;

const MEDLEMSFLADER = [
  "src/components/hjemmebane/akademi/views/ForsideView.tsx",
  "src/components/hjemmebane/akademi/views/OmraadeView.tsx",
  "src/components/hjemmebane/akademi/views/KursusView.tsx",
  "src/components/hjemmebane/akademi/views/ElementView.tsx",
  "src/components/hjemmebane/akademi/useAkademiData.ts",
  "src/components/hjemmebane/boardroom/BoardroomView.tsx",
  "src/components/hjemmebane/HbSidebar.tsx",
  "src/components/hjemmebane/community/CommunityLinkKort.tsx",
  "src/components/hjemmebane/community/CommunityComposer.tsx",
  "src/lib/hjemmebane/communityDokument.ts",
];

describe("quickWinsSkjult.guard", () => {
  const quick = AREAS.find((a) => a.key === "quick_wins");

  it("1. quick_wins er ikke et Akademi-område for medlemmet, men har stadig sin admin-fane", () => {
    expect(quick).toBeDefined();
    expect(quick?.akademi).toBe(false);
    expect(quick?.adminFane).toBe(true);
    expect(MEDLEM_SKJULTE_OMRAADER.has("quick_wins")).toBe(true);
  });

  it("2. ingen område-liste for medlemmer rummer quick_wins", () => {
    expect(AREAS.filter((a) => a.akademi).map((a) => a.key)).not.toContain("quick_wins");
    expect(TILLADTE_OMRAADER.has("quick_wins")).toBe(false);
  });

  it("3. ingen medlemsflade nævner quick_wins eller «Quick Win» i kode", () => {
    for (const sti of MEDLEMSFLADER) {
      expect(udenKommentarer(laes(sti)), sti).not.toMatch(QUICK);
    }
  });

  it("4. useAkademiData filtrerer de skjulte områder fra både elementer og samlinger", () => {
    const k = udenKommentarer(laes("src/components/hjemmebane/akademi/useAkademiData.ts"));
    expect(k).toMatch(/MEDLEM_SKJULTE_OMRAADER\.has\(c\.area\)/);
    expect(k).toMatch(/MEDLEM_SKJULTE_OMRAADER\.has\(i\.area\)/);
  });

  it("5. agentens anbefalingsbibliotek rummer ikke Quick Wins", () => {
    const k = udenKommentarer(laes("supabase/functions/run-company-agent/index.ts"));
    expect(k).not.toMatch(/key:\s*"quick_wins"/);
  });

  it("6. værnet virker: en kopi med Quick Wins tegnet fælder dom 3", () => {
    expect(udenKommentarer('const x = { quick_wins: "Quick win" };')).toMatch(QUICK);
    expect(udenKommentarer('// quick_wins\nconst x = 1;')).not.toMatch(QUICK);
  });
});
