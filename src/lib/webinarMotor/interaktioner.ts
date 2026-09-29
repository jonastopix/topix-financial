/**
 * webinarMotor/interaktioner — hvad vises hvornår, sande nedtællinger, og
 * skemaerne for indhold og svar (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/interaktioner.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * TIDSPUNKTET REGNES AF SERVERENS forventede position, aldrig af afspillerens:
 * alle ser kortet samtidig, og en, der spoler, udløser intet før tid.
 * Tidslinjen læses af sessionens FROSNE snapshot, så en redigering midt i en
 * session ikke ændrer, hvad seerne ser.
 */

export const INTERAKTION_ARTER = ["cta", "feedback", "poll", "quiz", "spoergsmaal_prompt", "reaktion", "haand", "ressource", "kapitel"] as const;
export type InteraktionArt = (typeof INTERAKTION_ARTER)[number];

export const PLACERINGER = ["overlay", "sidepanel", "exitrum"] as const;
export type Placering = (typeof PLACERINGER)[number];

/** Nedtællingens kilder — noget, VI selv ejer (spec §A6.1). Et opdigtet «udløber om 09:59» findes ikke. */
export const UDLOEBER_KILDER = ["session_slut", "optag_frist", "naeste_session"] as const;
export type UdloeberKilde = (typeof UDLOEBER_KILDER)[number];

export interface Interaktion {
  id: string;
  art: InteraktionArt;
  vis_fra_sek: number;
  vis_til_sek: number | null;
  placering: Placering;
  indhold: Record<string, unknown>;
  betingelse: Record<string, unknown> | null;
  udloeber_kilde: UdloeberKilde | null;
}

export interface Tidslinje {
  version: number;
  interaktioner: Interaktion[];
}

// ── Hvad er aktivt nu ────────────────────────────────────────────────────────

export interface Kontekst {
  /** Seerens egne svar: interaktion_id → svar-objektet. */
  svar: Readonly<Record<string, unknown>>;
  /** Seerens set_procent lige nu (serverens tal). */
  setProcent: number;
}

const erObjekt = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Betingelsen — KUN to regler (spec §A6), og en ukendt betingelse viser INTET
 * (fail-closed):
 *   { efter_svar: { interaktion_id, valg } } — seeren valgte `valg` på interaktionen
 *   { min_set_procent: N }                   — seeren har set mindst N %
 */
export function betingelseOpfyldt(betingelse: Record<string, unknown> | null, k: Kontekst): boolean {
  if (betingelse === null) return true;
  const noegler = Object.keys(betingelse);
  if (noegler.length !== 1) return false;
  if (noegler[0] === "min_set_procent") {
    const n = betingelse.min_set_procent;
    return typeof n === "number" && n >= 0 && n <= 100 && k.setProcent >= n;
  }
  if (noegler[0] === "efter_svar") {
    const e = betingelse.efter_svar;
    if (!erObjekt(e) || typeof e.interaktion_id !== "string" || typeof e.valg !== "number") return false;
    const svar = k.svar[e.interaktion_id];
    if (!erObjekt(svar)) return false;
    const valg = svar.valg;
    return valg === e.valg || (Array.isArray(valg) && valg.includes(e.valg));
  }
  return false;
}

/** Er interaktionen på skærmen i dette rum, på denne position? (Uden betingelsen.) */
export function iVindue(i: Interaktion, rum: string, posSek: number): boolean {
  if (i.art === "kapitel") return false;
  if (i.placering === "exitrum") return rum === "exitrum";
  if (rum !== "afspilning") return false;
  return i.vis_fra_sek <= posSek && (i.vis_til_sek === null || posSek < i.vis_til_sek);
}

/** De aktive interaktioner, ordnet efter tidskode. Kapitler er agendaen og står i `kapitler`. */
export function aktiveInteraktioner(t: Tidslinje | null, rum: string, forventetPosSek: number, k: Kontekst): Interaktion[] {
  if (!t) return [];
  return t.interaktioner
    .filter((i) => iVindue(i, rum, forventetPosSek) && betingelseOpfyldt(i.betingelse, k))
    .sort((a, b) => a.vis_fra_sek - b.vis_fra_sek || a.id.localeCompare(b.id));
}

/** Agendaen — kapitlerne i rækkefølge. Ikke en søgebjælke. */
export function kapitler(t: Tidslinje | null): Array<{ id: string; fraSek: number; titel: string }> {
  if (!t) return [];
  return t.interaktioner
    .filter((i) => i.art === "kapitel")
    .map((i) => ({ id: i.id, fraSek: i.vis_fra_sek, titel: typeof i.indhold.titel === "string" ? i.indhold.titel : "" }))
    .sort((a, b) => a.fraSek - b.fraSek);
}

/** Et svar modtages, mens interaktionen er aktiv, og op til så mange sekunder efter (nettet kan hakke). */
export const SVAR_NAADE_SEK = 30;

/**
 * Må et svar på interaktionen modtages nu? Aktiv nu, eller højst 30 s efter
 * vis_til. Exitrummets interaktioner (feedback) modtages i exitrummet OG
 * bagefter — en, der skriver langsomt, skal ikke miste sit svar, fordi rummet
 * lukkede.
 */
export function svarKanModtages(i: Interaktion, rum: string, posSek: number): boolean {
  if (i.art === "kapitel") return false;
  if (i.placering === "exitrum") return rum === "exitrum" || rum === "afsluttet";
  if (rum === "exitrum" || rum === "afsluttet") return i.vis_til_sek === null;
  if (rum !== "afspilning") return false;
  if (posSek < i.vis_fra_sek) return false;
  return i.vis_til_sek === null || posSek < i.vis_til_sek + SVAR_NAADE_SEK;
}

// ── Nedtællingen — kun sand ──────────────────────────────────────────────────

export interface NedtaellingsKilder {
  /** Exitrummets slut (Morten svarer, indtil rummet lukker). */
  sessionSlutMs: number;
  /** Næste planlagte session, hvis der er en. */
  naesteSessionMs: number | null;
  /** En optagsfrist fra app_config, hvis der er en. */
  optagFristMs: number | null;
}

export type CtaVindue =
  | { nedtaelling: { udloeberMs: number; kilde: UdloeberKilde }; grund: "ok" }
  | { nedtaelling: null; grund: "ingen_nedtaelling" | "ingen_kilde" | "kilde_mangler_tid" | "udloebet" };

/**
 * ctaVindue NÆGTER en nedtælling uden en kilde. Kun når indholdet beder om en
 * (`nedtaelling: true`) OG interaktionen peger på en kilde, vi ejer, OG kilden
 * har et tidspunkt i fremtiden, gives en frist. Alt andet: ingen nedtælling.
 */
export function ctaVindue(i: Interaktion, kilder: NedtaellingsKilder, nuMs: number): CtaVindue {
  if (i.indhold.nedtaelling !== true) return { nedtaelling: null, grund: "ingen_nedtaelling" };
  if (i.udloeber_kilde === null || !(UDLOEBER_KILDER as readonly string[]).includes(i.udloeber_kilde)) {
    return { nedtaelling: null, grund: "ingen_kilde" };
  }
  const udloeberMs =
    i.udloeber_kilde === "session_slut" ? kilder.sessionSlutMs
    : i.udloeber_kilde === "naeste_session" ? kilder.naesteSessionMs
    : kilder.optagFristMs;
  if (udloeberMs === null || !Number.isFinite(udloeberMs)) return { nedtaelling: null, grund: "kilde_mangler_tid" };
  if (udloeberMs <= nuMs) return { nedtaelling: null, grund: "udloebet" };
  return { nedtaelling: { udloeberMs, kilde: i.udloeber_kilde }, grund: "ok" };
}

// ── Skemaerne ────────────────────────────────────────────────────────────────

export const CTA_MAAL = ["ansoeg", "ikke_klar", "ressource", "link"] as const;
export const TEKST_MAKS = 2000;

const tekst = (x: unknown, min: number, maks: number): x is string => typeof x === "string" && x.trim().length >= min && x.length <= maks;
const valgListe = (x: unknown): x is string[] => Array.isArray(x) && x.length >= 2 && x.length <= 6 && x.every((v) => tekst(v, 1, 200));

export type Skemadom = { ok: true } | { ok: false; fejl: string };

/** Rådgiverens indhold pr. art — delt med serveren, så editoren og functionen afviser det samme. */
export function interaktionSkema(art: string, indhold: unknown): Skemadom {
  if (!(INTERAKTION_ARTER as readonly string[]).includes(art)) return { ok: false, fejl: "ukendt_art" };
  if (!erObjekt(indhold)) return { ok: false, fejl: "indhold_ikke_objekt" };
  const i = indhold;
  switch (art as InteraktionArt) {
    case "cta":
      if (!tekst(i.tekst, 1, 500) || !tekst(i.knap, 1, 80)) return { ok: false, fejl: "cta_tekst" };
      if (!(CTA_MAAL as readonly string[]).includes(i.maal as string)) return { ok: false, fejl: "cta_maal" };
      if (i.nedtaelling !== undefined && typeof i.nedtaelling !== "boolean") return { ok: false, fejl: "cta_nedtaelling" };
      return { ok: true };
    case "poll":
      if (!tekst(i.spoergsmaal, 1, 500) || !valgListe(i.valg)) return { ok: false, fejl: "poll" };
      return { ok: true };
    case "quiz":
      if (!tekst(i.spoergsmaal, 1, 500) || !valgListe(i.valg)) return { ok: false, fejl: "quiz" };
      if (typeof i.rigtigt !== "number" || !Number.isInteger(i.rigtigt) || i.rigtigt < 0 || i.rigtigt >= (i.valg as string[]).length) return { ok: false, fejl: "quiz_rigtigt" };
      return { ok: true };
    case "feedback":
    case "spoergsmaal_prompt":
      return tekst(i.spoergsmaal, 1, 500) ? { ok: true } : { ok: false, fejl: art };
    case "reaktion":
      return Array.isArray(i.emojis) && i.emojis.length >= 1 && i.emojis.length <= 6 && i.emojis.every((e) => tekst(e, 1, 16)) ? { ok: true } : { ok: false, fejl: "reaktion" };
    case "haand":
      return tekst(i.tekst, 1, 200) ? { ok: true } : { ok: false, fejl: "haand" };
    case "ressource":
      return tekst(i.titel, 1, 200) && tekst(i.sti, 1, 500) ? { ok: true } : { ok: false, fejl: "ressource" };
    case "kapitel":
      return tekst(i.titel, 1, 200) ? { ok: true } : { ok: false, fejl: "kapitel" };
  }
}

export type Svardom = { ok: true; svar: Record<string, unknown> } | { ok: false; fejl: string };

/**
 * Seerens svar på en interaktion — normaliseret, så kun kendte nøgler gemmes.
 *   poll       { valg: number[] } (ét eller flere, inden for listen)
 *   quiz       { valg: number } → gemmes med { rigtigt: boolean } regnet her
 *   feedback   { stjerner: 1–5, tekst? }
 *   spoergsmaal_prompt { tekst }
 *   cta        { maal: ansoeg | ikke_klar | ressource | link }
 * reaktion, haand, ressource og kapitel er ikke svar (reaktion og hånd har egne veje).
 */
export function doemSvar(i: Interaktion, svar: unknown): Svardom {
  if (!erObjekt(svar)) return { ok: false, fejl: "svar_ikke_objekt" };
  const antalValg = Array.isArray(i.indhold.valg) ? (i.indhold.valg as unknown[]).length : 0;
  const gyldigtValg = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < antalValg;
  switch (i.art) {
    case "poll": {
      const v = svar.valg;
      if (!Array.isArray(v) || v.length < 1 || v.length > antalValg || !v.every(gyldigtValg) || new Set(v).size !== v.length) return { ok: false, fejl: "poll_valg" };
      return { ok: true, svar: { valg: [...v].sort((a, b) => a - b) } };
    }
    case "quiz": {
      if (!gyldigtValg(svar.valg)) return { ok: false, fejl: "quiz_valg" };
      return { ok: true, svar: { valg: svar.valg, rigtigt: svar.valg === i.indhold.rigtigt } };
    }
    case "feedback": {
      const s = svar.stjerner;
      if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > 5) return { ok: false, fejl: "stjerner" };
      if (svar.tekst !== undefined && svar.tekst !== null && !tekst(svar.tekst, 0, TEKST_MAKS)) return { ok: false, fejl: "feedback_tekst" };
      const t = typeof svar.tekst === "string" ? svar.tekst.trim() : "";
      return { ok: true, svar: t ? { stjerner: s, tekst: t } : { stjerner: s } };
    }
    case "spoergsmaal_prompt":
      if (!tekst(svar.tekst, 1, TEKST_MAKS)) return { ok: false, fejl: "tekst" };
      return { ok: true, svar: { tekst: (svar.tekst as string).trim() } };
    case "cta":
      if (!(CTA_MAAL as readonly string[]).includes(svar.maal as string)) return { ok: false, fejl: "cta_maal" };
      return { ok: true, svar: { maal: svar.maal } };
    default:
      return { ok: false, fejl: "ikke_et_svar" };
  }
}

/** Snapshot'et fra databasen (jsonb) → Tidslinje. Rækker, skemaet afviser, tages ikke med. */
export function laesTidslinje(snapshot: unknown): Tidslinje | null {
  if (!erObjekt(snapshot) || typeof snapshot.version !== "number" || !Array.isArray(snapshot.interaktioner)) return null;
  const interaktioner: Interaktion[] = [];
  for (const r of snapshot.interaktioner) {
    if (!erObjekt(r) || typeof r.id !== "string" || typeof r.vis_fra_sek !== "number") continue;
    if (!(PLACERINGER as readonly string[]).includes(r.placering as string)) continue;
    if (!interaktionSkema(r.art as string, r.indhold).ok) continue;
    interaktioner.push({
      id: r.id,
      art: r.art as InteraktionArt,
      vis_fra_sek: r.vis_fra_sek,
      vis_til_sek: typeof r.vis_til_sek === "number" ? r.vis_til_sek : null,
      placering: r.placering as Placering,
      indhold: r.indhold as Record<string, unknown>,
      betingelse: erObjekt(r.betingelse) ? r.betingelse : null,
      udloeber_kilde: (UDLOEBER_KILDER as readonly string[]).includes(r.udloeber_kilde as string) ? (r.udloeber_kilde as UdloeberKilde) : null,
    });
  }
  return { version: snapshot.version, interaktioner };
}

/**
 * Interaktionen, som SEEREN får den: en quiz' rigtige svar og forklaring
 * sendes først, når seeren selv har svaret — ellers står facit i netværksfanen.
 */
export function somSeerSer(i: Interaktion, harSvaret: boolean): Omit<Interaktion, "betingelse"> {
  const { betingelse: _b, ...uden } = i;
  if (i.art !== "quiz" || harSvaret) return uden;
  const { rigtigt: _r, forklaring: _f, ...indhold } = i.indhold;
  return { ...uden, indhold };
}
