import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9): fejlede træk — afvisningsgrunden og perioden. Livjas
// første træk (TBR-0007) stod med fejl_* NULL og periode_start = periode_slut,
// og klokken sagde «Stripe gav ingen grund». Værnet låser at
//   1. payment_failed-grenen registrerer trækket som fejlet, og at
//      registreringen henter grunden (hentTraekFejl) ved fejlet;
//   2. hentTraekFejl går vejene i rækkefølge — fakturaen, så
//      GET /v1/invoice_payments?invoice=, så PaymentIntent'et — og KASTER
//      ALDRIG (try/catch → null, så rækken skrives uden grund);
//   3. klokken får advice_code fra dagens opslag og fejl_kode fra rækken;
//   4. perioden kommer fra abonnementslinjen med fakturaens felter som fallback.
// Webhooken importerer esm.sh og læses som kilde.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const webhook = udenKommentarer(laes("supabase/functions/stripe-webhook/index.ts"));
const traek = udenKommentarer(laes("supabase/functions/_shared/abonnementstraek.ts"));

function krop(kilde: string, signatur: string): string {
  const start = kilde.indexOf(signatur);
  expect(start, `${signatur} mangler`).toBeGreaterThan(-1);
  return kilde.slice(start, kilde.indexOf("\n}\n", start) + 3);
}

describe("traekGrund.guard — payment_failed henter grunden, og opslaget kan ikke vælte registreringen", () => {
  it("payment_failed-grenen registrerer som fejlet og melder klokken", () => {
    expect(webhook).toContain('if (event.type === "invoice.payment_failed") {');
    expect(webhook).toContain('const traek = await registrerAbonnementstraek(adminClient, invoice, "fejlet");');
    expect(webhook).toContain("const klokke = await meldFejletTraek(adminClient, traek);");
  });

  it("registreringen henter grunden ved fejlet gennem hentTraekFejl og bærer den i resultatet", () => {
    const reg = krop(webhook, "async function registrerAbonnementstraek(");
    expect(reg).toContain('if (udfald === "fejlet") {\n      fejl = await hentTraekFejl(invoice);');
    expect(reg).toContain('return { udfald: "registreret", id: traekId, status: udfald, company_id: companyId, genopslag, fejl };');
    expect(webhook).toContain("fejl: TraekFejl | null }");
  });

  it("hentTraekFejl: fakturaen → invoice_payments → payment_intents, og try/catch der giver null — intet throw", () => {
    const h = krop(webhook, "async function hentTraekFejl(");
    expect(h).toContain("let piId = paymentIntentIdFraFaktura(invoice);");
    expect(h).toContain("`/invoice_payments?invoice=${encodeURIComponent(invoiceId)}&limit=10`");
    expect(h).toContain("piId = paymentIntentIdFraInvoicePayments(liste.data);");
    expect(h).toContain("`/payment_intents/${encodeURIComponent(piId)}`");
    expect(h).toContain("const fejl = traekFejlFraPaymentIntent(pi);");
    expect(h).toContain("try {");
    expect(h).toContain("} catch (err) {");
    expect(h).toContain("return null;");
    expect(h).not.toContain("throw ");
    // Rækkefølgen: fakturaen først, listen kun når fakturaen intet bar.
    expect(h.indexOf("paymentIntentIdFraFaktura(invoice)")).toBeLessThan(h.indexOf("/invoice_payments?invoice="));
    expect(h.indexOf("/invoice_payments?invoice=")).toBeLessThan(h.indexOf("/payment_intents/"));
    // Husets Stripe-fetch-hjælper, ikke en ny.
    expect(h.match(/stripeGetJson</g) ?? []).toHaveLength(2);
    expect(h).not.toContain("fetch(");
  });

  it("klokken: rækken læses med fejl_kode, og advice_code kommer fra dagens opslag", () => {
    const m = krop(webhook, "async function meldFejletTraek(");
    expect(m).toContain('.select("id, status, company_id, beloeb_oere, fejl_besked, fejl_decline_code, fejl_kode, faktura_nummer, naeste_forsoeg_at")');
    expect(m).toContain("adviceCode: traek.fejl?.advice_code ?? null,");
  });

  it("perioden: bygTraekRaekke tager abonnementslinjens periode, fakturaens kun som fallback", () => {
    const b = krop(traek, "export function bygTraekRaekke(");
    expect(b).toContain("periode_start: tsIso(abonnementsperiodeFraLinjer(f)?.start ?? f.period_start),");
    expect(b).toContain("periode_slut: tsIso(abonnementsperiodeFraLinjer(f)?.end ?? f.period_end),");
    const p = krop(traek, "export function abonnementsperiodeFraLinjer(");
    expect(p).toContain('l?.parent?.type === "subscription_item_details" || l?.type === "subscription"');
  });

  it("ingen ny migration: advice_code og network_decline_code har ingen kolonne i company_traek og skrives ikke i rækken", () => {
    const b = krop(traek, "export function bygTraekRaekke(");
    expect(b).not.toContain("advice_code");
    expect(b).not.toContain("network_decline_code");
    const migrationer = readFileSync(resolve(process.cwd(), "supabase/migrations/20260903150000_company_traek.sql"), "utf8");
    expect(migrationer).not.toContain("advice_code");
  });
});
