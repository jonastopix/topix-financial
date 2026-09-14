/**
 * Community-feedet — like fra feedet (14/9, mangellistens w18).
 *
 * Låser: tallet i knappen er RPC'ens antal_reaktioner (og hjertet følger
 * jeg_har_reageret); et klik på hjertet kalder saetReaktion({ traadId })
 * og navigerer IKKE til tråden; et klik på titlen (og dermed rækken, som
 * er strakt med ::after) navigerer; efter et like hentes feedet igen og
 * tallet er databasens, ikke klientens gæt; en fejl bliver en toast.
 *
 * communityApi, memberProfile, useAuth, sonner og supabase-klienten er
 * mocket — feedet rendres i en MemoryRouter med en rute for tråden, så
 * navigation kan ses. Brugeren er null, så composeren (Tiptap) ikke
 * monterer; feedet og knappen afhænger ikke af den.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  hentFeed: vi.fn(),
  saetReaktion: vi.fn(),
}));
vi.mock("@/lib/hjemmebane/communityApi", () => ({
  hentFeed: api.hentFeed,
  saetReaktion: api.saetReaktion,
  notificerNaevnelser: vi.fn(async () => {}),
  notificerNytOpslag: vi.fn(async () => {}),
  opretTraad: vi.fn(async () => "ny"),
  hentCommunityMedlemmer: vi.fn(async () => []),
}));
vi.mock("@/lib/hjemmebane/memberProfile", () => ({
  listMemberDirectory: vi.fn(async () => []),
  getMyMemberProfile: vi.fn(async () => null),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, profile: null, companyId: null, companyName: null }) }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({}) }) } }));

import { CommunityView } from "../CommunityView";

const traad = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "t1",
  titel: "Hej, jeg er Mette",
  indhold: "",
  indhold_json: null,
  forfatter_id: "u2",
  forfatter_navn: "Mette Hansen",
  forfatter_avatar_url: null,
  status: "aktiv",
  fastgjort: false,
  kilde_type: "praesentation",
  antal_svar: 0,
  antal_visninger: 4,
  antal_reaktioner: 3,
  jeg_har_reageret: false,
  seneste_aktivitet_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...over,
});

const vis = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/community"]}>
        <Routes>
          <Route path="/community" element={<CommunityView />} />
          <Route path="/community/:id" element={<p data-testid="traadsiden">Trådsiden</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** Rendrer feedet og giver rækken for den ene tråd. */
const raekke = async () => {
  vis();
  return (await screen.findByText("Hej, jeg er Mette")).closest("li")!;
};

beforeEach(() => {
  api.hentFeed.mockReset();
  api.saetReaktion.mockReset();
  toastMock.error.mockReset();
  api.hentFeed.mockResolvedValue([traad()]);
  api.saetReaktion.mockResolvedValue(true);
});
afterEach(cleanup);

describe("Community-feedet — like fra feedet", () => {
  it("tallet i knappen er RPC'ens antal_reaktioner, og hjertet er tomt når jeg_har_reageret er false", async () => {
    const li = await raekke();
    const knap = within(li).getByRole("button", { name: "3" });
    expect(knap).toHaveAttribute("aria-pressed", "false");
    expect(knap).toHaveAttribute("title", "Synes godt om");
    expect(li.querySelector("button svg")).not.toHaveClass("fill-hb-evergreen");
  });

  it("et klik på hjertet kalder saetReaktion med trådens id — og navigerer IKKE til tråden", async () => {
    const li = await raekke();
    await act(async () => {
      fireEvent.click(within(li).getByRole("button", { name: "3" }));
    });
    expect(api.saetReaktion).toHaveBeenCalledTimes(1);
    expect(api.saetReaktion).toHaveBeenCalledWith({ traadId: "t1" });
    expect(screen.queryByTestId("traadsiden")).toBeNull();
    expect(screen.getByText("Hej, jeg er Mette")).toBeInTheDocument();
  });

  it("knappen står UDEN FOR linket — ingen <button> inde i et <a>", async () => {
    const li = await raekke();
    const knap = within(li).getByRole("button", { name: "3" });
    expect(knap.closest("a")).toBeNull();
    expect(within(li).getByRole("link", { name: "Hej, jeg er Mette" })).toHaveAttribute("href", "/community/t1");
  });

  it("et klik på titlen åbner tråden, som før", async () => {
    const li = await raekke();
    fireEvent.click(within(li).getByRole("link", { name: "Hej, jeg er Mette" }));
    expect(await screen.findByTestId("traadsiden")).toBeInTheDocument();
  });

  it("efter et like hentes feedet igen, og tallet er databasens (4, fyldt hjerte) — ikke klientens gæt", async () => {
    api.hentFeed.mockResolvedValueOnce([traad()]).mockResolvedValueOnce([traad({ antal_reaktioner: 4, jeg_har_reageret: true })]);
    const li = await raekke();
    await act(async () => {
      fireEvent.click(within(li).getByRole("button", { name: "3" }));
    });
    const knap = await within(li).findByRole("button", { name: "4" });
    expect(knap).toHaveAttribute("aria-pressed", "true");
    expect(knap).toHaveAttribute("title", "Fjern reaktion");
    expect(api.hentFeed).toHaveBeenCalledTimes(2);
  });

  it("en fejl fra saetReaktion bliver en toast med motorens besked — og feedet står stadig", async () => {
    api.saetReaktion.mockRejectedValueOnce(new Error("Ingen adgang til community"));
    const li = await raekke();
    await act(async () => {
      fireEvent.click(within(li).getByRole("button", { name: "3" }));
    });
    expect(toastMock.error).toHaveBeenCalledWith("Reaktionen blev ikke gemt", { description: "Ingen adgang til community" });
    expect(screen.getByText("Hej, jeg er Mette")).toBeInTheDocument();
    expect(within(li).getByRole("button", { name: "3" })).not.toBeDisabled();
  });
});
