import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { jonasRetEfterTilbud, retBrugtAt, retTilGode } from "../sessionRet";

describe("sessionRet — den ene regel for den gratis 1:1", () => {
  it("spejlet i _shared er byte-ens (backenden booker efter samme fil)", () => {
    const src = readFileSync(resolve(__dirname, "../sessionRet.ts"), "utf8");
    const deno = readFileSync(resolve(__dirname, "../../../supabase/functions/_shared/sessionRet.ts"), "utf8");
    expect(deno).toBe(src);
  });
  it("Morten: kolonnen afgør", () => {
    expect(retTilGode("morten", { intro_session_used_at: null, jonas_session_used_at: "x" })).toBe(true);
    expect(retTilGode("morten", { intro_session_used_at: "2026-08-01T00:00:00Z", jonas_session_used_at: null })).toBe(false);
  });
  it("Jonas uden tilbud: kolonnen afgør", () => {
    expect(retTilGode("jonas", { intro_session_used_at: null, jonas_session_used_at: null })).toBe(true);
    expect(retTilGode("jonas", { intro_session_used_at: null, jonas_session_used_at: "2026-09-13T20:51:31.926+00:00" })).toBe(false);
  });
  it("målt 2/10: de fem tilbudte (brugt ≤ tilbudt) har sessionen til gode", () => {
    // BR Roset: brugt 13/9 (den gamle «ikke omfattet»), tilbudt 1/10.
    expect(retTilGode("jonas", { intro_session_used_at: "x", jonas_session_used_at: "2026-09-13 20:50:54.218+00", jonas_session_tilbudt_at: "2026-10-01 11:43:32.049+00" })).toBe(true);
    // ANLA: begge flueben i samme øjeblik (brugt = tilbudt).
    expect(retTilGode("jonas", { intro_session_used_at: "x", jonas_session_used_at: "2026-10-01 11:43:18.776+00", jonas_session_tilbudt_at: "2026-10-01 11:43:18.776+00" })).toBe(true);
  });
  it("en brug EFTER tilbuddet gør den brugt", () => {
    expect(retBrugtAt("jonas", { intro_session_used_at: null, jonas_session_used_at: "2026-10-03T09:00:00Z", jonas_session_tilbudt_at: "2026-10-01T11:43:00Z" })).toBe("2026-10-03T09:00:00Z");
  });
  it("et ulæseligt tidsstempel: kolonnen som den står (fail-closed)", () => {
    expect(jonasRetEfterTilbud("ikke-en-dato", "2026-10-01T00:00:00Z")).toBe("ikke-en-dato");
    expect(jonasRetEfterTilbud(null, "2026-10-01T00:00:00Z")).toBe(null);
  });
});
