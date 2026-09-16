import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «én betalingsliste pr. virksomhed» (16/9-2026): company_traek
// får en kilde, og de to Stripe-nøgler bliver nullable. Fire ting låses:
//   1. Migrationen: CHECK'en på kilde (præcis de tre værdier), CHECK'en der
//      kræver nøglerne pr. kilde, DROP NOT NULL på begge Stripe-id'er, det
//      delvise UNIQUE-indeks på e-conomic-fakturaer, og værnet der stopper
//      hvis en eksisterende række mangler et id.
//   2. Ingen flade antager et Stripe-id for en række: React-nøglen er
//      rækkens id (ikke stripe_invoice_id), labelen kommer fra traekLabel, og
//      fakturalinket gates af harFakturaLink — ingen fast «Træk {nr}»-tekst
//      i JSX.
//   3. Læserne henter id og kilde (useVirksomhed, IndstillingerView).
//   4. Typerne: stripe_invoice_id og stripe_subscription_id er nullable i Row,
//      kilde findes; motorens FejletTraek følger tabellen.
// Kildelæsning (forsidenKaster.guard-mønstret) med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260917110000_company_traek_kilde.sql";
const TRAEK = "src/lib/traek.ts";
const VIRKSOMHED = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const HOOK = "src/hooks/useVirksomhed.ts";
const INDSTILLINGER = "src/lib/hjemmebane/indstillinger.ts";
const INDSTILLINGER_VIEW = "src/components/hjemmebane/indstillinger/IndstillingerView.tsx";
const TYPES = "src/integrations/supabase/types.ts";

/** Dom 1: migrationen. */
export const migrationenHolder = (sql: string): boolean =>
  /add column if not exists kilde text not null default 'stripe_abonnement'/.test(sql) &&
  /check \(kilde in \('stripe_abonnement', 'stripe_engang', 'e-conomic'\)\)/.test(sql) &&
  /alter column stripe_subscription_id drop not null/.test(sql) &&
  /alter column stripe_invoice_id drop not null/.test(sql) &&
  /\(kilde = 'stripe_abonnement' and stripe_subscription_id is not null and stripe_invoice_id is not null\)/.test(sql) &&
  /\(kilde = 'stripe_engang' and stripe_invoice_id is not null and stripe_subscription_id is null\)/.test(sql) &&
  /\(kilde = 'e-conomic' and faktura_nummer is not null and stripe_invoice_id is null and stripe_subscription_id is null\)/.test(sql) &&
  /create unique index if not exists company_traek_econ_faktura_unik\s+on public\.company_traek \(kilde, faktura_nummer\)\s+where kilde = 'e-conomic'/.test(sql) &&
  /raise exception 'company_traek: % raekker mangler et Stripe-id/.test(sql) &&
  !/drop constraint if exists company_traek_invoice_unik/.test(sql);

/** Betaling-kortets træk-blok i VirksomhedView: fra `{d.traek.map(` til `</HbCard>`. */
export function traekBlok(flade: string): string {
  const start = flade.indexOf("{d.traek.map((t) => (");
  if (start === -1) return "";
  const slut = flade.indexOf("</HbCard>", start);
  return slut === -1 ? "" : flade.slice(start, slut);
}

/** Dom 2: ingen flade antager et Stripe-id. */
export const ingenFladeAntagerStripeId = (flade: string, indstillinger: string): boolean => {
  const blok = traekBlok(flade);
  return blok !== "" &&
    blok.includes("<Linje key={t.id} label={traekLabel(t)}>") &&
    !/key=\{t\.stripe_invoice_id\}/.test(blok) &&
    !/`Træk \$\{/.test(blok) &&
    blok.includes("{harFakturaLink(t) && (") &&
    !/\{t\.hosted_invoice_url && \(/.test(blok) &&
    indstillinger.includes('label: traekLabel(t, "Faktura"),') &&
    indstillinger.includes("fakturaUrl: harFakturaLink(t) ? t.hosted_invoice_url : null,") &&
    !/id: t\.stripe_invoice_id,/.test(indstillinger);
};

/** Dom 3: læserne henter id og kilde. */
export const laeserneHenterKilden = (hook: string, view: string): boolean =>
  /\.from\("company_traek"\)\s*\.select\("id, kilde, company_id, stripe_invoice_id,/.test(hook) &&
  /\.from\("company_traek"\)\.select\("id, kilde, stripe_invoice_id, status,/.test(view);

/** Dom 4: typerne følger tabellen. */
export const typerneFoelgerTabellen = (types: string, traek: string): boolean => {
  const start = types.indexOf("      company_traek: {");
  const row = types.slice(start, types.indexOf("        Insert: {", start));
  return row.includes("kilde: string") &&
    row.includes("stripe_invoice_id: string | null") &&
    row.includes("stripe_subscription_id: string | null") &&
    /export interface FejletTraek \{[\s\S]*?stripe_invoice_id: string \| null;/.test(traek) &&
    /export type TraekKilde = "stripe_abonnement" \| "stripe_engang" \| "e-conomic";/.test(traek);
};

describe("traekKilde.guard — én betalingsliste pr. virksomhed", () => {
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const flade = udenKommentarer(laes(VIRKSOMHED));
  const indstillinger = udenKommentarer(laes(INDSTILLINGER));
  const hook = udenKommentarer(laes(HOOK));
  const view = udenKommentarer(laes(INDSTILLINGER_VIEW));
  const types = laes(TYPES);
  const traek = udenKommentarer(laes(TRAEK));

  it("1. migrationen: kilde-CHECK med de tre værdier, nøgle-CHECK pr. kilde, nullable Stripe-id'er, delvist UNIQUE på e-conomic, værn før CHECK, UNIQUE på stripe_invoice_id bevaret", () => {
    expect(migrationenHolder(sql)).toBe(true);
    expect(laes(MIGRATION)).toContain("IKKE KØRT");
  });
  it("2. ingen flade antager et Stripe-id: nøgle = rækkens id, label = traekLabel, link kun via harFakturaLink", () => {
    expect(ingenFladeAntagerStripeId(flade, indstillinger)).toBe(true);
  });
  it("3. læserne henter id og kilde (useVirksomhed, IndstillingerView)", () => {
    expect(laeserneHenterKilden(hook, view)).toBe(true);
  });
  it("4. typerne følger tabellen: kilde findes, begge Stripe-id'er nullable, FejletTraek ligeså", () => {
    expect(typerneFoelgerTabellen(types, traek)).toBe(true);
  });
  it("stripe-webhook skriver fortsat uden kilde og med begge id'er (DEFAULT bærer abonnementet)", () => {
    const bygger = udenKommentarer(laes("supabase/functions/_shared/abonnementstraek.ts"));
    expect(bygger).toContain("stripe_subscription_id: abonnementId,");
    expect(bygger).toContain("stripe_invoice_id: f.id,");
    expect(bygger).not.toMatch(/kilde:/);
  });
});

describe("traekKilde.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const flade = udenKommentarer(laes(VIRKSOMHED));
  const indstillinger = udenKommentarer(laes(INDSTILLINGER));
  const hook = udenKommentarer(laes(HOOK));
  const view = udenKommentarer(laes(INDSTILLINGER_VIEW));
  const types = laes(TYPES);
  const traek = udenKommentarer(laes(TRAEK));

  it("1. en migration der dropper UNIQUE på stripe_invoice_id, eller mangler en kilde i CHECK'en, fælder dom 1", () => {
    expect(migrationenHolder(sql + "\nalter table public.company_traek drop constraint if exists company_traek_invoice_unik;\n")).toBe(false);
    expect(migrationenHolder(sql.replace("'stripe_abonnement', 'stripe_engang', 'e-conomic'", "'stripe_abonnement', 'stripe_engang'"))).toBe(false);
  });
  it("2. den gamle flade (key={t.stripe_invoice_id}, fast «Træk {nr}») fælder dom 2", () => {
    const gammel = flade.replace("<Linje key={t.id} label={traekLabel(t)}>", '<Linje key={t.stripe_invoice_id} label={t.faktura_nummer ? `Træk ${t.faktura_nummer}` : "Træk"}>');
    expect(gammel).not.toBe(flade);
    expect(ingenFladeAntagerStripeId(gammel, indstillinger)).toBe(false);
    const gammelLinje = indstillinger.replace('label: traekLabel(t, "Faktura"),', 'label: t.faktura_nummer ? `Faktura ${t.faktura_nummer}` : "Faktura",');
    expect(gammelLinje).not.toBe(indstillinger);
    expect(ingenFladeAntagerStripeId(flade, gammelLinje)).toBe(false);
  });
  it("3. en læser uden kilde i select'en fælder dom 3", () => {
    expect(laeserneHenterKilden(hook.replace('.select("id, kilde, company_id, stripe_invoice_id,', '.select("company_id, stripe_invoice_id,'), view)).toBe(false);
  });
  it("4. typer med stripe_invoice_id: string (NOT NULL) fælder dom 4", () => {
    const gammel = types.replace("stripe_invoice_id: string | null\n          stripe_subscription_id: string | null\n          updated_at: string\n        }\n        Insert: {\n          art?: string | null\n          beloeb_oere: number\n          betalt_at?: string | null\n          betalt_oere?: number\n          billing_reason?: string | null\n          company_id: string", "stripe_invoice_id: string\n          stripe_subscription_id: string\n          updated_at: string\n        }\n        Insert: {\n          art?: string | null\n          beloeb_oere: number\n          betalt_at?: string | null\n          betalt_oere?: number\n          billing_reason?: string | null\n          company_id: string");
    expect(gammel).not.toBe(types);
    expect(typerneFoelgerTabellen(gammel, traek)).toBe(false);
  });
});
