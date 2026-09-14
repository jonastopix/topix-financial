/**
 * DelingView — overblik, fuldskærm og HENDES data (14/9).
 *
 * Galleriet viser ét kort per post i KREATIVER; klik åbner fuldskærmen
 * (role="dialog"); Escape og «Tilbage til overblikket» lukker. Data: navnet
 * og virksomheden kommer fra useAuth og kan rettes i felterne — rettelsen
 * står i kreativen med det samme og skriver ALDRIG til databasen: den
 * mockede klient KASTER på enhver update der ikke er præcis
 * companies.logo_url (vej (a), 14/9) — navn og virksomhed gemmes aldrig.
 *
 * BILLEDERNE GEMMES (14/9): portrættet i den private bucket
 * deling-portraetter/{uid}/portraet (aldrig profiles — «Fjern» sletter
 * objektet), logoet i company-logos/{company.id}/logo + companies.logo_url
 * — ordret som Indstillinger, og fladen siger det FØR hun trykker. Efter
 * refresh findes portrættet ved at liste mappen. Et for lille portræt får en
 * oplysning, ikke en afvisning. Mangler siges uden for kreativen.
 *
 * jsdom har ingen layout, ingen ResizeObserver og ingen createImageBitmap —
 * de to sidste er mocket. Testen ser på struktur og tekst, ikke på px.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  profile: { full_name: "Mette Hansen", company_name: "", avatar_url: "https://x.test/avatars/m", tour_completed_at: null } as
    | { full_name: string; company_name: string; avatar_url: string; tour_completed_at: string | null }
    | null,
  companyId: "c1" as string | null,
  companyName: "Hansen Byg ApS" as string | null,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

/** Databasen og storage som DelingView må se dem: kun logo-opslag og logo-skrivning; portrættet kun i storage. */
const db = vi.hoisted(() => ({
  logoUrl: "https://x.test/company-logos/c1/logo" as string | null,
  /** Objekter i hendes mappe i deling-portraetter. */
  portraetObjekter: [] as string[],
  logoSkrevet: [] as string[],
  fromKald: [] as string[],
  storageKald: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabel: string) => {
      db.fromKald.push(tabel);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { logo_url: db.logoUrl }, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          // Vej (a): KUN companies.logo_url må skrives herfra. Alt andet (navn,
          // virksomhed, profiles) kaster — som før.
          if (tabel !== "companies" || Object.keys(payload).join(",") !== "logo_url") {
            throw new Error("DelingView må aldrig skrive til databasen ud over companies.logo_url");
          }
          return { eq: async (_k: string, id: string) => { db.logoSkrevet.push(`${id}=${payload.logo_url}`); db.logoUrl = String(payload.logo_url); return { error: null }; } };
        },
      };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (sti: string, fil: File, opts: { upsert: boolean; contentType: string }) => {
          db.storageKald.push(`upload:${bucket}/${sti}:${fil.name}:${opts.upsert}:${opts.contentType}`);
          if (bucket === "deling-portraetter") db.portraetObjekter = [sti.split("/")[1]];
          return { error: null };
        },
        list: async (mappe: string) => {
          db.storageKald.push(`list:${bucket}/${mappe}`);
          return { data: db.portraetObjekter.map((name) => ({ name })), error: null };
        },
        createSignedUrl: async (sti: string, sek: number) => {
          db.storageKald.push(`sign:${bucket}/${sti}:${sek}`);
          return { data: { signedUrl: `https://x.test/signed/${bucket}/${sti}?token=t` }, error: null };
        },
        remove: async (stier: string[]) => {
          db.storageKald.push(`remove:${bucket}/${stier.join(",")}`);
          db.portraetObjekter = [];
          return { error: null };
        },
        getPublicUrl: (sti: string) => ({ data: { publicUrl: `https://x.test/${bucket}/${sti}` } }),
      }),
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
  auth.user = { id: "u1" };
  db.logoUrl = "https://x.test/company-logos/c1/logo";
  db.portraetObjekter = [];
  db.logoSkrevet = [];
  db.fromKald = [];
  db.storageKald = [];
  // Målingen før upload: 900×900 som standard — stort nok til slot'en (310).
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async () => ({ width: 900, height: 900, close: () => {} }));
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
    expect(db.logoSkrevet).toEqual([]);
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

  it("en fil der ikke er et billede afvises med en besked; intet uploades, intet skrives", async () => {
    vis();
    fireEvent.drop(await screen.findByRole("button", { name: /Erstat logo/ }), { dataTransfer: { files: [new File(["a"], "tal.xlsx", { type: "application/vnd.ms-excel" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Vælg en billedfil");
    expect(db.storageKald.filter((k) => k.startsWith("upload:"))).toEqual([]);
    expect(db.logoSkrevet).toEqual([]);
  });

  it("over 2 MB afvises med avatar-uploadens tekst — samme grænse, ingen ny", () => {
    vis();
    const stor = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "stor.png", { type: "image/png" });
    fireEvent.drop(screen.getByRole("button", { name: /Erstat portræt/ }), { dataTransfer: { files: [stor] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Billedet må højst være 2 MB");
    expect(db.storageKald.filter((k) => k.startsWith("upload:"))).toEqual([]);
  });
});

describe("DelingView — portrættet gemmes kun til kreativen (vej b)", () => {
  it("et portræt i dropzonen uploades til deling-portraetter/u1/portraet, signeres og står i kreativen — profiles røres ikke", async () => {
    vis();
    const fil = new File(["x"], "mig.png", { type: "image/png" });
    fireEvent.drop(screen.getByRole("button", { name: /Erstat portræt/ }), { dataTransfer: { files: [fil] } });
    expect(await within(kortet()).findByAltText("Mette Hansen")).toHaveAttribute("src", "https://x.test/signed/deling-portraetter/u1/portraet?token=t");
    expect(db.storageKald).toContain("upload:deling-portraetter/u1/portraet:mig.png:true:image/png");
    expect(db.fromKald.filter((t) => t === "profiles")).toEqual([]);
    expect(db.logoSkrevet).toEqual([]);
    expect(screen.getByText(/Portrættet er gemt til kreativen — ikke som dit profilbillede/)).toBeInTheDocument();
  });

  it("efter refresh: findes objektet i hendes mappe, vises det uden at hun gør noget", async () => {
    db.portraetObjekter = ["portraet"];
    vis();
    expect(await screen.findByText("Dit eget portræt til kreativen.")).toBeInTheDocument();
    expect(within(kortet()).getByAltText("Mette Hansen")).toHaveAttribute("src", "https://x.test/signed/deling-portraetter/u1/portraet?token=t");
    expect(db.storageKald).toContain("list:deling-portraetter/u1");
  });

  it("«Fjern» sletter objektet i hendes mappe, og profilbilledet er udgangspunktet igen", async () => {
    db.portraetObjekter = ["portraet"];
    vis();
    await within(kortet()).findByAltText("Mette Hansen");
    fireEvent.click(await screen.findByRole("button", { name: "Fjern" }));
    expect(await within(kortet()).findByAltText("Mette Hansen")).toHaveAttribute("src", "https://x.test/avatars/m");
    expect(db.storageKald).toContain("remove:deling-portraetter/u1/portraet");
    expect(db.fromKald.filter((t) => t === "profiles")).toEqual([]);
  });

  it("uden eget portræt er der intet «Fjern» — profilbilledet kan ikke fjernes herfra", () => {
    vis();
    expect(screen.queryByRole("button", { name: "Fjern" })).toBeNull();
    expect(screen.getByText(/dit profilbillede under Konto rører vi ikke/)).toBeInTheDocument();
  });

  it("et lille portræt (under 310 px) uploades ALLIGEVEL, og hun får det at vide — oplysning, ikke afvisning", async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async () => ({ width: 100, height: 100, close: () => {} }));
    vis();
    fireEvent.drop(screen.getByRole("button", { name: /Erstat portræt/ }), { dataTransfer: { files: [new File(["x"], "lille.png", { type: "image/png" })] } });
    expect(await screen.findByText(/Billedet er 100×100 px\. Kreativen viser det i 310 px, så det bliver uskarpt — du må gerne bruge det alligevel\./)).toBeInTheDocument();
    expect(db.storageKald).toContain("upload:deling-portraetter/u1/portraet:lille.png:true:image/png");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("DelingView — logoet bliver virksomhedens (vej a)", () => {
  it("siger det FØR hun trykker: logoet bliver virksomhedens, ikke kun kreativens", () => {
    vis();
    expect(screen.getByText(/bliver virksomhedens logo/)).toHaveTextContent("ikke kun på kreativen");
  });

  it("et logo i dropzonen uploades til company-logos/c1/logo og skrives til companies.logo_url — ordret som Indstillinger", async () => {
    vis();
    await within(kortet()).findByAltText("Hansen Byg ApS");
    fireEvent.drop(screen.getByRole("button", { name: /Erstat logo/ }), { dataTransfer: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });
    expect(await screen.findByText("Logoet er gemt som virksomhedens logo.")).toBeInTheDocument();
    expect(db.storageKald).toContain("upload:company-logos/c1/logo:logo.png:true:image/png");
    expect(db.logoSkrevet).toEqual(["c1=https://x.test/company-logos/c1/logo"]);
    expect(await within(kortet()).findByAltText("Hansen Byg ApS")).toHaveAttribute("src", "https://x.test/company-logos/c1/logo");
  });

  it("intet «Fjern» ved logoet — det ville fjerne profilens logo", () => {
    vis();
    expect(screen.queryByRole("button", { name: "Fjern" })).toBeNull();
  });
});

describe("DelingView — teksten til opslaget (nr. 3): fire veje og vejledningen", () => {
  it("fire veje under galleriet; de tre med virksomheden følger rettelsen i feltet", () => {
    vis();
    const liste = screen.getByRole("list", { name: "Tekstudkast" });
    expect(liste.querySelectorAll("li")).toHaveLength(4);
    expect(within(liste).getByText("Glad og ligefrem")).toBeInTheDocument();
    expect(within(liste).getByText("Ærlig")).toBeInTheDocument();
    expect(within(liste).getByText("Forretningsmæssig")).toBeInTheDocument();
    expect(within(liste).getByText("Invitation")).toBeInTheDocument();
    expect(within(liste).getAllByText(/Hansen Byg ApS/)).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Virksomhed"), { target: { value: "Hansen Byg" } });
    expect(within(screen.getByRole("list", { name: "Tekstudkast" })).getAllByText(/Hansen Byg/)).toHaveLength(3);
  });

  it("«fire år» i «Ærlig» siges at være et eksempel hun retter selv", () => {
    vis();
    const aerlig = screen.getByText("Ærlig").closest("[data-tekstudkast]")!;
    expect(aerlig).toHaveTextContent("«fire år» er et eksempel — ret det til dit eget tal.");
    expect(screen.getAllByText(/er et eksempel — ret det/)).toHaveLength(1);
  });

  it("«Kopiér» lægger hele teksten med linjeskift i udklipsholderen og siger «Kopieret»", async () => {
    const skrevet: string[] = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { skrevet.push(t); } }, configurable: true });
    vis();
    fireEvent.click(screen.getByRole("button", { name: "Kopiér: Ærlig" }));
    expect(await screen.findByText("Kopieret")).toBeInTheDocument();
    expect(skrevet).toHaveLength(1);
    expect(skrevet[0]).toMatch(/^Jeg har brugt fire år/);
    expect(skrevet[0]).toContain("Derfor er Hansen Byg ApS nu med i The Boardroom.");
    expect(skrevet[0].split("\n")).toHaveLength(3);
    expect(skrevet[0]).not.toContain("!");
    expect(skrevet[0]).not.toMatch(/ejerleder/i);
  });

  it("vejledningen står ved siden af: fire punkter, de to personers LinkedIn, linket i første kommentar", () => {
    vis();
    const punkter = within(screen.getByRole("list", { name: "Vejledning" })).getAllByRole("listitem");
    expect(punkter).toHaveLength(4);
    expect(punkter[0]).toHaveTextContent("linkedin.com/in/mortenlarsen");
    expect(punkter[0]).toHaveTextContent("linkedin.com/in/jonasherlev");
    expect(punkter[1]).toHaveTextContent("i første kommentar, ikke i opslaget");
    expect(punkter[2]).toHaveTextContent("den første time");
    expect(punkter[3]).toHaveTextContent("Billedet først, teksten under.");
  });
});
