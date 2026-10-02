/**
 * src/lib/hjemmebane/leveringsbaand.ts — dommen bag «Levering <år>» på
 * /reports (Dine tal › Rapportering). Ren: ingen React, ingen Supabase.
 *
 * FUNDET (2/10-2026): båndet sagde «2 af 9 måneder godkendt» til et medlem,
 * der startede 29/9. Tælleren (deliveryMonths.buildYearGroups) talte ALLE
 * afsluttede måneder i året — også dem før medlemskabet — og nævneren var
 * «afsluttet», ikke «fristen passeret».
 *
 * REGLEN — ingen ny regel, Score's egne domme (lib/boardroomScore/streak.ts):
 *   - Første tællende måned = foersteTaellendeMaaned(kontraktStart, maaneder):
 *     kontraktstart den 1. = samme måned, ellers måneden efter; uden
 *     kontraktstart måneden efter tidligste første godkendelse; null = ingen
 *     afgrænsning (som Score: der er intet at afgrænse fra).
 *   - Sidste tællende måned = senesteMaanedMedPasseretFrist(nu) — fristen er
 *     den STREAK_FRIST_DAG. (20.) i måneden efter, rykket til hverdag.
 *   - Tælleren «N af M»: M = årets måneder i [første, sidste]; N = de af dem,
 *     der er GODKENDT (state «delivered» = processed + committed — samme
 *     betydning som før).
 *   - M = 0 skriver ALDRIG «0 af 0»: er medlemskabet grunden, står «Din første
 *     måned er oktober — frist 20. november»; ellers (januar, før årets første
 *     frist) «Januars frist er 20. februar».
 *   - Ukendt første måned (`foerste === undefined`: Score-grundlaget hentes
 *     eller fejlede) → INGEN tæller. Hellere ingen linje end den gamle løgn.
 *
 * Eksempler (nu = 2/10-2026 → seneste måned med passeret frist = august,
 * fordi septembers frist er 20/10):
 *   - kontraktstart 2026-09-29 → første = oktober > august → M = 0 →
 *     «Din første måned er oktober — frist 20. november» (20/11-2026 er en fredag).
 *   - kontraktstart 2026-03-01 → første = marts → marts..august = 6 måneder;
 *     alle leveret → «6 af 6 måneder godkendt».
 *
 * MÅNEDERNE FØR MEDLEMSKABET vises DÆMPET, ikke udeladt (valgt 2/10):
 *   - Jonas 9/9: «De kan godt rapportere fra FØR medlemsstart. Det vil vi
 *     faktisk gerne opfordre dem til» (rapporteringTekst.ts). Historikken er
 *     ægte data; et bånd, der skjuler den, ser ud som om uploadet forsvandt.
 *   - På 375 px er tolv prikker allerede én-to linjer, og årets faste form
 *     (jan → nu) er lettere at genkende end et bånd, der begynder i oktober.
 *   - En tooltip virker ikke på touch, derfor står forklaringen som en
 *     SYNLIG linje under prikkerne (`note`), og hver dæmpet prik bærer
 *     «før dit medlemskab» i sin aria-label.
 */
import { DANISH_MONTHS } from "@/lib/financialUtils";
import { maanedsnavn } from "@/lib/maanedsnoegle";
import { fristDato, senesteMaanedMedPasseretFrist } from "@/lib/boardroomScore/streak";
import type { SlotState } from "@/lib/deliveryMonths";

export interface LeveringsPladsInd {
  /** «YYYY-MM» */
  key: string;
  state: SlotState;
}

export interface LeveringsPlads extends LeveringsPladsInd {
  /** Måneden ligger før første tællende måned — tegnes dæmpet og tælles ikke. */
  foerMedlemskab: boolean;
  /** Skærmlæserens/tooltipens tekst: «September — Godkendt, før dit medlemskab». */
  etiket: string;
}

export interface LeveringsbaandDom {
  pladser: LeveringsPlads[];
  /** null = ingen tæller (første måned ukendt, eller intet at tælle endnu). */
  taeller: { godkendt: number; ialt: number } | null;
  /** Linjen til højre for «Levering <år>»; null = ingen linje. */
  linje: string | null;
  /** Synlig forklaring under prikkerne, når mindst én måned er dæmpet. */
  note: string | null;
}

export const SLOT_ETIKET: Record<SlotState, string> = {
  delivered: "Godkendt",
  pending: "Afventer godkendelse",
  processing: "Behandles",
  error: "Fejl",
  missing: "Mangler",
  upcoming: "Kommende",
};

/** «2026-11-20» → «20. november»; med år, når året ikke er `aar`. */
function datoTekst(dato: string, aar: string): string {
  const navn = maanedsnavn(dato.slice(0, 7)) ?? dato.slice(0, 7);
  const dag = Number(dato.slice(8, 10));
  return `${dag}. ${navn}${dato.slice(0, 4) === aar ? "" : ` ${dato.slice(0, 4)}`}`;
}

/** «2026-10» → «oktober»; med år, når året ikke er `aar`. */
function maanedTekst(key: string, aar: string): string {
  const navn = maanedsnavn(key) ?? key;
  return `${navn}${key.slice(0, 4) === aar ? "" : ` ${key.slice(0, 4)}`}`;
}

export function leveringsbaandDom(input: {
  /** Båndets år, «YYYY». */
  aar: string;
  pladser: readonly LeveringsPladsInd[];
  /** foersteTaellendeMaaned(...): «YYYY-MM», null = ingen afgrænsning, undefined = ukendt (hentes/fejlede). */
  foerste: string | null | undefined;
  nu: Date;
  /** Rådgiveren ser medlemmets side: «før medlemskabet» i stedet for «før dit medlemskab». */
  raadgiver?: boolean;
}): LeveringsbaandDom {
  const { aar, foerste, nu } = input;
  const foerOrd = input.raadgiver ? "før medlemskabet" : "før dit medlemskab";
  const sidste = senesteMaanedMedPasseretFrist(nu);

  const pladser: LeveringsPlads[] = input.pladser.map((p) => {
    const foerMedlemskab = typeof foerste === "string" && p.key < foerste;
    const md = Number(p.key.slice(5, 7)) - 1;
    const etiket = `${DANISH_MONTHS[md] ?? p.key} — ${SLOT_ETIKET[p.state]}${foerMedlemskab ? `, ${foerOrd}` : ""}`;
    return { ...p, foerMedlemskab, etiket };
  });

  const note = pladser.some((p) => p.foerMedlemskab)
    ? `Grå måneder ligger ${foerOrd} og tæller ikke med.`
    : null;

  if (foerste === undefined) return { pladser, taeller: null, linje: null, note: null };

  const taellende = pladser.filter((p) => p.key.startsWith(`${aar}-`) && !p.foerMedlemskab && p.key <= sidste);
  const ialt = taellende.length;
  const godkendt = taellende.filter((p) => p.state === "delivered").length;

  if (ialt > 0) {
    return { pladser, taeller: { godkendt, ialt }, linje: `${godkendt} af ${ialt} ${ialt === 1 ? "måned" : "måneder"} godkendt`, note };
  }

  // Intet at tælle endnu. Hvilken måned tæller først i året?
  const aaretsFoerste = `${aar}-01`;
  const medlemskabetErGrunden = typeof foerste === "string" && foerste > aaretsFoerste;
  const foersteTaellende = medlemskabetErGrunden ? (foerste as string) : aaretsFoerste;
  const fristTekst = datoTekst(fristDato(foersteTaellende), aar);
  const linje = medlemskabetErGrunden
    ? `${input.raadgiver ? "Første tællende måned" : "Din første måned"} er ${maanedTekst(foersteTaellende, aar)} — frist ${fristTekst}`
    : `${DANISH_MONTHS[0]}s frist er ${fristTekst}`;
  return { pladser, taeller: null, linje, note };
}
