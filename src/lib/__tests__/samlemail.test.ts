import { describe, expect, it } from "vitest";
import {
  SAMLEMAIL_MAKS_ALDER_TIMER,
  SAMLEMAIL_TIME_DANSK,
  SAMLEMAIL_TYPER,
  bygSamlemail,
  danskDato,
  erForaeldetTilSamlemail,
  erSamlemailTid,
  erSamlemailType,
  samlMedOg,
  samlemailEmne,
  sorterPunkter,
  tidsmaerke,
  type SamlemailPunkt,
} from "../../../supabase/functions/_shared/samlemail.ts";
// Til de tilføjede tjek nederst (originalerne motoren importerer, og kildelæsning).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { datoOrd, tidOrd } from "../../../supabase/functions/_shared/eventMails.ts";
import { bulletproofButton, fallbackLinkBlock } from "../../../supabase/functions/_shared/emailButtonHelpers.ts";

// Alle tider gives i UTC og læses i dansk tid. Sommertid (CEST, UTC+2) til
// 25/10-2026 kl. 03:00; vintertid (CET, UTC+1) derefter.
const t = (iso: string) => new Date(iso);
const APP = "https://app.theboardroom.dk";

function punkt(over: Partial<SamlemailPunkt> & { id: string }): SamlemailPunkt {
  return {
    type: "community_opslag",
    titel: `Titel ${over.id}`,
    tekst: null,
    link: null,
    oprettet: t("2026-09-16T08:00:00Z"),
    erPraesentation: false,
    ...over,
  };
}

describe("typerne", () => {
  it("præcis event_published og community_opslag samles", () => {
    expect([...SAMLEMAIL_TYPER]).toEqual(["event_published", "community_opslag"]);
    expect(erSamlemailType("event_published")).toBe(true);
    expect(erSamlemailType("community_opslag")).toBe(true);
    for (const andet of ["event_reminder", "event_cancelled", "community_naevnelse", "chat_reply", "report_review_ready", ""]) {
      expect(erSamlemailType(andet)).toBe(false);
    }
  });
});

describe("erSamlemailTid — sommertid (15/9-2026, UTC+2)", () => {
  it("16:59 dansk er falsk, 17:00 sand", () => {
    expect(SAMLEMAIL_TIME_DANSK).toBe(17);
    expect(erSamlemailTid(t("2026-09-15T14:59:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-09-15T15:00:00Z"), null)).toBe(true);
  });
  it("sendt i dag kl. 17:02 → falsk kl. 18", () => {
    expect(erSamlemailTid(t("2026-09-15T16:00:00Z"), t("2026-09-15T15:02:00Z"))).toBe(false);
  });
  it("sendt i går → sand kl. 17:10", () => {
    expect(erSamlemailTid(t("2026-09-15T15:10:00Z"), t("2026-09-14T15:05:00Z"))).toBe(true);
  });
  it("kl. 00:30 dansk er falsk (også uden tidligere afsendelse)", () => {
    expect(erSamlemailTid(t("2026-09-14T22:30:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-09-14T22:30:00Z"), t("2026-09-14T15:05:00Z"))).toBe(false);
  });
});

describe("erSamlemailTid — vintertid (15/11-2026, UTC+1)", () => {
  it("16:59 dansk er falsk, 17:00 sand", () => {
    expect(erSamlemailTid(t("2026-11-15T15:59:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-11-15T16:00:00Z"), null)).toBe(true);
  });
  it("sendt i dag kl. 17:02 → falsk kl. 18", () => {
    expect(erSamlemailTid(t("2026-11-15T17:00:00Z"), t("2026-11-15T16:02:00Z"))).toBe(false);
  });
  it("sendt i går → sand kl. 17:10", () => {
    expect(erSamlemailTid(t("2026-11-15T16:10:00Z"), t("2026-11-14T16:05:00Z"))).toBe(true);
  });
  it("kl. 00:30 dansk er falsk", () => {
    expect(erSamlemailTid(t("2026-11-14T23:30:00Z"), null)).toBe(false);
  });
});

describe("erSamlemailTid — skiftedagen 25/10-2026 (sommertid slutter kl. 03:00)", () => {
  it("dagen før er 15:00 UTC kl. 17 dansk; på skiftedagen er 15:00 UTC kun kl. 16, og 16:00 UTC er kl. 17", () => {
    expect(erSamlemailTid(t("2026-10-24T15:00:00Z"), null)).toBe(true);
    expect(erSamlemailTid(t("2026-10-25T15:00:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-10-25T16:00:00Z"), null)).toBe(true);
  });
  it("sendt dagen før kl. 17 (15:00 UTC) → sand på skiftedagen kl. 17 (16:00 UTC)", () => {
    expect(erSamlemailTid(t("2026-10-25T16:00:00Z"), t("2026-10-24T15:00:00Z"))).toBe(true);
  });
});

describe("danskDato omkring midnat", () => {
  it("22:30 UTC om sommeren er næste danske dato; 21:59 UTC er samme", () => {
    expect(danskDato(t("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(danskDato(t("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
  });
  it("om vinteren skifter datoen først kl. 23:00 UTC", () => {
    expect(danskDato(t("2026-12-01T22:30:00Z"))).toBe("2026-12-01");
    expect(danskDato(t("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
  });
});

describe("erForaeldetTilSamlemail", () => {
  const nu = t("2026-09-16T15:00:00Z");
  const timer = (h: number, m = 0) => new Date(nu.getTime() - (h * 60 + m) * 60_000);
  it("47 t 59 min er ikke forældet; 48 t 1 min er", () => {
    expect(SAMLEMAIL_MAKS_ALDER_TIMER).toBe(48);
    expect(erForaeldetTilSamlemail(timer(47, 59), nu)).toBe(false);
    expect(erForaeldetTilSamlemail(timer(48, 1), nu)).toBe(true);
  });
  it("præcis 48 t er ikke forældet (grænsen er eksklusiv, som erForaeldet i køen)", () => {
    expect(erForaeldetTilSamlemail(timer(48), nu)).toBe(false);
  });
});

describe("samlemailEmne", () => {
  const praes = (id: string) => punkt({ id, erPraesentation: true });
  const event = (id: string) => punkt({ id, type: "event_published" });
  const opslag = (id: string) => punkt({ id });

  it("1/1/1 — tre dele, « og » kun før sidste", () => {
    expect(samlemailEmne([opslag("a"), event("b"), praes("c")])).toBe(
      "Nyt i The Boardroom: 1 nyt medlem har præsenteret sig, 1 nyt event og 1 nyt opslag",
    );
  });
  it("12 præsentationer + 1 event — flertal og ental", () => {
    const tolv = Array.from({ length: 12 }, (_, i) => praes(`p${i}`));
    expect(samlemailEmne([...tolv, event("e")])).toBe(
      "Nyt i The Boardroom: 12 nye medlemmer har præsenteret sig og 1 nyt event",
    );
  });
  it("kun opslag — ental og flertal", () => {
    expect(samlemailEmne([opslag("a")])).toBe("Nyt i The Boardroom: 1 nyt opslag");
    expect(samlemailEmne([opslag("a"), opslag("b"), opslag("c")])).toBe("Nyt i The Boardroom: 3 nye opslag");
  });
  it("kun events — ental og flertal", () => {
    expect(samlemailEmne([event("a")])).toBe("Nyt i The Boardroom: 1 nyt event");
    expect(samlemailEmne([event("a"), event("b")])).toBe("Nyt i The Boardroom: 2 nye events");
  });
  it("to dele har « og » og intet komma", () => {
    expect(samlemailEmne([praes("p"), opslag("o")])).toBe(
      "Nyt i The Boardroom: 1 nyt medlem har præsenteret sig og 1 nyt opslag",
    );
    expect(samlMedOg(["a", "b", "c", "d"])).toBe("a, b, c og d");
    expect(samlMedOg(["a"])).toBe("a");
  });
  it("tom liste kaster", () => {
    expect(() => samlemailEmne([])).toThrow("samlemail uden punkter");
  });
});

describe("tidsmaerke — dansk tid, husets klokkeslæt (da-DK: «14.30»)", () => {
  const nu = t("2026-09-16T10:00:00Z"); // onsdag 16/9 kl. 12:00 dansk
  it("samme danske dato: «i dag kl. …»", () => {
    expect(tidsmaerke(t("2026-09-16T06:30:00Z"), nu)).toMatch(/^i dag kl\. 08[.:]30$/);
  });
  it("dagen før: «i går kl. …» — også kl. 22:15 aftenen før", () => {
    expect(tidsmaerke(t("2026-09-15T20:15:00Z"), nu)).toMatch(/^i går kl\. 22[.:]15$/);
  });
  it("ældre: ugedag + dato + kl.", () => {
    expect(tidsmaerke(t("2026-09-10T12:00:00Z"), nu)).toMatch(/^torsdag (den )?10\. september kl\. 14[.:]00$/);
  });
  it("22:30 UTC om sommeren er næste danske dato — «i dag» set fra den dato", () => {
    expect(tidsmaerke(t("2026-09-15T22:30:00Z"), nu)).toMatch(/^i dag kl\. 00[.:]30$/);
  });
  it("over sommertidsgrænsen: ældre linje beholder sit CEST-klokkeslæt", () => {
    const nuVinter = t("2026-10-26T10:00:00Z"); // mandag 26/10 kl. 11:00 CET
    expect(tidsmaerke(t("2026-10-24T20:00:00Z"), nuVinter)).toMatch(/^lørdag (den )?24\. oktober kl\. 22[.:]00$/);
  });
  it("over sommertidsgrænsen: «i går» kl. 23:30 CEST set fra skiftedagens aften i CET", () => {
    expect(tidsmaerke(t("2026-10-24T21:30:00Z"), t("2026-10-25T20:00:00Z"))).toMatch(/^i går kl\. 23[.:]30$/);
  });
});

describe("bygSamlemail", () => {
  const nu = t("2026-09-16T15:30:00Z");
  const punkter: SamlemailPunkt[] = [
    punkt({ id: "opslag-aeldst", oprettet: t("2026-09-15T08:00:00Z"), link: "/community/1", tekst: "Første opslag." }),
    punkt({ id: "event-nyt", type: "event_published", oprettet: t("2026-09-16T09:00:00Z"), link: "/events/9" }),
    punkt({ id: "praes-nyest", erPraesentation: true, oprettet: t("2026-09-16T12:00:00Z"), link: "https://app.theboardroom.dk/community/7" }),
    punkt({ id: "opslag-yngre", oprettet: t("2026-09-16T10:00:00Z") }),
    punkt({ id: "event-aeldre", type: "event_published", oprettet: t("2026-09-15T18:00:00Z") }),
  ];

  it("rækkefølgen: præsentationer, events, øvrige opslag — ældste først i hver gruppe", () => {
    expect(sorterPunkter(punkter).map((p) => p.id)).toEqual([
      "praes-nyest",
      "event-aeldre",
      "event-nyt",
      "opslag-aeldst",
      "opslag-yngre",
    ]);
    const { html, tekst } = bygSamlemail({ fornavn: "Mette", punkter, nu, appUrl: APP });
    const pos = (s: string) => html.indexOf(s);
    expect(pos("Titel praes-nyest")).toBeGreaterThan(-1);
    expect(pos("Titel praes-nyest")).toBeLessThan(pos("Titel event-aeldre"));
    expect(pos("Titel event-aeldre")).toBeLessThan(pos("Titel event-nyt"));
    expect(pos("Titel event-nyt")).toBeLessThan(pos("Titel opslag-aeldst"));
    expect(pos("Titel opslag-aeldst")).toBeLessThan(pos("Titel opslag-yngre"));
    expect(tekst.indexOf("Titel praes-nyest")).toBeLessThan(tekst.indexOf("Titel opslag-aeldst"));
  });

  it("emne, tiltale, tidsmærke pr. linje, tekst, link og én knap", () => {
    const m = bygSamlemail({ fornavn: "Mette", punkter, nu, appUrl: APP });
    expect(m.emne).toBe("Nyt i The Boardroom: 1 nyt medlem har præsenteret sig, 2 nye events og 2 nye opslag");
    expect(m.html).toContain(">Hej Mette,</h1>");
    expect(m.html).toMatch(/i går kl\. 10[.:]00/);
    expect(m.html).toMatch(/i dag kl\. 11[.:]00/);
    expect(m.html).toContain("Første opslag.");
    expect(m.html).toContain(`href="${APP}/community/1"`);
    expect(m.html).toContain(`href="${APP}/events/9"`);
    expect(m.html).toContain(`href="${APP}/community/7"`);
    expect(m.html.match(/Åbn The Boardroom/g)?.length).toBe(2); // VML-udgaven og <a>-udgaven af SAMME knap
    expect(m.html).not.toMatch(/href="\/events/); // deep_link er sat på appUrl
    expect(m.tekst).toContain("Hej Mette,");
    expect(m.tekst).toContain(`Se eventet: ${APP}/events/9`);
    expect(m.tekst).toContain(`Åbn The Boardroom: ${APP}`);
  });

  it("escaper <script> og & i titel, tekst og fornavn", () => {
    const m = bygSamlemail({
      fornavn: "<b>Anna & co",
      punkter: [punkt({ id: "x", titel: "<script>alert(1)</script> & sønner", tekst: "a & b <i>kursiv</i>", link: "/community/1?a=1&b=2" })],
      nu,
      appUrl: APP,
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<i>");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; sønner");
    expect(m.html).toContain("a &amp; b &lt;i&gt;kursiv&lt;/i&gt;");
    expect(m.html).toContain(">Hej &lt;b&gt;Anna &amp; co,</h1>");
    expect(m.html).toContain(`href="${APP}/community/1?a=1&amp;b=2"`);
  });

  it("tiltale uden fornavn: «Hej,» — aldrig «Hej ,»", () => {
    const m = bygSamlemail({ fornavn: null, punkter: [punkt({ id: "x" })], nu, appUrl: APP });
    expect(m.html).toContain(">Hej,</h1>");
    expect(m.html).not.toContain("Hej ,");
    expect(bygSamlemail({ fornavn: "   ", punkter: [punkt({ id: "x" })], nu, appUrl: APP }).html).toContain(">Hej,</h1>");
  });

  it("tom liste kaster — kalderen må aldrig bygge en tom mail", () => {
    expect(() => bygSamlemail({ fornavn: "Mette", punkter: [], nu, appUrl: APP })).toThrow("samlemail uden punkter");
  });

  it("er ren: samme input giver samme output, og intet afhænger af Date.now()", () => {
    const a = bygSamlemail({ fornavn: "Mette", punkter, nu, appUrl: APP });
    const b = bygSamlemail({ fornavn: "Mette", punkter, nu, appUrl: APP });
    expect(a).toEqual(b);
  });
});

// ── Tilføjet ved omarbejdningen til én fil i _shared (15/9 aften) ──────────

describe("samlemail bruger originalerne, ikke kopier", () => {
  const nu = t("2026-09-16T15:30:00Z");
  it("knappen og fallback-linjen er emailButtonHelpers.ts' bulletproofButton og fallbackLinkBlock, ordret", () => {
    const m = bygSamlemail({ fornavn: "Mette", punkter: [punkt({ id: "x" })], nu, appUrl: APP });
    expect(m.html).toContain(bulletproofButton({ href: APP, label: "Åbn The Boardroom", bgColor: "#133332" }));
    expect(m.html).toContain(fallbackLinkBlock(APP));
  });
  it("tidsmærket for en ældre linje er præcis «{datoOrd} kl. {tidOrd}» fra eventMails.ts", () => {
    const iso = "2026-09-10T12:00:00Z";
    expect(tidsmaerke(t(iso), nu)).toBe(`${datoOrd(iso)} kl. ${tidOrd(iso)}`);
  });
  it("kilden bærer ingen kopi af datoOrd eller escHtml og ingen Date.now()/new Date() (kommentarer skrællet af)", () => {
    const kilde = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/samlemail.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(kilde).not.toContain('weekday: "long"');
    expect(kilde).not.toContain(".replace(/&/g");
    expect(kilde).not.toContain("Date.now(");
    expect(kilde).not.toContain("new Date()");
  });
});
