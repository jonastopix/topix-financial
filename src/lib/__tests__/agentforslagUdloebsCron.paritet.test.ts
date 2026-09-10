import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerForslagsgyldighed, erForslagGyldigt } from "../forslagUdloeb";
import { getISOWeekKey } from "../hjemmebane/week";

// Paritetsværn for agentforslagenes udløbs-cron (de-tyve nr. 4, 11/9):
// migrationens SQL-prædikat og motorens afgoerForslagsgyldighed er den
// samme sætning på to sprog — ISO-ugen for proposed_at mod ISO-ugen for nu.
// forslagUdloeb.ts' filhoved kræver at en cron «SKAL bruge denne funktion»;
// en SQL-cron kan ikke, så pariteten låses her i stedet, som
// opgaveUdloebsCron.paritet.test.ts gør for opgave-udloeb (filen som
// kilde — CI har ingen DB).
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911000000_agentforslag_udloebs_cron.sql"),
  "utf8",
);

/** Job-body'en alene ($job$-blokken) — kommentarerne ovenfor citerer
    prædikatet og må ikke kunne opfylde assertionerne på body'ens vegne. */
const body = migration.split("$job$")[1] ?? "";

describe("agentforslag-udloeb — SQL-prædikatet spejler afgoerForslagsgyldighed", () => {
  it("job-body'en er status-låst til proposed og sammenligner ISO-ugenøgler i dansk tid", () => {
    expect(body).toContain("UPDATE public.agent_proposals");
    expect(body).toContain("SET status = 'expired'");
    expect(body).toContain("WHERE status = 'proposed'");
    expect(body).toContain(`to_char(proposed_at AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW')`);
    expect(body).toContain(`to_char(now()       AT TIME ZONE 'Europe/Copenhagen', 'IYYY-"W"IW')`);
  });

  it("dommen er «ikke samme uge» (<>), ikke «ældre uge» (<): et fremtidigt eller ulæseligt stempel er også udløbet", () => {
    expect(body).toContain("<>");
    expect(body).not.toMatch(/'\)\s*<\s*to_char/);
    // Motoren, samme sag: et forslag fra NÆSTE uge er ikke gyldigt i denne.
    expect(erForslagGyldigt(new Date(2026, 8, 14, 9, 0, 0).toISOString(), new Date(2026, 8, 10, 12, 0, 0))).toBe(false);
    expect(erForslagGyldigt("ikke-en-dato", new Date(2026, 8, 10, 12, 0, 0))).toBe(false);
  });

  it("SET'et rører ikke decided_by/decided_at (CHECK afgjort_kraever_afgoerer fritager expired) og ingen closed_at findes", () => {
    expect(body).not.toContain("decided_by");
    expect(body).not.toContain("decided_at");
    expect(body).not.toContain("closed_at");
  });

  it("grænsen fra begge sider i motoren: søndag 23:59:59 er gyldigt, mandag 00:00:00 er udløbet", () => {
    const forslag = new Date(2026, 7, 31, 9, 0, 0).toISOString(); // mandag 31/8, uge 36
    expect(afgoerForslagsgyldighed(forslag, new Date(2026, 8, 6, 23, 59, 59, 999)).gyldigt).toBe(true);
    expect(afgoerForslagsgyldighed(forslag, new Date(2026, 8, 7, 0, 0, 0, 0)).gyldigt).toBe(false);
    // og fra den anden side: mandagens eget forslag er gyldigt hele ugen
    expect(afgoerForslagsgyldighed(new Date(2026, 8, 7, 0, 0, 0, 0).toISOString(), new Date(2026, 8, 13, 23, 59, 59)).gyldigt).toBe(true);
  });

  it("motorens nøgle og Postgres' IYYY-\"W\"IW er samme format ved uge 1/uge 53-grænserne", () => {
    // to_char(date, 'IYYY-"W"IW') giver præcis disse strenge — pinnet her,
    // så en ændring af getISOWeekKey's format ikke kan glide fra SQL'en.
    expect(getISOWeekKey(new Date(2025, 11, 28))).toBe("2025-W52"); // søndag
    expect(getISOWeekKey(new Date(2025, 11, 29))).toBe("2026-W01"); // mandag — ISO-året skifter før kalenderåret
    expect(getISOWeekKey(new Date(2026, 0, 1))).toBe("2026-W01");
    expect(getISOWeekKey(new Date(2026, 11, 28))).toBe("2026-W53"); // mandag i uge 53
    expect(getISOWeekKey(new Date(2027, 0, 3))).toBe("2026-W53"); // søndag — kalenderåret skiftede før ISO-året
    expect(getISOWeekKey(new Date(2027, 0, 4))).toBe("2027-W01");
    expect(getISOWeekKey(new Date(2026, 8, 6))).toBe("2026-W36");
    expect(getISOWeekKey(new Date(2026, 8, 7))).toBe("2026-W37");
    for (const k of ["2025-W52", "2026-W01", "2026-W53", "2027-W01"]) expect(k).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("jobbet hedder 'agentforslag-udloeb' og kører 04:05 UTC (slot bogført i migrationen)", () => {
    expect(migration).toContain("'agentforslag-udloeb'");
    expect(migration).toContain("'5 4 * * *'");
    expect(migration).toContain("cron.unschedule('agentforslag-udloeb')");
  });
});
