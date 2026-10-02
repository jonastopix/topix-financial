/**
 * BekraeftMaalKort — pladsen (rådets fund 2/10, migration 20261002241000): under
 * «kun_bekraeftede» med 3 bekræftede aktive er «Det er vores mål»/«Behold»
 * deaktiverede med grunden; «Ikke nu»/«Slip» kan stadig trykkes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BEKRAEFT_ORD, type MaalTilBekraeftelse } from "@/lib/hjemmebane/maalBekraeft";
import { BEKRAEFT_PLADS_GRUND, bekraeftelseSpaerret } from "@/lib/hjemmebane/maalPladsdom";
import { BekraeftMaalKort } from "../BekraeftMaalKort";

afterEach(cleanup);

const maal = (id: string, created_at: string): MaalTilBekraeftelse =>
  ({ id, title: `Mål ${id}`, status: "active", created_at, bekraeftet_at: null, source: "advisor" });

const tegn = (spaerret: string | null) =>
  render(
    <MemoryRouter>
      <BekraeftMaalKort
        bekraeftelser={{ forslag: [maal("ny", "2026-10-02T08:00:00Z")], gamle: [maal("gl", "2026-09-01T08:00:00Z")] }}
        kvartalstjek={[]}
        kanKlikke
        bekraeftSpaerret={spaerret}
        onBekraeft={vi.fn(async () => null)}
        onKvartal={vi.fn(async () => null)}
      />
    </MemoryRouter>,
  );

const knap = (handling: string) => document.querySelector(`[data-handling="${handling}"]`) as HTMLButtonElement;

describe("BekraeftMaalKort — bekræftelsen spærret, når databasen ville afvise den", () => {
  it("«kun_bekraeftede» + 3 bekræftede: «Det er vores mål» og «Behold» er deaktiverede med grunden; slip kan trykkes", () => {
    tegn(bekraeftelseSpaerret("kun_bekraeftede", 3));
    expect(knap("bekraeft").disabled).toBe(true);
    expect(knap("behold").disabled).toBe(true);
    expect(knap("bekraeft").title).toBe(BEKRAEFT_PLADS_GRUND);
    expect(screen.getAllByText(BEKRAEFT_PLADS_GRUND).length).toBe(2);
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-handling="slip"]')) expect(b.disabled).toBe(false);
  });
  it("«kun_bekraeftede» + 2 bekræftede: mulig, ingen grund", () => {
    tegn(bekraeftelseSpaerret("kun_bekraeftede", 2));
    expect(knap("bekraeft").disabled).toBe(false);
    expect(knap("behold").disabled).toBe(false);
    expect(screen.queryByText(BEKRAEFT_PLADS_GRUND)).toBeNull();
    expect(screen.getByText(BEKRAEFT_ORD.detErVoresMaal)).toBeTruthy();
  });
  it("«alle» + 3 bekræftede: mulig (den gamle trigger dømmer aldrig en bekræftelse)", () => {
    tegn(bekraeftelseSpaerret("alle", 3));
    expect(knap("bekraeft").disabled).toBe(false);
    expect(document.querySelector("[data-bekraeft-spaerret]")).toBeNull();
  });
});
