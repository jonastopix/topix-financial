/** Forsidens «Mangler at booke» (29/9-2026) — rendering: fejl, tom, links.
    30/9 (Jonas' godkendte redesign af højre kolonne): før stod linjerne som
    «Morten-session: 2» med alle navne i én kommasætning. Nu er hver linje en
    foldbar række — en KNAP med aria-expanded, etiketten og tallet i et mærke
    — og navnene vises først ved klik, én pr. linje, fem ad gangen + «Vis
    alle N». Testene er rettet til den form; hvad de beviser, er det samme:
    tallet, navnene som links til virksomhedens side, «Alle har booket.» ved
    nul, fejl før tom, skelet uden tal. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ManglerAtBooke } from "../ManglerAtBooke";
import { HentningsFejl } from "@/lib/kraevRaekker";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import type { OverbliksRaekke, SessionDom } from "@/lib/medlemsOverblik";

afterEach(cleanup);
const NY = "2026-09-20T10:00:00Z";
const dom = (raadgiver: "morten" | "jonas", status: SessionDom["status"]): SessionDom => ({ raadgiver, status, tid: null, retAt: null });
const raekke = (id: string, navn: string, m: SessionDom["status"], j: SessionDom["status"]) =>
  [id, { companyId: id, navn, medlemSiden: NY, sessioner: { morten: dom("morten", m), jonas: dom("jonas", j) } } as unknown as OverbliksRaekke] as const;
const vis = (hentning: Parameters<typeof ManglerAtBooke>[0]["hentning"]) =>
  render(<MemoryRouter><ManglerAtBooke hentning={hentning} virksomhedsLink={(id) => `/virksomhed/${id}`} linkKlasse="x" /></MemoryRouter>);
const knap = (navn: RegExp) => screen.getByRole("button", { name: navn });

describe("ManglerAtBooke", () => {
  it("to foldbare rækker med tallet; navnene som links til virksomhedens side først efter klik", () => {
    vis({ isLoading: false, isError: false, error: null, data: new Map([raekke("a", "Aarhus Is", "ikke_brugt", "afholdt"), raekke("b", "Bager", "aflyst", "link_sendt")]) });
    expect(screen.getByText("Mangler at booke")).toBeTruthy();
    const morten = knap(/^Morten-session\s*2$/);
    const jonas = knap(/^Jonas-session\s*1$/);
    expect(morten.getAttribute("aria-expanded")).toBe("false");
    expect(jonas.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    fireEvent.click(morten);
    expect(morten.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Aarhus Is" }).getAttribute("href")).toBe("/virksomhed/a");
    expect(screen.getByRole("link", { name: "Bager" }).getAttribute("href")).toBe("/virksomhed/b");

    fireEvent.click(jonas);
    expect(screen.getAllByRole("link", { name: "Bager" }).map((l) => l.getAttribute("href"))).toEqual(["/virksomhed/b", "/virksomhed/b"]);
  });

  it("fem ad gangen + «Vis alle N»", () => {
    const syv = ["A", "B", "C", "D", "E", "F", "G"].map((n) => raekke(n.toLowerCase(), n, "ikke_brugt", "afholdt"));
    vis({ isLoading: false, isError: false, error: null, data: new Map(syv) });
    fireEvent.click(knap(/^Morten-session\s*7$/));
    expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Vis alle 7" }));
    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: /Vis alle/ })).toBeNull();
  });

  it("nul → «Alle har booket.», ingen knap", () => {
    vis({ isLoading: false, isError: false, error: null, data: new Map([raekke("a", "A", "afholdt", "booket")]) });
    expect(screen.getAllByText("Alle har booket.")).toHaveLength(2);
    expect(screen.getByText("Morten-session")).toBeTruthy();
    expect(screen.getByText("Jonas-session")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("fejl → husets rådgiver-linje, aldrig «Alle har booket.»", () => {
    const fejl = new HentningsFejl("session_bookings", "netværk");
    vis({ isLoading: false, isError: true, error: fejl, data: undefined });
    expect(screen.getByText(raadgiverHentefejlTekst(fejl, "forsiden"))).toBeTruthy();
    expect(screen.queryByText(/Alle har booket/)).toBeNull();
  });

  it("henter → skelet, intet tal", () => {
    const { container } = vis({ isLoading: true, isError: false, error: null, data: undefined });
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByText(/session/)).toBeNull();
  });
});
