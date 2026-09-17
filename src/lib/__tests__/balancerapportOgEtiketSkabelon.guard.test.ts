/**
 * Kildeværn for de to formater målt 17/9-2026: e-conomics balancerapport som PDF (Warburgs månedsrapport,
 * DK_ECONOMIC_BALANCERAPPORT_PDF_V1) og «etiket;beløb»-CSV (BR Rosets format, DK_ETIKET_RESULTAT_BALANCE_CSV_V1).
 * Værnet læser KILDEN og fælder hvis skabelonerne afregistreres, hvis balancerapporten begynder at udstede balancen
 * (den er periodens bevægelser), hvis børne-«ialt» (Autodrift vareauto) får en matcher, hvis ekstraordinære poster
 * flyttes ud af kontrolsummen uden at kontrolsummen følger med, hvis etiket-CSV'ens matchere mister tolerancen for
 * klientens tab af æ/ø/å, hvis tallene ganges op, eller hvis grupperne ikke længere går gennem de fælles moduler.
 *
 * SELVBEVIS: hvert prædikat køres også på en muteret kilde hvor bruddet er lagt ind — og skal fælde dér.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rod = resolve(__dirname, "../../..");
const laes = (sti: string) => readFileSync(resolve(rod, sti), "utf8");
/** Kilden uden kommentarer (// … og /* … *\/), så forklaringer ikke tæller som kode. */
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/[ \t]\/\/.*$/gm, "");
const F = {
  pdf: "supabase/functions/_shared/templates/dkEconomicBalancerapportPdfV1.ts",
  csv: "supabase/functions/_shared/templates/dkEtiketResultatBalanceCsvV1.ts",
  registry: "supabase/functions/_shared/templateRegistry.ts",
  profiler: "supabase/functions/_shared/normalizationProfiles.ts",
  engine: "supabase/functions/_shared/canonicalEngine.ts",
  fixture: "supabase/functions/_test_fixtures/balancerapportOgEtiketSyntetisk.ts",
} as const;

// ── Prædikater ──
const registreret = (k: string) => /dkEconomicBalancerapportPdfV1,/.test(k) && /dkEtiketResultatBalanceCsvV1,/.test(k) && /import \{ dkEconomicBalancerapportPdfV1 \}/.test(k) && /import \{ dkEtiketResultatBalanceCsvV1 \}/.test(k);
const pdfGennemSubtotalGrupper = (k: string) => /import \{ fordelSubtotaler[^}]*\} from "\.\.\/subtotalGrupper\.ts"/.test(k) && /fordelSubtotaler\(rows, konvention, "last"\)/.test(k) && /checks\.push\(r\.fordeling\.kontrolsum\)/.test(k);
const pdfUdstederIkkeBalancen = (k: string) => /statement_type: "pnl"/.test(k) && /BALANCE_FRA = 6000/.test(k) && /nr < BALANCE_FRA/.test(k) && !/aktiver_i_alt/.test(k.slice(k.indexOf("export const MATCHERE")));
const pdfKunForaelderAutodrift = (k0: string) => { const k = udenKommentarer(k0); const i = k.indexOf("export const MATCHERE"); return /key: "autodrift", family: "cost_like", pattern: \/\^autodrift\\s\+i\\s\*alt\$\/i \}/.test(k) && !/vareauto|personauto/.test(k.slice(i, k.indexOf("];", i))); };
const pdfEkstraordinaereTilOevrige = (k: string) => /key: "oevrige_omkostninger", family: "cost_like", pattern: \/\^ekstraordinære\\s\+poster\\s\+i\\s\*alt\$\/i \}/.test(k);
const pdfDetektionKraeverIalt = (k: string) => /if \(\/saldobalance\/i\.test\(text\)\) return 0;/.test(k) && /ialtLinjer < 5\) return 0/.test(k) && /return score; \/\/ maks 90/.test(k);
const pdfProfilerFindes = (k: string) => ['profile_id: "economic_balancerapport_credit_v1"', 'profile_id: "economic_balancerapport_business_v1"'].every((p) => k.includes(p)) && /revenue_like:\s+NEGATE,\n\s+cost_like:\s+ABS,\n\s+profit_like:\s+NEGATE,\n\s+asset_like:\s+REJECT/.test(k);
const csvTolerant = (k: string) => /export function tolerant\(kilde: string\): RegExp \{\n\s+return new RegExp\(kilde\.replace\(\/\[æøå\]\/g, \(c\) => `\(\?:\$\{c\}\|\\uFFFD\)`\), "i"\);/.test(k) && /pattern: tolerant\("\^\(netto\)\?omsætning\$"\)/.test(k) && /pattern: tolerant\("\^kortfristede gældsforpligtelser\$"\)/.test(k) && !/pattern: \/[^\n]*[æøå][^\n]*\/,/.test(k.slice(k.indexOf("export const MATCHERE")));
const csvHeleKroner = (k: string) => /parseFloat\(t\.replace\(\/\\\.\/g, ""\)\.replace\(",", "\."\)\)/.test(k) && !/\* 1000|\*1000/.test(k) && /name: "amounts_are_whole_kr"/.test(k);
const csvIngenLinjeTabes = (k: string) => /vaerdier\[OEVRIGE_KEY\] = \(vaerdier\[OEVRIGE_KEY\] \?\? 0\) \+ r\.vaerdi;\n\s+oevrigeFra\.push/.test(k) && /if \(SUBTOTAL_AGTIG\.test\(r\.etiket\)\) continue;/.test(k);
const csvEbtErAaretsResultat = (k: string) => /kandidat\("resultat_foer_skat", "profit_like", l\.vaerdier\["arets_resultat"\]/.test(k) && /kf\["resultat_foer_skat"\] = kf\["arets_resultat"\]/.test(k);
const csvDetektionUdenOverskrift = (k: string) => /if \(ctx\.csvHeaders && ctx\.csvHeaders\.length > 0\) return 0;/.test(k) && /if \(bredde !== 2\) return 0;/.test(k) && /\^\\d\{3,5\}\$/.test(k);
const csvProfilFindes = (k: string) => k.includes('profile_id: "etiket_pnl_business_v1"') && /etiket_pnl_business_v1,\n/.test(k);
const engineLegacyNoegler = (k: string) => { const b = k.slice(k.indexOf("KF_TO_CANONICAL"), k.indexOf("};", k.indexOf("KF_TO_CANONICAL"))); return ["pensioner_sociale: \"payroll_related\"", "oevrige_personale: \"other_staff_costs\"", "autodrift: \"vehicle_costs\"", "indtjeningsbidrag: \"ebit\"", "finansieringsudgifter: \"financial_costs\"", "ekstraordinaere_poster: \"extraordinary_items\""].every((x) => b.includes(x)); };
const fixtureUdenKundedata = (k: string) => !/warburg|roset|anla|vvs & kloak/i.test(udenKommentarer(k)) && /Testfirma Syntetisk ApS/.test(k);

describe("balancerapportOgEtiketSkabelon.guard — Warburgs PDF og BR Rosets CSV (17/9-2026)", () => {
  it("begge skabeloner er registreret", () => expect(registreret(laes(F.registry))).toBe(true));
  it("PDF: grupperne går gennem subtotalGrupper.fordelSubtotaler med kontrolsummen i tjekkene", () => expect(pdfGennemSubtotalGrupper(laes(F.pdf))).toBe(true));
  it("PDF: balancen (≥ 6000, periodens bevægelser) udstedes ikke; statement_type pnl", () => expect(pdfUdstederIkkeBalancen(laes(F.pdf))).toBe(true));
  it("PDF: kun forælderen «Autodrift ialt» har en matcher — børnene tælles ikke dobbelt", () => expect(pdfKunForaelderAutodrift(laes(F.pdf))).toBe(true));
  it("PDF: ekstraordinære poster → oevrige_omkostninger (kontrolsummen har ingen plads til extraordinary_items)", () => expect(pdfEkstraordinaereTilOevrige(laes(F.pdf))).toBe(true));
  it("PDF: detektionen kræver «ialt»-kontolinjer, afviser saldobalance, maks 90", () => expect(pdfDetektionKraeverIalt(laes(F.pdf))).toBe(true));
  it("PDF: profilerne credit (NEGATE/ABS/NEGATE, balance REJECT) og business findes", () => expect(pdfProfilerFindes(laes(F.profiler))).toBe(true));
  it("CSV: matcherne er tolerante for klientens tab af æ/ø/å (U+FFFD) — ingen rå æøå-mønstre", () => expect(csvTolerant(laes(F.csv))).toBe(true));
  it("CSV: tallene læses som hele kroner med tusindtalspunktum — ganges aldrig op", () => expect(csvHeleKroner(laes(F.csv))).toBe(true));
  it("CSV: P&L-etiketter uden matcher lander i øvrige; subtotaler/forældre tælles ikke", () => expect(csvIngenLinjeTabes(laes(F.csv))).toBe(true));
  it("CSV: årets resultat er resultat før skat (skat står kun i egenkapitalen)", () => expect(csvEbtErAaretsResultat(laes(F.csv))).toBe(true));
  it("CSV: detektionen kræver to kolonner, ingen overskrift, ingen kontonumre", () => expect(csvDetektionUdenOverskrift(laes(F.csv))).toBe(true));
  it("CSV: profilen etiket_pnl_business_v1 findes og er registreret", () => expect(csvProfilFindes(laes(F.profiler))).toBe(true));
  it("motoren: legacy-mappet kender de seks kilde-id'er de to legacy-veje udsteder", () => expect(engineLegacyNoegler(laes(F.engine))).toBe(true));
  it("fixturen er syntetisk — ingen kundenavne", () => expect(fixtureUdenKundedata(laes(F.fixture))).toBe(true));

  describe("selvbevis — hvert prædikat fælder på den muterede kilde", () => {
    it("afregistreret → fælder", () => expect(registreret(laes(F.registry).replace("  dkEtiketResultatBalanceCsvV1,", ""))).toBe(false));
    it("PDF uden fordelSubtotaler → fælder", () => expect(pdfGennemSubtotalGrupper(laes(F.pdf).replace('fordelSubtotaler(rows, konvention, "last")', "egenFordeling(rows)"))).toBe(false));
    it("PDF der udsteder aktiver_i_alt → fælder", () => expect(pdfUdstederIkkeBalancen(laes(F.pdf).replace('{ key: "arets_resultat"', '{ key: "aktiver_i_alt", family: "asset_like", pattern: /^aktiver\\s+i\\s*alt$/i },\n  { key: "arets_resultat"'))).toBe(false));
    it("PDF med matcher for «Autodrift vareauto ialt» → fælder", () => expect(pdfKunForaelderAutodrift(laes(F.pdf).replace('{ key: "autodrift", family: "cost_like", pattern: /^autodrift\\s+i\\s*alt$/i }', '{ key: "autodrift", family: "cost_like", pattern: /^autodrift( vareauto)?\\s+i\\s*alt$/i }'))).toBe(false));
    it("PDF med ekstraordinære → extraordinary_items → fælder", () => expect(pdfEkstraordinaereTilOevrige(laes(F.pdf).replace('{ key: "oevrige_omkostninger", family: "cost_like", pattern: /^ekstraordinære', '{ key: "ekstraordinaere_poster", family: "cost_like", pattern: /^ekstraordinære'))).toBe(false));
    it("PDF-detektion uden saldobalance-værnet → fælder", () => expect(pdfDetektionKraeverIalt(laes(F.pdf).replace("if (/saldobalance/i.test(text)) return 0;", ""))).toBe(false));
    it("PDF-profil med cost_like KEEP → fælder", () => { const k = laes(F.profiler); const i = k.indexOf('profile_id: "economic_balancerapport_credit_v1"'); expect(pdfProfilerFindes(k.slice(0, i) + k.slice(i).replace(/cost_like:(\s+)ABS/, "cost_like:$1KEEP"))).toBe(false); });
    it("CSV med et råt æøå-mønster → fælder", () => expect(csvTolerant(laes(F.csv).replace('pattern: tolerant("^(netto)?omsætning$")', 'pattern: /^(netto)?omsætning$/'))).toBe(false));
    it("CSV der ganger op → fælder", () => expect(csvHeleKroner(laes(F.csv).replace("return Number.isFinite(n) ? n : null;", "return Number.isFinite(n) ? n * 1000 : null;"))).toBe(false));
    it("CSV der springer ukendte etiketter over → fælder", () => expect(csvIngenLinjeTabes(laes(F.csv).replace("if (SUBTOTAL_AGTIG.test(r.etiket)) continue;", "continue;"))).toBe(false));
    it("CSV uden ebt = årets resultat → fælder", () => expect(csvEbtErAaretsResultat(laes(F.csv).replace('kf["resultat_foer_skat"] = kf["arets_resultat"]', 'kf["resultat_foer_skat"] = null'))).toBe(false));
    it("CSV-detektion der accepterer en overskriftsrække → fælder", () => expect(csvDetektionUdenOverskrift(laes(F.csv).replace("if (ctx.csvHeaders && ctx.csvHeaders.length > 0) return 0;", ""))).toBe(false));
    it("motoren uden autodrift i legacy-mappet → fælder", () => expect(engineLegacyNoegler(laes(F.engine).replace('  autodrift: "vehicle_costs",\n  indtjeningsbidrag', '  indtjeningsbidrag'))).toBe(false));
    it("fixture med et kundenavn i data → fælder", () => expect(fixtureUdenKundedata(laes(F.fixture).replace("Testfirma Syntetisk ApS Månedsrapport", "Warburg VVS & Kloak ekspres ApS Månedsrapport"))).toBe(false));
  });
});
