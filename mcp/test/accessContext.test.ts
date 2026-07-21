import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  createServiceRoleContext,
  isAccessContext,
} from "../src/access/accessContext";
import { loadEnv } from "../src/env";

const fakeEnv = { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "test-key" };
// dbFor/dbGlobal return the client without touching it, so a sentinel is enough
// — no network, no real Supabase client needed.
const stubClient = { __stub: true } as unknown as SupabaseClient;

describe("loadEnv", () => {
  it("throws naming the missing key(s), without leaking values", () => {
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => loadEnv({ SUPABASE_URL: "x" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("returns the values when present", () => {
    const env = loadEnv({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" });
    expect(env).toEqual({ supabaseUrl: "u", serviceRoleKey: "k" });
  });
});

describe("createServiceRoleContext", () => {
  it("builds a full-access service-role context", () => {
    const ctx = createServiceRoleContext(fakeEnv);
    expect(ctx.actor).toBe("service-role:local");
    expect(ctx.mode).toBe("service-role");
    expect(ctx.companyScope).toBe("all");
    expect(isAccessContext(ctx)).toBe(true);
  });

  it("dbFor returns a client for any company under scope 'all'", () => {
    const ctx = createServiceRoleContext(fakeEnv);
    expect(ctx.dbFor("11111111-1111-1111-1111-111111111111")).toBeDefined();
  });
});

describe("tenant gate (structural invariant)", () => {
  it("dbFor rejects an empty companyId", () => {
    const ctx = createContext({
      actor: "x",
      mode: "service-role",
      companyScope: "all",
      client: stubClient,
    });
    expect(() => ctx.dbFor("")).toThrow(/non-empty companyId/);
    expect(() => ctx.dbFor("   ")).toThrow(/non-empty companyId/);
  });

  it("dbFor rejects a company outside a restricted scope", () => {
    const ctx = createContext({
      actor: "user:abc",
      mode: "user",
      companyScope: ["A"],
      client: stubClient,
    });
    expect(ctx.dbFor("A")).toBe(stubClient);
    expect(() => ctx.dbFor("B")).toThrow(/outside the caller's access scope/);
  });

  it("dbGlobal returns the client without a company gate", () => {
    const ctx = createContext({
      actor: "x",
      mode: "service-role",
      companyScope: "all",
      client: stubClient,
    });
    expect(ctx.dbGlobal()).toBe(stubClient);
  });
});
