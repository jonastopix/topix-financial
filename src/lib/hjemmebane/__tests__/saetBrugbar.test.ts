import { beforeEach, describe, expect, it, vi } from "vitest";

/** Skrivevejen for «Kunne du bruge den?» (16/9): en UPDATE på egen række,
    aldrig upsert, med husets #709-form (error kaster, nul rækker kaster).
    Supabase-klienten mockes som en kæde der fanger payload, eq-par og
    select-kolonnen (omkostningsFortegn.test-mønstret); upsert kaster, så
    en fremtidig «bare brug upsert» falder her. */

type Svar = { data: { id: string }[] | null; error: { message: string } | null };

const fanget = vi.hoisted(() => ({
  tabel: null as string | null,
  payload: null as Record<string, unknown> | null,
  eqs: [] as [string, unknown][],
  select: null as string | null,
  svar: { data: [{ id: "r1" }], error: null } as Svar,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabel: string) => {
      fanget.tabel = tabel;
      const kaede = {
        eq: (kolonne: string, vaerdi: unknown) => {
          fanget.eqs.push([kolonne, vaerdi]);
          return kaede;
        },
        select: (kolonner: string) => {
          fanget.select = kolonner;
          return Promise.resolve(fanget.svar);
        },
      };
      return {
        update: (payload: Record<string, unknown>) => {
          fanget.payload = payload;
          return kaede;
        },
        upsert: () => {
          throw new Error("saetBrugbar må ALDRIG bruge upsert");
        },
      };
    },
  },
}));

import { saetBrugbar } from "../akademiApi";

beforeEach(() => {
  fanget.tabel = null;
  fanget.payload = null;
  fanget.eqs = [];
  fanget.select = null;
  fanget.svar = { data: [{ id: "r1" }], error: null };
});

describe("saetBrugbar — UPDATE på egen række med #709-formen", () => {
  it("update-payloadens nøgler er præcis brugbar og brugbar_at, med svaret og et ISO-stempel", async () => {
    await saetBrugbar("u1", "L1", true);
    expect(fanget.tabel).toBe("member_progress");
    expect(Object.keys(fanget.payload ?? {}).sort()).toEqual(["brugbar", "brugbar_at"]);
    expect(fanget.payload?.brugbar).toBe(true);
    expect(typeof fanget.payload?.brugbar_at).toBe("string");
    expect(() => new Date(fanget.payload?.brugbar_at as string).toISOString()).not.toThrow();
  });

  it("nej → brugbar false", async () => {
    await saetBrugbar("u1", "L1", false);
    expect(fanget.payload?.brugbar).toBe(false);
  });

  it("eq på user_id og content_item_id — i den rækkefølge — og select(\"id\")", async () => {
    await saetBrugbar("u1", "L1", true);
    expect(fanget.eqs).toEqual([
      ["user_id", "u1"],
      ["content_item_id", "L1"],
    ]);
    expect(fanget.select).toBe("id");
  });

  it("nul rækker kaster — svaret er IKKE gemt (RLS eller ingen række)", async () => {
    fanget.svar = { data: [], error: null };
    await expect(saetBrugbar("u1", "L1", true)).rejects.toThrow("Skrivningen ramte nul rækker — svaret er IKKE gemt.");
    fanget.svar = { data: null, error: null };
    await expect(saetBrugbar("u1", "L1", true)).rejects.toThrow("ramte nul rækker");
  });

  it("error kaster med databasens besked", async () => {
    fanget.svar = { data: null, error: { message: "permission denied for table member_progress" } };
    await expect(saetBrugbar("u1", "L1", true)).rejects.toThrow("permission denied for table member_progress");
  });
});
