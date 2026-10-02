/**
 * HandoutsView — medlemsgrenen i routeren (rådets fund 1–3, 2/10-2026).
 *
 * Fund 1: et medlem på /handouts?module=overordnet endte på en BLANK side —
 * <Navigate to=/milestones> blev overhalet af mount-effektens
 * setSearchParams({}) → /handouts. Nu rydder medlemsgrenen aldrig URL'en, og
 * dommen læser modulet direkte fra den. Her måles DESTINATIONEN i en
 * MemoryRouter — ikke kildeteksten.
 *   · overordnet → /milestones
 *   · salg       → editoren (HbHandoutDetail) på /handouts?module=salg&fra=…
 *                  (URL'en står urørt: reload og bogmærke holder — fund 3)
 *   · intet modul → /akademiet
 *   · abonnent    → listen (fund 2); uafgjort tier → ingen dom (spinner)
 * Editoren, auth og datalaget mockes; routeren er ægte.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const auth = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  companyId: "c1" as string | null,
  isAdvisor: false,
  isLegat: false,
  membershipTier: "full" as "full" | "subscriber" | "expired" | null,
  companyResolution: "resolved" as "pending" | "resolved" | "none" | "failed",
}));
const detalje = vi.hoisted(() => ({ kald: [] as Record<string, unknown>[] }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useViewMode", () => ({ useViewMode: () => ({ viewingAsMember: false }) }));
vi.mock("@/hooks/useNavigationReset", () => ({ useNavigationReset: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/handoutEngine", () => ({ loadHandoutSummaries: async () => [] }));
vi.mock("../HbHandoutDetail", () => ({
  HbHandoutDetail: (props: Record<string, unknown>) => {
    detalje.kald.push(props);
    return <output data-testid="editor">{String((props.config as { module: string }).module)}</output>;
  },
}));

import { HandoutsView } from "../HandoutsView";

const Sted = () => {
  const l = useLocation();
  return <output data-testid="sted">{`${l.pathname}${l.search}`}</output>;
};

const vis = (sti: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[sti]}>
        <Routes>
          <Route path="/handouts" element={<HandoutsView />} />
          <Route path="/milestones" element={<p>Dine mål</p>} />
          <Route path="/akademiet" element={<p>Akademiet</p>} />
        </Routes>
        <Sted />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const sted = () => screen.getByTestId("sted").textContent;

beforeEach(() => {
  auth.user = { id: "u1" };
  auth.companyId = "c1";
  auth.isAdvisor = false;
  auth.isLegat = false;
  auth.membershipTier = "full";
  auth.companyResolution = "resolved";
  detalje.kald = [];
});
afterEach(cleanup);

describe("HandoutsView — medlemmets gren i routeren", () => {
  it("fund 1: ?module=overordnet lander på /milestones — ikke en blank side, ikke /handouts", async () => {
    vis("/handouts?module=overordnet");
    await waitFor(() => expect(sted()).toBe("/milestones"));
    expect(screen.getByText("Dine mål")).toBeInTheDocument();
    expect(detalje.kald).toHaveLength(0);
  });

  it("fund 3: ?module=salg&fra=classroom/salg-2 åbner editoren, og URL'en står urørt (reload og bogmærke holder)", async () => {
    vis("/handouts?module=salg&fra=classroom%2Fsalg-2");
    expect(await screen.findByTestId("editor")).toHaveTextContent("salg");
    // Et par renders senere er URL'en stadig den samme — ingen rydning.
    await new Promise((r) => setTimeout(r, 20));
    expect(sted()).toBe("/handouts?module=salg&fra=classroom%2Fsalg-2");
    const props = detalje.kald.at(-1)!;
    expect(props.tilbageTilAkademiet).toBe(true);
    expect(props.fra).toBe("classroom/salg-2");
    expect(props.userId).toBeUndefined();
  });

  it("intet modul (eller et ukendt) → /akademiet", async () => {
    vis("/handouts");
    await waitFor(() => expect(sted()).toBe("/akademiet"));
    cleanup();
    vis("/handouts?module=ukendt");
    await waitFor(() => expect(sted()).toBe("/akademiet"));
    expect(detalje.kald).toHaveLength(0);
  });

  it("fund 2: abonnenten beholder listen — ingen redirect, intet editor-kald uden modul", async () => {
    auth.membershipTier = "subscriber";
    vis("/handouts");
    expect(await screen.findByText("Handouts")).toBeInTheDocument();
    expect(sted()).toBe("/handouts");
    expect(detalje.kald).toHaveLength(0);
  });

  it("abonnentens deep-link: ?module=overordnet åbner editoren (listens flade) og rydder parametret", async () => {
    auth.membershipTier = "subscriber";
    vis("/handouts?module=overordnet");
    expect(await screen.findByTestId("editor")).toHaveTextContent("overordnet");
    await waitFor(() => expect(sted()).toBe("/handouts"));
    expect(detalje.kald.at(-1)!.tilbageTilAkademiet).toBeUndefined();
  });

  it("uafgjort tier (companyResolution pending, tier null): ingen dom — hverken redirect eller editor", async () => {
    auth.membershipTier = null;
    auth.companyResolution = "pending";
    vis("/handouts?module=overordnet");
    await new Promise((r) => setTimeout(r, 20));
    expect(sted()).toBe("/handouts?module=overordnet");
    expect(detalje.kald).toHaveLength(0);
    expect(screen.queryByText("Dine mål")).toBeNull();
  });
});
