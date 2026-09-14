/**
 * KreativFuldskaerm — «Hent PNG» (14/9).
 *
 * Motoren (kreativEksport.hentKreativSomPng) og sonner er mocket: testen
 * beviser at knappen kalder motoren med kreativens element, dens id
 * (layout, udgave, format) og hendes navn; at knappen er spærret og viser
 * «Tegner…» mens motoren arbejder, og at klik nummer to ikke giver et
 * kald til; at pladsholderne er ude af DOM'en mens der tegnes og tilbage
 * bagefter; og at en fejl fra motoren bliver en toast.error med motorens
 * egen besked — aldrig tavs. Hvad html2canvas faktisk tegner (skrifter,
 * storage-billeder) kan jsdom ikke vise; det måles på skærmen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const motor = vi.hoisted(() => ({ hentKreativSomPng: vi.fn() }));
vi.mock("@/lib/kreativEksport", () => ({ hentKreativSomPng: motor.hentKreativSomPng }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { KreativFuldskaerm } from "../KreativFuldskaerm";
import { KREATIVER } from "../kreativer";

const data = { memberName: "Mette Hansen", companyName: "Hansen Byg ApS", dateLabel: "september 2026", portraetUrl: null, logoUrl: null };

const vis = (indeks = 0, onHentet?: () => void | Promise<void>) =>
  render(<KreativFuldskaerm kreativer={KREATIVER} data={data} indeks={indeks} onSkift={() => {}} onLuk={() => {}} onHentet={onHentet} />);

/** Et løfte testen selv afgør, så «mens den tegner» kan ses. */
const udsat = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  motor.hentKreativSomPng.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});
afterEach(cleanup);

describe("KreativFuldskaerm — Hent PNG", () => {
  it("kalder motoren med kreativens element, id og navn — og siger filnavn og mål bagefter", async () => {
    motor.hentKreativSomPng.mockResolvedValue({ filnavn: "the-boardroom-tre-paa-raekke-moerk-1080x1080-mette-hansen.png", bredde: 1080, hoejde: 1080 });
    vis(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    expect(motor.hentKreativSomPng).toHaveBeenCalledTimes(1);
    const [element, id, navn] = motor.hentKreativSomPng.mock.calls[0];
    expect((element as HTMLElement).getAttribute("data-kreativ")).toBe("tre-paa-raekke");
    expect(id).toEqual({ layout: "tre_paa_raekke", udgave: "moerk", format: "kvadrat" });
    expect(navn).toBe("Mette Hansen");
    expect(toastMock.success).toHaveBeenCalledWith("PNG hentet", { description: "the-boardroom-tre-paa-raekke-moerk-1080x1080-mette-hansen.png · 1080×1080 px" });
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("den åbne kreativ hentes i sit eget format — liggende giver 1200×627-id", async () => {
    motor.hentKreativSomPng.mockResolvedValue({ filnavn: "x.png", bredde: 1200, hoejde: 627 });
    const liggende = KREATIVER.findIndex((p) => p.format === "liggende" && p.layout === "optaget_i" && p.udgave === "lys");
    vis(liggende);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    const [element, id] = motor.hentKreativSomPng.mock.calls[0];
    expect((element as HTMLElement).getAttribute("data-kreativ")).toBe("optaget-i");
    expect(id).toEqual({ layout: "optaget_i", udgave: "lys", format: "liggende" });
  });

  it("mens den tegner: knappen er spærret og siger «Tegner…», pladsholderne er væk, og klik nummer to ignoreres", async () => {
    const u = udsat<{ filnavn: string; bredde: number; hoejde: number }>();
    motor.hentKreativSomPng.mockReturnValue(u.promise);
    vis(0);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll('[data-billedfelt="pladsholder"]').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    const knap = screen.getByRole("button", { name: /Tegner/ });
    expect(knap).toBeDisabled();
    expect(knap).toHaveAttribute("aria-busy", "true");
    expect(dialog.querySelectorAll('[data-billedfelt="pladsholder"]')).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-billedfelt="tom"]').length).toBeGreaterThan(0);

    fireEvent.click(knap);
    expect(motor.hentKreativSomPng).toHaveBeenCalledTimes(1);

    await act(async () => {
      u.resolve({ filnavn: "x.png", bredde: 1080, hoejde: 1080 });
      await u.promise;
    });
    expect(screen.getByRole("button", { name: /Hent PNG/ })).not.toBeDisabled();
    expect(dialog.querySelectorAll('[data-billedfelt="pladsholder"]').length).toBeGreaterThan(0);
  });

  it("fejl fra motoren siges ligeud med motorens besked — og knappen låses op igen", async () => {
    motor.hentKreativSomPng.mockRejectedValue(new Error("PNG'en kunne ikke dannes — lærredet er tomt eller spærret af et billede uden CORS."));
    vis(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    expect(toastMock.error).toHaveBeenCalledWith("Kunne ikke hente PNG", {
      description: "PNG'en kunne ikke dannes — lærredet er tomt eller spærret af et billede uden CORS.",
    });
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Hent PNG/ })).not.toBeDisabled();
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});

describe("KreativFuldskaerm — onHentet er tjeklistens stempel (14/9 aften)", () => {
  it("kaldes én gang EFTER en vellykket PNG — efter toasten, ikke før", async () => {
    const raekkefoelge: string[] = [];
    toastMock.success.mockImplementation(() => { raekkefoelge.push("toast"); });
    const onHentet = vi.fn(async () => { raekkefoelge.push("stempel"); });
    motor.hentKreativSomPng.mockResolvedValue({ filnavn: "x.png", bredde: 1080, hoejde: 1080 });
    vis(0, onHentet);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    expect(onHentet).toHaveBeenCalledTimes(1);
    expect(raekkefoelge).toEqual(["toast", "stempel"]);
  });

  it("kaldes IKKE når motoren fejler — et besøg eller et forsøg er ikke en hentet PNG", async () => {
    const onHentet = vi.fn();
    motor.hentKreativSomPng.mockRejectedValue(new Error("tomt lærred"));
    vis(0, onHentet);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    expect(onHentet).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it("et stempel der fejler rører ikke filen: PNG'en er hentet, succes-toasten står, ingen fejl-toast, knappen låses op", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onHentet = vi.fn(async () => { throw new Error("RLS"); });
    motor.hentKreativSomPng.mockResolvedValue({ filnavn: "x.png", bredde: 1080, hoejde: 1080 });
    vis(0, onHentet);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Hent PNG/ })).not.toBeDisabled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uden onHentet virker knappen som før", async () => {
    motor.hentKreativSomPng.mockResolvedValue({ filnavn: "x.png", bredde: 1080, hoejde: 1080 });
    vis(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Hent PNG/ }));
    });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });
});
