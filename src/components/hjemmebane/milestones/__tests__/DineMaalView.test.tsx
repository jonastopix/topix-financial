/**
 * DineMaalView — siden oppefra (fladen 1/10-2026): hovedet med chips, «Jeres
 * retning», målkortene + den stiplede plads, «Rejsen». Hentning og skrivning
 * mockes; motoren (maalTal) kører rigtigt gennem byggDineMaal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import { byggDineMaal, type DineMaalGrundlag } from "@/hooks/dineMaalGrundlag";
import { retningFraHandout } from "@/lib/hjemmebane/maalRetning";
import type { MaalMedTal } from "@/lib/hjemmebane/maalTal";
import { DINE_MAAL_OVERSKRIFT, KORT_ORD, REJSEN_ORD } from "@/lib/hjemmebane/dineMaalFlade";
import { RETNING_IKKE_SKREVET_TEKST, RETNING_INVITATION, RETNING_RET, RETNING_SKREVET_AF_ANDEN } from "../JeresRetning";

const NU = new Date("2026-10-01T10:00:00Z");
const m = (key: string, metrics: Record<string, number | null>): ScoreMaaned => ({ key, basis: "measured", foersteGodkendtAt: null, metrics });
const TRE = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

const maal = (over: Partial<MaalMedTal> = {}): MaalMedTal => ({
  id: "m1",
  title: "Omsætning på 2 mio. kr. i årstakt",
  status: "active",
  deadline: "2027-04-01",
  created_at: "2026-04-01T08:00:00Z",
  target_value: 2_000_000,
  current_value: null,
  unit: null,
  art: "tal",
  maal_noegle: "omsaetning_aarstakt",
  udgangspunkt: 1_000_000,
  udgangspunkt_dato: "2026-04-01",
  ...over,
});

const tilstand = vi.hoisted(() => ({
  grundlag: null as DineMaalGrundlag | null,
  retning: null as ReturnType<typeof retningFraHandout> | null,
  isLoading: false,
  isError: false,
  isAdvisor: false,
  /** Runde 2, fund 2: «Se som medlem» — rådgiveren er stadig rådgiver. */
  viewingAsMember: false,
  retningHenter: false,
  /** Fund 12: useMilestones kender kun disse id'er (null = alle i grundlaget). */
  kendteIder: null as string[] | null,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, companyId: "c1", isAdvisor: tilstand.isAdvisor }) }));
vi.mock("@/hooks/useViewMode", () => ({ useViewMode: () => ({ viewingAsMember: tilstand.viewingAsMember }) }));
vi.mock("@/hooks/dineMaalGrundlag", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/hooks/dineMaalGrundlag")>();
  return {
    ...orig,
    useDineMaalGrundlag: () => {
      const g = tilstand.grundlag;
      const bygget = g ? orig.byggDineMaal(g, NU) : null;
      return {
        grundlag: g ?? undefined,
        kort: bygget?.kort ?? [],
        tidslinje: bygget?.tidslinje ?? null,
        afventerMigration: false,
        tallenFejlede: false,
        isLoading: tilstand.isLoading,
        isError: tilstand.isError,
        error: null,
        retning: tilstand.retning,
        retningFejlede: false,
        retningHenter: tilstand.retningHenter,
        nu: NU,
      };
    },
    useDineMaalSkrivning: () => ({ opret: vi.fn(), goerSkarpt: vi.fn(), gemRetning: vi.fn() }),
  };
});
vi.mock("../useMilestones", () => ({
  useMilestones: () => ({
    milestones: (tilstand.grundlag?.maal ?? []).filter((x) => tilstand.kendteIder === null || tilstand.kendteIder.includes(x.id)).map((x) => ({
      id: x.id, title: x.title, deadline: x.deadline ? new Date(x.deadline) : null, status: "in_progress", dom: { aktiv: true, parkeret: false, faerdig: false, forfalden: false, tilstand: "i_gang" },
      description: null, source: "manual", source_report: null, progress: 0, category: "other", baseline: null, dbStatus: x.status,
      target_value: x.target_value, current_value: x.current_value, unit: x.unit, art: x.art, progress_updated_at: null, completed_at: null, created_at: x.created_at,
    })),
    loading: false,
    markerNaaet: vi.fn(),
    slet: vi.fn(),
    opdaterFelt: vi.fn(),
    genhent: vi.fn(),
  }),
}));

import { DineMaalView } from "../DineMaalView";

const vis = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DineMaalView />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  tilstand.isLoading = false;
  tilstand.isError = false;
  tilstand.isAdvisor = false;
  tilstand.viewingAsMember = false;
  tilstand.retningHenter = false;
  tilstand.kendteIder = null;
  tilstand.retning = retningFraHandout(null);
  tilstand.grundlag = {
    maal: [maal(), maal({ id: "m2", title: "Et gammelt mål", art: null, maal_noegle: null, udgangspunkt: null })],
    skridt: [{ id: "s1", title: "Ring til kunden", status: "done", due_date: null, maal_id: "m1", closed_at: "2026-09-10T00:00:00Z" }],
    maaneder: TRE,
    kontraktStart: "2026-04-01",
    afventerMigration: false,
  };
});
afterEach(cleanup);

describe("DineMaalView — siden oppefra", () => {
  it("hovedet: eyebrow med måneden, overskriften, hovedlinjen og chips fra motoren", () => {
    vis();
    expect(screen.getByText("Dine mål · oktober 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(DINE_MAAL_OVERSKRIFT);
    expect(document.querySelector("[data-hoved-linje]")!.textContent).toBe("2 mål for de næste 12 måneder · 1 plads ledig");
    expect(document.querySelector('[data-status-chip="paa_sporet"]')!.textContent).toBe("1 på sporet");
    expect(document.querySelector('[data-status-chip="kan_ikke_afgoeres"]')).toBeNull(); // det gamle mål tæller ikke som status
  });

  it("«Jeres retning» tom → invitationen; to kort (tal + gammelt) og den stiplede plads; Rejsen med det gjorte skridt", () => {
    vis();
    expect(screen.getByRole("button", { name: RETNING_INVITATION })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-maal-kort]")).toHaveLength(2);
    expect(document.querySelector('[data-maal-kort="m1"]')!.getAttribute("data-maal-status")).toBe("paa_sporet");
    expect(document.querySelector('[data-maal-kort="m2"]')!.getAttribute("data-maal-art")).toBe("gammel");
    expect(screen.getByRole("button", { name: KORT_ORD.goerSkarpt })).toBeInTheDocument();
    expect(document.querySelector("[data-maal-tom-plads]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: REJSEN_ORD.titel })).toBeInTheDocument();
    expect(document.querySelector("[data-rejsen]")!.getAttribute("data-rejsen")).toBe("punkter");
    expect(document.querySelector("[data-rejsen-start]")!.getAttribute("data-rejsen-start")).toBe("2026-04-01");
    // Ingen skyder, ingen blandet procent på siden
    expect(document.querySelector('input[type="range"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ %/);
  });

  it("tre aktive mål: ingen stiplet plads, hovedlinjen siger «ingen plads ledig»", () => {
    tilstand.grundlag!.maal = [maal(), maal({ id: "m2" }), maal({ id: "m3" })];
    vis();
    expect(document.querySelectorAll("[data-maal-kort]")).toHaveLength(3);
    expect(document.querySelector("[data-maal-tom-plads]")).toBeNull();
    expect(document.querySelector("[data-hoved-linje]")!.textContent).toBe("3 mål for de næste 12 måneder · ingen plads ledig");
  });

  it("ingen mål: «Hvad er et mål?» åben, den stiplede plads, hovedlinjen «Ingen mål endnu»", () => {
    tilstand.grundlag!.maal = [];
    tilstand.grundlag!.skridt = [];
    vis();
    expect(document.querySelector('[data-dine-maal="tom"] [data-maal-forklaring]')).not.toBeNull();
    expect(document.querySelector("[data-maal-tom-plads]")).not.toBeNull();
    expect(document.querySelector("[data-hoved-linje]")!.textContent).toBe("Ingen mål endnu · 3 pladser ledige");
  });

  it("henter: skelet uden spring; fejl: rolig linje med «Prøv igen»", () => {
    tilstand.isLoading = true;
    const { unmount } = vis();
    expect(document.querySelector('[data-dine-maal="henter"]')).not.toBeNull();
    expect(document.querySelector("[data-maal-kort]")).toBeNull();
    unmount();
    tilstand.isLoading = false;
    tilstand.isError = true;
    vis();
    expect(document.querySelector('[data-dine-maal="fejl"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Prøv igen" })).toBeInTheDocument();
    // Fund 7: ved fejl står hverken hovedlinje («Ingen mål endnu · 3 pladser ledige») eller chips
    expect(document.querySelector("[data-hoved-linje]")).toBeNull();
    expect(document.querySelector("[data-status-chip]")).toBeNull();
  });
});

describe("DineMaalView — fund 12: et kort uden dom kan intet", () => {
  it("mangler dommen kortets id (useMilestones kender det ikke), er alle handlinger false — ingen «Tilføj skridt», ingen menupunkter", () => {
    tilstand.kendteIder = ["m2"];
    vis();
    const kort = document.querySelector('[data-maal-kort="m1"]')!;
    expect(kort.querySelector('[data-handling="tilfoej-skridt"]')).toBeNull();
    fireEvent.click(kort.querySelector("[data-maal-menu]")!);
    expect(kort.querySelectorAll('[role="menuitem"]:not([data-handling="rediger"])')).toHaveLength(0);
  });
});

describe("DineMaalView — rådets fund 3, 6 og 14", () => {
  const udfyldtAfAnden = () => retningFraHandout({ id: "h1", user_id: "u-medlem", module: "overordnet", updated_at: "2026-09-01T00:00:00Z", responses: { lykkedes_12mdr: "2 mio. i årstakt", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" } });

  it("fund 3: rådgiveren ser retningen, men hverken «Ret» eller invitationen", () => {
    tilstand.isAdvisor = true;
    tilstand.retning = udfyldtAfAnden();
    const { unmount } = vis();
    expect(screen.getByText("2 mio. i årstakt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RETNING_RET })).toBeNull();
    expect(document.querySelector("[data-retning-kan-rette]")!.getAttribute("data-retning-kan-rette")).toBe("0");
    // Fund 14: rækken er et medlems — «Skrevet af en anden i virksomheden»
    expect(document.querySelector("[data-retning-skrevet-af-anden]")!.textContent).toContain(RETNING_SKREVET_AF_ANDEN);
    unmount();
    tilstand.retning = retningFraHandout(null);
    vis();
    expect(screen.queryByRole("button", { name: RETNING_INVITATION })).toBeNull();
    expect(screen.getByText(RETNING_IKKE_SKREVET_TEKST)).toBeInTheDocument();
  });

  it("runde 2, fund 2: rådgiveren i «Se som medlem» kan stadig ikke rette retningen — den RÅ rolle dømmer", () => {
    tilstand.isAdvisor = true;
    tilstand.viewingAsMember = true;
    tilstand.retning = udfyldtAfAnden();
    vis();
    expect(screen.getByText("2 mio. i årstakt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RETNING_RET })).toBeNull();
    expect(document.querySelector("[data-retning-kan-rette]")!.getAttribute("data-retning-kan-rette")).toBe("0");
  });

  it("medlemmet ser «Ret» på egen række — og ikke «Skrevet af en anden»", () => {
    tilstand.retning = retningFraHandout({ id: "h1", user_id: "u1", module: "overordnet", updated_at: null, responses: { lykkedes_12mdr: "x", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" } });
    vis();
    expect(screen.getByRole("button", { name: RETNING_RET })).toBeInTheDocument();
    expect(document.querySelector("[data-retning-skrevet-af-anden]")).toBeNull();
  });

  it("fund 6: mens retningen henter, står skelettet — ikke invitationen (en tom kladde kunne ellers åbnes oven på et svar)", () => {
    tilstand.retning = null;
    tilstand.retningHenter = true;
    vis();
    expect(document.querySelector("[data-retning]")!.getAttribute("data-retning")).toBe("henter");
    expect(screen.queryByRole("button", { name: RETNING_INVITATION })).toBeNull();
  });
});
