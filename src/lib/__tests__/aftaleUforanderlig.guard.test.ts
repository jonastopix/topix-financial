import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for uforanderligheden af det underskrevne dokument (recon-pengene §3, 18/9-2026):
//   1. Migrationen står som IKKE KØRT, uden SECURITY DEFINER, med BEFORE UPDATE på aftale_underskrift
//      og BEFORE UPDATE OR DELETE på aftale_spor, og låser præcis de felter der gør dokumentet til et bevis.
//   2. aftale_spor: UPDATE afvises altid; DELETE kun direkte (pg_trigger_depth() <= 1) — cascaden må.
//   3. Koden skriver kun det triggeren tillader: aftale-underskrift's tre UPDATEs (status+underskrevet_*,
//      pdf_*, kvittering_sendt_at) og send-til-underskrift's annullering — ALDRIG dokument_tekst/aftryk,
//      token, sendt_* eller underskrevet_* uden status-skiftet; aftale_spor kun INSERT.
//   4. SECURITY_BASELINE.md bogfører begge triggere i §3.
// Selvbevis: hvert prædikat fælder en muteret kopi. Selve adfærden er målt i WASM-Postgres
// (~/Downloads/udkast-aftale-uforanderlig/test/) — vitest har ingen database.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenSql = (k: string) => k.replace(/^\s*--[^\n]*$/gm, "");
const udenTs = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260918290000_aftale_uforanderlig.sql";
const OFFENTLIG = "supabase/functions/aftale-underskrift/index.ts";
const RAADGIVER = "supabase/functions/send-til-underskrift/index.ts";
const BASELINE = "supabase/SECURITY_BASELINE.md";

export const ALTID_LAAST = ["token", "ansoegning_id", "company_id", "skabelon_id", "dokument_titel", "dokument_tekst", "dokument_aftryk", "prisniveau_oere", "modtager_email", "modtager_navn", "sendt_at", "sendt_af", "created_at"];
export const LAAST_EFTER_UNDERSKRIFT = ["underskrevet_at", "underskrevet_navn", "underskrevet_ip", "underskrevet_user_agent"];

export function migrationenErRigtig(raa: string): string[] {
  const f: string[] = [];
  if (!raa.startsWith("-- IKKE KØRT.")) f.push("mangler IKKE KØRT-hovedet");
  const k = udenSql(raa);
  if (/security definer/i.test(k)) f.push("SECURITY DEFINER");
  if (!/create trigger protect_aftale_immutable_fields\s+before update on public\.aftale_underskrift/i.test(k)) f.push("BEFORE UPDATE-triggeren på aftale_underskrift mangler");
  if (!/create trigger protect_aftale_spor\s+before update or delete on public\.aftale_spor/i.test(k)) f.push("BEFORE UPDATE OR DELETE-triggeren på aftale_spor mangler");
  for (const felt of ALTID_LAAST) if (!new RegExp(`new\\.${felt} is distinct from old\\.${felt} then raise exception`).test(k)) f.push(`${felt} er ikke låst`);
  if (!/if old\.status = 'underskrevet' then/.test(k)) f.push("ingen lås efter underskrift");
  for (const felt of LAAST_EFTER_UNDERSKRIFT) if (!new RegExp(`new\\.${felt} is distinct from old\\.${felt} then raise exception '[^']*after signing'`).test(k)) f.push(`${felt} er ikke låst efter underskrift`);
  if (!/new\.status is distinct from old\.status then raise exception 'aftale_underskrift\.status cannot leave underskrevet'/.test(k)) f.push("status kan forlade underskrevet");
  if (!/old\.pdf_sti is not null and new\.pdf_sti is distinct from old\.pdf_sti/.test(k)) f.push("pdf_sti kan ændres når sat");
  if (!/tg_op = 'UPDATE' then\s+raise exception/.test(k)) f.push("aftale_spor UPDATE afvises ikke");
  if (!/pg_trigger_depth\(\) <= 1 then\s+raise exception/.test(k)) f.push("direkte DELETE på aftale_spor afvises ikke (eller cascaden afvises)");
  if (!/set search_path to 'public'/.test(k)) f.push("search_path");
  if (!raa.includes("ROLLBACK:") || !raa.includes("drop trigger if exists protect_aftale_spor")) f.push("rollback mangler");
  return f;
}

/** Hvilke kolonner en `.update({ … })` på aftale_underskrift sætter — nøglerne i objektet. */
export function updateNoegler(k: string, tabel: string): string[][] {
  const ud: string[][] = [];
  const re = new RegExp(`\\.from\\("${tabel}"\\)\\s*\\.update\\(\\{([\\s\\S]*?)\\}\\)`, "g");
  for (const m of k.matchAll(re)) ud.push([...m[1].matchAll(/([a-z_]+)\s*:/g)].map((x) => x[1]));
  return ud;
}
const FORBUDT_AT_SKRIVE = new Set([...ALTID_LAAST]);
export function kodenSkriverKunDetTilladte(offentlig: string, raadgiver: string): string[] {
  const f: string[] = [];
  const sets = [...updateNoegler(offentlig, "aftale_underskrift"), ...updateNoegler(raadgiver, "aftale_underskrift")];
  if (sets.length < 4) f.push(`fandt kun ${sets.length} updates — målingen er brudt`);
  for (const s of sets) {
    for (const n of s) if (FORBUDT_AT_SKRIVE.has(n)) f.push(`koden skriver ${n}`);
    const saetterUnderskrift = s.some((n) => LAAST_EFTER_UNDERSKRIFT.includes(n));
    if (saetterUnderskrift && !s.includes("status")) f.push(`underskrevet_* skrives uden status: ${s.join(",")}`);
  }
  for (const k of [offentlig, raadgiver]) {
    for (const m of k.matchAll(/\.from\("aftale_spor"\)\s*\.(\w+)\(/g)) if (m[1] !== "insert" && m[1] !== "select") f.push(`aftale_spor.${m[1]}`);
  }
  return f;
}

describe("aftaleUforanderlig.guard — migrationen, koden og baseline", () => {
  it("1+2. migrationen låser dokumentet, underskriften og sporet — og kun cascaden må slette spor", () => {
    expect(migrationenErRigtig(laes(MIGRATION))).toEqual([]);
  });
  it("3. koden skriver kun det triggeren tillader", () => {
    expect(kodenSkriverKunDetTilladte(udenTs(laes(OFFENTLIG)), udenTs(laes(RAADGIVER)))).toEqual([]);
  });
  it("4. SECURITY_BASELINE §3 bogfører begge triggere", () => {
    const b = laes(BASELINE);
    expect(b).toContain("`protect_aftale_immutable_fields()` on `aftale_underskrift BEFORE UPDATE`");
    expect(b).toContain("`protect_aftale_spor()` on `aftale_spor BEFORE UPDATE OR DELETE`");
  });
});

describe("aftaleUforanderlig.guard — selvbevis", () => {
  const raa = laes(MIGRATION);
  it("1: en lås fjernet, eller depth-reglen slækket, falder", () => {
    expect(migrationenErRigtig(raa.replace("if new.dokument_tekst is distinct from old.dokument_tekst then raise exception", "if false then raise exception"))).not.toEqual([]);
    expect(migrationenErRigtig(raa.replace("pg_trigger_depth() <= 1 then", "pg_trigger_depth() = 0 then"))).not.toEqual([]);
    expect(migrationenErRigtig(raa.replace("-- IKKE KØRT.", "-- KØRT."))).not.toEqual([]);
  });
  it("3: en update der skriver dokument_tekst, eller underskrevet_navn uden status, falder", () => {
    const o = udenTs(laes(OFFENTLIG));
    expect(kodenSkriverKunDetTilladte(o + '\nawait admin.from("aftale_underskrift").update({ dokument_tekst: "x" }).eq("id", 1);\n', udenTs(laes(RAADGIVER)))).not.toEqual([]);
    expect(kodenSkriverKunDetTilladte(o + '\nawait admin.from("aftale_underskrift").update({ underskrevet_navn: "x" }).eq("id", 1);\n', udenTs(laes(RAADGIVER)))).not.toEqual([]);
    expect(kodenSkriverKunDetTilladte(o + '\nawait admin.from("aftale_spor").delete().eq("id", 1);\n', udenTs(laes(RAADGIVER)))).not.toEqual([]);
  });
});
