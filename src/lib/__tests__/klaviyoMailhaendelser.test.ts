import { describe, expect, it } from "vitest";
import {
  laesHaendelse, erFlowHaendelse, METRIK, ARTER,
} from "../../../supabase/functions/_shared/klaviyoMailhaendelser";
import { hentArt, startAfIDag, SIDESTOERRELSE } from "../../../supabase/functions/_shared/klaviyoHentning";

/**
 * FIXTURERNE ER RIGTIGE RÆKKER, hentet fra kontoen 19/9-2026. Jeg har kun
 * anonymiseret mailadresserne. En fixture, jeg selv har fundet på, beviser ikke,
 * at oversættelsen forstår Klaviyos faktiske form.
 */

const MODTAGET = {
  type: "event", id: "7tbvSF5xbnK",
  attributes: {
    timestamp: 1789850274,
    datetime: "2026-09-19T20:37:54+00:00",
    event_properties: {
      Subject: "Du har en plads — her er hvad der sker nu",
      $message: "TZWDfu", $flow: "WFzxH9",
      "Campaign Name": "Webinar — Tilmeldingsbekræftelse: Du har en plads",
      "Recipient Email Address": "Test.Person@Gmail.com",
      $originating_email: "Test.Person@Gmail.com",
      $internal: { "Transmission ID": "01M2XP7FY7FV3CW6TA32JN1XG2", "Handoff Time": 1789850272 },
      $event_id: "TZWDfu:01M2XP7FY7FV3CW6TA32JN1XG2",
    },
  },
  relationships: { profile: { data: { type: "profile", id: "01M2XNH4JM9JQ5N0N01D0QDNVM" } } },
};

const AABNET_MASKINE = {
  type: "event", id: "7tbj4Am5qmi",
  attributes: {
    datetime: "2026-09-19T20:05:14+00:00",
    event_properties: {
      "Recipient Email Address": "test@outlook.dk",
      machine_open: false, $message: "XTwpRQ", $flow: "UiECQS",
      "Campaign Name": "Webinar - Email #1", Subject: "Hvad vi skal bruge timen på",
      $internal: { "Transmission ID": "01M2W7WEZ38ZXBM54HESMWT2WS" },
      $event_id: "XTwpRQ:01M2W7WEZ38ZXBM54HESMWT2WS:1789848314",
    },
  },
};

const KLIKKET_BOT = {
  type: "event", id: "7t98d4LXHvM",
  attributes: {
    datetime: "2026-09-19T13:39:45+00:00",
    event_properties: {
      "Recipient Email Address": "test@centor.dk",
      "Bot Click": true, URL: "https://www.topix.dk/",
      $message: "V72r6j", $flow: "WFzxH9", "Campaign Name": "Tilmeldt webinar - Email #1",
      $internal: { "Transmission ID": "01M2WN6Y6NAC86YFHBJVTC33V2" },
    },
  },
};

describe("laesHaendelse — mod rigtige rækker fra kontoen", () => {
  it("modtaget: mail bliver små bogstaver, og forsendelsen er Transmission ID", () => {
    const r = laesHaendelse("modtaget", MODTAGET)!;
    expect(r.email).toBe("test.person@gmail.com");
    expect(r.flow_id).toBe("WFzxH9");
    expect(r.besked_id).toBe("TZWDfu");
    expect(r.forsendelse_id).toBe("01M2XP7FY7FV3CW6TA32JN1XG2");
    expect(r.klaviyo_profil_id).toBe("01M2XNH4JM9JQ5N0N01D0QDNVM");
    expect(r.sket_ved).toBe("2026-09-19T20:37:54.000Z");
    expect(r.maskine).toBe(false);
    expect(r.bot).toBe(false);
  });

  it("$event_id DUR IKKE som nøgle — FORMEN er forskellig pr. art", () => {
    // Det er hele grunden til, at forsendelse_id findes. Målt 19/9:
    //   modtaget  «<besked>:<forsendelse>»            → to led
    //   åbnet     «<besked>:<forsendelse>:<tid>»      → tre led
    // En åbning kan derfor ALDRIG matche sin egen modtagelse på $event_id,
    // og det ville se ud, som om ingen åbnede.
    const led = (s: string) => s.split(":").length;
    expect(led(MODTAGET.attributes.event_properties.$event_id)).toBe(2);
    expect(led(AABNET_MASKINE.attributes.event_properties.$event_id)).toBe(3);

    // Transmission ID er derimod samme form på begge arter — og det er den,
    // vi gemmer. To arter fra SAMME udsendelse får samme forsendelse_id.
    const sammeUdsendelse = {
      id: "prøve-aabning",
      attributes: {
        datetime: "2026-09-19T20:40:00+00:00",
        event_properties: {
          "Recipient Email Address": "Test.Person@Gmail.com",
          $message: "TZWDfu", $flow: "WFzxH9",
          $internal: { "Transmission ID": "01M2XP7FY7FV3CW6TA32JN1XG2" },
          $event_id: "TZWDfu:01M2XP7FY7FV3CW6TA32JN1XG2:1789850400",
        },
      },
    };
    expect(laesHaendelse("aabnet", sammeUdsendelse)!.forsendelse_id)
      .toBe(laesHaendelse("modtaget", MODTAGET)!.forsendelse_id);
    // ... mens $event_id ikke gør.
    expect(sammeUdsendelse.attributes.event_properties.$event_id)
      .not.toBe(MODTAGET.attributes.event_properties.$event_id);
  });

  it("klik bærer URL og Bot Click", () => {
    const r = laesHaendelse("klikket", KLIKKET_BOT)!;
    expect(r.bot).toBe(true);
    expect(r.url).toBe("https://www.topix.dk/");
  });

  it("«1.0» fra aggregaterne forstås også som sandt", () => {
    const med = { ...KLIKKET_BOT, attributes: { ...KLIKKET_BOT.attributes, event_properties: { ...KLIKKET_BOT.attributes.event_properties, "Bot Click": "1.0" } } };
    expect(laesHaendelse("klikket", med)!.bot).toBe(true);
  });

  it("uden mail eller uden tid: null, ALDRIG en halv række med gættede felter", () => {
    const udenMail = { id: "x", attributes: { datetime: "2026-09-19T00:00:00Z", event_properties: {} } };
    const udenTid = { id: "x", attributes: { event_properties: { "Recipient Email Address": "a@b.dk" } } };
    expect(laesHaendelse("modtaget", udenMail)).toBeNull();
    expect(laesHaendelse("modtaget", udenTid)).toBeNull();
    expect(laesHaendelse("modtaget", null)).toBeNull();
    expect(laesHaendelse("modtaget", { attributes: {} })).toBeNull();
  });

  it("kampagnehændelser har tom $flow og hører ikke til os", () => {
    const kampagne = laesHaendelse("modtaget", {
      id: "k1", attributes: { datetime: "2026-09-19T00:00:00Z", event_properties: { "Recipient Email Address": "a@b.dk" } },
    })!;
    expect(kampagne.flow_id).toBeNull();
    expect(erFlowHaendelse(kampagne)).toBe(false);
    expect(erFlowHaendelse(laesHaendelse("modtaget", MODTAGET)!)).toBe(true);
  });

  it("et UKENDT flow gemmes også — der er ingen liste, der skal huskes (20/9)", () => {
    // Tirsdag kommer to nye flows. Med en hardkodet liste var de blevet hentet
    // tavst ikke. Reglen er formen: har hændelsen $flow, er den en flowmail.
    const nyt = { ...MODTAGET, attributes: { ...MODTAGET.attributes, event_properties: { ...MODTAGET.attributes.event_properties, $flow: "HELT-NYT-FLOW" } } };
    expect(erFlowHaendelse(laesHaendelse("modtaget", nyt)!)).toBe(true);
  });

  it("metrik-id'erne er dem, der faktisk findes i kontoen (målt 19/9)", () => {
    expect(METRIK).toEqual({ modtaget: "XxZFZq", aabnet: "RxGYRk", klikket: "Tk8SmP" });
    expect(ARTER).toEqual(["modtaget", "aabnet", "klikket"]);
  });
});

// ── Hentningen ──────────────────────────────────────────────────────────────

const side = (data: unknown[], next: string | null) =>
  new Response(JSON.stringify({ data, links: { next } }), { status: 200, headers: { "Content-Type": "application/json" } });

describe("hentArt — sideløbning, vandmærke og stop", () => {
  it("følger cursoren gennem flere sider og samler rækkerne", async () => {
    const kaldt: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      kaldt.push(u);
      if (!u.includes("page%5Bcursor%5D")) {
        return side([MODTAGET], "https://a.klaviyo.com/api/events?x=1&page%5Bcursor%5D=NÆSTE");
      }
      return side([{ ...MODTAGET, id: "side2" }], null);
    }) as unknown as typeof fetch;

    const r = await hentArt({ noegle: "pk_prøve", art: "modtaget", fra: "2026-09-01T00:00:00Z", fetchImpl });
    expect(r.sider).toBe(2);
    expect(r.raekker).toHaveLength(2);
    expect(r.faerdig).toBe(true);
    expect(r.grund).toBe("faerdig");
    expect(kaldt[0]).toContain(`page%5Bsize%5D=${SIDESTOERRELSE}`);
    expect(kaldt[0]).toContain("sort=datetime");
  });

  it("henter med greater-or-equal, ikke greater-than — et hul er værre end en dublet", async () => {
    let set = "";
    const fetchImpl = (async (url: string | URL) => { set = decodeURIComponent(String(url)); return side([], null); }) as unknown as typeof fetch;
    await hentArt({ noegle: "pk_prøve", art: "aabnet", fra: "2026-09-01T00:00:00Z", fetchImpl });
    expect(set).toContain("greater-or-equal(datetime,2026-09-01T00:00:00Z)");
    expect(set).not.toContain("greater-than(datetime");
    expect(set).toContain(`equals(metric_id,"${METRIK.aabnet}")`);
  });

  it("vandmærket følger ALT vi så — også det, vi sorterede fra", async () => {
    // Ellers ville hver kørsel hente kampagnehændelserne forfra i det uendelige.
    const kampagne = { id: "k9", attributes: { datetime: "2026-09-19T23:00:00+00:00", event_properties: { "Recipient Email Address": "a@b.dk" } } };
    const fetchImpl = (async () => side([MODTAGET, kampagne], null)) as unknown as typeof fetch;
    const r = await hentArt({ noegle: "pk_prøve", art: "modtaget", fra: "2026-09-01T00:00:00Z", fetchImpl });
    expect(r.raekker).toHaveLength(1);
    expect(r.frasorteret_kampagner).toBe(1);
    expect(r.naaet_til).toBe("2026-09-19T23:00:00.000Z");
  });

  it("uden nøgle siger den pænt fra og henter ingenting", async () => {
    const r = await hentArt({ noegle: null, art: "modtaget", fra: "2026-09-01T00:00:00Z" });
    expect(r.faerdig).toBe(false);
    expect(r.grund).toBe("ingen_noegle");
    expect(r.raekker).toEqual([]);
  });

  it("429 stopper kørslen som «loft» — ikke som «færdig»", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const r = await hentArt({ noegle: "pk_prøve", art: "klikket", fra: "2026-09-01T00:00:00Z", fetchImpl });
    expect(r.grund).toBe("loft");
    expect(r.faerdig).toBe(false);
  });

  it("budgettet stopper en uendelig sideløbning", async () => {
    let n = 0;
    const fetchImpl = (async () => side([MODTAGET], "https://a.klaviyo.com/api/events?page%5Bcursor%5D=EVIG")) as unknown as typeof fetch;
    const nu = () => { n += 1; return n * 10_000; };
    const r = await hentArt({ noegle: "pk_prøve", art: "modtaget", fra: "2026-09-01T00:00:00Z", fetchImpl, nu, budgetMs: 25_000 });
    expect(r.faerdig).toBe(false);
    expect(r.grund).toBe("budget");
  });

  it("ubrugelige rækker tælles frem for at blive tavst væk", async () => {
    const fetchImpl = (async () => side([{ id: "tom", attributes: {} }, MODTAGET], null)) as unknown as typeof fetch;
    const r = await hentArt({ noegle: "pk_prøve", art: "modtaget", fra: "2026-09-01T00:00:00Z", fetchImpl });
    expect(r.ubrugelige).toBe(1);
    expect(r.raekker).toHaveLength(1);
  });
});

describe("startAfIDag — «i dag» er dansk midnat, ikke UTC-midnat", () => {
  it("sommertid: dansk midnat er 22:00 UTC dagen før", () => {
    expect(startAfIDag(new Date("2026-09-22T09:30:00.000Z"))).toBe("2026-09-21T22:00:00.000Z");
  });
  it("vintertid: dansk midnat er 23:00 UTC dagen før", () => {
    expect(startAfIDag(new Date("2026-12-10T09:30:00.000Z"))).toBe("2026-12-09T23:00:00.000Z");
  });
  it("kl. 00:30 dansk tid er stadig I DAG — ikke i går (UTC-fælden)", () => {
    // 22:30 UTC den 21/9 er 00:30 dansk den 22/9. Uden tidszonen ville «i dag»
    // være den 21/9, og en session kl. 01 ville falde i gårsdagen.
    expect(startAfIDag(new Date("2026-09-21T22:30:00.000Z"))).toBe("2026-09-21T22:00:00.000Z");
  });
});
