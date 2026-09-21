/**
 * Kolonnerne hentningen beder om, og dommen om hvornår et svar betyder
 * «kolonnen findes ikke endnu» (udkast 19/9-2026).
 *
 * Her, ikke i hooken: det er rene funktioner, de afgør om siden virker FØR
 * migration 20260919150000 er kørt i Lovable, og de skal kunne testes uden
 * at rejse en Supabase-klient (hook = I/O, lib = dom).
 */

/**
 * Annoncesporets kolonner (migration 20260919150000_webinar_annoncespor.sql).
 * Står her OG i migrationen; kildeværnet webinarFlade.guard holder de to
 * lister ens, så en kolonne ikke kan tilføjes ét sted og glemmes det andet.
 * `by` er et reserveret ord i SQL — PostgREST tager det uden citationstegn.
 */
export const ANNONCESPOR_KOLONNER = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "origin", "first_origin", "referrer", "first_referrer",
  "widget_source", "by", "land", "enhed", "tidszone",
] as const;

/**
 * De UDLEDTE kolonner (migration 20260921130000): ikke en del af annoncesporet
 * (det, eWebinar gav os), men det, vi selv har regnet ud af det — ad_id
 * oversat af annoncens navn. Egen liste, fordi de kan mangle hver for sig:
 * hentningen prøver først med begge, så uden de udledte, så uden sporet.
 */
export const UDLEDTE_KOLONNER = ["ad_id_udledt"] as const;

const somFelter = (kolonner: string): string[] => kolonner.split(",").map((k) => k.trim()).filter((k) => k !== "");

/** Grundkolonnerne: den givne liste MINUS annoncesporet. */
export function udenAnnoncespor(kolonner: string): string {
  const spor = new Set<string>(ANNONCESPOR_KOLONNER);
  return somFelter(kolonner).filter((k) => !spor.has(k)).join(", ");
}

/** Med annoncesporet — hver kolonne præcis én gang, også hvis listen allerede har det. */
export function medAnnoncespor(kolonner: string): string {
  return [...somFelter(udenAnnoncespor(kolonner)), ...ANNONCESPOR_KOLONNER].join(", ");
}

/** Den givne liste MINUS de udledte kolonner. */
export function udenUdledte(kolonner: string): string {
  const u = new Set<string>(UDLEDTE_KOLONNER);
  return somFelter(kolonner).filter((k) => !u.has(k)).join(", ");
}

/** Med de udledte kolonner — hver præcis én gang. */
export function medUdledte(kolonner: string): string {
  return [...somFelter(udenUdledte(kolonner)), ...UDLEDTE_KOLONNER].join(", ");
}

/**
 * PostgREST's svar når en kolonne i select'en ikke findes. Postgres-koden er
 * 42703; beskeden nævner kolonnen. Koden tjekkes FØRST og beskeden kun som
 * fallback — en netværksfejl eller en rettighedsfejl må ALDRIG læses som
 * «kolonnen mangler» og udløse en genhentning uden sporet, for så ville
 * fladen vise et halvt svar der ligner et helt.
 */
export function erUkendtKolonne(fejl: { code?: string; message?: string } | null | undefined): boolean {
  if (!fejl) return false;
  if (typeof fejl.code === "string" && fejl.code !== "") return fejl.code === "42703";
  const besked = fejl.message ?? "";
  return /does not exist/i.test(besked) && /column/i.test(besked);
}
