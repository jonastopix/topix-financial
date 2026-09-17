import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Måske relevant for dig» (16/9-2026, Jonas: skal laves i
// dag). Regelbaseret V1: ugens fokus' triggere → handout-modul → den DELTE
// motor lektionerForModul → én stille linje under fokuskortet. Fire ting
// låses (forloeb.guard-mønstret, kildelæsning af React-koden):
//   1. Linjen på forsiden dømmes af maaskeRelevant( fra lib/hjemmebane/
//      maaskeRelevant — fladen filtrerer intet selv, og den henter intet
//      nyt: kataloget og progress kommer fra useAkademiData.
//   2. Motoren kalder lektionerForModul (samme mapping som handout-siden)
//      og itemProgressState — ingen egen modul-filtrering, ingen egen
//      «gennemført»-regel — og bærer ingen supabase-import.
//   3. Fladen: linjen rendres kun når dommen gav noget, med lektionsSti
//      som link og motorens præfiks; ingen egen tekst, ingen linje ved fejl
//      (dommen får `?? null` og giver null). FORSIDE PR 2 (17/9): linjen
//      står nu som FocusCards SIDSTE linje (prop `relevante`, stien regnet
//      i fladen med lektionsSti) — før stod den som løse linjer under
//      kortet i JSX-blokken `{maaskeRelevante && maaskeRelevante.length > 0 && (`.
//   4. Regeltabellen kender netop de ni triggere fra generate-weekly-focus
//      — ændres triggerne dér, fælder værnet her.
// Værnet beviser sig selv på en KOPI med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FLADE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const MOTOR = "src/lib/hjemmebane/maaskeRelevant.ts";
const FOKUS = "supabase/functions/generate-weekly-focus/index.ts";

/** Memo-blokken: fra `const maaskeRelevante = useMemo(` til dens dependency-liste. */
export function memoBlok(flade: string): string {
  const start = flade.indexOf("const maaskeRelevante = useMemo(");
  if (start === -1) return "";
  const slut = flade.indexOf("weeklyFocusQuery.data]);", start);
  return slut === -1 ? "" : flade.slice(start, slut);
}

/** Linjeblokken (PR 2): FocusCards `{!loading && relevante.length > 0 && (`
    til blokkens `</ul>` — PLUS fladens prop-linje `relevante={(maaskeRelevante ?? []).map(…)}`,
    så dommen ser både hvor stien regnes (lektionsSti i fladen) og hvor
    ordene står (præfikset i kortet).
    Før (til 17/9): fra `{maaskeRelevante && maaskeRelevante.length > 0 && (` til
    `{hentefejlLinje && (` under kortet. */
export function linjeBlok(flade: string): string {
  const start = flade.indexOf("{!loading && relevante.length > 0 && (");
  if (start === -1) return "";
  const slut = flade.indexOf("</ul>", start);
  const prop = flade.indexOf("relevante={(maaskeRelevante ?? []).map(");
  if (slut === -1 || prop === -1) return "";
  return flade.slice(start, slut) + "\n" + flade.slice(prop, flade.indexOf("\n", prop));
}

/** Dom 1: fladen dømmer gennem motoren på de kilder den allerede har. */
export const fladenDoemmerGennemMotoren = (flade: string): boolean => {
  const blok = memoBlok(flade);
  return blok !== "" &&
    /import \{[^}]*\bmaaskeRelevant\b[^}]*\} from "@\/lib\/hjemmebane\/maaskeRelevant";/.test(flade) &&
    blok.includes("fokus: weeklyFocusQuery.data ?? null,") &&
    blok.includes("progress: akademi.progressRows,") &&
    blok.includes("[...akademi.orderedByArea.values()].flat().map((entry) => entry.item)") &&
    !/\.filter\(/.test(blok) &&
    !/handout_module/.test(blok) &&
    !/useQuery\(/.test(blok);
};

/** Dom 2: motoren bruger den delte mapping og den delte fremdriftsdom fra de RENE filer. */
export const motorenErDelt = (motor: string): boolean =>
  motor.includes('import { lektionerForModul, type LektionRaekke } from "./lektionerForModul";') &&
  motor.includes('import { itemProgressState, type MemberProgress } from "./progressState";') &&
  motor.includes("lektionerForModul(i.lektioner, modul)") &&
  motor.includes('itemProgressState(progressAf.get(l.id)) !== "done"') &&
  !/handout_module ===/.test(motor) &&
  !/acknowledged_at\)\s*(===|!==)|\.acknowledged_at\s*\?/.test(motor.replace(/r\.acknowledged_at \|\| r\.brugbar == null/, "")) &&
  !/supabase/.test(motor);

/** Importkæden fra en fil: alle VÆRDI-imports (ikke `import type`) af
    relative stier og @/lib/…-stier, rekursivt. Filerne læses uden
    kommentarer; en sti uden endelse prøves som .ts og .tsx. Returnerer
    kæden (stier) — og stopper ved filer uden for src/lib (de er ikke rene
    pr. definition og tælles som «urene»). */
export function importKaede(startSti: string, laesFil: (sti: string) => string | null = laesEllerNull): string[] {
  const set = new Set<string>();
  const koe = [startSti];
  while (koe.length > 0) {
    const sti = koe.shift()!;
    if (set.has(sti)) continue;
    set.add(sti);
    const kilde = laesFil(sti);
    if (kilde == null) continue;
    for (const m of udenKommentarer(kilde).matchAll(/^import\s+(?!type\s)[^;]*?from\s+"([^"]+)";/gm)) {
      const spec = m[1];
      let maal: string | null = null;
      if (spec.startsWith("./") || spec.startsWith("../")) maal = resolve(sti, "..", spec).replace(`${resolve(process.cwd())}/`, "");
      else if (spec.startsWith("@/")) maal = `src/${spec.slice(2)}`;
      if (!maal) continue;
      koe.push(maal);
    }
  }
  return [...set];
}

function laesEllerNull(sti: string): string | null {
  for (const kandidat of [sti, `${sti}.ts`, `${sti}.tsx`]) {
    try {
      return readFileSync(resolve(process.cwd(), kandidat), "utf8");
    } catch {
      /* prøv næste */
    }
  }
  return null;
}

/** Dom 5 (rettelse 16/9): TRANSITIVT ingen Supabase-klient i motorens kæde —
    hverken direkte eller gennem en fil der selv importerer klienten
    (akademiApi.ts gør; den startede auto-refresh-timeren i vitest og
    væltede suiten med exit 1 trods grønne tests). */
export const motorenErRenTransitivt = (kaede: readonly string[], laesFil: (sti: string) => string | null = laesEllerNull): boolean =>
  kaede.every((sti) => {
    if (!sti.startsWith("src/lib/")) return false;
    const kilde = laesFil(sti);
    return kilde != null && !/@\/integrations\/supabase|from "\.\.\/\.\.\/integrations|supabase-js/.test(udenKommentarer(kilde));
  });

/** Dom 3: linjen — kun ved match, motorens ord, lektionsSti som link.
    Før (til 17/9): blok.includes("{maaskeRelevante && maaskeRelevante.length > 0 && (") &&
    blok.includes("<Link to={lektionsSti(lektion)}"). */
export const linjenErMotorens = (flade: string): boolean => {
  const blok = linjeBlok(flade);
  return blok.includes("{!loading && relevante.length > 0 && (") &&
    blok.includes("{MAASKE_RELEVANT_PRAEFIKS}:") &&
    blok.includes("<Link to={lektion.sti}") &&
    blok.includes("sti: lektionsSti(lektion)") &&
    !/Måske relevant/.test(blok);
};

/** Dom 4: regeltabellen = triggerne i generate-weekly-focus. */
export const tabellenFoelgerTriggerne = (motor: string, fokus: string): boolean => {
  const iFokus = new Set([...fokus.matchAll(/triggers\.push\("([A-Z_]+)"\)/g)].map((m) => m[1]));
  const tabelStart = motor.indexOf("export const MODUL_FOR_TRIGGER");
  const tabel = motor.slice(tabelStart, motor.indexOf("};", tabelStart));
  const iTabel = new Set([...tabel.matchAll(/^\s*([A-Z_]+):/gm)].map((m) => m[1]));
  return iFokus.size > 0 && [...iFokus].every((t) => iTabel.has(t)) && [...iTabel].every((t) => iFokus.has(t));
};

describe("maaskeRelevant.guard — lektionen der passer til ugens fokus", () => {
  const flade = udenKommentarer(laes(FLADE));
  const motor = udenKommentarer(laes(MOTOR));
  const fokus = udenKommentarer(laes(FOKUS));

  it("1. fladen dømmer gennem maaskeRelevant( på useAkademiData og weeklyFocusQuery — ingen egen filtrering, ingen ny query", () => {
    expect(memoBlok(flade)).not.toBe("");
    expect(linjeBlok(flade)).not.toBe("");
    expect(fladenDoemmerGennemMotoren(flade)).toBe(true);
  });
  it("2. motoren bruger lektionerForModul og itemProgressState — samme mapping som handout-siden, ingen supabase", () => {
    expect(motorenErDelt(motor)).toBe(true);
  });
  it("3. linjen: kun ved match, motorens præfiks, lektionsSti som link, ingen egen tekst", () => {
    expect(linjenErMotorens(flade)).toBe(true);
    expect(flade).toContain('import { lektionsSti } from "@/lib/hjemmebane/lektionerForModul";');
  });
  it("4. regeltabellen kender netop generate-weekly-focus' triggere", () => {
    expect(tabellenFoelgerTriggerne(motor, fokus)).toBe(true);
  });
  it("5. motorens importkæde er REN transitivt: kun src/lib-filer, ingen Supabase-klient nogen steder i kæden", () => {
    const kaede = importKaede(MOTOR);
    expect(kaede).toContain("src/lib/hjemmebane/progressState");
    expect(kaede).toContain("src/lib/hjemmebane/lektionerForModul");
    expect(kaede.some((s) => s.endsWith("akademiApi"))).toBe(false);
    expect(motorenErRenTransitivt(kaede)).toBe(true);
    // progressState.ts har ingen imports overhovedet — det er formen.
    expect(udenKommentarer(laes("src/lib/hjemmebane/progressState.ts")).match(/^import /gm) ?? []).toHaveLength(0);
  });
  it("memo'en står EFTER weeklyFocusQuery (ingen brug før erklæring) og før første betingede return", () => {
    const krop = flade.slice(flade.indexOf("export const BoardroomView"));
    const query = krop.indexOf("const weeklyFocusQuery = useQuery(");
    const memo = krop.indexOf("const maaskeRelevante = useMemo(");
    expect(query).toBeGreaterThan(-1);
    expect(memo).toBeGreaterThan(query);
    expect(memo).toBeLessThan(krop.indexOf("\n  if (akademi.loading || factsLoading) {"));
  });
});

describe("maaskeRelevant.guard — dommene fanger fejlen på en kopi af kilden", () => {
  const flade = udenKommentarer(laes(FLADE));
  const motor = udenKommentarer(laes(MOTOR));
  const fokus = udenKommentarer(laes(FOKUS));

  it("1. en flade med egen filtrering på handout_module fælder dom 1", () => {
    const egen = flade.replace(
      "[...akademi.orderedByArea.values()].flat().map((entry) => entry.item)",
      '[...akademi.orderedByArea.values()].flat().map((entry) => entry.item).filter((l) => l.handout_module === "bogholderi")',
    );
    expect(egen).not.toBe(flade);
    expect(fladenDoemmerGennemMotoren(egen)).toBe(false);
  });
  it("2. en motor med egen modul-filtrering i stedet for lektionerForModul fælder dom 2", () => {
    const egen = motor.replace("lektionerForModul(i.lektioner, modul)", "i.lektioner.filter((l) => l.handout_module === modul)");
    expect(egen).not.toBe(motor);
    expect(motorenErDelt(egen)).toBe(false);
  });
  it("3. en linje med fast tekst eller uden lektionsSti fælder dom 3", () => {
    expect(linjenErMotorens(flade.replace("{MAASKE_RELEVANT_PRAEFIKS}:", "Måske relevant for dig:"))).toBe(false);
    // Før: flade.replace("<Link to={lektionsSti(lektion)}", "<Link to={`/akademiet/${lektion.id}`}").
    expect(linjenErMotorens(flade.replace("sti: lektionsSti(lektion)", "sti: `/akademiet/${lektion.id}`"))).toBe(false);
    expect(linjenErMotorens(flade.replace("<Link to={lektion.sti}", "<Link to={`/akademiet/${lektion.id}`}"))).toBe(false);
  });
  it("5. en motor der importerer fra akademiApi (som importerer klienten) fælder dom 5 — transitivt, ikke kun i den ene fil", () => {
    // Kopien af motoren peger på akademiApi igen; alt andet læses fra disken som det er.
    const kopi = motor.replace('from "./progressState";', 'from "./akademiApi";');
    expect(kopi).not.toBe(motor);
    const laesKopi = (sti: string) => (sti === MOTOR ? kopi : laesEllerNull(sti));
    const kaede = importKaede(MOTOR, laesKopi);
    expect(kaede.some((s) => s.endsWith("akademiApi"))).toBe(true);
    // Selve motor-filen nævner stadig ikke «supabase» — den gamle fil-lokale dom ville være grøn …
    expect(/supabase/.test(kopi)).toBe(false);
    // … men kæden er uren: akademiApi importerer @/integrations/supabase/client.
    expect(motorenErRenTransitivt(kaede, laesKopi)).toBe(false);
  });
  it("4. en ny trigger i generate-weekly-focus uden linje i tabellen fælder dom 4", () => {
    expect(tabellenFoelgerTriggerne(motor, fokus + '\n  triggers.push("NOGET_NYT");\n')).toBe(false);
    expect(tabellenFoelgerTriggerne(motor.replace('  REPORT_UPLOADED: null,\n', ""), fokus)).toBe(false);
  });
});
