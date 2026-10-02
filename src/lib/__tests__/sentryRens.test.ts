import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rensSentryHaendelse, rensUrl } from "@/lib/sentryRens";

/** Tokens i URL'en forlader aldrig browseren til Sentry (rådets fund 2/10, punkt 7). */
describe("sentryRens — rensUrl", () => {
  it("fjerner t og token på de tre token-stier, og kun dér", () => {
    expect(rensUrl("https://app.theboardroom.dk/ring-mig-op?t=abc.def")).toBe("https://app.theboardroom.dk/ring-mig-op");
    expect(rensUrl("https://app.theboardroom.dk/aftale?token=1234-uuid")).toBe("https://app.theboardroom.dk/aftale");
    expect(rensUrl("/delt/webinar?t=xyz&utm_source=x")).toBe("/delt/webinar?utm_source=x");
    expect(rensUrl("/ring-mig-op?utm_source=klaviyo&t=abc#top")).toBe("/ring-mig-op?utm_source=klaviyo#top");
    expect(rensUrl("navigation til /ring-mig-op?t=abc fra /")).toBe("navigation til /ring-mig-op fra /");
    // Andre stier og andre parametre røres ikke.
    expect(rensUrl("/aftaler?token=x")).toBe("/aftaler?token=x");
    expect(rensUrl("/webinar?t=x")).toBe("/webinar?t=x");
    expect(rensUrl("/ring-mig-op")).toBe("/ring-mig-op");
  });
});

describe("sentryRens — hele hændelsen", () => {
  it("request.url, query_string, transaktion, breadcrumbs og spans", () => {
    const h = {
      transaction: "/ring-mig-op",
      request: { url: "https://app.theboardroom.dk/ring-mig-op?t=HEMMELIG", query_string: "t=HEMMELIG" },
      breadcrumbs: [
        { category: "navigation", data: { from: "/", to: "/aftale?token=HEMMELIG" } },
        { category: "fetch", data: { url: "https://x.supabase.co/functions/v1/ring-mig-op" } },
      ],
      spans: [{ data: { "http.url": "https://app.theboardroom.dk/delt/webinar?t=HEMMELIG" } }],
      contexts: { trace: { data: { url: "/ring-mig-op?t=HEMMELIG" } } },
    };
    const ud = rensSentryHaendelse(h);
    expect(JSON.stringify(ud)).not.toContain("HEMMELIG");
    expect(ud.request.url).toBe("https://app.theboardroom.dk/ring-mig-op");
    expect("query_string" in ud.request).toBe(false);
    expect(ud.breadcrumbs[1].data.url).toBe("https://x.supabase.co/functions/v1/ring-mig-op");
  });

  it("kaster aldrig — heller ikke på en cyklus eller null", () => {
    const a: Record<string, unknown> = { url: "/ring-mig-op?t=x" };
    a.selv = a;
    expect(() => rensSentryHaendelse(a)).not.toThrow();
    expect(a.url).toBe("/ring-mig-op");
    expect(rensSentryHaendelse(null)).toBe(null);
  });

  it("main.tsx kobler rensen på både beforeSend og beforeSendTransaction", () => {
    const m = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    expect(m).toContain("beforeSend: (haendelse) => rensSentryHaendelse(haendelse),");
    expect(m).toContain("beforeSendTransaction: (haendelse) => rensSentryHaendelse(haendelse),");
  });
});
