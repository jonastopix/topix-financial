/**
 * RefleksionerSektion — medlemmet ser sine egne refleksioner (28/9-2026).
 *
 * Databasen mockes pr. tabel: KUN pulse_checkins må læses, og enhver
 * skrivning kaster — sektionen er læsning alene. Tom og fejlet er to
 * beskeder; data tegnes nyeste øverst med modalens spørgsmål.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const db = vi.hoisted(() => ({
  raekker: [] as Record<string, unknown>[],
  fejl: null as { message: string } | null,
  kald: [] as string[],
  select: [] as string[],
  order: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabel: string) => {
      db.kald.push(tabel);
      if (tabel !== "pulse_checkins") throw new Error(`RefleksionerSektion må kun læse pulse_checkins — læste ${tabel}`);
      const skriv = () => { throw new Error("RefleksionerSektion må aldrig skrive"); };
      return {
        insert: skriv, upsert: skriv, update: skriv, delete: skriv,
        select: (kolonner: string) => {
          db.select.push(kolonner);
          return {
            eq: () => ({
              order: async (kol: string, o: { ascending: boolean }) => {
                db.order.push(`${kol}:${o.ascending ? "asc" : "desc"}`);
                return { data: db.fejl ? null : db.raekker, error: db.fejl };
              },
            }),
          };
        },
      };
    },
  },
}));

import { RefleksionerSektion } from "../RefleksionerSektion";

const tegn = (companyId: string | null = "c1") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RefleksionerSektion companyId={companyId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const raekke = (period_key: string, r: Record<string, unknown> = {}) => ({
  period_key, went_well: "En ny kunde", biggest_challenge: "Likviditeten", help_needed: null,
  milestone_progress: 40, created_at: "2026-10-03T10:00:00Z", ...r,
});

beforeEach(() => { db.raekker = []; db.fejl = null; db.kald = []; db.select = []; db.order = []; });
afterEach(() => cleanup());

describe("RefleksionerSektion", () => {
  it("læser KUN pulse_checkins, de seks kolonner, nyeste først — og skriver aldrig", async () => {
    db.raekker = [raekke("2026-09")];
    tegn();
    await screen.findByText("September 2026");
    expect(db.kald).toEqual(["pulse_checkins"]);
    expect(db.select).toEqual(["period_key, went_well, biggest_challenge, help_needed, milestone_progress, created_at"]);
    expect(db.order).toEqual(["period_key:desc"]);
  });

  it("DATA: månederne nyeste øverst, modalens spørgsmål som overskrifter, svarene i fuld længde", async () => {
    db.raekker = [
      raekke("2026-07", { went_well: "Første ordre", biggest_challenge: "", help_needed: "Ansættelsen", milestone_progress: null }),
      raekke("2026-09", { went_well: "En ny kunde\nog en til", biggest_challenge: "Likviditeten" }),
    ];
    tegn();
    await screen.findByText("September 2026");
    const rod = screen.getByText("Dine refleksioner").closest("section")!;
    expect(rod.getAttribute("data-tilstand")).toBe("data");
    const kort = within(rod).getAllByRole("listitem");
    expect(kort.map((k) => k.querySelector("[data-period]")!.getAttribute("data-period"))).toEqual(["2026-09", "2026-07"]);
    // September: to felter + milestone-linjen.
    expect(within(kort[0]).getByText("September 2026")).toBeTruthy();
    expect(within(kort[0]).getByText("Hvad er gået godt denne måned?")).toBeTruthy();
    expect(within(kort[0]).getByText(/En ny kunde/)).toBeTruthy();
    expect(within(kort[0]).getByText("Hvad er din største udfordring lige nu?")).toBeTruthy();
    expect(within(kort[0]).queryByText("Hvad har du brug for hjælp til?")).toBeNull();
    expect(within(kort[0]).getByText("Dine aktive mål stod samlet på 40 %, da du sendte den.")).toBeTruthy();
    // Juli: tom udfordring tegnes ikke; hjælp tegnes; intet milestone-tal.
    expect(within(kort[1]).getByText("Juli 2026")).toBeTruthy();
    expect(within(kort[1]).queryByText("Hvad er din største udfordring lige nu?")).toBeNull();
    expect(within(kort[1]).getByText("Hvad har du brug for hjælp til?")).toBeTruthy();
    expect(within(kort[1]).getByText("Ansættelsen")).toBeTruthy();
    expect(within(kort[1]).queryByText(/Dine aktive mål stod samlet på/)).toBeNull();
  });

  it("en måned sendt uden tekst siger det — og tegner ingen spørgsmål", async () => {
    db.raekker = [raekke("2026-08", { went_well: " ", biggest_challenge: null, help_needed: null, milestone_progress: null })];
    tegn();
    expect(await screen.findByText("Du sendte refleksionen for August 2026 uden tekst.")).toBeTruthy();
    expect(screen.queryByText("Hvad er gået godt denne måned?")).toBeNull();
  });

  it("TOM: ingen rækker er en tilstand, ikke en fejl", async () => {
    tegn();
    expect(await screen.findByText(/Ingen refleksioner endnu/)).toBeTruthy();
    expect(screen.getByText("Dine refleksioner").closest("section")!.getAttribute("data-tilstand")).toBe("tom");
  });

  it("FEJLET: siger hvad der ikke kunne hentes — «Din refleksion kunne ikke hentes lige nu.» — aldrig «ingen endnu»", async () => {
    db.fejl = { message: "permission denied" };
    tegn();
    expect(await screen.findByText("Din refleksion kunne ikke hentes lige nu.")).toBeTruthy();
    expect(screen.queryByText(/Ingen refleksioner endnu/)).toBeNull();
    expect(screen.getByText("Dine refleksioner").closest("section")!.getAttribute("data-tilstand")).toBe("fejlet");
  });

  it("uden companyId hentes intet, og sektionen står som «henter»", () => {
    tegn(null);
    expect(db.kald).toEqual([]);
    expect(screen.getByText("Dine refleksioner").closest("section")!.getAttribute("data-tilstand")).toBe("henter");
  });
});
