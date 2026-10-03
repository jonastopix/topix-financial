/**
 * supabase/functions/_shared/aiSkema.ts — AI-vejens skema for key_figures (pakke B, skive 1 «Tallene rigtige»,
 * 3/10-2026; mangelliste-kortet m17-ai-skema-grupper).
 *
 * HVORFOR: AI-skemaet i extract-financial-data havde ingen felter for pension, øvrige personaleomkostninger,
 * autodrift, andre eksterne omkostninger og ekstraordinære poster. AI'en kunne kun lægge dem i line_items, som
 * aldrig når metrics — og kontrolsummen (omkostningsnoegler.kontrolsum) viste dem som «udækket». Målt i prod
 * 3/10: 21 af 42 målbare AI-læste rapporter (8 virksomheder) har et stort udækket; 21 mangler omkostninger.
 *
 * FELTNAVNENE ER HUSETS EKSISTERENDE KILDE-ID'ER — ingen nye nøgler. Hvert felt mappes af canonicalEngines
 * KF_TO_CANONICAL (den ENE mapning) til en kanonisk nøgle, der allerede findes i CanonicalMetrics:
 *
 *   pensioner_sociale     → payroll_related      (som balancerapport-PDF'en og etiket-CSV'en)
 *   oevrige_personale     → other_staff_costs    (samme)
 *   autodrift             → vehicle_costs        (samme; Mamut «bilomk»)
 *   oevrige_omkostninger  → other_costs          (resultatopgørelse-PDF'en: «andre eksterne omkostninger i alt»)
 *   ekstraordinaere_poster→ extraordinary_items  (XLSX-resultatopgørelsen, combined, Mamut)
 *
 * EKSTRAORDINÆRE POSTER — regnestykket (omkostningsnoegler.ts, CANONICAL):
 *   extraordinary_items står IKKE i CANONICAL.drift, .afskrivninger eller .finans. Derfor:
 *     omkostningerIAlt = Σ|cogs, drift×8, depreciation, financial_costs|            — UDEN extraordinary_items
 *     ebitdaRegnet     = gross_profit − Σ|drift×8| + other_operating_income          — UDEN extraordinary_items
 *     ebtRegnet        = ebitda − |depreciation| − |financial_costs| + financial_income — UDEN extraordinary_items
 *     kontrolsum: udaekket = ebt − (basis + indtægter − Σ|drift og afskrivninger| − |finans|)
 *   En rapport med ekstraordinære poster E (omkostning) og resultatlinjen aflæst EFTER dem får altså
 *   udaekket = −E. Det er HUSETS nuværende regel for nøglen (tre af fire skabeloner) — balancerapport-PDF'en
 *   valgte i stedet other_costs (dens filhoved: «et valg chatten kan omgøre»). Skive 1 følger den kanoniske
 *   mapning og ændrer IKKE regnestykkerne; afgørelsen står som åbent punkt i OVERLEVERING DEL 3
 *   «Pakke B skive 1 — udrulning». Målt 3/10: 0 af 673 AI-line_items i prod hedder «ekstraordinær …».
 *
 * KONVENTIONEN (7/9-2026): omkostninger er POSITIVE. Motoren vender en negativ omkostning (expense_must_be_positive)
 * for de fire driftsgrupper; ekstraordinære poster bærer fortegn (negativ = nettoindtægt).
 *
 * Nul imports — Vitest (src/lib/__tests__/aiSkema*.test.ts) og Deno loader filen ens.
 */

/** Beviset for udrulningen: kun den nye kode sætter dette felt (svaret, extracted_data, raw_extracted_data, quality_signals). */
export const AI_SKEMA_FELT = "ai_skema" as const;
export const AI_SKEMA_MARKOER = "skive-1" as const;

type Egenskab = { type: "number"; description?: string };

/** key_figures-egenskaberne i tool-definitionen. Rækkefølgen er resultatopgørelsens. */
export const AI_KEY_FIGURES_EGENSKABER: Readonly<Record<string, Egenskab>> = {
  omsaetning: { type: "number" },
  omsaetning_aar: { type: "number" },
  direkte_omkostninger: {
    type: "number",
    description:
      "Vareforbrug / direkte omkostninger i alt — positivt tal. Hertil «Vareforbrug og fremmed arbejde», «Fremmed arbejde», «Underleverandører» og fragt på varekøb, når de står i vareforbruget (som husets e-conomic- og Dinero-skabeloner).",
  },
  daekningsbidrag: { type: "number" },
  daekningsbidrag_aar: { type: "number" },
  // loenninger står UÆNDRET fra før skive 1 (CTO-fund 7, 3/10): de danske flader (factsAdapter.CANONICAL_TO_DANISH,
  // financialUtils, DANSK) kender ikke payroll_related/other_staff_costs — en snævrere lønbeskrivelse ville flytte
  // beløb ud af «omkostninger i alt» på Dine tal. Se OVERLEVERING DEL 3 «Pakke B skive 1».
  loenninger: { type: "number" },
  pensioner_sociale: {
    type: "number",
    description:
      "Pension og sociale bidrag i alt — positivt tal. Linjer som «Pensioner & sociale omkostninger i alt», «Pension», «ATP», «AER/AUB», «Sociale omkostninger», «Barsel.dk». Udelad feltet, hvis gruppen ikke findes. Er pensionen allerede med i den lønsum, du lagde i loenninger, så udelad feltet (aldrig to gange).",
  },
  oevrige_personale: {
    type: "number",
    description:
      "Øvrige personaleomkostninger i alt — positivt tal. Linjer som «Øvrige personaleudgifter i alt», «Personaleomkostninger øvrige», «Personalegoder», «Kurser og uddannelse», «Personalearrangementer», «Arbejdstøj». Rejseudgifter hører IKKE her (de står i «Salgs- og rejseomkostninger» → marketing). Udelad feltet, hvis gruppen ikke findes. Læg ALDRIG overgruppens total («Personaleomkostninger i alt») i et felt, når underposterne også lægges ind.",
  },
  marketing: { type: "number", description: "Salgs- og marketingomkostninger samlet" },
  lokaler: {
    type: "number",
    description:
      "Lokaleomkostninger i alt — summér ALLE poster under gruppen (husleje, el, vand, varme, rengøring). Returnér 0 hvis gruppen er tom, ALDRIG null.",
  },
  admin: { type: "number", description: "Administrative omkostninger samlet (kontor, telefon, forsikring, revisor, etc.)" },
  autodrift: {
    type: "number",
    description:
      "Autodrift / bilomkostninger i alt — positivt tal. Linjer som «Autodrift i alt», «Bilomkostninger i alt», «Transportomkostninger i alt» (e-conomics navn for bilgruppen — som husets skabeloner), «Brændstof», «Leasing af biler», «Kørselsgodtgørelse»/«Kilometergodtgørelse», «Vægtafgift», «Parkering», «Reparation og vedligeholdelse af biler». ALDRIG fragt («Fragt», «Fragtomkostninger», «Transport af varer») — fragt hører i vareforbruget. Udelad feltet, hvis gruppen ikke findes.",
  },
  oevrige_omkostninger: {
    type: "number",
    description:
      "Andre eksterne omkostninger / øvrige driftsomkostninger i alt — positivt tal. Linjer som «Andre eksterne omkostninger i alt», «Øvrige omkostninger i alt», «Øvrige driftsomkostninger», «Leasing» (ikke biler), «Manglende bilag». «Fremmed arbejde» og «Underleverandører» hører i direkte_omkostninger, når de står over dækningsbidraget (i vareforbruget); står de under dækningsbidraget, følges dokumentets egen gruppe. Læg ALDRIG overgruppens total («Andre eksterne omkostninger i alt») her, når dens underposter (salg, lokaler, administration, auto) også lægges i deres egne felter. Brug KUN dette felt for en GRUPPE, dokumentet selv viser ud over salg, lokaler, administration, personale og auto — flyt aldrig poster ud af de andre grupper. Udelad feltet, hvis gruppen ikke findes.",
  },
  ekstraordinaere_poster: {
    type: "number",
    description:
      "Ekstraordinære poster i alt (netto) — POSITIVT tal når det er en omkostning, NEGATIVT når det er en nettoindtægt. Kun linjen «Ekstraordinære poster (i alt)» / «Ekstraordinære omkostninger» — ALDRIG «Resultat før ekstraordinære poster». Udelad feltet, hvis gruppen ikke findes.",
  },
  afskrivninger: { type: "number", description: "Af- og nedskrivninger" },
  tech_software: { type: "number", description: "IT, software, hosting" },
  finansielle_omkostninger: { type: "number", description: "Renteudgifter / finansielle omkostninger i alt — positivt tal" },
  finansielle_indtaegter: { type: "number", description: "Renteindtægter / finansielle indtægter i alt — positivt tal" },
  resultat_foer_skat: { type: "number" },
  resultat_foer_skat_aar: { type: "number" },
  resultat_efter_skat: { type: "number" },
  resultat_efter_skat_aar: { type: "number" },
  aktiver_i_alt: { type: "number" },
  passiver_i_alt: { type: "number" },
  egenkapital: { type: "number" },
  bank_balance: { type: "number" },
  debitorer: { type: "number" },
  kreditorer: { type: "number" },
};

/** De fem grupper skive 1 tilføjede, med deres kanoniske nøgle (skal stemme med KF_TO_CANONICAL — værnet tjekker). */
export const AI_SKIVE1_GRUPPER: ReadonlyArray<{ felt: string; noegle: string }> = [
  { felt: "pensioner_sociale", noegle: "payroll_related" },
  { felt: "oevrige_personale", noegle: "other_staff_costs" },
  { felt: "autodrift", noegle: "vehicle_costs" },
  { felt: "oevrige_omkostninger", noegle: "other_costs" },
  { felt: "ekstraordinaere_poster", noegle: "extraordinary_items" },
];

/** Driftsgrupperne blandt dem — positive omkostninger, som motoren vender ved et negativt tal. */
export const AI_POSITIVE_DRIFTSFELTER = ["pensioner_sociale", "oevrige_personale", "autodrift", "oevrige_omkostninger"] as const;

/**
 * Dommen værnet bruger: hvilke kanoniske omkostningsnøgler kan IKKE nås fra et felt i skemaet?
 * `mapning` er KF_TO_CANONICAL, `omkostningsnoegler` er omkostningsnoegler(CANONICAL, "alle").
 * Tom liste = hver omkostningsnøgle har mindst ét skemafelt.
 */
export function manglendeOmkostningsfelter(
  egenskaber: Readonly<Record<string, unknown>>,
  mapning: Readonly<Record<string, string>>,
  omkostningsnoegler: readonly string[],
): string[] {
  const naaede = new Set(Object.keys(egenskaber).map((f) => mapning[f]).filter((n): n is string => typeof n === "string"));
  return omkostningsnoegler.filter((n) => !naaede.has(n));
}

/** Svar-kroppen med markøren (CTO-fund 10, 3/10-2026) — extract-financial-datas svar-hjælper bruger den for ALLE svar.
    Markøren lægges SIDST, så en krop aldrig kan overskrive den. */
export function medAiSkema<T extends Record<string, unknown>>(krop: T): T & { [AI_SKEMA_FELT]: typeof AI_SKEMA_MARKOER } {
  return { ...krop, [AI_SKEMA_FELT]: AI_SKEMA_MARKOER };
}
