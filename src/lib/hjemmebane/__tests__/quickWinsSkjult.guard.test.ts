import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { AREAS, MEDLEM_SKJULTE_OMRAADER } from "@/lib/hjemmebane/adminContentApi";
import { TILLADTE_OMRAADER } from "@/lib/hjemmebane/communityDokument";

/* Kildeværn (1/10-2026, Jonas: «Quick Wins skal væk fra Akademiet»):
   området quick_wins må ikke tegnes for medlemmet. Det er en
   FLADEBESLUTNING, ikke adgangsbeskyttelse (RLS er uændret).
   Indholdsrækkerne er uberørte, og rådgivernes admin (adminFane) ser det
   stadig. */

const ROD = resolve(__dirname, "../../../../");
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
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
  "src/components/hjemmebane/handouts/HbHandoutDetail.tsx",
  "src/components/chatHenvisninger.ts",
  "src/lib/chatHenvisningsForslag.ts",
  "src/lib/hjemmebane/communityDokument.ts",
];

/* Hver fil, der henter kataloget direkte (listPublishedItems), og HVOR
   filtret står. Cachen ["akademi", "items"] er ufiltreret (den deles med
   admin), så en ny læser uden plads her fælder dom 7. Tre former tæller:
   MEDLEM_SKJULTE_OMRAADER, en hvidliste, der er TILLADTE_OMRAADER (dom 2
   holder den fri af de skjulte), eller at gå gennem useAkademiData (som
   så slet ikke kalder listPublishedItems). */
type Laeser = { filterFil: string; filter: RegExp };
const KATALOG_LAESERE: Record<string, Laeser> = {
  "src/components/hjemmebane/akademi/useAkademiData.ts": {
    filterFil: "src/components/hjemmebane/akademi/useAkademiData.ts",
    filter: /MEDLEM_SKJULTE_OMRAADER\.has\(i\.area\)/,
  },
  "src/components/hjemmebane/handouts/HbHandoutDetail.tsx": {
    filterFil: "src/components/hjemmebane/handouts/HbHandoutDetail.tsx",
    filter: /MEDLEM_SKJULTE_OMRAADER\.has\(i\.area\)/,
  },
  // Admin: blokkene viser bevidst de skjulte områder; tallet «N af M» gør ikke.
  "src/components/hjemmebane/admin/views/ProgressView.tsx": {
    filterFil: "src/components/hjemmebane/admin/views/ProgressView.tsx",
    filter: /MEDLEM_SKJULTE_OMRAADER\.has\(item\.area\)/,
  },
  // /engagement «Akademiet» (3/10-2026): kataloget er KUN områder med
  // akademi = true — dom 1 holder, at et skjult område aldrig er det.
  "src/hooks/trofaeer.ts": {
    filterFil: "src/lib/hjemmebane/akademiFremdrift.ts",
    filter: /omraader\.filter\(\(o\) => o\.akademi\)/,
  },
  // HENVISNINGS_OMRAADER = OMRAADE_LABELS' nøgler = TILLADTE_OMRAADER (linkKort.guard dom 6).
  "src/components/hjemmebane/community/CommunityComposer.tsx": {
    filterFil: "src/components/hjemmebane/community/CommunityComposer.tsx",
    filter: /HENVISNINGS_OMRAADER\.has\(item\.area\)/,
  },
  "src/components/chatHenvisninger.ts": {
    filterFil: "src/lib/chatHenvisningsForslag.ts",
    filter: /TILLADTE_OMRAADER\.has\(item\.area\)/,
  },
};

function kildefiler(mappe: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) {
      if (navn === "__tests__" || navn === "node_modules") continue;
      ud.push(...kildefiler(sti));
    } else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn)) {
      ud.push(relative(ROD, sti));
    }
  }
  return ud;
}

/** Ren dom: filer, der kalder listPublishedItems i KODE, men ikke står i
    laesere — eller hvis filter ikke findes i deres filterFil. */
function laesereUdenFilter(
  filer: Record<string, string>,
  laesere: Record<string, Laeser>,
): string[] {
  const fejl: string[] = [];
  for (const [sti, kilde] of Object.entries(filer)) {
    if (sti.endsWith("lib/hjemmebane/akademiApi.ts")) continue; // definitionen
    if (!/\blistPublishedItems\b/.test(udenKommentarer(kilde))) continue;
    const l = laesere[sti];
    const filterKilde = l ? filer[l.filterFil] : undefined;
    if (!l || filterKilde === undefined || !l.filter.test(udenKommentarer(filterKilde))) fejl.push(sti);
  }
  return fejl;
}

describe("quickWinsSkjult.guard", () => {
  const quick = AREAS.find((a) => a.key === "quick_wins");

  it("1. quick_wins er skjult for medlemmet (ÉN kilde: AREAS' medlemSkjult), men har stadig sin admin-fane", () => {
    expect(quick).toBeDefined();
    expect(quick?.akademi).toBe(false);
    expect(quick?.adminFane).toBe(true);
    expect(MEDLEM_SKJULTE_OMRAADER.has("quick_wins")).toBe(true);
    // Flaget og akademi følges ad: et skjult område er aldrig et Akademi-område.
    for (const a of AREAS) {
      const skjult = "medlemSkjult" in a && a.medlemSkjult === true;
      expect(MEDLEM_SKJULTE_OMRAADER.has(a.key), a.key).toBe(skjult);
      if (skjult) expect(a.akademi, a.key).toBe(false);
    }
    // Mængden afledes — den skrives ikke som en literal ved siden af AREAS.
    expect(udenKommentarer(laes("src/lib/hjemmebane/adminContentApi.ts"))).not.toMatch(
      /MEDLEM_SKJULTE_OMRAADER[^=]*=\s*new Set\(\s*\[/,
    );
  });

  it("2. ingen område-liste for medlemmer rummer et skjult område", () => {
    const akademi = AREAS.filter((a) => a.akademi).map((a) => a.key as string);
    for (const skjult of MEDLEM_SKJULTE_OMRAADER) {
      expect(akademi, skjult).not.toContain(skjult);
      expect(TILLADTE_OMRAADER.has(skjult), skjult).toBe(false);
    }
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

  it("6. forsidens videokilder (UgensVideoView) rummer ikke et skjult område", () => {
    const k = udenKommentarer(laes("src/components/hjemmebane/admin/views/UgensVideoView.tsx"));
    const m = k.match(/SOURCE_AREAS\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    for (const skjult of MEDLEM_SKJULTE_OMRAADER) expect(m?.[1], skjult).not.toContain(`"${skjult}"`);
  });

  it("7. enhver fil, der henter kataloget direkte, filtrerer de skjulte områder", () => {
    const filer: Record<string, string> = {};
    for (const sti of kildefiler(resolve(ROD, "src"))) filer[sti] = laes(sti);
    expect(laesereUdenFilter(filer, KATALOG_LAESERE)).toEqual([]);
    // Listen er ikke død: hver læser kalder faktisk listPublishedItems.
    for (const sti of Object.keys(KATALOG_LAESERE)) {
      expect(udenKommentarer(filer[sti] ?? ""), sti).toMatch(/\blistPublishedItems\b/);
    }
  });

  it("8. ElementView og KursusView linker kun tilbage til et Akademi-område", () => {
    expect(udenKommentarer(laes("src/components/hjemmebane/akademi/views/ElementView.tsx"))).toMatch(
      /rutensOmraade\?\.akademi/,
    );
    expect(udenKommentarer(laes("src/components/hjemmebane/akademi/views/KursusView.tsx"))).toMatch(
      /\?\.akademi \? `\/akademiet\/\$\{areaKey\}` : "\/akademiet"/,
    );
  });

  it("9. værnet virker på kopier med fejlen indsat", () => {
    // dom 3
    expect(udenKommentarer('const x = { quick_wins: "Quick win" };')).toMatch(QUICK);
    expect(udenKommentarer("// quick_wins\nconst x = 1;")).not.toMatch(QUICK);
    // dom 7: en ny læser uden plads, og en kendt læser uden sit filter
    const ny = "src/components/NyFlade.tsx";
    expect(
      laesereUdenFilter({ [ny]: 'useQuery({ queryKey: ["akademi", "items"], queryFn: listPublishedItems });' }, KATALOG_LAESERE),
    ).toEqual([ny]);
    const hb = "src/components/hjemmebane/handouts/HbHandoutDetail.tsx";
    const udenFilter = laes(hb).replace(/\.filter\(\(i\) => !MEDLEM_SKJULTE_OMRAADER\.has\(i\.area\)\)/, "");
    expect(laesereUdenFilter({ [hb]: udenFilter }, KATALOG_LAESERE)).toEqual([hb]);
    // dom 7: et kald kun i en kommentar tæller ikke
    expect(laesereUdenFilter({ [ny]: "// listPublishedItems\nconst x = 1;" }, KATALOG_LAESERE)).toEqual([]);
  });
});
