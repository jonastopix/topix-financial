import { describe, it, expect, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { isJwtExpired, queryWithReauth, type QueryResult } from "../src/supabase/session";

const err = (partial: Partial<PostgrestError>): PostgrestError =>
  ({ message: "", details: "", hint: "", code: "", ...partial }) as PostgrestError;

describe("isJwtExpired", () => {
  it("matches the PGRST301 code", () => {
    expect(isJwtExpired(err({ code: "PGRST301" }))).toBe(true);
  });

  it("matches a jwt-expired message as a fallback", () => {
    expect(isJwtExpired(err({ message: "JWT expired" }))).toBe(true);
    expect(isJwtExpired(err({ message: "the jwt is expired now" }))).toBe(true);
  });

  it("does not match unrelated errors or null", () => {
    expect(isJwtExpired(err({ code: "PGRST116", message: "no rows" }))).toBe(false);
    expect(isJwtExpired(null)).toBe(false);
    expect(isJwtExpired(undefined)).toBe(false);
  });
});

describe("queryWithReauth", () => {
  const ok: QueryResult<number> = { data: [1], error: null };

  it("returns the first result and never re-auths when there is no error", async () => {
    const run = vi.fn().mockResolvedValue(ok);
    const reauthenticate = vi.fn();
    const res = await queryWithReauth({ reauthenticate }, run);
    expect(res).toBe(ok);
    expect(run).toHaveBeenCalledTimes(1);
    expect(reauthenticate).not.toHaveBeenCalled();
  });

  it("re-authenticates once and retries exactly once on JWT expiry", async () => {
    const expired: QueryResult<number> = { data: null, error: err({ code: "PGRST301" }) };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockResolvedValueOnce(expired).mockResolvedValueOnce(ok);
    const reauthenticate = vi.fn().mockResolvedValue(undefined);

    const res = await queryWithReauth({ reauthenticate }, run);

    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(res).toBe(ok);
    errorSpy.mockRestore();
  });

  it("retries at most once — a second JWT expiry surfaces, no loop", async () => {
    const expired: QueryResult<number> = { data: null, error: err({ code: "PGRST301" }) };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockResolvedValue(expired);
    const reauthenticate = vi.fn().mockResolvedValue(undefined);

    const res = await queryWithReauth({ reauthenticate }, run);

    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(res).toBe(expired);
    errorSpy.mockRestore();
  });

  it("does not retry when the context has no reauthenticate (service-role)", async () => {
    const expired: QueryResult<number> = { data: null, error: err({ code: "PGRST301" }) };
    const run = vi.fn().mockResolvedValue(expired);
    const res = await queryWithReauth({}, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(res).toBe(expired);
  });
});
