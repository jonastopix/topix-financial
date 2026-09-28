import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REFLEKSIONS_FELTER } from "@/lib/hjemmebane/refleksioner";

/**
 * Kildeværn for «Dine refleksioner» (28/9-2026) — medlemmets læsning af sine
 * egne pulse_checkins. Fem domme, hver bevist på en kopi med fejlen indsat:
 *
 *   1. SPØRGSMÅLENE ER MODALENS: hvert spoergsmaal i REFLEKSIONS_FELTER står
 *      ORDRET i PulseCheckinModal.tsx, i samme rækkefølge. Skriver og læser
 *      deler ord — ellers ser medlemmet ét spørgsmål, når hun skriver, og et
 *      andet, når hun læser.
 *   2. KUN LÆSNING: hverken hooken eller sektionen indeholder insert/upsert/
 *      update/delete, og hooken læser præcis pulse_checkins med de seks kolonner.
 *   3. FLADEN REGNER IKKE SELV: sektionen går gennem refleksionerTilVisning og
 *      hentetilstand — ingen DANISH_MONTHS, toLocaleDateString, sort eller trim
 *      i komponenten. Dommen bruger husets maanedOrd, ikke sin egen måneds-liste.
 *   4. MONTERET ÉT STED, og hooken står før enhver return i sektionen
 *      (React #310-reglen); Rapportering henter igen, når modalen lukkes.
 *   5. INGEN MIGRATION: ingen fil i supabase/migrations nævner en ny kolonne,
 *      tabel eller politik for refleksionerne (kun flade og læsning).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const MODAL = "src/components/PulseCheckinModal.tsx";
const DOM = "src/lib/hjemmebane/refleksioner.ts";
const HOOK = "src/hooks/useRefleksioner.ts";
const SEKTION = "src/components/hjemmebane/rapportering/RefleksionerSektion.tsx";
const RAPPORTERING = "src/components/hjemmebane/rapportering/RapporteringView.tsx";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const spoergsmaaleneErModalens = (modal: string, spoergsmaal: readonly string[]): boolean => {
  const m = udenKommentarer(modal);
  let sidst = -1;
  for (const s of spoergsmaal) {
    const i = m.indexOf(s);
    if (i === -1 || i < sidst) return false;
    sidst = i;
  }
  return spoergsmaal.length === 3;
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const kunLaesning = (hook: string, sektion: string): boolean => {
  const h = udenKommentarer(hook), s = udenKommentarer(sektion);
  return (
    !/\.(insert|upsert|update|delete)\(/.test(h) &&
    !/\.(insert|upsert|update|delete)\(/.test(s) &&
    !/supabase/.test(s) &&
    h.includes('.from("pulse_checkins")') &&
    h.includes('export const REFLEKSIONER_KOLONNER = "period_key, went_well, biggest_challenge, help_needed, milestone_progress, created_at";') &&
    h.includes(".select(REFLEKSIONER_KOLONNER)") &&
    h.includes('throw new HentningsFejl("pulse_checkins", svar.error.message);')
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const fladenRegnerIkkeSelv = (sektion: string, dom: string): boolean => {
  const s = udenKommentarer(sektion), d = udenKommentarer(dom);
  return (
    s.includes("refleksionerTilVisning(hentning.data ?? [])") &&
    s.includes("hentetilstand(hentning, visninger.length === 0)") &&
    s.includes('sektionsfejlTekst("pulse_checkins")') &&
    !/DANISH_MONTHS|toLocaleDateString|\.sort\(|\.trim\(|split\("-"\)/.test(s) &&
    // Dommen bruger husets måned-i-ord, ikke sin egen liste.
    d.includes('import { maanedOrd } from "@/lib/factsCsv";') &&
    d.includes("maaned: maanedOrd(r.period_key),") &&
    !/DANISH_MONTHS|"Januar"/.test(d) &&
    // Nyeste øverst på period_key, tomme felter trimmes.
    d.includes("b.period_key.localeCompare(a.period_key)") &&
    d.includes("udenTekst: felter.length === 0 && fremgang === null,")
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const monteretEtSted = (rapportering: string, sektion: string): boolean => {
  const r = udenKommentarer(rapportering), s = udenKommentarer(sektion);
  const krop = s.slice(s.indexOf("export function RefleksionerSektion("));
  return (
    (r.match(/<RefleksionerSektion companyId=\{companyId \?\? null\} \/>/g) ?? []).length === 1 &&
    r.includes('import { RefleksionerSektion } from "./RefleksionerSektion";') &&
    r.includes('if (!open) queryClient.invalidateQueries({ queryKey: ["rapportering", "refleksioner"] });') &&
    // Hooken FØR den første return i komponenten.
    foer(krop, "const hentning = useRefleksioner(companyId);", "return (") &&
    !/return[\s\S]*useRefleksioner\(/.test(krop)
  );
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const ingenMigration = (migrationsnavne: readonly string[]): boolean =>
  !migrationsnavne.some((n) => /refleksion/i.test(n));

describe("refleksionMedlem.guard — medlemmet ser sine egne refleksioner", () => {
  it("1. spørgsmålene er modalens, ordret og i rækkefølge", () =>
    expect(spoergsmaaleneErModalens(laes(MODAL), REFLEKSIONS_FELTER.map((f) => f.spoergsmaal))).toBe(true));
  it("2. kun læsning — pulse_checkins, seks kolonner, fejlen kastes med kildens navn", () =>
    expect(kunLaesning(laes(HOOK), laes(SEKTION))).toBe(true));
  it("3. fladen regner ikke selv — dommen gør, med husets maanedOrd", () =>
    expect(fladenRegnerIkkeSelv(laes(SEKTION), laes(DOM))).toBe(true));
  it("4. monteret ét sted i Rapportering, hooken før return, genhentning når modalen lukkes", () =>
    expect(monteretEtSted(laes(RAPPORTERING), laes(SEKTION))).toBe(true));
  it("5. ingen migration for refleksionerne", () =>
    expect(ingenMigration(readdirSync(resolve(process.cwd(), "supabase/migrations")))).toBe(true));
});

describe("refleksionMedlem.guard — dommene fanger fejlen på en kopi", () => {
  const modal = laes(MODAL), hook = laes(HOOK), sektion = laes(SEKTION), dom = laes(DOM), rapportering = laes(RAPPORTERING);
  const SP = REFLEKSIONS_FELTER.map((f) => f.spoergsmaal);

  it("et spørgsmål, der ikke står i modalen, eller i en anden rækkefølge, fælder dom 1", () => {
    expect(spoergsmaaleneErModalens(modal, ["Hvad gik godt", SP[1], SP[2]])).toBe(false);
    expect(spoergsmaaleneErModalens(modal, [SP[1], SP[0], SP[2]])).toBe(false);
    expect(spoergsmaaleneErModalens(modal.split(SP[0]).join("Hvad gik godt?"), SP)).toBe(false);
  });

  it("en skrivning i hooken eller sektionen, eller en anden tabel, fælder dom 2", () => {
    expect(kunLaesning(`${hook}\nsupabase.from("pulse_checkins").upsert({});\n`, sektion)).toBe(false);
    expect(kunLaesning(hook, `${sektion}\nsupabase.from("pulse_checkins").update({});\n`)).toBe(false);
    expect(kunLaesning(hook.split('.from("pulse_checkins")').join('.from("milestones")'), sektion)).toBe(false);
    expect(kunLaesning(hook.split("help_needed, ").join(""), sektion)).toBe(false);
  });

  it("en flade, der selv sorterer eller formaterer måneden, eller en dom med egen månedsliste, fælder dom 3", () => {
    expect(fladenRegnerIkkeSelv(`${sektion}\nconst x = [].sort();\n`, dom)).toBe(false);
    expect(fladenRegnerIkkeSelv(`${sektion}\nconst y = new Date().toLocaleDateString("da-DK");\n`, dom)).toBe(false);
    expect(fladenRegnerIkkeSelv(sektion, dom.split("maaned: maanedOrd(r.period_key),").join('maaned: DANISH_MONTHS[0],'))).toBe(false);
    expect(fladenRegnerIkkeSelv(sektion, dom.split("b.period_key.localeCompare(a.period_key)").join("a.period_key.localeCompare(b.period_key)"))).toBe(false);
  });

  it("monteret to gange, ikke monteret, uden genhentning, eller hooken efter en return, fælder dom 4", () => {
    const M = "<RefleksionerSektion companyId={companyId ?? null} />";
    expect(monteretEtSted(rapportering.split(M).join(`${M}\n${M}`), sektion)).toBe(false);
    expect(monteretEtSted(rapportering.split(M).join(""), sektion)).toBe(false);
    expect(monteretEtSted(rapportering.split('if (!open) queryClient.invalidateQueries({ queryKey: ["rapportering", "refleksioner"] });').join(""), sektion)).toBe(false);
    const H = "const hentning = useRefleksioner(companyId);";
    const senere = sektion.split(H).join("if (!companyId) return null;\n  " + H);
    expect(senere).not.toBe(sektion);
    expect(monteretEtSted(rapportering, senere)).toBe(false);
  });

  it("en migration med «refleksion» i navnet fælder dom 5", () => {
    expect(ingenMigration(["20260928150000_refleksion_set_at.sql"])).toBe(false);
    expect(ingenMigration(["20260928120000_webinar_mails_fjorten_dage.sql"])).toBe(true);
  });
});
