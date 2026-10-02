import { beforeEach, describe, expect, it, vi } from "vitest";

// hentMestLaestUge (communityApi.ts) — fail-soft før migrationen 20261002275000.
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/tjenestekonti", () => ({ hentTjenestekonti: vi.fn(async () => []) }));

import { hentMestLaestUge, MEST_LAEST_MANGLER_KODER } from "../communityApi";

beforeEach(() => rpc.mockReset());

describe("hentMestLaestUge", () => {
  it("kalder RPC'en uden argumenter og normaliserer bigint-strenge til tal", async () => {
    rpc.mockResolvedValue({ data: [{ traad_id: "a", laesere: "4" }], error: null });
    await expect(hentMestLaestUge()).resolves.toEqual([{ traad_id: "a", laesere: 4 }]);
    expect(rpc).toHaveBeenCalledWith("community_mest_laest_uge");
  });

  it("funktionen findes ikke endnu (42883 / PGRST202) → [] uden fejl", async () => {
    expect([...MEST_LAEST_MANGLER_KODER]).toEqual(["42883", "PGRST202"]);
    for (const code of MEST_LAEST_MANGLER_KODER) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: "findes ikke" } });
      await expect(hentMestLaestUge()).resolves.toEqual([]);
    }
  });

  it("enhver anden fejl kastes (Sentry ser den; fladen tegner blot intet mærke)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(hentMestLaestUge()).rejects.toThrow("permission denied");
  });

  it("null-data → []", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(hentMestLaestUge()).resolves.toEqual([]);
  });
});
