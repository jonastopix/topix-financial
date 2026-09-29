import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chatDokumentTilTekst, parseChatDokument } from "@/lib/chatDokument";

/**
 * community_json_til_tekst + rabathenvisning (migration 20260929180000).
 * TS-udledningen (chatDokumentTilTekst) og SQL'ens forventede svar — skrevet i
 * migrationens FACIT EFTER — skal være det samme på migrationens egne dokumenter.
 * Og funktionen er den gamle ORDRET + én række; ROLLBACK er den gamle ordret.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const NY = "supabase/migrations/20260929180000_community_tekst_rabathenvisning.sql";
const GAMMEL = "supabase/migrations/20260917160000_community_tekst_med_opslaghenvisninger.sql";
const DEF = "CREATE OR REPLACE FUNCTION public.community_json_til_tekst(p_doc jsonb)";

/** Dokumentet i FØR/EFTER-forespørgslens række for `sektion`. */
export function dokumentFor(sql: string, sektion: string): unknown {
  const m = sql.match(new RegExp(`SELECT '${sektion}'(?: AS sektion)?, public\\.community_json_til_tekst\\('(\\{.*?\\})'::jsonb\\)`));
  if (!m) throw new Error(`fandt ikke ${sektion}`);
  return JSON.parse(m[1]);
}

/** FACIT EFTER-svaret for `sektion` (NULL → null). */
export function facitEfter(sql: string, sektion: string): string | null {
  const blok = sql.slice(sql.indexOf("-- FACIT EFTER"));
  const linje = blok.split("\n").find((l) => l.startsWith(`--   ${sektion} `));
  if (!linje) throw new Error(`fandt ikke facit for ${sektion}`);
  const svar = linje.slice(linje.indexOf("| ") + 2);
  return svar === "NULL" ? null : svar;
}

const tsTekst = (dok: unknown) => chatDokumentTilTekst(parseChatDokument(dok));
/** Den KØRENDE definition: DEF i linjestart — ikke den kommenterede i ROLLBACK. */
const start = (sql: string) => sql.indexOf(`\n${DEF}`) + 1;
const definition = (sql: string) => sql.slice(start(sql)).trimEnd();
const rollback = (sql: string) => {
  const blok = sql.slice(sql.indexOf("-- ROLLBACK"), start(sql));
  return blok.split("\n").slice(1).filter((l) => l.startsWith("--")).map((l) => (l === "--" ? "" : l.slice(3))).join("\n").trimEnd();
};

describe("migration 20260929180000 — community_json_til_tekst kender rabathenvisning", () => {
  const sql = laes(NY);
  const gammel = laes(GAMMEL);

  // Vendt 29/9 kl. 17:35 (Jonas, Lovable SQL editor): migrationen ER kørt i prod —
  // hovedet bogfører FØR/EFTER, og linjen er husets KØRT-linje, ikke IKKE KØRT.
  it("første linje er husets KØRT-linje med tidspunktet", () => {
    expect(sql.split("\n")[0].startsWith("-- KØRT i prod — 29/9-2026 kl. 17:35 dansk tid (Lovable SQL editor)")).toBe(true);
    expect(sql.split("\n")[0]).not.toContain("IKKE KØRT");
  });

  it("TS og SQL giver det samme på dokumentet med én af hver af de fire noder", () => {
    const dok = dokumentFor(sql, "fire noder");
    expect(facitEfter(sql, "fire noder")).toBe("Se  #Budget  og  #Vækstdag  og  #Hej, jeg er Mette  og  #Dinero");
    expect(tsTekst(dok)).toBe(facitEfter(sql, "fire noder"));
    // Dokumentet bærer præcis de fire #-noder, én af hver.
    const typer = JSON.stringify(dok).match(/"type":"[a-z]+henvisning"|"type":"henvisning"/g);
    expect(typer).toEqual(['"type":"henvisning"', '"type":"eventhenvisning"', '"type":"opslaghenvisning"', '"type":"rabathenvisning"']);
  });

  it("også de to små dokumenter: kun noden → «#Dinero», uden titel → NULL/null", () => {
    expect(tsTekst(dokumentFor(sql, "kun rabathenvisning"))).toBe(facitEfter(sql, "kun rabathenvisning"));
    expect(tsTekst(dokumentFor(sql, "rabathenvisning uden titel"))).toBe(facitEfter(sql, "rabathenvisning uden titel"));
  });

  it("FØR/EFTER er ÉT resultatsæt (UNION ALL med sektions-kolonne)", () => {
    const blok = sql.slice(sql.indexOf("-- FØR OG EFTER"), sql.indexOf("-- FACIT FØR"));
    expect((blok.match(/UNION ALL/g) ?? []).length).toBe(3);
    expect(blok).toContain("AS sektion");
    expect((blok.match(/;/g) ?? []).length).toBe(1);
  });

  it("funktionen er den gamle ORDRET + én række i opslagslisten (og COMMENT'ens ordliste)", () => {
    const forventet = definition(gammel)
      .replace("      ('opslaghenvisning', 'titel', '#')\n", "      ('opslaghenvisning', 'titel', '#'),\n      ('rabathenvisning',  'titel', '#')\n")
      .replace("henvisning, eventhenvisning og opslaghenvisning → ''#'' + titel", "henvisning, eventhenvisning, opslaghenvisning og rabathenvisning → ''#'' + titel")
      .replace("VALUES-listen (20260917160000).';", "VALUES-listen (20260917160000; rabathenvisning 20260929180000).';");
    expect(forventet).not.toBe(definition(gammel));
    expect(definition(sql)).toBe(forventet);
  });

  it("ROLLBACK er den gamle definition ordret", () => {
    expect(rollback(sql)).toBe(definition(gammel));
  });

  it("VÆRNET VIRKER: et andet facit, en manglende række eller en ændret rollback fælder", () => {
    const forkertFacit = sql.replace("--   fire noder                          | Se  #Budget  og  #Vækstdag  og  #Hej, jeg er Mette  og  #Dinero", "--   fire noder                          | Se  #Budget  og  #Vækstdag  og  #Hej, jeg er Mette  og");
    expect(forkertFacit).not.toBe(sql);
    expect(tsTekst(dokumentFor(forkertFacit, "fire noder"))).not.toBe(facitEfter(forkertFacit, "fire noder"));
    const udenRaekke = sql.replace("      ('opslaghenvisning', 'titel', '#'),\n      ('rabathenvisning',  'titel', '#')\n", "      ('opslaghenvisning', 'titel', '#')\n");
    expect(udenRaekke).not.toBe(sql);
    expect(definition(udenRaekke)).not.toBe(definition(sql));
    const aendretRollback = sql.replace("-- LANGUAGE sql\n", "-- LANGUAGE plpgsql\n");
    expect(aendretRollback).not.toBe(sql);
    expect(rollback(aendretRollback)).not.toBe(definition(gammel));
  });
});
