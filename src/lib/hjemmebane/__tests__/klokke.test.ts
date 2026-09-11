import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  erDrift,
  erUlaest,
  erUset,
  KLOKKE_LOFT,
  medlemsLinje,
  nyesteFoerst,
  pilleTekst,
  raadgiverLinje,
  raadgiverSti,
  taelUlaeste,
  taelUsete,
  type MedlemsNotifikation,
  type RaadgiverNotifikation,
} from "@/lib/hjemmebane/klokke";

const m = (over: Partial<MedlemsNotifikation> = {}): MedlemsNotifikation => ({
  id: "n1", title: "Din rapport er klar", body: null, priority: "important", deep_link: "/reports?reportId=r1",
  seen_at: null, read_at: null, created_at: "2026-09-10T10:00:00Z", ...over,
});
const r = (over: Partial<RaadgiverNotifikation> = {}): RaadgiverNotifikation => ({
  id: "a1", type: "report_uploaded", title: "Ny rapport", body: "Floren uploadede juli", company_id: "c1", member_id: "u1",
  reference_id: "r1", reference_type: "report", read_at: null, created_at: "2026-09-10T10:00:00Z", ...over,
});

describe("medlemmets tælling — useNotifications' regel", () => {
  it("uset OG vigtig tæller; info tæller ikke; set tæller ikke", () => {
    expect(erUset(m())).toBe(true);
    expect(erUset(m({ priority: "action_required" }))).toBe(true);
    expect(erUset(m({ priority: "info" }))).toBe(false);
    expect(erUset(m({ seen_at: "2026-09-10T11:00:00Z" }))).toBe(false);
    expect(taelUsete([m(), m({ priority: "info" }), m({ seen_at: "x" }), m({ id: "n4", priority: "action_required" })])).toBe(2);
  });
  it("læst men ikke set tæller stadig i pillen (seen_at er dommen, read_at er linjens)", () => {
    expect(erUset(m({ read_at: "x" }))).toBe(true);
    expect(medlemsLinje(m({ read_at: "x" })).ny).toBe(false);
  });
});

describe("rådgiverens tælling — AdvisorNotifications' regel", () => {
  it("ulæst tæller, læst ikke", () => {
    expect(erUlaest(r())).toBe(true);
    expect(erUlaest(r({ read_at: "x" }))).toBe(false);
    expect(taelUlaeste([r(), r({ id: "a2", read_at: "x" }), r({ id: "a3" })])).toBe(2);
  });
});

describe("pillen", () => {
  it("ingen pille ved 0, tallet ellers, loft 99+", () => {
    expect(pilleTekst(0)).toBeNull();
    expect(pilleTekst(-1)).toBeNull();
    expect(pilleTekst(1)).toBe("1");
    expect(pilleTekst(99)).toBe("99");
    expect(pilleTekst(100)).toBe("99+");
  });
});

describe("linjerne", () => {
  it("medlem: ny til read_at er sat; «Kræver handling» kun for action_required der ikke er læst", () => {
    expect(medlemsLinje(m())).toMatchObject({ ny: true, til: "/reports?reportId=r1", maerke: null });
    expect(medlemsLinje(m({ priority: "action_required" })).maerke).toBe("Kræver handling");
    expect(medlemsLinje(m({ priority: "action_required", read_at: "x" })).maerke).toBeNull();
  });
  it("rådgiver: drift står i samme liste, mærket «Drift», og fører til forsiden", () => {
    const d = r({ type: "drift", title: "Vault-nøglen mangler", company_id: null, reference_type: null, reference_id: null });
    expect(erDrift(d)).toBe(true);
    expect(raadgiverLinje(d)).toMatchObject({ maerke: "Drift", til: "/", ny: true });
  });
  it("rådgiverens veje er Hjemmebanes ruter — virksomhedssiden i ental (/virksomheder er listen)", () => {
    expect(raadgiverSti(r())).toBe("/virksomhed/c1?reportId=r1");
    expect(raadgiverSti(r({ reference_id: null }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ company_id: null }))).toBe("/virksomheder");
    expect(raadgiverSti(r({ reference_type: "handout" }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ reference_type: "ukendt_type", reference_id: null }))).toBe("/virksomhed/c1");
    expect(raadgiverSti(r({ reference_type: "chat", type: "new_message" }))).toBe("/chat");
    expect(raadgiverSti(r({ reference_type: "feedback", reference_id: "f9", type: "feedback_submitted" }))).toBe("/admin/feedback?feedbackId=f9");
    expect(raadgiverSti(r({ reference_type: null, company_id: null, type: "agent_insight" }))).toBeNull();
  });
  it("et fejlet træk fører til virksomhedssidens «Aftalen», hvor «Betaling» står", () => {
    expect(raadgiverSti(r({ type: "traek_fejlet", reference_type: "traek", reference_id: "t1" }))).toBe("/virksomhed/c1?section=aftale");
    expect(raadgiverSti(r({ type: "traek_fejlet", reference_type: "traek", reference_id: "t1", company_id: null }))).toBe("/virksomheder");
  });
  it("nyeste først, højst ti", () => {
    const liste = Array.from({ length: 14 }, (_, i) => r({ id: `a${i}`, created_at: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
    const ud = nyesteFoerst(liste);
    expect(ud).toHaveLength(KLOKKE_LOFT);
    expect(ud[0].id).toBe("a13");
    expect(ud[9].id).toBe("a4");
  });
});

/* KILDEVÆRN (11/9): klokken byggede /virksomheder/{id} i to dage, og ruten
   hedder /virksomhed/:companyId — flertalsformen ramte NotFound uden at
   nogen test kunne se det, for testen låste kun strengen. Ruten klokken
   bygger, skal findes i App.tsx som en <Route path="…">; listen og
   virksomhedssidens ankre ligeså. */
describe("kildeværn: klokkens veje findes som ruter", () => {
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const virksomhedView = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/virksomhed/VirksomhedView.tsx"), "utf8");
  const ruteFor = (sti: string) => `path="${sti.replace(/\/c1(\?.*)?$/, "/:companyId")}"`;

  it("virksomhedssiden: den rute klokken bygger står i App.tsx", () => {
    const sti = raadgiverSti(r({ reference_id: null }));
    expect(sti).toBe("/virksomhed/c1");
    expect(app).toContain(ruteFor(sti!)); // path="/virksomhed/:companyId"
  });
  it("listen: /virksomheder står i App.tsx", () => {
    expect(app).toContain('path="/virksomheder"');
  });
  it("trækket: ruten findes, og ?section=aftale peger på et anker der findes", () => {
    const sti = raadgiverSti(r({ reference_type: "traek", reference_id: "t1" }))!;
    expect(app).toContain(ruteFor(sti));
    const sektion = new URL(sti, "http://x").searchParams.get("section");
    expect(sektion).toBe("aftale");
    expect(virksomhedView).toContain(`id="section-${sektion}"`);
  });
});
