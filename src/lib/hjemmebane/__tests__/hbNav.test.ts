import { describe, expect, it } from "vitest";
import { BLOK_MEDLEMMETS_FLADER, BLOK_PLATFORM, bygHbNav, type HbAktiv } from "@/lib/hjemmebane/hbNav";

// VÆRN (Jonas 8/9): rådgiveren fik sin egen menu — medlemmets må IKKE
// ændre sig. Medlemmets menu er låst ORDRET nedenfor (labels, links,
// rækkefølge, ingen blok-overskrifter), som den stod i HbMemberShell.tsx
// før flytningen. Ændres den, skal denne test ændres med vilje.

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
    { label: "Milestones", to: "/milestones" },
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
      { label: "Podcast & Talks", to: "/podcast", blok: null, children: null },
      { label: "Rabataftaler", to: "/rabataftaler", blok: null, children: null },
      { label: "Events", to: "/events", blok: null, children: null },
      { label: "Netværket", to: "/medlemmer", blok: null, children: null },
      { label: "Community", to: "/community", blok: null, children: null },
    ]);
  });
  it("abonnenten: kun Dine tal, Podcast & Talks og Rabataftaler; hjemlinket er /kpis", () => {
    expect(flad(bygHbNav({ isAdvisor: false, erAbonnent: true, active: "noegletal" }))).toEqual([
      DINE_TAL,
      { label: "Podcast & Talks", to: "/podcast", blok: null, children: null },
      { label: "Rabataftaler", to: "/rabataftaler", blok: null, children: null },
    ]);
  });
  it("aktiv-markeringen følger `active` — og præcis ét punkt er aktivt", () => {
    const tilfaelde: Array<[HbAktiv, string]> = [["boardroom", "Dit Boardroom"], ["akademiet", "Akademiet"], ["community", "Community"], ["chat", "Chat"], ["budget", "Budget"]];
    for (const [active, label] of tilfaelde) {
      const nav = bygHbNav({ isAdvisor: false, erAbonnent: false, active });
      const aktive = nav.flatMap((n) => [...(n.active ? [n.label] : []), ...(n.children ?? []).filter((c) => c.active).map((c) => c.label)]);
      expect(aktive).toEqual([label]);
    }
  });
  it("medlemmet ser aldrig rådgiverens punkter", () => {
    const labels = bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom" }).flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]);
    for (const l of ["Forside", "Virksomheder", "Indbakke", "Indhold", "Platform", "Opgaver", "E-mails", "Import"]) expect(labels).not.toContain(l);
  });
});

describe("rådgiverens menu — det I bruger øverst (Jonas 8/9)", () => {
  const nav = bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom" });
  it("rækkefølgen: Forside, Virksomheder, Indbakke, Community, Indhold — så medlemmets flader — så Platform", () => {
    expect(flad(nav).map((n) => [n.label, n.to, n.blok])).toEqual([
      ["Forside", "/", null],
      ["Virksomheder", "/virksomheder", null],
      ["Indbakke", "/chat", null],
      ["Community", "/community", null],
      ["Indhold", "/admin/indhold", null],
      ["Dine tal", null, BLOK_MEDLEMMETS_FLADER],
      ["Akademiet", "/akademiet", BLOK_MEDLEMMETS_FLADER],
      ["Podcast & Talks", "/podcast", BLOK_MEDLEMMETS_FLADER],
      ["Rabataftaler", "/rabataftaler", BLOK_MEDLEMMETS_FLADER],
      ["Events", "/events", BLOK_MEDLEMMETS_FLADER],
      ["Netværket", "/medlemmer", BLOK_MEDLEMMETS_FLADER],
      ["Platform", null, BLOK_PLATFORM],
    ]);
  });
  it("Dine tal bliver med sine fem; Book session, Dit Boardroom og Opgaver er ude", () => {
    const labels = nav.flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]);
    expect(nav.find((n) => n.label === "Dine tal")?.children?.map((c) => c.label)).toEqual(["Rapportering", "KPI'er", "Budget", "Milestones", "Handouts"]);
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
});
