import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runPing } from "../src/tools/ping";
import { createContext, type AccessContext } from "../src/access/accessContext";
import { SERVER_NAME, SERVER_VERSION } from "../src/version";

const ctx = createContext({
  actor: "service-role:local",
  mode: "service-role",
  companyScope: "all",
  client: { __stub: true } as unknown as SupabaseClient,
});

describe("runPing", () => {
  it("returns server name, version and actor from the context", () => {
    const res = runPing(ctx);
    const payload = JSON.parse(res.content[0]!.text);
    expect(payload.server).toBe(SERVER_NAME);
    expect(payload.version).toBe(SERVER_VERSION);
    expect(payload.actor).toBe("service-role:local");
    expect(payload.mode).toBe("service-role");
  });

  it("echoes optional input when provided", () => {
    const res = runPing(ctx, { echo: "hej" });
    expect(JSON.parse(res.content[0]!.text).echo).toBe("hej");
  });

  it("is rejected without a valid AccessContext", () => {
    expect(() => runPing(null as unknown as AccessContext)).toThrow(/valid AccessContext/);
    expect(() => runPing({} as unknown as AccessContext)).toThrow(/valid AccessContext/);
    // Malformed object that looks context-ish but has no gate methods.
    expect(() =>
      runPing({ actor: "", mode: "service-role" } as unknown as AccessContext),
    ).toThrow(/valid AccessContext/);
  });
});
