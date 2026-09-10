import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AFTALE_KILDER,
  AFTALE_UDEN_TAL,
  aftaleLinjer,
  betalingsLinjer,
  EMAIL_INDSTILLINGER,
  fletPraeferencer,
  FORBUDTE_KILDER,
  formatDato,
  laesPraeferencer,
  medlemskabStatus,
  periodeLinje,
  SKJULTE_NOEGLER,
  traekLinje,
  traekStatusOrd,
} from "../indstillinger";

const NU = new Date(2026, 8, 10, 9, 0);
const tom = { contract_start_date: null, contract_end_date: null, indgangspris_oere: null, fornyelsespris_oere: null, subscription_status: null, subscription_current_period_end: null };

describe("aftalen — kun deres aftale, aldrig vores noter", () => {
  it("AFTALE_KILDER indeholder ingen af de forbudte kilder", () => {
    for (const f of FORBUDTE_KILDER) expect([...AFTALE_KILDER]).not.toContain(f);
    expect(FORBUDTE_KILDER).toContain("company_fornyelse");
  });

  it("fladens kildekode læser hverken company_fornyelse, beslutningen eller varselsstemplerne", () => {
    const kilde = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/indstillinger/IndstillingerView.tsx"), "utf8");
    for (const f of FORBUDTE_KILDER) expect(kilde, f).not.toContain(f);
    const motor = readFileSync(resolve(process.cwd(), "src/lib/hjemmebane/indstillinger.ts"), "utf8");
    // Motoren må nævne dem i filhovedet og FORBUDTE_KILDER — men aldrig som feltadgang.
    expect(motor).not.toMatch(/\.(beslutning|varsel_1_sendt_at|varsel_2_sendt_at)\b/);
  });
});

describe("medlemskabStatus + aftaleLinjer", () => {
  it("fuldt medlem: gælder til slutdato med dage endnu", () => {
    const a = { ...tom, contract_start_date: "2025-09-22", contract_end_date: "2026-09-22", indgangspris_oere: 5000000 };
    expect(medlemskabStatus(a, "full", NU)).toEqual({ label: "Medlemskab", vaerdi: "Gælder til 22. september 2026 — 12 dage endnu" });
    expect(medlemskabStatus({ ...a, contract_end_date: "2026-09-11" }, "full", NU).vaerdi).toContain("1 dag endnu");
    expect(medlemskabStatus({ ...a, contract_end_date: "2026-09-10" }, "full", NU).vaerdi).toContain("sidste dag i dag");
    const linjer = aftaleLinjer(a, "full", NU);
    expect(linjer.map((l) => l.label)).toEqual(["Medlemskab", "Start", "Slut", "Pris"]);
    expect(linjer[3].vaerdi).toBe("50.000 kr. for medlemskabet");
  });

  it("udløbet → rust; ingen slutdato → rust og henvisning til rådgiveren", () => {
    expect(medlemskabStatus({ ...tom, contract_end_date: "2026-08-01" }, "expired", NU)).toEqual({ label: "Medlemskab", vaerdi: "Udløb 1. august 2026", rust: true });
    const ingen = medlemskabStatus(tom, "no_date", NU);
    expect(ingen.rust).toBe(true);
    expect(ingen.vaerdi).toContain("spørg din rådgiver");
    expect(aftaleLinjer(tom, "no_date", NU).find((l) => l.label === "Slut")).toEqual({ label: "Slut", vaerdi: "Ikke registreret", rust: true });
  });

  it("abonnent: næste periode; fornyelsespris kun når sat", () => {
    const a = { ...tom, contract_end_date: "2026-01-01", subscription_status: "active", subscription_current_period_end: "2026-10-01T00:00:00Z", fornyelsespris_oere: 2500000 };
    expect(medlemskabStatus(a, "subscriber", NU).vaerdi).toBe("Abonnement — næste periode fra 1. oktober 2026");
    expect(aftaleLinjer(a, "subscriber", NU).find((l) => l.label === "Fornyelsespris")?.vaerdi).toBe("25.000 kr.");
    expect(aftaleLinjer(tom, "no_date", NU).some((l) => l.label === "Fornyelsespris" || l.label === "Pris" || l.label === "Start")).toBe(false);
  });

  it("formatDato: null og ugyldigt → null; teksten for den tomme aftale peger på rådgiveren", () => {
    expect(formatDato(null)).toBeNull();
    expect(formatDato("ikke en dato")).toBeNull();
    expect(AFTALE_UDEN_TAL).toContain("din rådgiver");
  });
});

describe("betalingen — perioder først, så træk; tom liste når intet findes", () => {
  it("periodeLinje bruger husets modelord og medlemmets ord for arten", () => {
    const l = periodeLinje({ id: "p1", art: "indgang", betalingsmodel: "rate2", beloeb_oere: 5000000, periode_start: "2026-09-22", periode_slut: "2027-09-21" });
    expect(l).toEqual({ id: "p1", label: "22. september 2026 – 21. september 2027", vaerdi: "50.000 kr. · 2 rater · Medlemskab" });
  });

  it("traekLinje: betalt med dato, fejlet i rust med fakturalink", () => {
    const betalt = traekLinje({ stripe_invoice_id: "in_1", status: "betalt", beloeb_oere: 2500000, betalt_at: "2026-09-22T10:00:00Z", fejlet_at: null, faktura_nummer: "F-100", hosted_invoice_url: null });
    expect(betalt).toEqual({ id: "in_1", label: "Faktura F-100", vaerdi: "25.000 kr. · Betalt 22. september 2026", rust: false, fakturaUrl: null });
    const fejlet = traekLinje({ stripe_invoice_id: "in_2", status: "fejlet", beloeb_oere: 2500000, betalt_at: null, fejlet_at: "2026-10-22T10:00:00Z", faktura_nummer: null, hosted_invoice_url: "https://stripe/x" });
    expect(fejlet.rust).toBe(true);
    expect(fejlet.label).toBe("Faktura");
    expect(fejlet.vaerdi).toBe("25.000 kr. · Betalingen fejlede 22. oktober 2026");
    expect(fejlet.fakturaUrl).toBe("https://stripe/x");
    expect(traekStatusOrd("open")).toBe("Afventer betaling");
    expect(traekStatusOrd("ukendt")).toBe("ukendt");
  });

  it("betalingsLinjer: tom når 27 af 27 har nul — kortet vises så ikke", () => {
    expect(betalingsLinjer([], [])).toEqual([]);
  });
});

describe("notifikationerne — fem mailtyper koden læser, ingen døde kontakter", () => {
  it("nøglerne er dem functions læser; pulse_reminders er skjult men bevares", () => {
    expect(EMAIL_INDSTILLINGER.map((i) => i.noegle)).toEqual(["action_required", "important", "report_reminders", "monthly_digest", "intro_reminders"]);
    expect(SKJULTE_NOEGLER).toContain("pulse_reminders");
    expect(EMAIL_INDSTILLINGER.map((i) => i.noegle)).not.toContain("pulse_reminders");
  });

  it("beskrivelserne siger det koden gør: d. 22, d. 7/15/20, ikke d. 5 og ingen AI-analyse-mail", () => {
    const alt = EMAIL_INDSTILLINGER.map((i) => i.beskrivelse).join(" ");
    expect(alt).toContain("22.");
    expect(alt).toContain("7., 15. og 20.");
    expect(alt).not.toContain("5. i måneden");
    expect(alt).not.toMatch(/AI-analyse/);
  });

  it("laesPraeferencer: alt til medmindre udtrykkeligt false; tåler null og skrald", () => {
    expect(laesPraeferencer(null)).toEqual({ action_required: true, important: true, report_reminders: true, monthly_digest: true, intro_reminders: true });
    expect(laesPraeferencer("x")).toEqual(laesPraeferencer(null));
    expect(laesPraeferencer({ important: false, monthly_digest: "nej" }).important).toBe(false);
    expect(laesPraeferencer({ important: false, monthly_digest: "nej" }).monthly_digest).toBe(true);
  });

  it("fletPraeferencer: valgene skrives, ukendte og skjulte nøgler bevares", () => {
    const gemt = { pulse_reminders: false, noget_andet: 1, important: true };
    const ud = fletPraeferencer(gemt, { action_required: true, important: false, report_reminders: false, monthly_digest: true, intro_reminders: true });
    expect(ud).toEqual({ pulse_reminders: false, noget_andet: 1, action_required: true, important: false, report_reminders: false, monthly_digest: true, intro_reminders: true });
    expect(gemt.important).toBe(true); // input urørt
  });
});
