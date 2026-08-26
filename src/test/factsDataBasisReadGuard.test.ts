/**
 * Læse-værn for data_basis-kontrakten (docs/data-basis-kontrakt.md):
 * Beregninger udelukker estimater. Visninger må vise dem, men skal sige det.
 *
 * En fil i src/ eller supabase/functions/ der læser financial_report_facts
 * skal ENTEN bruge data_basis i kode (filter, select eller skrivning) ELLER
 * bære en eksplicit undtagelses-kommentar med begrundelse:
 *   // data_basis-undtagelse: <hvorfor denne læser ikke filtrerer>
 *
 * Undtagelseslisten nedenfor er den fulde, eksplicitte liste — testen fejler
 * både hvis en ny ufiltreret læser dukker op UDEN markør, og hvis en fil får
 * markør uden at stå her. En ny undtagelse kræver altså både kommentaren i
 * filen (begrundelsen hos læseren) og en linje her (synligheden i værnet).
 *
 * Suppleret af skrive-værnet i factsDataBasisGuard.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

/** Den eksplicitte undtagelsesliste — filer der læser facts uden
    data_basis-filter, hver med sin begrundelse i filens egen markør. */
const FORVENTEDE_UNDTAGELSER = [
  "src/components/AdvisorDashboard.tsx",
  "src/components/hjemmebane/rapportering/RapporteringView.tsx",
  "src/pages/Members.tsx",
  "supabase/functions/_shared/companyHardDelete.ts",
  "supabase/functions/ai-data-chat/index.ts",
  "supabase/functions/detect-financial-alerts/index.ts",
  "supabase/functions/generate-weekly-focus/index.ts",
  "supabase/functions/nudge-report-no-reflection/index.ts",
  "supabase/functions/run-company-agent/index.ts",
  "supabase/functions/run-weekly-agent/index.ts",
  "supabase/functions/send-monthly-digest/index.ts",
  "supabase/functions/send-notification-email/index.ts",
  "supabase/functions/send-report-reminder/index.ts",
  "supabase/functions/update-annual-report-revenue/index.ts",
  "supabase/functions/validate-facts-parity/index.ts",
].sort();

const MARKER = /\/\/\s*data_basis-undtagelse:\s*\S+/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (["node_modules", "_test_fixtures", "__tests__"].includes(name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function relevantFiles(): string[] {
  return [...walk(join(ROOT, "src")), ...walk(join(ROOT, "supabase", "functions"))].filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".tsx")) &&
      !/[._]test\.tsx?$/.test(f) &&
      !f.includes(`${sep}src${sep}test${sep}`) &&
      // Genererede Supabase-typer nævner tabellen som relation — infrastruktur.
      !f.includes(`${sep}integrations${sep}supabase${sep}`),
  );
}

describe("data_basis-læseværn for financial_report_facts", () => {
  it("hver læser filtrerer på data_basis eller bærer en begrundet undtagelses-markør", () => {
    const udenDom: string[] = [];
    for (const file of relevantFiles()) {
      const raw = readFileSync(file, "utf8");
      const code = stripComments(raw);
      if (!code.includes("financial_report_facts")) continue;
      const brugerDataBasis = /\bdata_basis\b/.test(code);
      const harMarker = MARKER.test(raw);
      if (!brugerDataBasis && !harMarker) udenDom.push(relative(ROOT, file));
    }
    expect(
      udenDom,
      `Disse filer læser financial_report_facts uden at filtrere på data_basis og uden ` +
        `en "// data_basis-undtagelse: <begrundelse>"-markør. Beregninger udelukker estimater; ` +
        `en bevidst ufiltreret læser dokumenterer hvorfor: ${udenDom.join(", ")}`,
    ).toEqual([]);
  });

  it("undtagelseslisten matcher markørerne præcist — hverken flere eller færre", () => {
    const medMarker = relevantFiles()
      .filter((f) => MARKER.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f))
      .sort();
    expect(medMarker).toEqual(FORVENTEDE_UNDTAGELSER);
  });
});
