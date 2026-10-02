import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STREAK_FRIST_DAG } from "@/lib/boardroomScore/streak";

// Kildeværn for Boardroom Score-fladen (30/9-2026, Jonas D3). Ni domme:
//   1. HOOKS I TOPBLOKKEN (React #310): BoardroomView kalder useBoardroomScore()
//      FØR sin første betingede return; ScoreKort kalder sine hooks før sin første.
//   2. PLACERINGEN (docs/boardroom-score.md §7 «mellem Din måned og planen"):
//      sektionen står EFTER toppens grid (tiles) og FØR «Din plan» — toppen er urørt.
//   3. INGEN HÅRDKODET HANDLING: kortet og ordene henter handlingerne gennem
//      loefterMitTal (motoren); ingen af motorens handlingstekster står i fladen.
//   4. ÉN HOOK, KENDTE KILDER: hooken læser KUN de fem tabeller fra #1171
//      (ingen .rpc — ingen ny SECURITY DEFINER-vej), og den eneste fail-soft
//      er erManglendeTabel på hukommelsens tabel.
//   5. prefers-reduced-motion respekteres (tallet og barerne).
//   6. Ingen emojis i fladen eller ordene.
//   7. KOMPAKT (Jonas 30/9 20:43): kun den ØVERSTE løfter i hvile; resten bag en
//      knap med aria-expanded + aria-controls, lukket som standard.
//   8. Skærmlæserteksten (sr-only, position:absolute) står inde i ringens
//      `relative`-boks (positioneret forfader), og buen er regnet af ringBue.
//   9. ÉN FRIST (rådets gennemsyn af #1189): det SIDSTE element i
//      send-report-reminders REMINDER_DAYS er lig STREAK_FRIST_DAG (streak.ts) —
//      ændres den ene uden den anden, fælder dommen.
// Hver dom prøves også på en ødelagt kopi (selvbevis — forsideTop.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const KORT = "src/components/hjemmebane/boardroom/ScoreKort.tsx";
const ORD = "src/lib/hjemmebane/scoreKort.ts";
const HOOK = "src/hooks/useBoardroomScore.ts";
const STREAK = "src/lib/boardroomScore/streak.ts";
const PAAMINDELSE = "supabase/functions/send-report-reminder/index.ts";

/** Dom 1a: hooken står i BoardroomViews krop før den første `return` på komponentens egen indrykning (2 mellemrum). */
export const hookFoerReturn = (forside: string): boolean => {
  const krop = forside.indexOf("export const BoardroomView = () => {");
  if (krop === -1) return false;
  const hook = forside.indexOf("= useBoardroomScore()", krop);
  const m = /\n {2}(if \([^\n]*\) \{\n {4}return|if \([^\n]*\) return|return \()/.exec(forside.slice(krop));
  const foersteReturn = m ? krop + m.index : -1;
  return hook > krop && foersteReturn > hook;
};

/** Dom 1b: ScoreKorts hooks før dens første `return`. */
export const kortHooksFoerst = (kort: string): boolean => {
  const krop = kort.indexOf("export const ScoreKort = (");
  if (krop === -1) return false;
  const rest = kort.slice(krop);
  const retur = rest.search(/\n {2}(if \(|return )/);
  const hooks = [rest.indexOf("useFaarBevaegelse()"), rest.indexOf("useTaelOp(")];
  return retur > -1 && hooks.every((h) => h > -1 && h < retur);
};

/** Dom 2: sektionen mellem toppen og «Din plan». (Til 2/10 var toppens slut
    tiles — data-forside-tiles; båndet er væk (seks steder), så toppens slut er
    nu «Dit næste skridt»-sektionens afslutning.) */
export const placering = (forside: string): boolean => {
  const top = forside.indexOf("data-forside-top");
  const hoejre = forside.indexOf("data-forside-hoejre", top);
  const skridt = forside.indexOf("data-forside-naeste-skridt", hoejre);
  const score = forside.indexOf("data-forside-score");
  const plan = forside.indexOf('id="din-plan"');
  return top > -1 && hoejre > top && skridt > hoejre && score > skridt && plan > score &&
    // Kortet står ikke i toppens højre kolonne (Din måned / Dit næste skridt er urørt).
    forside.slice(hoejre, score).indexOf("<ScoreKort") === -1 &&
    (forside.match(/<ScoreKort\b/g) ?? []).length === 1;
};

/** Motorens handlingstekster (score.ts:handlingerFor) — må ikke stå i fladen. */
const MOTORENS_TEKSTER = ["— måneden mangler", "Godkend flere måneder", "Læg et budget", "Sæt et mål med en frist", "Sig ja til et af jeres mål", "Én måneds omkostninger", "Ét procentpoint", "Fem procent mere", "Upload en rapport med banksaldo"];

/** Dom 3. */
export const ingenHaardkodetHandling = (kort: string, ord: string): boolean => {
  const k = udenKommentarer(kort);
  const o = udenKommentarer(ord);
  return /loefterLinjer\(dom\)/.test(k) && /loefterMitTal\(dom\)/.test(o) &&
    MOTORENS_TEKSTER.every((t) => !k.includes(t) && !o.includes(t)) &&
    !/\.gevinst\s*[-+*/]/.test(k);
};

/** Dom 4. Skive 3 (2/10-2026): «mål» læses af milestones (Dine mål) — kpi_targets står KUN som fail-soft
    tilbagefald, når kolonnen bekraeftet_at mangler (erManglendeKolonne, én gang). */
export const kendteKilder = (hook: string): boolean => {
  const k = udenKommentarer(hook);
  const tabeller = [...k.matchAll(/\.from\("([a-z_]+)"/g)].map((m) => m[1]).sort();
  const forventet = ["budget_targets", "companies", "financial_report_facts", "kpi_targets", "maaned_foerste_godkendelse", "milestones"];
  const failSoft = (k.match(/erManglendeTabel\(/g) ?? []).length;
  const kolonneFailSoft = (k.match(/erManglendeKolonne\(/g) ?? []).length;
  return JSON.stringify(tabeller) === JSON.stringify(forventet) && !/\.rpc\(/.test(k) && failSoft === 1 && kolonneFailSoft === 1 &&
    /hukommelseRes\?\.error && erManglendeTabel\(hukommelseRes\.error\)\) return \{ tilstand: "afventer_migration" \}/.test(k) &&
    // kpi_targets kun inde i tilbagefaldet, og milestones dømmes af motorens taellerSomScoreMaal — ingen egen regel i hooken.
    /if \(maal\.error && erManglendeKolonne\(maal\.error\)\) \{\s*const kpi = await supabase\.from\("kpi_targets"\)/.test(k) &&
    /\.some\(taellerSomScoreMaal\)/.test(k);
};

/** Dom 5. */
export const bevaegelseRespekteres = (kort: string): boolean =>
  /prefers-reduced-motion: reduce/.test(kort) && /motion-reduce:transition-none/.test(kort) && /if \(!bevaegelse \|\|/.test(kort);

/** Dom 7: én synlig løfter, resten bag en tilgængelig knap, lukket som standard. */
export const kompaktLoefter = (kort: string): boolean => {
  const k = udenKommentarer(kort);
  return /const \[oeverst, \.\.\.oevrige\] = loefter;/.test(k) &&
    /<LoefterRaekke h=\{oeverst\} \/>/.test(k) &&
    !/loefter\.map\(/.test(k) &&
    /useState\(false\)/.test(k) &&
    /aria-expanded=\{aaben\}/.test(k) &&
    /aria-controls=\{detaljerId\}/.test(k) &&
    /id=\{detaljerId\} hidden=\{!aaben\}/.test(k);
};

/** Dom 8: sr-only i ringens relative boks; buen af ringBue. */
export const srIRelativRing = (kort: string): boolean => {
  const k = udenKommentarer(kort);
  const ring = k.indexOf('className="relative h-24 w-24');
  const sr = k.indexOf('className="sr-only"');
  const ringSlut = ring === -1 ? -1 : k.indexOf("\n          </div>\n", ring);
  return ring > -1 && sr > ring && ringSlut > sr && /ringBue\(tallet\)/.test(k);
};

/** Dom 9: sidste påmindelsesdag = streakens frist. Begge læses af KILDEN (edge-functionen kan ikke importeres). null = kunne ikke læses. */
export const paamindelsesDage = (paamindelse: string): number[] | null => {
  const m = /const REMINDER_DAYS\s*=\s*\[([^\]]*)\]/.exec(udenKommentarer(paamindelse));
  if (!m) return null;
  const dage = m[1].split(",").map((d) => d.trim()).filter(Boolean).map(Number);
  return dage.length > 0 && dage.every((d) => Number.isInteger(d)) ? dage : null;
};
export const streakFristDag = (streak: string): number | null => {
  const m = /export const STREAK_FRIST_DAG\s*=\s*(\d+)\s*;/.exec(udenKommentarer(streak));
  return m ? Number(m[1]) : null;
};
export const enFrist = (paamindelse: string, streak: string): boolean => {
  const dage = paamindelsesDage(paamindelse);
  const frist = streakFristDag(streak);
  return dage !== null && frist !== null && dage[dage.length - 1] === frist;
};

/** Dom 6. */
export const ingenEmoji = (...filer: string[]): boolean => filer.every((f) => !/\p{Extended_Pictographic}/u.test(f));

describe("Boardroom Score-fladen — kildeværn", () => {
  const forside = laes(FORSIDE);
  const kort = laes(KORT);
  const ord = laes(ORD);
  const hook = laes(HOOK);

  it("dom 1: hooks i topblokken (React #310) — forsiden og kortet", () => {
    expect(hookFoerReturn(forside)).toBe(true);
    expect(kortHooksFoerst(kort)).toBe(true);
    // Selvbevis: flyttes hooken under den første return, fælder dommen.
    const flyttet = forside.replace("  const boardroomScore = useBoardroomScore();\n", "").replace("  return (\n    <div>\n      <PageHeader", "  const boardroomScore = useBoardroomScore();\n  return (\n    <div>\n      <PageHeader");
    expect(flyttet).not.toBe(forside);
    expect(hookFoerReturn(flyttet)).toBe(false);
    expect(kortHooksFoerst(kort.replace("  const bevaegelse = useFaarBevaegelse();\n", ""))).toBe(false);
  });

  it("dom 2: sektionen står mellem toppen og «Din plan», én gang, ikke i højre kolonne", () => {
    expect(placering(forside)).toBe(true);
    const iToppen = forside.replace("data-forside-din-maaned>", "data-forside-din-maaned><ScoreKort />");
    expect(placering(iToppen)).toBe(false);
  });

  it("dom 3: ingen hårdkodet handling — alt gennem loefterMitTal", () => {
    expect(ingenHaardkodetHandling(kort, ord)).toBe(true);
    expect(ingenHaardkodetHandling(kort + '\nconst x = "Læg et budget for 2026.";', ord)).toBe(false);
    expect(ingenHaardkodetHandling(kort.replace("loefterLinjer(dom)", "[]"), ord)).toBe(false);
  });

  it("dom 4: hooken læser kun de fem tabeller, ingen rpc, og er kun fail-soft på den manglende hukommelse", () => {
    expect(kendteKilder(hook)).toBe(true);
    expect(kendteKilder(hook + '\nsupabase.from("profiles").select("id");')).toBe(false);
    expect(kendteKilder(hook + '\nsupabase.rpc("noget");')).toBe(false);
  });

  it("dom 5: prefers-reduced-motion respekteres", () => {
    expect(bevaegelseRespekteres(kort)).toBe(true);
    expect(bevaegelseRespekteres(kort.split("motion-reduce:transition-none").join(""))).toBe(false);
  });

  it("dom 7: kun den øverste løfter i hvile; resten bag «Se hvad der tæller» (aria-expanded, lukket som standard)", () => {
    expect(kompaktLoefter(kort)).toBe(true);
    expect(kompaktLoefter(kort.replace("<LoefterRaekke h={oeverst} />", "{loefter.map((h) => <LoefterRaekke h={h} />)}"))).toBe(false);
    expect(kompaktLoefter(kort.replace("useState(false)", "useState(true)"))).toBe(false);
    expect(kompaktLoefter(kort.replace("aria-expanded={aaben}", ""))).toBe(false);
  });

  it("dom 8: skærmlæserteksten står inde i ringens relative boks", () => {
    expect(srIRelativRing(kort)).toBe(true);
    expect(srIRelativRing(kort.replace('className="relative h-24 w-24', 'className="h-24 w-24'))).toBe(false);
  });

  it("dom 9: sidste påmindelsesdag (send-report-reminder) = STREAK_FRIST_DAG — én frist", () => {
    const paamindelse = laes(PAAMINDELSE);
    const streak = laes(STREAK);
    expect(paamindelsesDage(paamindelse)).not.toBeNull();
    expect(streakFristDag(streak)).toBe(STREAK_FRIST_DAG);
    expect(enFrist(paamindelse, streak)).toBe(true);
    // Selvbevis: den ene ændret uden den anden fælder — begge veje.
    const nyPaamindelse = paamindelse.replace("const REMINDER_DAYS = [7, 15, 20];", "const REMINDER_DAYS = [7, 15, 25];");
    expect(nyPaamindelse).not.toBe(paamindelse);
    expect(enFrist(nyPaamindelse, streak)).toBe(false);
    const nyStreak = streak.replace("export const STREAK_FRIST_DAG = 20;", "export const STREAK_FRIST_DAG = 10;");
    expect(nyStreak).not.toBe(streak);
    expect(enFrist(paamindelse, nyStreak)).toBe(false);
    // Begge ændret i takt står.
    expect(enFrist(nyPaamindelse, streak.replace("export const STREAK_FRIST_DAG = 20;", "export const STREAK_FRIST_DAG = 25;"))).toBe(true);
    // Kan en af dem ikke læses, fælder dommen (fail-closed).
    expect(enFrist(paamindelse.replace("REMINDER_DAYS = [", "PAAMINDELSESDAGE = ["), streak)).toBe(false);
  });

  it("dom 6: ingen emojis i fladen eller ordene", () => {
    expect(ingenEmoji(kort, ord)).toBe(true);
    expect(ingenEmoji(kort + "\n// \u{1F525}")).toBe(false);
  });
});
