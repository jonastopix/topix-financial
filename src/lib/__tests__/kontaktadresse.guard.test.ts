import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dag0Mail, KONTAKT_ADRESSE } from "../../../supabase/functions/_shared/indgangsMail.ts";
import { kvitteringMail } from "../../../supabase/functions/_shared/fornyelsesMail.ts";

// Kildeværn for kontaktadressen i indgangen (Jonas 14/9 2026):
// kontakt@theboardroom.dk. Mailene sendes fra noreply@theboardroom.dk, så
// «skriv til mig» og «svar på denne mail» lover et svar der forsvinder, og
// en personlig adresse (jonas@, morten@, @topix.dk, @molainvest.dk) er den
// forkerte. Målt 14/9 i _shared og indgangens/fornyelsens functions: to
// fund — dag 0-mailen (indgangsMail.ts) og fornyelsens kvittering
// (fornyelsesMail.ts). Samme form som invitationsMail.guard.test.ts.
//
// Adressen defineres ÉT sted, indgangsMail.ts, og deles derfra; derfor
// låses definitionen dér, brugen i fornyelsesMail.ts via konstanten, og
// den færdige mail (rendret) for begge — så «findes i begge» gælder det
// medlemmet får, ikke kun kildeteksten.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FILER = ["supabase/functions/_shared/indgangsMail.ts", "supabase/functions/_shared/fornyelsesMail.ts"];
const FORBUDT = [/\bskriv til mig\b/, /\bsvar på denne mail\b/, /jonas@/, /morten@/, /@topix\.dk/, /@molainvest\.dk/];

describe("kontaktadresse.guard — dag 0 og fornyelsens kvittering lover ikke svar fra noreply", () => {
  it("ingen af de seks forbudte former står i nogen af de to filer", () => {
    for (const sti of FILER) {
      const kode = udenKommentarer(laes(sti));
      for (const f of FORBUDT) expect(kode, `${sti}: ${f}`).not.toMatch(f);
    }
  });

  it("adressen er defineret ét sted, indgangsMail.ts, og fornyelsesMail.ts bruger konstanten", () => {
    expect(KONTAKT_ADRESSE).toBe("kontakt@theboardroom.dk");
    expect(udenKommentarer(laes(FILER[0]))).toContain('export const KONTAKT_ADRESSE = "kontakt@theboardroom.dk";');
    const fornyelse = udenKommentarer(laes(FILER[1]));
    expect(fornyelse).toMatch(/import \{[^}]*\bKONTAKT_ADRESSE\b[^}]*\} from "\.\/indgangsMail\.ts";/);
    expect(fornyelse).toContain("${KONTAKT_ADRESSE}");
    // Ingen anden fil i _shared definerer adressen igen (invitationsMail.ts re-eksporterer den).
    expect(udenKommentarer(laes("supabase/functions/_shared/invitationsMail.ts"))).not.toMatch(/const KONTAKT_ADRESSE\s*=/);
  });

  it("de færdige mails bærer kontakt@theboardroom.dk — begge", () => {
    const dag0 = dag0Mail({ fornavn: "Gry", betalingsUrl: "https://app.theboardroom.dk/betal?token=x", fristDato: "14. oktober 2026", beloebKr: 40000 });
    const kvittering = kvitteringMail({ fornavn: "Gry", virksomhed: "Nordic By Hand", nySlutDato: "14. september 2027", betalingsmodel: "fuld", samletOere: 2_000_000 });
    for (const m of [dag0, kvittering]) {
      expect(m.html).toContain("kontakt@theboardroom.dk");
      for (const f of FORBUDT) expect(m.html).not.toMatch(f);
    }
    expect(dag0.html).toContain("så skriv til kontakt@theboardroom.dk — så finder vi ud af det.");
    expect(kvittering.html).toContain("Har du spørgsmål til fornyelsen, så skriv til kontakt@theboardroom.dk.");
  });
});
