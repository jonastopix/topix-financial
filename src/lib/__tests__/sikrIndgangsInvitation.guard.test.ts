import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for DE TYVE (8) — «sikrIndgangsInvitation kender ikke «allerede
// accepteret»» (chattens beslutning 15/9). Filen importerer esm.sh og kan
// ikke importeres i vitest; grenene låses derfor ved kildelæsning:
//   1. når pending-opslaget er tomt, slås rækken på (company_id, e-mail) op
//      UDEN statusfilter, FØR insert;
//   2. accepteret + accepted_by peger på en bruger der findes
//      (auth.admin.getUserById) → «allerede_medlem», ingen mail, ingen række;
//   3. accepteret uden gyldig bruger → nulstilles som rådgiverens «Inviter»
//      (status pending, accepted_at null, accepted_by null) og sendes med
//      rækkens token;
//   4. insert-fejl 23505 (kapløb) → rækken læses igen og 1–3 anvendes.
// Alt andet — pending-grenen, secret-grenen, mailen, «kaster aldrig» — er
// uændret og låses af invitationsUdfald.guard.test.ts.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const kode = udenKommentarer(laes("supabase/functions/_shared/sikrIndgangsInvitation.ts"));

/** Kroppen af en funktion i filen, fra signaturen til første linje der kun er «}». */
function krop(navn: string): string {
  const start = kode.indexOf(`async function ${navn}(`);
  expect(start, `${navn} mangler`).toBeGreaterThan(-1);
  const slut = kode.indexOf("\n}\n", start);
  return kode.slice(start, slut + 3);
}

describe("sikrIndgangsInvitation.guard — opslaget uanset status står mellem pending-opslaget og insert'en", () => {
  it("pending-opslaget er uændret (company_id + status pending, limit 1)", () => {
    const hoved = krop("sikrIndgangsInvitation");
    expect(hoved).toContain('.eq("status", "pending")');
    expect(hoved).toContain('return { udfald: "fandtes_allerede", email: eksisterendeInvitation.email };');
  });

  it("opslaget uden statusfilter: (company_id, email), id/token/status/accepted_by — intet .eq(\"status\"", () => {
    const opslag = krop("findRaekkeUansetStatus");
    expect(opslag).toContain('.select("id, token, status, accepted_by")');
    expect(opslag).toContain('.eq("company_id", companyId)');
    expect(opslag).toContain('.eq("email", email)');
    expect(opslag).not.toContain('.eq("status"');
  });

  it("rækkefølgen i hovedfunktionen: pending-opslag → contact_email → opslag uanset status → insert → mail", () => {
    const hoved = krop("sikrIndgangsInvitation");
    const pending = hoved.indexOf('.eq("status", "pending")');
    const mail = hoved.indexOf('.select("name, contact_email")');
    const uanset = hoved.indexOf("await findRaekkeUansetStatus(adminClient, companyId, invitationEmail)");
    const insert = hoved.indexOf('.from("company_invitations")\n        .insert({');
    const send = hoved.indexOf('functions.invoke("send-invitation-email"');
    expect(pending).toBeGreaterThan(-1);
    expect(mail).toBeGreaterThan(pending);
    expect(uanset).toBeGreaterThan(mail);
    expect(insert).toBeGreaterThan(uanset);
    expect(send).toBeGreaterThan(insert);
  });
});

describe("sikrIndgangsInvitation.guard — gren 1: allerede medlem", () => {
  it("brugeren slås op med auth.admin.getUserById; «not found» er et nej, andre fejl kastes", () => {
    const bruger = krop("brugerFindes");
    expect(bruger).toContain("await adminClient.auth.admin.getUserById(userId)");
    expect(bruger).toContain("status === 404 || /not found/i.test(error.message");
    expect(bruger).toContain("throw new Error(`bruger-opslag fejlede for ${userId}");
    expect(bruger).toContain("return Boolean(data?.user);");
  });

  it("accepteret + bruger findes → allerede_medlem uden insert, uden mail, med loglinjen", () => {
    const afg = krop("afgoerEksisterendeRaekke");
    expect(afg).toContain("if (raekke.accepted_by && (await brugerFindes(adminClient, raekke.accepted_by))) {");
    expect(afg).toContain("allerede medlem — sender ikke");
    expect(afg).toContain('return { afgoerelse: "allerede_medlem" };');
    expect(afg).not.toContain(".insert(");
    expect(afg).not.toContain("send-invitation-email");
    const hoved = krop("sikrIndgangsInvitation");
    expect((hoved.match(/return \{ udfald: "allerede_medlem", email: invitationEmail \};/g) ?? []).length).toBe(2);
  });

  it("kun status accepted afgøres; en uventet status kastes (→ fejlet), aldrig gættes", () => {
    const afg = krop("afgoerEksisterendeRaekke");
    expect(afg).toContain('if (raekke.status !== "accepted") {');
    expect(afg).toContain("har uventet status");
  });
});

describe("sikrIndgangsInvitation.guard — gren 2: nulstillingen som rådgiverens «Inviter»", () => {
  it("samme tre felter som src/hooks/invitationer.ts, husets to tjek, og rækkens token bruges til mailen", () => {
    const afg = krop("afgoerEksisterendeRaekke");
    expect(afg).toContain('.update({ status: "pending", accepted_at: null, accepted_by: null })');
    expect(afg).toContain('.eq("id", raekke.id)');
    expect(afg).toContain('.select("token")');
    expect(afg).toContain("nulstilling af invitationen fejlede");
    expect(afg).toContain("nulstillingen ramte nul rækker");
    expect(afg).toContain('return { afgoerelse: "nulstillet", token:');
    // Rådgiverens nulstilling — ordret samme felter.
    const hook = udenKommentarer(laes("src/hooks/invitationer.ts"));
    expect(hook).toContain('.update({ status: "pending", accepted_at: null, accepted_by: null })');
    // Mailen bygges af tokenet fra afgørelsen eller insert'en — ét sted.
    const hoved = krop("sikrIndgangsInvitation");
    expect(hoved).toContain("token = afgjort.token;");
    expect(hoved).toContain("token = invitation.token;");
    expect(hoved).toContain("const signupUrl = `${APP_URL}/auth?mode=signup&invite=${token}`;");
  });
});

describe("sikrIndgangsInvitation.guard — gren 3: kapløbet (23505)", () => {
  it("23505 → genlæsning → pending = fandtes_allerede, ellers gren 1–2; andre insert-fejl kastes som før", () => {
    const hoved = krop("sikrIndgangsInvitation");
    const start = hoved.indexOf('if (invErr?.code === "23505") {');
    expect(start).toBeGreaterThan(-1);
    const kaploeb = hoved.slice(start, hoved.indexOf("} else if (invErr || !invitation) {", start));
    expect(kaploeb).toContain("await findRaekkeUansetStatus(adminClient, companyId, invitationEmail)");
    expect(kaploeb).toContain('if (kaploeb.status === "pending") {');
    expect(kaploeb).toContain('return { udfald: "fandtes_allerede", email: invitationEmail };');
    expect(kaploeb).toContain("await afgoerEksisterendeRaekke(adminClient, companyId, kaploeb, invitationEmail)");
    expect(hoved).toContain('throw new Error(`invitations-indsættelse fejlede: ${invErr?.message ?? "ingen række"}`);');
  });

  it("kaster aldrig ud af sig selv: alt ligger i try/catch der giver fejlet med årsagen", () => {
    const hoved = krop("sikrIndgangsInvitation");
    expect(hoved).toContain("} catch (invitationFejl) {");
    expect(hoved).toContain('return { udfald: "fejlet", aarsag };');
    expect(hoved).toContain("INVITATION IKKE SENDT — ${aarsag}. Rådgiver skal invitere manuelt.");
  });
});
