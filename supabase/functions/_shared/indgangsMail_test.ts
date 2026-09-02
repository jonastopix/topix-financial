/**
 * Enhedstests for indgangsMail.ts — layoutet og de fem mailtekster.
 *
 * KØRES I HÅNDEN:
 *   deno test supabase/functions/_shared/indgangsMail_test.ts
 * Intet workflow kører `deno test` (målt 2/9: grep i .github giver nul
 * træf), og filen kan ikke køres af vitest, fordi indgangsMail.ts
 * importerer emailButtonHelpers.ts med Deno-sti. Samme situation som
 * edgeFunctionAuth_test.ts.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dag0Mail,
  dag14Mail,
  dag25Mail,
  dag31Mail,
  formatKr,
  indgangsMailHtml,
  raadgiverManglerPrisMail,
  tiltale,
} from "./indgangsMail.ts";

const URL = "https://app.theboardroom.dk/betal?token=abc-123";

const assertIkkeIndeholder = (html: string, tekst: string) =>
  assert(!html.includes(tekst), `Forventede IKKE «${tekst}» i html`);

// ── Layoutet ─────────────────────────────────────────────────────────

Deno.test("layout: header siger The Boardroom — uden by Topix", () => {
  const html = indgangsMailHtml({ overskrift: "Hej,", afsnit: ["x"], hilsen: "H" });
  assertStringIncludes(html, ">The Boardroom</span>");
  assertIkkeIndeholder(html, "by Topix");
  assertIkkeIndeholder(html, "Topix");
});

Deno.test("layout: familie A's farver og kort", () => {
  const html = indgangsMailHtml({ overskrift: "Hej,", afsnit: ["x"], hilsen: "H" });
  for (const s of ["#f4f4f5", "#ffffff", "border-radius:10px", "#133332", "height:3px;background-color:#27AE82", "#4D6663", "font-size:20px;font-weight:700"]) {
    assertStringIncludes(html, s);
  }
});

Deno.test("layout: footer uden «Ignorer denne besked»", () => {
  const html = indgangsMailHtml({ overskrift: "Hej,", afsnit: ["x"], hilsen: "H" });
  assertStringIncludes(html, "The Boardroom · theboardroom.dk");
  assertIkkeIndeholder(html, "Ignorer denne besked");
});

Deno.test("layout: knap bygges med bulletproofButton + fallbackLinkBlock", () => {
  const html = indgangsMailHtml({
    overskrift: "Hej,",
    afsnit: ["x"],
    knap: { tekst: "Gå til betaling", url: URL },
    hilsen: "H",
  });
  assertStringIncludes(html, "<v:roundrect"); // Outlook-VML fra bulletproofButton
  assertStringIncludes(html, `href="${URL}"`);
  assertStringIncludes(html, ">Gå til betaling</a>");
  assertStringIncludes(html, "Virker knappen ikke?"); // fallbackLinkBlock
});

Deno.test("layout: uden knap — ingen roundrect, ingen fallback-linje", () => {
  const html = indgangsMailHtml({ overskrift: "Hej,", afsnit: ["x"], hilsen: "H" });
  assertIkkeIndeholder(html, "<v:roundrect");
  assertIkkeIndeholder(html, "Virker knappen ikke?");
});

Deno.test("layout: tekst escapes, linjeskift i hilsen bliver <br>", () => {
  const html = indgangsMailHtml({
    overskrift: "Kære <Lisbeth>,",
    afsnit: ["Smith & Co"],
    hilsen: "Venlig hilsen\nMorten Larsen",
  });
  assertStringIncludes(html, "Kære &lt;Lisbeth&gt;,");
  assertStringIncludes(html, "Smith &amp; Co");
  assertStringIncludes(html, "Venlig hilsen<br>Morten Larsen");
  assertIkkeIndeholder(html, "<Lisbeth>");
});

// ── Hjælperne ────────────────────────────────────────────────────────

Deno.test("tiltale: med og uden fornavn — aldrig «Kære ,»", () => {
  assertEquals(tiltale("Kære", "Lisbeth"), "Kære Lisbeth,");
  assertEquals(tiltale("Hej", "  Lisbeth "), "Hej Lisbeth,");
  assertEquals(tiltale("Kære", null), "Kære,");
  assertEquals(tiltale("Kære", undefined), "Kære,");
  assertEquals(tiltale("Kære", ""), "Kære,");
  assertEquals(tiltale("Kære", "   "), "Kære,");
});

Deno.test("formatKr: dansk tusindtalsadskiller, hele kroner", () => {
  assertEquals(formatKr(50000), "50.000");
  assertEquals(formatKr(40000), "40.000");
  assertEquals(formatKr(52500), "52.500");
  assertEquals(formatKr(999), "999");
  assertEquals(formatKr(1234567), "1.234.567");
  assertEquals(formatKr(50000.4), "50.000");
});

// ── De fem mails ─────────────────────────────────────────────────────

const fuld = { fornavn: "Lisbeth", betalingsUrl: URL, fristDato: "2. oktober 2026", beloebKr: 50000 };

Deno.test("dag 0: subject, tiltale, knap, frist og faktura-konsekvens", () => {
  const m = dag0Mail(fuld);
  assertEquals(m.subject, "Velkommen i The Boardroom — sådan kommer du i gang");
  assertStringIncludes(m.html, "Kære Lisbeth,");
  assertStringIncludes(m.html, "Det er en stor fornøjelse at kunne byde dig velkommen i The Boardroom.");
  assertStringIncludes(m.html, "vælg, om du vil betale på én gang eller fordelt over flere rater");
  assertStringIncludes(m.html, ">Gå til betaling</a>");
  assertStringIncludes(m.html, `href="${URL}"`);
  assertStringIncludes(m.html, "Har du ikke betalt inden 2. oktober 2026, sender vi automatisk en faktura på det fulde beløb.");
  assertStringIncludes(m.html, "Jeg glæder mig til at komme i gang sammen med dig.");
  assertStringIncludes(m.html, "Venlig hilsen<br>Morten Larsen");
});

Deno.test("dag 14: subject, to uger, knap", () => {
  const m = dag14Mail({ fornavn: "Lisbeth", betalingsUrl: URL });
  assertEquals(m.subject, "Din plads står klar");
  assertStringIncludes(m.html, "Hej Lisbeth,");
  assertStringIncludes(m.html, "Det er to uger siden, du skrev under — og din plads i The Boardroom står klar.");
  assertStringIncludes(m.html, "Du aktiverer dit medlemskab ved at betale. Så er du inde med det samme.");
  assertStringIncludes(m.html, ">Gå til betaling</a>");
  assertStringIncludes(m.html, "Har du spørgsmål, er jeg kun en mail væk.");
});

Deno.test("dag 25: subject, frist som dato, beløb med punktum, knap", () => {
  const m = dag25Mail(fuld);
  assertEquals(m.subject, "Fem dage til din frist");
  assertStringIncludes(m.html, "Hej Lisbeth,");
  assertStringIncludes(m.html, "fristen for at aktivere dit medlemskab er 2. oktober 2026 — om fem dage.");
  assertStringIncludes(m.html, "en faktura på det fulde beløb, 50.000 kr.");
  assertStringIncludes(m.html, "Vil du betale i rater, skal du bruge linket ovenfor inden fristen.");
  assertStringIncludes(m.html, "Jeg vil hellere høre fra dig end sende en faktura.");
  assertStringIncludes(m.html, ">Gå til betaling</a>");
});

Deno.test("dag 31: subject, beløb, Stripe — og INGEN knap", () => {
  const m = dag31Mail({ fornavn: "Lisbeth", beloebKr: 40000 });
  assertEquals(m.subject, "Din faktura til The Boardroom");
  assertStringIncludes(m.html, "Hej Lisbeth,");
  assertStringIncludes(m.html, "har vi sendt dig en faktura på 40.000 kr. Du finder den i en separat mail fra Stripe.");
  assertStringIncludes(m.html, "Din plads står stadig klar — betal fakturaen, så åbner vi din adgang.");
  assertStringIncludes(m.html, "Er der noget vi skal tale om, så ring eller skriv. Vi tager den gerne.");
  assertIkkeIndeholder(m.html, "<v:roundrect");
  assertIkkeIndeholder(m.html, "Gå til betaling");
  assertIkkeIndeholder(m.html, "Virker knappen ikke?");
});

Deno.test("rådgivermailen: virksomhed, CVR, kontakt, dato, id, /members-knap, ikke-sendt-besked", () => {
  const m = raadgiverManglerPrisMail({
    virksomhed: "Nordic By Hand ApS",
    cvr: "46415124",
    kontakt: "Lisbeth Gade",
    godkendtDato: "2. september 2026",
    companyId: "0f0f0f0f-0000-4000-8000-000000000001",
  });
  assertEquals(m.subject, "Nordic By Hand ApS mangler et prisniveau");
  assertStringIncludes(m.html, "Nordic By Hand ApS (CVR 46415124) blev godkendt 2. september 2026");
  assertStringIncludes(m.html, "Kontakt: Lisbeth Gade.");
  assertStringIncludes(m.html, "Betalingsmailen er IKKE sendt");
  assertStringIncludes(m.html, "sendes betalingsmailen automatisk");
  assertStringIncludes(m.html, ">Åbn i platformen</a>");
  assertStringIncludes(m.html, 'href="https://app.theboardroom.dk/members"');
  assertStringIncludes(m.html, "Virksomheds-id: 0f0f0f0f-0000-4000-8000-000000000001");
});

Deno.test("rådgivermailen: manglende CVR og kontakt bliver «ukendt»", () => {
  const m = raadgiverManglerPrisMail({
    virksomhed: "Test ApS",
    cvr: null,
    kontakt: "",
    godkendtDato: "i dag",
    companyId: "x",
  });
  assertStringIncludes(m.html, "(CVR ukendt)");
  assertStringIncludes(m.html, "Kontakt: ukendt.");
});

// ── Tværgående ───────────────────────────────────────────────────────

Deno.test("fornavn mangler → ingen «Kære ,» / «Hej ,» og ingen dobbelte mellemrum i teksten", () => {
  const mails = [
    dag0Mail({ ...fuld, fornavn: null }),
    dag14Mail({ fornavn: undefined, betalingsUrl: URL }),
    dag25Mail({ ...fuld, fornavn: "" }),
    dag31Mail({ fornavn: "  ", beloebKr: 50000 }),
  ];
  assertStringIncludes(mails[0].html, "Kære,");
  assertStringIncludes(mails[1].html, "Hej,");
  for (const m of mails) {
    assertIkkeIndeholder(m.html, "Kære ,");
    assertIkkeIndeholder(m.html, "Hej ,");
    // Dobbelte mellemrum i synlig tekst (uden for tags og indrykning).
    const tekst = m.html.replace(/<[^>]+>/g, "").replace(/\n\s*/g, "\n");
    assertIkkeIndeholder(tekst, "  ");
  }
});

Deno.test("ingen af de fem indeholder «by Topix»", () => {
  const mails = [
    dag0Mail(fuld),
    dag14Mail({ fornavn: "L", betalingsUrl: URL }),
    dag25Mail(fuld),
    dag31Mail({ fornavn: "L", beloebKr: 1 }),
    raadgiverManglerPrisMail({ virksomhed: "V", cvr: "1", kontakt: "K", godkendtDato: "d", companyId: "id" }),
  ];
  for (const m of mails) {
    assertIkkeIndeholder(m.html, "by Topix");
    assertIkkeIndeholder(m.subject, "Topix");
    assert(m.subject.length > 0);
    assertStringIncludes(m.html, "<!DOCTYPE html>");
  }
});

Deno.test("betalingsmodellen nævnes ikke (§9): ingen «rate12», «fuld» eller «rate2» i teksterne", () => {
  for (const m of [dag0Mail(fuld), dag14Mail({ fornavn: "L", betalingsUrl: URL }), dag25Mail(fuld), dag31Mail({ fornavn: "L", beloebKr: 1 })]) {
    const tekst = m.html.replace(/<[^>]+>/g, "");
    for (const s of ["rate12", "rate2", "fuld betaling"]) assertIkkeIndeholder(tekst, s);
  }
});
