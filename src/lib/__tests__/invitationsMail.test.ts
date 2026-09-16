/**
 * Invitationsmailen i husets form (14/9 2026) — de rene dele:
 * invitationsMail / invitationsMailSkabelon / udfyldPladsholdere
 * (_shared/invitationsMail.ts) og skabelonvalget (_shared/invitationsSkabelonvalg.ts).
 *
 * Låser de fire tekstrettelser (by Topix, «Ignorer denne besked…», «hvilken
 * som helst e-mail», hardkodet «The Boardroom» som virksomhed), at begge
 * pladsholdere udfyldes, og at hver af de fire fallback-årsager vælger
 * fallback og logger sin årsag.
 */
import { describe, expect, it } from "vitest";
import {
  foersteAfsnit,
  invitationsMail,
  invitationsMailSkabelon,
  invitationsVaerdier,
  KONTAKT_ADRESSE,
  PLADSHOLDER_LINK,
  PLADSHOLDER_VIRKSOMHED,
  TAK_FOR_BETALING,
  udfyldPladsholdere,
} from "../../../supabase/functions/_shared/invitationsMail.ts";
import {
  afgoerSkabelonvalg,
  SKABELON_NAVN,
  skabelonvalgLogtekst,
  skabelonvalgMetadata,
  type SkabelonRaekke,
} from "../../../supabase/functions/_shared/invitationsSkabelonvalg.ts";

/** Ren tekst af mailen, som en modtager læser den — tags og entities væk. */
const tekstAf = (html: string) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const raekke = (overrides: Partial<SkabelonRaekke> = {}): SkabelonRaekke => ({
  id: "11111111-1111-1111-1111-111111111111",
  subject: "Emne fra rækken {{company_name}}",
  body_html: "<p>{{company_name}} {{signup_url}}</p>",
  sender_name: "The Boardroom",
  sender_email: "noreply@theboardroom.dk",
  enabled: true,
  ...overrides,
});

describe("invitationsMail — de fire sætninger er væk (hele ordet/sætningen)", () => {
  const skabelon = invitationsMailSkabelon(true);
  const alt = `${skabelon.subject}\n${skabelon.html}`;

  it("«by Topix» står ikke i headeren", () => {
    expect(alt).not.toMatch(/\bby Topix\b/);
    expect(alt).not.toMatch(/\bTopix\b/);
  });

  it("«Ignorer denne besked hvis du ikke forventer den» står ikke i footeren", () => {
    expect(alt).not.toMatch(/\bIgnorer denne besked\b/);
    expect(alt).not.toMatch(/\bforventer den\b/);
  });

  it("«Du kan oprette dig med en hvilken som helst e-mail» er væk — teksten siger det der sker (adressen står udfyldt)", () => {
    expect(alt).not.toMatch(/\bhvilken som helst\b/);
    const tekst = tekstAf(skabelon.html);
    expect(tekst).toContain("Opret dig med den e-mailadresse, denne mail er sendt til.");
    expect(tekst).toContain("Den står allerede udfyldt, når du åbner linket.");
  });

  it("virksomheden er {{company_name}} og omtales som medlemmets egen — ikke «en del af The Boardroom»", () => {
    expect(skabelon.html).toContain(PLADSHOLDER_VIRKSOMHED);
    const tekst = tekstAf(skabelon.html);
    expect(tekst).not.toMatch(/\ben del af\b/);
    expect(tekst).not.toMatch(/\btilknyttet\b/);
    expect(tekst).toContain("Adgangen er til {{company_name}}: det er din virksomhed og dine tal, vi arbejder med.");
  });
});

// Takken (16/9, mangellisten m16-invitation-tak): «Tak for din betaling.» er
// kun sand efter Stripe-vejen. Importen, rådgiverens Gensend/Inviter og
// medlemmets «Teamet» får afsnittet uden den — alt andet er ens.
describe("invitationsMail — «Tak for din betaling.» kun når der ER betalt", () => {
  const MED = "Tak for din betaling. Din plads i The Boardroom er klar, og du opretter dit login herunder.";
  const UDEN = "Din plads i The Boardroom er klar, og du opretter dit login herunder.";

  it("foersteAfsnit: sand → med takken; falsk → ordret uden", () => {
    expect(TAK_FOR_BETALING).toBe("Tak for din betaling.");
    expect(foersteAfsnit(true)).toBe(MED);
    expect(foersteAfsnit(false)).toBe(UDEN);
  });

  it("efterBetaling: true → mailen som i dag (takken står som første afsnit)", () => {
    const tekst = tekstAf(invitationsMailSkabelon(true).html);
    expect(tekst).toContain(MED);
    expect(tekst.indexOf("Tak for din betaling.")).toBeLessThan(tekst.indexOf("Adgangen er til"));
  });

  it("efterBetaling: false → samme mail uden «Tak for din betaling.» — og ordet «betaling» står ingen steder", () => {
    const m = invitationsMailSkabelon(false);
    const tekst = tekstAf(m.html);
    expect(tekst).toContain(UDEN);
    expect(tekst).not.toContain("Tak for din betaling");
    expect(`${m.subject}\n${m.html}`).not.toMatch(/betal/i);
  });

  it("de to udgaver er ens på alt andet: emne, virksomhed, knap, kontaktlinje, hilsen — kun takken skiller", () => {
    const med = invitationsMailSkabelon(true);
    const uden = invitationsMailSkabelon(false);
    expect(uden.subject).toBe(med.subject);
    expect(uden.html).toBe(med.html.replace(`${TAK_FOR_BETALING} `, ""));
    for (const linje of [
      "Adgangen er til {{company_name}}: det er din virksomhed og dine tal, vi arbejder med.",
      "Opret dig med den e-mailadresse, denne mail er sendt til. Den står allerede udfyldt, når du åbner linket.",
      "Går der noget galt undervejs, så skriv til kontakt@theboardroom.dk.",
    ]) {
      expect(tekstAf(uden.html)).toContain(linje);
    }
    expect(uden.html).toContain(">Opret dit login</a>");
    expect(uden.html).toContain("Venlig hilsen<br>Morten Larsen");
  });

  it("invitationsMail kræver valget — begge udgaver med navn", () => {
    expect(tekstAf(invitationsMail({ virksomhed: "X", signupUrl: "https://x", fornavn: "Lisbeth", efterBetaling: false }).html)).not.toContain("Tak for din betaling");
    expect(tekstAf(invitationsMail({ virksomhed: "X", signupUrl: "https://x", fornavn: "Lisbeth", efterBetaling: true }).html)).toContain("Tak for din betaling.");
  });
});

describe("invitationsMail — husets form", () => {
  const skabelon = invitationsMailSkabelon(true);

  it("emnet og overskriften: ingen salg, tiltalen uden navn er «Hej,» — aldrig «Hej ,»", () => {
    expect(skabelon.subject).toBe("Din adgang til The Boardroom er klar");
    expect(skabelon.html).toContain(">Hej,</h1>");
    expect(skabelon.html).not.toContain("Hej ,");
    expect(invitationsMail({ virksomhed: "X", signupUrl: "https://x", fornavn: "Lisbeth", efterBetaling: true }).html).toContain(">Hej Lisbeth,</h1>");
  });

  it("headeren siger kun «The Boardroom», footeren kun «The Boardroom · theboardroom.dk», underskrift Morten Larsen", () => {
    expect(skabelon.html).toContain(">The Boardroom</span>");
    expect(skabelon.html).toContain(">The Boardroom · theboardroom.dk</p>");
    expect(skabelon.html).toContain("Venlig hilsen<br>Morten Larsen");
  });

  it("knappen «Opret dit login» bærer {{signup_url}} — i VML, i <a> og i fallback-linjen", () => {
    expect(skabelon.html).toContain(">Opret dit login</a>");
    expect(skabelon.html).toContain(`href="${PLADSHOLDER_LINK}"`);
    expect(skabelon.html).toContain("Virker knappen ikke? Kopiér dette link ind i din browser:");
    expect(skabelon.html.split(PLADSHOLDER_LINK).length - 1).toBeGreaterThanOrEqual(3);
  });

  it("linjen efter knappen nævner kontakt@theboardroom.dk — og lover ikke et svar på noreply («skriv til mig»)", () => {
    expect(KONTAKT_ADRESSE).toBe("kontakt@theboardroom.dk");
    const tekst = tekstAf(skabelon.html);
    expect(tekst).toContain("Går der noget galt undervejs, så skriv til kontakt@theboardroom.dk.");
    expect(`${skabelon.subject}\n${skabelon.html}`).not.toMatch(/\bskriv til mig\b/);
    expect(`${skabelon.subject}\n${skabelon.html}`).not.toMatch(/\bsvar på denne mail\b/);
  });

  it("teksten er kort: tre afsnit, én linje efter knappen", () => {
    const afsnit = skabelon.html.match(/<p style="color:#4D6663;font-size:14px[^"]*">/g) ?? [];
    // 3 afsnit + 1 efterKnap + 1 hilsen = 5 brødtekst-<p>
    expect(afsnit.length).toBe(5);
  });
});

describe("udfyldPladsholdere — begge pladsholdere udfyldes, ingen bliver stående", () => {
  const vaerdier = { company_name: "Floor1 ApS", signup_url: "https://app.theboardroom.dk/auth?mode=signup&invite=abc" };

  it("fallbacken: {{company_name}} og {{signup_url}} udfyldes i html og emne, og intet {{ står tilbage", () => {
    const skabelon = invitationsMailSkabelon(true);
    const html = udfyldPladsholdere(skabelon.html, vaerdier);
    const subject = udfyldPladsholdere(skabelon.subject, vaerdier);
    expect(html).toContain("Adgangen er til Floor1 ApS:");
    expect(html).toContain(`href="${vaerdier.signup_url}"`);
    expect(html).not.toContain("{{");
    expect(subject).not.toContain("{{");
    expect(html).not.toContain(PLADSHOLDER_VIRKSOMHED);
    expect(html).not.toContain(PLADSHOLDER_LINK);
  });

  it("alle forekomster erstattes, også flere af samme nøgle", () => {
    expect(udfyldPladsholdere("{{a}} og {{a}} og {{b}}", { a: "1", b: "2" })).toBe("1 og 1 og 2");
  });

  it("ukendte pladsholdere røres ikke — de er kalderens sag at opdage", () => {
    expect(udfyldPladsholdere("{{a}} {{ukendt}}", { a: "1" })).toBe("1 {{ukendt}}");
  });
});

describe("invitationsVaerdier — company_name escapes i HTML, aldrig i emnet; signup_url aldrig", () => {
  const navn = 'Bang & Olufsen <"B&O"> A/S';
  const url = "https://app.theboardroom.dk/auth?mode=signup&invite=abc-123";

  it("et navn med & < > \" bliver escapet i HTML-sættet og står råt i emne-sættet", () => {
    const v = invitationsVaerdier({ companyName: navn, signupUrl: url });
    expect(v.tilHtml.company_name).toBe("Bang &amp; Olufsen &lt;&quot;B&amp;O&quot;&gt; A/S");
    expect(v.tilEmne.company_name).toBe(navn);
  });

  it("navnet ødelægger ikke HTML'en: ingen rå < eller \" fra navnet, og alle <p> lukkes", () => {
    const v = invitationsVaerdier({ companyName: navn, signupUrl: url });
    const html = udfyldPladsholdere(invitationsMailSkabelon(true).html, v.tilHtml);
    expect(html).toContain("Adgangen er til Bang &amp; Olufsen &lt;&quot;B&amp;O&quot;&gt; A/S:");
    expect(html).not.toContain('<"B&O">');
    expect(html).not.toContain("Adgangen er til Bang & ");
    expect((html.match(/<p\b/g) ?? []).length).toBe((html.match(/<\/p>/g) ?? []).length);
    // Læst som tekst står navnet som skrevet — escapingen er kun for HTML'en.
    expect(tekstAf(html)).toContain('Adgangen er til Bang & Olufsen <"B&O"> A/S:');
  });

  it("signup_url står uescapet i href, i VML-href og i den synlige fallback-linje — & bliver ikke &amp;", () => {
    const v = invitationsVaerdier({ companyName: navn, signupUrl: url });
    expect(v.tilHtml.signup_url).toBe(url);
    expect(v.tilEmne.signup_url).toBe(url);
    const html = udfyldPladsholdere(invitationsMailSkabelon(true).html, v.tilHtml);
    expect(html).toContain(`<a href="${url}" target="_blank"`);
    expect(html).toContain(`href="${url}" style="height:44px`);
    expect(html).toContain(`>${url}</a>`);
    expect(html).not.toContain("invite=abc-123&amp;");
    expect(html).not.toContain("mode=signup&amp;invite");
  });

  it("emnet får det rå navn — «&amp;» hører ikke hjemme i en emnelinje (rammer DB-skabelonens subject)", () => {
    const v = invitationsVaerdier({ companyName: navn, signupUrl: url });
    expect(udfyldPladsholdere("Velkommen, {{company_name}}", v.tilEmne)).toBe('Velkommen, Bang & Olufsen <"B&O"> A/S');
  });
});

describe("afgoerSkabelonvalg — hver af de fire årsager vælger fallback og logger sin årsag", () => {
  it("opslagsfejl → fallback (opslagsfejl) med kode og besked i loggen", () => {
    const valg = afgoerSkabelonvalg({ raekker: null, fejl: { message: "permission denied", code: "42501" } });
    expect(valg).toEqual({ vej: "fallback", aarsag: "opslagsfejl", detalje: "42501: permission denied" });
    expect(skabelonvalgLogtekst(valg)).toBe("[send-invitation-email] skabelonvalg: fallback (opslagsfejl — 42501: permission denied)");
    expect(skabelonvalgMetadata(valg)).toEqual({ skabelonvalg: "fallback", skabelon_id: null, fallback_aarsag: "opslagsfejl" });
  });

  it("fejl vinder over data — også hvis begge er sat", () => {
    const valg = afgoerSkabelonvalg({ raekker: [raekke()], fejl: { message: "x" } });
    expect(valg.vej).toBe("fallback");
    expect(valg.vej === "fallback" && valg.aarsag).toBe("opslagsfejl");
    expect(skabelonvalgLogtekst(valg)).toContain("(opslagsfejl — x)");
  });

  it("ingen række (null eller tom liste) → fallback (ingen_raekke)", () => {
    for (const raekker of [null, []]) {
      const valg = afgoerSkabelonvalg({ raekker, fejl: null });
      expect(valg).toEqual({ vej: "fallback", aarsag: "ingen_raekke", detalje: null });
      expect(skabelonvalgLogtekst(valg)).toBe("[send-invitation-email] skabelonvalg: fallback (ingen_raekke)");
      expect(skabelonvalgMetadata(valg).fallback_aarsag).toBe("ingen_raekke");
    }
  });

  it("flere rækker → fallback (flere_raekker) — også når alle er enabled; antallet står i loggen", () => {
    const valg = afgoerSkabelonvalg({ raekker: [raekke(), raekke({ id: "22222222-2222-2222-2222-222222222222" })], fejl: null });
    expect(valg.vej).toBe("fallback");
    expect(valg.vej === "fallback" && valg.aarsag).toBe("flere_raekker");
    expect(skabelonvalgLogtekst(valg)).toBe(`[send-invitation-email] skabelonvalg: fallback (flere_raekker — 2 rækker med navnet «${SKABELON_NAVN}»)`);
    expect(skabelonvalgMetadata(valg).fallback_aarsag).toBe("flere_raekker");
  });

  it("én række med enabled=false (prod 14/9) → fallback (enabled_false) med rækkens id i loggen", () => {
    const valg = afgoerSkabelonvalg({ raekker: [raekke({ enabled: false })], fejl: null });
    expect(valg).toEqual({ vej: "fallback", aarsag: "enabled_false", detalje: "række 11111111-1111-1111-1111-111111111111" });
    expect(skabelonvalgLogtekst(valg)).toBe("[send-invitation-email] skabelonvalg: fallback (enabled_false — række 11111111-1111-1111-1111-111111111111)");
    expect(skabelonvalgMetadata(valg)).toEqual({ skabelonvalg: "fallback", skabelon_id: null, fallback_aarsag: "enabled_false" });
  });

  it("én række med enabled=true → skabelon, rækken bæres med, og loggen siger skabelon", () => {
    const r = raekke();
    const valg = afgoerSkabelonvalg({ raekker: [r], fejl: null });
    expect(valg).toEqual({ vej: "skabelon", raekke: r });
    expect(skabelonvalgLogtekst(valg)).toBe(`[send-invitation-email] skabelonvalg: skabelon (række ${r.id}, «${SKABELON_NAVN}» enabled=true)`);
    expect(skabelonvalgMetadata(valg)).toEqual({ skabelonvalg: "skabelon", skabelon_id: r.id, fallback_aarsag: null });
  });

  it("enabled skal være præcis true — null/undefined regnes som slået fra", () => {
    const valg = afgoerSkabelonvalg({ raekker: [raekke({ enabled: null as unknown as boolean })], fejl: null });
    expect(valg.vej === "fallback" && valg.aarsag).toBe("enabled_false");
  });
});
