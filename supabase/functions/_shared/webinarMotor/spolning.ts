/**
 * webinarMotor/spolning — spoledommen (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i src/lib/webinarMotor/spolning.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * Kører i klienten ved hver `timeupdate` fra Bunnys player. Den afgør ALDRIG
 * hvad der er set — det gør serveren (puls.ts). Den holder kun afspilleren på
 * serverens ur: pause er tilladt, spoling er ikke (spec §A5, beslutning G4).
 */

/** Afspillerens tilstand, som klienten rapporterer den. */
export const AFSPILLER_TILSTANDE = ["lobby", "spiller", "pause", "buffer", "slut", "skjult"] as const;
export type AfspillerTilstand = (typeof AFSPILLER_TILSTANDE)[number];

/** Afvigelse, der aldrig rettes: under den er det bare netværk og afrunding. */
export const SPOLE_TOLERANCE_SEK = 3;
/** Højst én korrektion pr. så mange millisekunder — ellers kan en langsom forbindelse fanges i en søgeløkke. */
export const SPOLE_HYSTERESE_MS = 8000;

export type Spoledom =
  | { art: "ok" }
  | { art: "hop"; til: number; grund: "frem" | "bagud" }
  | { art: "vent"; grund: "buffer" | "hysterese" };

/**
 * forventet = serverens position (ur.positionDom, klientens ur rettet med urForskydning).
 * faktisk   = afspillerens getCurrentTime().
 *
 *   |faktisk − forventet| ≤ 3 s                     → ok
 *   under buffering                                 → vent (aldrig et hop)
 *   faktisk > forventet + 3 (spolet frem)           → hop til forventet
 *   faktisk < forventet − 3 og tilstanden er spiller → hop til forventet (bagud af afbrydelse)
 *   faktisk < forventet − 3 og tilstanden er pause   → ok (pausen er tilladt; «Tilbage til live» er seerens valg)
 *   seneste korrektion for under 8 s siden          → vent
 */
export function spoleDom(
  forventetSek: number,
  faktiskSek: number,
  tilstand: AfspillerTilstand,
  sidsteKorrektionMs: number | null,
  nuMs: number,
): Spoledom {
  const afvigelse = faktiskSek - forventetSek;
  if (Math.abs(afvigelse) <= SPOLE_TOLERANCE_SEK) return { art: "ok" };
  if (tilstand === "buffer") return { art: "vent", grund: "buffer" };
  const frem = afvigelse > 0;
  if (!frem && tilstand !== "spiller") return { art: "ok" };
  if (sidsteKorrektionMs !== null && nuMs - sidsteKorrektionMs < SPOLE_HYSTERESE_MS) return { art: "vent", grund: "hysterese" };
  return { art: "hop", til: forventetSek, grund: frem ? "frem" : "bagud" };
}
