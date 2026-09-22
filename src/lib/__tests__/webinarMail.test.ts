import { describe, expect, it } from "vitest";
import { bygWebinarMail, EMNER, AFSENDER, SVAR_TIL } from "../../../supabase/functions/_shared/webinarMailTekster.ts";
import { bygFormData, beskedUrl, MAILGUN_EU_BASE, sendMailgun } from "../../../supabase/functions/_shared/mailgunAfsendelse.ts";
import { byggAfmeldToken, laesAfmeldToken, afmeldUrl, TOKEN_FORM } from "../../../supabase/functions/_shared/webinarAfmeldToken.ts";
import { ARTER, type MailArt } from "@/lib/webinar/mailDom";

const SESSION = "2026-10-13T09:00:00.000Z";
const AFMELD = "https://p.supabase.co/functions/v1/webinar-afmeld?t=abc.def";
const ARGS = {
  sessionTid: SESSION,
  webinarTitel: "Webinar med Morten Larsen",
  joinLink: "https://topix.ewebinar.com/webinar/x/join/abc",
  kalenderLink: "https://api.ewebinar.com/v1/attendees/12345/ics",
  afmeldUrl: AFMELD,
};

describe("bygWebinarMail — alle fem mails er hele", () => {
  it("hver art har emne, HTML og tekst — og tidspunktet står i dem alle", () => {
    for (const art of ARTER) {
      const m = bygWebinarMail({ ...ARGS, art });
      expect(m.subject, art).toBe(EMNER[art]);
      expect(m.html.startsWith("<!DOCTYPE html>"), art).toBe(true);
      // «tirsdag 13. oktober kl. 11.00» — dansk tid, fra klaviyoDato.webinarTekst.
      expect(m.html, art).toContain("tirsdag 13. oktober kl. 11.00");
      expect(m.text, art).toContain("tirsdag 13. oktober kl. 11.00");
      expect(m.text.length, art).toBeGreaterThan(100);
    }
  });

  it("KNAPPEN: join-linket står som knap i HTML og som linje i teksten", () => {
    for (const art of ARTER) {
      const m = bygWebinarMail({ ...ARGS, art });
      expect(m.html, art).toContain(`href="${ARGS.joinLink}"`);
      expect(m.html, art).toContain("Gå til webinaret");
      expect(m.text, art).toContain(`Gå til webinaret: ${ARGS.joinLink}`);
    }
  });

  it("KALENDEREN: Google, Apple (eWebinars .ics) og Outlook — alle tre", () => {
    const m = bygWebinarMail({ ...ARGS, art: "en_dag" });
    expect(m.html).toContain("calendar.google.com/calendar/render");
    expect(m.html).toContain(ARGS.kalenderLink);
    expect(m.html).toContain("outlook.office.com/calendar/0/deeplink/compose");
    expect(m.html).toContain("Læg i kalender:");
    expect(m.text).toContain("Læg i kalender — Google:");
    expect(m.text).toContain("Læg i kalender — Apple/Outlook:");
  });

  it("BUNDLINJEN: hvorfor de får mailen, og et afmeldingslink — i begge udgaver", () => {
    for (const art of ARTER) {
      const m = bygWebinarMail({ ...ARGS, art });
      expect(m.html, art).toContain("fordi du har tilmeldt dig webinaret");
      expect(m.html, art).toContain(`href="${AFMELD}"`);
      expect(m.text, art).toContain(`Afmeld dig her: ${AFMELD}`);
    }
  });

  it("INGEN KLAVIYO-TAGS er sluppet med", () => {
    for (const art of ARTER) {
      const m = bygWebinarMail({ ...ARGS, art });
      expect(m.html, art).not.toContain("{%");
      expect(m.html, art).not.toContain("{{");
      expect(m.text, art).not.toContain("{%");
    }
  });

  it("uden join_link tegnes ingen knap — men mailen er stadig hel", () => {
    const m = bygWebinarMail({ ...ARGS, art: "en_time", joinLink: null });
    expect(m.html).not.toContain("Gå til webinaret");
    expect(m.text).not.toContain("Gå til webinaret:");
    expect(m.html).toContain("tirsdag 13. oktober kl. 11.00");
    // Google-linket er der stadig — det bygges af tiden, ikke af join-linket.
    expect(m.html).toContain("calendar.google.com");
  });

  it("uden kalender_link forsvinder KUN Apple-linket", () => {
    const m = bygWebinarMail({ ...ARGS, art: "dagen", kalenderLink: null });
    expect(m.html).not.toContain("api.ewebinar.com");
    expect(m.html).toContain("calendar.google.com");
    expect(m.html).toContain("outlook.office.com");
  });

  it("afsenderen og svaradressen er Jonas' — ét sted", () => {
    expect(AFSENDER).toBe("Morten Larsen <morten@webinar.topix.dk>");
    expect(SVAR_TIL).toBe("kontakt@topix.dk");
  });
});

describe("bekraeftelse — teksten siger det, der faktisk er sket", () => {
  it("sætningen om eWebinars kalenderinvitation er VÆK", () => {
    const m = bygWebinarMail({ ...ARGS, art: "bekraeftelse" });
    // Den var sand, da eWebinar sendte bekræftelsen. eWebinars bekræftelse
    // slukkes, når platformen overtager — så sætningen ville blive en løgn.
    expect(m.html).not.toContain("Du har fået en kalenderinvitation");
    expect(m.text).not.toContain("DU HAR FÅET EN KALENDERINVITATION");
  });

  it("i stedet står der, at invitationen er VEDHÆFTET — og tidspunktet med", () => {
    const m = bygWebinarMail({ ...ARGS, art: "bekraeftelse" });
    expect(m.html).toContain("vedhæftet denne mail");
    expect(m.text).toContain("vedhæftet denne mail");
    expect(m.html).toContain("tirsdag 13. oktober kl. 11.00");
  });

  it("emnet er Mortens eget fra WFzxH9/XwLpXq", () => {
    expect(EMNER.bekraeftelse).toBe("Du har en plads — her er hvad der sker nu");
  });

  it("resten af Mortens tekst står uændret", () => {
    const m = bygWebinarMail({ ...ARGS, art: "bekraeftelse" });
    expect(m.html).toContain("Tak, fordi du meldte dig til. Din plads er reserveret");
    expect(m.html).toContain("Sæt den af, sæt telefonen på lydløs");
  });
});

describe("mailgunAfsendelse — formen, uden at røre netværket", () => {
  const BREV = { til: "a@x.dk", fra: AFSENDER, emne: "Emne", html: "<p>h</p>", tekst: "t", svarTil: SVAR_TIL, afmeldUrl: AFMELD };

  it("EU-endepunktet, aldrig api.mailgun.net", () => {
    expect(MAILGUN_EU_BASE).toBe("https://api.eu.mailgun.net/v3");
    expect(beskedUrl()).toBe("https://api.eu.mailgun.net/v3/webinar.topix.dk/messages");
    expect(beskedUrl()).not.toContain("//api.mailgun.net");
  });

  it("felterne er Mailguns egne, og sporingen er SLÅET FRA", () => {
    const fd = bygFormData(BREV);
    expect(fd.get("from")).toBe(AFSENDER);
    expect(fd.get("to")).toBe("a@x.dk");
    expect(fd.get("subject")).toBe("Emne");
    expect(fd.get("text")).toBe("t");
    expect(fd.get("html")).toBe("<p>h</p>");
    expect(fd.get("o:tracking")).toBe("no");
    expect(fd.get("o:tracking-clicks")).toBe("no");
    expect(fd.get("o:tracking-opens")).toBe("no");
    expect(fd.get("h:Reply-To")).toBe(SVAR_TIL);
    expect(fd.get("h:List-Unsubscribe")).toBe(`<${AFMELD}>`);
    expect(fd.get("h:List-Unsubscribe-Post")).toBe("List-Unsubscribe=One-Click");
  });

  it("uden nøgle sendes intet — og det er ikke en fejl, det er et udfald", async () => {
    const spor = await sendMailgun(null, BREV, { fetcher: () => { throw new Error("måtte ikke kaldes"); } });
    expect(spor.udfald).toBe("ingen_noegle");
    expect(spor.grund).toContain("MAILGUN_SENDING_KEY");
  });

  it("udfaldene følger statuskoden, og nøglen står ALDRIG i sporet", async () => {
    const svar = (status: number, krop = "{}") => () => Promise.resolve(new Response(krop, { status }));
    for (const [status, ventet] of [[200, "ok"], [401, "noegle_afvist"], [403, "noegle_afvist"], [429, "loft"], [400, "ugyldig"], [500, "fejl"]] as const) {
      const spor = await sendMailgun("hemmelig-noegle", BREV, { fetcher: svar(status) as unknown as typeof fetch });
      expect(spor.udfald, String(status)).toBe(ventet);
      expect(JSON.stringify(spor), String(status)).not.toContain("hemmelig-noegle");
    }
  });

  it("Mailguns id læses ud af svaret ved 200", async () => {
    const spor = await sendMailgun("n", BREV, {
      fetcher: (() => Promise.resolve(new Response(JSON.stringify({ id: "<abc@webinar.topix.dk>" }), { status: 200 }))) as unknown as typeof fetch,
    });
    expect(spor.mailgun_id).toBe("<abc@webinar.topix.dk>");
  });

  it("en modtager uden @ forsøges aldrig", async () => {
    const spor = await sendMailgun("n", { ...BREV, til: "ikke en mail" }, { fetcher: () => { throw new Error("måtte ikke kaldes"); } });
    expect(spor.udfald).toBe("ugyldig");
  });

  it("KASTER ALDRIG — et kald, der vælter, bliver et udfald", async () => {
    const spor = await sendMailgun("n", BREV, { fetcher: (() => Promise.reject(new Error("netværket væk"))) as unknown as typeof fetch });
    expect(spor.udfald).toBe("fejl");
    expect(spor.grund).toContain("netværket væk");
  });
});

describe("afmeldingstokenet", () => {
  const S = "en-hemmelighed";

  it("frem og tilbage — mailen kommer helskindet igennem", async () => {
    const t = await byggAfmeldToken(S, "Jonas@Topix.dk");
    expect(TOKEN_FORM.test(t)).toBe(true);
    const dom = await laesAfmeldToken(S, t);
    expect(dom).toEqual({ ok: true, email: "jonas@topix.dk" });
  });

  it("et token fra en ANDEN hemmelighed afvises", async () => {
    const t = await byggAfmeldToken(S, "a@x.dk");
    expect(await laesAfmeldToken("en anden", t)).toEqual({ ok: false, grund: "aftryk" });
  });

  it("et pillet token afvises — mailen kan ikke byttes ud", async () => {
    const t = await byggAfmeldToken(S, "a@x.dk");
    const [, aftryk] = t.split(".");
    const forfalsket = `${btoa("offer@x.dk").replace(/=+$/, "")}.${aftryk}`;
    expect((await laesAfmeldToken(S, forfalsket)).ok).toBe(false);
  });

  it("uden hemmelighed, og på en forkert form, siges der fra", async () => {
    expect(await laesAfmeldToken(null, "a.b")).toEqual({ ok: false, grund: "ingen_secret" });
    for (const d of ["", "abc", "a.b.c", null, 42, undefined]) {
      expect((await laesAfmeldToken(S, d)).ok, String(d)).toBe(false);
    }
  });

  it("linket bærer tokenet som ?t=", async () => {
    const t = await byggAfmeldToken(S, "a@x.dk");
    const u = new URL(afmeldUrl("https://p.supabase.co/functions/v1/webinar-afmeld", t));
    expect(u.searchParams.get("t")).toBe(t);
  });

  it("hvert menneske får sit eget token", async () => {
    const a = await byggAfmeldToken(S, "a@x.dk");
    const b = await byggAfmeldToken(S, "b@x.dk");
    expect(a).not.toBe(b);
  });
});
