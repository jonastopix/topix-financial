/** Højre kolonnes byggesten (30/9-2026): feltet, bjælken — rendering. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Fremdrift, TalFelt } from "../HoejreKolonne";

afterEach(cleanup);

describe("TalFelt", () => {
  it("et tal med etiket og ord ved prikken — farve aldrig alene", () => {
    const { container } = render(<TalFelt slags="opslag" etiket="Ubesvarede opslag" tilstand={{ art: "tal", antal: 3 }} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Ubesvarede opslag")).toBeTruthy();
    expect(screen.getByText("Venter på svar")).toBeTruthy();
    expect(container.querySelector("[data-felt-tone]")?.getAttribute("data-felt-tone")).toBe("venter");
  });
  it("0 er roligt og siger det", () => {
    const { container } = render(<TalFelt slags="opslag" etiket="Ubesvarede opslag" tilstand={{ art: "tal", antal: 0 }} />);
    expect(screen.getByText("Alle besvaret")).toBeTruthy();
    expect(container.querySelector("[data-felt-tone]")?.getAttribute("data-felt-tone")).toBe("i_orden");
  });
  it("fejl → «—» og «Kunne ikke hentes», aldrig et 0", () => {
    render(<TalFelt slags="betaling" etiket="Venter på betaling" tilstand={{ art: "fejl" }} />);
    expect(screen.getByText("Kunne ikke hentes")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("Ingen venter")).toBeNull();
  });
  it("henter → skelet, intet tal", () => {
    const { container } = render(<TalFelt slags="sessioner" etiket="Sessioner i dag" tilstand={{ art: "henter" }} />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByText("Sessioner i dag")).toBeNull();
  });
});

describe("Fremdrift", () => {
  it("X af Y i tekst og som progressbar; link når der er et", () => {
    render(<MemoryRouter><Fremdrift noegle="rapporterer" etiket="Har rapporteret august" x={3} y={12} to="/virksomheder?puls=rapporterer" linkKlasse="x" /></MemoryRouter>);
    const bar = screen.getByRole("progressbar", { name: "Har rapporteret august" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("12");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("25%");
    expect(screen.getByRole("link", { name: "Har rapporteret august" }).getAttribute("href")).toBe("/virksomheder?puls=rapporterer");
  });
});
