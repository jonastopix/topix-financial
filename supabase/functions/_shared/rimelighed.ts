/**
 * supabase/functions/_shared/rimelighed.ts
 *
 * Spejlet ordret i src/lib/rimelighed.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/rimelighedParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer. Filhovedet er den ENESTE forskel mellem de to.
 *
 * RIMELIGHEDSTJEK FØR GODKENDELSE — «tal der ikke kan passe» D (18/9-2026,
 * recon-tal-der-ikke-kan-passe.md §5 D; recon-resultat-aar-til-dato.md §7).
 * Jonas 17/9: «Enig med dig» — D før webinarholdet uploader 22/9.
 *
 * Det de 13 tjek i canonicalEngine.runExtendedValidation aldrig gør, er at
 * måle et tal mod et andet som STØRRELSE. Derfor slap «personale 46 kr. ved
 * omsætning 83.665» (Booking Innovation 2024, læst i t.kr.) og «resultat
 * +241.813 hvor regnestykket giver −241.813» (Fjeldgaardshop 2025-10 og
 * Brick Works 2025-01: e-conomic saldobalance, fortegnet vendt — målt 17/9
 * 16:33) igennem som PASS/FAIL uden at nogen så det.
 *
 * TRE TJEK — alle WARN, aldrig FAIL (en engangsindtægt eller en rigtig lille
 * post kan bryde dem; medlemmet skal bekræfte, ikke afvises):
 *
 *   ebt_reconciles        gross_profit − (payroll + sales_costs + facility_costs
 *                         + admin_costs + depreciation + financial_costs) ≈ ebt
 *                         med tolerance max(5 % af det største af |beregnet| og
 *                         |ebt|, 500 kr.) — fanger fortegnsvend (samme tal med
 *                         modsat fortegn) og forkert kolonne (ÅTD mod måned),
 *                         UANSET årsag. Manglende omkostningsfelter tæller 0;
 *                         kræver mindst ét omkostningsfelt.
 *   result_vs_revenue     |ebt| ≤ revenue + max(5 % af revenue, 500 kr.) for
 *                         resultatopgørelser (pnl/trial_balance/combined) —
 *                         et resultat større end hele omsætningen er sjældent
 *                         rigtigt.
 *   magnitude_plausibility hver omkostningspost (cogs, payroll, sales, facility,
 *                         admin, depreciation, financial) som andel af omsætning
 *                         i [0,1 %; 300 %] — under: læst i t.kr. eller forkert
 *                         kolonne; over: omsætningen er en delmåned eller
 *                         forkert enhed. Resultatmargin ebt/revenue i
 *                         [−300 %; 100 %]. Kun ved revenue > 0; poster på 0
 *                         eller null dømmes ikke (cost_lines_present tager det).
 *
 * GRÆNSERNE SAGT HØJT: TOLERANCE_PCT = 0,05, TOLERANCE_MIN_KR = 500,
 * ANDEL_MIN = 0,001 (0,1 %), ANDEL_MAX = 3 (300 %), MARGIN_MIN = −3 (−300 %),
 * MARGIN_MAX = 1 (100 %). Ballance-rapporter (statementType "balance"): alt SKIP.
 *
 * Hver advarsel bærer `tekst` (til medlemmet, dansk, uden teknik) og `felter`
 * (de canonical-nøgler advarslen handler om), så godkendelsesdialogen kan
 * vise den VED tallet og kræve et aktivt «Ja, tallet er rigtigt» før
 * commit_report_facts. Samme funktion kører i manuel rettelse (src-spejlet).
 */

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
  ebt?: number | null;
}

export interface RimelighedAdvarsel {
  name: "ebt_reconciles" | "result_vs_revenue" | "magnitude_plausibility";
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

/** Omkostningsposterne der indgår i regnestykket gross_profit − opex ≈ ebt (cogs sidder allerede i gross_profit). */
export const OPEX_FELTER = ["payroll", "sales_costs", "facility_costs", "admin_costs", "depreciation", "financial_costs"] as const;
/** Posterne der måles som andel af omsætningen. */
export const ANDEL_FELTER = ["cogs", "payroll", "sales_costs", "facility_costs", "admin_costs", "depreciation", "financial_costs"] as const;

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

/** De tre tjek. Rækkefølgen er fast: ebt_reconciles, result_vs_revenue, magnitude_plausibility. */
export function rimelighedstjek(m: RimelighedInput, statementType: string): RimelighedAdvarsel[] {
  const ud: RimelighedAdvarsel[] = [];
  const skip = (name: RimelighedAdvarsel["name"], details: string) => ud.push({ name, result: "SKIP", details, tekst: "", felter: [] });
  if (!erResultatopgoerelse(statementType)) {
    skip("ebt_reconciles", `Not a P&L (${statementType})`);
    skip("result_vs_revenue", `Not a P&L (${statementType})`);
    skip("magnitude_plausibility", `Not a P&L (${statementType})`);
    return ud;
  }

  const revenue = tal(m.revenue);
  const grossProfit = tal(m.gross_profit);
  const ebt = tal(m.ebt);

  // 1. ebt_reconciles
  const opex = OPEX_FELTER.map((f) => tal(m[f])).filter((v): v is number => v !== null);
  if (grossProfit === null || ebt === null) {
    skip("ebt_reconciles", "Missing gross_profit or ebt");
  } else if (opex.length === 0) {
    skip("ebt_reconciles", "No opex fields");
  } else {
    const beregnet = grossProfit - opex.reduce((s, v) => s + Math.abs(v), 0);
    const tolerance = Math.max(TOLERANCE_PCT * Math.max(Math.abs(beregnet), Math.abs(ebt)), TOLERANCE_MIN_KR);
    const afvigelse = Math.abs(beregnet - ebt);
    if (afvigelse <= tolerance) {
      ud.push({ name: "ebt_reconciles", result: "PASS", details: `gross_profit − opex = ${beregnet.toFixed(2)} ≈ ebt ${ebt}`, tekst: "", felter: [] });
    } else {
      const vendt = Math.abs(beregnet + ebt) <= tolerance;
      ud.push({
        name: "ebt_reconciles",
        result: "WARN",
        details: `gross_profit − opex = ${beregnet.toFixed(2)} but ebt = ${ebt} (diff ${afvigelse.toFixed(2)}, tolerance ${tolerance.toFixed(2)})${vendt ? " — same amount, opposite sign" : ""}`,
        tekst: vendt
          ? `Resultatet før skat står som ${krTekst(ebt)} kr., men dækningsbidraget minus omkostningerne giver ${krTekst(beregnet)} kr. — samme tal med modsat fortegn. Er et overskud læst som underskud, eller omvendt?`
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

  return ud;
}

/** Kun advarslerne (WARN) — det dialogen viser og kræver bekræftet. */
export function rimelighedAdvarsler(m: RimelighedInput, statementType: string): RimelighedAdvarsel[] {
  return rimelighedstjek(m, statementType).filter((a) => a.result === "WARN");
}

/** Teksten på bekræftelsen — ordret i dialogen og i manuel rettelse. */
export const BEKRAEFT_TEKST = "Ja, tallene er rigtige — godkend alligevel";
export const ADVARSEL_OVERSKRIFT = "Tal der ikke kan passe?";
export const ADVARSEL_INTRO = "Kontrollen fandt tal der sjældent er rigtige. Tjek dem mod din rapport, før du godkender.";
