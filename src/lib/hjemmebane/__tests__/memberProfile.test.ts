import { describe, expect, it, vi } from "vitest";

// memberProfile.ts importerer den rigtige supabase-klient, hvis
// auth-auto-refresh giver unhandled rejections i node-miljøet.
// externalHref er ren, så en tom mock rækker (husets mønster fra
// handoutEngineWritePaths.test.ts m.fl.).
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { externalHref } from "../memberProfile";

/** externalHref reparerer protokol-løse værdier ved visning — prod har
    websites som "www.brroset.dk", der som href er en relativ sti. */
describe("externalHref", () => {
  it("lader https:// stå uændret", () => {
    expect(externalHref("https://x.dk")).toBe("https://x.dk");
  });

  it("lader http:// stå uændret", () => {
    expect(externalHref("http://x.dk")).toBe("http://x.dk");
  });

  it("er versal-ufølsom på protokollen (HTTPS://X.DK uændret)", () => {
    expect(externalHref("HTTPS://X.DK")).toBe("HTTPS://X.DK");
  });

  it("sætter https:// foran www-domæne uden protokol", () => {
    expect(externalHref("www.x.dk")).toBe("https://www.x.dk");
  });

  it("sætter https:// foran bart domæne", () => {
    expect(externalHref("x.dk")).toBe("https://x.dk");
  });

  it("trimmer mellemrum før præfiks", () => {
    expect(externalHref("  www.x.dk  ")).toBe("https://www.x.dk");
  });

  it("giver null for null", () => {
    expect(externalHref(null)).toBeNull();
  });

  it("giver null for tom streng", () => {
    expect(externalHref("")).toBeNull();
  });
});
