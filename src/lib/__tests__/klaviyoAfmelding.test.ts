import { describe, expect, it } from "vitest";
import {
  AFMELD_AARSAG,
  AFMELD_AFSTAND_MIN,
  AFMELD_STI,
  AFMELD_UDFALD,
  type AfmeldSporRaekke,
  afmeld,
  brugbarAfmeldMail,
  bygAfmeldKrop,
  KLAVIYO_AFMELD_SECRET,
  vaelgGenafmeldinger,
} from "../../../supabase/functions/_shared/klaviyoAfmelding.ts";

/**
 * Afsendelsen af en afmelding (udkast 22/9-2026). Kroppen er ordret efter
 * Klaviyos reference; kaldet prøves med en falsk fetch, så intet går ud.
 */

/** En skriver, der husker rækkerne i stedet for at skrive dem. */
function husker() {
  const raekker: Record<string, unknown>[] = [];
  return {
    raekker,
    from(tabel: string) {
      return {
        insert(raekke: unknown) {
          raekker.push({ tabel, ...(raekke as Record<string, unknown>) });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const svarer = (status: number, krop = "") => () => Promise.resolve(new Response(krop, { status }));
const NOEGLE = "pk_prøvenøgle_kun_i_testen";
const NU = new Date("2026-09-22T11:00:00.000Z");

describe("klaviyoAfmelding — kroppen", () => {
  it("er ordret Klaviyos form: email-kanalen, marketing, UNSUBSCRIBED", () => {
    expect(bygAfmeldKrop("Test@Example.COM")).toEqual({
      data: {
        type: "profile-subscription-bulk-delete-job",
        attributes: {
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email: "test@example.com",
                  subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED" } } },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("bærer INTET list_id — beslutningen er den globale afmelding", () => {
    expect(JSON.stringify(bygAfmeldKrop("a@b.dk"))).not.toContain("list_id");
    expect(JSON.stringify(bygAfmeldKrop("a@b.dk"))).not.toContain("list");
  });

  it("bærer hverken sms, push eller telefonnummer — eWebinar har kun sagt noget om mails", () => {
    const s = JSON.stringify(bygAfmeldKrop("a@b.dk"));
    expect(s).not.toContain("sms");
    expect(s).not.toContain("push");
    expect(s).not.toContain("phone_number");
  });

  it("stien og secret'ens navn", () => {
    expect(AFMELD_STI).toBe("/profile-subscription-bulk-delete-jobs/");
    expect(KLAVIYO_AFMELD_SECRET).toBe("KLAVIYO_AFMELD_KEY");
    expect(KLAVIYO_AFMELD_SECRET).not.toBe("KLAVIYO_API_KEY");
  });

  it("udfaldslisten rummer loft og ugyldig — ellers vælter sporskrivningen ved 429", () => {
    expect(AFMELD_UDFALD).toContain("loft");
    expect(AFMELD_UDFALD).toContain("ugyldig");
    expect(AFMELD_UDFALD).toContain("timeout");
  });

  it("brugbarAfmeldMail", () => {
    expect(brugbarAfmeldMail("a@b.dk")).toBe(true);
    expect(brugbarAfmeldMail(" a@b.dk ")).toBe(true);
    expect(brugbarAfmeldMail("abdk")).toBe(false);
    expect(brugbarAfmeldMail("")).toBe(false);
    expect(brugbarAfmeldMail(null)).toBe(false);
  });
});

describe("klaviyoAfmelding — afmeld", () => {
  it("202 er ok, og sporet bærer mailen i små bogstaver", async () => {
    const h = husker();
    const r = await afmeld(h, NOEGLE, { email: "  Test@Example.COM ", kilde: "webhook", ewebinarId: "abc123" }, { fetchImpl: svarer(202), nuDato: NU });
    expect(r.sendt).toBe(true);
    expect(r.spor.udfald).toBe("ok");
    expect(h.raekker).toHaveLength(1);
    expect(h.raekker[0]).toMatchObject({
      tabel: "klaviyo_afmeldinger",
      email: "test@example.com",
      kilde: "webhook",
      ewebinar_id: "abc123",
      udfald: "ok",
      status: 202,
    });
  });

  it("kaldet går til den rigtige URL med den rigtige metode og revision", async () => {
    let set: { url: string; init: RequestInit } | null = null;
    const fetchImpl = ((url: string, init: RequestInit) => {
      set = { url, init };
      return Promise.resolve(new Response("", { status: 202 }));
    }) as unknown as typeof fetch;
    await afmeld(null, NOEGLE, { email: "a@b.dk", kilde: "bagud" }, { fetchImpl, nuDato: NU });
    expect(set).not.toBeNull();
    expect(set!.url).toBe("https://a.klaviyo.com/api/profile-subscription-bulk-delete-jobs/");
    expect(set!.init.method).toBe("POST");
    const h = set!.init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Klaviyo-API-Key ${NOEGLE}`);
    expect(h.revision).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("uden nøgle: intet kald, men EN RÆKKE — og grunden nævner den rigtige secret", async () => {
    const h = husker();
    let kaldt = false;
    const fetchImpl = (() => { kaldt = true; return Promise.resolve(new Response("", { status: 202 })); }) as unknown as typeof fetch;
    const r = await afmeld(h, null, { email: "a@b.dk", kilde: "webhook" }, { fetchImpl, nuDato: NU });
    expect(kaldt).toBe(false);
    expect(r.sendt).toBe(false);
    expect(r.spor.udfald).toBe("ingen_noegle");
    expect(r.spor.grund).toContain("KLAVIYO_AFMELD_KEY");
    expect(r.spor.grund).not.toContain("KLAVIYO_API_KEY");
    expect(h.raekker).toHaveLength(1);
  });

  it("en offentlig nøgle afvises som «ingen_noegle»", async () => {
    const r = await afmeld(null, "abc123", { email: "a@b.dk", kilde: "webhook" }, { fetchImpl: svarer(202), nuDato: NU });
    expect(r.spor.udfald).toBe("ingen_noegle");
  });

  it("uden brugbar mail: intet kald, men en række med «ingen_mail»", async () => {
    const h = husker();
    const r = await afmeld(h, NOEGLE, { email: "ikke-en-mail", kilde: "import" }, { fetchImpl: svarer(202), nuDato: NU });
    expect(r.sendt).toBe(false);
    expect(r.spor.udfald).toBe("ingen_mail");
    expect(h.raekker).toHaveLength(1);
    expect(h.raekker[0]).toMatchObject({ udfald: "ingen_mail" });
  });

  it("401 er noegle_afvist, 429 er loft, 400 er ugyldig — og hver skriver sin række", async () => {
    for (const [status, udfald] of [[401, "noegle_afvist"], [429, "loft"], [400, "ugyldig"], [500, "fejl"]] as const) {
      const h = husker();
      const r = await afmeld(h, NOEGLE, { email: "a@b.dk", kilde: "webhook" }, { fetchImpl: svarer(status, "nej"), nuDato: NU });
      expect(r.sendt).toBe(false);
      expect(r.spor.udfald).toBe(udfald);
      expect(h.raekker[0]).toMatchObject({ udfald, status });
    }
  });

  it("KASTER ALDRIG, heller ikke når sporet fejler", async () => {
    const vaeltende = { from: () => ({ insert: () => Promise.reject(new Error("basen er væk")) }) };
    const r = await afmeld(vaeltende, NOEGLE, { email: "a@b.dk", kilde: "webhook" }, { fetchImpl: svarer(202), nuDato: NU });
    expect(r.sendt).toBe(true);
  });

  it("hvert udfald har en forklaring i AFMELD_AARSAG", () => {
    for (const u of AFMELD_UDFALD) {
      if (u === "ok") continue;
      expect(AFMELD_AARSAG[u], u).toBeTruthy();
    }
    expect(AFMELD_AARSAG.noegle_afvist).toContain("subscriptions:write");
  });
});

describe("klaviyoAfmelding — vaelgGenafmeldinger", () => {
  const r = (email: string, udfald: string, minutterSiden: number): AfmeldSporRaekke => ({
    email, udfald, forsoegt_at: new Date(NU.getTime() - minutterSiden * 60_000).toISOString(),
  });

  it("en mail med en ok-række er færdig", () => {
    const v = vaelgGenafmeldinger(["a@b.dk"], [r("a@b.dk", "fejl", 60), r("a@b.dk", "ok", 30)], NU);
    expect(v.afmeldt).toEqual(["a@b.dk"]);
    expect(v.proev).toEqual([]);
  });

  it("en mail uden ok-række og med et gammelt forsøg prøves igen", () => {
    const v = vaelgGenafmeldinger(["a@b.dk"], [r("a@b.dk", "timeout", 60)], NU);
    expect(v.proev).toEqual(["a@b.dk"]);
  });

  it("et forsøg for nylig venter — afstanden er fem minutter", () => {
    expect(AFMELD_AFSTAND_MIN).toBe(5);
    expect(vaelgGenafmeldinger(["a@b.dk"], [r("a@b.dk", "fejl", 4)], NU).venter).toEqual(["a@b.dk"]);
    expect(vaelgGenafmeldinger(["a@b.dk"], [r("a@b.dk", "fejl", 6)], NU).proev).toEqual(["a@b.dk"]);
  });

  it("en mail uden nogen række prøves — det er bagud-fejets tilfælde", () => {
    expect(vaelgGenafmeldinger(["ny@b.dk"], [], NU).proev).toEqual(["ny@b.dk"]);
  });

  it("INGEN TRAPPE, INGEN OPGIVELSE: ti fejlede forsøg giver stadig et nyt", () => {
    // Modsat klaviyoGensend, der opgiver efter seks. En afmelding taber ikke sin værdi.
    const mange = Array.from({ length: 10 }, (_, i) => r("a@b.dk", "fejl", 60 + i * 10));
    expect(vaelgGenafmeldinger(["a@b.dk"], mange, NU).proev).toEqual(["a@b.dk"]);
  });

  it("INTET VINDUE: et forsøg for et år siden prøves igen", () => {
    expect(vaelgGenafmeldinger(["a@b.dk"], [r("a@b.dk", "fejl", 60 * 24 * 365)], NU).proev).toEqual(["a@b.dk"]);
  });

  it("dubletter og kapitalisering foldes til én mail", () => {
    const v = vaelgGenafmeldinger(["A@B.dk", "a@b.dk", " a@b.dk "], [], NU);
    expect(v.proev).toEqual(["a@b.dk"]);
  });

  it("tomme mails springes over", () => {
    expect(vaelgGenafmeldinger(["", "   "], [], NU).proev).toEqual([]);
  });

  it("listerne er sorterede, så to kørsler kan sammenlignes", () => {
    const v = vaelgGenafmeldinger(["c@b.dk", "a@b.dk", "b@b.dk"], [], NU);
    expect(v.proev).toEqual(["a@b.dk", "b@b.dk", "c@b.dk"]);
  });
});
