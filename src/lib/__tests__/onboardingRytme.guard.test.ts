import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for onboardingrytmens mails (14/9-2026, to rettelser):
//   1. Dag 0-mailen lovede «Jonas eller Morten skriver til dig i chatten i
//      løbet af de første dage». Det var ikke automatiseret, og ingen
//      påmindelse sikrede det (Jonas 14/9: vi lover ikke noget vi er i tvivl
//      om). Sætningen må ikke komme igen — i nogen af de to spejle.
//   2. Dag 10-mailen nævnte kun Morten (fund G). Siden 13/9 (#844) er der to
//      inkluderede sessioner; teksten står i TO spejle (src/lib og
//      _shared, paritetstestet ordret) og rammen i intro-reminder-cron bar
//      derudover sit eget mærkat «Din sparring med Morten». Alle tre låses.
// Plus det sædvanlige: ingen «by Topix», ingen «Ignorer denne besked».
// Kilde-læsning, fordi mærkatet i intro-reminder-cron og cronens ramme ikke
// er rene funktioner (forsidenKaster.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const SPEJLE = ["src/lib/onboardingRytme.ts", "supabase/functions/_shared/onboardingRytme.ts"];
const RAMMER = ["supabase/functions/intro-reminder-cron/index.ts", "supabase/functions/onboarding-rytme/index.ts"];

describe("onboardingrytmens mails — de gamle sætninger kan ikke komme igen", () => {
  it("rettelse 1: «skriver til dig i chatten» findes ikke i nogen af de to spejle", () => {
    for (const sti of SPEJLE) {
      const kode = laes(sti);
      expect(kode, sti).not.toContain("skriver til dig i chatten");
      expect(kode, sti).not.toContain("i løbet af de første dage");
    }
  });

  it("rettelse 2: dag 10-emnet nævner begge rådgivere når Jonas-retten ikke er brugt, og kun Morten når den er — i begge spejle, som en gren på jonasRetBrugt", () => {
    for (const sti of SPEJLE) {
      const kode = laes(sti);
      expect(kode, sti).toContain(
        'emne: jonasRetBrugt ? "Din sparring med Morten er inkluderet" : "Din sparring med Morten og Jonas er inkluderet"',
      );
      // Det gamle statiske Morten-alene-emne findes ikke som eget emne-udtryk.
      expect(kode, sti).not.toContain('emne: "Din sparring med Morten er inkluderet"');
      expect(kode, sti).not.toContain("30 minutters sparring med Morten.");
    }
  });

  it("cronen læser jonas_session_used_at og giver den videre — teksten må aldrig kaldes uden svaret", () => {
    const kode = laes("supabase/functions/intro-reminder-cron/index.ts");
    expect(kode).toMatch(/\.select\("[^"]*\bjonas_session_used_at\b[^"]*"\)/);
    expect(kode).toContain("introPaamindelseTekst(firstName, jonasRetBrugt)");
    expect(kode).not.toMatch(/introPaamindelseTekst\(firstName\)/);
  });

  it("rettelse 2: intro-reminder-crons eget mærkat over overskriften nævner ikke kun Morten", () => {
    const kode = laes("supabase/functions/intro-reminder-cron/index.ts");
    expect(kode).not.toMatch(/>Din sparring med Morten<\/p>/);
    expect(kode).toMatch(/>Inkluderet i dit medlemskab<\/p>/);
    // Rammen læser stadig teksten fra spejlet — ingen tredje kopi af selve brødteksten.
    expect(kode).toContain('from "../_shared/onboardingRytme.ts"');
    expect(kode).not.toContain("to sessioner på 30 minutter");
  });

  it("de sædvanlige: ingen «by Topix» og ingen «Ignorer denne besked» i spejle eller rammer", () => {
    for (const sti of [...SPEJLE, ...RAMMER]) {
      const kode = laes(sti);
      expect(kode, sti).not.toMatch(/\bby Topix\b/);
      expect(kode, sti).not.toMatch(/\bIgnorer denne besked\b/);
    }
  });
});
