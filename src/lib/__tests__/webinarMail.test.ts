import { describe, expect, it } from "vitest";
import { bygWebinarMail, EMNER, AFSENDER, SVAR_TIL, invitationsTekst } from "../../../supabase/functions/_shared/webinarMailTekster.ts";
import { bygFormData, beskedUrl, MAILGUN_EU_BASE, sendMailgun } from "../../../supabase/functions/_shared/mailgunAfsendelse.ts";
import { byggAfmeldToken, laesAfmeldToken, afmeldUrl, TOKEN_FORM } from "../../../supabase/functions/_shared/webinarAfmeldToken.ts";
import { ARTER, MED_INVITATION, type MailArt } from "@/lib/webinar/mailDom";

const SESSION = "2026-10-13T09:00:00.000Z";
const AFMELD = "https://p.supabase.co/functions/v1/webinar-afmeld?t=abc.def";
const ARGS = {
  sessionTid: SESSION,
  webinarTitel: "Webinar med Morten Larsen",
  joinLink: "https://topix.ewebinar.com/webinar/x/join/abc",
  kalenderLink: "https://api.ewebinar.com/v1/attendees/12345/ics",
  afmeldUrl: AFMELD,
  // Prøvernes standard: filen kom med. «Uden» prøves for sig nedenfor.
  invitationVedhaeftet: true,
};

describe("bygWebinarMail — alle syv mails er hele", () => {
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

describe("INGEN LØFTER OM ET LINK, DER KOMMER (Jonas 22/9 ca. 19:35)", () => {
  /**
   * Knappen med modtagerens EGET join-link står i hver eneste mail — så en
   * sætning om et link, der kommer senere, er forkert, uanset hvor pænt den
   * er skrevet. Klaviyo-mailene havde ingen knap; det er hele forskellen.
   *
   * Dømmes på den FÆRDIGE mail (emne + HTML + tekst), ikke på kildeteksten:
   * filhovedet CITERER de gamle sætninger for at fortælle, hvad der blev
   * ændret, og den citation må ikke kunne fælde prøven.
   *
   * Der er ingen preheader i huset — skelettet har intet skjult preview-felt
   * — så emne, HTML og tekst ER hele mailen. Får mailene en preheader, skal
   * den med i `dele` nedenfor.
   *
   * UFØLSOM FOR STORE/SMÅ BOGSTAVER: teksten sætter fremhævede sætninger med
   * VERSALER i ren tekst («DIT PERSONLIGE LINK STÅR HERUNDER …»), og «dagen»
   * skriver «du får» med lille d. En følsom prøve ville lade begge slippe.
   */
  // «optagelse» (Jonas 28/9): optagelsen sendes IKKE — og må derfor ikke loves.
  const FORBUDTE = ["kommer en time før", "i god tid", "du får linket", "optagelse"];

  it("ingen af de syv mails lover et link, der kommer senere", () => {
    for (const art of ARTER) {
      const m = bygWebinarMail({ ...ARGS, art });
      const dele: [string, string][] = [["emne", m.subject], ["html", m.html], ["tekst", m.text]];
      for (const [navn, tekst] of dele) {
        for (const forbudt of FORBUDTE) {
          expect(tekst.toLowerCase(), `${art}/${navn}: «${forbudt}»`).not.toContain(forbudt);
        }
      }
    }
  });

  it("i stedet peger de på knappen — «dit personlige link» i alle syv", () => {
    for (const art of ARTER) {
      const m = bygWebinarMail({ ...ARGS, art });
      expect(m.html.toLowerCase(), art).toContain("dit personlige link");
      expect(m.text.toLowerCase(), art).toContain("dit personlige link");
    }
  });

  it("PRØVEN VIRKER: den gamle sætning ville være fældet", () => {
    const gammel = "Vi ses tirsdag. Du får et link i god tid.";
    for (const forbudt of FORBUDTE.slice(1, 2)) {
      expect(gammel.toLowerCase()).toContain(forbudt);
    }
    expect("Du får linket en time før start".toLowerCase()).toContain("du får linket");
    expect("LINKET TIL WEBINARET KOMMER EN TIME FØR.".toLowerCase()).toContain("kommer en time før");
    // Sætningen, der stod i en_dag og en_time til 28/9 — ordret.
    expect("Kan du ikke alligevel? Så gør ingenting — du får optagelsen bagefter.".toLowerCase()).toContain("optagelse");
  });

  it("i stedet peger «en_dag» og «en_time» fremad: en anden dag, ikke en optagelse (Jonas 28/9)", () => {
    for (const art of ["en_dag", "en_time"] as const) {
      const m = bygWebinarMail({ ...ARGS, art });
      expect(m.html, art).toContain("Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.");
      expect(m.text, art).toContain("Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.");
    }
  });

  it("«dagen» lover stadig de to påmindelser, der FAKTISK sendes", () => {
    // Platformen sender «en time før» (arten en_time), og eWebinars egen
    // påmindelse går ti minutter før. Begge dele er sande — derfor står de.
    const m = bygWebinarMail({ ...ARGS, art: "dagen" });
    expect(m.html).toContain("Du får det igen en time og ti minutter før start.");
    expect(m.text).toContain("Du får det igen en time og ti minutter før start.");
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

describe("fjorten_dage — «om to uger», med invitationen vedhæftet (Jonas 28/9)", () => {
  const m = bygWebinarMail({ ...ARGS, art: "fjorten_dage" });

  it("emnet er i Mortens stil og siger, hvad mailen vil", () => {
    expect(EMNER.fjorten_dage).toBe("Vi ses om to uger — læg det i kalenderen nu");
    expect(m.subject).toBe(EMNER.fjorten_dage);
  });

  it("siger «om to uger», tidspunktet, og at invitationen er VEDHÆFTET — i begge udgaver", () => {
    expect(m.html).toContain("Om to uger holder jeg webinaret, du har meldt dig til.");
    expect(m.text).toContain("Om to uger holder jeg webinaret, du har meldt dig til.");
    expect(m.html).toContain("tirsdag 13. oktober kl. 11.00");
    expect(m.html).toContain("Læg den i kalenderen nu. Invitationen er vedhæftet denne mail — sig ja til den");
    expect(m.text).toContain("Læg den i kalenderen nu. Invitationen er vedhæftet denne mail — sig ja til den");
  });

  it("siger, hvad Morten gennemgår — de to områder og de fem spørgsmål, som «tre_dage» og «dagen»", () => {
    for (const tekst of [m.html, m.text]) {
      expect(tekst).toContain("de to områder, jeg mener afgør, om en virksomhed vokser eller står stille");
      expect(tekst).toContain("de fem spørgsmål, jeg stiller alle mine investeringer");
    }
  });

  it("knappen, kalenderrækken og afmeldingen er der — som i de andre", () => {
    expect(m.html).toContain(`href="${ARGS.joinLink}"`);
    expect(m.html).toContain("Gå til webinaret");
    expect(m.html).toContain("Læg i kalender:");
    expect(m.html).toContain(ARGS.kalenderLink);
    expect(m.text).toContain(`Afmeld dig her: ${AFMELD}`);
  });

  it("er kort — «30 sekunders læsning», som «dagen»", () => {
    expect(m.html).toContain("30 sekunders læsning");
    expect(m.text.length).toBeLessThan(bygWebinarMail({ ...ARGS, art: "tre_dage" }).text.length);
  });
});

describe("TEKSTEN FØLGER INVITATIONEN (Jonas 28/9) — «vedhæftet» står KUN i en mail, der bærer filen", () => {
  /**
   * Hentningen er fail-soft: kan eWebinars .ics ikke hentes, går mailen
   * alligevel. Så må den ikke love en fil, den ikke bærer. Dømmes på den
   * FÆRDIGE mail (HTML + tekst), ufølsom for store/små bogstaver — teksten
   * sætter fremhævede sætninger med VERSALER.
   */
  const bygget = (art: MailArt, med: boolean) => bygWebinarMail({ ...ARGS, art, invitationVedhaeftet: med });

  it("dommen: MED → «vedhæftet … sig ja»; UDEN → «linkene herunder», og aldrig «vedhæftet»", () => {
    const med = invitationsTekst(true), uden = invitationsTekst(false);
    expect(med.kalenderHtml).toContain("Invitationen er vedhæftet denne mail — sig ja til den");
    expect(med.kalenderTekst).toContain("Invitationen er vedhæftet denne mail — sig ja til den");
    expect(med.linkSted).toBe("herunder og i invitationen");
    expect(uden.kalenderHtml).toBe("Læg den i din kalender med linkene herunder, så står tiden reserveret, og du får en påmindelse af dig selv.");
    expect(uden.kalenderTekst).toBe("Læg den i din kalender med linkene herunder, så står tiden reserveret.");
    expect(uden.linkSted).toBe("herunder");
    for (const v of Object.values(uden)) expect(v.toLowerCase()).not.toContain("vedhæft");
  });

  it("BEGGE arter × MED: filen er vedhæftet, og linket står «herunder og i invitationen»", () => {
    for (const art of MED_INVITATION) {
      const m = bygget(art, true);
      expect(m.html, art).toContain("Invitationen er vedhæftet denne mail — sig ja til den");
      expect(m.text, art).toContain("Invitationen er vedhæftet denne mail — sig ja til den");
      expect(m.html, art).toContain("Dit personlige link står herunder og i invitationen");
      expect(m.text, art).toContain("DIT PERSONLIGE LINK STÅR HERUNDER OG I INVITATIONEN");
      expect(m.html, art).not.toContain("linkene herunder");
    }
  });

  it("BEGGE arter × UDEN: intet løfte — kalenderrækken i stedet, og linket står «herunder»", () => {
    for (const art of MED_INVITATION) {
      const m = bygget(art, false);
      expect(m.html, art).toContain("Læg den i din kalender med linkene herunder, så står tiden reserveret");
      expect(m.text, art).toContain("Læg den i din kalender med linkene herunder, så står tiden reserveret.");
      expect(m.html, art).toContain("Dit personlige link står herunder");
      expect(m.text, art).toContain("DIT PERSONLIGE LINK STÅR HERUNDER");
      expect(m.html, art).not.toContain("i invitationen");
      expect(m.text, art).not.toContain("I INVITATIONEN");
      // Og kalenderrækken, der peges på, ER der.
      expect(m.html, art).toContain("Læg i kalender:");
      expect(m.text, art).toContain("Læg i kalender — Google:");
    }
  });

  it("ALLE SYV arter uden invitation: ordet «vedhæftet» står INGEN steder — HTML og tekst, uanset bogstaver", () => {
    for (const art of ARTER) {
      const m = bygget(art, false);
      for (const [navn, tekst] of [["emne", m.subject], ["html", m.html], ["tekst", m.text]] as const) {
        expect(tekst.toLowerCase(), `${art}/${navn}`).not.toContain("vedhæft");
      }
    }
  });

  it("de fem arter uden invitation nævner den heller ikke, selv om flaget skulle stå true", () => {
    for (const art of ARTER.filter((a) => !MED_INVITATION.includes(a))) {
      const m = bygget(art, true);
      expect(m.html.toLowerCase(), art).not.toContain("vedhæft");
      expect(m.text.toLowerCase(), art).not.toContain("vedhæft");
    }
  });

  it("PRØVEN VIRKER: den gamle sætning ville være fældet", () => {
    expect("Læg den i kalenderen nu — invitationen er vedhæftet denne mail.".toLowerCase()).toContain("vedhæft");
    expect("DIT PERSONLIGE LINK STÅR HERUNDER OG I INVITATIONEN".toLowerCase()).toContain("i invitationen");
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
