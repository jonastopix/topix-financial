import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAKS_AENDRINGER_PR_RUNDE, SIDST_AABNET_FORBEHOLD } from "@/lib/marketing/maalingsdom";

/**
 * Kildeværn for lag 6 — dommen (udkast 19/9-2026). Ni regler, hver bevist på
 * en kopi med fejlen sat ind.
 *
 * HVORFOR ET KILDEVÆRN OG IKKE KUN TESTS: reglerne her handler om, hvad koden
 * ikke må GØRE. En test kan vise, at «for få» står i dag; kun værnet fanger
 * den, der om tre måneder tilføjer en anden vej til det samme tal uden
 * spærren. Netop dette lag er stedet, hvor den fejl ville være usynlig —
 * resultatet ville stadig se ud som et tal.
 *
 *   1. Tærsklerne står ved NAVN. Et `>= 3` i en gren er en tærskel, ingen
 *      kan finde igen.
 *   2. `doemNiveau` kræver BEGGE betingelser. Med «eller» bliver tyve
 *      webinarer med tre mennesker til en sammenligning.
 *   3. Der findes ÉN vej til et forhold. Bygges et `Forhold` uden `forhold()`,
 *      kan `nokTilAtSigeNoget` sættes til hvad som helst.
 *   4. Under tærsklen ERSTATTER sætningen procenten — den står ikke ved siden
 *      af den. Et tal, der ikke bærer, må ikke stå, hvor et der bærer ville stå.
 *   5. Forbeholdet om «sidst åbnet» bæres af TYPEN, ikke af en kommentar.
 *   6. Wilson, ikke normaltilnærmelsen. Den sidste giver [0, 0] ved 0 af 3.
 *   7. «Overlapper» siges aldrig som «ens».
 *   8. LAGET SKRIVER IKKE, OG LAGET ER IKKE AGENTEN (Jonas' to forbud):
 *      ingen Supabase, ingen insert/update, ingen fetch, ingen prompt.
 *   9. Mindet bygger på `klaviyo_spor` — ingen ny tabel — og «hvad skete der»
 *      regnes, gemmes ikke.
 *  11. VINDUET SKAL VÆRE GÅET, FØR DET TÆLLES (fundet i onsdagsprøven 19/9):
 *      nævneren i «ansøgte inden N timer» er kun de modtagere, hvis N timer
 *      faktisk er udløbet. Uden den regel står hver rate som «0 %» dagen efter
 *      et webinar og ligner en dom over flowet.
 *  10. Døren giver aldrig et tal uden sit forbehold: `doemMarketing` samler
 *      måling, minde og grænse, og `somTekst` skriver advarslerne ØVERST. En
 *      advarsel under tabellen læses efter beslutningen er truffet.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
/** Kommentarer ud — så en regel ikke kan «overholdes» af sin egen beskrivelse. */
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const DOM = "src/lib/marketing/maalingsdom.ts";
const STAT = "src/lib/marketing/statistik.ts";
const MINDE = "src/lib/marketing/minde.ts";
const DOER = "src/lib/marketing/marketingdom.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
const TAERSKLER = [
  "SESSIONER_FOR_MOENSTER",
  "SESSIONER_FOR_SAMMENLIGNING",
  "PERSONER_FOR_ET_FORHOLD",
  "HAENDELSER_FOR_SAMMENLIGNING",
  "MAKS_AENDRINGER_PR_RUNDE",
];
export const taerskleneStaarVedNavn = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  if (!TAERSKLER.every((t) => new RegExp(`export const ${t} = \\d`).test(d))) return false;
  // Ingen sammenligning mod et tal ≥ 2 nogen steder i koden. `> 0` og `=== 0`
  // er tomhedstjek, ikke tærskler, og er med vilje tilladt.
  return !/[<>]=?\s*(?:[2-9]|\d{2,})\b/.test(d);
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const niveauetKraeverBegge = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  return /s >= SESSIONER_FOR_SAMMENLIGNING && g >= HAENDELSER_FOR_SAMMENLIGNING/.test(d) &&
    /s >= SESSIONER_FOR_MOENSTER && g >= PERSONER_FOR_ET_FORHOLD/.test(d) &&
    // Og aldrig «eller» mellem de to slags betingelser.
    !/(SESSIONER_FOR_\w+|s) >= [^\n]*\|\|/.test(d);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const enVejTilEtForhold = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  // Ankeret er KODE, ikke en afsnitskommentar: kommentarerne er skrællet væk,
  // og et anker, der ikke findes, ville gøre reglen tom.
  const slut = d.indexOf("export interface MailMaaling");
  if (slut < 0) return false;
  // Hvert eneste sted, feltet sættes, ligger FØR første måling — altså inde i
  // interfacet og i `forhold()` selv.
  return d.includes("export function forhold(") && d.lastIndexOf("nokTilAtSigeNoget:") < slut;
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const saetningenErstatterTallet = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  const start = d.indexOf("export function forhold(");
  const slut = d.indexOf("export interface MailMaaling");
  if (start < 0 || slut < start) return false;
  const krop = d.slice(start, slut);
  // Én grenet sætning: enten intervallet ELLER «for få» — aldrig begge.
  return /saetning: nok\s*\?\s*`\$\{intervalOrd\(i\)\}[^`]*`\s*:\s*`[^`]*FOR FÅ TIL AT SIGE NOGET`/.test(krop) &&
    krop.includes("const nok = n >= PERSONER_FOR_ET_FORHOLD;") &&
    // Tallet står aldrig uden sin nævner.
    krop.includes("af ${antal} ${hvad}");
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const forbeholdetBaeresAfTypen = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  return d.includes("export const SIDST_AABNET_FORBEHOLD") &&
    // Påkrævet felt — ikke valgfrit, ikke en kommentar.
    /export interface ForudMaaling \{[\s\S]*?\n  forbehold: string;\n\}/.test(d) &&
    d.includes("forbehold: SIDST_AABNET_FORBEHOLD") &&
    SIDST_AABNET_FORBEHOLD.includes("ikke «årsag til»");
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const wilsonIkkeNormaltilnaermelse = (stat: string): boolean => {
  const s = udenKommentarer(stat);
  const krop = s.slice(s.indexOf("export function wilson("), s.indexOf("export type Sammenligning"));
  if (krop === "") return false;
  // De to led, der ER Wilson: korrektionen i midten og z²/4n² under roden.
  return krop.includes("z2 / (2 * antal)") && krop.includes("z2 / (4 * antal * antal)") &&
    krop.includes("const naevner = 1 + z2 / antal;") &&
    // Og ingen rå normaltilnærmelse nogen steder i filen.
    !/p \+ z \* Math\.sqrt/.test(s) && !/p - z \* Math\.sqrt/.test(s);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const overlapErIkkeEns = (dom: string, stat: string): boolean => {
  const d = udenKommentarer(dom);
  const s = udenKommentarer(stat);
  return s.includes('export type Sammenligning = "adskilte" | "overlapper" | "kan_ikke"') &&
    // Ordet «ens» findes KUN som en benægtelse.
    d.includes("Det betyder IKKE at de er ens") &&
    !/udfald: "ens"/.test(d) && !/"ens"/.test(s) &&
    // Og «reel» siges kun i den adskilte gren.
    /u === "adskilte"\s*\n?\s*\?[^:]*forskellen er reel/.test(d);
};

// ── 8 ──────────────────────────────────────────────────────────────────────
const SKRIVEORD = [".insert(", ".update(", ".upsert(", ".delete(", "supabase", "fetch(", "Deno.env"];
const AGENTORD = ["prompt", "anthropic", "claude-", "messages.create"];
export const lagetSkriverIkkeOgErIkkeAgenten = (filer: readonly string[]): boolean =>
  filer.every((k) => {
    const f = udenKommentarer(k);
    return SKRIVEORD.every((o) => !f.includes(o)) && AGENTORD.every((o) => !f.toLowerCase().includes(o));
  });

// ── 9 ──────────────────────────────────────────────────────────────────────
export const mindetBrugerSporet = (minde: string): boolean => {
  const m = udenKommentarer(minde);
  const raa = minde; // Tabelnavnet må gerne stå i hovedet; ny tabel må det ikke.
  return m.includes("export interface Sporraekke") &&
    m.includes("toerkoersel: boolean") &&
    // Kun det, der faktisk blev skrevet, huskes som et forsøg.
    m.includes('r.toerkoersel === false && r.udfald === "skrevet"') &&
    raa.includes("klaviyo_spor") &&
    !/create table/i.test(raa) &&
    // «Hvad skete der» REGNES: kanAflaeses findes ikke som et felt, der gives ind.
    /kanAflaeses: kan/.test(m) &&
    !/kanAflaeses/.test(m.slice(m.indexOf("export interface Sporraekke"), m.indexOf("export interface SessionTid")));
};

// ── 10 ─────────────────────────────────────────────────────────────────────
export const doerenGiverAldrigEtTalAlene = (doer: string): boolean => {
  const d = udenKommentarer(doer);
  // Samlingen kan ikke omgås: advarslerne er et felt på dommen, og de tre
  // dele regnes i den samme funktion.
  const samlet = /advarsler: \[\.\.\.maaling\.advarsler, budget\.saetning\]/.test(d) &&
    d.includes("const minde = doemMinde(") && d.includes("const budget = doemBudget(");
  // Teksten: løkken over advarsler står FØR den første overskrift.
  const foerst = d.indexOf("for (const a of d.advarsler) l.push(");
  const niveau = d.indexOf("NIVEAU:");
  return samlet && foerst > 0 && niveau > foerst &&
    // Og «må anbefales» kræver BÅDE niveau og budget.
    /maaAnbefales: maaling\.niveau\.niveau !== "observation" && budget\.tilbage > 0/.test(d);
};

// ── 11 ─────────────────────────────────────────────────────────────────────
export const vinduetSkalVaereGaaet = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  return (
    // Tiden GIVES IND — ellers måler dommen mod maskinens ur.
    d.includes("export function maalMails(ind: MaalingsInput, nu: Date = new Date())") &&
    d.includes("export function doemMaaling(ind: MaalingsInput, nu: Date = new Date())") &&
    d.includes("maalMails(ind, nu)") &&
    // Nævneren er de UDLØBNE, og tælleren regnes af den samme liste.
    /const udloebne = modtagne\.filter\(\(u\) => \(tid\(u\.modtaget_at\) as number\) \+ vindue <= nuMs\)/.test(d) &&
    /const antal = udloebne\.filter\(/.test(d) &&
    /forhold\(antal, udloebne\.length,/.test(d) &&
    // Og et uafsluttet vindue siges højt.
    d.includes("m.modneInden[sidsteVindue] < m.modtaget") &&
    d.includes("De tal er ikke færdige")
  );
};

describe("lag 6 — kildeværn for dommen", () => {
  it("1. tærsklerne står ved navn, aldrig som et tal i en gren", () => {
    const dom = laes(DOM);
    expect(taerskleneStaarVedNavn(dom)).toBe(true);
    expect(taerskleneStaarVedNavn(`${dom}\nconst nok = sessioner >= 3;`)).toBe(false);
    expect(taerskleneStaarVedNavn(dom.replace("export const SESSIONER_FOR_MOENSTER = 3;", ""))).toBe(false);
  });

  it("2. niveauet kræver BEGGE betingelser", () => {
    const dom = laes(DOM);
    expect(niveauetKraeverBegge(dom)).toBe(true);
    expect(niveauetKraeverBegge(
      dom.replace("s >= SESSIONER_FOR_SAMMENLIGNING && g >= HAENDELSER_FOR_SAMMENLIGNING",
                  "s >= SESSIONER_FOR_SAMMENLIGNING || g >= HAENDELSER_FOR_SAMMENLIGNING"),
    )).toBe(false);
  });

  it("3. der findes én vej til et forhold", () => {
    const dom = laes(DOM);
    expect(enVejTilEtForhold(dom)).toBe(true);
    // En «hurtig» genvej sidst i filen, der sætter feltet uden om forhold().
    expect(enVejTilEtForhold(`${dom}\nconst snyd = { succes: 1, n: 1, interval: null, nokTilAtSigeNoget: true, saetning: "100 %" };`)).toBe(false);
  });

  it("4. under tærsklen erstatter sætningen tallet", () => {
    const dom = laes(DOM);
    expect(saetningenErstatterTallet(dom)).toBe(true);
    // Den klassiske fejl: procenten vises altid, med en stjerne ved siden af.
    expect(saetningenErstatterTallet(
      dom.replace(/saetning: nok\n(\s+)\? `\$\{intervalOrd\(i\)\} — \$\{s\} af \$\{antal\} \$\{hvad\}`\n\s+: `[^`]*`,/,
                  "saetning: `${intervalOrd(i)}${nok ? \"\" : \" *\"}`,"),
    )).toBe(false);
    expect(saetningenErstatterTallet(dom.replace("const nok = n >= PERSONER_FOR_ET_FORHOLD;", "const nok = true;"))).toBe(false);
  });

  it("5. forbeholdet bæres af typen", () => {
    const dom = laes(DOM);
    expect(forbeholdetBaeresAfTypen(dom)).toBe(true);
    expect(forbeholdetBaeresAfTypen(dom.replace("\n  forbehold: string;\n}", "\n  forbehold?: string;\n}"))).toBe(false);
    expect(forbeholdetBaeresAfTypen(dom.replace(/forbehold: SIDST_AABNET_FORBEHOLD/g, "antal2: 0"))).toBe(false);
  });

  it("6. Wilson, ikke normaltilnærmelsen", () => {
    const stat = laes(STAT);
    expect(wilsonIkkeNormaltilnaermelse(stat)).toBe(true);
    expect(wilsonIkkeNormaltilnaermelse(stat.replace("z2 / (4 * antal * antal)", "0"))).toBe(false);
    expect(wilsonIkkeNormaltilnaermelse(stat.replace("const nedre = Math.max(0, midte - spredning);", "const nedre = p - z * Math.sqrt((p * (1 - p)) / antal);"))).toBe(false);
  });

  it("7. «overlapper» siges aldrig som «ens»", () => {
    const dom = laes(DOM), stat = laes(STAT);
    expect(overlapErIkkeEns(dom, stat)).toBe(true);
    expect(overlapErIkkeEns(dom.replace("Det betyder IKKE at de er ens", "De er altså ens"), stat)).toBe(false);
    expect(overlapErIkkeEns(dom, stat.replace('"adskilte" | "overlapper" | "kan_ikke"', '"adskilte" | "ens" | "kan_ikke"'))).toBe(false);
  });

  it("8. laget skriver ikke, og laget er ikke agenten", () => {
    const filer = [laes(DOM), laes(STAT), laes(MINDE), laes(DOER)];
    expect(lagetSkriverIkkeOgErIkkeAgenten(filer)).toBe(true);
    for (const ond of ['await supabase.from("klaviyo_spor").insert({});', 'const svar = await fetch("https://a.klaviyo.com");', 'const prompt = "Du er en marketingagent";']) {
      expect(lagetSkriverIkkeOgErIkkeAgenten([...filer, ond]), ond).toBe(false);
    }
  });

  it("9. mindet bruger det spor, der allerede findes", () => {
    const minde = laes(MINDE);
    expect(mindetBrugerSporet(minde)).toBe(true);
    expect(mindetBrugerSporet(minde.replace(/klaviyo_spor/g, "marketing_minde"))).toBe(false);
    expect(mindetBrugerSporet(minde.replace("  toerkoersel: boolean;", "  kanAflaeses: boolean;"))).toBe(false);
    expect(mindetBrugerSporet(minde.replace('r.toerkoersel === false && r.udfald === "skrevet"', "true"))).toBe(false);
  });

  it("10. døren giver aldrig et tal uden sit forbehold", () => {
    const doer = laes(DOER);
    expect(doerenGiverAldrigEtTalAlene(doer)).toBe(true);
    // Advarslerne flyttet ned under tallene.
    const flyttet = doer.replace("  for (const a of d.advarsler) l.push(`\u26A0\uFE0E ${a}`);\n", "")
      .replace('  l.push("PRØVET FØR");', '  for (const a of d.advarsler) l.push(`\u26A0\uFE0E ${a}`);\n  l.push("PRØVET FØR");');
    expect(doerenGiverAldrigEtTalAlene(flyttet)).toBe(false);
    expect(doerenGiverAldrigEtTalAlene(doer.replace('maaAnbefales: maaling.niveau.niveau !== "observation" && budget.tilbage > 0', "maaAnbefales: true"))).toBe(false);
  });

  it("11. vinduet skal være gået, før det tælles", () => {
    const dom = laes(DOM);
    expect(vinduetSkalVaereGaaet(dom)).toBe(true);
    // Den oprindelige fejl sat tilbage ind: alle modtagere i nævneren.
    expect(vinduetSkalVaereGaaet(dom.replace("forhold(antal, udloebne.length,", "forhold(antal, n,"))).toBe(false);
    expect(vinduetSkalVaereGaaet(dom.replace("const antal = udloebne.filter(", "const antal = modtagne.filter("))).toBe(false);
    expect(vinduetSkalVaereGaaet(dom.replace("De tal er ikke færdige", "Se bort fra det"))).toBe(false);
  });

  it("grænsen er ÉN ændring, og den står i dommen — ikke i et hoved", () => {
    expect(MAKS_AENDRINGER_PR_RUNDE).toBe(1);
    expect(udenKommentarer(laes(MINDE))).toContain("tilbage: 0");
  });
});
