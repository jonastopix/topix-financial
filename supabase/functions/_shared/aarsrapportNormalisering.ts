/**
 * aarsrapportNormalisering — ren fortegns- og afstemningsmotor for
 * årsrapport-vejen (extract-annual-report).
 *
 * Udskilt som ren funktion efter samme mønster som weeklyFocusKpi.ts:
 * ingen I/O, ingen afhængigheder, ingen Deno-API'er — så vitest kan
 * dække den på tværs af boundary'en (bun run test), og edge-funktionen
 * senere kan kalde den uden ombygning.
 *
 * BAGGRUND (docs/aarsrapport-vejen-design.md): konventionen på vejen
 * bæres i dag alene af en prompt, og prod indeholder alle ti mulige
 * fortegnsmønstre. Motoren her gør konventionen til kode:
 * omkostninger positive, og resultatlinjen dømmes ved at lukke
 * regnestykket — aldrig ved at se på fortegnet alene.
 *
 * REGLERNE:
 * 1. De fire omkostningsnøgler payroll, depreciation, cogs, admin_costs
 *    gøres positive (Math.abs). Intet andet felt røres.
 * 2. revenue lig 0 behandles som manglende (null) med en note — et nul
 *    er ikke en måling.
 * 3. Invariant 1 (kun når både revenue og cogs findes):
 *    revenue − |cogs| skal ≈ gross_profit — med sin EGEN tolerance,
 *    skaleret efter det tal den måler (gross_profit), ikke efter ebt.
 * 4. Invariant 2 (kræver gross_profit og ebt):
 *    beregnet = gross_profit − |payroll| − |depreciation| − |admin_costs|.
 *    cogs indgår IKKE — dækningsbidraget er allerede efter vareforbrug.
 *    Lukker beregnet mod ebt → ebt uændret. Lukker beregnet KUN mod
 *    −ebt → ebt vendes med note. Uændret prøves altid før vending.
 * 5. Tolerancer: invariant 1 bruger Math.max(|gross_profit| * 0.05, 500);
 *    invariant 2 bruger Math.max(|ebt| * 0.05, 500); vendings-grenen
 *    kræver rene 5 % af |ebt| uden gulv (se skærpelsen nedenfor).
 *
 * AFVISNINGSGRUNDEN omkostninger_ikke_udtrukket: når regnestykket ikke
 * lukker nogen vej OG alle fire omkostningsnøgler mangler, er fejlen
 * ikke at tallene modsiger hinanden — der ER ingen omkostningstal at
 * regne med. En grund der beskriver noget andet end det der skete, kan
 * ikke tælles: uden denne skelnen ville "udtrækket fandt ingen
 * omkostninger" (remm. 2025, klasse D i designdokumentet) tælle i samme
 * bunke som "tallene stemmer ikke" (Rezycl, PHILBERT — klasse C).
 *
 * SKÆRPELSE AF VENDINGS-BEVISET (bevidst afvigelse fra regel 5):
 * En vending af resultatlinjen er en stærk påstand ("dokumentet er
 * kreditnegativt") og kræver bevis UD OVER støjgulvet: vendingen
 * accepteres kun når afvigelsen lukker inden for rene 5 % af |ebt|,
 * UDEN 500-gulvet. Gulvet findes for at absorbere afrunding på store
 * tal ved den almindelige afstemning — men på en lille resultatlinje
 * ville gulvet gøre arbejdet alene, og så er grundlaget netop
 * tvetydigt. Målt eksempel: PHILBERT 2025 (aprilbalance, forkert
 * dokument) har beregnet 1322 mod −ebt 1196 — afvigelse 126, som
 * ligger under gulvet men på 10,5 % af |ebt|. Med gulv ville motoren
 * vende et forkert dokument til "ok"; med rene 5 % afvises det som
 * regnestykket_lukker_ikke.
 */

export interface AarsrapportInput {
  revenue?: number | null;
  gross_profit?: number | null;
  cogs?: number | null;
  payroll?: number | null;
  depreciation?: number | null;
  admin_costs?: number | null;
  ebt?: number | null;
  cash?: number | null;
  equity?: number | null;
}

export interface AarsrapportVaerdier {
  revenue: number | null;
  gross_profit: number | null;
  cogs: number | null;
  payroll: number | null;
  depreciation: number | null;
  admin_costs: number | null;
  ebt: number | null;
  cash: number | null;
  equity: number | null;
}

export type AfvisningsGrund =
  | "for_faa_felter"
  | "brutto_stemmer_ikke"
  | "regnestykket_lukker_ikke"
  | "omkostninger_ikke_udtrukket";

export type AarsrapportNormalisering =
  | { ok: true; vaerdier: AarsrapportVaerdier; noter: string[] }
  | {
      ok: false;
      grund: AfvisningsGrund;
      beregnet: number | null;
      forventet: number | null;
      afvigelse: number | null;
    };

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Regel 2 som selvstændig dom: mangler omsætningen? Sand for null,
 * undefined, NaN og 0 (inkl. -0) — et nul er ikke en måling. Målt
 * eksempel: YKRG 2024 står med revenue 0 i alle tolv måneder; enhver
 * margin på det år dividerer med nul.
 */
export function manglerOmsaetning(v: number | null | undefined): boolean {
  return v == null || Number.isNaN(v) || v === 0;
}

/** Omkostningsnøgle: positiv konvention, null når feltet mangler. */
const absEllerNull = (v: number | null | undefined): number | null => {
  const n = num(v);
  return n === null ? null : Math.abs(n);
};

export function normaliserAarsrapport(
  input: AarsrapportInput,
): AarsrapportNormalisering {
  const noter: string[] = [];

  // Regel 2: et nul er ikke en måling (manglerOmsaetning bærer dommen).
  const revenueRaa = num(input.revenue);
  let revenue = revenueRaa;
  if (revenueRaa !== null && manglerOmsaetning(revenueRaa)) {
    revenue = null;
    noter.push("revenue 0 behandlet som manglende: et nul er ikke en måling");
  }

  // Regel 1: de fire omkostningsnøgler gøres positive. Intet andet røres.
  const cogs = absEllerNull(input.cogs);
  const payroll = absEllerNull(input.payroll);
  const depreciation = absEllerNull(input.depreciation);
  const adminCosts = absEllerNull(input.admin_costs);

  const grossProfit = num(input.gross_profit);
  const ebtRaa = num(input.ebt);

  // Uden dækningsbidrag og resultatlinje kan intet regnestykke lukkes.
  if (grossProfit === null || ebtRaa === null) {
    return {
      ok: false,
      grund: "for_faa_felter",
      beregnet: null,
      forventet: null,
      afvigelse: null,
    };
  }

  // Regel 5: gulvet absorberer afrunding; 5 % skalerer med resultatet.
  const tolerance = Math.max(Math.abs(ebtRaa) * 0.05, 500);

  // Invariant 1: revenue − |cogs| ≈ gross_profit. Egen tolerance,
  // skaleret efter det tal invarianten måler — ikke efter ebt.
  if (revenue !== null && cogs !== null) {
    const bruttoTolerance = Math.max(Math.abs(grossProfit) * 0.05, 500);
    const bruttoBeregnet = revenue - cogs;
    const bruttoAfvigelse = Math.abs(bruttoBeregnet - grossProfit);
    if (bruttoAfvigelse > bruttoTolerance) {
      return {
        ok: false,
        grund: "brutto_stemmer_ikke",
        beregnet: bruttoBeregnet,
        forventet: grossProfit,
        afvigelse: bruttoAfvigelse,
      };
    }
  }

  // Invariant 2: gross_profit − opex ≈ ±ebt. cogs indgår ikke —
  // dækningsbidraget er allerede efter vareforbrug. Manglende
  // omkostningsfelter tæller som 0 (ærligt fravær, ikke et gæt).
  const beregnet =
    grossProfit - (payroll ?? 0) - (depreciation ?? 0) - (adminCosts ?? 0);
  const afvigelseUaendret = Math.abs(beregnet - ebtRaa);
  const afvigelseVendt = Math.abs(beregnet - -ebtRaa);

  const lukkerUaendret = afvigelseUaendret <= tolerance;
  // Skærpet bevis for vending: rene 5 % uden gulv (se filkommentaren).
  const lukkerVendt = afvigelseVendt <= Math.abs(ebtRaa) * 0.05;

  let ebt = ebtRaa;
  if (lukkerUaendret) {
    // Uændret. Rækkefølgen er bevidst: uændret prøves før vending.
    // Efter skærpelsen af vendings-beviset kan begge grene kun lukke
    // samtidig når ebt er 0, hvor −0 og 0 er samme tal — værnet er
    // altså gratis og uobserverbart, ikke en beskyttelse mod en
    // situation der kan opstå. Det står her for at fastholde
    // rækkefølgen, hvis tolerancerne senere løsnes.
  } else if (lukkerVendt) {
    ebt = -ebtRaa;
    noter.push("resultatlinjen vendt: dokumentet er kreditnegativt");
  } else {
    // Skeln "ingen omkostningstal at regne med" fra "tallene stemmer
    // ikke" — en grund der beskriver noget andet end det der skete,
    // kan ikke tælles.
    const ingenOmkostninger =
      cogs === null &&
      payroll === null &&
      depreciation === null &&
      adminCosts === null;
    return {
      ok: false,
      grund: ingenOmkostninger
        ? "omkostninger_ikke_udtrukket"
        : "regnestykket_lukker_ikke",
      beregnet,
      forventet: ebtRaa,
      afvigelse: afvigelseUaendret,
    };
  }

  return {
    ok: true,
    vaerdier: {
      revenue,
      gross_profit: grossProfit,
      cogs,
      payroll,
      depreciation,
      admin_costs: adminCosts,
      ebt,
      cash: num(input.cash),
      equity: num(input.equity),
    },
    noter,
  };
}
