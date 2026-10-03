/**
 * Ansøgningen → den webinartilmelding, den kom fra (skive 4, 3/10-2026;
 * spec §A9, docs/webinarmotor.md §7.8).
 *
 * VEJEN: exitrummets knap åbner /ansoeg?kilde=webinar#wt=<deltagertoken>.
 * Fladen holder tokenet i sidens hukommelse (aldrig på enheden, aldrig i
 * URL'en efter mount) og sender det ÉN gang som det valgfrie body-felt
 * `webinar_token` ved «opret». Her verificeres det med husets prædikat —
 * `verifyDeltagertoken` fra _shared/webinarDeltagerAuth.ts, det ENESTE sted
 * join-secret'en læses (webinarMotor.guard dom 4) — og ansøgningen får tokenets tilmelding i
 * `ansoegninger.webinar_tilmelding_id`. Tokenet beviser personen: kun den, der
 * har linket fra sin egen tilmelding, kan koble en ansøgning til den.
 *
 * TOKENET GEMMES ALDRIG. Det eneste, der skrives, er tilmeldingens id
 * (`KOBLINGS_KOLONNE`). Det logges heller ikke — kun udfaldet og grunden.
 *
 * FAIL-SOFT, SOM ANNONCESPORET: en EGEN update efter insert'en. Et ugyldigt,
 * forfalsket eller tilbagekaldt token, en manglende secret, en manglende
 * kolonne (42703 — migrationen ikke kørt) eller en undtagelse giver et udfald,
 * ALDRIG en stoppet ansøgning. Funktionen kaster aldrig.
 *
 * Prædikatet gives IND (det rigtige i index.ts), så dommen kan prøves uden Deno.
 * NUL IMPORTS: klienten er en minimal strukturel type (KoblingsKlient), så
 * vitest/tsc kan læse filen — SupabaseClient opfylder den.
 */

/** Det, koblingen bruger af admin-klienten — SupabaseClient opfylder den strukturelt. */
// deno-lint-ignore no-explicit-any
export type KoblingsKlient = { from: (tabel: string) => any };

/** Svarfeltet `webinar_kobling` i «opret» — beviset for, at den nye kode kører. Ingen persondata. */
export const WEBINAR_KOBLING_UDFALD = ["koblet", "intet_token", "ugyldigt", "fejl"] as const;
export type WebinarKoblingUdfald = (typeof WEBINAR_KOBLING_UDFALD)[number];

/** Den ene kolonne, koblingen skriver. */
export const KOBLINGS_KOLONNE = "webinar_tilmelding_id";

/** Prædikatets form — verifyDeltagertoken i _shared/webinarDeltagerAuth.ts. */
export type DeltagerPraedikat = (
  token: unknown,
  // deno-lint-ignore no-explicit-any
  admin: any,
) => Promise<{ ok: true; deltager: { id: string } } | { ok: false; grund: string }>;

/**
 * Prædikatets grunde, der er VORES fejl (opsætning eller database) — «fejl».
 * Alle andre (form, aftryk, ukendt, version, ikke_platform) er tokenets — «ugyldigt».
 */
const SERVERGRUNDE: readonly string[] = ["ingen_secret", "opslag"];

export interface WebinarKobling {
  udfald: WebinarKoblingUdfald;
  /** Til loggen, aldrig til svaret: prædikatets grund, «kolonne_mangler», «update», «ingen_raekke», «undtagelse». */
  grund: string | null;
}

/** Intet token sendt: fraværende, null eller tom streng. Alt andet prøves (og et ikke-streng-token er ugyldigt). */
export function harWebinarToken(token: unknown): boolean {
  return !(token === undefined || token === null || (typeof token === "string" && token.trim() === ""));
}

/** Udfaldet af en prædikat-grund. */
export function udfaldAfGrund(grund: string): "ugyldigt" | "fejl" {
  return SERVERGRUNDE.includes(grund) ? "fejl" : "ugyldigt";
}

/**
 * Honningfeltets svar (opret uden en række): samme FORM som en rigtig oprettelse, men
 * prædikatet kaldes ikke — en bot skal hverken lære noget eller koste et opslag.
 */
export function udfaldUdenKobling(token: unknown): WebinarKoblingUdfald {
  return harWebinarToken(token) ? "ugyldigt" : "intet_token";
}

export async function koblWebinarTilmelding(
  admin: KoblingsKlient,
  ansoegningId: string,
  token: unknown,
  praedikat: DeltagerPraedikat,
): Promise<WebinarKobling> {
  if (!harWebinarToken(token)) return { udfald: "intet_token", grund: null };
  try {
    const dom = await praedikat(typeof token === "string" ? token.trim() : token, admin);
    if ("grund" in dom) return { udfald: udfaldAfGrund(dom.grund), grund: dom.grund };
    if (dom.ok !== true) return { udfald: "fejl", grund: "praedikat" };
    const { data, error } = await admin
      .from("ansoegninger")
      .update({ [KOBLINGS_KOLONNE]: dom.deltager.id })
      .eq("id", ansoegningId)
      .is(KOBLINGS_KOLONNE, null)
      .select("id");
    if (error) return { udfald: "fejl", grund: error.code === "42703" ? "kolonne_mangler" : "update" };
    if (!Array.isArray(data) || data.length === 0) return { udfald: "fejl", grund: "ingen_raekke" };
    return { udfald: "koblet", grund: null };
  } catch {
    return { udfald: "fejl", grund: "undtagelse" };
  }
}
