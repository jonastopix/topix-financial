import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erForfalden, erUdloebetEfterForfald, FORFALDSHENSTAND_DAGE, type Opgave } from "../opgaveEngine";

// Paritetsværn for forfalds-cronen (de-tyve nr. 12, 11/9): migrationens
// SQL-prædikat og motorens erUdloebetEfterForfald er den samme sætning på
// to sprog — samme greb som opgaveUdloebsCron.paritet.test.ts, som læser
// 20260901090000 og IKKE rører denne. Nyt jobnavn, ny fil, nyt værn.
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911010000_opgave_forfalds_cron.sql"),
  "utf8",
);

const body = migration.split("$job$")[1] ?? "";

/** Lokal-tids-konstruktion, som opgaveEngine.test.ts. */
const d = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute);

const aktiv = (due_date: Date | null) =>
  ({ status: "active", due_date, accepted_at: d(2026, 8, 20) }) as unknown as Opgave;

describe("opgave-forfald — SQL-prædikatet spejler erUdloebetEfterForfald", () => {
  it("job-body'en bærer de tre betingelser: active, due_date findes, due_date + 14 < dansk dato", () => {
    expect(body).toContain("UPDATE public.company_actions");
    expect(body).toContain("WHERE status = 'active'");
    expect(body).toContain("due_date IS NOT NULL");
    expect(body).toContain(`due_date + ${FORFALDSHENSTAND_DAGE} < (now() AT TIME ZONE 'Europe/Copenhagen')::date`);
  });

  it("dommen er skarp: < og aldrig <= — dag 14 er ikke udløbet, dag 15 er", () => {
    expect(body).not.toContain("<=");
    const frist = d(2026, 9, 4);
    expect(erUdloebetEfterForfald(aktiv(frist), d(2026, 9, 18, 23, 59))).toBe(false);
    expect(erUdloebetEfterForfald(aktiv(frist), d(2026, 9, 19, 0, 0))).toBe(true);
  });

  it("forfald og udløb er to grænser: fristdagen, dagen efter, dag 14 og dag 15", () => {
    const frist = d(2026, 9, 4);
    expect(erForfalden(aktiv(frist), d(2026, 9, 4))).toBe(false);
    expect(erForfalden(aktiv(frist), d(2026, 9, 5))).toBe(true);
    expect(erUdloebetEfterForfald(aktiv(frist), d(2026, 9, 5))).toBe(false);
    expect(erUdloebetEfterForfald(aktiv(frist), d(2026, 9, 18))).toBe(false);
    expect(erUdloebetEfterForfald(aktiv(frist), d(2026, 9, 19))).toBe(true);
  });

  it("SET'et spejler luk()'s stempel: status 'expired' OG closed_at = now()", () => {
    expect(body).toContain("SET status = 'expired'");
    expect(body).toContain("closed_at = now()");
  });

  it("motoren dømmer ikke andre statusser — og cron'en rører dem heller ikke", () => {
    for (const status of ["proposed", "done", "not_done", "dropped", "dismissed", "expired", "open", "parked"]) {
      const opgave = { status, due_date: d(2026, 1, 1) } as unknown as Opgave;
      expect(erUdloebetEfterForfald(opgave, d(2027, 1, 1))).toBe(false);
    }
    expect(erUdloebetEfterForfald(aktiv(null), d(2027, 1, 1))).toBe(false);
    expect(body).not.toContain("'proposed'");
  });

  it("jobbet hedder 'opgave-forfald' og kører 04:10 UTC — ikke 'opgave-udloeb' (det gamle værn læser den gamle fil)", () => {
    expect(migration).toContain("'opgave-forfald'");
    expect(migration).toContain("'10 4 * * *'");
    expect(migration).toContain("cron.unschedule('opgave-forfald')");
    expect(body).not.toContain("opgave-udloeb");
  });
});
