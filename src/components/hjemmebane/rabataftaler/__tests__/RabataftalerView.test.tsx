/**
 * RabataftalerView — én aftales adresse (29/9-2026): /rabataftaler?aftaleId={id}.
 * Listen mockes; alt andet er fladen selv.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";

const A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const B = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const UDLOEBET = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";

const liste = vi.hoisted(() => ({ raekker: [] as Record<string, unknown>[], fejl: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/hjemmebane/adminContentApi", () => ({ getAssetPreviewUrl: async () => null }));
vi.mock("@/lib/hjemmebane/akademiApi", () => ({
  listMedlemsPartnere: async () => {
    if (liste.fejl) throw new Error("netværk");
    return liste.raekker;
  },
}));

import { RabataftalerView } from "../RabataftalerView";
import { AFTALE_FINDES_IKKE, MARKERING_MS } from "@/lib/hjemmebane/rabataftaleAdresse";

const aftale = (id: string, name: string, valid_until: string | null = null) => ({
  id, name, category: "Software", description: null, discount_text: "20 % rabat", indhold: null,
  redemption_type: "kode", redemption_code: "BOARD20", redemption_url: null, redemption_contact: null,
  logo_path: null, website_url: null, valid_until,
});

const Sted = () => {
  const l = useLocation();
  return <output data-testid="sted">{`${l.pathname}${l.search}${l.hash}`}</output>;
};

const vis = (sti: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[sti]}>
        <RabataftalerView />
        <Sted />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const scroll = vi.fn();
beforeEach(() => {
  liste.raekker = [aftale(A, "Aftale A"), aftale(B, "Aftale B"), aftale(UDLOEBET, "Gammel", "2020-01-01")];
  liste.fejl = false;
  scroll.mockClear();
  Element.prototype.scrollIntoView = scroll as unknown as Element["scrollIntoView"];
});
afterEach(cleanup);

describe("RabataftalerView — hver aftale bærer sin adresse i DOM'en", () => {
  it("hver viste <article> har id aftale-{id} og data-aftale-id; en udløbet vises ikke", async () => {
    vis("/rabataftaler");
    await screen.findByText("Aftale A");
    const artikler = document.querySelectorAll("article");
    expect([...artikler].map((a) => a.id)).toEqual([`aftale-${A}`, `aftale-${B}`]);
    expect([...artikler].map((a) => a.getAttribute("data-aftale-id"))).toEqual([A, B]);
    expect(screen.queryByText(AFTALE_FINDES_IKKE)).toBeNull();
  });
});

describe("RabataftalerView — /rabataftaler?aftaleId={id}", () => {
  it("fundet: scroll til aftalen, en kort ring, og parameteren ryddes (hash bevares)", async () => {
    vis(`/rabataftaler?aftaleId=${B}#top`);
    await screen.findByText("Aftale B");
    const b = document.getElementById(`aftale-${B}`)!;
    await waitFor(() => expect(b.className).toContain("ring-2"));
    expect(document.getElementById(`aftale-${A}`)!.className).not.toContain("ring-2");
    await waitFor(() => expect(screen.getByTestId("sted").textContent).toBe("/rabataftaler#top"));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts[0]).toBe(b);
    expect(scroll.mock.calls[0][0]).toEqual({ behavior: "smooth", block: "center" });
    await waitFor(() => expect(b.className).not.toContain("ring-2"), { timeout: MARKERING_MS + 1500 });
    expect(screen.queryByText(AFTALE_FINDES_IKKE)).toBeNull();
  });

  it("udløbet aftale: listen som altid, én rolig linje, ingen ring", async () => {
    vis(`/rabataftaler?aftaleId=${UDLOEBET}`);
    await screen.findByText(AFTALE_FINDES_IKKE);
    expect(screen.getByText("Aftale A")).toBeTruthy();
    expect(document.querySelector(".ring-2")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("sted").textContent).toBe("/rabataftaler"));
  });

  it("ukendt uuid (arkiveret eller slettet): samme rolige linje", async () => {
    vis("/rabataftaler?aftaleId=00000000-0000-4000-8000-000000000000");
    await screen.findByText(AFTALE_FINDES_IKKE);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("et id, der ikke er et uuid: ingen linje, intet mål", async () => {
    vis("/rabataftaler?aftaleId=abc");
    await screen.findByText("Aftale A");
    expect(screen.queryByText(AFTALE_FINDES_IKKE)).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("hentningen fejlede: husets fejllinje, ingen påstand om aftalen, og adressen står", async () => {
    liste.fejl = true;
    vis(`/rabataftaler?aftaleId=${A}`);
    await screen.findByText("Rabataftalerne kunne ikke hentes lige nu. Prøv igen om lidt.");
    expect(screen.queryByText("Der er ingen aftaler at vise lige nu.")).toBeNull();
    expect(screen.queryByText(AFTALE_FINDES_IKKE)).toBeNull();
    // afgoerAftaleMaal giver «intet» ved fejl: parameteren ryddes ikke, intet scroll.
    expect(screen.getByTestId("sted").textContent).toBe(`/rabataftaler?aftaleId=${A}`);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("en tom liste: den gamle linje, ikke fejllinjen", async () => {
    liste.raekker = [];
    vis("/rabataftaler");
    await screen.findByText("Der er ingen aftaler at vise lige nu.");
    expect(screen.queryByText(/kunne ikke hentes/)).toBeNull();
  });
});
