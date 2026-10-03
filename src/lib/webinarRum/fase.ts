/**
 * webinarRum/fase — rummets ur og fase i SEERENS klient (skive 2, 30/9-2026).
 *
 * KUN KLIENTEN (ingen Deno-spejl): serveren ejer uret og sandheden
 * (webinarMotor/ur.ts:positionDom), og denne fil genbruger PRÆCIS den dom på
 * serverens tider, med klientens ur rettet af urForskydning. Klienten afgør
 * aldrig, hvad der er set — kun hvad der VISES, og hvornår tilstanden skal
 * hentes igen (en grænse er krydset: lobby → afspilning skal have en signeret
 * embed, som serveren kun giver i intro og afspilning).
 *
 * Tiden gives ind (`nuMs`) — aldrig Date.now() indeni.
 */
import { positionDom, type Position, type Rum, type SessionUr, senIndgangDom } from "@/lib/webinarMotor/ur";

/** Tiderne, som webinar-rum «tilstand» svarer med (ISO, UTC). */
export interface RumTider {
  lobby_aabner_at: string;
  starter_at: string;
  afspilning_start_at: string;
  afspilning_slut_at: string;
  exitrum_slut_at: string;
}

/**
 * Sessionens ur bygget tilbage fra serverens fem tider — så positionDom kan
 * regnes lokalt hvert sekund uden et kald:
 *   intro_sek    = (afspilning_start − starter) / 1000
 *   varighed_sek = (afspilning_slut − afspilning_start) / 1000
 *   lobby_min    = (starter − lobby_aabner) / 60 000
 *   exitrum_min  = (exitrum_slut − afspilning_slut) / 60 000
 * Ugyldige tider giver null (siden viser da serverens eget rum).
 */
export function urFraTider(t: RumTider, aflyst: boolean): SessionUr | null {
  const lobby = Date.parse(t.lobby_aabner_at);
  const start = Date.parse(t.starter_at);
  const aStart = Date.parse(t.afspilning_start_at);
  const aSlut = Date.parse(t.afspilning_slut_at);
  const eSlut = Date.parse(t.exitrum_slut_at);
  if (![lobby, start, aStart, aSlut, eSlut].every(Number.isFinite)) return null;
  if (!(lobby <= start && start <= aStart && aStart < aSlut && aSlut <= eSlut)) return null;
  return {
    starterMs: start,
    introSek: (aStart - start) / 1000,
    varighedSek: (aSlut - aStart) / 1000,
    lobbyMin: (start - lobby) / 60_000,
    exitrumMin: (eSlut - aSlut) / 60_000,
    status: aflyst ? "aflyst" : null,
  };
}

/** Serverens ur, set fra klienten: klientens ur + forskydningen (urForskydning). */
export const serverNu = (lokalMs: number, forskydningMs: number): number => lokalMs + forskydningMs;

/** Rum og position lige nu — serverens dom på serverens tid. */
export function lokalPosition(ur: SessionUr, lokalMs: number, forskydningMs: number): Position {
  return positionDom(ur, serverNu(lokalMs, forskydningMs));
}

/** Højst så meget flytter en ny måling forskydningen ad gangen (spec §A5: glattes med ±250 ms). */
export const GLAT_SKRIDT_MS = 250;
/** En afvigelse over dette er ikke støj, men et nyt ur (telefonen stillede sig selv) — så springer vi. */
export const SPRING_OVER_MS = 5000;

/**
 * Forskydningen efter en ny måling: den første gælder straks; derefter flyttes
 * den højst ±250 ms pr. måling, så seerens position ikke hopper af netstøj —
 * medmindre afvigelsen er over 5 s (så var det uret, ikke nettet).
 */
export function glatForskydning(gammel: number | null, ny: number): number {
  if (gammel === null || !Number.isFinite(gammel)) return Math.round(ny);
  const d = ny - gammel;
  if (Math.abs(d) > SPRING_OVER_MS) return Math.round(ny);
  return Math.round(gammel + Math.max(-GLAT_SKRIDT_MS, Math.min(GLAT_SKRIDT_MS, d)));
}

// ── Hvad skærmen viser ───────────────────────────────────────────────────────

export const VISNINGER = ["venter", "vaerelse", "sen_indgang", "gaa_ind", "live", "exitrum", "afsluttet", "aflyst"] as const;
export type Visning = (typeof VISNINGER)[number];

export interface FaseInd {
  rum: Rum;
  /** senIndgangDom's svar på positionen, da seeren kom — null uden for afspilningen. */
  kanNaaSet: boolean | null;
  /** Seeren har valgt «Se med alligevel». */
  seAlligevel: boolean;
  /** Seeren er gået ind (et tryk — eller var i venteværelset, da det begyndte). */
  gaaetInd: boolean;
}

/**
 * Fasen på skærmen:
 *   foer_lobby → venter          (rummet åbner kl. …)
 *   lobby      → vaerelse        (nedtælling, tjekliste)
 *   intro/afspilning:
 *     ikke gået ind, afspilning, kan ikke nå «set», ikke valgt alligevel → sen_indgang
 *     ikke gået ind                                                     → gaa_ind (et tryk: lyd kræver en gestus)
 *     ellers                                                            → live
 *   exitrum → exitrum · afsluttet → afsluttet · aflyst → aflyst
 * En, der ER gået ind, får aldrig sen-indgangs-skærmen bagefter.
 */
export function visningsFase(f: FaseInd): Visning {
  switch (f.rum) {
    case "aflyst": return "aflyst";
    case "foer_lobby": return "venter";
    case "lobby": return "vaerelse";
    case "exitrum": return "exitrum";
    case "afsluttet": return "afsluttet";
    case "intro":
    case "afspilning":
      if (!f.gaaetInd && f.rum === "afspilning" && f.kanNaaSet === false && !f.seAlligevel) return "sen_indgang";
      return f.gaaetInd ? "live" : "gaa_ind";
  }
}

/**
 * Sad seeren i venteværelset, da det begyndte, er hun gået ind («Hold fanen
 * åben — webinaret starter af sig selv»). Et nyt tryk ville bryde løftet.
 */
export function gaarIndAfSigSelv(forrige: Visning | null, nyRum: Rum): boolean {
  return forrige === "vaerelse" && (nyRum === "intro" || nyRum === "afspilning");
}

/** Sen indgang dømt på den lokale position (serverens dom — kun i afspilningen). */
export function senIndgang(pos: Position, varighedSek: number): boolean | null {
  return pos.rum === "afspilning" ? senIndgangDom(pos.forventetPosSek, varighedSek).kanNaaSet : null;
}

/**
 * Skal «tilstand» hentes igen? Når rummet, siden sidst blev hentet, har krydset
 * en grænse: embed-URL'en signeres kun i intro og afspilning, intro → afspilning
 * skifter video, og exitrummets kort hører til et andet rum.
 */
export function skalHenteTilstand(hentetRum: Rum | null, rumNu: Rum): boolean {
  return hentetRum !== null && hentetRum !== rumNu;
}
