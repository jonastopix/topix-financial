import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { erUdloebet, type Opgave } from "../opgaveEngine";

// Paritetsværn for udløbs-cron'en (B8): migrationens SQL-prædikat og
// motorens erUdloebet er den samme sætning på to sprog — og det er
// PRÆCIS derfor cron'en fik lov at være ren SQL frem for en edge
// function der kalder motoren. Betingelsen for det valg er dette værn:
// driver de to fra hinanden, fejler testen. Mønstret er
// opgaveUdloeb.paritet.test.ts (dommen) + forslagEngine.test.ts'
// kildeværn (filen som kilde — CI har ingen DB).
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260901090000_opgave_udloebs_cron.sql"),
  "utf8",
);

/** Job-body'en alene ($job$-blokken) — kommentarerne ovenfor citerer
    prædikatet og må ikke kunne opfylde assertionerne på body'ens vegne. */
const body = migration.split("$job$")[1] ?? "";

describe("udløbs-cron — SQL-prædikatet spejler erUdloebet", () => {
  it("job-body'en bærer alle tre betingelser fra erUdloebet", () => {
    expect(body).toContain("status = 'proposed'");
    expect(body).toContain("expires_at IS NOT NULL");
    expect(body).toContain("expires_at < now()");
  });

  it("dommen er skarp: < og aldrig <= (udløb indtræffer først EFTER tidspunktet)", () => {
    expect(body).not.toContain("<=");
    // Motorens grænse, samme sag fra den anden side: nu === expires_at
    // er IKKE udløbet.
    const t = new Date("2026-09-07T06:00:00Z");
    const opgave = { status: "proposed", expires_at: t } as unknown as Opgave;
    expect(erUdloebet(opgave, new Date(t.getTime()))).toBe(false);
    expect(erUdloebet(opgave, new Date(t.getTime() + 1))).toBe(true);
  });

  it("SET'et spejler luk()'s stempel: status 'expired' OG closed_at = now()", () => {
    expect(body).toContain("SET status = 'expired'");
    expect(body).toContain("closed_at = now()");
  });

  it("motoren dømmer ikke andre statusser udløbet — og cron'en rører dem heller ikke", () => {
    const t = new Date("2026-09-07T06:00:00Z");
    for (const status of ["active", "open", "dismissed", "expired"]) {
      const opgave = { status, expires_at: t } as unknown as Opgave;
      expect(erUdloebet(opgave, new Date(t.getTime() + 1))).toBe(false);
    }
    // SQL-siden: UPDATE'ens WHERE er status-låst til 'proposed'.
    expect(body).toContain("WHERE status = 'proposed'");
  });

  it("jobbet hedder 'opgave-udloeb' og kører 04:00 UTC (slot bogført i migrationen)", () => {
    expect(migration).toContain("'opgave-udloeb'");
    expect(migration).toContain("'0 4 * * *'");
  });
});
