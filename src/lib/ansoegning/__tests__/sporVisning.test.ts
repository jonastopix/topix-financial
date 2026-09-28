import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sporVisning mod en attrap af Supabase-klienten: kroppen, og at intet kaster (28/9).
 * Attrappen er en ALMINDELIG funktion, ikke vi.fn: vitests spion holder selv på de løfter,
 * implementeringen svarer, og meldte en afvist implementering som uhåndteret (målt 28/9) —
 * så prøven ville fælde på vitest og ikke på koden.
 */
const attrap = vi.hoisted(() => {
  const kald: { fn: string; body: Record<string, unknown> }[] = [];
  let svar: () => Promise<unknown> = () => Promise.resolve({ data: { ok: true }, error: null });
  return {
    kald,
    saetSvar: (s: () => Promise<unknown>) => { svar = s; },
    invoke: (fn: string, opt: { body: Record<string, unknown> }) => { kald.push({ fn, body: opt.body }); return svar(); },
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: attrap.invoke } } }));

import { sporVisning } from "@/lib/ansoegning/api";
import { TOMT_ANNONCESPOR } from "@/lib/ansoegning/skema";

const ID = "3f1c2b8e-9a4d-4c1e-8b2a-0d9e7f6a5b41";

beforeEach(() => {
  attrap.kald.length = 0;
  attrap.saetSvar(() => Promise.resolve({ data: { ok: true }, error: null }));
});

describe("sporVisning", () => {
  it("sender præcis handling, visning_id, trin, kilde, kilde_raa og annoncespor — intet token", () => {
    sporVisning(ID, "vist", "webinar", "webinar", { ...TOMT_ANNONCESPOR, utm_source: "ewebinar" });
    expect(attrap.kald).toHaveLength(1);
    const { fn, body } = attrap.kald[0];
    expect(fn).toBe("ansoegning-gem");
    expect(Object.keys(body).sort()).toEqual(["annoncespor", "handling", "kilde", "kilde_raa", "trin", "visning_id"]);
    expect(body).toMatchObject({ handling: "spor", visning_id: ID, trin: "vist", kilde: "webinar" });
  });

  it("returnerer void — siden kan ikke afvente sporet", () => {
    expect(sporVisning(ID, "start", "direkte", null, TOMT_ANNONCESPOR)).toBeUndefined();
  });

  it("en fejl fra functionen (fx 429 eller 500) eller et tabt net giver ingen uhåndteret afvisning", async () => {
    const uhaandteret = vi.fn();
    process.on("unhandledRejection", uhaandteret);
    attrap.saetSvar(() => Promise.resolve({ data: null, error: new Error("500") }));
    sporVisning(ID, "tastet", "webinar", null, TOMT_ANNONCESPOR);
    attrap.saetSvar(() => Promise.reject(new Error("ingen forbindelse")));
    sporVisning(ID, "vist", "webinar", null, TOMT_ANNONCESPOR);
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", uhaandteret);
    expect(uhaandteret).not.toHaveBeenCalled();
  });
});
