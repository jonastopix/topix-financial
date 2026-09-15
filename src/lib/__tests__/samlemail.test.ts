import { describe, expect, it } from "vitest";
import {
  SAMLEMAIL_LABEL,
  SAMLEMAIL_MAKS_ALDER_TIMER,
  SAMLEMAIL_SLUT_TIME_DANSK,
  SAMLEMAIL_TIME_DANSK,
  SAMLEMAIL_TYPER,
  UDELAD,
  VENT,
  bygSamlemail,
  danskDato,
  erForaeldetTilSamlemail,
  erSamlemailTid,
  erSamlemailType,
  fordelSamlemail,
  fornavnFraFuldtNavn,
  punktFraEvent,
  punktFraOpslag,
  samlMedOg,
  samlemailEmne,
  samlemailIdempotencyKey,
  sorterPunkter,
  tidsmaerke,
  type SamlemailModtager,
  type SamlemailPunkt,
  type SamlemailRaekke,
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
  it("vinduet lukker kl. 20 (chattens beslutning a): 19:59 sand, 20:00 falsk — også uden afsendelse i dag", () => {
    expect(SAMLEMAIL_SLUT_TIME_DANSK).toBe(20);
    expect(erSamlemailTid(t("2026-09-15T17:59:00Z"), null)).toBe(true);
    expect(erSamlemailTid(t("2026-09-15T18:00:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-09-15T18:00:00Z"), t("2026-09-14T15:05:00Z"))).toBe(false);
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
  it("vinduet lukker kl. 20: 19:59 sand, 20:00 falsk", () => {
    expect(erSamlemailTid(t("2026-11-15T18:59:00Z"), null)).toBe(true);
    expect(erSamlemailTid(t("2026-11-15T19:00:00Z"), null)).toBe(false);
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
  it("vinduet lukker kl. 20 på skiftedagen: 18:59 UTC (19:59 CET) sand, 19:00 UTC (20:00 CET) falsk; dagen før er 18:00 UTC allerede kl. 20 CEST", () => {
    expect(erSamlemailTid(t("2026-10-25T18:59:00Z"), null)).toBe(true);
    expect(erSamlemailTid(t("2026-10-25T19:00:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-10-24T18:00:00Z"), null)).toBe(false);
    expect(erSamlemailTid(t("2026-10-24T17:59:00Z"), null)).toBe(true);
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

// ── DEL 2: mapningen og fordelingen (chattens beslutninger b–g, 15/9) ─────

const NU = t("2026-09-16T15:30:00Z"); // onsdag 16/9 kl. 17:30 dansk — i vinduet
const raekke = (over: Partial<SamlemailRaekke> & { id: string; user_id: string }): SamlemailRaekke => ({
  type: "community_opslag",
  reference_id: `ref-${over.id}`,
  deep_link: `/community/ref-${over.id}`,
  created_at: "2026-09-16T08:00:00Z",
  ...over,
});
const eventRaekke = (id: string, user_id: string) => raekke({ id, user_id, type: "event_published", deep_link: `/events/ev-${id}` });
const modtager = (over: Partial<SamlemailModtager> = {}): SamlemailModtager => ({
  erRaadgiver: false,
  importantFra: false,
  email: "medlem@example.dk",
  fornavn: "Mette",
  sidstSendt: null,
  dagskvoteNaaet: false,
  ...over,
});
const EVENT = { title: "Live sparring", starts_at: "2026-09-23T12:00:00Z", meet_url: "https://meet.example", status: "published" };
const TRAAD = { titel: "Hej, jeg hedder Mette", status: "aktiv", kilde_type: "praesentation" };

describe("punktFraEvent (b)", () => {
  const r = eventRaekke("e1", "u1");
  it("titel = events.title; tekst = datoOrd kl. tidOrd + « · Online» ved meet_url; link = deep_link; oprettet = created_at", () => {
    const m = punktFraEvent({ raekke: r, event: EVENT, nu: NU });
    expect("punkt" in m).toBe(true);
    if (!("punkt" in m)) return;
    expect(m.punkt.titel).toBe("Live sparring");
    expect(m.punkt.tekst).toBe(`${datoOrd(EVENT.starts_at)} kl. ${tidOrd(EVENT.starts_at)} · Online`);
    expect(m.punkt.link).toBe("/events/ev-e1");
    expect(m.punkt.oprettet.toISOString()).toBe("2026-09-16T08:00:00.000Z");
    expect(m.punkt.erPraesentation).toBe(false);
    expect(m.punkt.type).toBe("event_published");
  });
  it("uden meet_url: ingen « · Online»", () => {
    const m = punktFraEvent({ raekke: r, event: { ...EVENT, meet_url: null }, nu: NU });
    expect("punkt" in m && m.punkt.tekst).toBe(`${datoOrd(EVENT.starts_at)} kl. ${tidOrd(EVENT.starts_at)}`);
  });
  it("udelades: eventet mangler / aflyst (status ≠ published) / passeret (starts_at ≤ nu)", () => {
    expect(punktFraEvent({ raekke: r, event: null, nu: NU })).toEqual({ udelad: UDELAD.EVENT_MANGLER });
    expect(punktFraEvent({ raekke: r, event: undefined, nu: NU })).toEqual({ udelad: UDELAD.EVENT_MANGLER });
    expect(punktFraEvent({ raekke: r, event: { ...EVENT, status: "cancelled" }, nu: NU })).toEqual({ udelad: UDELAD.EVENT_IKKE_PUBLICERET });
    expect(punktFraEvent({ raekke: r, event: { ...EVENT, status: "draft" }, nu: NU })).toEqual({ udelad: UDELAD.EVENT_IKKE_PUBLICERET });
    expect(punktFraEvent({ raekke: r, event: { ...EVENT, starts_at: "2026-09-16T15:30:00Z" }, nu: NU })).toEqual({ udelad: UDELAD.EVENT_PASSERET });
    expect(punktFraEvent({ raekke: r, event: { ...EVENT, starts_at: "2026-09-16T15:31:00Z" }, nu: NU })).toHaveProperty("punkt");
  });
});

describe("punktFraOpslag (c)", () => {
  const r = raekke({ id: "o1", user_id: "u1" });
  it("præsentation: tekst «{navn} har præsenteret sig», erPraesentation true", () => {
    const m = punktFraOpslag({ raekke: r, traad: TRAAD, forfatternavn: "Mette Hansen", harAabnetTraaden: false });
    expect(m).toEqual({
      punkt: { id: "o1", type: "community_opslag", titel: "Hej, jeg hedder Mette", tekst: "Mette Hansen har præsenteret sig", link: "/community/ref-o1", oprettet: t("2026-09-16T08:00:00Z"), erPraesentation: true },
    });
  });
  it("almindeligt opslag: «{navn} har skrevet i Community», erPraesentation false", () => {
    const m = punktFraOpslag({ raekke: r, traad: { ...TRAAD, kilde_type: null }, forfatternavn: "Mette Hansen", harAabnetTraaden: false });
    expect("punkt" in m && m.punkt.tekst).toBe("Mette Hansen har skrevet i Community");
    expect("punkt" in m && m.punkt.erPraesentation).toBe(false);
  });
  it("navnet følger husets visningsnavn-regel: tomt navn → «Et medlem»", () => {
    for (const navn of [null, undefined, "", "   "]) {
      const m = punktFraOpslag({ raekke: r, traad: { ...TRAAD, kilde_type: "event" }, forfatternavn: navn, harAabnetTraaden: false });
      expect("punkt" in m && m.punkt.tekst).toBe("Et medlem har skrevet i Community");
    }
  });
  it("udelades: tråden mangler / ikke aktiv / modtageren har åbnet tråden (set i app)", () => {
    expect(punktFraOpslag({ raekke: r, traad: null, forfatternavn: "M", harAabnetTraaden: false })).toEqual({ udelad: UDELAD.TRAAD_MANGLER });
    expect(punktFraOpslag({ raekke: r, traad: { ...TRAAD, status: "skjult" }, forfatternavn: "M", harAabnetTraaden: false })).toEqual({ udelad: UDELAD.TRAAD_IKKE_AKTIV });
    expect(punktFraOpslag({ raekke: r, traad: TRAAD, forfatternavn: "M", harAabnetTraaden: true })).toEqual({ udelad: UDELAD.SET_I_APP });
  });
});

describe("fornavnFraFuldtNavn (g) og idempotency-nøglen (f)", () => {
  it("første ord; tomt → null", () => {
    expect(fornavnFraFuldtNavn("Lisbeth Hansen")).toBe("Lisbeth");
    expect(fornavnFraFuldtNavn("  Anne Marie  Møller ")).toBe("Anne");
    expect(fornavnFraFuldtNavn("")).toBeNull();
    expect(fornavnFraFuldtNavn("   ")).toBeNull();
    expect(fornavnFraFuldtNavn(null)).toBeNull();
    expect(fornavnFraFuldtNavn(undefined)).toBeNull();
  });
  it("nøglen er 'notification-samlemail-{userId}-{danskDato(nu)}' — og skifter ved dansk midnat, ikke UTC-midnat", () => {
    expect(SAMLEMAIL_LABEL).toBe("notification-samlemail");
    expect(samlemailIdempotencyKey("u1", t("2026-09-16T15:30:00Z"))).toBe("notification-samlemail-u1-2026-09-16");
    expect(samlemailIdempotencyKey("u1", t("2026-09-16T21:59:00Z"))).toBe("notification-samlemail-u1-2026-09-16");
    expect(samlemailIdempotencyKey("u1", t("2026-09-16T22:00:00Z"))).toBe("notification-samlemail-u1-2026-09-17");
    expect(samlemailIdempotencyKey("u1", t("2026-12-16T22:30:00Z"))).toBe("notification-samlemail-u1-2026-12-16");
    expect(samlemailIdempotencyKey("u1", t("2026-12-16T23:00:00Z"))).toBe("notification-samlemail-u1-2026-12-17");
  });
});

describe("fordelSamlemail (a, d, e, f) — én række, én grund", () => {
  const opslaaet = new Map([
    ["o1", { traad: TRAAD, forfatternavn: "Mette Hansen", harAabnetTraaden: false }],
    ["e1", { event: EVENT }],
  ]);
  const fordel = (over: Partial<SamlemailModtager> = {}, nu = NU, raekker = [raekke({ id: "o1", user_id: "u1" }), eventRaekke("e1", "u1")]) =>
    fordelSamlemail({ nu, raekker, opslaaet, modtagere: new Map([["u1", modtager(over)]]) });

  it("i vinduet med alt i orden: én mail med begge punkter, rækkeIder, fornavn og nøgle", () => {
    const r = fordel();
    expect(r.stemplesUdenMail).toEqual([]);
    expect(r.venter).toEqual([]);
    expect(r.mails).toHaveLength(1);
    expect(r.mails[0]).toMatchObject({ userId: "u1", email: "medlem@example.dk", fornavn: "Mette", idempotencyKey: "notification-samlemail-u1-2026-09-16" });
    expect(r.mails[0].raekkeIder.sort()).toEqual(["e1", "o1"]);
    expect(r.mails[0].punkter.map((p) => p.id)).toEqual(["o1", "e1"]); // præsentation før event
  });
  it("rådgiver → stemples uden mail (som i dag)", () => {
    const r = fordel({ erRaadgiver: true });
    expect(r.mails).toEqual([]);
    expect(r.stemplesUdenMail).toEqual([{ id: "o1", grund: UDELAD.RAADGIVER }, { id: "e1", grund: UDELAD.RAADGIVER }]);
  });
  it("pref important === false → stemples uden mail", () => {
    const r = fordel({ importantFra: true });
    expect(r.mails).toEqual([]);
    expect(r.stemplesUdenMail.map((s) => s.grund)).toEqual([UDELAD.PREF_FRA, UDELAD.PREF_FRA]);
  });
  it("ingen auth-mail → venter, intet stempel", () => {
    const r = fordel({ email: null });
    expect(r.mails).toEqual([]);
    expect(r.stemplesUdenMail).toEqual([]);
    expect(r.venter.map((v) => v.grund)).toEqual([VENT.INGEN_MAIL, VENT.INGEN_MAIL]);
  });
  it("dagskvote nået → venter", () => {
    const r = fordel({ dagskvoteNaaet: true });
    expect(r.mails).toEqual([]);
    expect(r.venter.map((v) => v.grund)).toEqual([VENT.DAGSKVOTE_NAAET, VENT.DAGSKVOTE_NAAET]);
  });
  it("sidst sendt i dag → venter; sidst sendt i går → mail", () => {
    expect(fordel({ sidstSendt: t("2026-09-16T15:02:00Z") }).venter.map((v) => v.grund)).toEqual([VENT.SENDT_I_DAG, VENT.SENDT_I_DAG]);
    expect(fordel({ sidstSendt: t("2026-09-15T15:02:00Z") }).mails).toHaveLength(1);
  });
  it("før 17 og efter 20: alt venter (uden_for_vinduet) — forældede stemples alligevel", () => {
    for (const nu of [t("2026-09-16T14:59:00Z"), t("2026-09-16T18:00:00Z"), t("2026-09-16T22:30:00Z")]) {
      const r = fordel({}, nu);
      expect(r.mails).toEqual([]);
      expect(r.venter.map((v) => v.grund)).toEqual([VENT.UDEN_FOR_VINDUET, VENT.UDEN_FOR_VINDUET]);
    }
    const gammel = raekke({ id: "g", user_id: "u1", created_at: "2026-09-13T08:00:00Z" });
    const r = fordel({}, t("2026-09-16T14:59:00Z"), [gammel, raekke({ id: "o1", user_id: "u1" })]);
    expect(r.stemplesUdenMail).toEqual([{ id: "g", grund: UDELAD.FORAELDET }]);
    expect(r.venter).toEqual([{ id: "o1", grund: VENT.UDEN_FOR_VINDUET }]);
  });
  it("forældet (> 48 t) stemples med grund — også i vinduet", () => {
    const gammel = raekke({ id: "g", user_id: "u1", created_at: "2026-09-14T15:29:00Z" });
    const r = fordel({}, NU, [gammel]);
    expect(r.stemplesUdenMail).toEqual([{ id: "g", grund: UDELAD.FORAELDET }]);
    expect(r.mails).toEqual([]);
  });
  it("modtager ukendt → venter, intet stempel (fordeleren gætter ikke)", () => {
    const r = fordelSamlemail({ nu: NU, raekker: [raekke({ id: "o1", user_id: "ukendt" })], opslaaet, modtagere: new Map() });
    expect(r.venter).toEqual([{ id: "o1", grund: VENT.MODTAGER_UKENDT }]);
  });
  it("udeladte punkter stemples med deres grund, og en modtager hvis punkter alle er udeladt, får ingen mail", () => {
    const data = new Map([
      ["o1", { traad: TRAAD, forfatternavn: "M", harAabnetTraaden: true }],
      ["e1", { event: { ...EVENT, status: "cancelled" } }],
      ["e2", { event: null }],
      ["e3", { event: { ...EVENT, starts_at: "2026-09-16T10:00:00Z" } }],
      ["o2", { traad: null }],
      ["o3", { traad: { ...TRAAD, status: "skjult" } }],
    ]);
    const rk = [raekke({ id: "o1", user_id: "u1" }), eventRaekke("e1", "u1"), eventRaekke("e2", "u1"), eventRaekke("e3", "u1"), raekke({ id: "o2", user_id: "u1" }), raekke({ id: "o3", user_id: "u1" })];
    const r = fordelSamlemail({ nu: NU, raekker: rk, opslaaet: data, modtagere: new Map([["u1", modtager()]]) });
    expect(r.mails).toEqual([]);
    expect(r.venter).toEqual([]);
    expect(r.stemplesUdenMail).toEqual([
      { id: "o1", grund: UDELAD.SET_I_APP },
      { id: "e1", grund: UDELAD.EVENT_IKKE_PUBLICERET },
      { id: "e2", grund: UDELAD.EVENT_MANGLER },
      { id: "e3", grund: UDELAD.EVENT_PASSERET },
      { id: "o2", grund: UDELAD.TRAAD_MANGLER },
      { id: "o3", grund: UDELAD.TRAAD_IKKE_AKTIV },
    ]);
  });
  it("en række uden opslåede data udelades som manglende — den gætter ikke", () => {
    const r = fordelSamlemail({ nu: NU, raekker: [raekke({ id: "x", user_id: "u1" }), eventRaekke("y", "u1")], opslaaet: new Map(), modtagere: new Map([["u1", modtager()]]) });
    expect(r.stemplesUdenMail).toEqual([{ id: "x", grund: UDELAD.TRAAD_MANGLER }, { id: "y", grund: UDELAD.EVENT_MANGLER }]);
  });
  it("INVARIANTEN — regnestykket går op over en blandet mængde med flere modtagere: hver række præcis ét sted", () => {
    const rk: SamlemailRaekke[] = [
      raekke({ id: "a1", user_id: "a" }), eventRaekke("a2", "a"), raekke({ id: "a3", user_id: "a", created_at: "2026-09-10T08:00:00Z" }),
      raekke({ id: "b1", user_id: "b" }), eventRaekke("b2", "b"),
      raekke({ id: "c1", user_id: "c" }),
      eventRaekke("d1", "d"), raekke({ id: "d2", user_id: "d" }),
      raekke({ id: "e1", user_id: "e" }),
      raekke({ id: "f1", user_id: "f" }), eventRaekke("f2", "f"),
      raekke({ id: "g1", user_id: "g-ukendt" }),
    ];
    const data = new Map([
      ["a1", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: false }], ["a2", { event: EVENT }], ["a3", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: false }],
      ["b1", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: true }], ["b2", { event: { ...EVENT, status: "cancelled" } }],
      ["c1", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: false }],
      ["d1", { event: EVENT }], ["d2", { traad: { ...TRAAD, kilde_type: null }, forfatternavn: "Ole", harAabnetTraaden: false }],
      ["e1", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: false }],
      ["f1", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: false }], ["f2", { event: EVENT }],
      ["g1", { traad: TRAAD, forfatternavn: "Mette", harAabnetTraaden: false }],
    ]);
    const modtagere = new Map<string, SamlemailModtager>([
      ["a", modtager({ email: "a@x.dk" })],
      ["b", modtager({ email: "b@x.dk" })],
      ["c", modtager({ erRaadgiver: true })],
      ["d", modtager({ email: "d@x.dk", sidstSendt: t("2026-09-15T15:10:00Z") })],
      ["e", modtager({ email: null })],
      ["f", modtager({ dagskvoteNaaet: true })],
    ]);
    const r = fordelSamlemail({ nu: NU, raekker: rk, opslaaet: data, modtagere });
    const iMails = r.mails.flatMap((m) => m.raekkeIder);
    const alle = [...iMails, ...r.stemplesUdenMail.map((s) => s.id), ...r.venter.map((v) => v.id)];
    expect(alle.length).toBe(rk.length);
    expect(new Set(alle).size).toBe(rk.length);
    expect([...alle].sort()).toEqual(rk.map((x) => x.id).sort());
    // og fordelingen er den forventede
    expect(r.mails.map((m) => [m.userId, m.raekkeIder.sort()])).toEqual([["a", ["a1", "a2"]], ["d", ["d1", "d2"]]]);
    expect(r.stemplesUdenMail).toEqual([
      { id: "a3", grund: UDELAD.FORAELDET },
      { id: "b1", grund: UDELAD.SET_I_APP },
      { id: "b2", grund: UDELAD.EVENT_IKKE_PUBLICERET },
      { id: "c1", grund: UDELAD.RAADGIVER },
    ]);
    expect(r.venter).toEqual([
      { id: "e1", grund: VENT.INGEN_MAIL },
      { id: "f1", grund: VENT.DAGSKVOTE_NAAET },
      { id: "f2", grund: VENT.DAGSKVOTE_NAAET },
      { id: "g1", grund: VENT.MODTAGER_UKENDT },
    ]);
    // og mailen kan bygges af hvert resultat
    for (const m of r.mails) expect(bygSamlemail({ fornavn: m.fornavn, punkter: m.punkter, nu: NU, appUrl: APP }).emne).toContain("Nyt i The Boardroom: ");
  });
});
