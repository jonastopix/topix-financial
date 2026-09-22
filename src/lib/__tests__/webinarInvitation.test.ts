import { describe, expect, it } from "vitest";
import {
  base64Linjer, bygMime, encodetAfsender, encodetOrd, hentInvitation,
  INVITATION_FILNAVN, INVITATION_TYPE,
} from "../../../supabase/functions/_shared/mimeInvitation.ts";
import { bygMimeFormData, mimeUrl, sendMailgunMime } from "../../../supabase/functions/_shared/mailgunAfsendelse.ts";

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "METHOD:REQUEST", "BEGIN:VEVENT",
  "UID:ewebinar-12345@ewebinar.com", "DTSTAMP:20260922T160000Z", "DTSTART:20261013T090000Z",
  "SUMMARY:Webinar", "ORGANIZER:mailto:morten@topix.dk", "ATTENDEE;RSVP=TRUE:mailto:a@x.dk",
  "END:VEVENT", "END:VCALENDAR",
].join("\r\n");
const svarMed = (krop: string, status = 200) => (() => Promise.resolve(new Response(krop, { status }))) as unknown as typeof fetch;

describe("hentInvitation — eWebinars egen .ics, fail-soft", () => {
  it("henter filen, når den ER en iCalendar", async () => {
    const i = await hentInvitation("https://api.ewebinar.com/v1/attendees/12345/ics", { fetcher: svarMed(ICS) });
    expect(i.udfald).toBe("hentet");
    expect(i.ics).toContain("METHOD:REQUEST");
  });

  it("FAIL-CLOSED PÅ INDHOLDET: en HTML-fejlside med status 200 vedhæftes aldrig", async () => {
    const i = await hentInvitation("https://api.ewebinar.com/v1/attendees/1/ics", { fetcher: svarMed("<html>Not found</html>") });
    expect(i.udfald).toBe("ikke_ics");
    expect(i.ics).toBeNull();
  });

  it("uden link, på http, og ved en fejlstatus siges der fra — uden at kaste", async () => {
    expect((await hentInvitation(null)).udfald).toBe("intet_link");
    expect((await hentInvitation("  ")).udfald).toBe("intet_link");
    expect((await hentInvitation("http://api.ewebinar.com/x")).udfald).toBe("intet_link");
    expect((await hentInvitation("https://x/ics", { fetcher: svarMed("", 404) })).udfald).toBe("fejl");
  });

  it("KASTER ALDRIG — et net, der falder væk, bliver et udfald", async () => {
    const i = await hentInvitation("https://x/ics", { fetcher: (() => Promise.reject(new Error("væk"))) as unknown as typeof fetch });
    expect(i.udfald).toBe("fejl");
    expect(i.grund).toContain("væk");
  });

  it("en fil over loftet vedhæftes ikke", async () => {
    const i = await hentInvitation("https://x/ics", { fetcher: svarMed("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" + "x".repeat(300_000)) });
    expect(i.udfald).toBe("for_stor");
  });
});

describe("bygMime — invitationen INLINE og VEDHÆFTET", () => {
  const BREV = {
    til: "a@x.dk", fra: "Morten Larsen <morten@webinar.topix.dk>",
    emne: "Du har en plads — her er hvad der sker nu", html: "<p>hej</p>", tekst: "hej",
    svarTil: "kontakt@topix.dk", afmeldUrl: "https://p/webinar-afmeld?t=a.b",
    domaene: "webinar.topix.dk", grænse: "G", dato: new Date("2026-09-22T16:00:00Z"), messageId: "<id@webinar.topix.dk>",
  };

  it("typen er ORDRET den, Outlook kræver for at vise Ja/Nej", () => {
    expect(INVITATION_TYPE).toBe("text/calendar; charset=utf-8; method=REQUEST");
  });

  it("kalenderdelen står BEGGE steder: i alternative OG som vedhæftning", () => {
    const m = bygMime({ ...BREV, ics: ICS });
    expect(m).toContain('Content-Type: multipart/mixed; boundary="G"');
    expect(m).toContain('Content-Type: multipart/alternative; boundary="G-alt"');
    expect((m.match(new RegExp(INVITATION_TYPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length).toBe(2);
    expect(m).toContain(`Content-Disposition: attachment; filename="${INVITATION_FILNAVN}"`);
    // Og selve filen — base64, to gange.
    expect((m.match(new RegExp(base64Linjer(ICS).slice(0, 40), "g")) ?? []).length).toBe(2);
  });

  it("de tre kropsdele er der, og headerne bærer afmeldingen", () => {
    const m = bygMime({ ...BREV, ics: ICS });
    expect(m).toContain("Content-Type: text/plain; charset=utf-8");
    expect(m).toContain("Content-Type: text/html; charset=utf-8");
    expect(m).toContain("List-Unsubscribe: <https://p/webinar-afmeld?t=a.b>");
    expect(m).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(m).toContain("Reply-To: kontakt@topix.dk");
    expect(m).toContain("MIME-Version: 1.0");
  });

  it("UDEN ics: ingen mixed, ingen tom vedhæftning — kun alternative", () => {
    const m = bygMime({ ...BREV, ics: null });
    expect(m).not.toContain("multipart/mixed");
    expect(m).not.toContain("attachment");
    expect(m).not.toContain("text/calendar");
    expect(m).toContain('Content-Type: multipart/alternative; boundary="G-alt"');
  });

  it("æ, ø og å i emnet encodes (RFC 2047) — ellers står de som volapyk", () => {
    expect(encodetOrd("Du har en plads")).toBe("Du har en plads");
    expect(encodetOrd("Vi ses i morgen — tag én beslutning med")).toMatch(/^=\?UTF-8\?B\?/);
    expect(encodetAfsender("Morten Larsen <m@x.dk>")).toBe("Morten Larsen <m@x.dk>");
    expect(encodetAfsender("Søren Å <s@x.dk>")).toMatch(/^=\?UTF-8\?B\?.*\?= <s@x\.dk>$/);
  });

  it("base64 brydes i linjer à 76 tegn (RFC 2045)", () => {
    for (const l of base64Linjer("x".repeat(500)).split("\r\n")) expect(l.length).toBeLessThanOrEqual(76);
  });

  it("alle linjeskift er CRLF — en bar \\n brækker MIME'en hos nogle klienter", () => {
    const m = bygMime({ ...BREV, ics: ICS });
    expect(m.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("sendMailgunMime — det ANDET endepunkt", () => {
  it("URL'en er /messages.mime i EU", () => {
    expect(mimeUrl()).toBe("https://api.eu.mailgun.net/v3/webinar.topix.dk/messages.mime");
  });

  it("kroppen bærer `to` VED SIDEN AF MIME'en, og sporingen er slået fra", () => {
    const fd = bygMimeFormData("a@x.dk", "MIME");
    expect(fd.get("to")).toBe("a@x.dk");
    expect(fd.get("message")).toBeInstanceOf(Blob);
    expect(fd.get("o:tracking")).toBe("no");
  });

  it("samme udfald som den almindelige vej — ét sted, én dom", async () => {
    for (const [status, ventet] of [[200, "ok"], [401, "noegle_afvist"], [429, "loft"], [400, "ugyldig"], [500, "fejl"]] as const) {
      const spor = await sendMailgunMime("n", "a@x.dk", "MIME", {
        fetcher: (() => Promise.resolve(new Response("{}", { status }))) as unknown as typeof fetch,
      });
      expect(spor.udfald, String(status)).toBe(ventet);
    }
  });

  it("uden nøgle, og til en ikke-mail, forsøges intet", async () => {
    expect((await sendMailgunMime(null, "a@x.dk", "M", { fetcher: () => { throw new Error("nej"); } })).udfald).toBe("ingen_noegle");
    expect((await sendMailgunMime("n", "ikke en mail", "M", { fetcher: () => { throw new Error("nej"); } })).udfald).toBe("ugyldig");
  });
});
