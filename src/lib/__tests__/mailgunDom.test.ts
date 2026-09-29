import { describe, expect, it } from "vitest";
import {
  doemMailgunSvar,
  GRUND_BESKED_MAKS,
  grundAfSvar,
  mailgunBesked,
  sendMailgun,
  type MailgunBrev,
} from "../../../supabase/functions/_shared/mailgunAfsendelse.ts";

// De tre svar fra 29/9, ordret som de stod i webinar_mails.svar.
const PROBATION = "Your account is on probation and domains are limited to 100 messages / hour";
const MODTAGERLOFT = "recipient limit (26) exceeded";
const KALDLOFT = "request limit (101) exceeded";
const json = (message: string) => JSON.stringify({ message });

const BREV: MailgunBrev = {
  til: "a@example.com",
  fra: "Topix <webinar@webinar.topix.dk>",
  emne: "Emne",
  html: "<p>hej</p>",
  tekst: "hej",
  svarTil: "kontakt@topix.dk",
  afmeldUrl: "https://app.theboardroom.dk/afmeld?t=x",
};
const svarMed = (status: number, krop: string) =>
  (() => Promise.resolve(new Response(krop, { status }))) as unknown as typeof fetch;

describe("doemMailgunSvar — mærkaten følger svarteksten, ikke kun statuskoden", () => {
  it("de tre svar fra 29/9 er alle et loft — også 403 og 420", () => {
    expect(doemMailgunSvar(403, json(PROBATION))).toBe("loft");
    expect(doemMailgunSvar(420, json(MODTAGERLOFT))).toBe("loft");
    expect(doemMailgunSvar(429, json(KALDLOFT))).toBe("loft");
  });

  it("loft-teksten læses også, når svaret ikke er JSON, og uden hensyn til store bogstaver", () => {
    expect(doemMailgunSvar(403, PROBATION.toUpperCase())).toBe("loft");
    expect(doemMailgunSvar(420, MODTAGERLOFT)).toBe("loft");
    expect(doemMailgunSvar(429, KALDLOFT.toUpperCase())).toBe("loft");
    // Hvert mønster for sig: probation-svarets anden halvdel bærer loftet alene.
    expect(doemMailgunSvar(403, "Domains are LIMITED TO 100 messages / hour")).toBe("loft");
  });

  it("et loft-lignende ord, der ikke er MÅLT, påstår intet", () => {
    expect(doemMailgunSvar(400, json("message size limit exceeded"))).toBe("ugyldig");
    expect(doemMailgunSvar(413, json("message size limit exceeded"))).toBe("fejl");
    expect(doemMailgunSvar(503, "Too Fast")).toBe("fejl");
    expect(doemMailgunSvar(403, "Rate-limited")).toBe("noegle_afvist");
  });

  it("401 → noegle_afvist; 403 uden loft-tekst → noegle_afvist", () => {
    expect(doemMailgunSvar(401, "Forbidden")).toBe("noegle_afvist");
    expect(doemMailgunSvar(403, json("Forbidden"))).toBe("noegle_afvist");
  });

  it("400 og 422 → ugyldig", () => {
    expect(doemMailgunSvar(400, json("'to' parameter is not a valid address. please check documentation"))).toBe("ugyldig");
    expect(doemMailgunSvar(422, "{}")).toBe("ugyldig");
  });

  it("alle andre koder påstår ingen årsag → fejl; 2xx → ok", () => {
    expect(doemMailgunSvar(420, json("something else"))).toBe("fejl");
    expect(doemMailgunSvar(404, json("Domain not found"))).toBe("fejl");
    expect(doemMailgunSvar(500, "Internal Server Error")).toBe("fejl");
    expect(doemMailgunSvar(200, json("Queued. Thank you."))).toBe("ok");
  });

  it("2xx er ok, selv med en MÅLT loft-tekst — 2xx-reglen går foran tekstreglen", () => {
    expect(doemMailgunSvar(200, json(PROBATION))).toBe("ok");
    expect(doemMailgunSvar(200, KALDLOFT)).toBe("ok");
  });
});

describe("grund — statuskoden og Mailguns egne ord", () => {
  it("bærer Mailguns message, når svaret er JSON", () => {
    expect(grundAfSvar(403, json(PROBATION))).toBe(`Mailgun svarede 403: ${PROBATION}`);
    expect(mailgunBesked(JSON.stringify({ message: KALDLOFT, id: "x" }))).toBe(KALDLOFT);
  });

  it("er højst «Mailgun svarede NNN: » + 200 tegn", () => {
    const lang = "x".repeat(5_000);
    const grund = grundAfSvar(500, json(lang));
    expect(grund.length).toBe("Mailgun svarede 500: ".length + GRUND_BESKED_MAKS);
    expect(GRUND_BESKED_MAKS).toBe(200);
    expect(grund.startsWith("Mailgun svarede 500: xxx")).toBe(true);
  });

  it("et svar, der ikke er JSON, giver teksten", () => {
    expect(grundAfSvar(502, "<html>Bad Gateway</html>")).toBe("Mailgun svarede 502: <html>Bad Gateway</html>");
  });

  it("JSON uden message-felt giver teksten, som den er", () => {
    expect(grundAfSvar(500, '{"error":"x"}')).toBe('Mailgun svarede 500: {"error":"x"}');
  });

  it("et tomt svar giver kun statuskoden", () => {
    expect(grundAfSvar(500, "")).toBe("Mailgun svarede 500");
  });
});

describe("sendMailgun går gennem dommen — mærkat, grund og svar i sporet", () => {
  it("403 probation → loft, grund med Mailguns ord, svar uændret", async () => {
    const krop = json(PROBATION);
    const spor = await sendMailgun("n", BREV, { fetcher: svarMed(403, krop) });
    expect(spor.udfald).toBe("loft");
    expect(spor.status).toBe(403);
    expect(spor.grund).toBe(`Mailgun svarede 403: ${PROBATION}`);
    expect(spor.svar).toBe(krop);
  });

  it("420 modtagerloft → loft, ikke ugyldig", async () => {
    const spor = await sendMailgun("n", BREV, { fetcher: svarMed(420, json(MODTAGERLOFT)) });
    expect(spor.udfald).toBe("loft");
    expect(spor.grund).toBe(`Mailgun svarede 420: ${MODTAGERLOFT}`);
  });

  it("200 → ok uden grund", async () => {
    const spor = await sendMailgun("n", BREV, { fetcher: svarMed(200, JSON.stringify({ id: "<a@b>", message: "Queued. Thank you." })) });
    expect(spor.udfald).toBe("ok");
    expect(spor.grund).toBeNull();
    expect(spor.mailgun_id).toBe("<a@b>");
  });
});
