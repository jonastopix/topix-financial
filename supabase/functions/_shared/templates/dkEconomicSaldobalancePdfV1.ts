/**
 * Template: DK_ECONOMIC_SALDOBALANCE_PDF_V1
 * e-conomic Combined Saldobalance PDF (P&L + Balance)
 *
 * Detection: "Saldobalance for perioden" header + AKTIVER/PASSIVER sections + e-conomic footer
 * Extraction: Label-first with account-number fallback
 * Column basis: MIXED — P&L uses "Perioden", Balance uses "År til dato"
 * Sign normalization: Done in template (canonical engine receives "normal" convention values)
 *
 * AMBIGUITY: If AKTIVER/PASSIVER sections are present, this template scores high (≥90).
 * A future Template B (P&L only) gets -60 penalty when AKTIVER/PASSIVER found → no ambiguity.
 */

import type {
  TemplateEntry,
  DetectionContext,
  ExtractionContext,
  DeterministicExtractedData,
  ParserValidation,
  DeterministicMeta,
} from "../templateRegistry.ts";

import { alleGrupper, bygGruppetrae, findGruppe, type Gruppe, type Gruppelinje } from "../gruppetrae.ts";
import {
  parseDanishNumber,
  parseEconomicPdfText,
  type PdfParsedLine,
  type PdfSection,
} from "../pdfTextParser.ts";

// ── Label-first Lookup Helpers ──

/**
 * Normalize a label for comparison: lowercase, collapse whitespace, trim.
 */
function normLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Prioritized label match for main totals.
 * Prefers exact normalized match over substring/contains match.
 * This prevents "Anlægsaktiver i alt" from stealing "aktiver i alt".
 */
function findBestLabel(
  lines: PdfParsedLine[],
  pattern: RegExp,
  section?: PdfSection,
  exactTarget?: string
): PdfParsedLine | null {
  const candidates = lines.filter(
    (l) =>
      pattern.test(l.name) &&
      l.is_subtotal &&
      (section === undefined || l.section === section)
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // If an exact target is given, prefer exact normalized match
  if (exactTarget) {
    const target = normLabel(exactTarget);
    const exact = candidates.find((c) => normLabel(c.name) === target);
    if (exact) return exact;
  }

  // Fallback: prefer the shortest name that matches (most specific total)
  // "AKTIVER I ALT" (14 chars) < "Anlægsaktiver i alt" (19 chars)?
  // Actually we want the BROADEST total, which tends to be the standalone label.
  // Standalone totals from the parser have no account_no and their name IS the total.
  // Prefer: no account_no + name matches pattern more tightly (fewer extra words).
  // Heuristic: sort by name length ascending — the shortest match is the main total.
  const sorted = [...candidates].sort(
    (a, b) => normLabel(a.name).length - normLabel(b.name).length
  );
  return sorted[0];
}

function findByLabel(
  lines: PdfParsedLine[],
  pattern: RegExp,
  section?: PdfSection
): PdfParsedLine | null {
  return lines.find(
    (l) =>
      pattern.test(l.name) &&
      l.is_subtotal &&
      (section === undefined || l.section === section)
  ) || null;
}

function findByLabelOrAccount(
  lines: PdfParsedLine[],
  labelPattern: RegExp,
  accountRange: [number, number],
  section?: PdfSection
): PdfParsedLine | null {
  // Strategy 1: Label match (primary)
  const byLabel = findByLabel(lines, labelPattern, section);
  if (byLabel) return byLabel;

  // Strategy 2: Account number range (fallback)
  const byAccount = lines.find((l) => {
    if (!l.account_no) return false;
    const acct = parseInt(l.account_no, 10);
    return (
      acct >= accountRange[0] &&
      acct <= accountRange[1] &&
      (section === undefined || l.section === section)
    );
  });
  if (byAccount) {
    console.log(
      `[DK_ECONOMIC_PDF] Using account fallback ${byAccount.account_no} for ${labelPattern.source}`
    );
  }
  return byAccount || null;
}

// ── Sign normalization helpers ──
// In saldobalance: negative = credit. For P&L: revenue/profit are credit (negative).
// We flip to "normal" convention: revenue positive, profit positive, etc.

function flipPnlSign(val: number | null): number | null {
  return val != null ? -val : null;
}

function absVal(val: number | null): number | null {
  return val != null ? Math.abs(val) : null;
}

// ── Grupperne som træ — også uden «i alt» (17/9-2026, KJ AUTO, Jonas' fil ~22:00) ──
//
// KJ AUTOs saldobalance navngiver grupperne UDEN «i alt»: «Vareforbrug 749.217,49 · Salgsfremmende omk. ·
// Personaleudgifter (som rummer «Løn i alt») · Administrationsomkostninger · Lokaleomkostninger ·
// Udlejning af fast ejendom −9.428,38 (som rummer «Sekundære lejeindtægter» −10.000 og «Personbil» 571,62) ·
// Driftsmiddelomkostninger · Kapacitetsomkostninger 434.803,77 · Resultat før renter · Renteudgifter ·
// Resultat» og balancen «Anlægsaktiver · Varebeholdninger · Tilgodehavender · Likvide beholdninger ·
// Omsætningsaktiver · Aktiver · Egenkapital (personlig) · Gæld · Passiver». findByLabel krævede «… i alt»
// (is_subtotal) → cost_lines_present FAIL «Revenue 1330860.74 but no cost lines found» (prod 17/9 21:59).
//
// Skellet mellem konto og gruppesum er KONTONUMMERET i første kolonne (4–6 cifre; pdfTextParser kender kun
// 4, så 5-cifrede balancekonti som «11510 Kostpris, primo» ville ellers ligne grupper). Træet
// (_shared/gruppetrae.ts) giver nesting, så «Løn i alt» ikke tælles oven i «Personaleudgifter», og en
// omkostningsgruppe hvis netto er en KREDIT (Udlejning af fast ejendom) bliver andre driftsindtægter —
// samme regel som saldobalance-regnearket fik i #971. Kontrolsummen på filen:
//   1.330.860,74 − 749.217,49 − 290.946,33 (løn) − 31.163,85 (øvrige personale = 322.110,18 − 290.946,33)
//   − 32.469,69 − 56.087,95 − 19.020,94 − 14.543,39 (driftsmidler → øvrige) − 0 (renter) + 9.428,38 = 146.839,48 = Resultat.

const DK_NUM = /-?[\d.]+,\d{2}/g;
const DK_NUM_FIRST = /-?[\d.]+,\d{2}/;

/** Linjerne i filens egen rækkefølge pr. sektion — overskrifter (uden tal) MED, kontolinjer mærket. */
export function linjerAfTekst(text: string): Record<"PNL" | "AKTIVER" | "PASSIVER", Gruppelinje[]> {
  const ud: Record<"PNL" | "AKTIVER" | "PASSIVER", Gruppelinje[]> = { PNL: [], AKTIVER: [], PASSIVER: [] };
  let section: "PNL" | "AKTIVER" | "PASSIVER" | null = null;
  let i = 0;
  for (const raw of text.split("\n")) {
    i++;
    const line = raw.trim();
    if (!line) continue;
    const nums = line.match(DK_NUM) ?? [];
    // Sektionsmarkører — kun uden tal: «Aktiver 253.823,19 …» med tal er TOTALEN, ikke markøren.
    if (nums.length === 0) {
      if (/^resultatopg/i.test(line)) { section = "PNL"; continue; }
      if (/^#?\s*aktiver\b/i.test(line) && !/anlæg|omsætning/i.test(line)) { section = "AKTIVER"; continue; }
      if (/^#?\s*passiver\b/i.test(line)) { section = "PASSIVER"; continue; }
    }
    if (!section) continue;
    if (/^Nr\.?\s+Navn/i.test(line) || /^\(NB/i.test(line) || /e-conomic\.com/i.test(line) || /^Hentet:/i.test(line)) continue;
    if (/^\|[\s|-]*\|$/.test(line)) continue;
    const erKonto = /^\s*\d{4,6}\s+\S/.test(line);
    let label = line;
    const fi = line.search(DK_NUM_FIRST);
    if (fi > 0) label = line.slice(0, fi).trim();
    label = label.replace(/^\|?\s*/, "").replace(/\s*\|?\s*$/, "").trim();
    if (label.length < 2) continue;
    const pd = (s: string) => parseDanishNumber(s);
    const value = nums.length > 0 ? pd(nums[0]!) : null;
    // Kolonnerne som pdfTextParser læser dem: 2 tal = perioden/ÅTD; 3 = perioden/året før/ÅTD; 4 = perioden/året før/ÅTD/året før.
    const ytd = nums.length >= 3 ? pd(nums[2]!) : nums.length >= 2 ? pd(nums[1]!) : null;
    ud[section].push({ label, value, ytd, erKonto, index: i });
  }
  return ud;
}

export interface GruppeNoegletal {
  kf: Record<string, number | null>;
  /** Hvad der blev til hvad — til parser-tjekket og loggen. */
  spor: string[];
  /** Gruppetræet fandt en omsætning (ellers falder skabelonen tilbage til «… i alt»-matcherne). */
  fandtOmsaetning: boolean;
}

const OPEX_REGLER: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: "loenninger", pattern: /^(lønninger|løn(,? gager( og honorarer)?)?|løn i alt)( mv\.?)?( i alt| ialt)?$/ },
  { key: "pensioner_sociale", pattern: /^pension/ },
  { key: "oevrige_personale", pattern: /^(personale(udgifter|omkostninger)|øvrige personale|sociale bidrag)/ },
  { key: "salgsomkostninger", pattern: /^salgs/ },
  { key: "lokaleomkostninger", pattern: /^lokale/ },
  { key: "administrationsomkostninger", pattern: /^administration/ },
  { key: "transportomkostninger", pattern: /^(autodrift|transport|biler|bilomk|vare-?\s*\/?\s*lastbil)/ },
  { key: "afskrivninger", pattern: /^afskrivning/ },
];

/** Nøgletallene fra træet. Kreditformat: omsætning/indtægt negativ, omkostning positiv, overskud negativt. */
export function gruppeNoegletal(linjer: Record<"PNL" | "AKTIVER" | "PASSIVER", Gruppelinje[]>): GruppeNoegletal {
  const kf: Record<string, number | null> = {};
  const spor: string[] = [];
  const pnlRoots = bygGruppetrae(linjer.PNL);
  const pnl = alleGrupper(pnlRoots);
  const saet = (key: string, v: number | null, hvorfra: string) => { kf[key] = v; if (v !== null) spor.push(`${key}<-${hvorfra}`); };

  // Omsætning: den yderste gruppe (Nettoomsætning / Omsætning i alt) — sidste rodgruppe der matcher.
  const omsRoots = pnlRoots.filter((g) => /^(netto)?omsætning( i alt| ialt| diverse)?$/.test(g.norm));
  const oms = omsRoots.length > 0 ? omsRoots[omsRoots.length - 1] : null;
  saet("omsaetning", oms ? Math.abs(oms.value) : null, oms?.label ?? "");
  const cogsRoots = pnlRoots.filter((g) => /^(vareforbrug|direkte omkostninger)( i alt| ialt)?$/.test(g.norm));
  saet("direkte_omkostninger", cogsRoots.length > 0 ? cogsRoots.reduce((s, g) => s + Math.abs(g.value), 0) : null, cogsRoots.map((g) => g.label).join("+"));
  const db = findGruppe(pnl, /^dækningsbidrag/);
  saet("daekningsbidrag", db ? -db.value : null, db?.label ?? "");
  if (db) kf.gross_profit = -db.value;

  // Driftsomkostningerne: børnene af en beholder («Kapacitetsomkostninger», «Omkostninger i alt»), ellers
  // rodgrupperne mellem dækningsbidraget/omsætningen og den første resultatlinje.
  const beholder = pnlRoots.find((g) => /^(kapacitetsomk|omkostninger( i alt| ialt)?$|faste omkostninger)/.test(g.norm));
  const erResultat = (g: Gruppe) => /^resultat/.test(g.norm);
  const erFinans = (g: Gruppe) => /rente|finansi/.test(g.norm);
  const startIdx = (db ?? oms)?.index ?? -1;
  const foersteResultat = pnlRoots.find((g) => erResultat(g) && g.index > startIdx);
  const opexGrupper = beholder
    ? beholder.children
    : pnlRoots.filter((g) => g.index > startIdx && (!foersteResultat || g.index < foersteResultat.index) && !erResultat(g) && !erFinans(g) && !/^(netto)?omsætning|^vareforbrug|^direkte omk|^dækningsbidrag/.test(g.norm));
  let oevrige = 0, oevrigeFundet = false, indtaegt = 0, indtaegtFundet = false;
  for (const g of opexGrupper) {
    const regel = OPEX_REGLER.find((r) => r.pattern.test(g.norm));
    if (!regel) {
      if (g.value < 0) { indtaegt += -g.value; indtaegtFundet = true; spor.push(`andre_driftsindtaegter<-${g.label}`); }
      else { oevrige += g.value; oevrigeFundet = true; spor.push(`oevrige_omkostninger<-${g.label}`); }
      continue;
    }
    // Personaleudgifter der rummer «Løn i alt»/«Pensioner»: løn og pension fra børnene, resten som øvrige personale.
    if (regel.key === "oevrige_personale") {
      let rest = g.value;
      for (const c of g.children) {
        const cr = OPEX_REGLER.find((r) => r.pattern.test(c.norm));
        if (cr && (cr.key === "loenninger" || cr.key === "pensioner_sociale") && kf[cr.key] == null) { saet(cr.key, Math.abs(c.value), `${g.label}>${c.label}`); rest -= c.value; }
      }
      saet("oevrige_personale", (kf.oevrige_personale ?? 0) + Math.abs(rest), g.label);
      continue;
    }
    if (regel.key === "loenninger" && g.children.some((c) => /^pension/.test(c.norm))) {
      const p = g.children.find((c) => /^pension/.test(c.norm))!;
      saet("pensioner_sociale", Math.abs(p.value), `${g.label}>${p.label}`);
      saet("loenninger", Math.abs(g.value - p.value), g.label);
      continue;
    }
    saet(regel.key, (kf[regel.key] ?? 0) + Math.abs(g.value), g.label);
  }
  if (oevrigeFundet) kf.oevrige_omkostninger = oevrige;
  if (indtaegtFundet) kf.andre_driftsindtaegter = indtaegt;

  // Finansielle poster (rodgrupper): udgifter og indtægter hver for sig.
  const finUdg = pnlRoots.filter((g) => /^(renteudgift|finansielle (omkostninger|udgifter)|finansierings(omkostninger|udgifter))/.test(g.norm));
  const finIndt = pnlRoots.filter((g) => /^(renteindtægt|finansielle indtægt)/.test(g.norm));
  saet("finansielle_omkostninger", finUdg.length > 0 ? finUdg.reduce((s, g) => s + Math.abs(g.value), 0) : null, finUdg.map((g) => g.label).join("+"));
  saet("finansielle_indtaegter", finIndt.length > 0 ? finIndt.reduce((s, g) => s + Math.abs(g.value), 0) : null, finIndt.map((g) => g.label).join("+"));
  const ebitda = findGruppe(pnlRoots, /^resultat før afskrivninger/);
  saet("resultat_foer_afskrivninger", ebitda ? -ebitda.value : null, ebitda?.label ?? "");

  // Resultatet: «Resultat før skat» > «Resultat før ekstraordinære poster» > «Resultat» > «Resultat før renter» (kun sidste udvej,
  // og så med de finansielle poster lagt til) — samme præcedens som #972 gav PDF-resultatopgørelsen.
  const rfs = findGruppe(pnlRoots, /^resultat før skat/);
  const rfe = findGruppe(pnlRoots, /^resultat før ekstraordinære/);
  const res = findGruppe(pnlRoots, /^resultat$/);
  const rfr = findGruppe(pnlRoots, /^resultat før renter/);
  const ebtG = rfs ?? rfe ?? res;
  if (ebtG) saet("resultat_foer_skat", -ebtG.value, ebtG.label);
  else if (rfr) saet("resultat_foer_skat", -rfr.value - (kf.finansielle_omkostninger ?? 0) + (kf.finansielle_indtaegter ?? 0), `${rfr.label} − finans + finansielle indtægter (sidste udvej)`);
  else kf.resultat_foer_skat = null;
  if (rfr) saet("resultat_foer_renter", -rfr.value, rfr.label);
  const efterSkat = findGruppe(pnlRoots, /^resultat efter skat|^årets resultat/);
  saet("arets_resultat", efterSkat ? -efterSkat.value : null, efterSkat?.label ?? "");

  // Balancen (år til dato): rodtotaler og de kendte grupper — med eller uden «i alt».
  const akt = alleGrupper(bygGruppetrae(linjer.AKTIVER));
  const pas = alleGrupper(bygGruppetrae(linjer.PASSIVER));
  const ytd = (g: Gruppe | null) => (g ? (g.ytd ?? g.value) : null);
  const aktiver = akt.find((g) => /^aktiver( i alt| ialt)?$/.test(g.norm)) ?? null;
  const passiver = pas.find((g) => /^passiver( i alt| ialt)?$/.test(g.norm)) ?? null;
  saet("aktiver_i_alt", aktiver ? Math.abs(ytd(aktiver)!) : null, aktiver?.label ?? "");
  saet("passiver_i_alt", passiver ? Math.abs(ytd(passiver)!) : null, passiver?.label ?? "");
  const egen = pas.find((g) => /^egenkapital/.test(g.norm)) ?? null;
  saet("egenkapital", egen ? -ytd(egen)! : null, egen?.label ?? "");
  const hens = pas.find((g) => /^hensættelser/.test(g.norm)) ?? null;
  saet("hensaettelser", hens ? -ytd(hens)! : null, hens?.label ?? "");
  const gaeldTotal = pas.find((g) => /^gæld( i alt| ialt)?$/.test(g.norm)) ?? null;
  const gaeldGrupper = gaeldTotal ? [gaeldTotal] : pas.filter((g) => g.depth === 0 && /gæld|kreditorer/.test(g.norm) && !/^passiver/.test(g.norm));
  saet("gaeld_i_alt", gaeldGrupper.length > 0 ? gaeldGrupper.reduce((s, g) => s + Math.abs(ytd(g)!), 0) : null, gaeldGrupper.map((g) => g.label).join("+"));
  const likv = akt.find((g) => /^likvide/.test(g.norm)) ?? null;
  saet("likvider", likv ? ytd(likv) : null, likv?.label ?? "");
  const deb = akt.find((g) => /^tilgodehavender( i alt| ialt)?$|^debitorer/.test(g.norm)) ?? null;
  saet("debitorer", deb ? ytd(deb) : null, deb?.label ?? "");
  const lager = akt.find((g) => /^varebeholdninger|^varelager/.test(g.norm)) ?? null;
  saet("varelager", lager ? ytd(lager) : null, lager?.label ?? "");

  return { kf, spor, fandtOmsaetning: oms !== null };
}

// ── Template Definition ──

export const dkEconomicSaldobalancePdfV1: TemplateEntry = {
  template_id: "DK_ECONOMIC_SALDOBALANCE_PDF_V1",
  label: "e-conomic Saldobalance PDF (Combined P&L + Balance)",
  supported_file_types: ["pdf"],
  statement_type: "combined",

  detect(ctx: DetectionContext): number {
    const text = ctx.rawText;
    if (!text || text.length < 100) return 0;

    let score = 0;

    // Header: "Saldobalance for perioden ..."
    if (/saldobalance for perioden/i.test(text)) score += 40;

    // Footer: e-conomic URL
    if (/secure\.e-conomic\.com/i.test(text)) score += 20;

    // Column headers present
    if (/\bNr\b/i.test(text) && /\bNavn\b/i.test(text) && /Perioden|År til dato/i.test(text)) {
      score += 10;
    }

    // AKTIVER section present → combined report (Template A)
    if (/\bAKTIVER\b/i.test(text)) score += 15;
    if (/\bPASSIVER\b/i.test(text)) score += 15;

    // Max score: 100

    return score;
  },

  extract(
    ctx: ExtractionContext
  ):
    | { success: true; data: DeterministicExtractedData }
    | { success: false; error: string } {
    const text = ctx.rawText;
    if (!text) return { success: false, error: "No PDF text content" };

    const parsed = parseEconomicPdfText(text);
    const { lines, metadata } = parsed;

    // Debug: show parsed lines summary
    console.log(`[DK_ECONOMIC_PDF] Parsed ${lines.length} lines, sections: PNL=${lines.filter(l=>l.section==="PNL").length}, AKTIVER=${lines.filter(l=>l.section==="AKTIVER").length}, PASSIVER=${lines.filter(l=>l.section==="PASSIVER").length}, null=${lines.filter(l=>l.section===null).length}`);
    console.log(`[DK_ECONOMIC_PDF] Subtotals: ${lines.filter(l=>l.is_subtotal).map(l=>`${l.section}:${l.name}`).join(", ")}`);

    if (lines.length < 5) {
      return {
        success: false,
        error: `Insufficient parsed lines: ${lines.length} (minimum 5)`,
      };
    }

    if (!metadata.has_resultatopgoerelse) {
      return {
        success: false,
        error: "No RESULTATOPGØRELSE section found",
      };
    }

    if (!metadata.has_aktiver && !metadata.has_passiver) {
      return {
        success: false,
        error: "No AKTIVER/PASSIVER sections found (not a combined report)",
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // P&L METRICS — from "Perioden" column (period_amount)
    // ═══════════════════════════════════════════════════════════════

    const omsaetningLine =
      findByLabel(lines, /nettoomsætning/i, "PNL") ||
      findByLabel(lines, /omsætning\s*(i alt|ialt)/i, "PNL") ||
      findByLabel(lines, /omsætning\s*diverse/i, "PNL");
    const direkteOmkLine = findByLabel(lines, /direkte omkostninger\s*(i alt|ialt)/i, "PNL");
    const dbLine = findByLabel(lines, /dækningsbidrag/i, "PNL");
    const loenLine = findByLabel(lines, /lønninger\s*(i alt|ialt)/i, "PNL");
    const salgsLine = findByLabel(lines, /salgs.*(i alt|ialt)/i, "PNL");
    const adminLine = findByLabel(lines, /administrations.*(i alt|ialt)/i, "PNL");
    // A (18/9-2026): grupperne der aldrig blev fanget — Topix.dk 2026-01: ebt 25.152,55 mod regnet 29.146,05 =
    // lokaleomkostningerne; KJ AUTO 2026-02: 1,2 mio. i lokaler/autodrift/finans. Nøglerne findes i KF_TO_CANONICAL
    // (lokaleomkostninger → facility_costs, transportomkostninger → vehicle_costs, finansielle_* → financial_*).
    const lokaleLine = findByLabel(lines, /lokale.*(i alt|ialt)/i, "PNL");
    const autoLine = findByLabel(lines, /(autodrift|transport|\bbil(er|omk))[^\n]*(i alt|ialt)/i, "PNL");
    const renteindtLine = findByLabel(lines, /(renteindtægter|finansielle indtægter).*(i alt|ialt)/i, "PNL");
    const renteudgLine = findByLabel(lines, /(renteudgifter|finansielle (omkostninger|udgifter)|finansieringsudgifter).*(i alt|ialt)/i, "PNL");
    const afskrLine = findByLabel(lines, /afskrivninger\s*(i alt|ialt)/i, "PNL");
    const ebitdaLine = findByLabel(lines, /resultat før afskrivninger/i, "PNL");
    const ebtLine =
      findByLabel(lines, /resultat før skat/i, "PNL") ||
      findByLabel(lines, /resultat før ekstraordinære poster/i, "PNL") ||
      findByLabel(lines, /^resultat$/i, "PNL");
    const netResultLine = findByLabel(lines, /resultat efter skat/i, "PNL");

    // ═══════════════════════════════════════════════════════════════
    // BALANCE METRICS — from "År til dato" column (ytd_amount)
    // ═══════════════════════════════════════════════════════════════

    // Main totals: use findBestLabel to prefer exact "AKTIVER I ALT" over "Anlægsaktiver i alt"
    const aktiverLine = findBestLabel(lines, /aktiver i alt/i, undefined, "AKTIVER I ALT");
    const passiverLine = findBestLabel(lines, /passiver i alt/i, undefined, "PASSIVER I ALT");
    const egenkapitalLine = findBestLabel(lines, /egenkapital i alt/i, undefined, "EGENKAPITAL I ALT");
    const gaeldLine = findBestLabel(lines, /gæld i alt/i, undefined, "GÆLD I ALT");
    const hensaettelserLine = findBestLabel(lines, /hensættelser i alt/i, undefined, "HENSÆTTELSER I ALT");

    // Cash: label-first, account fallback
    const cashLine =
      findByLabel(lines, /likvide beholdninger/i, "AKTIVER") ||
      findByLabelOrAccount(lines, /bankkonto|bank\b|kasse/i, [5800, 5899], "AKTIVER");

    // Debtors: label-first, account fallback
    const debitorLine =
      findByLabel(lines, /tilgodehavender\s*(i alt|ialt)/i, "AKTIVER") ||
      findByLabelOrAccount(lines, /debitorer/i, [5600, 5699], "AKTIVER");

    // Inventory
    const inventoryLine = findByLabel(lines, /varebeholdninger\s*(i alt|ialt)/i, "AKTIVER") ||
      findByLabel(lines, /varelager/i, "AKTIVER");

    // ═══════════════════════════════════════════════════════════════
    // BUILD KEY FIGURES with sign normalization
    //
    // Credit convention for e-conomic saldobalance:
    //   - Revenue/profit: negative in raw → flipPnlSign to positive
    //   - Costs: positive in raw → absVal keeps positive
    //   - Assets: positive in raw → absVal keeps positive
    //   - Equity: positive in raw → NEGATE (credit convention: positive = owed to owners)
    //   - Provisions: positive in raw → NEGATE (credit convention: positive = obligation)
    //   - Debt: negative in raw → absVal flips to positive
    //   - Passiver: negative in raw → absVal flips to positive
    //   - Cash: keep raw sign (overdraft possible)
    // ═══════════════════════════════════════════════════════════════

    const keyFigures: Record<string, number | null> = {
      // P&L: from Perioden column, signs normalized
      omsaetning: absVal(omsaetningLine?.period_amount ?? null),
      direkte_omkostninger: absVal(direkteOmkLine?.period_amount ?? null),
      daekningsbidrag: flipPnlSign(dbLine?.period_amount ?? null),
      gross_profit: flipPnlSign(dbLine?.period_amount ?? null),
      loenninger: absVal(loenLine?.period_amount ?? null),
      salgsomkostninger: absVal(salgsLine?.period_amount ?? null),
      administrationsomkostninger: absVal(adminLine?.period_amount ?? null),
      lokaleomkostninger: absVal(lokaleLine?.period_amount ?? null),
      transportomkostninger: absVal(autoLine?.period_amount ?? null),
      finansielle_indtaegter: absVal(renteindtLine?.period_amount ?? null),
      finansielle_omkostninger: absVal(renteudgLine?.period_amount ?? null),
      afskrivninger: absVal(afskrLine?.period_amount ?? null),
      resultat_foer_afskrivninger: flipPnlSign(ebitdaLine?.period_amount ?? null),
      resultat_foer_skat: flipPnlSign(ebtLine?.period_amount ?? null),
      arets_resultat: flipPnlSign(netResultLine?.period_amount ?? null),

      // Balance: from År til dato column, signs normalized per credit convention
      aktiver_i_alt: absVal(aktiverLine?.ytd_amount ?? null),
      passiver_i_alt: absVal(passiverLine?.ytd_amount ?? null),
      egenkapital: flipPnlSign(egenkapitalLine?.ytd_amount ?? null),       // NEGATE: credit convention
      hensaettelser: flipPnlSign(hensaettelserLine?.ytd_amount ?? null),   // NEGATE: credit convention
      likvider: cashLine?.ytd_amount ?? null, // Keep sign (overdraft possible)
      debitorer: debitorLine?.ytd_amount ?? null, // Keep sign
      varelager: inventoryLine?.ytd_amount ?? null,
      gaeld_i_alt: absVal(gaeldLine?.ytd_amount ?? null),
    };

    // ── Grupperne som træ — også uden «i alt» (17/9-2026): træets tal vinder hvor det fandt noget; «… i alt»-
    //    matcherne ovenfor er faldback for filer træet ikke kan læse. ──
    const trae = gruppeNoegletal(linjerAfTekst(text));
    if (trae.fandtOmsaetning) {
      for (const [k, v] of Object.entries(trae.kf)) {
        if (v !== null && v !== undefined) keyFigures[k] = v;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // BUILD LINE ITEMS
    // ═══════════════════════════════════════════════════════════════

    const lineItems: DeterministicExtractedData["line_items"] = lines
      .filter((l) => l.is_subtotal || l.account_no != null)
      .map((l) => ({
        name: l.name,
        period_amount: l.period_amount,
        ytd_amount: l.ytd_amount,
        raw_sign:
          l.section === "PNL"
            ? l.period_amount != null && l.period_amount < 0
              ? "MINUS"
              : "PLUS"
            : l.ytd_amount != null && l.ytd_amount < 0
              ? "MINUS"
              : "PLUS",
        account_no: l.account_no,
        class: mapSectionToClass(l.section, l.name),
      }));

    // ═══════════════════════════════════════════════════════════════
    // PARSER VALIDATION
    // ═══════════════════════════════════════════════════════════════

    const checks: ParserValidation["checks"] = [];

    // Check: Revenue extracted
    if (keyFigures.omsaetning != null) {
      checks.push({ name: "revenue_present", result: "PASS", details: `Revenue: ${keyFigures.omsaetning}` });
    } else {
      checks.push({ name: "revenue_present", result: "FAIL", details: "No revenue found" });
    }

    // Check: Balance totals
    if (keyFigures.aktiver_i_alt != null && keyFigures.passiver_i_alt != null) {
      const diff = Math.abs(keyFigures.aktiver_i_alt - keyFigures.passiver_i_alt);
      checks.push({
        name: "balance_equation",
        result: diff <= 2 ? "PASS" : "FAIL",
        details: `Assets ${keyFigures.aktiver_i_alt} vs Liabilities ${keyFigures.passiver_i_alt} (diff ${diff.toFixed(2)})`,
      });
    } else {
      checks.push({ name: "balance_equation", result: "SKIP", details: "Missing balance totals" });
    }

    // Check: grupperne læst som træ (17/9) — hvad der blev til hvad står i details.
    checks.push({
      name: "groups_from_tree",
      result: trae.fandtOmsaetning ? "PASS" : "SKIP",
      details: trae.fandtOmsaetning ? trae.spor.join("; ") : "Tree found no revenue group — «… i alt» matchers used",
    });

    // Check: EBT present
    if (keyFigures.resultat_foer_skat != null) {
      checks.push({ name: "ebt_present", result: "PASS", details: `EBT: ${keyFigures.resultat_foer_skat}` });
    } else {
      checks.push({ name: "ebt_present", result: "FAIL", details: "No EBT found" });
    }

    const hasFail = checks.some((c) => c.result === "FAIL");
    const parserStatus: "PASS" | "FAIL" = hasFail ? "FAIL" : "PASS";

    const validation: ParserValidation = { parser_status: parserStatus, checks };

    // ═══════════════════════════════════════════════════════════════
    // DETERMINISTIC METADATA
    // ═══════════════════════════════════════════════════════════════

    const pnlLines = lines.filter((l) => l.section === "PNL");
    const balanceLines = lines.filter((l) => l.section === "AKTIVER" || l.section === "PASSIVER");

    const deterministicMeta: DeterministicMeta = {
      template_id: "DK_ECONOMIC_SALDOBALANCE_PDF_V1",
      parser_confidence: "HIGH",
      detection_score: 0, // Set by registry
      parser_validation_status: parserStatus,
      parser_validation_errors: checks.filter((c) => c.result === "FAIL").map((c) => c.details),
      raw_line_count: lines.length,
      normalized_line_count: lineItems.length,
      column_basis_rule: "mixed",
    };

    // ═══════════════════════════════════════════════════════════════
    // BUILD EXTRACTED DATA
    // ═══════════════════════════════════════════════════════════════

    const extractedData: DeterministicExtractedData = {
      report_type: "combined",
      company_name: metadata.company_name,
      cvr_number: metadata.cvr_number,
      period_start: metadata.period_start,
      period_end: metadata.period_end,
      report_period: metadata.report_period,
      key_figures: keyFigures,
      line_items: lineItems,
      validation,
      _deterministic_meta: deterministicMeta,
    };

    return { success: true, data: extractedData };
  },
};

// ── Helper: Map section to canonical class ──

function mapSectionToClass(section: PdfSection, name: string): string {
  if (section === "PNL") {
    if (/omsætning/i.test(name)) return "REVENUE";
    if (/vareforbrug|direkte omk/i.test(name)) return "COGS";
    if (/afskrivning/i.test(name)) return "DEPR";
    if (/rente.*indtægt|finansielle indtægt/i.test(name)) return "FIN_INCOME";
    if (/rente.*udgift|finansielle udgift|finansiering/i.test(name)) return "FIN_EXPENSE";
    return "OPEX";
  }
  if (section === "AKTIVER") return "ASSET";
  if (section === "PASSIVER") {
    if (/egenkapital|anpartskapital|aktiekapital|resultat/i.test(name)) return "EQUITY";
    return "LIABILITY";
  }
  return "UKLASSIFICERET";
}
