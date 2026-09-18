import { describe, expect, it } from "vitest";
import { raadgiverMailOmNyAnsoegning } from "../../../supabase/functions/_shared/ansoegningRaadgiverMail.ts";

// Mailen til Jonas og Morten ved ny ansøgning (18/9, flow-gennemgangen §3). Navnene er opfundne.
const A = {
  id: "a1", navn: "Lisbeth Holm", email: "lisbeth@nordicbyg.test", telefon: "+45 12 34 56 78", kilde: "webinar",
  omsaetningsinterval: "D", antal_ansatte: 12, cvr: "12345678", cvr_opslag: { navn: "Nordic Byg ApS", branche: "Tømrer- og bygningssnedkervirksomhed" },
  udfordring: "Vi har travlt, men der er ingen penge tilbage, når måneden er omme.",
};
const ANB = { udfald: "tal_med_dem" as const, grundlag: ["omsætning 2 – 5 mio. kr.", "12 ansatte"], for: ["stiftet 2019"], imod: [], version: 1 };
const INGEN = { advarsler: [], alvorlig: false, medlem: null };
const APP = "https://app.theboardroom.dk";

describe("raadgiverMailOmNyAnsoegning", () => {
  it("emne, kontakt, virksomhed, anbefaling, udfordringen med deres ord, og linket til ansøgningen", () => {
    const m = raadgiverMailOmNyAnsoegning({ ansoegning: A, anbefaling: ANB, dubletter: INGEN, appUrl: APP });
    expect(m.emne).toBe("Ny ansøgning: Nordic Byg ApS — anbefaling: Tal med dem");
    expect(m.tekst).toContain("Lisbeth Holm · lisbeth@nordicbyg.test · +45 12 34 56 78 · kom via webinaret.");
    expect(m.tekst).toContain("Nordic Byg ApS (CVR 12345678) · 2 – 5 mio. kr. · 12 ansatte · Tømrer- og bygningssnedkervirksomhed.");
    expect(m.tekst).toContain("Anbefaling: Tal med dem. omsætning 2 – 5 mio. kr., 12 ansatte.");
    expect(m.tekst).toContain("Største udfordring, med deres ord: «Vi har travlt, men der er ingen penge tilbage, når måneden er omme.»");
    expect(m.tekst).toContain(`Åbn ansøgningen: ${APP}/ansoegninger/a1`);
    expect(m.tekst).not.toContain("OBS");
    expect(m.html).toContain("Åbn ansøgningen");
    expect(m.html).toContain(`${APP}/ansoegninger/a1`);
    expect(m.html).toContain("The Boardroom · theboardroom.dk");
  });
  it("OBS i emnet og advarslerne i teksten, når virksomheden findes i forvejen", () => {
    const m = raadgiverMailOmNyAnsoegning({
      ansoegning: A, anbefaling: { ...ANB, udfald: "tvivl" }, appUrl: APP,
      dubletter: { advarsler: ["findes allerede som virksomheden «Nordic Byg ApS» (CVR, active, medlemskab til 2027-03-01)"], alvorlig: true, medlem: { id: "c1", name: "Nordic Byg ApS", status: "active", contract_end_date: "2027-03-01" } },
    });
    expect(m.emne).toBe("OBS — Ny ansøgning: Nordic Byg ApS — anbefaling: Tvivl");
    expect(m.tekst).toContain("OBS: findes allerede som virksomheden «Nordic Byg ApS» (CVR, active, medlemskab til 2027-03-01).");
  });
  it("uden CVR-opslag hedder virksomheden «<navn>s virksomhed»; tomme felter siges, ikke udelades", () => {
    const m = raadgiverMailOmNyAnsoegning({ ansoegning: { ...A, cvr_opslag: null, cvr: null, email: null, telefon: null, omsaetningsinterval: null, antal_ansatte: null, udfordring: "   " }, anbefaling: { ...ANB, udfald: "afvis" }, dubletter: INGEN, appUrl: APP });
    expect(m.emne).toBe("Ny ansøgning: Lisbeth Holms virksomhed — anbefaling: Afvis");
    expect(m.tekst).toContain("Lisbeth Holm · ingen mail · ingen telefon · kom via webinaret.");
    expect(m.tekst).toContain("Lisbeth Holms virksomhed · omsætning ikke angivet.");
    expect(m.tekst).not.toContain("Største udfordring");
  });
  it("udfordringen klippes ved 400 tegn", () => {
    const m = raadgiverMailOmNyAnsoegning({ ansoegning: { ...A, udfordring: "x".repeat(900) }, anbefaling: ANB, dubletter: INGEN, appUrl: APP });
    const linje = m.tekst.split("\n").find((l) => l.startsWith("Største udfordring"))!;
    expect(linje.length).toBeLessThan(450);
    expect(linje.endsWith("…»")).toBe(true);
  });
});
