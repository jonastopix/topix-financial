/**
 * Klokkens vej for et nyt opslag i Community (16/9): reference_type
 * 'community_traad' fører rådgiveren til tråden — /community/{reference_id},
 * uden reference_id til feedet. Ruten findes i App.tsx (kildeværn, som
 * klokke.test.ts' «kildeværn: klokkens veje findes som ruter»).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { raadgiverLinje, raadgiverSti, type RaadgiverNotifikation } from "@/lib/hjemmebane/klokke";

const r = (over: Partial<RaadgiverNotifikation> = {}): RaadgiverNotifikation => ({
  id: "n1",
  type: "community_opslag",
  title: "Mette Hansen har skrevet et nyt opslag",
  body: "Hvem har prøvet at ansætte sin første sælger?",
  company_id: "c1",
  member_id: "u2",
  reference_id: "t1",
  reference_type: "community_traad",
  read_at: null,
  created_at: "2026-09-16T10:00:00Z",
  ...over,
});

describe("raadgiverSti — community_traad", () => {
  it("fører til tråden — ikke til virksomhedssiden, selv om company_id er sat", () => {
    expect(raadgiverSti(r())).toBe("/community/t1");
  });
  it("uden reference_id: feedet", () => {
    expect(raadgiverSti(r({ reference_id: null }))).toBe("/community");
  });
  it("uden company_id: stadig tråden (vejen afhænger ikke af virksomheden)", () => {
    expect(raadgiverSti(r({ company_id: null }))).toBe("/community/t1");
  });
  it("linjen: ny, uden mærke, med trådens vej og titlen ordret", () => {
    expect(raadgiverLinje(r())).toMatchObject({ ny: true, maerke: null, til: "/community/t1", titel: "Mette Hansen har skrevet et nyt opslag" });
  });
});

describe("kildeværn: ruterne findes, og rådgivere passerer MemberRoute", () => {
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  it("/community/:id og /community står i App.tsx som MemberRoute", () => {
    expect(app).toContain('<Route path="/community/:id" element={<MemberRoute><CommunityTraad /></MemberRoute>} />');
    expect(app).toContain('<Route path="/community" element={<MemberRoute><Community /></MemberRoute>} />');
  });
  it("MemberRoute har ingen isAdvisor-gate der sender rådgivere væk — kun legat og udløbet medlemskab (ikke rådgivere) omdirigeres", () => {
    const start = app.indexOf("const MemberRoute = (");
    const slut = app.indexOf("\n};", start);
    const blok = app.slice(start, slut);
    expect(blok).toContain('if (isLegat) return <Navigate to="/legat" replace />;');
    expect(blok).toContain('if (!isAdvisor && membershipTier === "expired"');
    expect(blok).not.toMatch(/if \(isAdvisor\) return <Navigate/);
  });
});
