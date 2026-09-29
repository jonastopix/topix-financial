/**
 * HbSidebar — «Dit certifikat»s to mærker (29/9): hængelåsen EFTER teksten
 * (laast) og pillen «Ny» (maerke-mønstret fra Events' «Live nu», urørt).
 * Samme NavItem tegner kolonnen og skuffen, så prøven dækker mobil med.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HbSidebar, HbSidebarDrawer } from "../HbSidebar";
import { bygHbNav } from "@/lib/hjemmebane/hbNav";

afterEach(cleanup);

const tegn = (certifikat: "ny" | "laast" | "aaben" | null, skuffe = false) => {
  const nav = bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom", certifikat });
  render(<MemoryRouter>{skuffe ? <HbSidebarDrawer open onClose={() => undefined} nav={nav} /> : <HbSidebar nav={nav} />}</MemoryRouter>);
};

describe("HbSidebar — «Dit certifikat»", () => {
  it("«laast»: punktet er et link til /certifikat med en hængelås efter teksten — og ingen pille", () => {
    tegn("laast");
    const link = screen.getByRole("link", { name: /Dit certifikat/ });
    expect(link).toHaveAttribute("href", "/certifikat");
    const laas = screen.getByRole("img", { name: "Åbner senere" });
    expect(link).toContainElement(laas);
    expect(screen.queryByRole("link", { name: /^Ny$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Dit certifikat er klar til at blive hentet" })).toBeNull();
  });
  it("«ny»: pillen «Ny» ved siden af punktet, som sit eget link til /certifikat — og ingen lås", () => {
    tegn("ny");
    expect(screen.getByRole("link", { name: "Dit certifikat" })).toHaveAttribute("href", "/certifikat");
    const pille = screen.getByRole("link", { name: "Dit certifikat er klar til at blive hentet" });
    expect(pille).toHaveAttribute("href", "/certifikat");
    expect(pille).toHaveTextContent("Ny");
    expect(screen.queryByRole("img", { name: "Åbner senere" })).toBeNull();
  });
  it("«aaben»: punktet alene; null: intet punkt", () => {
    tegn("aaben");
    expect(screen.getByRole("link", { name: "Dit certifikat" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Åbner senere" })).toBeNull();
    cleanup();
    tegn(null);
    expect(screen.queryByRole("link", { name: /Dit certifikat/ })).toBeNull();
  });
  it("skuffen (mobil) tegner det samme: låsen i skuffen", () => {
    tegn("laast", true);
    expect(screen.getByRole("link", { name: /Dit certifikat/ })).toContainElement(screen.getByRole("img", { name: "Åbner senere" }));
  });
  it("Events' «Live nu» er urørt: uden live-event er der ingen pille ved Events", () => {
    tegn("ny");
    expect(screen.getByRole("link", { name: "Events" })).toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((l) => l.textContent === "Live nu")).toHaveLength(0);
  });
});
