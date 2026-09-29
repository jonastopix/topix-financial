/** Forsidens «Mangler at booke» (29/9-2026) — rendering: fejl, tom, links. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("ManglerAtBooke", () => {
  it("to linjer med tallet, og navnene som links til virksomhedens side", () => {
    vis({ isLoading: false, isError: false, error: null, data: new Map([raekke("a", "Aarhus Is", "ikke_brugt", "afholdt"), raekke("b", "Bager", "aflyst", "link_sendt")]) });
    expect(screen.getByText("Mangler at booke")).toBeTruthy();
    expect(screen.getByText("Morten-session: 2")).toBeTruthy();
    expect(screen.getByText("Jonas-session: 1")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Aarhus Is" })[0].getAttribute("href")).toBe("/virksomhed/a");
    expect(screen.getAllByRole("link", { name: "Bager" }).map((l) => l.getAttribute("href"))).toEqual(["/virksomhed/b", "/virksomhed/b"]);
  });

  it("nul → «Alle har booket.»", () => {
    vis({ isLoading: false, isError: false, error: null, data: new Map([raekke("a", "A", "afholdt", "booket")]) });
    expect(screen.getByText("Morten-session: Alle har booket.")).toBeTruthy();
    expect(screen.getByText("Jonas-session: Alle har booket.")).toBeTruthy();
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
    expect(screen.queryByText(/session:/)).toBeNull();
  });
});
