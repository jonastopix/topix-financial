/**
 * src/lib/maanedsnoegle.ts — spejl af supabase/functions/_shared/maanedsnoegle.ts
 * (16/9, instruks F): «hvilken måned er det i Danmark, er en periode
 * afsluttet, og hvilke tre måneder er de seneste afsluttede?»
 *
 * Enhver ændring her SKAL også laves i _shared-udgaven; pariteten låses af
 * src/lib/__tests__/maanedsnoegleParitet.test.ts (funktionerne OG kildeteksten
 * efter filhovedet). Begrundelserne (regel 6 i dansk tid, grænserne kl.
 * 00:00–02:00) står i _shared-udgavens filhoved.
 */

export const TZ = "Europe/Copenhagen";

/** "YYYY-MM" for et tidspunkt set fra Danmark. sv-SE giver ISO-formen. */
export function maanedsNoegleKbh(nu: Date): string {
  return nu.toLocaleDateString("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit" }).slice(0, 7);
}

/** Er perioden (YYYY-MM) afsluttet set fra Danmark? Indeværende og fremtidige måneder er det ikke. */
export function erMaanedAfsluttet(periodKey: string | null | undefined, nu: Date): boolean {
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) return false;
  return periodKey < maanedsNoegleKbh(nu);
}

// ── De seneste afsluttede måneder ved navn (instruks F, 16/9) ──────────────
//
// «De nye skal starte med juni–august» (Jonas 15/9: i platformen, ikke i
// webinaret). Teksterne — tjeklistens «Dine tal», /rapportering, kortet
// for en måned der ikke er omme, mail A og mail C — nævner de tre seneste
// AFSLUTTEDE måneder ved navn, regnet fra samme danske nøgle som regel 6.
// 22/9-2026 → «juni, juli og august»; 1/10-2026 → «juli, august og
// september»; 5/1-2027 → «oktober, november og december». Aldrig
// hardkodede måneder, ingen ny tidszonelogik: nøglen ovenfor er den ene.

/** Månedsnavnene som de står i en sætning (små bogstaver). */
export const MAANEDSNAVNE = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
] as const;

/** Hvor mange afsluttede måneder der bedes om — samme tal som rapporteringens HISTORIK_MAANEDER. */
export const AFSLUTTEDE_MAANEDER_ANTAL = 3;

/** De `antal` afsluttede måneder FØR nøglen (nøglen = indeværende måned), ældste først. Ugyldig nøgle → tom liste. */
export function afsluttedeMaanederFoer(noegle: string, antal: number = AFSLUTTEDE_MAANEDER_ANTAL): string[] {
  if (!/^\d{4}-\d{2}$/.test(noegle)) return [];
  let aar = Number(noegle.slice(0, 4));
  let md = Number(noegle.slice(5, 7));
  if (md < 1 || md > 12) return [];
  const ud: string[] = [];
  for (let i = 0; i < antal; i++) {
    md -= 1;
    if (md === 0) {
      md = 12;
      aar -= 1;
    }
    ud.unshift(`${aar}-${String(md).padStart(2, "0")}`);
  }
  return ud;
}

/** De `antal` seneste afsluttede måneder set fra Danmark nu, ældste først. */
export function senesteAfsluttedeMaaneder(nu: Date, antal: number = AFSLUTTEDE_MAANEDER_ANTAL): string[] {
  return afsluttedeMaanederFoer(maanedsNoegleKbh(nu), antal);
}

/** «2026-06» → «juni»; ugyldig nøgle → null. */
export function maanedsnavn(noegle: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(noegle)) return null;
  return MAANEDSNAVNE[Number(noegle.slice(5, 7)) - 1] ?? null;
}

/** Dansk opremsning: «juni, juli og august»; én: «august»; ingen: tom streng. */
export function maanedsliste(noegler: readonly string[]): string {
  const navne = noegler.map(maanedsnavn).filter((n): n is string => n !== null);
  if (navne.length === 0) return "";
  if (navne.length === 1) return navne[0];
  return `${navne.slice(0, -1).join(", ")} og ${navne[navne.length - 1]}`;
}

/** «juni, juli og august» regnet fra en måneds-nøgle (fladens egen nu-nøgle, reportCardView). */
export function afsluttedeMaanederTekstFoer(noegle: string, antal: number = AFSLUTTEDE_MAANEDER_ANTAL): string {
  return maanedsliste(afsluttedeMaanederFoer(noegle, antal));
}

/** «juni, juli og august» regnet fra `nu` i dansk tid — den ene hjælper teksterne bruger. */
export function afsluttedeMaanederTekst(nu: Date, antal: number = AFSLUTTEDE_MAANEDER_ANTAL): string {
  return maanedsliste(senesteAfsluttedeMaaneder(nu, antal));
}
