import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for (12) betalingssiden efter fristen (16/9-2026). Fem ting
// låses, så «vi har sendt» aldrig igen kan komme før fakturaen — og så
// mailadressen aldrig når siden:
//   1. Betal.tsx' frist_overskredet-gren dømmer gennem afgoerEfterFristen —
//      den gamle faste streng «Vi har sendt en faktura på det fulde beløb»
//      findes ikke længere i fladen.
//   2. Knappen er et <a> med href fra dommen, target="_blank" og
//      rel="noopener noreferrer" — ingen literal-URL, ingen window.open.
//   3. Fladen nævner ingen mail: hverken contact_email, kontakt_email eller
//      en mail-nøgle på tilbuddet. (Husets egen KONTAKT_ADRESSE er ikke
//      medlemmets og låses af kontaktadresseFladen.guard.)
//   4. Migrationen 20260916150000: hent_betalingstilbud returnerer
//      'faktura_sendt_den' (::date::text) og 'faktura_url', nævner IKKE
//      contact_email, er stadig SECURITY DEFINER med search_path public,
//      dømmer «betalt» stadig på + 1 > now() (døren, 20260911050000 — den fil
//      der kører sidst gælder), og grants går til anon/authenticated/
//      service_role efter REVOKE FROM public.
//   5. _shared/indgangsFaktura.ts' stemplFaktura skriver faktura_url i SAMME
//      UPDATE som faktura_sendt_at — aldrig et link uden stempel.
// React/SQL/Deno uden ren funktion at kalde → kildelæsning
// (betalKvittering.guard-/doeren.guard-mønstret), og værnet beviser sig selv
// på KOPIER med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
/** SQL: strip «-- …»-kommentarer, så filhovedets FØR-tekst ikke kan give falsk grønt. */
export const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const FLADE = "src/pages/Betal.tsx";
const MIGRATION = "supabase/migrations/20260916150000_betal_efter_fristen.sql";
const FAKTURA = "supabase/functions/_shared/indgangsFaktura.ts";

const GAMMEL_TEKST = "Vi har sendt en faktura på det fulde beløb";

/** Gren 6: fra `tilbud.status === "frist_overskredet"` til næste gren (`tilbud.status === "betalt"`). */
export function grenSeks(kilde: string): string {
  const start = kilde.indexOf('tilbud.status === "frist_overskredet"');
  if (start === -1) throw new Error("Betal.tsx: fandt ikke gren 6");
  const slut = kilde.indexOf('tilbud.status === "betalt"', start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut);
}

/** Funktionskroppen for hent_betalingstilbud i migrationen. */
export function funktionskrop(sql: string): string {
  return sql.split("hent_betalingstilbud(betalingstoken uuid)")[1]?.split("$$;")[0] ?? "";
}

/** stemplFaktura-blokken: fra `async function stemplFaktura(` til `\n}`. */
export function stemplBlok(kilde: string): string {
  const start = kilde.indexOf("async function stemplFaktura(");
  if (start === -1) throw new Error("indgangsFaktura.ts: fandt ikke stemplFaktura");
  const slut = kilde.indexOf("\n}", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 2);
}

// Dommene
export const doemmerGennemDommen = (gren: string): boolean =>
  gren.includes("afgoerEfterFristen(tilbud)") && !gren.includes(GAMMEL_TEKST);
export const knappenErSikker = (gren: string): boolean =>
  /href=\{efter\.knap\.href\}/.test(gren) && /target="_blank"/.test(gren) && /rel="noopener noreferrer"/.test(gren) && !/window\.open\(/.test(gren) && !/href="https?:/.test(gren);
export const naevnerMail = (kilde: string): boolean => /contact_email|kontakt_email|tilbud\.mail|tilbud\.email/.test(kilde);
export const kroppenErRigtig = (krop: string): boolean =>
  krop.includes("'faktura_sendt_den', bl.faktura_sendt_at::date::text") &&
  krop.includes("'faktura_url',       bl.faktura_url") &&
  !/contact_email|kontakt_email/.test(krop) &&
  krop.includes("when c.contract_end_date is not null\n       and c.contract_end_date + 1 > now()       then 'betalt'") &&
  !/is not null\s+then 'betalt'/.test(krop) &&
  krop.includes("security definer") &&
  krop.includes("set search_path to 'public'") &&
  krop.includes("where bl.token = betalingstoken");
export const grantsErRigtige = (sql: string): boolean =>
  sql.includes("revoke all on function public.hent_betalingstilbud(uuid) from public;") &&
  sql.includes("grant execute on function public.hent_betalingstilbud(uuid) to anon;") &&
  sql.includes("grant execute on function public.hent_betalingstilbud(uuid) to authenticated;") &&
  sql.includes("grant execute on function public.hent_betalingstilbud(uuid) to service_role;");
export const linketFoelgerStemplet = (blok: string): boolean =>
  blok.includes("faktura_sendt_at: sendtAt,") && blok.includes("faktura_url: faktura.hosted_invoice_url ?? null,");

describe("betalEfterFristen.guard — «vi har sendt» følger stemplet, og mailen når aldrig siden", () => {
  const flade = udenKommentarer(laes(FLADE));
  const gren = grenSeks(flade);
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const krop = funktionskrop(sql);
  const faktura = udenKommentarer(laes(FAKTURA));

  it("1. gren 6 dømmer gennem afgoerEfterFristen — den gamle faste tekst findes ikke i fladen", () => {
    expect(doemmerGennemDommen(gren)).toBe(true);
    expect(flade).not.toContain(GAMMEL_TEKST);
    expect(flade).toContain('import { afgoerEfterFristen, formaterFrist } from "@/lib/betalEfterFristen";');
    // formaterFrist er flyttet: ingen egen kopi i fladen.
    expect(flade).not.toContain("function formaterFrist(");
    expect(flade).toContain("Betal inden {formaterFrist(tilbud.frist)}.");
  });

  it("2. knappen er et <a> med dommens href, nyt vindue uden opener — ingen literal, ingen window.open", () => {
    expect(knappenErSikker(gren)).toBe(true);
    expect(gren).toContain("{efter.knap.label}");
  });

  it("3. fladen nævner ingen mailadresse, og tilbudstypen bærer ingen", () => {
    expect(naevnerMail(flade)).toBe(false);
    expect(flade).toContain("faktura_sendt_den: string | null;");
    expect(flade).toContain("faktura_url: string | null;");
  });

  it("4. migrationen: de to nye felter, ingen mail, SECURITY DEFINER + search_path, «+ 1 > now()» og grants", () => {
    expect(kroppenErRigtig(krop)).toBe(true);
    expect(grantsErRigtige(sql)).toBe(true);
    expect(sql).toContain("add column if not exists faktura_url text;");
    expect((sql.match(/security definer/g) ?? []).length).toBe(1); // kun hent_betalingstilbud — checkout røres ikke
    expect(sql).not.toContain("hent_betalingsdata_til_checkout(betalingstoken uuid)\nreturns");
    expect(laes(MIGRATION)).toContain("IKKE KØRT");
    expect(laes(MIGRATION)).toContain("3529d05e158a71873a6791f5cd08b0c5");
  });

  it("5. stemplFaktura skriver faktura_url i samme UPDATE som faktura_sendt_at", () => {
    expect(linketFoelgerStemplet(stemplBlok(faktura))).toBe(true);
    // Ét sted: linket skrives ikke andre steder i filen.
    expect((faktura.match(/faktura_url:/g) ?? []).length).toBe(1);
  });
});

describe("betalEfterFristen.guard — dommene fanger fejlen på en kopi", () => {
  const flade = udenKommentarer(laes(FLADE));
  const gren = grenSeks(flade);
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const krop = funktionskrop(sql);
  const blok = stemplBlok(udenKommentarer(laes(FAKTURA)));

  it("1. den gamle tekst tilbage i grenen, eller dommen væk, fælder dom 1", () => {
    expect(doemmerGennemDommen(gren + `\n<Overskrift tekst="${GAMMEL_TEKST}, og pladsen står stadig klar til dig." />`)).toBe(false);
    expect(doemmerGennemDommen(gren.replace("afgoerEfterFristen(tilbud)", "({ titel: 'x', tekst: 'y', knap: null })"))).toBe(false);
  });

  it("2. en literal-URL, window.open eller manglende rel fælder dom 2", () => {
    expect(knappenErSikker(gren.replace("href={efter.knap.href}", 'href="https://invoice.stripe.com/i/x"'))).toBe(false);
    expect(knappenErSikker(gren.replace('rel="noopener noreferrer"', ""))).toBe(false);
    expect(knappenErSikker(gren + "\nwindow.open(efter.knap.href)")).toBe(false);
  });

  it("3. en mail i fladen fælder dom 3", () => {
    expect(naevnerMail(flade + "\n<p>{tilbud.kontakt_email}</p>")).toBe(true);
  });

  it("4. contact_email i kroppen, den gamle betalt-dom, manglende search_path eller manglende grant fælder dom 4", () => {
    expect(kroppenErRigtig(krop.replace("'faktura_url',       bl.faktura_url", "'faktura_url',       bl.faktura_url,\n    'mail', c.contact_email"))).toBe(false);
    expect(kroppenErRigtig(krop.replace("when c.contract_end_date is not null\n       and c.contract_end_date + 1 > now()       then 'betalt'", "when c.contract_end_date is not null then 'betalt'"))).toBe(false);
    expect(kroppenErRigtig(krop.replace("set search_path to 'public'", ""))).toBe(false);
    expect(grantsErRigtige(sql.replace("grant execute on function public.hent_betalingstilbud(uuid) to anon;", ""))).toBe(false);
  });

  it("5. et link skrevet uden stemplet, eller stemplet uden link, fælder dom 5", () => {
    expect(linketFoelgerStemplet(blok.replace("faktura_url: faktura.hosted_invoice_url ?? null,", ""))).toBe(false);
    expect(linketFoelgerStemplet(blok.replace("faktura_sendt_at: sendtAt,", ""))).toBe(false);
  });
});
