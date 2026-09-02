/**
 * Enhedstests for de rene dele af indgangsMailAfsendelse.ts — datoerne,
 * fornavnet og tekstudgaven. sendIndgangsMail selv rører Supabase og
 * testes ikke her.
 *
 * KØRES I HÅNDEN (samme situation som indgangsMail_test.ts):
 *   deno test supabase/functions/_shared/indgangsMailAfsendelse_test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  betalingsfristDato,
  formatDanskDato,
  fornavnAf,
  htmlTilTekst,
} from "./indgangsMailAfsendelse.ts";
import { dag0Mail } from "./indgangsMail.ts";

Deno.test("formatDanskDato: «2. oktober 2026» på UTC-komponenter", () => {
  assertEquals(formatDanskDato(new Date("2026-10-02T00:00:00.000Z")), "2. oktober 2026");
  assertEquals(formatDanskDato(new Date("2026-01-31T23:59:59.000Z")), "31. januar 2026");
  // 23:30 UTC er allerede næste dag i dansk tid — datoen følger UTC, som
  // Postgres' ::date i hent_betalingstilbud.
  assertEquals(formatDanskDato(new Date("2026-09-02T23:30:00.000Z")), "2. september 2026");
});

Deno.test("betalingsfristDato: mail sendt 2/9 → frist 2/10 (30 dage, kalenderdag + 30)", () => {
  const frist = betalingsfristDato("2026-09-02T10:00:00.000Z");
  assertEquals(frist.toISOString(), "2026-10-02T00:00:00.000Z");
  assertEquals(formatDanskDato(frist), "2. oktober 2026");
});

Deno.test("betalingsfristDato: samme kalenderdag giver samme frist uanset klokkeslæt", () => {
  const tidlig = betalingsfristDato("2026-09-02T00:00:01.000Z");
  const sen = betalingsfristDato("2026-09-02T23:59:59.000Z");
  assertEquals(tidlig.toISOString(), sen.toISOString());
});

Deno.test("betalingsfristDato: går korrekt over måneds- og årsskifte", () => {
  assertEquals(formatDanskDato(betalingsfristDato("2026-12-15T12:00:00.000Z")), "14. januar 2027");
  assertEquals(formatDanskDato(betalingsfristDato("2027-01-30T12:00:00.000Z")), "1. marts 2027");
});

Deno.test("fornavnAf: første ord, null når feltet er tomt eller kun mellemrum", () => {
  assertEquals(fornavnAf("Lisbeth Hansen"), "Lisbeth");
  assertEquals(fornavnAf("  Lisbeth   Hansen "), "Lisbeth");
  assertEquals(fornavnAf("Lisbeth"), "Lisbeth");
  assertEquals(fornavnAf(""), null);
  assertEquals(fornavnAf("   "), null);
  assertEquals(fornavnAf(null), null);
  assertEquals(fornavnAf(undefined), null);
});

Deno.test("htmlTilTekst: dag 0-mailen bliver til læsbar tekst med link og uden tags", () => {
  const mail = dag0Mail({
    fornavn: "Lisbeth",
    betalingsUrl: "https://app.theboardroom.dk/betal?token=abc",
    fristDato: "2. oktober 2026",
    beloebKr: 50000,
  });
  const tekst = htmlTilTekst(mail.html);
  assertEquals(tekst.includes("<"), false);
  assertEquals(tekst.includes("Kære Lisbeth,"), true);
  assertEquals(tekst.includes("https://app.theboardroom.dk/betal?token=abc"), true);
  assertEquals(tekst.includes("2. oktober 2026"), true);
  assertEquals(tekst.includes("Venlig hilsen\nMorten Larsen"), true);
});

Deno.test("htmlTilTekst: entities vendes tilbage", () => {
  assertEquals(htmlTilTekst("<p>Smith &amp; Co &lt;3 &quot;ok&quot;</p>"), 'Smith & Co <3 "ok"');
});
