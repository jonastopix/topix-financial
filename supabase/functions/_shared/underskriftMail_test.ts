/**
 * Enhedstests for underskriftMail.ts — de fire mails.
 * KØRES I HÅNDEN: deno test --node-modules-dir=none supabase/functions/_shared/underskriftMail_test.ts
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aftaleKodeMail, aftaleKvitteringMail, aftaleKvitteringRaadgiverMail, aftaleLinkMail, aftaleUrl } from "./underskriftMail.ts";

Deno.test("aftaleUrl: /aftale?token=<uuid> på app-domænet", () => {
  assertEquals(aftaleUrl("abc-123"), "https://app.theboardroom.dk/aftale?token=abc-123");
});

Deno.test("linkmailen: knap, udløbsdato, 21 dage, ingen kode", () => {
  const m = aftaleLinkMail({ fornavn: "Lisbeth", virksomhed: "FLOOR1 I/S", url: "https://x/aftale?token=t", udloeberDato: "9. oktober 2026" });
  assertStringIncludes(m.subject, "FLOOR1 I/S");
  assertStringIncludes(m.html, "Kære Lisbeth,");
  assertStringIncludes(m.html, "https://x/aftale?token=t");
  assertStringIncludes(m.html, "21 dage");
  assertStringIncludes(m.html, "9. oktober 2026");
  assertStringIncludes(m.html, "Læs og underskriv");
});

Deno.test("kodemailen: koden står i emnet og med stor skrift i kroppen, 15 minutter, én gang", () => {
  const m = aftaleKodeMail({ fornavn: null, kode: "004217" });
  assertEquals(m.subject, "Din kode: 004217");
  assertStringIncludes(m.html, "letter-spacing:6px");
  assertStringIncludes(m.html, ">004217<");
  assertStringIncludes(m.html, "15 minutter");
  assertStringIncludes(m.html, "kun bruges én gang");
  assertStringIncludes(m.html, "Hej,");
});

Deno.test("kvitteringen til modtageren: navn, tid, formateret aftryk, hent-knap", () => {
  const m = aftaleKvitteringMail({
    fornavn: "Lisbeth", virksomhed: "FLOOR1 I/S", navn: "Lisbeth Hansen",
    tidspunkt: "18. september 2026 kl. 14:03:12 (dansk tid, UTC+02:00)",
    aftryk: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", url: "https://x/aftale?token=t",
  });
  assertStringIncludes(m.html, "Lisbeth Hansen");
  assertStringIncludes(m.html, "UTC+02:00");
  assertStringIncludes(m.html, "ba78 16bf 8f01");
  assertStringIncludes(m.html, "Hent det underskrevne dokument");
});

Deno.test("kvitteringen til rådgiverne: IP og browser, link til virksomheden", () => {
  const m = aftaleKvitteringRaadgiverMail({
    virksomhed: "FLOOR1 I/S", navn: "Lisbeth Hansen", tidspunkt: "t", aftryk: "ab".repeat(32), companyId: "c-1", ansoegningId: null, ip: "85.1.2.3", browser: "Safari på iPhone",
  });
  assertStringIncludes(m.subject, "Underskrevet: FLOOR1 I/S");
  assertStringIncludes(m.html, "fra 85.1.2.3");
  assertStringIncludes(m.html, "Safari på iPhone");
  assertStringIncludes(m.html, "/virksomheder/c-1");
  assert(!m.html.includes("{{"));
  const u = aftaleKvitteringRaadgiverMail({ virksomhed: "X", navn: "N", tidspunkt: "t", aftryk: "ab".repeat(32), companyId: null, ansoegningId: "a-1", ip: null, browser: "ukendt browser" });
  assertStringIncludes(u.html, "/ansoegninger/a-1");
  assertStringIncludes(u.html, "Åbn ansøgningen");
});
