/**
 * Klokken når en mail om adgang eller penge bliver spærret (16/9 2026).
 * Ren dom i _shared/spaerretMail.ts: præcis de tretten labels giver en
 * besked med type mail_spaerret, reference company + company_id og
 * teksten ordret; alt andet — og manglende company_id — giver null.
 */
import { describe, expect, it } from "vitest";
import {
  beskedVedSpaerretMail,
  beskrivMail,
  erSpaerretKlokkeLabel,
  SPAERRET_KLOKKE_LABELS,
  TYPE_MAIL_SPAERRET,
} from "../../../supabase/functions/_shared/spaerretMail.ts";

const COMPANY = "a4481db0-1cbc-4f2f-801e-29d5693da08d";
const basis = { companyId: COMPANY, virksomhed: "FLOOR1 I/S", modtager: "lisbeth@floor1.dk" };

const HALE =
  "adressen er spærret hos mailudbyderen (afmeldt, bounce eller klage). " +
  "Platformen kan ikke sende flere mails til adressen — hverken invitation, betalingspåmindelser eller fornyelsesvarsler. " +
  "Kontakt dem direkte og få en adresse der virker.";

const BESKRIVELSER: Record<string, string> = {
  invitation: "Invitationen",
  "indgang-dag0": "Betalingsmailen",
  "indgang-dag14": "Betalingspåmindelsen (dag 14)",
  "indgang-dag25": "Betalingspåmindelsen (dag 25)",
  "indgang-dag31": "Betalingspåmindelsen (dag 31)",
  "fornyelse-varsel1": "Fornyelsesvarslet",
  "fornyelse-varsel2": "Fornyelsesvarslet",
  "fornyelse-vindue1": "Mailen om at forlænge",
  "fornyelse-vindue2": "Mailen om at forlænge",
  "fornyelse-kvittering": "Kvitteringen for fornyelsen",
};

describe("listen — præcis de ti levende labels om adgang og penge", () => {
  it("er de ti, i den rækkefølge", () => {
    expect([...SPAERRET_KLOKKE_LABELS]).toEqual(Object.keys(BESKRIVELSER));
    expect(SPAERRET_KLOKKE_LABELS).toHaveLength(10);
  });

  it("erSpaerretKlokkeLabel: ja for listen, nej for resten — også de døde dag-trin ingen cron sender", () => {
    for (const label of SPAERRET_KLOKKE_LABELS) expect(erSpaerretKlokkeLabel(label), label).toBe(true);
    for (const label of ["indgang-dag7", "indgang-dag15", "indgang-dag20", "onboarding-dag0", "onboarding-dag14", "intro-reminder", "notification-samlemail", "indgang-raadgiver-mangler-pris", "system", ""]) {
      expect(erSpaerretKlokkeLabel(label), label).toBe(false);
    }
  });
});

describe("beskrivMail — kort dansk navn for alle ti", () => {
  it("hver label har sit navn", () => {
    for (const [label, navn] of Object.entries(BESKRIVELSER)) expect(beskrivMail(label), label).toBe(navn);
  });

  it("dag-formen er generisk (et nyt trin i PAAMINDELSESDAGE får sit navn uden kodeændring her)", () => {
    expect(beskrivMail("indgang-dag21")).toBe("Betalingspåmindelsen (dag 21)");
  });

  it("en ukendt label står ordret — aldrig undefined", () => {
    expect(beskrivMail("onboarding-dag0")).toBe("onboarding-dag0");
  });
});

describe("beskedVedSpaerretMail — hver label giver beskeden med type, reference og tekst ordret", () => {
  for (const label of SPAERRET_KLOKKE_LABELS) {
    it(label, () => {
      const b = beskedVedSpaerretMail({ ...basis, label });
      expect(b).not.toBeNull();
      expect(b).toEqual({
        type: TYPE_MAIL_SPAERRET,
        title: "Mails til FLOOR1 I/S bliver ikke leveret",
        body: `${BESKRIVELSER[label]} til lisbeth@floor1.dk blev ikke sendt: ${HALE}`,
        company_id: COMPANY,
        reference_type: "company",
        reference_id: COMPANY,
      });
    });
  }

  it("type er «mail_spaerret», og referencen er virksomheden — så dedup'en er én klokke pr. virksomhed", () => {
    expect(TYPE_MAIL_SPAERRET).toBe("mail_spaerret");
    const b = beskedVedSpaerretMail({ ...basis, label: "indgang-dag14" })!;
    expect(b.reference_id).toBe(b.company_id);
    expect(b.reference_type).toBe("company");
  });

  it("den fulde tekst for invitationen, ordret", () => {
    const b = beskedVedSpaerretMail({ ...basis, label: "invitation" })!;
    expect(b.body).toBe(
      "Invitationen til lisbeth@floor1.dk blev ikke sendt: adressen er spærret hos mailudbyderen (afmeldt, bounce eller klage). Platformen kan ikke sende flere mails til adressen — hverken invitation, betalingspåmindelser eller fornyelsesvarsler. Kontakt dem direkte og få en adresse der virker.",
    );
  });
});

describe("beskedVedSpaerretMail — null når klokken ikke skal ringe", () => {
  it("labels uden for listen → null — også de døde dag-trin", () => {
    for (const label of ["indgang-dag7", "indgang-dag15", "indgang-dag20", "onboarding-dag0", "onboarding-dag14", "intro-reminder", "notification-samlemail", "indgang-raadgiver-mangler-pris", "notification-chat_aggregated", "system"]) {
      expect(beskedVedSpaerretMail({ ...basis, label }), label).toBeNull();
    }
  });

  it("manglende companyId (tom, blank, null, undefined) → null, også for en label i listen", () => {
    for (const companyId of ["", "   ", null, undefined]) {
      expect(beskedVedSpaerretMail({ ...basis, companyId, label: "invitation" }), String(companyId)).toBeNull();
    }
  });

  it("tom modtager bliver «mailadresse ukendt» — beskeden skrives stadig", () => {
    const b = beskedVedSpaerretMail({ ...basis, modtager: "  ", label: "fornyelse-varsel1" })!;
    expect(b.body.startsWith("Fornyelsesvarslet til mailadresse ukendt blev ikke sendt: ")).toBe(true);
  });
});
