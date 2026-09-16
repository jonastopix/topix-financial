import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SAMLEMAIL_TIME_DANSK, SAMLEMAIL_TYPER } from "../../../supabase/functions/_shared/samlemail.ts";
import { SAMLEMAIL_TIME_DANSK as KLIENTENS_TIME } from "@/lib/cronVagt";

// Værn (16/9 2026, niende version af vagt_cron): vagten dømmer i SQL, og
// samlemailen bor i TypeScript (samlemail.ts). Målt 16/9 15:07 var vagten rød
// for 25 community_opslag der ventede legitimt på kl. 17. Reglen i SQL skal
// derfor bære SAMME typeliste og SAMME klokkeslæt som samlemail.ts — og
// klienten (cronVagt.ts) siger klokkeslættet med ord. De tre kan ikke
// importere hinanden; værnet læser dem som kilde og sammenligner.
//
// METODEN for «alt andet ordret som ottende version»: de nye linjer i den
// niende migration er mærket «-- NIENDE» (enkeltlinje) og «-- NIENDE >>>» …
// «-- <<< NIENDE» (blok). Værnet fjerner mærkede linjer og blokke fra
// funktionskroppen (CREATE OR REPLACE … $$;) og kræver at resten er tegn for
// tegn lig ottende versions krop (20260910170000). En umærket ændring — også
// et mellemrum — fejler. Dertil kræves hoved (SECURITY DEFINER, search_path)
// og de tre REVOKE-linjer ordret.

const ROD = process.cwd();
const MAPPE = resolve(ROD, "supabase/migrations");
const OTTENDE = "20260910170000_vagtens_timeouts.sql";
const laes = (fil: string) => readFileSync(join(MAPPE, fil), "utf8");

/** Den nyeste migrationsfil (sorteret på tidsstemplet i navnet) der definerer vagt_cron. */
export function nyesteVagtMigration(): { fil: string; sql: string } {
  const med = readdirSync(MAPPE)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => laes(f).includes("CREATE OR REPLACE FUNCTION public.vagt_cron()"));
  if (med.length === 0) throw new Error("ingen migration definerer public.vagt_cron()");
  const fil = med[med.length - 1];
  return { fil, sql: laes(fil) };
}

/** Funktionens krop: fra CREATE OR REPLACE til og med det afsluttende «$$;». */
export function vagtKrop(sql: string): string {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.vagt_cron()");
  if (start < 0) throw new Error("ingen CREATE OR REPLACE FUNCTION public.vagt_cron()");
  const slut = sql.indexOf("\n$$;\n", start);
  if (slut < 0) throw new Error("kroppen slutter ikke med $$;");
  return sql.slice(start, slut + "\n$$;\n".length);
}

/** Fjerner alle NIENDE-mærkede linjer og blokke. */
export function udenNiende(krop: string): string {
  return krop
    .replace(/^[ \t]*-- NIENDE >>>\n[\s\S]*?^[ \t]*-- <<< NIENDE\n/gm, "")
    .replace(/^.*-- NIENDE\n/gm, "");
}

/** Typelisten ordret: `v_samlemail_typer constant text[] := ARRAY['a', 'b'];` */
export function sqlTypeliste(sql: string): string[] {
  const m = sql.match(/v_samlemail_typer constant text\[\] := ARRAY\[([^\]]*)\];/);
  if (!m) throw new Error("ingen `v_samlemail_typer constant text[] := ARRAY[…];`");
  return m[1].split(",").map((s) => s.trim().replace(/^'(.*)'$/, "$1")).filter(Boolean);
}

/** Klokkeslættet ordret: `v_samlemail_time constant integer := 17;` */
export function sqlKlokkeslaet(sql: string): number {
  const m = sql.match(/v_samlemail_time constant integer := (\d+);/);
  if (!m) throw new Error("ingen `v_samlemail_time constant integer := N;`");
  return Number(m[1]);
}

const HOVED = "CREATE OR REPLACE FUNCTION public.vagt_cron()\nRETURNS public.cron_vagt_log\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\n";
const REVOKES = [
  "REVOKE ALL ON FUNCTION public.vagt_cron() FROM PUBLIC;",
  "REVOKE ALL ON FUNCTION public.vagt_cron() FROM anon;",
  "REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;",
];

/** Dommen over en migrationstekst: kaster med grunden. */
export function doemVagtMigration(sql: string): void {
  if (!sql.includes(HOVED)) throw new Error("hovedet er ikke ordret (SECURITY DEFINER / SET search_path = public / RETURNS cron_vagt_log)");
  for (const r of REVOKES) if (!sql.includes(r)) throw new Error(`grant mangler: ${r}`);
  const typer = sqlTypeliste(sql);
  const forventet = [...SAMLEMAIL_TYPER].sort();
  if (JSON.stringify([...typer].sort()) !== JSON.stringify(forventet)) {
    throw new Error(`typeliste afviger fra samlemail.ts: SQL [${typer.join(", ")}] ≠ [${forventet.join(", ")}]`);
  }
  const time = sqlKlokkeslaet(sql);
  if (time !== SAMLEMAIL_TIME_DANSK) throw new Error(`klokkeslæt afviger fra samlemail.ts: SQL ${time} ≠ ${SAMLEMAIL_TIME_DANSK}`);
  const rest = udenNiende(vagtKrop(sql));
  const ottende = vagtKrop(laes(OTTENDE));
  if (rest !== ottende) {
    const a = rest.split("\n");
    const b = ottende.split("\n");
    const i = a.findIndex((l, k) => l !== b[k]);
    throw new Error(`kroppen uden NIENDE-mærker afviger fra ottende version ved linje ${i + 1}: «${a[i] ?? "(slut)"}» ≠ «${b[i] ?? "(slut)"}»`);
  }
}

describe("vagtSamlemail.guard — den nyeste migration der definerer vagt_cron", () => {
  const { fil, sql } = nyesteVagtMigration();

  it("er den niende version (20260916170000) eller nyere, og består dommen", () => {
    expect(fil >= "20260916170000_vagtens_samlemail.sql").toBe(true);
    expect(() => doemVagtMigration(sql)).not.toThrow();
  });

  it("typelisten og klokkeslættet er samlemail.ts' — ordret", () => {
    expect(sqlTypeliste(sql).sort()).toEqual([...SAMLEMAIL_TYPER].sort());
    expect(SAMLEMAIL_TYPER).toEqual(["event_published", "community_opslag"]);
    expect(sqlKlokkeslaet(sql)).toBe(SAMLEMAIL_TIME_DANSK);
    expect(SAMLEMAIL_TIME_DANSK).toBe(17);
  });

  it("klienten (src/lib/cronVagt.ts) siger samme klokkeslæt som samlemail.ts", () => {
    expect(KLIENTENS_TIME).toBe(SAMLEMAIL_TIME_DANSK);
  });

  it("uden NIENDE-mærkerne er kroppen tegn for tegn ottende versions — og mærkerne findes ikke i ottende", () => {
    expect(udenNiende(vagtKrop(sql))).toBe(vagtKrop(laes(OTTENDE)));
    expect(laes(OTTENDE)).not.toMatch(/NIENDE/);
    // og der ER mærkede blokke i KROPPEN (filhovedet nævner mærkerne i prosa) — ellers dømmer værnet en kopi af ottende
    const krop = vagtKrop(sql);
    expect((krop.match(/-- NIENDE >>>/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((krop.match(/-- NIENDE >>>/g) ?? []).length).toBe((krop.match(/-- <<< NIENDE/g) ?? []).length);
  });

  it("VÆRNET VIRKER: kopier af migrationsteksten fejler — en type mangler, klokkeslæt 18, SECURITY DEFINER væk, search_path væk, en umærket linje", () => {
    const udenType = sql.replace("ARRAY['event_published', 'community_opslag']", "ARRAY['event_published']");
    expect(udenType).not.toBe(sql);
    expect(() => doemVagtMigration(udenType)).toThrow(/typeliste afviger fra samlemail\.ts/);

    const kl18 = sql.replace("v_samlemail_time constant integer := 17;", "v_samlemail_time constant integer := 18;");
    expect(kl18).not.toBe(sql);
    expect(() => doemVagtMigration(kl18)).toThrow(/klokkeslæt afviger fra samlemail\.ts: SQL 18 ≠ 17/);

    const udenDefiner = sql.replace("LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path", "LANGUAGE plpgsql\nSET search_path");
    expect(udenDefiner).not.toBe(sql);
    expect(() => doemVagtMigration(udenDefiner)).toThrow(/hovedet er ikke ordret/);

    const udenSearchPath = sql.replace("SECURITY DEFINER\nSET search_path = public\nAS $$", "SECURITY DEFINER\nAS $$");
    expect(udenSearchPath).not.toBe(sql);
    expect(() => doemVagtMigration(udenSearchPath)).toThrow(/hovedet er ikke ordret/);

    const udenRevoke = sql.replace("REVOKE ALL ON FUNCTION public.vagt_cron() FROM authenticated;\n", "");
    expect(() => doemVagtMigration(udenRevoke)).toThrow(/grant mangler: .*FROM authenticated/);

    // en umærket ændring i det der skulle være ottende versions tekst
    const umaerket = sql.replace("v_margin_min constant integer := 30;", "v_margin_min constant integer := 45;");
    expect(umaerket).not.toBe(sql);
    expect(() => doemVagtMigration(umaerket)).toThrow(/afviger fra ottende version ved linje \d+/);
    // en ny umærket linje fanges også
    const nyLinje = sql.replace("  v_lokal timestamp;\n", "  v_lokal timestamp;\n  v_noget_nyt integer;\n");
    expect(() => doemVagtMigration(nyLinje)).toThrow(/afviger fra ottende version/);
  });
});
