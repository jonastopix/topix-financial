import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9 2026): invitationsmailen takker kun for en betaling når
// der ER betalt (mangellisten m16-invitation-tak: set 16/9 09:55:15 på en
// importeret testkonto). Tre ting skal holde, læst i kilden:
//   1. send-invitation-email: efter_betaling læses KUN fra et service-role-
//      kald, default er falsk (en usand tak er værre end en manglende), og
//      valget styrer hvilken fallback der bruges. JWT-kald er altid falsk.
//   2. Kun sikrIndgangsInvitation.ts (Stripe-vejen, efter betaling) sender
//      efter_betaling: true — ingen anden fil i src/ eller supabase/.
//   3. invitationsMail.ts bærer takken ét sted (TAK_FOR_BETALING), og kun
//      foersteAfsnit(true) sætter den ind.
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører de
// samme domme på kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FUNKTION = "supabase/functions/send-invitation-email/index.ts";
const SIKR = "supabase/functions/_shared/sikrIndgangsInvitation.ts";
const MAIL = "supabase/functions/_shared/invitationsMail.ts";

const VALG_LINJE = "const efterBetaling = isServiceRole && body?.efter_betaling === true;";

/** 1. Default falsk og kun service-role: valget står som én linje, FØR service-role-grenen,
    og fallbacken vælges af det. Ingen anden læsning af efter_betaling. */
export function defaultErFalskOgKunServiceRole(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const valg = k.indexOf(VALG_LINJE);
  const gren = k.indexOf("if (isServiceRole) {");
  if (valg === -1 || gren === -1 || valg > gren) return false;
  const laesninger = k.match(/efter_betaling/g) ?? [];
  return (
    laesninger.length === 1 &&
    k.includes("const fallback = efterBetaling ? FALLBACK_EFTER_BETALING : FALLBACK_UDEN_BETALING;") &&
    k.includes("const FALLBACK_EFTER_BETALING = invitationsMailSkabelon(true);") &&
    k.includes("const FALLBACK_UDEN_BETALING = invitationsMailSkabelon(false);") &&
    !k.includes("invitationsMailSkabelon()")
  );
}

/** 2. Præcis én fil i src/ + supabase/ sender `efter_betaling: true` — Stripe-vejen. */
export function kunStripeVejenSenderTrue(filer: { sti: string; kilde: string }[]): boolean {
  const sendere = filer.filter((f) => udenKommentarer(f.kilde).includes("efter_betaling: true")).map((f) => f.sti);
  return sendere.length === 1 && sendere[0].endsWith("_shared/sikrIndgangsInvitation.ts");
}

/** sikrIndgangsInvitation: feltet står i selve invoke-body'en. */
export function sikrSenderTrueIBody(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const start = k.indexOf('functions.invoke("send-invitation-email", {');
  if (start === -1) return false;
  const slut = k.indexOf("});", start);
  const body = k.slice(start, slut);
  return body.includes("efter_betaling: true,") && body.includes("signup_url: signupUrl,");
}

/** 3. Takken står ét sted, og kun den sande gren sætter den ind. */
export function takkenStaarEtSted(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const forekomster = k.match(/Tak for din betaling\./g) ?? [];
  return (
    forekomster.length === 1 &&
    k.includes('export const TAK_FOR_BETALING = "Tak for din betaling.";') &&
    k.includes("return efterBetaling ? `${TAK_FOR_BETALING} ${rest}` : rest;") &&
    k.includes("foersteAfsnit(a.efterBetaling),") &&
    k.includes("efterBetaling: boolean;")
  );
}

const alleKildefiler = () =>
  [...globSync("src/**/*.{ts,tsx}", { cwd: ROD }), ...globSync("supabase/functions/**/*.ts", { cwd: ROD })]
    .filter((sti) => !/\.test\.tsx?$|_test\.ts$/.test(sti))
    .map((sti) => ({ sti, kilde: laes(sti) }));

describe("invitationTak.guard — takken kun efter betaling", () => {
  it("1. send-invitation-email: efter_betaling læses én gang, kun fra service-role, default falsk; fallbacken vælges af det", () => {
    expect(defaultErFalskOgKunServiceRole(laes(FUNKTION))).toBe(true);
  });
  it("2. kun _shared/sikrIndgangsInvitation.ts sender efter_betaling: true — og i selve body'en", () => {
    const filer = alleKildefiler();
    expect(filer.length).toBeGreaterThan(100);
    expect(kunStripeVejenSenderTrue(filer)).toBe(true);
    expect(sikrSenderTrueIBody(laes(SIKR))).toBe(true);
  });
  it("3. invitationsMail.ts: «Tak for din betaling.» står ét sted og sættes kun ind af den sande gren", () => {
    expect(takkenStaarEtSted(laes(MAIL))).toBe(true);
  });
  it("import-application og CompanyInvitations sender IKKE feltet (default falsk gælder)", () => {
    expect(udenKommentarer(laes("supabase/functions/import-application/index.ts"))).not.toContain("efter_betaling");
    expect(udenKommentarer(laes("src/components/CompanyInvitations.tsx"))).not.toContain("efter_betaling");
    expect(udenKommentarer(laes("src/hooks/invitationer.ts"))).not.toContain("efter_betaling");
  });
});

describe("invitationTak.guard — VÆRNET VIRKER (dommene på kopier med fejlen indsat)", () => {
  it("1. default sand, valg uden service-role-krav, valg efter grenen, eller fallbacken ikke valgt af det → falsk", () => {
    const k = laes(FUNKTION);
    expect(defaultErFalskOgKunServiceRole(k.replace(VALG_LINJE, "const efterBetaling = body?.efter_betaling !== false;"))).toBe(false);
    expect(defaultErFalskOgKunServiceRole(k.replace(VALG_LINJE, "const efterBetaling = body?.efter_betaling === true;"))).toBe(false);
    expect(defaultErFalskOgKunServiceRole(k.replace(VALG_LINJE, "").replace("    if (isServiceRole) {\n      if (!body?.company_name", `    if (isServiceRole) {\n      ${VALG_LINJE}\n      if (!body?.company_name`))).toBe(false);
    expect(defaultErFalskOgKunServiceRole(k.replace("const fallback = efterBetaling ? FALLBACK_EFTER_BETALING : FALLBACK_UDEN_BETALING;", "const fallback = FALLBACK_EFTER_BETALING;"))).toBe(false);
    // En ekstra læsning af feltet et andet sted (fx i JWT-grenen) → falsk.
    expect(defaultErFalskOgKunServiceRole(k.replace("email = normalizedEmail;", "email = normalizedEmail; const x = body?.efter_betaling;"))).toBe(false);
  });
  it("2. en anden fil sender true, eller Stripe-vejen sender det ikke → falsk", () => {
    const filer = alleKildefiler();
    const medImport = filer.map((f) => (f.sti.endsWith("import-application/index.ts") ? { ...f, kilde: f.kilde.replace("signup_url: signupUrl,", "signup_url: signupUrl,\n      efter_betaling: true,") } : f));
    expect(kunStripeVejenSenderTrue(medImport)).toBe(false);
    const udenStripe = filer.map((f) => (f.sti.endsWith("_shared/sikrIndgangsInvitation.ts") ? { ...f, kilde: f.kilde.replace("        efter_betaling: true,\n", "") } : f));
    expect(kunStripeVejenSenderTrue(udenStripe)).toBe(false);
    expect(sikrSenderTrueIBody(laes(SIKR).replace("        efter_betaling: true,\n", ""))).toBe(false);
  });
  it("3. takken hardkodet i afsnittet igen, eller sat ind uanset valget → falsk", () => {
    const k = laes(MAIL);
    expect(takkenStaarEtSted(k.replace("foersteAfsnit(a.efterBetaling),", '"Tak for din betaling. Din plads i The Boardroom er klar, og du opretter dit login herunder.",'))).toBe(false);
    expect(takkenStaarEtSted(k.replace("return efterBetaling ? `${TAK_FOR_BETALING} ${rest}` : rest;", "return `${TAK_FOR_BETALING} ${rest}`;"))).toBe(false);
    expect(takkenStaarEtSted(k.replace("  efterBetaling: boolean;\n", ""))).toBe(false);
  });
});
