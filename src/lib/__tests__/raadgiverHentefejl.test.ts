import { describe, expect, it } from "vitest";
import { FLADE_MANGEL, RAADGIVER_KILDE_ORD, raadgiverHentefejlTekst, raadgiverKildeOrd } from "@/lib/raadgiverHentefejl";
import { HentningsFejl } from "@/lib/kraevRaekker";

// Rådgiverens fejltekster (10/9): siger HVAD der ikke kunne hentes, og at
// fladen kan mangle noget — så rådgiveren ved at skærmen ikke er hele billedet.

describe("raadgiverHentefejlTekst", () => {
  it("navngiver kilden og siger at forsiden kan mangle linjer", () => {
    expect(raadgiverHentefejlTekst(new HentningsFejl("uploads", "timeout"), "forsiden")).toBe(
      "Uploads kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.",
    );
    expect(raadgiverHentefejlTekst(new HentningsFejl("pulse_checkins", "x"), "forsiden")).toBe(
      "Refleksionerne kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.",
    );
  });
  it("virksomhedssiden, listen, opgaverne og invitationerne siger «kan mangle noget»", () => {
    expect(raadgiverHentefejlTekst(new HentningsFejl("company_perioder", "x"), "virksomheden")).toBe("Perioderne kunne ikke hentes — siden kan mangle noget. Prøv igen.");
    expect(raadgiverHentefejlTekst(new HentningsFejl("profiles", "x"), "listen")).toBe("Medlemmernes navne kunne ikke hentes — listen kan mangle noget. Prøv igen.");
    expect(raadgiverHentefejlTekst(new HentningsFejl("get_all_advisor_profiles", "x"), "opgaverne")).toBe("Rådgiverne kunne ikke hentes — listen kan mangle noget. Prøv igen.");
    expect(raadgiverHentefejlTekst(new HentningsFejl("email_send_log", "x"), "invitationerne")).toBe("Mailloggen kunne ikke hentes — listen kan mangle noget. Prøv igen.");
  });
  it("en fejl uden kilde (ikke HentningsFejl) bliver «noget af det der står her» — aldrig teknik", () => {
    expect(raadgiverHentefejlTekst(new Error("TypeError: fetch failed"), "forsiden")).toBe(
      "Noget af det der står her kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.",
    );
    expect(raadgiverHentefejlTekst(null, "listen")).toContain("Noget af det der står her");
    expect(raadgiverKildeOrd("ukendt_tabel")).toBe("noget af det der står her");
  });
  it("ordbogen: rolige ord, ingen tabelnavne, ingen udråb", () => {
    for (const [kilde, ord] of Object.entries(RAADGIVER_KILDE_ORD)) {
      expect(ord).not.toContain("_");
      expect(ord).not.toContain("!");
      expect(kilde).not.toBe("");
    }
    for (const mangel of Object.values(FLADE_MANGEL)) expect(mangel).toMatch(/kan mangle/);
  });
});
