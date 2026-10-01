/**
 * SaetMaalGuide — «Sæt et mål» i tre trin (fladen 1/10-2026). Tallene er
 * motorens (nytMaalForslag/kraeverPrMaanedFor); guiden tegner.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import { GUIDE_ORD } from "@/lib/hjemmebane/dineMaalFlade";
import { MAAL_FORKLARING_TEKST } from "@/lib/hjemmebane/maalForklaring";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { SaetMaalGuide } from "../SaetMaalGuide";

const NU = new Date("2026-10-01T10:00:00Z");
const m = (key: string, metrics: Record<string, number | null>): ScoreMaaned => ({ key, basis: "measured", foersteGodkendtAt: null, metrics });
// Årstakt: (100 + 120 + 140) ÷ 3 × 12 = 1,44 mio.
const TRE = [m("2026-07", { revenue: 100_000 }), m("2026-08", { revenue: 120_000 }), m("2026-09", { revenue: 140_000 })];

type Props = React.ComponentProps<typeof SaetMaalGuide>;
const vis = (over: Partial<Pick<Props, "tilstand" | "maaneder">> = {}) => {
  const onClose = vi.fn();
  const onOpret = vi.fn<Props["onOpret"]>(async () => ({ ok: true as const, id: "ny-id" }));
  const onGoerSkarpt = vi.fn<Props["onGoerSkarpt"]>(async () => ({ ok: true as const, id: "m1" }));
  const onTilfoejSkridt = vi.fn<Props["onTilfoejSkridt"]>(async () => null);
  render(
    <SaetMaalGuide
      open
      onClose={onClose}
      tilstand={over.tilstand ?? { art: "ny" }}
      maaneder={over.maaneder === undefined ? TRE : over.maaneder}
      nu={NU}
      onOpret={onOpret}
      onGoerSkarpt={onGoerSkarpt}
      onTilfoejSkridt={onTilfoejSkridt}
    />,
  );
  return { onClose, onOpret, onGoerSkarpt, onTilfoejSkridt };
};

afterEach(cleanup);

describe("SaetMaalGuide — trin 1", () => {
  it("seks kort; de læste nøgler viser det nuværende tal, en nøgle uden tal kan ikke vælges, «Hvad er et mål?» står som beskrivelse", () => {
    vis();
    expect(screen.getByText(MAAL_FORKLARING_TEKST)).toBeInTheDocument();
    expect(document.querySelectorAll("[data-guide-kort]")).toHaveLength(6);
    const oms = document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!;
    expect(oms.getAttribute("data-guide-kort-kan-vaelges")).toBe("1");
    expect(oms.querySelector("[data-guide-kort-tal]")!.textContent).toContain("1,44 mio. kr.");
    expect(oms.querySelector("[data-guide-kort-tal]")!.textContent).toContain("pr. september (godkendt)");
    // Dækningsgraden mangler gross_profit → mangler med grunden
    const db = document.querySelector('[data-guide-kort="db_grad"]')!;
    expect(db.getAttribute("data-guide-kort-kan-vaelges")).toBe("0");
    expect(db.querySelector("[data-guide-kort-tal]")!.textContent).toContain("For få godkendte måneder");
    expect((db as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-guide-kort="andet_tal"] [data-guide-kort-tal]')!.textContent).toContain(GUIDE_ORD.tastes);
  });

  it("uden måneder (Score fejlede/afventer): alle husnøgler mangler, andet_tal og begivenheden kan stadig vælges", () => {
    vis({ maaneder: null });
    for (const n of ["omsaetning_aarstakt", "resultat_aarstakt", "likviditet_mdr", "db_grad"]) {
      expect(document.querySelector(`[data-guide-kort="${n}"]`)!.getAttribute("data-guide-kort-kan-vaelges")).toBe("0");
    }
    expect(document.querySelector('[data-guide-kort="andet_tal"]')!.getAttribute("data-guide-kort-kan-vaelges")).toBe("1");
    expect(document.querySelector('[data-guide-kort="begivenhed"]')!.getAttribute("data-guide-kort-kan-vaelges")).toBe("1");
  });
});

describe("SaetMaalGuide — trin 2 med «det kræver»", () => {
  it("måltal + frist giver den levende linje fra motoren, og titlen foreslås af tallet", async () => {
    vis();
    fireEvent.click(document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!);
    expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("2");
    const frist = screen.getByLabelText(GUIDE_ORD.frist) as HTMLInputElement;
    expect(frist.value).toBe("2027-10-01"); // i dag + 12 mdr. (dansk)
    expect(screen.getByLabelText(GUIDE_ORD.maaltal)).toHaveAttribute("inputmode", "decimal");
    expect(document.querySelector("[data-guide-kraever]")!.textContent).toBe("");

    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "2000000" } });
    // (2.000.000 − 1.440.000) ÷ (365 dage ÷ 30,4375) = 560.000 ÷ 11,99 ≈ 46.700 kr. → «47.000 kr.» (vaerdiTekst runder til tusinder)
    await waitFor(() => expect(document.querySelector("[data-guide-kraever]")!.textContent).toBe("Det kræver ca. 47.000 kr. pr. måned"));
    expect((screen.getByLabelText(GUIDE_ORD.titel) as HTMLInputElement).value).toBe("Omsætning på 2 mio. kr. i årstakt");

    // Kortere frist → mere pr. måned
    fireEvent.change(frist, { target: { value: "2027-04-01" } });
    await waitFor(() => expect(document.querySelector("[data-guide-kraever]")!.textContent).toBe("Det kræver ca. 94.000 kr. pr. måned"));

    // Et måltal under udgangspunktet → «Tallet skal ned»
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "1000000" } });
    await waitFor(() => expect(document.querySelector("[data-guide-kraever]")!.textContent).toMatch(/^Tallet skal ned med ca\. /));
  });

  it("titlen følger tallet, indtil medlemmet retter den", async () => {
    vis();
    fireEvent.click(document.querySelector('[data-guide-kort="likviditet_mdr"]')!);
    // Likviditeten mangler bank-tal → kortet kan ikke vælges; vælg omsætningen i stedet
    expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("1");
    fireEvent.click(document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!);
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "2000000" } });
    await waitFor(() => expect((screen.getByLabelText(GUIDE_ORD.titel) as HTMLInputElement).value).toBe("Omsætning på 2 mio. kr. i årstakt"));
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.titel), { target: { value: "To millioner inden sommer" } });
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "2500000" } });
    await waitFor(() => expect(document.querySelector("[data-guide-kraever]")!.textContent).toContain("88.000 kr."));
    expect((screen.getByLabelText(GUIDE_ORD.titel) as HTMLInputElement).value).toBe("To millioner inden sommer");
  });

  it("dommen (doemNytMaal) viser fejlen i dialogen — måltal lig udgangspunktet", async () => {
    const p = vis();
    fireEvent.click(document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!);
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "1440000" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.videre }));
    await screen.findAllByText("Måltallet er det samme som udgangspunktet");
    expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("2");
    expect(p.onOpret).not.toHaveBeenCalled();
  });
});

describe("SaetMaalGuide — trin 3 og gem", () => {
  it("«Spring over» opretter målet uden skridt; med skridt kaldes skridt-tilfoej med det nye måls id", async () => {
    const p = vis();
    fireEvent.click(document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!);
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "2000000" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.videre }));
    await waitFor(() => expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("3"));
    const skridtFrist = screen.getByLabelText(GUIDE_ORD.skridtFrist) as HTMLInputElement;
    expect(skridtFrist.value).toBe("2026-10-15"); // i dag + 14 dage, under målets frist
    expect(skridtFrist.max).toBe("2027-10-01");

    fireEvent.change(screen.getByLabelText(GUIDE_ORD.skridtTitel), { target: { value: "Ring til de tre største kunder" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.gem }));
    await waitFor(() => expect(p.onOpret).toHaveBeenCalledTimes(1));
    expect(p.onOpret.mock.calls[0][0]).toMatchObject({ art: "tal", noegle: "omsaetning_aarstakt", maaltal: 2_000_000, frist: "2027-10-01", titel: "Omsætning på 2 mio. kr. i årstakt" });
    await waitFor(() => expect(p.onTilfoejSkridt).toHaveBeenCalledWith("ny-id", "Ring til de tre største kunder", "2026-10-15"));
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it("begivenhed: ingen tal, titlen skrives af medlemmet, gemmes som art begivenhed", async () => {
    const p = vis();
    fireEvent.click(document.querySelector('[data-guide-kort="begivenhed"]')!);
    expect(screen.queryByLabelText(GUIDE_ORD.maaltal)).toBeNull();
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.titel), { target: { value: "Den første medarbejder er ansat" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.videre }));
    await waitFor(() => expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("3"));
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.springOver }));
    await waitFor(() => expect(p.onOpret).toHaveBeenCalledWith({ titel: "Den første medarbejder er ansat", art: "begivenhed", frist: "2027-10-01" }));
    expect(p.onTilfoejSkridt).not.toHaveBeenCalled();
  });

  it("«Gør målet skarpt»: to trin, forudfyldt titel og måltal, gemmes gennem goerSkarpt med målets id", async () => {
    const p = vis({ tilstand: { art: "skarpt", maalId: "m-gammelt", titel: "Nå 100 kunder", forslag: { maaltal: 100, udgangspunkt: 40, enhed: "kunder" }, frist: "2027-03-01" } });
    expect(screen.getByText(/trin 1 af 2/)).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-guide-kort="andet_tal"]')!);
    expect((screen.getByLabelText(GUIDE_ORD.titel) as HTMLInputElement).value).toBe("Nå 100 kunder");
    expect((screen.getByLabelText(GUIDE_ORD.maaltal) as HTMLInputElement).value).toBe("100");
    expect((screen.getByLabelText(GUIDE_ORD.udgangspunkt) as HTMLInputElement).value).toBe("40");
    expect((screen.getByLabelText(GUIDE_ORD.enhed) as HTMLInputElement).value).toBe("kunder");
    // Fund 8: målets EGEN frist forudfyldes (ikke i dag + 12 mdr.)
    expect((screen.getByLabelText(GUIDE_ORD.frist) as HTMLInputElement).value).toBe("2027-03-01");
    // (100 − 40) ÷ (151 dage ÷ 30,4375) = 60 ÷ 4,961 ≈ 12,09 kunder pr. måned (egen enhed vises med to decimaler)
    await waitFor(() => expect(document.querySelector("[data-guide-kraever]")!.textContent).toBe("Det kræver ca. 12,09 kunder pr. måned"));
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.gemSkarpt }));
    await waitFor(() => expect(p.onGoerSkarpt).toHaveBeenCalledTimes(1));
    expect(p.onGoerSkarpt.mock.calls[0][0]).toBe("m-gammelt");
    expect(p.onGoerSkarpt.mock.calls[0][1]).toMatchObject({ art: "tal", noegle: "andet_tal", maaltal: 100, udgangspunkt: 40, enhed: "kunder", titel: "Nå 100 kunder", frist: "2027-03-01" });
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it("fund 8: en passeret eller manglende frist på det gamle mål giver forslaget (i dag + 12 mdr.)", () => {
    vis({ tilstand: { art: "skarpt", maalId: "m", titel: "Gammelt", forslag: { maaltal: null, udgangspunkt: null, enhed: null }, frist: "2026-09-01" } });
    fireEvent.click(document.querySelector('[data-guide-kort="begivenhed"]')!);
    expect((screen.getByLabelText(GUIDE_ORD.frist) as HTMLInputElement).value).toBe("2027-10-01");
  });
});

describe("SaetMaalGuide — rådets fund 1, 4, 9, 19, 20", () => {
  const tilTrin3 = () => {
    const p = vis();
    fireEvent.click(document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!);
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "2.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.videre }));
    return p;
  };

  it("fund 4: «2.000.000» og «1.500,5» læses dansk (ikke NaN / 1,5)", async () => {
    const p = tilTrin3();
    await waitFor(() => expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("3"));
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.springOver }));
    await waitFor(() => expect(p.onOpret).toHaveBeenCalledTimes(1));
    expect(p.onOpret.mock.calls[0][0]).toMatchObject({ maaltal: 2_000_000 });
  });

  it("fund 1: fejler skridtet, oprettes målet IKKE igen ved næste klik — kun skridtet gentages; «Tilbage» er låst", async () => {
    const p = tilTrin3();
    p.onTilfoejSkridt.mockResolvedValueOnce("Fristen må ikke ligge i fortiden");
    await waitFor(() => expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("3"));
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.skridtTitel), { target: { value: "Ring til de tre største kunder" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.gem }));
    await screen.findByText(/Målet er sat, men skridtet blev ikke tilføjet/);
    expect(p.onOpret).toHaveBeenCalledTimes(1);
    expect(p.onTilfoejSkridt).toHaveBeenCalledTimes(1);
    expect(p.onClose).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: GUIDE_ORD.tilbage }) as HTMLButtonElement).disabled).toBe(true);
    // Andet klik: kun skridtet
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.gem }));
    await waitFor(() => expect(p.onTilfoejSkridt).toHaveBeenCalledTimes(2));
    expect(p.onTilfoejSkridt.mock.calls[1][0]).toBe("ny-id");
    expect(p.onOpret).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it("fund 1: dobbelt submit (to Enter i træk) opretter målet én gang", async () => {
    const p = vis();
    let frigiv: (v: { ok: true; id: string }) => void = () => undefined;
    p.onOpret.mockImplementationOnce(() => new Promise((r) => { frigiv = r; }));
    fireEvent.click(document.querySelector('[data-guide-kort="begivenhed"]')!);
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.titel), { target: { value: "Den første medarbejder er ansat" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.videre }));
    await waitFor(() => expect(document.querySelector("[data-guide-trin]")!.getAttribute("data-guide-trin")).toBe("3"));
    const form = document.querySelector("form[data-guide-skridt]")!;
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.skridtTitel), { target: { value: "Skriv jobopslaget" } });
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.springOver }));
    await waitFor(() => expect(p.onOpret).toHaveBeenCalledTimes(1));
    frigiv({ ok: true, id: "ny-id" });
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
    expect(p.onOpret).toHaveBeenCalledTimes(1);
  });

  it("fund 9: dommens grund står i ÉN synlig alert-linje, ikke under titelfeltet", async () => {
    vis();
    fireEvent.click(document.querySelector('[data-guide-kort="omsaetning_aarstakt"]')!);
    fireEvent.change(screen.getByLabelText(GUIDE_ORD.maaltal), { target: { value: "1.440.000" } });
    fireEvent.click(screen.getByRole("button", { name: GUIDE_ORD.videre }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Måltallet er det samme som udgangspunktet");
    expect(alert.className).not.toContain("sr-only");
    expect(screen.getAllByText("Måltallet er det samme som udgangspunktet")).toHaveLength(1);
  });

  it("fund 19/20: eksemplerne står i trin 1; kortene har ikke aria-pressed", () => {
    vis();
    expect(document.querySelector("[data-guide-eksempler]")!.textContent).toMatch(/^Fx: Positiv bundlinje hver måned inden jul/);
    expect(document.querySelector("[data-guide-kort][aria-pressed]")).toBeNull();
  });
});
