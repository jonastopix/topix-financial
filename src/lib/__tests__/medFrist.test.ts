import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { medFrist } from "@/lib/medFrist";
import {
  afgoerInvitationslink,
  INVITATIONSOPSLAG_FRIST_MS,
  INVITATIONSOPSLAG_UDEBLEV,
} from "@/lib/signupFejl";

// m28-invitationsopslag-haenger (30/9-2026): /auth ventede på
// lookup_invite_company_info uden frist — et svar, der aldrig kom, gav en
// spinner for evigt. medFrist afgør senest ved fristen.

describe("medFrist — et udeblevet svar bliver aldrig en evig venten", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("svarer arbejdet før fristen, er det svaret", async () => {
    const svar = medFrist(Promise.resolve("svar"), 1000, "udeblev");
    await expect(svar).resolves.toBe("svar");
  });

  it("svarer arbejdet aldrig, er det vedUdeblevet ved fristen — ikke før", async () => {
    let afgjort: unknown = "ikke endnu";
    const svar = medFrist(new Promise<string>(() => {}), 1000, "udeblev").then((v) => (afgjort = v));
    await vi.advanceTimersByTimeAsync(999);
    expect(afgjort).toBe("ikke endnu");
    await vi.advanceTimersByTimeAsync(1);
    await svar;
    expect(afgjort).toBe("udeblev");
  });

  it("et svar EFTER fristen ignoreres", async () => {
    let giv: (v: string) => void = () => {};
    const arbejde = new Promise<string>((r) => (giv = r));
    const svar = medFrist(arbejde, 1000, "udeblev");
    await vi.advanceTimersByTimeAsync(1000);
    giv("for sent");
    await expect(svar).resolves.toBe("udeblev");
  });

  it("kaster arbejdet før fristen, kaster medFrist det samme", async () => {
    const fejl = new Error("net");
    await expect(medFrist(Promise.reject(fejl), 1000, "udeblev")).rejects.toBe(fejl);
  });

  it("tager en thenable (supabase-js' forespørgsler er ikke Promises)", async () => {
    const thenable: PromiseLike<number> = { then: (ok) => Promise.resolve(ok?.(7)) as never };
    await expect(medFrist(thenable, 1000, 0)).resolves.toBe(7);
  });

  it("uret ryddes, når arbejdet svarer (ingen hængende timer)", async () => {
    await medFrist(Promise.resolve(1), 1000, 0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("invitationsopslagets frist — dommen og fladen", () => {
  it("fristen er 10 s (regnestykket står ved konstanten)", () => {
    expect(INVITATIONSOPSLAG_FRIST_MS).toBe(10_000);
  });

  it("et udeblevet svar dømmes «fejl» — aldrig «ukendt» og aldrig «gyldig»", () => {
    expect(afgoerInvitationslink({ harToken: true, ...INVITATIONSOPSLAG_UDEBLEV })).toBe("fejl");
  });

  const udenKommentarer = (k: string) =>
    k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

  /** Kildeværn: Auth.tsx' opslag går gennem medFrist med fristen og det udeblevne svar. */
  const opslagetHarFrist = (kilde: string): boolean => {
    const k = udenKommentarer(kilde);
    const start = k.indexOf("medFrist(");
    const rpc = k.indexOf('.rpc("lookup_invite_company_info"');
    if (start === -1 || rpc === -1 || rpc < start) return false;
    const blok = k.slice(start, k.indexOf(".then(({ data, error }) => {", start));
    return (
      blok.includes('supabase.rpc("lookup_invite_company_info", { invite_token: inviteToken })') &&
      blok.includes("INVITATIONSOPSLAG_FRIST_MS,") &&
      blok.includes("INVITATIONSOPSLAG_UDEBLEV,") &&
      (k.match(/\.rpc\("lookup_invite_company_info"/g) ?? []).length === 1
    );
  };

  const auth = readFileSync(resolve(process.cwd(), "src/pages/Auth.tsx"), "utf8");

  it("Auth.tsx: opslaget af invitationen har en frist", () => {
    expect(opslagetHarFrist(auth)).toBe(true);
  });

  it("Auth.tsx: et opslag, der kaster, ender også i «fejl» — aldrig på «venter»", () => {
    const k = udenKommentarer(auth);
    const blok = k.slice(k.indexOf("medFrist("), k.indexOf("}, [inviteToken]);"));
    expect(blok).toMatch(/\.catch\(\(e: unknown\) => \{[\s\S]*?setOpslag\("fejl"\);\s*\}\);\s*$/);
  });

  it("værnet virker: uden medFrist, uden frist eller uden det udeblevne svar → falsk", () => {
    const uden = auth.replace(
      /medFrist\(\s*supabase\.rpc\("lookup_invite_company_info", \{ invite_token: inviteToken \}\),\s*INVITATIONSOPSLAG_FRIST_MS,\s*INVITATIONSOPSLAG_UDEBLEV,\s*\)/,
      'supabase.rpc("lookup_invite_company_info", { invite_token: inviteToken })',
    );
    expect(uden).not.toBe(auth);
    expect(opslagetHarFrist(uden)).toBe(false);
    expect(opslagetHarFrist(auth.replace("      INVITATIONSOPSLAG_FRIST_MS,\n", "      60_000_000,\n"))).toBe(false);
    expect(opslagetHarFrist(auth.replace("      INVITATIONSOPSLAG_UDEBLEV,\n", "      { data: null, error: null },\n"))).toBe(false);
  });
});
