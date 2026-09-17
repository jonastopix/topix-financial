/**
 * src/lib/rimelighed.ts
 *
 * Spejlet ordret i supabase/functions/_shared/rimelighed.ts — enhver
 * ændring her SKAL også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/rimelighedParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer. Filhovedet er den ENESTE forskel mellem de to.
 *
 * RIMELIGHEDSTJEK FØR GODKENDELSE — «tal der ikke kan passe» D (18/9-2026).
 * Denne kopi bruges af godkendelsesdialogen (ReportReviewDialog) og af manuel
 * rettelse (ReportManualOverride): samme tre tjek som canonicalEngine kører ved
 * udtrækket, kørt på de tal medlemmet ser og retter — så en advarsel altid
 * står VED tallet og kræver «Ja, tallene er rigtige — godkend alligevel».
 * Grænserne, teksterne og reglerne står i Deno-kopiens filhoved.
 */

import { CANONICAL as OMK, ANDEL_NOEGLER_TIL_RIMELIGHED, ebtRegnet, kontrolsum, sumOmkostninger, udaekketErStort, udaekketTekst } from "./omkostningsnoegler.ts";

export type RimelighedResultat = "PASS" | "WARN" | "SKIP";

export interface RimelighedInput {
  revenue?: number | null;
  gross_profit?: number | null;
  cogs?: number | null;
  payroll?: number | null;
  sales_costs?: number | null;
  facility_costs?: number | null;
  admin_costs?: number | null;
  depreciation?: number | null;
  financial_costs?: number | null;
  /** Saldobalance-XLSX (17/9-2026): resultatkonti uden for de navngivne grupper, og en gruppe hvis netto er en indtægt. */
  other_costs?: number | null;
  other_operating_income?: number | null;
  payroll_related?: number | null;
  other_staff_costs?: number | null;
  vehicle_costs?: number | null;
  /** Finansielle indtægter (positivt tal) — lægges TIL i regnestykket (A2, 18/9-2026). */
  financial_income?: number | null;
  ebt?: number | null;
}

export interface RimelighedAdvarsel {
  name: "ebt_reconciles" | "result_vs_revenue" | "magnitude_plausibility" | "resultat_udaekket";
  result: RimelighedResultat;
  /** Teknisk detalje (engelsk, som de 13 andre tjek) — til loggen. */
  details: string;
  /** Til medlemmet — dansk, uden teknik. Tom ved PASS/SKIP. */
  tekst: string;
  /** Canonical-nøgler advarslen handler om — dialogen markerer dem ved tallet. */
  felter: string[];
}

export const TOLERANCE_PCT = 0.05;
export const TOLERANCE_MIN_KR = 500;
export const ANDEL_MIN = 0.001;
export const ANDEL_MAX = 3;
export const MARGIN_MIN = -3;
export const MARGIN_MAX = 1;

/** Omkostningsposterne der indgår i regnestykket gross_profit − opex + andre driftsindtægter ≈ ebt —
    ÉN fælles definition (omkostningsnoegler.ts, 17/9-2026): drift + afskrivninger + finans; cogs sidder i gross_profit. */
export const OPEX_FELTER = [...OMK.drift, OMK.afskrivninger, OMK.finans as string] as const;
/** Posterne der måles som andel af omsætningen (samme modul). */
export const ANDEL_FELTER = ANDEL_NOEGLER_TIL_RIMELIGHED;

const LABEL: Record<string, string> = {
  revenue: "Omsætning",
  gross_profit: "Dækningsbidrag",
  cogs: "Direkte omkostninger",
  payroll: "Lønomkostninger",
  sales_costs: "Salgsomkostninger",
  facility_costs: "Lokaleomkostninger",
  admin_costs: "Administrationsomkostninger",
  depreciation: "Afskrivninger",
  financial_costs: "Finansielle omkostninger",
  other_costs: "Øvrige omkostninger",
  other_operating_income: "Andre driftsindtægter",
  payroll_related: "Pension og sociale omkostninger",
  other_staff_costs: "Øvrige personaleomkostninger",
  vehicle_costs: "Autodrift",
  financial_income: "Finansielle indtægter",
  ebt: "Resultat før skat",
};

const tal = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** «241.813» — dansk tusindtal uden ører; negative med minus. */
export function krTekst(v: number): string {
  const r = Math.round(v);
  const s = Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return r < 0 ? `−${s}` : s;
}

/** «0,05 %» / «259 %». */
export function pctTekst(andel: number): string {
  const p = andel * 100;
  const s = Math.abs(p) < 1 ? p.toFixed(2).replace(".", ",") : Math.round(p).toString();
  return `${s} %`;
}

export function erResultatopgoerelse(statementType: string): boolean {
  return statementType === "pnl" || statementType === "trial_balance" || statementType === "combined";
}

/** De fire tjek. Rækkefølgen er fast: ebt_reconciles, result_vs_revenue, magnitude_plausibility, resultat_udaekket
    (kontrolsummen, 17/9-2026: ÉT tal — hvor meget af resultatet er ikke dækket af grupperne; omkostningsnoegler.kontrolsum). */
export function rimelighedstjek(m: RimelighedInput, statementType: string): RimelighedAdvarsel[] {
  const ud: RimelighedAdvarsel[] = [];
  const skip = (name: RimelighedAdvarsel["name"], details: string) => ud.push({ name, result: "SKIP", details, tekst: "", felter: [] });
  if (!erResultatopgoerelse(statementType)) {
    skip("ebt_reconciles", `Not a P&L (${statementType})`);
    skip("result_vs_revenue", `Not a P&L (${statementType})`);
    skip("magnitude_plausibility", `Not a P&L (${statementType})`);
    skip("resultat_udaekket", `Not a P&L (${statementType})`);
    return ud;
  }

  const revenue = tal(m.revenue);
  const grossProfit = tal(m.gross_profit);
  const ebt = tal(m.ebt);

  // 1. ebt_reconciles — regnestykket er omkostningsnoegler.ebtRegnet: gross_profit − Σ|drift|
  // + andre driftsindtægter − |afskrivninger| − |finans| (17/9-2026: samme funktion som motorens
  // ebitda-afledning og saldobalancens kontrolsum, så et tal afledt af posterne altid lukker).
  const opexFundet = sumOmkostninger(m, OMK, "alle").fundet - (tal((m as Record<string, unknown>)[OMK.vareforbrug] as number | null | undefined) === null ? 0 : 1);
  const beregnetEbt = ebtRegnet(grossProfit, m, OMK);
  // Kontrolsummen (tjek 4) regnes først: når den er stor, er «forkert kolonne?» ikke forklaringen på
  // ebt_reconciles' afvigelse — så bærer tjek 4 teksten til medlemmet, og tjek 1 nøjes med loggen.
  const ks = kontrolsum(m, OMK);
  const udaekketStort = udaekketErStort(ks);
  let vendt = false;
  if (grossProfit === null || ebt === null) {
    skip("ebt_reconciles", "Missing gross_profit or ebt");
  } else if (opexFundet === 0 || beregnetEbt === null) {
    skip("ebt_reconciles", "No opex fields");
  } else {
    const beregnet = beregnetEbt;
    const tolerance = Math.max(TOLERANCE_PCT * Math.max(Math.abs(beregnet), Math.abs(ebt)), TOLERANCE_MIN_KR);
    const afvigelse = Math.abs(beregnet - ebt);
    if (afvigelse <= tolerance) {
      ud.push({ name: "ebt_reconciles", result: "PASS", details: `gross_profit − opex + financial_income = ${beregnet.toFixed(2)} ≈ ebt ${ebt}`, tekst: "", felter: [] });
    } else {
      // «Vendt» kræver mindst to driftsgrupper: med én eller ingen er «samme tal med modsat fortegn» et
      // tilfælde (ANLA GLAS 2025-12: ingen grupper fanget, 212.743 mod −216.244 — kontrolsummen er 2 mio.).
      vendt = Math.abs(beregnet + ebt) <= tolerance && sumOmkostninger(m, OMK, "drift").fundet >= 2;
      const forklaretAfKontrolsummen = !vendt && udaekketStort;
      ud.push({
        name: "ebt_reconciles",
        result: "WARN",
        details: `gross_profit − opex + financial_income = ${beregnet.toFixed(2)} but ebt = ${ebt} (diff ${afvigelse.toFixed(2)}, tolerance ${tolerance.toFixed(2)})${vendt ? " — same amount, opposite sign" : ""}${forklaretAfKontrolsummen ? " — see resultat_udaekket" : ""}`,
        tekst: vendt
          ? `Resultatet før skat står som ${krTekst(ebt)} kr., men dækningsbidraget minus omkostningerne giver ${krTekst(beregnet)} kr. — samme tal med modsat fortegn. Er et overskud læst som underskud, eller omvendt?`
          : forklaretAfKontrolsummen
            ? ""
            : `Resultatet før skat står som ${krTekst(ebt)} kr., men dækningsbidraget minus omkostningerne giver ${krTekst(beregnet)} kr. Er resultatet læst fra en anden kolonne (fx år til dato) end omkostningerne?`,
        felter: ["ebt"],
      });
    }
  }

  // 2. result_vs_revenue
  if (revenue === null || revenue <= 0 || ebt === null) {
    skip("result_vs_revenue", "Missing revenue (or ≤ 0) or ebt");
  } else {
    const tolerance = Math.max(TOLERANCE_PCT * revenue, TOLERANCE_MIN_KR);
    if (Math.abs(ebt) <= revenue + tolerance) {
      ud.push({ name: "result_vs_revenue", result: "PASS", details: `|ebt| ${Math.abs(ebt)} ≤ revenue ${revenue} + ${tolerance.toFixed(2)}`, tekst: "", felter: [] });
    } else {
      ud.push({
        name: "result_vs_revenue",
        result: "WARN",
        details: `|ebt| ${Math.abs(ebt)} > revenue ${revenue} + tolerance ${tolerance.toFixed(2)}`,
        tekst: `Resultatet før skat (${krTekst(ebt)} kr.) er større end hele omsætningen (${krTekst(revenue)} kr.). Det sker sjældent — er et af tallene læst fra en forkert kolonne eller periode?`,
        felter: ["ebt", "revenue"],
      });
    }
  }

  // 3. magnitude_plausibility
  if (revenue === null || revenue <= 0) {
    skip("magnitude_plausibility", "Missing revenue (or ≤ 0)");
  } else {
    const tekster: string[] = [];
    const detaljer: string[] = [];
    const felter: string[] = [];
    for (const f of ANDEL_FELTER) {
      const v = tal(m[f]);
      if (v === null || v === 0) continue;
      const andel = Math.abs(v) / revenue;
      if (andel < ANDEL_MIN) {
        felter.push(f);
        detaljer.push(`${f} ${Math.abs(v)} = ${(andel * 100).toFixed(3)}% of revenue (< ${ANDEL_MIN * 100}%)`);
        tekster.push(`${LABEL[f]} er ${krTekst(v)} kr. — kun ${pctTekst(andel)} af omsætningen. Er tallet i tusinder (t.kr.) eller læst fra en forkert kolonne?`);
      } else if (andel > ANDEL_MAX) {
        felter.push(f);
        detaljer.push(`${f} ${Math.abs(v)} = ${(andel * 100).toFixed(0)}% of revenue (> ${ANDEL_MAX * 100}%)`);
        tekster.push(`${LABEL[f]} er ${krTekst(v)} kr. — ${pctTekst(andel)} af omsætningen. Er omsætningen kun for en del af perioden, eller er posten i en anden enhed?`);
      }
    }
    if (ebt !== null) {
      const margin = ebt / revenue;
      if (margin < MARGIN_MIN || margin > MARGIN_MAX) {
        felter.push("ebt");
        detaljer.push(`result margin ${(margin * 100).toFixed(0)}% outside [${MARGIN_MIN * 100}%; ${MARGIN_MAX * 100}%]`);
        tekster.push(`Resultatgraden er ${pctTekst(margin)} (resultat ${krTekst(ebt)} kr. af omsætning ${krTekst(revenue)} kr.) — uden for det sandsynlige. Tjek fortegn, kolonne og enhed.`);
      }
    }
    if (tekster.length === 0) {
      ud.push({ name: "magnitude_plausibility", result: "PASS", details: "All cost shares and result margin within bounds", tekst: "", felter: [] });
    } else {
      ud.push({ name: "magnitude_plausibility", result: "WARN", details: detaljer.join("; "), tekst: tekster.join(" "), felter });
    }
  }

  // 4. resultat_udaekket — kontrolsummen som ÉT tal (omkostningsnoegler.kontrolsum). WARN når tallet er
  // stort (> 5 % af omsætningen eller > 10.000 kr.) og fortegnet ikke er vendt (så er tallet meningsløst
  // og tjek 1 bærer advarslen). Tallet selv gemmes altid i quality_signals.udaekket af motoren.
  if (ks === null) {
    skip("resultat_udaekket", "Missing ebt or revenue");
  } else if (!udaekketStort) {
    ud.push({ name: "resultat_udaekket", result: "PASS", details: `uncovered ${ks.udaekket} kr. (${ks.udaekket_pct_af_omsaetning === null ? "n/a" : (ks.udaekket_pct_af_omsaetning * 100).toFixed(1) + "%"} of revenue) within limits`, tekst: "", felter: [] });
  } else if (vendt) {
    skip("resultat_udaekket", `uncovered ${ks.udaekket} kr. but sign inverted — see ebt_reconciles`);
  } else {
    ud.push({
      name: "resultat_udaekket",
      result: "WARN",
      details: `uncovered ${ks.udaekket} kr. (${ks.udaekket_pct_af_omsaetning === null ? "n/a" : (ks.udaekket_pct_af_omsaetning * 100).toFixed(1) + "%"} of revenue): ebt ${ks.udaekket + ks.regnet} vs revenue + income − costs ${ks.regnet}; ${ks.grupper_fundet} cost groups found`,
      tekst: udaekketTekst(ks),
      felter: ["ebt"],
    });
  }

  return ud;
}

/** Kun advarslerne til medlemmet (WARN med tekst) — det dialogen viser og kræver bekræftet. En WARN uden tekst
    (ebt_reconciles når kontrolsummen forklarer afvigelsen, 17/9-2026) bliver i loggen. */
export function rimelighedAdvarsler(m: RimelighedInput, statementType: string): RimelighedAdvarsel[] {
  return rimelighedstjek(m, statementType).filter((a) => a.result === "WARN" && a.tekst !== "");
}

/** Teksten på bekræftelsen — ordret i dialogen og i manuel rettelse. */
export const BEKRAEFT_TEKST = "Ja, tallene er rigtige — godkend alligevel";
export const ADVARSEL_OVERSKRIFT = "Tal der ikke kan passe?";
export const ADVARSEL_INTRO = "Kontrollen fandt tal der sjældent er rigtige. Tjek dem mod din rapport, før du godkender.";
