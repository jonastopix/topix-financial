/**
 * periodeOpgoerelse — ren, React-fri motor der opgør en periode af facts
 * til totaler (ÅTD, seneste 12, frit interval). Bygget efter
 * ~/Downloads/periodetotaler-recon.md §6; UI kommer i en senere PR.
 *
 * ARBEJDSDELINGEN:
 * - facts kommer ind FÆRDIGT afgrænset til perioden (usePeriodFilter.
 *   filterKeys hos kalderen) og sorteret stigende på period_key. Motoren
 *   filtrerer ikke selv — så kan graf og total aldrig divergere.
 * - Mål holdes UDE: om et månedsmål ganges med antal måneder er visningens
 *   beslutning, ikke motorens.
 *
 * VÆRDI-ARTERNE afgør hvad "total" betyder:
 * - flow: summen af månedernes udtræk (omsætning, lønninger, resultat, …).
 * - forhold: udtræks-formlen kørt på ÉT summeret kf-objekt — samme formel
 *   som månedstallene (calcDbMargin/calcResultMargin via udtraek), aldrig
 *   et gennemsnit af månedsprocenter. Ingen ny margin-matematik.
 * - beholdning: ultimo — seneste måned i perioden med værdi (bank). En
 *   beholdning summeres aldrig, og dens basis er KILDERÆKKENS egen (banken
 *   kan komme fra en ældre — evt. estimeret — måned end periodens sidste).
 *
 * ESTIMAT-UNDTAGELSEN (data_basis-kontrakten, docs/data-basis-kontrakt.md):
 * Beregninger udelukker normalt estimater, fordi den ENKELTE estimatmåned
 * er en /12-fiktion. Summen er det modsatte tilfælde: 12 × (årstal/12)
 * giver årsrapportens rigtige årstal — derfor regner motoren estimater MED
 * og bærer i stedet grundlaget ud pr. nøgle (basis, estimatAndel), så
 * visningen kan sige det.
 *
 * heleEstimatAar skelner de to nøjagtighedsklasser:
 * - SAND: periodens estimatmåneder udgør hele kalenderår (alle 12 måneder
 *   af hvert berørt estimatår er med). Dér er estimat-summen årsrapportens
 *   EKSAKTE årstal (på nær /12-afrunding, ≤ 6 kr pr. år).
 * - FALSK (delår): summen hviler på en JÆVNHEDSANTAGELSE — "6 estimat-
 *   måneder = halvdelen af årstallet" påstår at halvåret stod for præcis
 *   50 % af året. Det er en antagelse, ikke et tal fra årsrapporten.
 */
import { erEstimat, opgoerGrundlag, type DataBasis } from "@/lib/dataGrundlag";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

export type VaerdiArt = "flow" | "forhold" | "beholdning";

export interface PeriodeDefinition {
  key: string;
  art: VaerdiArt;
  /** Udtræk af værdien fra ét dansk kf-objekt (én måned). For forhold køres
      SAMME funktion på det summerede kf-objekt — genbrug VALUE_EXTRACTORS
      (kpiDefs), så måned og periode deler formel. */
  udtraek: (kf: Record<string, number>) => number | null;
}

export interface PeriodeVaerdi {
  art: VaerdiArt;
  /** flow: sum · forhold: formlen på summerne · beholdning: ultimo.
      null når ingen måned i perioden bærer nøglen (eller formlen ikke kan
      beregnes, fx margin ved Σomsætning = 0). */
  total: number | null;
  /** Grundlaget for de måneder der bærer nøglen — for beholdning:
      kilderækkens egen basis. null når daekning er 0 (et grundlag for
      ingenting ville være en påstand). */
  basis: DataBasis | "blandet" | null;
  /** Estimatdelens bidrag til total — kun for flows ("heraf estimeret" er
      gratis for visningen); null for forhold og beholdning. */
  estimatAndel: number | null;
  /** Antal måneder i perioden hvor nøglen havde værdi. */
  daekning: number;
}

export interface PeriodeOpgoerelse {
  grundlag: { maalte: number; estimerede: number; samlet: number };
  heleEstimatAar: boolean;
  vaerdier: Record<string, PeriodeVaerdi>;
}

/** Basis-dommen for en mængde måneder: alle målt → measured, alle estimat
    → estimated, ellers blandet. */
const doemBasis = (baser: readonly DataBasis[]): DataBasis | "blandet" | null => {
  if (baser.length === 0) return null;
  const harMaalt = baser.some((b) => b === "measured");
  const harEstimat = baser.some((b) => b === "estimated");
  return harMaalt && harEstimat ? "blandet" : harMaalt ? "measured" : "estimated";
};

export function opgoerPeriode(
  facts: readonly CompanyFact[],
  definitioner: readonly PeriodeDefinition[],
): PeriodeOpgoerelse {
  // Én konvertering pr. måned — alle nøgler deler den.
  const maaneder = facts.map((f) => ({
    basis: f.data_basis,
    kf: factsToDanishMetrics(f.metrics),
    periodKey: f.period_key,
  }));

  // Summeret kf-objekt til forholds-formlerne: rå danske nøgler summeret
  // på tværs af perioden (null/manglende nøgler tæller ikke; en nøgle uden
  // nogen værdi udelades helt, så formlerne ser null — ikke 0).
  //
  // OBS: summen dannes over ALLE danske nøgler — også beholdninger
  // (bank_balance). Det er kun forsvarligt fordi udelukkende forholds-
  // udtræk læser sumKf, og ingen af dem rører en beholdning
  // (calcDbMargin/calcResultMargin læser kun flows). Tilføjes der en dag
  // et forhold med en beholdning i nævneren, er summen meningsløs — så
  // skal sumKf begrænses til flow-nøgler først.
  const sumKf: Record<string, number> = {};
  for (const m of maaneder) {
    for (const [k, v] of Object.entries(m.kf)) {
      sumKf[k] = (sumKf[k] ?? 0) + v;
    }
  }

  // heleEstimatAar: hvert år der har estimatmåneder i perioden skal være
  // med i FULD længde (alle 12 måneder som estimat). Ingen estimater → falsk.
  const estimatMdrPrAar = new Map<string, Set<string>>();
  for (const f of facts) {
    if (!erEstimat(f)) continue;
    const [aar, mdr] = f.period_key.split("-");
    if (!estimatMdrPrAar.has(aar)) estimatMdrPrAar.set(aar, new Set());
    estimatMdrPrAar.get(aar)!.add(mdr);
  }
  const heleEstimatAar =
    estimatMdrPrAar.size > 0 &&
    [...estimatMdrPrAar.values()].every((mdr) => mdr.size === 12);

  const vaerdier: Record<string, PeriodeVaerdi> = {};
  for (const def of definitioner) {
    // Måneder hvor nøglen faktisk bærer en værdi — dækning og basis-dom
    // hviler på dem, uanset art.
    const baerende = maaneder
      .map((m) => ({ basis: m.basis, vaerdi: def.udtraek(m.kf) }))
      .filter((m): m is { basis: DataBasis; vaerdi: number } => m.vaerdi != null);
    const daekning = baerende.length;
    const basis = doemBasis(baerende.map((m) => m.basis));

    let total: number | null = null;
    let estimatAndel: number | null = null;

    if (def.art === "flow") {
      total = daekning > 0 ? baerende.reduce((s, m) => s + m.vaerdi, 0) : null;
      estimatAndel =
        daekning > 0
          ? baerende.filter((m) => m.basis === "estimated").reduce((s, m) => s + m.vaerdi, 0)
          : null;
    } else if (def.art === "forhold") {
      total = daekning > 0 ? def.udtraek(sumKf) : null;
    } else {
      // beholdning: ultimo — seneste bærende måned; basis er DENS egen.
      const ultimo = baerende[baerende.length - 1];
      total = ultimo?.vaerdi ?? null;
    }

    // Beholdningens basis er kilderækkens egen (ikke en mængde-dom).
    const endeligBasis =
      def.art === "beholdning" && daekning > 0
        ? baerende[baerende.length - 1].basis
        : basis;

    vaerdier[def.key] = { art: def.art, total, basis: endeligBasis, estimatAndel, daekning };
  }

  return { grundlag: opgoerGrundlag(facts), heleEstimatAar, vaerdier };
}
