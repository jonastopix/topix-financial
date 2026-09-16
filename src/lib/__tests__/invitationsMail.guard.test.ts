import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for send-invitation-email (14/9 2026): fallbacken SKAL komme fra
// _shared/invitationsMail.ts (husets form), ikke fra en inline HTML-streng,
// skabelonvalget SKAL læse error og logge årsagen, og template_name
// 'invitation' i email_send_log må IKKE ændres (aftagere: src/hooks/
// invitationer.ts:62 og EmailLogView.tsx). Kildelæsning frem for import:
// functionen importerer npm:-moduler (managedEmail) som vitest ikke loader.

const FUNKTION = "supabase/functions/send-invitation-email/index.ts";
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("invitationsMail.guard — send-invitation-email", () => {
  const kode = udenKommentarer(laes(FUNKTION));

  it("bærer ingen af de fire sætninger og ingen inline fallback-HTML", () => {
    expect(kode).not.toMatch(/\bby Topix\b/);
    expect(kode).not.toMatch(/\bIgnorer denne besked\b/);
    expect(kode).not.toMatch(/\bhvilken som helst\b/);
    expect(kode).not.toContain("<strong>The Boardroom</strong>");
    expect(kode).not.toContain("FALLBACK_HTML");
    expect(kode).not.toContain("<!DOCTYPE html>");
  });

  it("fallbacken kommer fra invitationsMailSkabelon(), og pladsholderne udfyldes med udfyldPladsholdere på begge veje", () => {
    expect(kode).toContain('from \'../_shared/invitationsMail.ts\'');
    // 16/9: to udgaver af fallbacken — takken kun når efter_betaling er sand
    // (invitationTak.guard.test.ts låser valget og default).
    expect(kode).toContain("const FALLBACK_EFTER_BETALING = invitationsMailSkabelon(true);");
    expect(kode).toContain("const FALLBACK_UDEN_BETALING = invitationsMailSkabelon(false);");
    expect(kode).toContain("const fallback = efterBetaling ? FALLBACK_EFTER_BETALING : FALLBACK_UDEN_BETALING;");
    expect(kode).toContain("let subjectTpl = fallback.subject;");
    expect(kode).toContain("let bodyTpl = fallback.html;");
    expect(kode).not.toContain("invitationsMailSkabelon()");
    expect(kode).toContain("const vaerdier = invitationsVaerdier({ companyName: company_name, signupUrl: signup_url });");
    expect(kode).toContain("const subject = udfyldPladsholdere(subjectTpl, vaerdier.tilEmne);");
    expect(kode).toContain("const html = udfyldPladsholdere(bodyTpl, vaerdier.tilHtml);");
    // Værdierne bygges ét sted — ingen rå { company_name, signup_url } direkte i udfyldningen.
    expect(kode).not.toMatch(/udfyldPladsholdere\([^)]*\{\s*company_name/);
    expect(kode).not.toContain("replaceVars(");
  });

  it("skabelonopslaget læser error, bruger ikke maybeSingle, og dommen falder i afgoerSkabelonvalg", () => {
    const opslag = kode.slice(kode.indexOf(".from('email_templates')"), kode.indexOf("const valg = afgoerSkabelonvalg("));
    expect(opslag.length).toBeGreaterThan(0);
    expect(kode).toContain("const { data: skabelonRaekker, error: skabelonFejl } = await adminSupabase");
    expect(opslag).toContain(".eq('name', SKABELON_NAVN)");
    expect(opslag).not.toContain("maybeSingle");
    expect(opslag).not.toContain(".single(");
    expect(kode).toContain("console.error('[send-invitation-email] email_templates-opslag fejlede:', skabelonFejl);");
    expect(kode).toContain("fejl: skabelonFejl ? { message: skabelonFejl.message, code: skabelonFejl.code } : null,");
    expect(kode).not.toMatch(/if \(tpl && tpl\.enabled\)/);
  });

  it("vejen logges altid (skabelon som log, fallback som warn), og vej + årsag går i email_send_log.metadata", () => {
    expect(kode).toContain("console.log(skabelonvalgLogtekst(valg));");
    expect(kode).toContain("console.warn(skabelonvalgLogtekst(valg));");
    expect(kode).toContain("metadata: { ...skabelonvalgMetadata(valg), company_name },");
  });

  it("template_name i email_send_log er stadig 'invitation' — aftagerne i invitationer.ts og EmailLogView læser den", () => {
    expect(kode).toContain("label: 'invitation',");
    expect(kode.split("label: '").length - 1).toBe(1);
    expect(udenKommentarer(laes("src/hooks/invitationer.ts"))).toContain('.eq("template_name", "invitation")');
  });

  it("auth-formen er urørt: Bearer-krav, service-role-sammenligning og getUser for brugerkald", () => {
    expect(kode).toContain("const isServiceRole = token === serviceRoleKey;");
    expect(kode).toContain("await authClient.auth.getUser()");
    expect(kode).toContain("candidates.find((row: any) => row.invited_by === callerId)");
  });
});

describe("invitationsMail.guard — indgangsMail.ts deler underskriften og escaperen", () => {
  it("HILSEN er eksporteret, så invitationsmailen signerer som de øvrige medlemsmails", () => {
    const kode = udenKommentarer(laes("supabase/functions/_shared/indgangsMail.ts"));
    expect(kode).toContain('export const HILSEN = "Venlig hilsen\\nMorten Larsen";');
    expect(udenKommentarer(laes("supabase/functions/_shared/invitationsMail.ts"))).toContain("hilsen: HILSEN,");
  });

  it("esc er eksporteret, og invitationsMail.ts escaper virksomhedsnavnet med den — ikke med en egen kopi", () => {
    expect(udenKommentarer(laes("supabase/functions/_shared/indgangsMail.ts"))).toContain("export function esc(tekst: string): string {");
    const kode = udenKommentarer(laes("supabase/functions/_shared/invitationsMail.ts"));
    expect(kode).toContain("company_name: esc(a.companyName)");
    expect(kode).not.toContain(".replace(/&/g,");
  });

  it("«skriv til mig» og «svar på denne mail» står ikke i invitationsMail.ts — adressen er kontakt@theboardroom.dk", () => {
    const kode = udenKommentarer(laes("supabase/functions/_shared/invitationsMail.ts"));
    expect(kode).not.toMatch(/\bskriv til mig\b/);
    expect(kode).not.toMatch(/\bsvar på denne mail\b/);
    // Siden 14/9 defineres adressen i indgangsMail.ts og re-eksporteres her (kontaktadresse.guard.test.ts låser definitionen).
    expect(kode).toContain("export { KONTAKT_ADRESSE };");
    expect(kode).toMatch(/import \{[^}]*\bKONTAKT_ADRESSE\b[^}]*\} from "\.\/indgangsMail\.ts";/);
    expect(kode).not.toMatch(/jonas@|morten@|@topix\.dk|@molainvest\.dk/);
  });
});
