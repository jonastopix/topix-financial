import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9 2026): invitationen kan sige «spærret». Lovable spærrer en
// adresse for alle app-mails efter afmelding, bounce eller klage, og
// send-invitation-email svarede før 200 { success: true } — identisk med
// sendt — så fire kaldere meldte «sendt» (recon-invitation-spaerret.md).
// Syv steder skal holde, læst i kilden, fordi de rører Supabase/npm eller
// er React og ikke kan køres rent i vitest:
//   1. send-invitation-email: i den ikke-sendte gren (efter throw-linjen
//      mailFejl.guard låser) svares spaerret: true, og «Enqueued» logges
//      IKKE dér; den sendte gren svarer spaerret: false.
//   2. sikrIndgangsInvitation læser data?.spaerret fra invoke og
//      returnerer { udfald: "spaerret", email }.
//   3. stripe-webhooks meldInvitationsUdfald kalder meldSpaerretMail med
//      label "invitation" FØR beskedVedInvitationsUdfald (hvis type-kopi i
//      raadgiverBeskedTekst.ts ikke kender varianten) og returnerer.
//   4. import-application sender invitation_spaerret i svaret.
//   5. gensendInvitation (src/hooks/invitationer.ts) returnerer { spaerret }.
//   6. HbInvitationer viser advarslen ved spaerret — gensend OG inviter.
//   7. CompanyInvitations (medlemmets «Teamet») læser data og viser advarslen.
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører de
// samme domme på kopier med fejlen indsat (spaerretMail.guard-mønstret).

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FUNKTION = "supabase/functions/send-invitation-email/index.ts";
const SIKR = "supabase/functions/_shared/sikrIndgangsInvitation.ts";
const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";
const IMPORT = "supabase/functions/import-application/index.ts";
const HOOK = "src/hooks/invitationer.ts";
const HB = "src/components/hjemmebane/virksomheder/HbInvitationer.tsx";
const GAMMEL = "src/components/CompanyInvitations.tsx";

/** Kroppen fra `signatur` frem til første `}` i kolonne 0. */
export function blok(kilde: string, signatur: string): string {
  const start = kilde.indexOf(signatur);
  if (start === -1) throw new Error(`fandt ikke \`${signatur}\``);
  const slut = kilde.indexOf("\n}", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 2);
}

const THROW_LINJE = "if (!resultat.sent && resultat.reason !== 'recipient_suppressed') {";

/** 1. send-invitation-email: EFTER throw-linjen står `if (!resultat.sent) {` med
    `spaerret: true` i svaret og uden «Enqueued»; det sendte svar bærer `spaerret: false`. */
export function svarerSpaerretIDenIkkeSendteGren(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const kast = k.indexOf(THROW_LINJE);
  if (kast === -1) return false;
  const gren = k.indexOf("if (!resultat.sent) {", kast + THROW_LINJE.length);
  if (gren === -1) return false;
  const grenSlut = k.indexOf("\n    }", gren);
  if (grenSlut === -1) return false;
  const grenTekst = k.slice(gren, grenSlut);
  const efter = k.slice(grenSlut);
  return (
    grenTekst.includes("spaerret: true") &&
    grenTekst.includes("status: 200") &&
    !grenTekst.includes("Enqueued") &&
    efter.includes("spaerret: false") &&
    efter.includes("Enqueued invitation for")
  );
}

/** 2. sikrIndgangsInvitation: typen bærer varianten; invoke-svarets data læses,
    og `spaerret === true` giver udfaldet «spaerret» med invitationEmail. */
export function sikrLaeserSpaerret(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const hoved = blok(k, "export async function sikrIndgangsInvitation(");
  return (
    k.includes('| { udfald: "spaerret"; email: string }') &&
    hoved.includes('const { data: emailData, error: emailErr } = await adminClient.functions.invoke("send-invitation-email"') &&
    hoved.includes("?.spaerret === true") &&
    hoved.includes('return { udfald: "spaerret", email: invitationEmail };') &&
    hoved.indexOf('return { udfald: "spaerret", email: invitationEmail };') < hoved.indexOf('return { udfald: "sendt", email: invitationEmail };')
  );
}

/** 3. meldInvitationsUdfald: `if (udfald.udfald === "spaerret") {` med
    meldSpaerretMail(label "invitation") og return — FØR beskedVedInvitationsUdfald({. */
export function meldInvitationsUdfaldMelderSpaerret(kilde: string): boolean {
  const krop = blok(udenKommentarer(kilde), "async function meldInvitationsUdfald(");
  const gren = krop.indexOf('if (udfald.udfald === "spaerret") {');
  const besked = krop.indexOf("beskedVedInvitationsUdfald({");
  if (gren === -1 || besked === -1 || gren > besked) return false;
  const grenTekst = krop.slice(gren, besked);
  return (
    grenTekst.includes('await meldSpaerretMail(adminClient, { label: "invitation", companyId, modtager: udfald.email });') &&
    /modtager: udfald\.email \}\);\s*return;/.test(grenTekst) &&
    krop.includes("try {")
  );
}

/** 4. import-application: invoke-svarets data læses, og svaret bærer invitation_spaerret. */
export function importSenderInvitationSpaerret(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    k.includes('const { data: emailData, error: emailErr } = await adminClient.functions.invoke("send-invitation-email"') &&
    k.includes("?.spaerret === true") &&
    k.includes("invitation_spaerret: invitationSpaerret,") &&
    k.includes("email_sent: !emailErr,")
  );
}

/** 5. gensendInvitation returnerer { spaerret: data?.spaerret === true }, og opretInvitation sender det videre. */
export function gensendReturnererSpaerret(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const gensend = blok(k, "export async function gensendInvitation(");
  const opret = blok(k, "export async function opretInvitation(");
  return (
    gensend.includes("Promise<{ spaerret: boolean }>") &&
    gensend.includes("return { spaerret: data?.spaerret === true };") &&
    opret.includes("const { spaerret } = await gensendInvitation(email);") &&
    opret.includes("return { gensendt, spaerret };")
  );
}

/** 6. HbInvitationer: advarslen findes med klokkens ord og 15 s, og bruges ved
    spaerret på BEGGE veje (gensend-knappen og inviter-mutationen). */
export function hbInvitationerViserAdvarsel(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const advarsler = k.match(/spaerretAdvarsel\(/g) ?? [];
  return (
    k.includes('toast.warning("Invitationen blev ikke leveret", {') &&
    k.includes("er spærret hos mailudbyderen (afmeldt, bounce eller klage). Kontakt dem direkte og få en adresse der virker.") &&
    k.includes("duration: 15000") &&
    k.includes("if (r.spaerret) spaerretAdvarsel(inv.email);") &&
    k.includes("if (r.spaerret) spaerretAdvarsel(email.trim());") &&
    k.includes("const spaerretAdvarsel = (email: string) =>") &&
    advarsler.length >= 2 // to kald: gensend-knappen og inviter-mutationen
  );
}

/** 7. CompanyInvitations: invoke-svarets data læses, og spaerret giver advarslen. */
export function companyInvitationsViserAdvarsel(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    k.includes('const { data: emailData } = await supabase.functions.invoke("send-invitation-email"') &&
    k.includes("if (emailData?.spaerret === true) {") &&
    k.includes('toast.warning("Invitationen blev ikke leveret", {') &&
    k.includes("tager ikke imod mails fra platformen. Bed personen om en anden adresse.") &&
    k.includes("duration: 15000")
  );
}

describe("invitationSpaerret.guard — de syv steder holder", () => {
  it("1. send-invitation-email svarer spaerret: true i den ikke-sendte gren, uden «Enqueued»; sendt svarer spaerret: false", () => {
    const k = laes(FUNKTION);
    expect(svarerSpaerretIDenIkkeSendteGren(k)).toBe(true);
    // Throw-linjen står uændret (mailFejl.guard låser den).
    expect(udenKommentarer(k)).toContain(THROW_LINJE);
  });
  it("2. sikrIndgangsInvitation læser data?.spaerret og returnerer «spaerret»", () => {
    expect(sikrLaeserSpaerret(laes(SIKR))).toBe(true);
  });
  it("3. meldInvitationsUdfald kalder meldSpaerretMail (label invitation) før beskedVedInvitationsUdfald", () => {
    const k = laes(WEBHOOK);
    expect(meldInvitationsUdfaldMelderSpaerret(k)).toBe(true);
    // raadgiverBeskedTekst.ts røres ikke: kopien kender ikke varianten.
    expect(udenKommentarer(laes("supabase/functions/_shared/raadgiverBeskedTekst.ts"))).not.toContain('"spaerret"');
  });
  it("4. import-application sender invitation_spaerret", () => {
    expect(importSenderInvitationSpaerret(laes(IMPORT))).toBe(true);
  });
  it("5. gensendInvitation returnerer spaerret, og opretInvitation sender det videre", () => {
    expect(gensendReturnererSpaerret(laes(HOOK))).toBe(true);
  });
  it("6. HbInvitationer viser advarslen ved spaerret — gensend og inviter", () => {
    expect(hbInvitationerViserAdvarsel(laes(HB))).toBe(true);
  });
  it("7. CompanyInvitations læser svaret og viser advarslen", () => {
    expect(companyInvitationsViserAdvarsel(laes(GAMMEL))).toBe(true);
  });
});

describe("invitationSpaerret.guard — VÆRNET VIRKER (dommene på kopier med fejlen indsat)", () => {
  it("1. spaerret fjernet fra svaret, eller «Enqueued» logget i den spærrede gren → falsk", () => {
    const k = laes(FUNKTION);
    expect(svarerSpaerretIDenIkkeSendteGren(k.replace("spaerret: true, ", ""))).toBe(false);
    expect(svarerSpaerretIDenIkkeSendteGren(k.replace("er spærret hos mailudbyderen — intet sendt", "Enqueued invitation for"))).toBe(false);
    expect(svarerSpaerretIDenIkkeSendteGren(k.replace("spaerret: false, ", ""))).toBe(false);
    // Grenen helt væk (som før 16/9): kun throw-linjen og «Enqueued».
    const udenGren = k.replace(/\n    if \(!resultat\.sent\) \{[\s\S]*?\n    \}\n/, "\n");
    expect(udenKommentarer(udenGren)).not.toContain("spaerret: true"); // filhovedets kommentar nævner ordene
    expect(svarerSpaerretIDenIkkeSendteGren(udenGren)).toBe(false);
  });
  it("2. data læses ikke, eller «spaerret» returneres ikke → falsk", () => {
    const k = laes(SIKR);
    expect(sikrLaeserSpaerret(k.replace("const { data: emailData, error: emailErr }", "const { error: emailErr }"))).toBe(false);
    expect(sikrLaeserSpaerret(k.replace('return { udfald: "spaerret", email: invitationEmail };', 'return { udfald: "sendt", email: invitationEmail };'))).toBe(false);
    expect(sikrLaeserSpaerret(k.replace('| { udfald: "spaerret"; email: string }\n', ""))).toBe(false);
  });
  it("3. meldSpaerretMail-kaldet fjernet, flyttet efter beskedVedInvitationsUdfald, eller uden return → falsk", () => {
    const k = laes(WEBHOOK);
    const kald = 'await meldSpaerretMail(adminClient, { label: "invitation", companyId, modtager: udfald.email });';
    expect(meldInvitationsUdfaldMelderSpaerret(k.replace(kald, ""))).toBe(false);
    expect(meldInvitationsUdfaldMelderSpaerret(k.replace(`${kald}\n      return;`, kald))).toBe(false);
    const gren = k.slice(k.indexOf('    if (udfald.udfald === "spaerret") {'), k.indexOf("    const { data: company, error: companyFejl }", k.indexOf("async function meldInvitationsUdfald(")));
    expect(gren).toContain(kald);
    const flyttet = k.replace(gren, "").replace("    const resultat = await skrivRaadgiverBesked(adminClient, besked);\n", gren + "    const resultat = await skrivRaadgiverBesked(adminClient, besked);\n");
    expect(meldInvitationsUdfaldMelderSpaerret(flyttet)).toBe(false);
  });
  it("4. invitation_spaerret fjernet fra svaret, eller data læses ikke → falsk", () => {
    const k = laes(IMPORT);
    expect(importSenderInvitationSpaerret(k.replace("    invitation_spaerret: invitationSpaerret,\n", ""))).toBe(false);
    expect(importSenderInvitationSpaerret(k.replace("const { data: emailData, error: emailErr }", "const { data: _emailData, error: emailErr }"))).toBe(false);
  });
  it("5. gensendInvitation uden returværdi, eller opretInvitation uden spaerret → falsk", () => {
    const k = laes(HOOK);
    expect(gensendReturnererSpaerret(k.replace("  return { spaerret: data?.spaerret === true };\n", ""))).toBe(false);
    expect(gensendReturnererSpaerret(k.replace("return { gensendt, spaerret };", "return { gensendt };"))).toBe(false);
  });
  it("6. advarslen mangler på én af de to veje → falsk", () => {
    const k = laes(HB);
    expect(hbInvitationerViserAdvarsel(k.replace("if (r.spaerret) spaerretAdvarsel(inv.email);\n          else toast.success", "toast.success"))).toBe(false);
    expect(hbInvitationerViserAdvarsel(k.replace("if (r.spaerret) spaerretAdvarsel(email.trim());\n      else toast.success", "toast.success"))).toBe(false);
    expect(hbInvitationerViserAdvarsel(k.replace("duration: 15000", "duration: 4000"))).toBe(false);
  });
  it("7. CompanyInvitations læser ikke svaret, eller advarslen mangler → falsk", () => {
    const k = laes(GAMMEL);
    expect(companyInvitationsViserAdvarsel(k.replace("const { data: emailData } = await supabase.functions.invoke", "await supabase.functions.invoke"))).toBe(false);
    expect(companyInvitationsViserAdvarsel(k.replace("if (emailData?.spaerret === true) {", "if (false) {"))).toBe(false);
  });
});
