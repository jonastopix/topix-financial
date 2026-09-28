/**
 * src/lib/hjemmebane/refleksioner.ts — medlemmets egne refleksioner, som
 * tal og ord til fladen (udkast 28/9-2026).
 *
 * HVORFOR: pulse_checkins har én række pr. virksomhed pr. måned, skrevet af
 * medlemmet i PulseCheckinModal — og medlemmet så dem ALDRIG igen (B's recon
 * 28/9, recon-to-oensker.md §4). Rådgiveren så dem på virksomhedssiden. Nu
 * tegner Rapportering dem som «Dine refleksioner». KUN LÆSNING.
 *
 * HUSETS DOMME GENBRUGES, IKKE GENTAGES:
 *   - måneden i ord: maanedOrd (factsCsv.ts) — «September 2026», samme som
 *     virksomhedssidens lokale periodeIOrd regner den.
 *   - tomme felter: tom eller kun mellemrum tæller ikke — samme regel som
 *     VirksomhedView's Blok2; alle tre tomme og ingen milestone-tal → «uden tekst».
 *   - nyeste øverst: sorteret på period_key faldende (modalens egen
 *     «Tidligere refleksioner»-liste sorterer sådan), created_at som anden nøgle.
 *
 * SPØRGSMÅLENE er modalens egne ord (PulseCheckinModal.tsx:319, 341, 363) —
 * de står her, fordi modalen ikke eksporterer dem; kildeværnet
 * refleksionMedlem.guard holder de to i takt, tegn for tegn.
 *
 * MILESTONE-TALLET er IKKE medlemmets egen vurdering: modalen regner det som
 * gennemsnittet af de aktive milestones' fremgang, da refleksionen blev sendt
 * (PulseCheckinModal.tsx:101-118). Teksten siger det, som det er.
 *
 * REN: ingen React, ingen Supabase. Prøvet i __tests__/refleksioner.test.ts.
 */
import { maanedOrd } from "@/lib/factsCsv";

/** Så lidt af pulse_checkins, som fladen behøver. */
export interface RefleksionRaekke {
  period_key: string;
  went_well: string | null;
  biggest_challenge: string | null;
  help_needed: string | null;
  milestone_progress: number | null;
  created_at: string;
}

export type RefleksionsNoegle = "went_well" | "biggest_challenge" | "help_needed";

/** De tre spørgsmål, i modalens rækkefølge og med modalens ord. */
export const REFLEKSIONS_FELTER: readonly { noegle: RefleksionsNoegle; spoergsmaal: string }[] = [
  { noegle: "went_well", spoergsmaal: "Hvad er gået godt denne måned?" },
  { noegle: "biggest_challenge", spoergsmaal: "Hvad er din største udfordring lige nu?" },
  { noegle: "help_needed", spoergsmaal: "Hvad har du brug for hjælp til?" },
];

export interface RefleksionFelt {
  noegle: RefleksionsNoegle;
  spoergsmaal: string;
  tekst: string;
}

export interface RefleksionVisning {
  periodKey: string;
  /** «September 2026». */
  maaned: string;
  /** Kun de felter, der har tekst — i spørgsmålenes rækkefølge. */
  felter: RefleksionFelt[];
  /** Milestone-tallet, som modalen regnede det — null når der ingen aktive mål var. */
  fremgang: number | null;
  /** Alle tre felter tomme OG intet milestone-tal. */
  udenTekst: boolean;
}

/** Tekst med indhold — tom eller kun mellemrum tæller ikke. */
const medIndhold = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

/** Nyeste måned øverst. period_key er «YYYY-MM», så strengen sorterer som tiden. */
export function sorterRefleksioner(raekker: readonly RefleksionRaekke[]): RefleksionRaekke[] {
  return [...raekker].sort((a, b) => b.period_key.localeCompare(a.period_key) || b.created_at.localeCompare(a.created_at));
}

export function refleksionTilVisning(r: RefleksionRaekke): RefleksionVisning {
  const felter: RefleksionFelt[] = [];
  for (const f of REFLEKSIONS_FELTER) {
    const tekst = medIndhold(r[f.noegle]);
    if (tekst !== null) felter.push({ noegle: f.noegle, spoergsmaal: f.spoergsmaal, tekst });
  }
  const fremgang = typeof r.milestone_progress === "number" && Number.isFinite(r.milestone_progress) ? r.milestone_progress : null;
  return {
    periodKey: r.period_key,
    maaned: maanedOrd(r.period_key),
    felter,
    fremgang,
    udenTekst: felter.length === 0 && fremgang === null,
  };
}

/** Hele listen, nyeste øverst — det, fladen tegner. */
export function refleksionerTilVisning(raekker: readonly RefleksionRaekke[]): RefleksionVisning[] {
  return sorterRefleksioner(raekker).map(refleksionTilVisning);
}

// ── Ordene ────────────────────────────────────────────────────────────────

/** «Du sendte refleksionen for September 2026 uden tekst.» */
export function udenTekstLinje(maaned: string): string {
  return `Du sendte refleksionen for ${maaned} uden tekst.`;
}

/** Milestone-tallet, sagt som det blev regnet — ikke som en vurdering. */
export function fremgangLinje(fremgang: number): string {
  return `Dine milestones stod på ${fremgang} % — regnet af dine aktive mål, da du sendte den.`;
}

export const REFLEKSIONER_TOM = "Ingen refleksioner endnu. Den første kommer, når du har godkendt en måneds tal og svaret på de tre spørgsmål.";
export const REFLEKSIONER_HENTER = "Henter dine refleksioner …";
