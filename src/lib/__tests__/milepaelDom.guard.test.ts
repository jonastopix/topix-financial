import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Værn for milepælenes dom (8/9): INGEN flade dømmer «færdig» eller
// «forfalden» med sin egen regel — de kalder src/lib/milepaelDom.ts.
// Før: seks læsere, tre regler for «færdig» (progress >= 100 / status =
// completed / status ≠ completed), nul steder «forfalden» på det medlemmet
// ser (recon-opgaver-og-milepaele.md §1, §4). Kildelæsning frem for
// import: fladerne er React/Supabase-kode (varselStempel.guard-mønstret).
//
// TO LISTER, begge låst:
//   DÆKKEDE  — kalder motoren og må ikke bære nogen af mønstrene.
//   AFVIGERE — bærer STADIG sin egen regel (bevidst eller uden for denne
//              omgangs stier). Hver står med den ordrette regel; når en
//              afviger kobles på motoren, SKAL den flyttes til DÆKKEDE,
//              ellers fejler værnet (reglen findes ikke længere). Filer
//              der er slettet, springes over (arv der forsvinder er fint).

const DAEKKEDE = [
  "src/lib/milepaelDom.ts",
  "src/components/hjemmebane/milestones/useMilestones.ts",
  "src/components/hjemmebane/milestones/HbMilestoneRaekke.tsx",
  "src/components/hjemmebane/milestones/MilestonesView.tsx",
  "src/components/hjemmebane/milestones/MilestoneDialoger.tsx",
  "src/components/hjemmebane/virksomhed/VirksomhedView.tsx",
  "src/hooks/useVirksomhed.ts",
  "src/lib/virksomhedsSignaler.ts",
  // Digesten (8/9, efter #741): dømmer gennem _shared/digestMilepaele → milepaelDom.
  "supabase/functions/_shared/digestMilepaele.ts",
  "supabase/functions/send-monthly-digest/index.ts",
];

/** Motoren selv er den ENESTE der må skrive reglen — og kun disse to linjer. */
const MOTORENS_EGNE_LINJER = [
  'const faerdig = !parkeret && (input.status === "completed" || progress >= 100);',
];

const AFVIGERE: Array<{ sti: string; regel: string; hvorfor: string }> = [
  // Bevidst afvigelse: ugefokus T3 er et LAVERE loft (under halvvejs med
  // frist inden 14 dage) — en tekstlig påmindelse, ikke en tilstand.
  { sti: "supabase/functions/generate-weekly-focus/index.ts", regel: '.lt("progress", 50)', hvorfor: "T3 MILESTONE_DUE_SOON: bevidst tærskel < 50" },
  { sti: "supabase/functions/generate-weekly-focus/index.ts", regel: '.lt("progress", 100)', hvorfor: "T4 MILESTONE_STALLED: bør kalde afgoerMilepael(…).aktiv" },
  // Uden for 8/9-omgangens stier: boardroom er det andet vindue.
  { sti: "src/components/hjemmebane/boardroom/nextStep.ts", regel: 'm.progress < 100 && m.status !== "parked"', hvorfor: "forsidens «Dit næste skridt»: bør kalde afgoerMilepael (boardroom-mappen, andet vindue)" },
  { sti: "src/components/hjemmebane/boardroom/BoardroomView.tsx", regel: "m.progress >= 100", hvorfor: "milestonesDone-tællingen (boardroom-mappen, andet vindue)" },
  { sti: "supabase/functions/run-company-agent/index.ts", regel: 'progress >= 100 ? "completed" : "active"', hvorfor: "agentens skrivevej: bør kalde statusEfterFremgang" },
  { sti: "supabase/functions/ai-data-chat/index.ts", regel: '.lt("progress", 100)', hvorfor: "AI-kontekst «aktive milestones»" },
  // Arv (gamle app-flader, ikke Hjemmebane) — springes over hvis slettet.
  { sti: "src/components/MilestonesList.tsx", regel: "if (progress >= 100) return \"done\";", hvorfor: "den gamle liste, urørt siden konverteringen (ikke routet)" },
  { sti: "src/components/DashboardMilestones.tsx", regel: 'm.status !== "completed" && m.progress < 100', hvorfor: "gammel dashboard-flade" },
  { sti: "src/components/DashboardActionCenter.tsx", regel: '.lt("progress", 100)', hvorfor: "gammel dashboard-flade" },
  { sti: "src/components/CommunityProgress.tsx", regel: "m.progress >= 100", hvorfor: "gammel community-flade" },
  { sti: "src/components/AdvisorAlertsPanel.tsx", regel: '.lt("deadline", now)', hvorfor: "renderes aldrig (opgave-model-design §6.4)" },
  { sti: "src/components/AdvisorDashboard.tsx", regel: "m.progress >= 100", hvorfor: "gammel milestone-bar i rådgiverforsiden" },
  { sti: "src/components/ActivityFeed.tsx", regel: "ms.progress >= 100", hvorfor: "gammel aktivitetsfeed" },
  { sti: "src/components/DashboardActivity.tsx", regel: "ms.progress >= 100", hvorfor: "gammel aktivitetsfeed" },
  { sti: "src/pages/LegatDashboard.tsx", regel: "progress === 100", hvorfor: "gammel legat-flade" },
  { sti: "src/demo/DemoMilestones.tsx", regel: "if (progress >= 100) return \"done\";", hvorfor: "demo" },
];

/** Mønstrene for «egen regel» — på kommentar-strippet kilde (linjebevarende). */
const MOENSTRE: Array<{ navn: string; re: RegExp }> = [
  { navn: "progress mod 100/50", re: /\bprogress\b\s*(>=|<=|<|>|===|!==|==|!=)\s*(100|50)\b/ },
  { navn: "query-filter på progress", re: /\.(lt|lte|gt|gte|neq|eq)\(\s*["']progress["']/ },
  { navn: "milepælens status mod completed/done", re: /(?:^|[^.\w])(?:status|dbStatus)\s*(===|!==|==|!=)\s*["'](completed|done)["']|\b(?:m|ms|milestone|row)\.(?:status|dbStatus)\s*(===|!==|==|!=)\s*["'](completed|done)["']/ },
  { navn: "query-filter på status completed", re: /\.(neq|eq)\(\s*["']status["']\s*,\s*["']completed["']/ },
  { navn: "query-filter på deadline", re: /\.(lt|lte|gt|gte)\(\s*["']deadline["']/ },
  { navn: "deadline.getTime() mod nu", re: /deadline[^\n]*\.getTime\(\)\s*[<>]|[<>]=?\s*[^\n]*deadline\)?\.getTime\(\)/ },
  { navn: "deadline sammenlignet direkte med nu", re: /\.deadline\)?\s*[<>]=?\s*(now|nu|today|idag|iDag)\b|\b(now|nu|today|idag|iDag)\s*[<>]=?\s*\w+\.deadline\b/ },
];

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

function egneRegler(sti: string): string[] {
  const linjer = strip(laes(sti)).split("\n");
  const fund: string[] = [];
  linjer.forEach((linje, i) => {
    if (MOTORENS_EGNE_LINJER.some((l) => linje.includes(l)) && sti === "src/lib/milepaelDom.ts") return;
    const m = MOENSTRE.find((p) => p.re.test(linje));
    if (m) fund.push(`${sti}:${i + 1} [${m.navn}] ${linje.trim()}`);
  });
  return fund;
}

describe("milepælenes dom — de dækkede flader bærer ingen egen regel", () => {
  for (const sti of DAEKKEDE) {
    it(`${sti}: ingen progress-/status-/deadline-regel uden om motoren`, () => {
      expect(egneRegler(sti), "fladen dømmer selv — kald afgoerMilepael i stedet").toEqual([]);
    });
  }

  it("de dækkede flader, der viser milepæle, kalder motoren (direkte eller gennem useMilestones)", () => {
    expect(laes("src/components/hjemmebane/milestones/useMilestones.ts")).toContain("afgoerMilepael(");
    expect(laes("src/components/hjemmebane/virksomhed/VirksomhedView.tsx")).toContain("afgoerMilepael(");
    for (const sti of ["HbMilestoneRaekke.tsx", "MilestonesView.tsx", "MilestoneDialoger.tsx"]) {
      expect(strip(laes(`src/components/hjemmebane/milestones/${sti}`)), `${sti} læser ikke dommen`).toContain(".dom.");
    }
  });

  it("motoren selv bærer reglen præcis én gang", () => {
    const kode = strip(laes("src/lib/milepaelDom.ts"));
    for (const l of MOTORENS_EGNE_LINJER) expect(kode.split(l).length - 1).toBe(1);
  });
});

describe("milepælenes dom — afvigerne bærer STADIG deres egen regel (flyt til DÆKKEDE når de kobles på)", () => {
  for (const { sti, regel, hvorfor } of AFVIGERE) {
    it(`${sti}: «${regel}» (${hvorfor})`, () => {
      if (!existsSync(resolve(process.cwd(), sti))) return;
      expect(strip(laes(sti)), `reglen er væk — er fladen koblet på motoren? Flyt den så til DAEKKEDE`).toContain(regel);
    });
  }

  it("ingen afviger står også som dækket", () => {
    for (const { sti } of AFVIGERE) expect(DAEKKEDE).not.toContain(sti);
  });
});
