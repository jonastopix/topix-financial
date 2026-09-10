/**
 * Døren (11/9, recon-doeren.md): «betalt» = en slutdato der GÆLDER, ikke
 * en der findes — i alle seks døre. Kildeværn: migrationen (de to SQL-
 * funktioner), fakturaen, påmindelsescronen og webhookens status-skrivning
 * læses som filer, og motorens grænse dømmes fra begge sider.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erGaeldendeSlutdato } from "@/lib/betalingsfrist";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const migration = laes("supabase/migrations/20260911050000_doeren_gaeldende_slutdato.sql");
const faktura = laes("supabase/functions/_shared/indgangsFaktura.ts");
const cron = laes("supabase/functions/indgangs-paamindelser-cron/index.ts");
const webhook = laes("supabase/functions/stripe-webhook/index.ts");

describe("dør 1 og 2 — SQL'en dømmer på + 1 > now(), ikke på is not null alene", () => {
  const tilbud = migration.split("hent_betalingstilbud(betalingstoken uuid)")[1]?.split("$$;")[0] ?? "";
  const checkout = migration.split("hent_betalingsdata_til_checkout(betalingstoken uuid)")[1]?.split("$$;")[0] ?? "";

  it("hent_betalingstilbud: betalt kræver en slutdato der gælder", () => {
    expect(tilbud).toContain("when c.contract_end_date is not null\n       and c.contract_end_date + 1 > now()       then 'betalt'");
    expect(tilbud).not.toMatch(/is not null\s+then 'betalt'/);
  });
  it("hent_betalingsdata_til_checkout: ikke betalt = ingen slutdato ELLER en passeret", () => {
    expect(checkout).toContain("and (c.contract_end_date is null or c.contract_end_date + 1 <= now())");
    expect(checkout).not.toMatch(/and c\.contract_end_date is null\s*\n/);
  });
  it("begge funktioner er med, SECURITY DEFINER, og filen er ikke kørt", () => {
    expect(migration).toContain("create or replace function public.hent_betalingstilbud");
    expect(migration).toContain("create or replace function public.hent_betalingsdata_til_checkout");
    expect((migration.match(/security definer/g) ?? []).length).toBe(2);
    expect(migration).toContain("IKKE KØRT");
  });
});

describe("dør 3–5 — TypeScript-dørene bruger motorens dom", () => {
  it("indgangsFaktura dømmer med erGaeldendeSlutdato, ikke på om datoen findes", () => {
    expect(faktura).toContain('import { erGaeldendeSlutdato } from "./betalingsfrist.ts"');
    expect(faktura).toContain("if (erGaeldendeSlutdato(virksomhed.contract_end_date, new Date()))");
    expect(faktura).not.toContain("if (virksomhed.contract_end_date) {");
  });
  it("påmindelsescronen filtrerer ikke længere på contract_end_date — motoren dømmer", () => {
    expect(cron).not.toContain('.is("contract_end_date", null)');
    expect(cron).toContain("afgoerBetalingsfrist(");
  });
});

describe("fejlen bag — en betaling sætter status 'active' (indgang OG fornyelse)", () => {
  it("skrivIndgangsKontrakt skriver status: \"active\" sammen med datoen", () => {
    const fn = webhook.split("async function skrivIndgangsKontrakt(")[1]?.split("\n}\n")[0] ?? "";
    expect(fn).toContain('contract_end_date: periode.periode_slut,');
    expect(fn).toContain('status: "active",');
  });
  it("fornyelsens to companies-opdateringer skriver status: \"active\"", () => {
    const antal = (webhook.match(/contract_end_date: (eksisterende\.periode_slut|periode_slut), status: "active"/g) ?? []).length;
    expect(antal).toBe(2);
  });
  it("genindtræden læses FØR perioden indsættes, i begge indgangsveje", () => {
    expect((webhook.match(/const forrigeLaest = await laesForrigeKontrakt\(/g) ?? []).length).toBe(2);
    expect((webhook.match(/note: genindtraedelsesNoteHvisNoedvendig\(forrigeLaest, nu\)/g) ?? []).length).toBe(2);
    expect((webhook.match(/await meldGenindtraeden\(/g) ?? []).length).toBe(2);
  });
});

describe("dommen fra begge sider — samme grænse som SQL'ens + 1 > now()", () => {
  const nu = new Date("2026-09-11T10:00:00.000Z");
  it("i morgen og i dag er betalt; i går er ikke", () => {
    expect(erGaeldendeSlutdato("2026-09-12", nu)).toBe(true);
    expect(erGaeldendeSlutdato("2026-09-11", nu)).toBe(true);
    expect(erGaeldendeSlutdato("2026-09-10", nu)).toBe(false);
  });
  it("slutdagen lukker præcis kl. 00:00 UTC dagen efter", () => {
    expect(erGaeldendeSlutdato("2026-09-11", new Date("2026-09-11T23:59:59.999Z"))).toBe(true);
    expect(erGaeldendeSlutdato("2026-09-11", new Date("2026-09-12T00:00:00.000Z"))).toBe(false);
  });
  it("manglende, tom og ulæselig dato er ikke betalt", () => {
    expect(erGaeldendeSlutdato(null, nu)).toBe(false);
    expect(erGaeldendeSlutdato(undefined, nu)).toBe(false);
    expect(erGaeldendeSlutdato("", nu)).toBe(false);
    expect(erGaeldendeSlutdato("ikke-en-dato", nu)).toBe(false);
  });
});
