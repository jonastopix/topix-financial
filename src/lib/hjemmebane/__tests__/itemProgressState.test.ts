import { describe, expect, it, vi } from "vitest";

// akademiApi importerer Supabase-klienten på modulniveau; den rigtige
// klient starter en auto-refresh-timer der fejler i jsdom og vælter
// suiten som «Unhandled Error». Samme mock-form som husets øvrige
// tests der rører datalaget (handoutEngineWritePaths, budgetEngineWritePaths).
// itemProgressState selv er ren og rører aldrig klienten.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("itemProgressState må ikke røre Supabase");
    },
  },
}));

import { itemProgressState } from "../akademiApi";

/** Reglen fra MemberProgress (6/9-2026): et fraværende tidsstempel
    (undefined) betyder det samme som null — det er ikke sket. De
    genererede typer udtrykker nullable kolonner som valgfrie felter, og
    dommen må ikke skelne mellem «kolonnen er tom» og «feltet mangler». */

const NU = "2026-09-06T21:00:00.000Z";

describe("itemProgressState — fraværende og null er det samme", () => {
  it("ingen række → untouched", () => {
    expect(itemProgressState(undefined)).toBe("untouched");
  });

  it("tom række (alle felter fraværende) → untouched, som alle null", () => {
    expect(itemProgressState({})).toBe("untouched");
    expect(
      itemProgressState({ seen_at: null, acknowledged_at: null, skipped_at: null }),
    ).toBe("untouched");
  });

  it("kun seen_at sat, resten fraværende → started (som resten null)", () => {
    expect(itemProgressState({ seen_at: NU })).toBe("started");
    expect(itemProgressState({ seen_at: NU, acknowledged_at: null, skipped_at: null })).toBe(
      "started",
    );
  });

  it("skipped_at sat, resten fraværende → skipped", () => {
    expect(itemProgressState({ skipped_at: NU })).toBe("skipped");
  });

  it("acknowledged_at sat → done, uanset om de andre er null eller fraværende", () => {
    expect(itemProgressState({ acknowledged_at: NU })).toBe("done");
    expect(itemProgressState({ acknowledged_at: NU, seen_at: null, skipped_at: undefined })).toBe(
      "done",
    );
  });

  it("rækkefølgen: done slår skipped, skipped slår started", () => {
    expect(itemProgressState({ seen_at: NU, skipped_at: NU, acknowledged_at: NU })).toBe("done");
    expect(itemProgressState({ seen_at: NU, skipped_at: NU })).toBe("skipped");
  });
});
