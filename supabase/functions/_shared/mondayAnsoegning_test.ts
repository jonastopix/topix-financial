/**
 * Enhedstests for mondayAnsoegning.ts — kolonnelæsningen, navnet, prisen
 * og statusteksten. Ingen Monday, ingen Supabase.
 *
 * KØRES I HÅNDEN (samme situation som indgangsMail_test.ts):
 *   deno test supabase/functions/_shared/mondayAnsoegning_test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANSOEGNING_KOLONNE_IDS,
  ANSOEGNING_KOLONNER,
  bygKontaktnavn,
  laesAnsoegningsFelter,
  laesStatusTekst,
  parsePrisKontraktOere,
  type MondayKolonneVaerdi,
} from "./mondayAnsoegning.ts";

Deno.test("kolonne-id'erne: e_mail findes ikke, email gør — og listen bærer alle 18", () => {
  assertEquals(ANSOEGNING_KOLONNER.email, "email");
  assertEquals(ANSOEGNING_KOLONNE_IDS.includes("e_mail"), false);
  assertEquals(ANSOEGNING_KOLONNE_IDS.length, 18);
  assertEquals(new Set(ANSOEGNING_KOLONNE_IDS).size, 18);
});

Deno.test("parsePrisKontraktOere: de menneskelige skrivemåder giver samme øre", () => {
  for (const s of ["40.000", "40000", "40 000", "40.000 kr", "40.000 kr.", "kr. 40.000", "40.000,00 kr.", "DKK 40.000", "40000,5"]) {
    assertEquals(parsePrisKontraktOere(s), 4_000_000, s);
  }
  assertEquals(parsePrisKontraktOere("50.000"), 5_000_000);
});

Deno.test("parsePrisKontraktOere: tomt, tekst, nul og negativt giver null — aldrig et gæt", () => {
  for (const s of [null, undefined, "", "   ", "aftales", "0", "-40.000", "40.000 eller 50.000", "kr"]) {
    assertEquals(parsePrisKontraktOere(s), null, String(s));
  }
});

Deno.test("bygKontaktnavn: «Fornavn Efternavn» trimmet, null når begge er tomme", () => {
  assertEquals(bygKontaktnavn(" Lisbeth ", " Hansen "), "Lisbeth Hansen");
  assertEquals(bygKontaktnavn("Lisbeth", ""), "Lisbeth");
  assertEquals(bygKontaktnavn(null, "Hansen"), "Hansen");
  assertEquals(bygKontaktnavn("", "  "), null);
  assertEquals(bygKontaktnavn(null, undefined), null);
});

function kolonne(id: string, text: string | null, value: unknown = null): MondayKolonneVaerdi {
  return { id, text, value: value === null ? null : JSON.stringify(value) };
}

Deno.test("laesAnsoegningsFelter: læser alle felter, foretrækker rå værdi for email/telefon/link", () => {
  const K = ANSOEGNING_KOLONNER;
  const felter = laesAnsoegningsFelter([
    kolonne(K.email, "Lisbeth Hansen", { email: "Lisbeth@Firma.dk", text: "Lisbeth Hansen" }),
    kolonne(K.fornavn, " Lisbeth "),
    kolonne(K.efternavn, "Hansen"),
    kolonne(K.cvr, "12 34 56 78"),
    kolonne(K.telefon, "+45 12 34 56 78", { phone: "+4512345678", countryShortName: "DK" }),
    kolonne(K.hjemmeside, "firma.dk - Firma", { url: "https://firma.dk", text: "Firma" }),
    kolonne(K.branche, "Håndværk"),
    kolonne(K.adresse, "Vejen 1"),
    kolonne(K.postnummer, "8000"),
    kolonne(K.by, "Aarhus"),
    kolonne(K.aarligOmsaetning, "1200000"),
    kolonne(K.omsaetningsinterval, "1-5 mio."),
    kolonne(K.nuvaerendeSituation, "Vi har travlt."),
    kolonne(K.maal, "Vokse."),
    kolonne(K.hjaelp, "Overblik."),
    kolonne(K.ansoegningsdato, "2026-08-25"),
    kolonne(K.prisKontrakt, "40.000"),
    kolonne(K.status, "Godkendt"),
    kolonne("ukendt_kolonne", "ignoreres"),
  ]);
  assertEquals(felter.email, "lisbeth@firma.dk");
  assertEquals(felter.fornavn, "Lisbeth");
  assertEquals(felter.efternavn, "Hansen");
  assertEquals(felter.cvr, "12345678");
  assertEquals(felter.telefon, "+4512345678");
  assertEquals(felter.hjemmeside, "https://firma.dk");
  assertEquals(felter.branche, "Håndværk");
  assertEquals(felter.adresse, "Vejen 1");
  assertEquals(felter.postnummer, "8000");
  assertEquals(felter.by, "Aarhus");
  assertEquals(felter.aarligOmsaetning, 1200000);
  assertEquals(felter.omsaetningsinterval, "1-5 mio.");
  assertEquals(felter.nuvaerendeSituation, "Vi har travlt.");
  assertEquals(felter.maal, "Vokse.");
  assertEquals(felter.hjaelp, "Overblik.");
  assertEquals(felter.ansoegningsdato, "2026-08-25");
  assertEquals(felter.prisKontraktTekst, "40.000");
});

Deno.test("laesAnsoegningsFelter: manglende kolonner giver null — Monday udelader ukendte id'er", () => {
  const felter = laesAnsoegningsFelter([]);
  assertEquals(felter.email, null);
  assertEquals(felter.fornavn, null);
  assertEquals(felter.aarligOmsaetning, null);
  assertEquals(felter.prisKontraktTekst, null);
});

Deno.test("laesAnsoegningsFelter: email uden rå værdi falder tilbage på teksten", () => {
  const felter = laesAnsoegningsFelter([kolonne(ANSOEGNING_KOLONNER.email, "x@y.dk")]);
  assertEquals(felter.email, "x@y.dk");
});

Deno.test("laesStatusTekst: de fire former Monday sender", () => {
  assertEquals(laesStatusTekst({ label: { text: "Godkendt" } }), "Godkendt");
  assertEquals(laesStatusTekst(JSON.stringify({ label: { text: "Godkendt" } })), "Godkendt");
  assertEquals(laesStatusTekst({ label: "I gang" }), "I gang");
  assertEquals(laesStatusTekst({ text: "Medlem" }), "Medlem");
  assertEquals(laesStatusTekst("Afvist"), "Afvist");
  assertEquals(laesStatusTekst(null), "");
});
