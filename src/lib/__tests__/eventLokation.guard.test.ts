import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for events.lokation (29/9-2026). Fem domme, hver bevist på en kopi med fejlen indsat:
 *   1. MIGRATIONEN: første linje ordret «-- IKKE KØRT. DEPLOY: …», KUN en nullable tekstkolonne
 *      (ADD COLUMN IF NOT EXISTS lokation text NULL), ingen DROP/UPDATE/DELETE/policy uden for
 *      kommentarerne, FØR/EFTER som UNION ALL, REST-målingen og en ROLLBACK, og ukørt sorterer ikke før kørt.
 *   2. FLADERNE: eventsiden og de to eventkort viser stedet gennem eventStedDele — ingen af dem
 *      har tilbage `meet_url ? "Online"` på egen hånd (så vises lokationen ikke).
 *   3. EDITOREN: feltet «Lokation (adresse)», maxLength, og validerLokation i BÅDE gem og publicér.
 *   4. KALENDERFILEN: LOCATION bygges af eventLokation(...) ?? meet_url ?? side.
 *   5. `as any` bor ét sted (eventLokation) i læsestien; ingen flade læser `.lokation` direkte.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenSqlKommentarer = (sql: string) => sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const udenTsKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MIG_FIL = "20260929210000_event_lokation.sql";
const MIG = `supabase/migrations/${MIG_FIL}`;
const FLADER = [
  "src/components/hjemmebane/events/EventDetailView.tsx",
  "src/components/hjemmebane/events/EventsView.tsx",
  "src/components/hjemmebane/boardroom/BoardroomView.tsx",
];
const EDITOR = "src/components/hjemmebane/admin/editors/EventEditor.tsx";

export const migrationenErRigtig = (sql: string): boolean => {
  const kode = udenSqlKommentarer(sql).replace(/\s+/g, " ").trim();
  const udenKommentarBlok = kode.replace(/COMMENT ON COLUMN[^;]*;/i, "");
  return (
    sql.startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).\n") &&
    kode.includes("ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lokation text NULL;") &&
    !/\b(DROP|UPDATE|DELETE|TRUNCATE|CREATE POLICY|ALTER POLICY|GRANT|REVOKE)\b/i.test(udenKommentarBlok) &&
    sql.includes("UNION ALL") &&
    sql.includes("/rest/v1/events?select=lokation&limit=0") &&
    sql.includes("ROLLBACK")
  );
};

export const fladernesStedErSamlet = (kilder: string[]): boolean =>
  kilder.every((k) => k.includes("eventStedDele(event)") && !/meet_url \? ("Online"|" · Online")/.test(k));

export const editorenErRigtig = (k: string): boolean =>
  k.includes('label="Lokation (adresse)"') &&
  k.includes("maxLength={LOKATION_MAKS_TEGN}") &&
  (k.match(/validerLokation\(eventLokation\(next\)\)/g) ?? []).length === 2;

export const kalenderfilenErRigtig = (k: string): boolean =>
  k.includes("`LOCATION:${icsEscape(eventLokation(event) ?? event.meet_url ?? side)}`");

describe("events.lokation — kildeværn", () => {
  it("1. migrationen: IKKE KØRT-linjen ordret, kun tilføjende, FØR/EFTER som UNION ALL, REST-måling og ROLLBACK", () => expect(migrationenErRigtig(laes(MIG))).toBe(true));
  it("1b. ukørt sorterer ikke før kørt: ingen migration efter denne er bogført «KØRT» mens denne står IKKE KØRT", () => {
    const mappe = resolve(process.cwd(), "supabase/migrations");
    const efter = readdirSync(mappe).filter((f) => f.endsWith(".sql") && f > MIG_FIL);
    const dennErUkoert = laes(MIG).startsWith("-- IKKE KØRT.");
    if (dennErUkoert) for (const f of efter) expect(readFileSync(resolve(mappe, f), "utf8").startsWith("-- KØRT"), f).toBe(false);
  });
  it("2. fladerne viser stedet gennem eventStedDele", () => expect(fladernesStedErSamlet(FLADER.map(laes))).toBe(true));
  it("3. editoren har feltet, maxLength og valideringen i både gem og publicér", () => expect(editorenErRigtig(laes(EDITOR))).toBe(true));
  it("4. kalenderfilens LOCATION: lokation, ellers Meet, ellers eventsiden", () => expect(kalenderfilenErRigtig(laes("src/lib/kalenderfil.ts"))).toBe(true));
  it("5. ingen flade læser .lokation direkte — kun eventLokation (ét as any)", () => {
    for (const sti of [...FLADER, "src/lib/kalenderfil.ts"]) expect(/\.lokation\b/.test(udenTsKommentarer(laes(sti)))).toBe(false);
  });

  it("1. en migration uden IKKE KØRT-linjen først, med UPDATE eller en policy, NOT NULL eller uden REST-måling fældes", () => {
    const sql = laes(MIG);
    expect(migrationenErRigtig(sql.replace(/^-- IKKE KØRT\. DEPLOY:/, "-- Forklaring\n-- IKKE KØRT. DEPLOY:"))).toBe(false);
    expect(migrationenErRigtig(sql + "\nUPDATE public.events SET lokation = 'x';\n")).toBe(false);
    expect(migrationenErRigtig(sql + "\nCREATE POLICY p ON public.events FOR SELECT USING (true);\n")).toBe(false);
    expect(migrationenErRigtig(sql.replace("lokation text NULL;", "lokation text NOT NULL;"))).toBe(false);
    expect(migrationenErRigtig(sql.replace("/rest/v1/events?select=lokation&limit=0", ""))).toBe(false);
  });
  it("2. et kort med den gamle «meet_url ? Online» fældes", () => {
    const k = laes(FLADER[1]).replace("...eventStedDele(event),", 'event.meet_url ? "Online" : null,');
    expect(fladernesStedErSamlet([k])).toBe(false);
  });
  it("3. en editor uden maxLength eller med valideringen kun ét sted fældes", () => {
    const k = laes(EDITOR);
    expect(editorenErRigtig(k.replace("maxLength={LOKATION_MAKS_TEGN}", ""))).toBe(false);
    expect(editorenErRigtig(k.replace("validerLokation(eventLokation(next)) ||", ""))).toBe(false);
  });
  it("4. en LOCATION uden lokationen fældes", () => {
    expect(kalenderfilenErRigtig(laes("src/lib/kalenderfil.ts").replace("eventLokation(event) ?? ", ""))).toBe(false);
  });
});
