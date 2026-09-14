/**
 * DelingView — overblik, fuldskærm og HENDES data (14/9).
 *
 * Galleriet viser ét kort per post i KREATIVER; klik åbner fuldskærmen
 * (role="dialog"); Escape og «Tilbage til overblikket» lukker. Data: navnet
 * og virksomheden kommer fra useAuth og kan rettes i felterne — rettelsen
 * står i kreativen med det samme og skriver ALDRIG til databasen (ingen
 * supabase.from(...).update her; supabase-klienten er mocket til kun at
 * svare på logo-opslaget). Et billede lagt i dropzonen bliver en
 * object-URL i kreativen, og «Fjern» kalder revokeObjectURL. Mangler siges
 * uden for kreativen.
 *
 * jsdom har ingen layout, ingen ResizeObserver og ingen
 * URL.createObjectURL — de to sidste er mocket. Testen ser på struktur og
 * tekst, ikke på px.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({
  profile: { full_name: "Mette Hansen", company_name: "", avatar_url: "https://x.test/avatars/m", tour_completed_at: null } as
    | { full_name: string; company_name: string; avatar_url: string; tour_completed_at: string | null }
    | null,
  companyId: "c1" as string | null,
  companyName: "Hansen Byg ApS" as string | null,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

const db = vi.hoisted(() => ({ logoUrl: "https://x.test/company-logos/c1/logo" as string | null, updateKald: 0, fromKald: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabel: string) => {
      db.fromKald.push(tabel);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { logo_url: db.logoUrl }, error: null }) }) }),
        update: () => { db.updateKald += 1; throw new Error("DelingView må aldrig skrive til databasen"); },
      };
    },
  },
}));

import { DelingView } from "../DelingView";
import { KREATIVER } from "../kreativer";

const vis = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DelingView />
    </QueryClientProvider>,
  );
};

const kortet = () => screen.getByRole("button", { name: `Vis stor: ${KREATIVER[0].titel}` });

beforeEach(() => {
  auth.profile = { full_name: "Mette Hansen", company_name: "", avatar_url: "https://x.test/avatars/m", tour_completed_at: null };
  auth.companyId = "c1";
  auth.companyName = "Hansen Byg ApS";
  db.logoUrl = "https://x.test/company-logos/c1/logo";
  db.updateKald = 0;
  db.fromKald = [];
  let n = 0;
  (URL as unknown as { createObjectURL: (f: File) => string }).createObjectURL = vi.fn(() => `blob:test/${++n}`);
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("DelingView — galleri og fuldskærm", () => {
  it("viser ét kort per post i KREATIVER, og ingen dialog", () => {
    vis();
    const liste = screen.getByRole("list", { name: "Kreativer" });
    expect(liste.querySelectorAll("li")).toHaveLength(KREATIVER.length);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("klik åbner fuldskærmen med titlen; «Tilbage til overblikket» og Escape lukker", () => {
    vis();
    fireEvent.click(kortet());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { level: 2, name: KREATIVER[0].titel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forrige kreativ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Tilbage til overblikket/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(kortet());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DelingView — hendes data", () => {
  it("navn, virksomhed og profilbillede kommer fra useAuth; logoet fra companies.logo_url", async () => {
    vis();
    expect(screen.getByLabelText("Navn")).toHaveValue("Mette Hansen");
    expect(screen.getByLabelText("Virksomhed")).toHaveValue("Hansen Byg ApS");
    expect(within(kortet()).getByText("Mette Hansen")).toBeInTheDocument();
    expect(within(kortet()).getByText("Hansen Byg ApS")).toBeInTheDocument();
    expect(within(kortet()).getByAltText("Mette Hansen")).toHaveAttribute("src", "https://x.test/avatars/m");
    expect(await within(kortet()).findByAltText("Hansen Byg ApS")).toHaveAttribute("src", "https://x.test/company-logos/c1/logo");
    expect(db.fromKald).toEqual(["companies"]);
  });

  it("rettelser i felterne står i kreativen med det samme — og gemmes ikke", () => {
    vis();
    fireEvent.change(screen.getByLabelText("Navn"), { target: { value: "Mette H. Hansen" } });
    fireEvent.change(screen.getByLabelText("Virksomhed"), { target: { value: "Hansen Byg" } });
    expect(within(kortet()).getByText("Mette H. Hansen")).toBeInTheDocument();
    expect(within(kortet()).getByText("Hansen Byg")).toBeInTheDocument();
    fireEvent.click(kortet());
    expect(within(screen.getByRole("dialog")).getByText("Mette H. Hansen")).toBeInTheDocument();
    expect(db.updateKald).toBe(0);
    expect(db.fromKald.filter((t) => t === "profiles")).toEqual([]);
  });

  it("uden portræt og logo siges det uden for kreativen; med alt er boksen væk", async () => {
    auth.profile = { full_name: "Mette Hansen", company_name: "", avatar_url: "", tour_completed_at: null };
    db.logoUrl = null;
    vis();
    const boks = screen.getByText("Kreativen er ikke hel endnu").parentElement!;
    expect(boks).toHaveTextContent("Portrættet mangler");
    expect(boks).toHaveTextContent("Logoet mangler");
    expect(boks).not.toHaveTextContent("Navnet mangler");
    cleanup();

    db.logoUrl = "https://x.test/company-logos/c1/logo";
    auth.profile = { full_name: "Mette Hansen", company_name: "", avatar_url: "https://x.test/avatars/m", tour_completed_at: null };
    vis();
    expect(await within(kortet()).findByAltText("Hansen Byg ApS")).toBeInTheDocument();
    expect(screen.queryByText("Kreativen er ikke hel endnu")).toBeNull();
  });

  it("et billede i dropzonen bliver en object-URL i kreativen, og «Fjern» rydder op med revokeObjectURL", async () => {
    vis();
    const fil = new File(["x"], "mig.png", { type: "image/png" });
    fireEvent.drop(screen.getByRole("button", { name: /Læg portræt ind/ }), { dataTransfer: { files: [fil] } });
    expect(await within(kortet()).findByAltText("Mette Hansen")).toHaveAttribute("src", "blob:test/1");
    expect(screen.getByText("mig.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fjern" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(await within(kortet()).findByAltText("Mette Hansen")).toHaveAttribute("src", "https://x.test/avatars/m");
  });

  it("en fil der ikke er et billede afvises med en besked, og kreativen er uændret", () => {
    vis();
    fireEvent.drop(screen.getByRole("button", { name: /Læg logo ind/ }), { dataTransfer: { files: [new File(["a"], "tal.xlsx", { type: "application/vnd.ms-excel" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Vælg en billedfil");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
