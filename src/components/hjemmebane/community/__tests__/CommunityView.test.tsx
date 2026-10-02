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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  hentFeed: vi.fn(),
  saetReaktion: vi.fn(),
  markerSpoergsmaal: vi.fn(),
}));
vi.mock("@/lib/hjemmebane/communityApi", () => ({
  hentFeed: api.hentFeed,
  saetReaktion: api.saetReaktion,
  notificerNaevnelser: vi.fn(async () => {}),
  notificerNytOpslag: vi.fn(async () => {}),
  opretTraad: vi.fn(async () => "ny"),
  hentCommunityMedlemmer: vi.fn(async () => []),
  markerSpoergsmaal: api.markerSpoergsmaal,
}));
const katalog = vi.hoisted(() => ({ listMemberDirectory: vi.fn(async () => [] as unknown[]) }));
vi.mock("@/lib/hjemmebane/memberProfile", () => ({
  listMemberDirectory: katalog.listMemberDirectory,
}));
const auth = vi.hoisted(() => ({ user: null as null | { id: string }, isAdvisor: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user, isAdvisor: auth.isAdvisor, profile: null, companyId: null, companyName: null }) }));
const visning = vi.hoisted(() => ({ viewingAsMember: false }));
vi.mock("@/hooks/useViewMode", () => ({ useViewMode: () => ({ viewingAsMember: visning.viewingAsMember, toggleViewMode: () => {} }) }));
/* Gæstedommen (2/10): false = som i dag; sættes til true i gæste-testen. Hooken selv er ren
   React Query over companies og prøves ikke her — dens dom er communityAdgang.test.ts. */
const gaestMock = vi.hoisted(() => ({ gaest: false as boolean | null }));
vi.mock("@/hooks/communityAdgang", () => ({ useCommunityGaest: () => gaestMock.gaest }));
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
  gaestMock.gaest = false;
  api.hentFeed.mockReset();
  api.saetReaktion.mockReset();
  api.markerSpoergsmaal.mockReset();
  katalog.listMemberDirectory.mockReset();
  katalog.listMemberDirectory.mockResolvedValue([]);
  auth.user = null;
  visning.viewingAsMember = false;
  auth.isAdvisor = false;
  toastMock.error.mockReset();
  api.hentFeed.mockResolvedValue([traad()]);
  api.saetReaktion.mockResolvedValue(true);
  api.markerSpoergsmaal.mockResolvedValue(undefined);
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

describe("Gæsten i feedet (2/10; Jonas 14/9: læser, skriver ikke)", () => {
  it("gæst: feedet vises, like-knappen er slået fra, grænsen står — ingen fejl, ingen toast", async () => {
    gaestMock.gaest = true;
    const li = await raekke();
    expect(within(li).getByRole("button", { name: "3" })).toBeDisabled();
    expect(screen.getByText("Som gæst kan du læse med — opslag, svar og reaktioner er for medlemmer.")).toBeInTheDocument();
    expect(api.saetReaktion).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
  it("dommen ukendt (null): hverken grænse eller aktiv like — intet blinker frem, før virksomheden er kendt", async () => {
    gaestMock.gaest = null;
    const li = await raekke();
    expect(within(li).getByRole("button", { name: "3" })).toBeDisabled();
    expect(screen.queryByText(/Som gæst kan du læse med/)).toBeNull();
  });
  it("ikke gæst: ingen grænse, like virker som før", async () => {
    const li = await raekke();
    expect(screen.queryByText(/Som gæst kan du læse med/)).toBeNull();
    expect(within(li).getByRole("button", { name: "3" })).not.toBeDisabled();
  });
});

/* ── Rådgivernes «Spørgsmål», filtret «Ubesvarede» og «Hvem kan hjælpe» (2/10) ── */

const raadgiverTraad = (over: Partial<Record<string, unknown>> = {}) =>
  traad({
    id: "q1",
    titel: "Hvad er din største udgift, du aldrig har forhandlet?",
    forfatter_id: "r1",
    forfatter_navn: "Jonas",
    kilde_type: null,
    // 9 svar fra 6 personer (forfatterens egne svar tæller ikke som personer).
    antal_svar: 9,
    antal_svarere: 6,
    antal_reaktioner: 0,
    spoergsmaal_markeret_at: "2026-10-02T07:30:00Z",
    jeg_har_svaret: false,
    created_at: "2026-09-20T07:30:00Z",
    seneste_aktivitet_at: "2026-09-20T07:30:00Z",
    ...over,
  });

const profil = (over: Partial<Record<string, unknown>> = {}) => ({
  user_id: "u2",
  full_name: "Mette Hansen",
  avatar_url: null,
  company_name: null,
  industry_label: null,
  company_description: null,
  website: null,
  linkedin_url: null,
  expertise: [],
  ask_me_about: null,
  working_on: null,
  working_on_updated_at: null,
  member_since: null,
  is_advisor: false,
  ...over,
});

describe("Community-feedet — rådgivernes «Spørgsmål» øverst (2/10)", () => {
  it("gæsten (2/10, læser, skriver ikke): kortet står, men knappen hedder «Læs tråden» — aldrig «Svar»", async () => {
    gaestMock.gaest = true;
    api.hentFeed.mockResolvedValue([raadgiverTraad(), traad({ seneste_aktivitet_at: "2026-10-01T07:30:00Z" })]);
    vis();
    const kort = (await screen.findByText("Spørgsmål fra rådgiverne")).closest("section")!;
    expect(within(kort).getByRole("link", { name: "Læs tråden" })).toHaveAttribute("href", "/community/q1");
    expect(within(kort).queryByRole("link", { name: "Svar" })).toBeNull();
  });
  it("det markerede opslag står ØVERST i sit eget kort, uden for strømmen — strømmen bærer kun det andet opslag", async () => {
    api.hentFeed.mockResolvedValue([raadgiverTraad(), traad({ seneste_aktivitet_at: "2026-10-01T07:30:00Z" })]);
    vis();
    const kort = (await screen.findByText("Spørgsmål fra rådgiverne")).closest("section")!;
    expect(within(kort).getByRole("link", { name: "Hvad er din største udgift, du aldrig har forhandlet?" })).toHaveAttribute("href", "/community/q1");
    expect(within(kort).getByText("6 har svaret")).toBeInTheDocument();
    expect(within(kort).getByRole("link", { name: "Svar" })).toHaveAttribute("href", "/community/q1");
    // Strømmen (ul) har kun Mettes opslag — spørgsmålet er ikke også en række.
    const liste = screen.getByText("Hej, jeg er Mette").closest("ul")!;
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    // Et medlem (ikke rådgiver) ser ingen «Fjern»-knap.
    expect(screen.queryByRole("button", { name: "Fjern Spørgsmål-markeringen" })).toBeNull();
  });

  it("har læseren svaret, er spørgsmålet foldet til ÉN linje med «du har svaret»", async () => {
    auth.user = { id: "u9" };
    api.hentFeed.mockResolvedValue([raadgiverTraad({ jeg_har_svaret: true }), traad()]);
    vis();
    const linje = await screen.findByText("Hvad er din største udgift, du aldrig har forhandlet?");
    expect(linje.closest("[data-spoergsmaal]")).toHaveAttribute("data-spoergsmaal", "foldet");
    expect(screen.getByText(/du har svaret · 6 har svaret/)).toBeInTheDocument();
    expect(screen.queryByText("Spørgsmål fra rådgiverne")).toBeNull();
  });

  it("FØR migrationen (ingen spoergsmaal_markeret_at i svaret) tegnes intet kort — feedet som i dag", async () => {
    api.hentFeed.mockResolvedValue([traad(), traad({ id: "t2", titel: "Et andet opslag", forfatter_id: "u3" })]);
    vis();
    await screen.findByText("Hej, jeg er Mette");
    expect(screen.queryByText("Spørgsmål fra rådgiverne")).toBeNull();
    expect(screen.queryByText("Spørgsmål")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("rådgiveren kan fjerne markeringen fra kortet — markerSpoergsmaal(id, false), og feedet hentes igen", async () => {
    auth.user = { id: "r1" };
    auth.isAdvisor = true;
    api.hentFeed.mockResolvedValueOnce([raadgiverTraad(), traad()]).mockResolvedValueOnce([raadgiverTraad({ spoergsmaal_markeret_at: null }), traad()]);
    vis();
    const knap = await screen.findByRole("button", { name: "Fjern Spørgsmål-markeringen" });
    await act(async () => {
      fireEvent.click(knap);
    });
    expect(api.markerSpoergsmaal).toHaveBeenCalledWith("q1", false);
    await waitFor(() => expect(screen.queryByText("Spørgsmål fra rådgiverne")).toBeNull());
    expect(api.hentFeed).toHaveBeenCalledTimes(2);
    // Opslaget er stadig i strømmen — kun markeringen er væk.
    expect(screen.getByRole("link", { name: "Hvad er din største udgift, du aldrig har forhandlet?" })).toBeInTheDocument();
  });

  it("filtret «Ubesvarede (N)» viser kun MEDLEMMERS opslag uden svar — rådgiverens eget tælles ikke, og spørgsmålet er aldrig med", async () => {
    katalog.listMemberDirectory.mockResolvedValue([profil({ user_id: "r1", full_name: "Jonas", is_advisor: true }), profil()]);
    api.hentFeed.mockResolvedValue([
      raadgiverTraad(),
      traad({ id: "m1", titel: "Hvordan prissætter I serviceaftaler?", forfatter_id: "u2", antal_svar: 0 }),
      traad({ id: "m2", titel: "Besvaret opslag", forfatter_id: "u2", antal_svar: 2 }),
      traad({ id: "r2", titel: "Rådgiverens andet opslag", forfatter_id: "r1", antal_svar: 0 }),
    ]);
    vis();
    const chip = await screen.findByRole("button", { name: "Ubesvarede (1)" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/ubesvaret · 4 visninger/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(chip);
    });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    const liste = screen.getByText("Hvordan prissætter I serviceaftaler?").closest("ul")!;
    expect(within(liste).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Besvaret opslag")).toBeNull();
    expect(screen.queryByText("Rådgiverens andet opslag")).toBeNull();
    // Spørgsmålet står stadig øverst — filtret rører kun strømmen.
    expect(screen.getByText("Spørgsmål fra rådgiverne")).toBeInTheDocument();
  });

  it("«N har svaret» er PERSONER (antal_svarere) — uden tallet siges «N svar» af antal_svar, aldrig «har svaret»", async () => {
    api.hentFeed.mockResolvedValue([raadgiverTraad({ antal_svarere: undefined }), traad()]);
    vis();
    const kort = (await screen.findByText("Spørgsmål fra rådgiverne")).closest("section")!;
    expect(within(kort).getByText("9 svar")).toBeInTheDocument();
    expect(within(kort).queryByText(/har svaret/)).toBeNull();
  });

  it("et tomt «Ubesvarede» siger «Ingen ubesvarede blandt de seneste opslag.» — feedet er de seneste, ikke alle", async () => {
    katalog.listMemberDirectory.mockResolvedValue([profil({ user_id: "r1", full_name: "Jonas", is_advisor: true }), profil()]);
    api.hentFeed.mockResolvedValue([raadgiverTraad(), traad({ id: "m2", titel: "Besvaret opslag", forfatter_id: "u2", antal_svar: 2 })]);
    vis();
    const chip = await screen.findByRole("button", { name: "Ubesvarede" });
    await act(async () => {
      fireEvent.click(chip);
    });
    expect(screen.getByText("Ingen ubesvarede blandt de seneste opslag.")).toBeInTheDocument();
  });

  it("en rådgiver, der SER SOM MEDLEM, ser hverken «Fjern Spørgsmål-markeringen» eller markér-feltet", async () => {
    auth.user = { id: "r1" };
    auth.isAdvisor = true;
    visning.viewingAsMember = true;
    api.hentFeed.mockResolvedValue([raadgiverTraad(), traad()]);
    vis();
    await screen.findByText("Spørgsmål fra rådgiverne");
    expect(screen.queryByRole("button", { name: "Fjern Spørgsmål-markeringen" })).toBeNull();
    expect(document.querySelector("[data-marker-spoergsmaal]")).toBeNull();
  });

  it("«Hvem kan hjælpe med …»: højst tre medlemmer med tekst, aldrig rådgivere, og mit eget tomme kort med «Skriv én linje»", async () => {
    auth.user = { id: "mig" };
    katalog.listMemberDirectory.mockResolvedValue([
      profil({ user_id: "mig", full_name: "Mig Selv", ask_me_about: null }),
      profil({ user_id: "a", full_name: "Anne", ask_me_about: "eksport til Tyskland, told" }),
      profil({ user_id: "b", full_name: "Bent", ask_me_about: "at ansætte den første sælger" }),
      profil({ user_id: "c", full_name: "Carl", ask_me_about: "generationsskifte" }),
      profil({ user_id: "d", full_name: "Dorte", ask_me_about: "webshop" }),
      profil({ user_id: "r1", full_name: "Jonas", is_advisor: true, ask_me_about: "alt" }),
      profil({ user_id: "e", full_name: "Erik", ask_me_about: null }),
    ]);
    vis();
    const sektion = (await screen.findByText("Hvem kan hjælpe med …")).closest("section")!;
    const kort = within(sektion).getAllByRole("listitem");
    expect(kort).toHaveLength(4); // tre andre + mig
    expect(within(sektion).queryByText("Jonas")).toBeNull();
    expect(within(sektion).queryByText("Erik")).toBeNull();
    expect(within(sektion).getByText("Dig")).toBeInTheDocument();
    expect(within(sektion).getByRole("link", { name: "Skriv én linje →" })).toHaveAttribute("href", "/settings?fane=profil");
    expect(within(sektion).getByRole("link", { name: "Alle medlemmer" })).toHaveAttribute("href", "/medlemmer");
  });
});
