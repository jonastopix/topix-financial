import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for fund B (14/9 2026): ingen af de seks kald til
// sikrIndgangsInvitation i stripe-webhook må stå uden tildeling, hvert
// tildelt udfald skal meldes gennem meldInvitationsUdfald, og hjælperen
// skal gå gennem husets skrivRaadgiverBesked uden at kunne kaste.
// sikrIndgangsInvitations egne grene («allerede accepteret», 15/9) låses i
// sikrIndgangsInvitation.guard.test.ts. Kildelæsning: filerne importerer
// npm:/esm.sh-moduler.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("invitationsUdfald.guard — stripe-webhook", () => {
  const kode = udenKommentarer(laes("supabase/functions/stripe-webhook/index.ts"));

  it("ingen bare kald: hvert sikrIndgangsInvitation-kald tildeler udfaldet", () => {
    expect(kode.match(/^\s*await sikrIndgangsInvitation\(/gm) ?? []).toHaveLength(0);
    expect(kode.match(/const invitation = await sikrIndgangsInvitation\(/g) ?? []).toHaveLength(6);
  });

  it("hvert af de seks kald følges af meldInvitationsUdfald med samme klient, virksomhed og reference", () => {
    expect(kode.match(/await meldInvitationsUdfald\(adminClient, /g) ?? []).toHaveLength(6);
    // Checkout-grenen (tre kald, session.id) og fakturagrenen (tre kald, invoiceId).
    expect(kode.match(/await meldInvitationsUdfald\(adminClient, indgangCompanyId, invitation, session\.id\);/g) ?? []).toHaveLength(3);
    expect(kode.match(/await meldInvitationsUdfald\(adminClient, companyId, invitation, invoiceId\);/g) ?? []).toHaveLength(3);
    // Meldingen står LIGE efter kaldet — intet imellem der kan kaste først.
    for (const m of kode.matchAll(/const invitation = await sikrIndgangsInvitation\([^)]*\);\n\s*(.+)/g)) {
      expect(m[1].trim().startsWith("await meldInvitationsUdfald(")).toBe(true);
    }
  });

  it("hjælperen: sendt/fandtes_allerede/allerede_medlem → ingen besked; ellers beskedVedInvitationsUdfald → skrivRaadgiverBesked; kaster aldrig", () => {
    const start = kode.indexOf("async function meldInvitationsUdfald(");
    expect(start).toBeGreaterThan(-1);
    const krop = kode.slice(start, kode.indexOf("\n}\n", start) + 3);
    // 15/9 (DE TYVE (8)): «allerede_medlem» er det tredje stille udfald.
    expect(krop).toContain('if (udfald.udfald === "sendt" || udfald.udfald === "fandtes_allerede" || udfald.udfald === "allerede_medlem") {');
    expect(krop).toContain("beskedVedInvitationsUdfald({");
    expect(krop).toContain("await skrivRaadgiverBesked(adminClient, besked);");
    expect(krop).toContain("try {");
    expect(krop).toContain("} catch (err) {");
    expect(krop).not.toContain("throw ");
    expect(krop).toContain('.select("name, contact_email")');
  });
});

describe("invitationsUdfald.guard — invitationen melder kun udfald, dommen er husets", () => {
  // 16/9: sjette udfald «spaerret» — mailudbyderen har spærret adressen; klokken
  // er spaerretMail-motorens (invitationSpaerret.guard.test.ts), så
  // raadgiverBeskedTekst.ts' InvitationsUdfald-kopi kender den IKKE.
  it("sikrIndgangsInvitation.ts bærer de seks udfald og kaster aldrig ud af sig selv", () => {
    const kode = udenKommentarer(laes("supabase/functions/_shared/sikrIndgangsInvitation.ts"));
    expect(kode).toContain('| { udfald: "sendt"; email: string }');
    expect(kode).toContain('| { udfald: "spaerret"; email: string }');
    expect(kode).toContain('| { udfald: "fandtes_allerede"; email: string }');
    expect(kode).toContain('| { udfald: "allerede_medlem"; email: string }');
    expect(kode).toContain('| { udfald: "sprunget_over"; grund: "secret_mangler" }');
    expect(kode).toContain('| { udfald: "fejlet"; aarsag: string };');
    expect(kode).not.toContain("skrivRaadgiverBesked");
    expect(kode).not.toContain("meldInvitationsUdfald");
  });

  it("typen er navngivet som traek_fejlet, referencen er company (klokkens default-gren linker til /virksomhed/{id})", () => {
    const tekst = udenKommentarer(laes("supabase/functions/_shared/raadgiverBeskedTekst.ts"));
    expect(tekst).toContain('export const TYPE_INVITATION_FEJLET = "invitation_fejlet";');
    expect(tekst).toContain('reference_type: "company",');
    const klokke = udenKommentarer(laes("src/lib/hjemmebane/klokke.ts"));
    expect(klokke).toContain("const virksomhed = n.company_id ? `/virksomhed/${n.company_id}` : null;");
    expect(klokke).toMatch(/default:\s*return virksomhed;/);
  });
});
