import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Værn for den inkluderede session med Jonas (13/9, recon-de-tre-sessioner.md):
// medlemskabet indeholder ÉN session med hver rådgiver. Mortens ret var
// companies.intro_session_used_at (én kolonne, fire skrivere, fire læsere);
// Jonas' fandtes ikke — hverken kolonne, bookingvej eller kort. Værnet
// læser KILDEN (varselStempel.guard-mønstret), fordi edge functions og JSX
// ikke kan importeres i vitest, og låser:
//   1. retten spores i en søsterkolonne, og Mortens kolonne røres ikke;
//   2. bookingvejen er én function for begge rådgivere med samme atomiske
//      gate (UPDATE … WHERE <ret> IS NULL → 409) og id i linket;
//   3. webhooken genåbner den rigtige ret via dommen;
//   4. fladen dømmer begge rettigheder ét sted og viser de tre spor med de
//      besluttede navne — og ordet «intro» er væk brugervendt.
// Interne navne (kolonnen intro_session_used_at, function-navnet, cron-jobbet)
// BLIVER med vilje — de koster mere at omdøbe end de giver (recon §7(i)).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

const MIGRATION = "supabase/migrations/20260913220000_jonas_session_used_at.sql";
const FUNKTION = "supabase/functions/create-free-intro-booking/index.ts";
const WEBHOOK = "supabase/functions/calendly-webhook/index.ts";
const WEBHOOK_DOM = "supabase/functions/_shared/calendlyWebhookDom.ts";
const FLADE = "src/components/hjemmebane/booksession/BookSessionView.tsx";
const MASKINE = "src/lib/hjemmebane/bookSessionTilstand.ts";
const VIRKSOMHED = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const ADMIN = "src/components/members/EditCompanyDialog.tsx";
const CHECKOUT = "supabase/functions/create-stripe-checkout/index.ts";
const STRIPE_WH = "supabase/functions/stripe-webhook/index.ts";
const INDSTILLINGER = "src/lib/hjemmebane/indstillinger.ts";

/** Alle brugervendte strenge i en edge function: json(<status>, { error: "…" }) — også template-strenge. */
const fejltekster = (kilde: string): string[] =>
  [...kilde.matchAll(/error:\s*(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);

describe("inkluderetSession.guard — 1. retten spores i en søsterkolonne", () => {
  it("migrationen tilføjer jonas_session_used_at som timestamptz NULL og rører ikke intro_session_used_at", () => {
    const sql = laes(MIGRATION);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS jonas_session_used_at timestamptz NULL/);
    expect(sql).toMatch(/COMMENT ON COLUMN public\.companies\.jonas_session_used_at/);
    // Mortens kolonne må hverken ændres, omdøbes eller droppes herfra.
    expect(sql).not.toMatch(/ALTER COLUMN\s+intro_session_used_at|RENAME\s+(COLUMN\s+)?intro_session_used_at|DROP COLUMN\s+intro_session_used_at/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
  });
});

describe("inkluderetSession.guard — 2. bookingvejen er én function for begge rådgivere", () => {
  const kilde = laes(FUNKTION);

  it("Bucket A: authenticateUser FØR service-role-klienten", () => {
    expect(kilde.indexOf("authenticateUser(req)")).toBeGreaterThan(0);
    expect(kilde.indexOf("authenticateUser(req)")).toBeLessThan(kilde.indexOf("SUPABASE_SERVICE_ROLE_KEY"));
  });

  it("SPOR-tabellen binder hver rådgiver til sin ret og sine secrets — Jonas' slug er en NY secret", () => {
    const morten = kilde.slice(kilde.indexOf("morten: {"), kilde.indexOf("jonas: {"));
    const jonas = kilde.slice(kilde.indexOf("jonas: {"), kilde.indexOf("function vaelgRaadgiver"));
    expect(morten).toContain('ret: "intro_session_used_at"');
    expect(morten).toContain('"MORTEN_CALENDLY_API_KEY"');
    expect(morten).toContain('"MORTEN_CALENDLY_EVENT_SLUG"');
    expect(jonas).toContain('ret: "jonas_session_used_at"');
    expect(jonas).toContain('"CALENDLY_API_KEY"');
    expect(jonas).toContain('"JONAS_CALENDLY_EVENT_SLUG"');
  });

  it("uden body er rådgiveren Morten (den gamle adfærd); ukendt værdi afvises", () => {
    expect(kilde).toMatch(/if \(a === undefined \|\| a === null\) return "morten";/);
    expect(kilde).toMatch(/if \(a === "jonas" \|\| a === "morten"\) return a;/);
  });

  it("gaten er atomisk og ens for begge: UPDATE companies SET <ret> WHERE <ret> IS NULL, 409 ved nul rækker", () => {
    expect(kilde).toContain(".update({ [spor.ret]: ts })");
    expect(kilde).toContain(".is(spor.ret, null)");
    expect(kilde).toMatch(/if \(!claimed \|\| claimed\.length === 0\) \{\s*return json\(409/);
    // Rollback nulstiller KUN vores egen markering (samme ts) — på samme kolonne.
    expect(kilde).toContain(".update({ [spor.ret]: null })");
    expect(kilde).toContain(".eq(spor.ret, ts)");
    // Ingen hårdkodet kolonne tilbage i mutationerne.
    expect(kilde).not.toMatch(/update\(\{\s*intro_session_used_at/);
  });

  it("linket bærer rækkens id (salesforce_uuid + utm_content), og rækken oprettes med det faste id, rådgiveren og amount_dkk 0", () => {
    expect(kilde).toContain('u.searchParams.set("salesforce_uuid", bookingId)');
    expect(kilde).toContain('u.searchParams.set("utm_content", bookingId)');
    expect(kilde).toContain("id: bookingId,");
    expect(kilde).toContain("advisor: raadgiver,");
    expect(kilde).toContain("amount_dkk: 0,");
    expect(kilde).not.toContain('advisor: "morten"');
  });

  it("ingen brugervendt fejltekst siger «intro» eller «gratis» — de siger «inkluderede session»", () => {
    const tekster = fejltekster(kilde);
    expect(tekster.length).toBeGreaterThanOrEqual(8);
    for (const t of tekster) {
      expect(t).not.toMatch(/intro/i);
      expect(t).not.toMatch(/gratis/i);
    }
    expect(tekster.some((t) => t.includes("inkluderede session"))).toBe(true);
  });
});

describe("inkluderetSession.guard — 3. webhooken genåbner den rigtige ret", () => {
  it("aflysningen læser advisor OG amount_dkk og nulstiller kolonnen dommen peger på", () => {
    const kilde = laes(WEBHOOK);
    expect(kilde).toContain("genaabnerRet(");
    expect(kilde).toContain('.select("id, company_id, advisor, amount_dkk")');
    expect(kilde).toContain(".update({ [ret]: null })");
    expect(kilde).not.toContain(".update({ intro_session_used_at: null })");
  });

  it("dommen kender begge kolonner og kun dem", () => {
    const dom = laes(WEBHOOK_DOM);
    expect(dom).toContain('export type RetKolonne = "intro_session_used_at" | "jonas_session_used_at";');
    expect(dom).toContain('if (i.advisor === MORTEN_ADVISOR) return "intro_session_used_at";');
    expect(dom).toContain('if (i.advisor === JONAS_ADVISOR) return "jonas_session_used_at";');
  });
});

describe("inkluderetSession.guard — 4. fladen: begge rettigheder ét sted, tre spor, besluttede navne", () => {
  it("Book session dømmer gennem afgoerBookSession, henter begge rettigheder og kalder functionen med { advisor }", () => {
    const kilde = laes(FLADE);
    expect(kilde).toContain("afgoerBookSession(");
    expect(kilde).not.toContain("afgoerMortenTilstand(");
    expect(kilde).toMatch(/select\("intro_session_used_at, jonas_session_used_at, contract_end_date"\)/);
    expect(kilde).toMatch(/invoke\("create-free-intro-booking", \{\s*body: \{ advisor \},/);
    // De inkluderede rækker hentes på amount_dkk = 0 for begge rådgivere — ikke på advisor='morten'.
    expect(kilde).toContain('.eq("amount_dkk", 0)');
    expect(kilde).not.toContain('.eq("advisor", "morten")');
  });

  // Indtil 13/9 (aften) krævede værnet også de tre navne på Book session. De
  // er fjernet dér med vilje: kortet ER sessionen, så etiketten navngav kun
  // det medlemmet allerede så og gentog knappen. Navnene er labels i LISTER
  // (Virksomhed, admin, indstillinger, Stripe) — der bliver de, og der låses de.
  it("Book session bærer ingen spor-etiket — kortet er sessionen; de to brødtekster kan ikke byttes om", () => {
    const flade = laes(FLADE);
    // Negativerne måles på kilden UDEN kommentarer — kommentarerne må netop forklare
    // hvad der er fjernet og hvorfor, og skal kunne nævne de forbudte ord.
    const jsxTekst = flade.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(jsxTekst).not.toContain("Session med Jonas · inkluderet");
    expect(jsxTekst).not.toContain("Session med Jonas · købt");
    expect(jsxTekst).not.toContain("Session med Morten · inkluderet");
    // Forskellen står i teksten: Morten er investor og ser udefra, Jonas er partner og ser indefra.
    expect(jsxTekst).toContain("Blikket udefra");
    expect(jsxTekst).toContain("Blikket indefra");
    expect(jsxTekst).toMatch(/Morten er investor/);
    expect(jsxTekst).toMatch(/Jonas er partner/);
    // Jonas 13/9: «onboarding» må ikke ind (sessionen udløber ikke; mange har ikke brug for det),
    // og «strategi-session» er for snævert for Mortens.
    expect(jsxTekst).not.toMatch(/onboarding|strategi-?session/i);
    // «Én session per virksomhed» er kortets vigtigste oplysning — aldrig igen som grå fodnote.
    expect(flade).not.toMatch(/text-hb-ink-soft">én session per virksomhed/);
    expect(jsxTekst.match(/Én session per virksomhed, ikke per bruger\./g)?.length).toBe(2);
  });

  it("de tre navne står på virksomhedssiden og i admin-dialogen", () => {
    const virk = laes(VIRKSOMHED);
    expect(virk).toContain('label: "Session med Jonas · inkluderet"');
    expect(virk).toContain('label: "Session med Morten · inkluderet"');
    expect(virk).toContain('label="Session med Jonas · købt"');
    const admin = laes(ADMIN);
    expect(admin).toContain("Session med Morten · inkluderet — brugt");
    expect(admin).toContain("Session med Jonas · inkluderet — brugt");
  });

  it("virksomhedssiden fordeler rækkerne efter sporet og læser begge rettigheder", () => {
    const virk = laes(VIRKSOMHED);
    expect(virk).toContain("afgoerSessionSpor(r)");
    expect(virk).toContain('"jonas_koebt"');
    expect(virk).toContain('"jonas_inkluderet"');
    expect(virk).toContain('"morten_inkluderet"');
    expect(virk).toMatch(/select\("intro_session_used_at, jonas_session_used_at"\)/);
    expect(virk).not.toContain('r.advisor === "morten"');
  });

  it("admin-dialogen skriver jonas_session_used_at med samme bevar-tidspunktet-mønster som Mortens", () => {
    const admin = laes(ADMIN);
    expect(admin).toContain("updates.jonas_session_used_at = originalJonasAt || new Date().toISOString();");
    expect(admin).toContain("updates.jonas_session_used_at = null;");
    expect(admin).toContain("updates.intro_session_used_at = originalIntroAt || new Date().toISOString();");
  });

  it("Jonas-kortets to ansigter er dømt i maskinen, ikke i JSX", () => {
    const maskine = laes(MASKINE);
    expect(maskine).toContain("export function afgoerBookSession(");
    expect(maskine).toMatch(/\{ kort: "inkluderet"; tilstand: "book" \| "loading" \| "link-ready" \}/);
    expect(maskine).toMatch(/\{ kort: "koebt" \}/);
    // afgoerMortenTilstand bevares (samme maskine, samme dom — testet i bookSessionTilstand.test.ts).
    expect(maskine).toContain("export function afgoerMortenTilstand(");
  });

  it("ordet «intro» og «1:1» er væk fra alt brugervendt — JSX-tekst, labels, Stripe-tekster og indstillingen", () => {
    // JSX-tekstnoder (mellem > og <) og label-/tekst-strenge i fladerne.
    for (const sti of [FLADE, VIRKSOMHED]) {
      const kilde = laes(sti);
      const jsxTekst = (kilde.match(/>[^<{]*</g) ?? []).join(" ");
      expect(jsxTekst, sti).not.toMatch(/\bintro\b|intro-session|1:1/i);
      const labels = (kilde.match(/label[=:]\s*["'][^"']*["']/g) ?? []).join(" ");
      expect(labels, sti).not.toMatch(/intro|1:1/i);
    }
    const admin = laes(ADMIN);
    expect(admin).not.toContain("Gratis intro-session brugt");
    expect(laes(CHECKOUT)).toContain('"Kun fulde medlemmer kan købe en session med Jonas."');
    expect(laes(CHECKOUT)).not.toContain("1:1-session");
    const stripe = laes(STRIPE_WH);
    expect(stripe).toContain('"Din session med Jonas — vælg et tidspunkt"');
    expect(stripe).toContain("Session med Jonas · købt");
    expect(stripe).not.toContain("1:1 Session · Jonas Herlev");
    expect(stripe).not.toContain("din 1:1 session med Jonas");
    const indst = laes(INDSTILLINGER);
    expect(indst).toContain('label: "Session med Morten · inkluderet"');
    // Nøglen intro_reminders er gemt i profiles.notification_email_prefs og BLIVER.
    expect(indst).toContain('noegle: "intro_reminders"');
  });
});
