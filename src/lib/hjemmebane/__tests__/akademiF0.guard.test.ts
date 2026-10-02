import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  egetSeenAt,
  erRaadgiverensStempel,
  fortrydMarkeringPatch,
  itemProgressState,
  markeringsTilstand,
} from "../progressState";

// Akademiet F0 (2/10-2026; Jonas 07:28 «Ja, byg F0»; docs/akademi-grundlag.md
// §4): rådgiverens markering er SKILT fra medlemmets. Her låses motoren og
// kildens form, så adskillelsen ikke siver tilbage:
//   DOMMEN (ren, progressState.ts):
//   1. Et tidsstempel, der er lig markeret_at, er rådgiverens stempel —
//      itemProgressState giver aldrig «done» eller «started» på det.
//   2. «≠», ikke «markeret_at IS NULL»: et eget acknowledged_at med sin egen
//      tid er medlemmets, også når rådgiveren har markeret lektionen.
//   3. fortrydMarkeringPatch rydder markeret_* altid, og medlemmets felter KUN
//      når de er rådgiverens stempel.
//   KILDEN:
//   4. batchMarker (adminContentApi) skriver markeret_at + markeret_af og
//      INTET af medlemmets felter; den falder ikke tilbage til acknowledged_at.
//   5. fortrydMarkering bruger fortrydMarkeringPatch — ingen egen patch.
//   6. listAllMemberProgress henter MARKERING_KOLONNER og falder tilbage uden
//      dem ved «kolonnen mangler» (erManglendeKolonne) — fail-soft før migrationen.
//   7. Ingen medlemsflade/-motor nævner markeret_at: medlemmet læser KUN sin
//      egen tilstand gennem itemProgressState/egetSeenAt. Tilladt: progressState.ts,
//      akademiApi.ts (re-eksport), adminContentApi.ts, ProgressView.tsx, types.ts, tests.
//   8. ProgressView viser begge tilstande med husets to ord og dømmer
//      markeringen med markeringsTilstand.
//   9. forloeb.ts: «fortsæt hvor du slap» kræver state !== "untouched".
//  10. Migrationen 20261002260000: første linje «-- IKKE KØRT. DEPLOY:», backfill
//      KUN efter fingeraftrykket (HAVING count(*) >= 2), sætter markeret_at =
//      acknowledged_at og rører ALDRIG medlemmets felter (ingen SET
//      acknowledged_at/seen_at, intet DROP/RENAME). Værnet 20261002261000
//      låser medlemmets seks felter for andre end ejeren og service role,
//      låser markeret_* for medlemmet selv, og nægter en ny markering på en
//      backfillet batch-række, før rådgiverens gamle stempel er ryddet.
// Kilde-læsning med selvbevis på kopier (lektionBrugbar.guard-mønstret).

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const ADMIN_API = "src/lib/hjemmebane/adminContentApi.ts";
const PROGRESS_VIEW = "src/components/hjemmebane/admin/views/ProgressView.tsx";
const FORLOEB = "src/lib/hjemmebane/forloeb.ts";
const MIGRATION = "supabase/migrations/20261002260000_member_progress_markering.sql";
const VAERN = "supabase/migrations/20261002261000_member_progress_markering_vaern.sql";

const MAA_NAEVNE_MARKERET_AT = [
  "src/integrations/supabase/types.ts",
  "src/lib/hjemmebane/progressState.ts",
  "src/lib/hjemmebane/akademiApi.ts",
  ADMIN_API,
  PROGRESS_VIEW,
];

/** Funktionskroppen for `export async function <navn>(` frem til første `}` i kolonne 0. */
export function funktionsBlok(kilde: string, navn: string): string {
  const start = kilde.indexOf(`export async function ${navn}(`);
  if (start === -1) throw new Error(`fandt ikke \`export async function ${navn}(\``);
  const slut = kilde.indexOf("\n}", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 2);
}

const MEDLEMMETS_FELTER = ["seen_at", "acknowledged_at", "skipped_at", "last_position_seconds", "brugbar"] as const;

/** Dom 4: batchMarker skriver markeret_at + markeret_af og ingen af medlemmets felter — og ingen tilbagefald. */
export function batchMarkerErRen(admin: string): boolean {
  const blok = udenKommentarer(funktionsBlok(admin, "batchMarker"));
  return (
    /markeret_at:\s*now,/.test(blok) &&
    /markeret_af:\s*raadgiverId,/.test(blok) &&
    MEDLEMMETS_FELTER.every((felt) => !new RegExp(`\\b${felt}\\b`).test(blok)) &&
    blok.includes("erManglendeKolonne(error) ? MARKERING_AFVENTER_MIGRATION")
  );
}

/** Dom 5: fortrydMarkering sender fortrydMarkeringPatch(raekke) og intet andet. */
export function fortrydBrugerDommen(admin: string): boolean {
  const blok = udenKommentarer(funktionsBlok(admin, "fortrydMarkering"));
  return blok.includes(".update(fortrydMarkeringPatch(raekke) as") && !/\.update\(\s*\{/.test(blok);
}

/** Dom 6: hentningen beder om MARKERING_KOLONNER og falder tilbage uden dem ved erManglendeKolonne. */
export function hentningenErFailSoft(admin: string): boolean {
  const blok = udenKommentarer(funktionsBlok(admin, "listAllMemberProgress"));
  return (
    blok.includes("${PROGRESS_KOLONNER}, ${MARKERING_KOLONNER}") &&
    blok.includes("med.error && erManglendeKolonne(med.error)") &&
    blok.includes(".select(PROGRESS_KOLONNER)")
  );
}

function alleKildefiler(mappe: string): string[] {
  return readdirSync(mappe).flatMap((navn) => {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) return navn === "node_modules" ? [] : alleKildefiler(sti);
    return /\.(ts|tsx)$/.test(navn) ? [sti] : [];
  });
}

/** Dom 7: filer under src/ der nævner markeret_at uden lov (tests undtaget). */
export function ulovligeMarkeretFiler(filer: { sti: string; kilde: string }[]): string[] {
  return filer
    .filter((f) => !/(^|\/)__tests__\//.test(f.sti) && !/\.test\.tsx?$/.test(f.sti))
    .filter((f) => !MAA_NAEVNE_MARKERET_AT.includes(f.sti))
    .filter((f) => /markeret_at/.test(udenKommentarer(f.kilde)))
    .map((f) => f.sti);
}

/** Dom 8: ProgressView tegner begge tilstande med husets ord og dømmer markeringen rent. */
export function progressViewViserBegge(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    k.includes('export const SET_AF_MEDLEMMET = "set af medlemmet";') &&
    k.includes('export const GENNEMGAAET_MED_RAADGIVER = "gennemgået med rådgiver";') &&
    k.includes('markeringsTilstand(rowByKey.get(keyOf(userId, itemId))) === "gennemgaaet"') &&
    k.includes("itemProgressState(rowByKey.get(keyOf(userId, itemId)))") &&
    k.includes("Set af medlemmet") &&
    k.includes("Gennemgået med rådgiver") &&
    k.includes("batchMarker(userId, itemIds, raadgiverId)") &&
    k.includes("fortrydMarkering(userId, itemId, raekke)") &&
    !/batchAcknowledge|clearAcknowledge/.test(k)
  );
}

/** Dom 9: continueEntry kræver begyndt. */
export function fortsaetKraeverBegyndt(forloeb: string): boolean {
  const k = udenKommentarer(forloeb);
  return /entry\.state !== "done" &&\s*entry\.state !== "untouched",/.test(k);
}

/** Dom 10: migrationens form. */
export function migrationenErReversibel(sql: string): boolean {
  const foersteLinje = sql.split("\n")[0] ?? "";
  const krop = sql.replace(/^--[^\n]*$/gm, "");
  return (
    // Før kørslen «IKKE KØRT. DEPLOY:»; efter (2/10-2026) «KØRT i prod <dato> …».
    (foersteLinje.startsWith("-- IKKE KØRT. DEPLOY:") || /^-- KØRT i prod \d{1,2}\/\d{1,2}-\d{4} /.test(foersteLinje)) &&
    /ADD COLUMN IF NOT EXISTS markeret_at timestamptz NULL/.test(krop) &&
    /ADD COLUMN IF NOT EXISTS markeret_af uuid NULL/.test(krop) &&
    /HAVING count\(\*\) >= 2/.test(krop) &&
    /SET markeret_at = mp\.acknowledged_at/.test(krop) &&
    /AND mp\.markeret_at IS NULL/.test(krop) &&
    !/SET\s+(acknowledged_at|seen_at|skipped_at|brugbar)/i.test(krop) &&
    !/acknowledged_at\s*=\s*NULL/i.test(krop) &&
    !/DROP COLUMN|RENAME/i.test(krop) &&
    /DISABLE TRIGGER set_member_progress_updated_at/.test(krop) &&
    /ENABLE TRIGGER set_member_progress_updated_at/.test(krop)
  );
}

export function vaernetLaaserMedlemmetsFelter(sql: string): boolean {
  const krop = sql.replace(/^--[^\n]*$/gm, "");
  return (
    ((sql.split("\n")[0] ?? "").startsWith("-- IKKE KØRT. DEPLOY:") || /^-- KØRT i prod \d{1,2}\/\d{1,2}-\d{4} /.test(sql.split("\n")[0] ?? "")) &&
    /IF auth\.uid\(\) IS NULL OR auth\.role\(\) = 'service_role' THEN\s*RETURN NEW;/.test(krop) &&
    /IF auth\.uid\(\) = NEW\.user_id THEN\s*IF TG_OP = 'INSERT' THEN\s*IF NEW\.markeret_at IS NOT NULL OR NEW\.markeret_af IS NOT NULL THEN/.test(krop) &&
    /ELSIF NEW\.markeret_at IS DISTINCT FROM OLD\.markeret_at\s*OR NEW\.markeret_af IS DISTINCT FROM OLD\.markeret_af THEN/.test(krop) &&
    /AND OLD\.markeret_at IS NOT NULL\s*AND \(\(NEW\.acknowledged_at IS NOT NULL AND NEW\.acknowledged_at = OLD\.markeret_at\)/.test(krop) &&
    MEDLEMMETS_FELTER.every((felt) => new RegExp(`NEW\\.${felt}`).test(krop)) &&
    /OLD\.acknowledged_at = OLD\.markeret_at/.test(krop) &&
    /OLD\.seen_at = OLD\.markeret_at/.test(krop) &&
    !/SECURITY DEFINER/i.test(krop) &&
    !/DROP POLICY/i.test(krop) &&
    /CREATE TRIGGER member_progress_markering_vaern\s+BEFORE INSERT OR UPDATE ON public\.member_progress/.test(krop)
  );
}

const T0 = "2026-08-12T10:11:12.345+00:00";
const T0_Z = "2026-08-12T10:11:12.345Z";
const T1 = "2026-10-02T07:28:00.000Z";

describe("akademiF0 — dommen (progressState.ts)", () => {
  it("1. et tidsstempel lig markeret_at er rådgiverens stempel — ordret, og som samme øjeblik med anden serialisering", () => {
    expect(erRaadgiverensStempel(T0, T0)).toBe(true);
    expect(erRaadgiverensStempel(T0, T0_Z)).toBe(true);
    expect(erRaadgiverensStempel(T1, T0)).toBe(false);
    expect(erRaadgiverensStempel(null, T0)).toBe(false);
    expect(erRaadgiverensStempel(T0, null)).toBe(false);
    expect(erRaadgiverensStempel(undefined, undefined)).toBe(false);
    // Ugyldige tider: kun ordret lighed.
    expect(erRaadgiverensStempel("x", "x")).toBe(true);
    expect(erRaadgiverensStempel("x", "y")).toBe(false);
  });

  it("1. en backfillet batch-række (acknowledged_at = seen_at = markeret_at) er untouched for medlemmet — ikke done, ikke started", () => {
    expect(itemProgressState({ seen_at: T0, acknowledged_at: T0, markeret_at: T0 })).toBe("untouched");
    expect(itemProgressState({ seen_at: T0, acknowledged_at: T0, markeret_at: T0_Z })).toBe("untouched");
    // Rådgiverens nye markering (kun markeret_*): untouched.
    expect(itemProgressState({ markeret_at: T1 })).toBe("untouched");
    // Uden kolonnen (før migrationen): som før.
    expect(itemProgressState({ seen_at: T0, acknowledged_at: T0 })).toBe("done");
    expect(itemProgressState({ seen_at: T0 })).toBe("started");
  });

  it("2. et eget acknowledged_at (anden tid) er done — også når lektionen er gennemgået med rådgiver; eget seen_at på en batch-række er started", () => {
    expect(itemProgressState({ acknowledged_at: T1, markeret_at: T0 })).toBe("done");
    expect(itemProgressState({ seen_at: T0, acknowledged_at: T1, markeret_at: T0 })).toBe("done");
    expect(itemProgressState({ seen_at: T1, acknowledged_at: T0, markeret_at: T0 })).toBe("started");
    expect(itemProgressState({ seen_at: T0, acknowledged_at: T0, skipped_at: T1, markeret_at: T0 })).toBe("skipped");
    expect(egetSeenAt({ seen_at: T0, markeret_at: T0 })).toBeNull();
    expect(egetSeenAt({ seen_at: T1, markeret_at: T0 })).toBe(T1);
    expect(egetSeenAt(undefined)).toBeNull();
    expect(markeringsTilstand({ markeret_at: T0 })).toBe("gennemgaaet");
    expect(markeringsTilstand({ markeret_at: null })).toBe("ingen");
    expect(markeringsTilstand(undefined)).toBe("ingen");
  });

  it("3. fortrydMarkeringPatch: markeret_* altid; medlemmets felter kun når de ER rådgiverens stempel", () => {
    expect(fortrydMarkeringPatch({ seen_at: T0, acknowledged_at: T0, markeret_at: T0 })).toEqual({
      markeret_at: null,
      markeret_af: null,
      acknowledged_at: null,
      seen_at: null,
    });
    expect(fortrydMarkeringPatch({ seen_at: T1, acknowledged_at: T0, markeret_at: T0 })).toEqual({
      markeret_at: null,
      markeret_af: null,
      acknowledged_at: null,
    });
    expect(fortrydMarkeringPatch({ seen_at: T1, acknowledged_at: T1, markeret_at: T0 })).toEqual({ markeret_at: null, markeret_af: null });
    expect(fortrydMarkeringPatch({ seen_at: null, acknowledged_at: null, markeret_at: T1 })).toEqual({ markeret_at: null, markeret_af: null });
  });
});

describe("akademiF0.guard — kilden", () => {
  const admin = laes(ADMIN_API);
  const view = laes(PROGRESS_VIEW);
  const forloeb = laes(FORLOEB);
  const migration = laes(MIGRATION);
  const vaern = laes(VAERN);
  const filer = alleKildefiler(resolve(ROD, "src")).map((abs) => ({
    sti: relative(ROD, abs).split("\\").join("/"),
    kilde: readFileSync(abs, "utf8"),
  }));

  it("4. batchMarker skriver markeret_at/markeret_af — aldrig medlemmets felter, og falder ikke tilbage", () => {
    expect(batchMarkerErRen(admin)).toBe(true);
    expect(admin).not.toContain("export async function batchAcknowledge(");
  });

  it("5. fortrydMarkering bruger fortrydMarkeringPatch", () => {
    expect(fortrydBrugerDommen(admin)).toBe(true);
    expect(admin).not.toContain("export async function clearAcknowledge(");
  });

  it("6. listAllMemberProgress henter markeringen og falder tilbage uden den ved «kolonnen mangler»", () => {
    expect(hentningenErFailSoft(admin)).toBe(true);
  });

  it("7. ingen medlemsflade/-motor nævner markeret_at — medlemmet læser kun gennem itemProgressState/egetSeenAt", () => {
    expect(ulovligeMarkeretFiler(filer)).toEqual([]);
    expect(filer.length).toBeGreaterThan(100);
    for (const sti of MAA_NAEVNE_MARKERET_AT.filter((s) => s !== "src/integrations/supabase/types.ts")) {
      const fil = filer.find((f) => f.sti === sti);
      expect(fil, sti).toBeDefined();
      expect(/markeret_at/.test(fil!.kilde), sti).toBe(true);
    }
    // ElementView skriver seen_at ud fra egetSeenAt, ikke rækkens rå seen_at.
    const element = udenKommentarer(laes("src/components/hjemmebane/akademi/views/ElementView.tsx"));
    expect(element).toContain("if (egetSeenAt(entry.progress) || seenWrittenRef.current === entry.item.id) return;");
  });

  it("8. ProgressView viser «set af medlemmet» og «gennemgået med rådgiver» som to tilstande", () => {
    expect(progressViewViserBegge(view)).toBe(true);
  });

  it("9. forloeb: «fortsæt hvor du slap» kræver begyndt (state !== untouched)", () => {
    expect(fortsaetKraeverBegyndt(forloeb)).toBe(true);
  });

  it("10. migrationen er reversibel og backfiller kun fingeraftrykket; værnet låser medlemmets felter uden SECURITY DEFINER", () => {
    expect(migrationenErReversibel(migration)).toBe(true);
    expect(vaernetLaaserMedlemmetsFelter(vaern)).toBe(true);
    // Rådets fund 2/10: forudsætningen (20261002260000 kørt) dømmes FØR funktionen oprettes.
    const forud = "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='member_progress' AND column_name='markeret_at') THEN RAISE EXCEPTION 'Kør 20261002260000 først'; END IF; END $$;";
    expect(vaern.indexOf(forud)).toBeGreaterThan(-1);
    expect(vaern.indexOf(forud)).toBeLessThan(vaern.indexOf("CREATE OR REPLACE FUNCTION public.member_progress_markering_vaern()"));
  });

  it("VÆRNET VIRKER: kopier med fejlen indsat fanges (filerne er ikke rørt)", () => {
    // 4: batchMarker der også skriver acknowledged_at, eller falder tilbage.
    const kopi4 = admin.replace("markeret_af: raadgiverId,", "markeret_af: raadgiverId,\n    acknowledged_at: now,");
    expect(kopi4).not.toBe(admin);
    expect(batchMarkerErRen(kopi4)).toBe(false);
    const kopi4b = admin.replace("erManglendeKolonne(error) ? MARKERING_AFVENTER_MIGRATION", "false ? MARKERING_AFVENTER_MIGRATION");
    expect(batchMarkerErRen(kopi4b)).toBe(false);
    // 5: egen patch i fortrydMarkering.
    const kopi5 = admin.replace(".update(fortrydMarkeringPatch(raekke) as", ".update({ markeret_at: null } as");
    expect(fortrydBrugerDommen(kopi5)).toBe(false);
    // 6: hentning uden tilbagefald.
    const kopi6 = admin.replace("med.error && erManglendeKolonne(med.error)", "false");
    expect(hentningenErFailSoft(kopi6)).toBe(false);
    // 7: en medlemsflade der læser markeret_at.
    const smuglet = [...filer, { sti: "src/components/hjemmebane/akademi/views/ElementView.tsx", kilde: "const x = progress?.markeret_at;" }];
    expect(ulovligeMarkeretFiler(smuglet)).toEqual(["src/components/hjemmebane/akademi/views/ElementView.tsx"]);
    expect(ulovligeMarkeretFiler([{ sti: "src/lib/hjemmebane/__tests__/x.test.ts", kilde: "markeret_at" }])).toEqual([]);
    // 8: ProgressView der dømmer markeringen selv.
    const kopi8 = view.replace('markeringsTilstand(rowByKey.get(keyOf(userId, itemId))) === "gennemgaaet"', "Boolean(rowByKey.get(keyOf(userId, itemId))?.markeret_at)");
    expect(kopi8).not.toBe(view);
    expect(progressViewViserBegge(kopi8)).toBe(false);
    // 9: forloeb uden kravet.
    const kopi9 = forloeb.replace('entry.state !== "done" &&\n        entry.state !== "untouched",', 'entry.state !== "done",');
    expect(kopi9).not.toBe(forloeb);
    expect(fortsaetKraeverBegyndt(kopi9)).toBe(false);
    // 10: en migration der flytter destruktivt, eller uden fingeraftrykket.
    const kopi10 = migration.replace("SET markeret_at = mp.acknowledged_at", "SET markeret_at = mp.acknowledged_at, acknowledged_at = NULL");
    expect(migrationenErReversibel(kopi10)).toBe(false);
    const kopi10b = migration.replace("HAVING count(*) >= 2", "HAVING count(*) >= 1");
    expect(migrationenErReversibel(kopi10b)).toBe(false);
    const kopi10c = migration.replace(/^[^\n]*/, "-- Migration: F0. IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).");
    expect(migrationenErReversibel(kopi10c)).toBe(false);
    // medlemmet uden lås på markeret_* (som før F0's værn: «medlemmet må alt»).
    const kopiVaern = vaern.replace(
      "IF NEW.markeret_at IS NOT NULL OR NEW.markeret_af IS NOT NULL THEN",
      "IF false THEN",
    );
    expect(kopiVaern).not.toBe(vaern);
    expect(vaernetLaaserMedlemmetsFelter(kopiVaern)).toBe(false);
    // rådgiveren må gen-markere en batch-række uden at rydde stemplet.
    const kopiGenmarker = vaern.replace("AND OLD.markeret_at IS NOT NULL\n     AND ((NEW.acknowledged_at", "AND false\n     AND ((NEW.acknowledged_at");
    expect(kopiGenmarker).not.toBe(vaern);
    expect(vaernetLaaserMedlemmetsFelter(kopiGenmarker)).toBe(false);
    const kopiVaernDefiner = vaern.replace("LANGUAGE plpgsql", "LANGUAGE plpgsql\nSECURITY DEFINER");
    expect(vaernetLaaserMedlemmetsFelter(kopiVaernDefiner)).toBe(false);
  });
});
