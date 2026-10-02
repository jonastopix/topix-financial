/**
 * MaalKort — ét mål som kort på det nye «Dine mål» (fladen 1/10-2026).
 * Kortet tegner motorens dom (maalTal.maalKort) — testene bygger dommen med
 * motoren selv, så fladen og motoren aldrig siger noget forskelligt.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import { maalKort, type MaalMedTal, type SkridtTilMaal } from "@/lib/hjemmebane/maalTal";
import type { MedlemsHandlinger } from "@/lib/hjemmebane/dineMaal";
import { KORT_ORD } from "@/lib/hjemmebane/dineMaalFlade";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { MaalKort, TomPladsKort } from "../MaalKort";

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

const AKTIV: MedlemsHandlinger = { kanMarkereNaaet: true, kanGenaabne: false, kanParkere: true, kanAktivere: false, kanSlette: true, kanSaetteFremdrift: false, kanTilfoejeSkridt: true };

const handlere = () => ({
  onGjort: vi.fn(),
  onTilfoejSkridt: vi.fn(async () => null),
  onRediger: vi.fn(),
  onParker: vi.fn(),
  onNaaet: vi.fn(),
  onSlet: vi.fn(),
  onGoerSkarpt: vi.fn(),
});

const vis = (raa: MaalMedTal, skridt: SkridtTilMaal[] = [], maaneder: ScoreMaaned[] | null = TRE, h = handlere()) => {
  const kort = maalKort(raa, skridt, maaneder, NU);
  render(
    <MemoryRouter>
      <MaalKort kort={kort} handlinger={AKTIV} skridtLinjer={[]} busy={false} {...h} />
    </MemoryRouter>,
  );
  return { kort, h };
};

afterEach(cleanup);

describe("MaalKort — tal-mål på sporet", () => {
  it("chip «På sporet», titlen som sætning, det store tal med «pr. september (godkendt)», banen med fyldt del og streg, start/mål", () => {
    const { kort } = vis(maal(), [{ id: "s1", title: "Ring til de tre største kunder", status: "active", due_date: "2026-10-15", maal_id: "m1", source_type: "advisor" }]);
    expect(kort.sporet.status).toBe("paa_sporet");
    const chip = document.querySelector("[data-maal-chip]")!;
    expect(chip.textContent).toBe("På sporet");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Omsætning på 2 mio. kr. i årstakt");
    expect(document.querySelector("[data-maal-tal]")!.textContent).toContain("1,44 mio. kr.");
    expect(document.querySelector("[data-maal-tal-undertekst]")!.textContent).toBe("pr. september (godkendt)");
    const bane = document.querySelector("[data-maal-bane]")!;
    expect(bane.getAttribute("data-maal-bane-fyldt")).toBe("44");
    expect(bane.getAttribute("data-maal-bane-streg")).toBe("49.9");
    expect(document.querySelector("[data-maal-streg]")).not.toBeNull();
    expect(document.querySelector("[data-maal-udgangspunkt]")!.textContent).toContain("1 mio. kr.");
    expect(document.querySelector("[data-maal-maaltal]")!.textContent).toContain("2 mio. kr.");
    expect(document.querySelector("[data-maal-maaltal]")!.textContent).toContain("1. apr. 2027");
    expect(document.querySelector("[data-maal-frist-tekst]")!.textContent).toBe("om 6 mdr.");
    // Ingen skyder, ingen blandet procent
    expect(document.querySelector('input[type="range"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ %\s*$/);
  });

  it("det næste skridt med «senest … · foreslået af din rådgiver» og «Gjort» → onGjort(skridtets id)", () => {
    const { h } = vis(maal(), [{ id: "s1", title: "Ring til de tre største kunder", status: "active", due_date: "2026-10-15", maal_id: "m1", source_type: "advisor" }]);
    expect(document.querySelector("[data-maal-naeste]")!.getAttribute("data-maal-naeste")).toBe("active");
    expect(screen.getByText("Ring til de tre største kunder")).toBeInTheDocument();
    expect(document.querySelector("[data-maal-naeste-meta]")!.textContent).toBe("senest 15. okt. 2026 · foreslået af din rådgiver");
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.gjort }));
    expect(h.onGjort).toHaveBeenCalledWith("s1");
  });

  it("uden skridt: «Hvad er det første, I gør?» + «Tilføj skridt» åbner den eksisterende formular", () => {
    vis(maal());
    expect(screen.getByText(KORT_ORD.foersteSkridt)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tilføj skridt/ }));
    expect(document.querySelector('[data-tilfoej-skridt-form="m1"]')).not.toBeNull();
  });

  it("«…»-menuen: Redigér, Parkér, Markér som nået, Slet — hver sin handling", () => {
    const { h } = vis(maal());
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: KORT_ORD.parker }));
    expect(h.onParker).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: KORT_ORD.slet }));
    expect(h.onSlet).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: KORT_ORD.markerNaaet }));
    expect(h.onNaaet).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: KORT_ORD.rediger }));
    expect(h.onRediger).toHaveBeenCalled();
  });
});

describe("MaalKort — tal-mål bagud", () => {
  it("chip «Bagud» i rust-tonen, banen tom når tallet ikke har rykket sig", () => {
    const { kort } = vis(maal({ udgangspunkt: 1_440_000, target_value: 3_000_000 }));
    expect(kort.sporet.status).toBe("bagud");
    const chip = document.querySelector("[data-maal-chip]")!;
    expect(chip.textContent).toBe("Bagud");
    expect(chip.className).toContain("text-hb-rust");
    expect(document.querySelector("[data-maal-bane]")!.getAttribute("data-maal-bane-fyldt")).toBe("0");
    expect(document.querySelector("[data-maal-kort]")!.getAttribute("data-maal-status")).toBe("bagud");
  });

  it("uden tal (Score-grundlaget mangler): grunden står i stedet for tallet, chippen siger «Kan ikke afgøres endnu»", () => {
    vis(maal(), [], null);
    expect(document.querySelector("[data-maal-tal-mangler]")!.textContent).toBe("Tallet kan ikke læses endnu.");
    expect(document.querySelector("[data-maal-chip]")!.textContent).toBe("Kan ikke afgøres endnu");
  });
});

describe("MaalKort — gammelt mål (art null)", () => {
  it("titlen og ÉN handling «Gør målet skarpt»; ingen tal, ingen bane, ingen Redigér i menuen", () => {
    const { h } = vis(maal({ art: null, maal_noegle: null, udgangspunkt: null, unit: "kr." }));
    expect(document.querySelector("[data-maal-kort]")!.getAttribute("data-maal-art")).toBe("gammel");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Omsætning på 2 mio. kr. i årstakt");
    expect(document.querySelector("[data-maal-tal]")).toBeNull();
    expect(document.querySelector("[data-maal-bane]")).toBeNull();
    expect(screen.getByText(KORT_ORD.gammeltMaal)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.goerSkarpt }));
    expect(h.onGoerSkarpt).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: KORT_ORD.menu }));
    expect(screen.queryByRole("menuitem", { name: KORT_ORD.rediger })).toBeNull();
    expect(screen.getByRole("menuitem", { name: KORT_ORD.slet })).toBeInTheDocument();
  });
});

describe("MaalKort — begivenhedsmål", () => {
  it("skridt-fremdrift i stedet for banen — ingen procent", () => {
    vis(maal({ art: "begivenhed", maal_noegle: null }), [
      { id: "a", title: "Skriv jobopslag", status: "done", due_date: null, maal_id: "m1", closed_at: "2026-09-10T00:00:00Z" },
      { id: "b", title: "Hold samtaler", status: "active", due_date: "2026-10-20", maal_id: "m1" },
    ], null);
    expect(document.querySelector("[data-maal-bane]")).toBeNull();
    expect(document.querySelector("[data-maal-skridt-fremdrift]")!.getAttribute("data-maal-skridt-fremdrift")).toBe("1/2");
    expect(document.querySelector("[data-maal-chip]")!.textContent).toBe("1 af 2 skridt gjort");
    expect(document.body.textContent).not.toContain("%");
    // Fund 17: «1 af 2 skridt gjort» står ÉT sted
    expect(document.body.textContent!.split("1 af 2 skridt gjort")).toHaveLength(2);
  });
});

describe("MaalKort — rådets fund 10 og 21", () => {
  it("fund 10: «hvor I burde være pr. …» står synligt (ikke hidden på mobil) og uden for aria-hidden", () => {
    vis(maal());
    const tekst = document.querySelector("[data-maal-streg-tekst]")!;
    expect(tekst.textContent).toContain("hvor I burde være pr. september");
    expect(tekst.className).not.toContain("hidden");
    expect(tekst.closest("[aria-hidden]")).toBeNull();
  });
  it("runde 2, fund 5: et gammelt mål uden parkér/nået/slet (kort uden dom) har ingen «…»-menu", () => {
    const INGEN: MedlemsHandlinger = { kanMarkereNaaet: false, kanGenaabne: false, kanParkere: false, kanAktivere: false, kanSlette: false, kanSaetteFremdrift: false, kanTilfoejeSkridt: false };
    const kort = maalKort(maal({ art: null, maal_noegle: null, udgangspunkt: null }), [], TRE, NU);
    render(<MaalKort kort={kort} handlinger={INGEN} skridtLinjer={[]} busy={false} onGjort={vi.fn()} onTilfoejSkridt={vi.fn(async () => null)} onRediger={vi.fn()} onParker={vi.fn()} onNaaet={vi.fn()} onSlet={vi.fn()} onGoerSkarpt={vi.fn()} />);
    expect(screen.queryByRole("button", { name: KORT_ORD.menu })).toBeNull();
    expect(screen.getByRole("button", { name: KORT_ORD.goerSkarpt })).toBeInTheDocument();
  });

  it("fund 21: «Gør målet skarpt» er låst, når onGoerSkarpt er null", () => {
    const h = { ...handlere(), onGoerSkarpt: null };
    vis(maal({ art: null, maal_noegle: null, udgangspunkt: null }), [], TRE, h);
    expect((screen.getByRole("button", { name: KORT_ORD.goerSkarpt }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("TomPladsKort", () => {
  it("«Plads til ét mål mere» + spørgsmålet + «Sæt et mål»", () => {
    const onSaetMaal = vi.fn();
    render(<TomPladsKort onSaetMaal={onSaetMaal} />);
    expect(screen.getByText(KORT_ORD.tomPladsTitel)).toBeInTheDocument();
    expect(screen.getByText(KORT_ORD.tomPladsTekst)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sæt et mål/ }));
    expect(onSaetMaal).toHaveBeenCalled();
    expect(document.querySelector("[data-maal-tom-plads]")!.className).toContain("border-dashed");
  });
});
