import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Stub the Supabase client factories so no real network/client is created.
// vi.hoisted keeps these definitions available to the (hoisted) vi.mock factory.
const { signInWithPassword, advisorStubClient, serviceRoleStubClient } = vi.hoisted(
  () => {
    const signIn = vi.fn();
    return {
      signInWithPassword: signIn,
      advisorStubClient: { auth: { signInWithPassword: signIn } },
      serviceRoleStubClient: { __serviceRole: true },
    };
  },
);

vi.mock("../src/supabase/client", () => ({
  createAdvisorClient: () => advisorStubClient as unknown as SupabaseClient,
  createServiceRoleClient: () => serviceRoleStubClient as unknown as SupabaseClient,
}));

import {
  createContext,
  createAdvisorContext,
  createServiceRoleContext,
  isAccessContext,
} from "../src/access/accessContext";
import { loadEnv } from "../src/env";

const advisorEnv = {
  supabaseUrl: "https://example.supabase.co",
  publishableKey: "pub-key",
  advisorEmail: "advisor@example.com",
  advisorPassword: "super-secret-pw",
};

// dbFor/dbGlobal return the client without touching it, so a sentinel is enough.
const stubClient = { __stub: true } as unknown as SupabaseClient;

beforeEach(() => {
  signInWithPassword.mockReset();
});

describe("loadEnv", () => {
  it("throws naming the missing key(s), without leaking values", () => {
    expect(() => loadEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => loadEnv({ SUPABASE_URL: "x" })).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
    expect(() =>
      loadEnv({ SUPABASE_URL: "x", SUPABASE_PUBLISHABLE_KEY: "p" }),
    ).toThrow(/MCP_ADVISOR_EMAIL/);
    expect(() =>
      loadEnv({
        SUPABASE_URL: "x",
        SUPABASE_PUBLISHABLE_KEY: "p",
        MCP_ADVISOR_EMAIL: "a@b.dk",
      }),
    ).toThrow(/MCP_ADVISOR_PASSWORD/);
  });

  it("returns the values when present; service-role key is optional", () => {
    const env = loadEnv({
      SUPABASE_URL: "u",
      SUPABASE_PUBLISHABLE_KEY: "p",
      MCP_ADVISOR_EMAIL: "a@b.dk",
      MCP_ADVISOR_PASSWORD: "pw",
    });
    expect(env).toEqual({
      supabaseUrl: "u",
      publishableKey: "p",
      advisorEmail: "a@b.dk",
      advisorPassword: "pw",
    });
    expect(env.serviceRoleKey).toBeUndefined();
  });

  it("passes the service-role key through only when set", () => {
    const env = loadEnv({
      SUPABASE_URL: "u",
      SUPABASE_PUBLISHABLE_KEY: "p",
      MCP_ADVISOR_EMAIL: "a@b.dk",
      MCP_ADVISOR_PASSWORD: "pw",
      SUPABASE_SERVICE_ROLE_KEY: "svc",
    });
    expect(env.serviceRoleKey).toBe("svc");
  });
});

describe("createAdvisorContext", () => {
  it("builds a user-mode, full-scope context from the advisor login", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const ctx = await createAdvisorContext(advisorEnv);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: advisorEnv.advisorEmail,
      password: advisorEnv.advisorPassword,
    });
    expect(ctx.actor).toBe("user:user-123");
    expect(ctx.mode).toBe("user");
    expect(ctx.companyScope).toBe("all");
    expect(isAccessContext(ctx)).toBe(true);
    // The caller-scoped client is what dbFor hands out under scope "all".
    expect(ctx.dbFor("11111111-1111-1111-1111-111111111111")).toBe(advisorStubClient);
  });

  it("throws a neutral error on bad credentials, leaking neither email nor password", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials" },
    });

    await expect(createAdvisorContext(advisorEnv)).rejects.toThrow(
      "Advisor authentication failed",
    );

    // The thrown message must not carry any credential value.
    await createAdvisorContext(advisorEnv).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain(advisorEnv.advisorEmail);
      expect(msg).not.toContain(advisorEnv.advisorPassword);
    });

    errorSpy.mockRestore();
  });

  it("throws a neutral error when sign-in returns no user", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });

    await expect(createAdvisorContext(advisorEnv)).rejects.toThrow(
      "Advisor authentication failed",
    );
    errorSpy.mockRestore();
  });
});

describe("createServiceRoleContext", () => {
  it("throws when no service-role key is present (Lovable-owned prod)", () => {
    expect(() => createServiceRoleContext(advisorEnv)).toThrow(/unavailable/);
  });

  it("builds a full-access service-role context when a key is supplied", () => {
    const ctx = createServiceRoleContext({ ...advisorEnv, serviceRoleKey: "svc" });
    expect(ctx.actor).toBe("service-role:local");
    expect(ctx.mode).toBe("service-role");
    expect(ctx.companyScope).toBe("all");
    expect(isAccessContext(ctx)).toBe(true);
    expect(ctx.dbFor("11111111-1111-1111-1111-111111111111")).toBe(
      serviceRoleStubClient,
    );
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
