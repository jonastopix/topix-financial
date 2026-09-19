import { describe, expect, it } from "vitest";
import { BLOK_MEDLEMMETS_FLADER, BLOK_PLATFORM, bygHbNav, type HbAktiv } from "@/lib/hjemmebane/hbNav";

// VÆRN (Jonas 8/9): rådgiveren fik sin egen menu — medlemmets må IKKE
// ændre sig. Medlemmets menu er låst ORDRET nedenfor (labels, links,
// rækkefølge, ingen blok-overskrifter), som den stod i HbMemberShell.tsx
// før flytningen. Ændres den, skal denne test ændres med vilje.
// Ændret med vilje 14/9 (Jonas): «Fortæl det videre» → /deling som tiende
// og sidste punkt for fulde medlemmer. Abonnenten er urørt.
// Ændret med vilje 15/9 (Jonas 11/9, beslutning 17: podcasten ud af
// platformen): «Podcast & Talks» (/podcast) er væk fra ALLE tre menuer —
// fuldt medlem (nu ni punkter), abonnent (nu to) og rådgiver. Intet andet
// punkt flytter sig: rækkefølgen er den samme med ét punkt taget ud, og
// listerne nedenfor er fortsat ordrede toEqual, så en forskudt eller
// omdøbt nabo fejler. Podcasten lever videre som et tekstlink til Spotify
// nederst i sidebaren (HbSidebar.test.tsx), ikke som menupunkt.

const flad = (nav: ReturnType<typeof bygHbNav>) =>
  nav.map((n) => ({
    label: n.label,
    to: n.to ?? null,
    blok: n.blok ?? null,
    children: n.children?.map((c) => ({ label: c.label, to: c.to ?? null })) ?? null,
  }));

const DINE_TAL = {
  label: "Dine tal",
  to: null,
  blok: null,
  children: [
    { label: "Rapportering", to: "/reports" },
    { label: "KPI'er", to: "/kpis" },
    { label: "Budget", to: "/budget" },
    // «Dine mål» («Én plan», fase 3, 16/9) — rettet med vilje.
    { label: "Dine mål", to: "/milestones" },
    { label: "Handouts", to: "/handouts" },
  ],
};

describe("medlemmets menu — ordret som før 8/9", () => {
  it("fuldt medlem: ni punkter i medlemmets rækkefølge, ingen overskrifter", () => {
    expect(flad(bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom" }))).toEqual([
      { label: "Dit Boardroom", to: "/", blok: null, children: null },
      DINE_TAL,
      { label: "Din rådgiver", to: null, blok: null, children: [{ label: "Chat", to: "/chat" }, { label: "Book session", to: "/book-session" }] },
      { label: "Akademiet", to: "/akademiet", blok: null, children: null },
      { label: "Rabataftaler", to: "/rabataftaler", blok: null, children: null },
      { label: "Events", to: "/events", blok: null, children: null },
      { label: "Netværket", to: "/medlemmer", blok: null, children: null },
      { label: "Community", to: "/community", blok: null, children: null },
      { label: "Fortæl det videre", to: "/deling", blok: null, children: null },
    ]);
  });
  it("abonnenten: kun Dine tal og Rabataftaler; hjemlinket er /kpis", () => {
    expect(flad(bygHbNav({ isAdvisor: false, erAbonnent: true, active: "noegletal" }))).toEqual([
      DINE_TAL,
      { label: "Rabataftaler", to: "/rabataftaler", blok: null, children: null },
    ]);
  });
  it("podcasten er ude af alle tre menuer — intet punkt hedder Podcast og intet peger på /podcast (15/9)", () => {
    const menuer = [
      bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom" }),
      bygHbNav({ isAdvisor: false, erAbonnent: true, active: "noegletal" }),
      bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom" }),
    ];
    for (const nav of menuer) {
      const alle = nav.flatMap((n) => [n, ...(n.children ?? [])]);
      expect(alle.some((e) => /podcast/i.test(e.label))).toBe(false);
      expect(alle.some((e) => e.to === "/podcast")).toBe(false);
    }
  });
  it("aktiv-markeringen følger `active` — og præcis ét punkt er aktivt", () => {
    const tilfaelde: Array<[HbAktiv, string]> = [["boardroom", "Dit Boardroom"], ["akademiet", "Akademiet"], ["community", "Community"], ["chat", "Chat"], ["budget", "Budget"], ["deling", "Fortæl det videre"]];
    for (const [active, label] of tilfaelde) {
      const nav = bygHbNav({ isAdvisor: false, erAbonnent: false, active });
      const aktive = nav.flatMap((n) => [...(n.active ? [n.label] : []), ...(n.children ?? []).filter((c) => c.active).map((c) => c.label)]);
      expect(aktive).toEqual([label]);
    }
  });
  it("medlemmet ser aldrig rådgiverens punkter", () => {
    const labels = bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom" }).flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]);
    for (const l of ["Forside", "Virksomheder", "Ansøgninger", "Indbakke", "Indhold", "Platform", "Opgaver", "E-mails", "Import"]) expect(labels).not.toContain(l);
  });
});

describe("rådgiverens menu — det I bruger øverst (Jonas 8/9)", () => {
  const nav = bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom" });
  it("rækkefølgen: Forside, Virksomheder, Ansøgninger, Indbakke, Community, Indhold — så medlemmets flader — så Platform", () => {
    expect(flad(nav).map((n) => [n.label, n.to, n.blok])).toEqual([
      ["Forside", "/", null],
      ["Virksomheder", "/virksomheder", null],
      ["Ansøgninger", "/ansoegninger", null],
      ["Webinar", "/webinar", null],
      ["Indbakke", "/chat", null],
      ["Community", "/community", null],
      ["Indhold", "/admin/indhold", null],
      ["Dine tal", null, BLOK_MEDLEMMETS_FLADER],
      ["Akademiet", "/akademiet", BLOK_MEDLEMMETS_FLADER],
      ["Rabataftaler", "/rabataftaler", BLOK_MEDLEMMETS_FLADER],
      ["Events", "/events", BLOK_MEDLEMMETS_FLADER],
      ["Netværket", "/medlemmer", BLOK_MEDLEMMETS_FLADER],
      ["Platform", null, BLOK_PLATFORM],
    ]);
  });
  it("Dine tal bliver med sine fem; Book session, Dit Boardroom og Opgaver er ude", () => {
    const labels = nav.flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]);
    expect(nav.find((n) => n.label === "Dine tal")?.children?.map((c) => c.label)).toEqual(["Rapportering", "KPI'er", "Budget", "Dine mål", "Handouts"]);
    for (const l of ["Book session", "Dit Boardroom", "Opgaver", "Din rådgiver", "Chat"]) expect(labels).not.toContain(l);
  });
  it("Platform bærer de syv driftssider; Indhold er sit eget punkt øverst", () => {
    expect(nav.find((n) => n.label === "Platform")?.children?.map((c) => c.to)).toEqual([
      "/admin/emails", "/admin/email-log", "/admin/review-queue", "/admin/config", "/admin/feedback", "/admin/legat", "/admin/import",
    ]);
  });
  it("Forside er aktiv på «/» (active=boardroom), Indbakke på chat, Virksomheder på listen og virksomhedssiden", () => {
    expect(bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom" }).find((n) => n.label === "Forside")?.active).toBe(true);
    expect(bygHbNav({ isAdvisor: true, erAbonnent: false, active: "chat" }).find((n) => n.label === "Indbakke")?.active).toBe(true);
    expect(bygHbNav({ isAdvisor: true, erAbonnent: false, active: "virksomheder" }).find((n) => n.label === "Virksomheder")?.active).toBe(true);
  });
  it("rådgivermenuen vinder selv hvis rådgiverens egen tier skulle være abonnent", () => {
    expect(bygHbNav({ isAdvisor: true, erAbonnent: true, active: "boardroom" })[0].label).toBe("Forside");
  });
  /* «Økonomi» (Ø2, 18/9 — Jonas 17/9: «Kun mig og Morten»): kun partnere
     ser punktet; for alle andre rådgivere er menuen ordret som ovenfor. */
  it("«Økonomi» findes ikke for en rådgiver uden partner — heller ikke når isPartner er false", () => {
    for (const n of [nav, bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom", isPartner: false })]) {
      expect(flad(n).map((x) => x.label)).not.toContain("Økonomi");
      expect(flad(n).map((x) => x.to)).not.toContain("/oekonomi");
    }
  });
  it("partneren får «Økonomi» sidst i den øverste blok, efter Indhold, uden blok-overskrift; aktiv på /oekonomi", () => {
    const p = bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom", isPartner: true });
    expect(flad(p).slice(0, 9).map((n) => [n.label, n.to, n.blok])).toEqual([
      ["Forside", "/", null],
      ["Virksomheder", "/virksomheder", null],
      ["Ansøgninger", "/ansoegninger", null],
      ["Webinar", "/webinar", null],
      ["Indbakke", "/chat", null],
      ["Community", "/community", null],
      ["Indhold", "/admin/indhold", null],
      ["Økonomi", "/oekonomi", null],
      ["Dine tal", null, BLOK_MEDLEMMETS_FLADER],
    ]);
    expect(flad(p).length).toBe(flad(nav).length + 1);
    expect(bygHbNav({ isAdvisor: true, erAbonnent: false, active: "oekonomi", isPartner: true }).find((n) => n.label === "Økonomi")?.active).toBe(true);
    expect(p.find((n) => n.label === "Økonomi")?.active).toBe(false);
  });
  /* «Webinar» (19/9): webinartallene — tilmeldte, deltagelse, annoncespor.
     Til forskel fra «Økonomi» er punktet ALLE rådgiveres: det er ikke
     omsætningstal, det er hvem der kommer. Medlemmet ser det aldrig. */
  it("«Webinar» står efter «Ansøgninger» for enhver rådgiver, også uden partner", () => {
    for (const n of [nav, bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom", isPartner: false })]) {
      const labels = flad(n).map((x) => x.label);
      expect(labels).toContain("Webinar");
      expect(labels.indexOf("Webinar")).toBe(labels.indexOf("Ansøgninger") + 1);
    }
    expect(bygHbNav({ isAdvisor: true, erAbonnent: false, active: "webinar" }).find((n) => n.label === "Webinar")?.active).toBe(true);
    expect(nav.find((n) => n.label === "Webinar")?.active).toBe(false);
  });
  it("et medlem ser ALDRIG «Webinar» — heller ikke som partner", () => {
    for (const p of [false, true]) {
      expect(flad(bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom", isPartner: p })).map((x) => x.to)).not.toContain("/webinar");
    }
  });
  it("et medlem med isPartner får IKKE «Økonomi» — punktet hører til rådgivermenuen", () => {
    expect(flad(bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom", isPartner: true })).map((x) => x.label)).not.toContain("Økonomi");
  });
});
