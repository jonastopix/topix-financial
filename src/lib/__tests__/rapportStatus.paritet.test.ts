import { describe, expect, it } from "vitest";
import { deriveFocus, type FocusInputs } from "../../components/hjemmebane/boardroom/nextStep";
import {
  DANISH_MONTHS,
  getEffectiveReportPeriodKey,
  parseReportPeriodToKey,
  type ReportData,
} from "../financialUtils";
import {
  DANSKE_MAANEDER,
  effektivRapportPeriodeKey,
  forrigePeriode,
  parsRapportPeriodeTilKey,
  rapporteringsStatus,
} from "../../../supabase/functions/_shared/rapportStatus.ts";

// Paritetsværn — Deno-spejlet i supabase/functions/_shared/rapportStatus.ts
// skal dømme identisk med forsidens fokus-motor (deriveFocus, punkterne
// missing-report/pending-approval) og periode-hjælperne i financialUtils.
// Fejler denne blok, er spejlet drevet fra motoren og skal
// re-synkroniseres. Samme mønster som opgaveUdloeb.paritet.test.ts.

/** Minimal FocusInputs: alle andre kilder neutraliseret, så kun
    rapport-dommen kan producere punkter. hasPulseThisMonth=true holder
    pulse-nudgen (der også læser processed/committed) ude af billedet. */
function fokusInputs(
  processed: ReadonlySet<string>,
  committed: ReadonlySet<string>,
  now: Date,
): FocusInputs {
  return {
    now,
    processedPeriodKeys: processed,
    committedPeriodKeys: committed,
    milestones: [],
    hasPulseThisMonth: true,
    unreadUserMessages: 0,
    unreadAgentMessages: 0,
    weeklyFocus: null,
    openActions: [],
    unlinkedLevers: [],
    askMeAboutMissing: false,
  };
}

// Midt på året, årsskifte (januar → december året før) og skudårs-nabo.
const DATOER = [
  new Date(2026, 7, 25), // august 2026 → forrige = juli 2026
  new Date(2026, 0, 15), // januar 2026 → forrige = december 2025
  new Date(2026, 2, 1), // 1. marts → forrige = februar
];

describe("rapportStatus — paritet mellem _shared-spejlet og deriveFocus", () => {
  it("forrigePeriode matcher deriveFocus' prevKey og månedsnavn", () => {
    for (const now of DATOER) {
      const dom = forrigePeriode(now);
      // deriveFocus' egen beregning aflæses via missing-report-titlen
      // ("Upload dine <måned>-tal") med tomme sæt.
      const focus = deriveFocus(fokusInputs(new Set(), new Set(), now));
      const missing = focus.find((f) => f.kind === "missing-report");
      expect(missing, `missing-report mangler for ${now.toISOString()}`).toBeTruthy();
      expect(missing!.title).toBe(`Upload dine ${dom.maanedNavn}-tal`);
      expect(missing!.description).toContain(`${dom.maanedNavn} ${dom.aar}`);
    }
  });

  it("tre-vejs-dommen matcher deriveFocus' punkter for alle kombinationer", () => {
    for (const now of DATOER) {
      const { key } = forrigePeriode(now);
      const kombinationer: Array<{
        processed: Set<string>;
        committed: Set<string>;
        forventet: "mangler" | "uploadet_ikke_godkendt" | "rapporteret";
      }> = [
        { processed: new Set(), committed: new Set(), forventet: "mangler" },
        // committed uden processed er datalogisk umulig i prod, men dommen
        // skal stadig følge motoren: !hasProcessed → mangler.
        { processed: new Set(), committed: new Set([key]), forventet: "mangler" },
        { processed: new Set([key]), committed: new Set(), forventet: "uploadet_ikke_godkendt" },
        { processed: new Set([key]), committed: new Set([key]), forventet: "rapporteret" },
      ];
      for (const k of kombinationer) {
        const dom = rapporteringsStatus(k.processed, k.committed, now);
        expect(dom.status).toBe(k.forventet);
        const focus = deriveFocus(fokusInputs(k.processed, k.committed, now));
        const harMissing = focus.some((f) => f.kind === "missing-report");
        const harPending = focus.some((f) => f.kind === "pending-approval");
        expect(harMissing).toBe(dom.status === "mangler");
        expect(harPending).toBe(dom.status === "uploadet_ikke_godkendt");
      }
    }
  });

  it("månedslisten er identisk med DANISH_MONTHS", () => {
    expect(DANSKE_MAANEDER).toEqual(DANISH_MONTHS);
  });

  it("parsRapportPeriodeTilKey matcher parseReportPeriodToKey", () => {
    const eksempler = [
      "Juli 2026",
      "december 2025",
      "Rapport for marts 2024",
      "MAJ 2026",
      "Q2 2026",
      "2026",
      "",
      null,
    ];
    for (const period of eksempler) {
      expect(parsRapportPeriodeTilKey(period)).toBe(parseReportPeriodToKey(period));
    }
  });

  it("effektivRapportPeriodeKey matcher getEffectiveReportPeriodKey", () => {
    const rapporter: ReportData[] = [
      // Anvendt override vinder over periode-teksten.
      {
        id: "1",
        report_period: "Juli 2026",
        extracted_data: null,
        status: "processed",
        manual_report_period_key: "2026-06",
        manual_override_status: "applied",
      },
      // Draft-override tæller ikke — periode-teksten parses.
      {
        id: "2",
        report_period: "Juli 2026",
        extracted_data: null,
        status: "processed",
        manual_report_period_key: "2026-06",
        manual_override_status: "draft",
      },
      // Ingen override, uparsbar tekst → null.
      { id: "3", report_period: "Q2 2026", extracted_data: null, status: "processed" },
      { id: "4", report_period: null, extracted_data: null, status: "processed" },
    ];
    for (const r of rapporter) {
      expect(effektivRapportPeriodeKey(r)).toBe(getEffectiveReportPeriodKey(r));
    }
  });
});
