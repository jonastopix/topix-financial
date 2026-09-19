/**
 * ewebinarApi (udkast 19/9): REST-klienten til engangsimporten. `fetchFn`
 * gives ind, så pagineringen, fejlbeskederne og værnene kan bevises uden
 * netværk. Basen `/v2` er målt (19/9: `/v2/registrants` svarer API'ets eget
 * «Unauthorized», `/api/v2/...` svarer nginx-HTML).
 */
import { describe, expect, it } from "vitest";
import {
  EWEBINAR_BASE_STANDARD,
  EwebinarFejl,
  hentAlleRegistranter,
  hentAlleSider,
  hentAlleWebinarer,
  hentBase,
  hentNoegle,
  hentRegistrant,
  NOEGLE_MANGLER_BESKED,
  type FetchFn,
} from "../../../supabase/functions/_shared/ewebinarApi.ts";

const NOEGLE = "test-noegle";

function svar(krop: unknown, status = 200): Response {
  return new Response(JSON.stringify(krop), { status, headers: { "Content-Type": "application/json" } });
}

/** Optager kaldene, så pagineringen kan efterprøves. */
function optager(sider: Array<{ registrants: unknown[]; nextCursor: string | null }>): { fetchFn: FetchFn; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fetchFn: FetchFn = (url) => {
    urls.push(url);
    const side = sider[Math.min(i, sider.length - 1)];
    i++;
    return Promise.resolve(svar(side));
  };
  return { fetchFn, urls };
}

describe("basen og nøglen", () => {
  it("standardbasen er den målte /v2 — ikke hjælpeartiklens /api/v2", () => {
    expect(EWEBINAR_BASE_STANDARD).toBe("https://api.ewebinar.com/v2");
  });

  it("uden EWEBINAR_API_KEY kastes 503 med en besked der siger hvor nøglen findes", () => {
    const tomt = () => undefined;
    expect(() => hentNoegle(tomt)).toThrow(EwebinarFejl);
    expect(() => hentNoegle(tomt)).toThrow(NOEGLE_MANGLER_BESKED);
    expect(() => hentNoegle(() => "   ")).toThrow(/mangler/);
    expect(NOEGLE_MANGLER_BESKED).toMatch(/Lovable.*Secrets/);
    expect(NOEGLE_MANGLER_BESKED).toMatch(/Integrations.*REST API/);
    try { hentNoegle(tomt); } catch (e) { expect((e as EwebinarFejl).status).toBe(503); }
  });

  it("nøglen trimmes; basen falder tilbage på standarden og kan overstyres", () => {
    expect(hentNoegle(() => "  abc  ")).toBe("abc");
    expect(hentBase(() => undefined)).toBe(EWEBINAR_BASE_STANDARD);
    expect(hentBase(() => "")).toBe(EWEBINAR_BASE_STANDARD);
    expect(hentBase((n) => (n === "EWEBINAR_API_BASE" ? "https://api.ewebinar.com/api/v2/" : undefined))).toBe("https://api.ewebinar.com/api/v2");
  });

  it("nøglen sendes som Bearer, og der bedes om JSON", async () => {
    let set: RequestInit | undefined;
    const fetchFn: FetchFn = (_u, init) => {
      set = init;
      return Promise.resolve(svar({ id: "a1", sessionTime: "replay" }));
    };
    await hentRegistrant("a1", { noegle: NOEGLE, fetchFn });
    const headers = set?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${NOEGLE}`);
    expect(headers.accept).toBe("application/json");
  });

  it("id'et url-kodes, så et mærkeligt id ikke brækker stien", async () => {
    const urls: string[] = [];
    const fetchFn: FetchFn = (u) => { urls.push(u); return Promise.resolve(svar({})); };
    await hentRegistrant("a/b?c", { noegle: NOEGLE, fetchFn });
    expect(urls[0]).toBe("https://api.ewebinar.com/v2/registrants/a%2Fb%3Fc");
  });
});

describe("pagineringen", () => {
  it("følger nextCursor til den er tom og samler alle rækker", async () => {
    const { fetchFn, urls } = optager([
      { registrants: [{ id: "1" }, { id: "2" }], nextCursor: "c1" },
      { registrants: [{ id: "3" }], nextCursor: "c2" },
      { registrants: [{ id: "4" }], nextCursor: null },
    ]);
    const ud = await hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0 });
    expect(ud.raekker.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
    expect(ud.sider).toBe(3);
    expect(ud.afkortet).toBe(false);
    expect(urls[0]).toBe("https://api.ewebinar.com/v2/registrants");
    expect(urls[1]).toBe("https://api.ewebinar.com/v2/registrants?nextCursor=c1");
    expect(urls[2]).toBe("https://api.ewebinar.com/v2/registrants?nextCursor=c2");
  });

  it("updatedSince gives KUN på første kald — markøren bærer filteret videre", async () => {
    const { fetchFn, urls } = optager([
      { registrants: [{ id: "1" }], nextCursor: "c1" },
      { registrants: [{ id: "2" }], nextCursor: null },
    ]);
    await hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0 }, "2026-09-01T00:00:00Z");
    expect(urls[0]).toContain("updatedSince=2026-09-01T00%3A00%3A00Z");
    expect(urls[1]).not.toContain("updatedSince");
  });

  it("engangsimporten sender INGEN updatedSince — historikken skal med", async () => {
    const { fetchFn, urls } = optager([{ registrants: [{ id: "1" }], nextCursor: null }]);
    await hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0 });
    expect(urls[0]).not.toContain("updatedSince");
  });

  it("loftet stopper en løbsk markør og siger afkortet", async () => {
    const fetchFn: FetchFn = () => Promise.resolve(svar({ registrants: [{ id: "x" }], nextCursor: `c${Math.random()}` }));
    const ud = await hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0, maksSider: 3 });
    expect(ud.sider).toBe(3);
    expect(ud.afkortet).toBe(true);
    expect(ud.raekker).toHaveLength(3);
  });

  it("samme markør to gange → stop (ingen uendelig løkke)", async () => {
    const fetchFn: FetchFn = () => Promise.resolve(svar({ registrants: [{ id: "x" }], nextCursor: "den-samme" }));
    const ud = await hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0, maksSider: 50 });
    expect(ud.sider).toBe(2);
    expect(ud.afkortet).toBe(true);
  });

  it("tomt svar og manglende felt giver nul rækker, ikke et kast", async () => {
    const tom: FetchFn = () => Promise.resolve(svar({ registrants: [], nextCursor: null }));
    expect((await hentAlleRegistranter({ noegle: NOEGLE, fetchFn: tom, pauseMs: 0 })).raekker).toEqual([]);
    const uden: FetchFn = () => Promise.resolve(svar({ noget: "andet" }));
    expect((await hentAlleRegistranter({ noegle: NOEGLE, fetchFn: uden, pauseMs: 0 })).raekker).toEqual([]);
  });

  it("webinarerne læses fra feltet «webinars» på /all-webinars (også kladder)", async () => {
    const urls: string[] = [];
    const fetchFn: FetchFn = (u) => { urls.push(u); return Promise.resolve(svar({ webinars: [{ id: "w1" }, { id: "w2" }], nextCursor: null })); };
    const ud = await hentAlleWebinarer({ noegle: NOEGLE, fetchFn, pauseMs: 0 });
    expect(ud.raekker).toHaveLength(2);
    expect(urls[0]).toBe("https://api.ewebinar.com/v2/all-webinars");
  });

  it("basen kan overstyres (hjælpeartiklens form), og skråstreger til sidst klippes", async () => {
    const { fetchFn, urls } = optager([{ registrants: [], nextCursor: null }]);
    await hentAlleSider("/registrants", "registrants", { noegle: NOEGLE, fetchFn, pauseMs: 0, base: "https://api.ewebinar.com/api/v2/" });
    expect(urls[0]).toBe("https://api.ewebinar.com/api/v2/registrants");
  });
});

describe("fejlene — importen siger pænt fra", () => {
  const kald = (status: number, krop = "nej") =>
    hentAlleRegistranter({ noegle: NOEGLE, pauseMs: 0, fetchFn: () => Promise.resolve(new Response(krop, { status })) });

  it("401/403 nævner nøglen og rotationen", async () => {
    await expect(kald(403)).rejects.toThrow(/afviste nøglen \(403\).*EWEBINAR_API_KEY/s);
    await expect(kald(401)).rejects.toMatchObject({ name: "EwebinarFejl", status: 401 });
  });

  it("404 foreslår den anden base", async () => {
    await expect(kald(404)).rejects.toThrow(/api\/v2/);
  });

  it("429 siger at importen er idempotent og kan køres igen", async () => {
    await expect(kald(429)).rejects.toThrow(/grænsen \(429\).*idempotent/s);
  });

  it("svar der ikke er JSON giver 502 med sti — ikke et uforståeligt parse-kast", async () => {
    const fetchFn: FetchFn = () => Promise.resolve(new Response("<html>", { status: 200 }));
    await expect(hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0 })).rejects.toMatchObject({ status: 502 });
  });

  it("netværksfejl bliver til EwebinarFejl(502), ikke en rå TypeError", async () => {
    const fetchFn: FetchFn = () => Promise.reject(new TypeError("network down"));
    const fejl = await hentAlleRegistranter({ noegle: NOEGLE, fetchFn, pauseMs: 0 }).catch((e) => e);
    expect(fejl).toBeInstanceOf(EwebinarFejl);
    expect(fejl.status).toBe(502);
    expect(fejl.message).toContain("network down");
  });
});
