/**
 * CVR-dagsloftet: hvor det kommer fra, og hvornår der skal siges til
 * (udkast 19/9-2026, efter recon-boelgen-2 §3).
 *
 * FUNDET DER GJORDE DET NØDVENDIGT: opslaget sker på ansøgningsformularens
 * FØRSTE skærm, og mailadressen kommer først på den sjette. De tyve opslag
 * bruges altså af folk, vi hverken kender navnet på eller kan skrive til —
 * og med 597 tilmeldte til ét webinar er tyve ikke mange. To ting manglede:
 * et loft Jonas kan hæve UDEN en udrulning, og en besked FØR det er brugt op.
 *
 * TRE KILDER, I DENNE RÆKKEFØLGE:
 *   1. app_config['ansoegning_cvr_dagsloft'] — husets konfigurationstabel.
 *      Sættes med én linje SQL i Lovable; ingen udrulning, ingen secret, og
 *      værdien kan ses og revideres i basen bagefter.
 *   2. secret'en ANSOEGNING_CVR_DAGSLOFT — den eksisterende vej, bevaret så
 *      en opsætning der allerede virker, ikke holder op med at virke.
 *   3. DAGSLOFT_STANDARD — koden, som før.
 *
 * ET UBRUGELIGT TAL MÅ ALDRIG SLUKKE LOFTET. Den gamle linje var
 * `Number(Deno.env.get(...) ?? String(STANDARD))`: en tastefejl i secret'en
 * gav NaN, og `brugt >= NaN` er ALTID falsk — loftet forsvandt lydløst, og
 * kvoten kunne tømmes på én aften. Derfor validerer `laesLoft` hver kilde
 * (helt tal, over nul, under et fornuftigt maksimum) og springer en ubrugelig
 * værdi over med en log, i stedet for at lade den vinde.
 *
 * ADVARSLEN VED 80 %: dommen `doemLoft` siger «fri», «advarsel» eller
 * «ramt». Advarslen findes, fordi en besked EFTER loftet er brugt op ikke er
 * en advarsel — den er en obduktion. Ved 16 af 20 kan I nå at hæve tallet,
 * mens webinaret stadig kører.
 *
 * Ren dom, ingen Deno-globaler: env og basen gives ind, så alt kan prøves i
 * vitest.
 */

/** app_config-nøglen. Står også i migrationen — kildeværnet holder de to ens. */
export const LOFT_NOEGLE = "ansoegning_cvr_dagsloft";

/** Secret'en, der stadig virker, hvis den er sat. */
export const LOFT_SECRET = "ANSOEGNING_CVR_DAGSLOFT";

/**
 * Loftet, når intet andet er sat. Regnestykket (18/9): DataCVR's betalte plan
 * er 1.500 opslag/md. ≈ 50/dag, delt med berig-virksomheder (20 pr. kørsel),
 * importen og Monday: 50 − 20 − 10 i reserve = 20 til ansøgningerne.
 */
export const DAGSLOFT_STANDARD = 20;

/**
 * Øvre grænse for hvad en konfigureret værdi må være. Ikke en mening om
 * DataCVR's plan, men et værn: et loft på en million er i praksis ingen loft,
 * og det er lettere at taste en nul for meget end at opdage det bagefter.
 */
export const LOFT_MAKS = 5000;

/** Andelen hvor rådgiverne får besked, mens der stadig er plads. */
export const ADVARSEL_ANDEL = 0.8;

export type LoftKilde = "app_config" | "secret" | "standard";

export interface LoftSvar {
  loft: number;
  kilde: LoftKilde;
  /** Værdier der blev sprunget over, og hvorfor — så en tastefejl kan ses i loggen. */
  afvist: Array<{ kilde: LoftKilde; vaerdi: string; grund: string }>;
}

/**
 * Er værdien brugbar som et loft? Heltal, over nul, højst LOFT_MAKS.
 * Alt andet — tom, tekst, komma, negativ, uendelig — er ubrugeligt.
 */
export function laesTal(raa: unknown): { ok: true; tal: number } | { ok: false; grund: string } {
  if (raa === null || raa === undefined) return { ok: false, grund: "ikke sat" };
  if (typeof raa === "boolean") return { ok: false, grund: "er et ja/nej, ikke et tal" };
  const s = typeof raa === "number" ? String(raa) : String(raa).trim();
  if (s === "") return { ok: false, grund: "tom" };
  if (!/^\d+$/.test(s)) return { ok: false, grund: "ikke et helt tal" };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { ok: false, grund: "for stort til at være et tal" };
  if (n <= 0) return { ok: false, grund: "skal være over nul" };
  if (n > LOFT_MAKS) return { ok: false, grund: `over maksimum (${LOFT_MAKS})` };
  return { ok: true, tal: n };
}

/**
 * Vælg loftet af de tre kilder. `appConfig` er værdien fra
 * app_config.config_value (jsonb — kan være tallet 20, teksten "20" eller
 * objektet { vaerdi: 20 }); `secret` er env-strengen.
 */
export function vaelgLoft(appConfig: unknown, secret: string | null | undefined): LoftSvar {
  const afvist: LoftSvar["afvist"] = [];
  const fraConfig = appConfig !== null && appConfig !== undefined && typeof appConfig === "object" && !Array.isArray(appConfig)
    ? (appConfig as Record<string, unknown>).vaerdi
    : appConfig;
  for (const [kilde, raa] of [["app_config", fraConfig], ["secret", secret]] as const) {
    if (raa === null || raa === undefined || raa === "") continue;
    const d = laesTal(raa);
    // `=== true` / `=== false`, ikke `if (d.ok)`: repoets tsconfig har strict
    // slået fra, og uden strictNullChecks indsnævrer et bart boolean-felt ikke
    // en diskrimineret union. deno check (som ER strict) er tilfreds med begge;
    // tsc er ikke, og det er tsc der kører i CI.
    if (d.ok === true) return { loft: d.tal, kilde, afvist };
    if (d.ok === false) afvist.push({ kilde, vaerdi: String(raa).slice(0, 40), grund: d.grund });
  }
  return { loft: DAGSLOFT_STANDARD, kilde: "standard", afvist };
}

export type Lofttilstand = "fri" | "advarsel" | "ramt";

export interface Loftdom {
  tilstand: Lofttilstand;
  /** Opslag tilbage i dag; aldrig negativ. */
  resterende: number;
  /** brugt / loft, afkortet ved 1. */
  andel: number;
  /** Ved hvilket forbrug advarslen går. */
  advarselVed: number;
}

/**
 * Hvor er vi henne på dagens loft?
 *   fri       — under 80 %
 *   advarsel  — 80 % eller mere, men der er plads endnu
 *   ramt      — loftet er brugt op; der slås ikke op
 *
 * `brugt` er antal rigtige opslag i dag (cache-misses), som de tælles i
 * cvr_opslag_cache. Advarselsgrænsen rundes OP: med et loft på 20 går den
 * ved 16, og med et loft på 3 går den ved 3 — et lille loft har ingen
 * meningsfuld advarselszone, og så er det ærligere at sige det ved sidste
 * opslag end slet ikke at sige det.
 */
export function doemLoft(brugt: number, loft: number): Loftdom {
  const sikkertLoft = Number.isFinite(loft) && loft > 0 ? Math.floor(loft) : DAGSLOFT_STANDARD;
  const sikkertBrugt = Number.isFinite(brugt) && brugt > 0 ? Math.floor(brugt) : 0;
  const advarselVed = Math.max(1, Math.ceil(sikkertLoft * ADVARSEL_ANDEL));
  const resterende = Math.max(0, sikkertLoft - sikkertBrugt);
  const andel = Math.min(1, sikkertBrugt / sikkertLoft);
  const tilstand: Lofttilstand = sikkertBrugt >= sikkertLoft ? "ramt" : sikkertBrugt >= advarselVed ? "advarsel" : "fri";
  return { tilstand, resterende, andel, advarselVed };
}
