import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn: husets ord er «mål» — aldrig «milestone», «milesten» eller «milepæl» i SYNLIG tekst
// på medlemmets flader (3/10-2026, mangellisten g03-agent-milesten-ord; livetjek Floren Engros 3/10:
// forsidens stille linje «Gør en løftestang til en milestone»). Siden «Én plan» og Dine mål hedder det
// «mål» alle steder i fladen.
//
// Hvad tæller som SYNLIG tekst: en strengkonstant eller JSX-tekst (kommentarer fjernet), der indeholder
// ordet OG enten et mellemrum (en sætning) eller begynder med stort M (en etiket som «Milestone»).
// Kode-identifikatorer går fri af sig selv: tabelnavne («milestones»), query-nøgler, ruter
// («/milestones»), ankre («section-milestones») har intet mellemrum og lille m.
//
// Medlemmets flader = alt under src/components/hjemmebane OG src/lib/hjemmebane — undtagen rådgiverens og
// adminens egne mapper (admin/, virksomhed/, engagement/ — rådgivernes /engagement, hvor «milepæle» er trofæerne) — plus de delte filer, medlemmet ser (PulseCheckinModal:
// refleksionen på /reports; chatShared: emnemærkerne i chatten).
// IKKE med (kræver udrulning, ikke Update): agentens egne tekster i supabase/functions/run-company-agent —
// står på kortet g03-agent-milesten-ord.
// Trofæerne (src/lib/gamification/trofaeer.ts) er bevidst udenfor: dér ER «milepæl» begrebet (opnået én
// gang, for altid — docs/boardroom-score.md «Trofæer»), ikke et mål.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

const UNDTAGNE_MAPPER = ["__tests__", "test", "admin", "virksomhed", "engagement"];
const filerUnder = (rod: string): string[] =>
  readdirSync(resolve(process.cwd(), rod)).flatMap((navn) => {
    const sti = `${rod}/${navn}`;
    if (statSync(resolve(process.cwd(), sti)).isDirectory()) return UNDTAGNE_MAPPER.includes(navn) ? [] : filerUnder(sti);
    return /\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn) ? [sti] : [];
  });

export const MEDLEMSFILER = (): string[] => [
  ...filerUnder("src/components/hjemmebane"),
  ...filerUnder("src/lib/hjemmebane"),
  "src/components/PulseCheckinModal.tsx",
  "src/lib/chatShared.ts",
  // Den gamle skal (AppLayout/AppSidebar) bærer stadig /legat, /pulse og /annual-baseline for medlemmer.
  "src/components/AppLayout.tsx",
  "src/components/AppSidebar.tsx",
  "src/pages/LegatDashboard.tsx",
];

const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ORD = /mileston|milesten|milepæl/i;

/** De synlige tekststykker med ordet i én kildefil. */
export const synligeFund = (kilde: string): string[] => {
  const k = udenKommentarer(kilde);
  const stykker = [
    ...(k.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []),
    ...(k.match(/>[^<>{}]+</g) ?? []),
  ];
  return stykker.filter((s) => {
    if (!ORD.test(s)) return false;
    const indre = s.slice(1, -1);
    // JSX-tekst-regexen fanger også kode mellem to generiske <…> — kode har =, ;, ( eller &&; tekst har ikke.
    if (s.startsWith(">") && /[=;(]|&&/.test(indre)) return false;
    // Udviklerlog («[Milestones] … failed») ses ikke af medlemmet.
    if (/^\s*\[/.test(indre)) return false;
    return /\s/.test(indre.trim()) || /^\s*M/.test(indre);
  });
};

describe("milestoneOrd.guard — «mål», aldrig «milestone»/«milesten»/«milepæl» i medlemmets synlige tekst", () => {
  it("dom 1: ingen medlemsfil har ordet i synlig tekst", () => {
    const fund = MEDLEMSFILER().flatMap((sti) => synligeFund(laes(sti)).map((s) => `${sti}: ${s}`));
    expect(fund).toEqual([]);
  });
  it("dom 2: forsidens stille linje (løftestangen) siger «mål»", () => {
    const motor = laes("src/components/hjemmebane/boardroom/nextStep.ts");
    expect(motor).toContain('title: "Gør en løftestang til et mål",');
  });
  it("dom 3: scopet dækker forsidens motor, handout-editoren og refleksionen (ellers værner værnet intet)", () => {
    const filer = MEDLEMSFILER();
    for (const f of [
      "src/components/hjemmebane/boardroom/nextStep.ts",
      "src/components/hjemmebane/handouts/HbHandoutLeverRow.tsx",
      "src/lib/hjemmebane/refleksioner.ts",
      "src/lib/hjemmebane/maalFejl.ts",
    ]) expect(filer).toContain(f);
  });
  it("selvbevis: den gamle linje, en «→ Milestone»-knap og «milepæle» i en sætning fælder; identifikatorer og kommentarer går fri", () => {
    expect(synligeFund('title: "Gør en løftestang til en milestone",')).toHaveLength(1);
    expect(synligeFund('<span>{creating ? "Opretter…" : "→ Milestone"}</span>')).toHaveLength(1);
    expect(synligeFund("<p>Du mister adgang til alle rapporter, milepæle og chatten.</p>")).toHaveLength(1);
    expect(synligeFund('{ key: "milestone", label: "Milestone" }')).toHaveLength(1);
    expect(synligeFund('<p>«likviditetsreserve-milesten» står her</p>')).toHaveLength(1);
    expect(synligeFund('supabase.from("milestones").select("id"); const sti = "/milestones"; id="section-milestones";')).toEqual([]);
    expect(synligeFund("// Løftestang uden milestone — et stille punkt\n/* milestone her */ const x = 1;")).toEqual([]);
    expect(synligeFund('const [m, setM] = useState<Record<number, LeverMilestone>>({});')).toEqual([]);
    expect(synligeFund('console.error("[Milestones] Deadline reminder failed:", e);')).toEqual([]);
    expect(synligeFund("content: `🎯 Milestone gennemført: **${title}**`")).toHaveLength(1);
  });
});
