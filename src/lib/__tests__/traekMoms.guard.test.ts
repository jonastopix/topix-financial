import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «priserne ekskl. moms — momsen gemt pr. betaling» (16/9-2026).
// Fem ting låses:
//   1. Migrationen: moms_oere integer NULL og CHECK'en (null eller 0 ≤ moms ≤ beloeb).
//   2. Skriveren: bygTraekRaekke sætter moms_oere via momsFraFaktura, som læser
//      total_taxes (basil), tax, total_tax_amounts, total − total_excluding_tax
//      — og INGEN kode i motoren eller fladerne ganger med 0,8/0,2 eller
//      dividerer med 1,25 (25 % må aldrig antages).
//   3. Fladerne: begge betalingslister skriver beløbet gennem beloebTekst
//      (ekskl. når kendt, ellers «inkl. moms»), og periodelinjerne siger
//      «ekskl. moms». Ingen rå beloebKr(t.beloeb_oere) på en træklinje.
//   4. Læserne henter moms_oere (useVirksomhed, IndstillingerView,
//      VirksomhedslisteView, webhookens klokke-opslag); typerne bærer kolonnen.
//   5. Klokken: traekFejletBeskedTekst skriver beløbet gennem traekBeloebTekst.
// Kildelæsning (forsidenKaster.guard-mønstret) med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260917120000_company_traek_moms.sql";
const MOTOR = "supabase/functions/_shared/abonnementstraek.ts";
const KLOKKE = "supabase/functions/_shared/raadgiverBeskedTekst.ts";
const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";
const TRAEK = "src/lib/traek.ts";
const VIRKSOMHED = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const HOOK = "src/hooks/useVirksomhed.ts";
const INDSTILLINGER = "src/lib/hjemmebane/indstillinger.ts";
const INDSTILLINGER_VIEW = "src/components/hjemmebane/indstillinger/IndstillingerView.tsx";
const LISTE = "src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx";
const TYPES = "src/integrations/supabase/types.ts";

/** Dom 1: migrationen. */
export const migrationenHolder = (sql: string): boolean =>
  /add column if not exists moms_oere integer;/.test(sql) &&
  /add constraint company_traek_moms_check\s+check \(moms_oere is null or \(moms_oere >= 0 and moms_oere <= beloeb_oere\)\);/.test(sql) &&
  !/moms_oere integer not null/.test(sql) &&
  !/default 0/.test(sql);

/** Dom 2a: skriveren læser Stripes felter i rækkefølge og sætter moms_oere. */
export const skriverenHolder = (motor: string): boolean =>
  /export function momsFraFaktura\(/.test(motor) &&
  /Array\.isArray\(f\.total_taxes\)/.test(motor) &&
  /tal\(f\.tax\)/.test(motor) &&
  /Array\.isArray\(f\.total_tax_amounts\)/.test(motor) &&
  /tal\(f\.total_excluding_tax\)/.test(motor) &&
  /moms_oere: momsFraFaktura\(f\),/.test(motor) &&
  /moms_oere: number \| null;/.test(motor);

/** Dom 2b: ingen antaget momssats — hverken i motor, klokke eller flader. */
export const ingenAntagetMoms = (kode: string): boolean =>
  !/[*/]\s*(1\.25|0\.8|0\.2|1,25|0,8|0,2)\b/.test(kode) && !/\b(0\.25|25 ?%|MOMS(SATS|_PCT))\b/.test(kode);

/** Dom 3: fladerne. */
export const fladerneHolder = (traek: string, virksomhed: string, indstillinger: string): boolean =>
  /export function beloebEksMoms\(/.test(traek) &&
  /export function beloebTekst\(/.test(traek) &&
  /`\$\{beloebKr\(t\.beloeb_oere\)\} inkl\. moms`/.test(traek) &&
  /`\$\{beloebKr\(eks\)\} ekskl\. moms`/.test(traek) &&
  virksomhed.includes("{beloebTekst(t)} · {t.status}") &&
  !/beloebKr\(t\.beloeb_oere\)/.test(virksomhed) &&
  virksomhed.includes("{formatKr(p.beloeb_oere)} ekskl. moms ·") &&
  indstillinger.includes("vaerdi: `${beloebTekst(t)} · ${traekStatusOrd(t.status)}") &&
  indstillinger.includes("vaerdi: `${beloebKr(p.beloeb_oere)} ekskl. moms · ${model}") &&
  !/beloebKr\(t\.beloeb_oere\)/.test(indstillinger);

/** Dom 4: læserne henter kolonnen, typerne bærer den. */
export const laeserneHolder = (hook: string, view: string, liste: string, webhook: string, types: string): boolean =>
  /\.select\("id, kilde, company_id, stripe_invoice_id, beloeb_oere, moms_oere, /.test(hook) &&
  /\.select\("id, kilde, stripe_invoice_id, status, beloeb_oere, moms_oere, /.test(view) &&
  /\.select\("company_id, stripe_invoice_id, beloeb_oere, moms_oere, /.test(liste) &&
  /\.select\("id, status, company_id, beloeb_oere, moms_oere, fejl_besked, /.test(webhook) &&
  (types.match(/moms_oere\?: number \| null/g) ?? []).length === 2 &&
  /moms_oere: number \| null\n/.test(types);

/** Dom 5: klokken. */
export const klokkenHolder = (klokke: string): boolean =>
  /export function traekBeloebTekst\(/.test(klokke) &&
  /kr\. ekskl\. moms`/.test(klokke) &&
  /kr\. inkl\. moms`/.test(klokke) &&
  /et træk på \$\{traekBeloebTekst\(a\.beloebOere, a\.momsOere\)\} fejlede/.test(klokke) &&
  /momsOere: a\.traek\.moms_oere \?\? null,/.test(klokke) &&
  !/et træk på \$\{formatKrOere\(a\.beloebOere\)\} kr\. fejlede/.test(klokke);

describe("traekMoms.guard — momsen gemt pr. betaling, aldrig antaget", () => {
  it("dom 1: migrationen tilføjer moms_oere NULL med CHECK 0 ≤ moms ≤ beloeb — ingen NOT NULL, ingen DEFAULT 0", () => {
    expect(migrationenHolder(udenSqlKommentarer(laes(MIGRATION)))).toBe(true);
  });
  it("dom 2a: bygTraekRaekke sætter moms_oere fra momsFraFaktura (total_taxes → tax → total_tax_amounts → total − total_excluding_tax)", () => {
    expect(skriverenHolder(udenKommentarer(laes(MOTOR)))).toBe(true);
  });
  it("dom 2b: ingen kode antager 25 % — hverken motor, klokke, lib/traek, indstillinger eller fladerne", () => {
    for (const sti of [MOTOR, KLOKKE, TRAEK, INDSTILLINGER, VIRKSOMHED, INDSTILLINGER_VIEW]) {
      expect(ingenAntagetMoms(udenKommentarer(laes(sti))), sti).toBe(true);
    }
  });
  it("dom 3: begge betalingslister skriver træk gennem beloebTekst og perioder med «ekskl. moms»", () => {
    expect(fladerneHolder(udenKommentarer(laes(TRAEK)), udenKommentarer(laes(VIRKSOMHED)), udenKommentarer(laes(INDSTILLINGER)))).toBe(true);
  });
  it("dom 4: læserne henter moms_oere, og types.ts bærer kolonnen i Row/Insert/Update", () => {
    expect(laeserneHolder(udenKommentarer(laes(HOOK)), udenKommentarer(laes(INDSTILLINGER_VIEW)), udenKommentarer(laes(LISTE)), udenKommentarer(laes(WEBHOOK)), laes(TYPES))).toBe(true);
  });
  it("dom 5: klokkens træk-titel går gennem traekBeloebTekst, og dommen bærer rækkens moms_oere", () => {
    expect(klokkenHolder(udenKommentarer(laes(KLOKKE)))).toBe(true);
  });

  // Selvbevis: dommene falder på kopier med fejlen sat ind.
  it("selvbevis 1: migration med NOT NULL eller uden CHECK falder", () => {
    const sql = udenSqlKommentarer(laes(MIGRATION));
    expect(migrationenHolder(sql.replace("moms_oere integer;", "moms_oere integer not null default 0;"))).toBe(false);
    expect(migrationenHolder(sql.replace("add constraint company_traek_moms_check", "add constraint company_traek_moms_x"))).toBe(false);
  });
  it("selvbevis 2: motor der antager 25 % eller ikke sætter moms_oere falder", () => {
    const motor = udenKommentarer(laes(MOTOR));
    expect(skriverenHolder(motor.replace("moms_oere: momsFraFaktura(f),", "moms_oere: null,"))).toBe(false);
    expect(ingenAntagetMoms(motor + "\nconst m = Math.round(f.total * 0.2);")).toBe(false);
    expect(ingenAntagetMoms(motor + "\nconst e = f.total / 1.25;")).toBe(false);
    expect(ingenAntagetMoms(motor + "\nconst MOMSSATS = 25;")).toBe(false);
  });
  it("selvbevis 3: flade med rå beloebKr(t.beloeb_oere) eller periodelinje uden ordet falder", () => {
    const traek = udenKommentarer(laes(TRAEK));
    const flade = udenKommentarer(laes(VIRKSOMHED));
    const ind = udenKommentarer(laes(INDSTILLINGER));
    expect(fladerneHolder(traek, flade.replace("{beloebTekst(t)} · {t.status}", "{beloebKr(t.beloeb_oere)} · {t.status}"), ind)).toBe(false);
    expect(fladerneHolder(traek, flade.replace("{formatKr(p.beloeb_oere)} ekskl. moms ·", "{formatKr(p.beloeb_oere)} ·"), ind)).toBe(false);
    expect(fladerneHolder(traek, flade, ind.replace("vaerdi: `${beloebTekst(t)} ·", "vaerdi: `${beloebKr(t.beloeb_oere)} ·"))).toBe(false);
    expect(fladerneHolder(traek.replace("} inkl. moms`", "} kr.`"), flade, ind)).toBe(false);
  });
  it("selvbevis 4: en læser uden moms_oere eller types uden kolonnen falder", () => {
    const hook = udenKommentarer(laes(HOOK)), view = udenKommentarer(laes(INDSTILLINGER_VIEW)), liste = udenKommentarer(laes(LISTE)), webhook = udenKommentarer(laes(WEBHOOK)), types = laes(TYPES);
    expect(laeserneHolder(hook.replace("beloeb_oere, moms_oere, ", "beloeb_oere, "), view, liste, webhook, types)).toBe(false);
    expect(laeserneHolder(hook, view, liste, webhook.replace("beloeb_oere, moms_oere, fejl_besked", "beloeb_oere, fejl_besked"), types)).toBe(false);
    expect(laeserneHolder(hook, view, liste, webhook, types.replace("moms_oere: number | null\n", "\n"))).toBe(false);
  });
  it("selvbevis 5: klokke der skriver det rå beløb falder", () => {
    const klokke = udenKommentarer(laes(KLOKKE));
    expect(klokkenHolder(klokke.replace("${traekBeloebTekst(a.beloebOere, a.momsOere)} fejlede", "${formatKrOere(a.beloebOere)} kr. fejlede"))).toBe(false);
    expect(klokkenHolder(klokke.replace("momsOere: a.traek.moms_oere ?? null,", ""))).toBe(false);
  });
});
