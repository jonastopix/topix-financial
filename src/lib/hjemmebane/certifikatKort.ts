/**
 * src/lib/hjemmebane/certifikatKort.ts — «Dit certifikat» på medlemmets forside
 * (2/10-2026 eftermiddag, «forsidens to sidste kort»). REN: ingen React, ingen
 * Supabase. Testet i __tests__/certifikatKort.test.ts; kildeværn
 * src/lib/__tests__/forsideKort.guard.test.ts.
 *
 * INGEN NY REGEL. Kortet læser HUSETS dom (lib/certifikat/dom.ts
 * `certifikatDom`, oven på pakkens `getCertificateStatus`) — samme dom som
 * menupunktet «Dit certifikat» og siden /certifikat. Hvem der er berettiget,
 * og hvornår området åbner, afgøres DÉR; her står kun kortets ord.
 *
 * DATOEN (kilden i data): companies.contract_start_date (DATE, læst som dansk
 * kalenderdato af laesDanskDato). Regnestykket står i format.ts og gentages
 * her, så det kan læses uden at slå op:
 *   twelveMonthDate = kontraktstart + 12 måneder (addMonths: 31/1 + 1 md = 28/29/2)
 *   unlockDate      = twelveMonthDate − 7 dage (UNLOCK_DAYS_BEFORE)
 *   daysUntilUnlock = round((unlockDate − copenhagenDate(nu)) / 86 400 000)
 *     — to LOKALE midnatter for to DANSKE kalenderdage; round (ikke floor)
 *     tager DST-døgnene på 23/25 timer. Eksempel: start 22/10-2025 →
 *     12 mdr. 22/10-2026 → åbner 15/10-2026; nu = 2/10-2026 kl. 12 dansk →
 *     13 dage.
 *   state           = «open» fra og med unlockDate (dansk dato), ellers «locked».
 * Kortet viser derfor ÅBNINGSDATOEN (unlockDate) og tallet til den — ikke
 * 12-månedersdatoen. Siden /certifikat skriver det samme («Åbner {unlockDate}»,
 * «klar om N dage») — de to flader må ikke sige to datoer. Ordene siger
 * «ugen før dine 12 måneder», fordi området åbner 7 dage før (sandt), ikke
 * «efter 12 måneder» (én uge forkert).
 *
 * `nu` gives IND til dommen (certifikatDom(input, nu)) — aldrig Date.now()
 * herinde; kortet selv regner ingen dato.
 *
 * TILSTANDE:
 *   - låst:  overskrift + nedtælling + dato (ingen link: der er intet at hente).
 *   - klar:  link til /certifikat — både «ny» (aldrig hentet) og «åben» (hentet
 *            før) — området bliver åbent, også efter udløb (format.ts).
 *   - intet: dommen siger skjult (rådgiver, abonnent, udløbet, legat uden fuld
 *            tier, fravalg, ingen/ugyldig startdato), ELLER opslaget henter
 *            endnu, ELLER det fejlede. FAIL-CLOSED og uden blink: hellere intet
 *            kort end et forkert «låst» i et øjeblik.
 */
import type { CertifikatDom } from "@/lib/certifikat/dom";
import { formatDay } from "@/components/hjemmebane/certifikat/format";

/** Kortets tekster — ÉT sted. */
export const CERTIFIKAT_KORT = {
  eyebrow: "Dit certifikat",
  laastTitel: "Boardroom-certifikat · låst",
  klarTitel: "Boardroom-certifikat",
  klarLink: "Dit certifikat er klar — hent det",
  sti: "/certifikat",
} as const;

export type CertifikatKortVisning =
  | { tilstand: "laast"; titel: string; linje: string; dage: number; dato: string }
  | { tilstand: "klar"; titel: string; link: string; sti: string };

/** «om 1 dag» / «om N dage». */
export function omDage(n: number): string {
  return `om ${n} ${n === 1 ? "dag" : "dage"}`;
}

/** Den låste linje: «Åbner ugen før dine 12 måneders medlemskab — om N dage (d. 15. oktober 2026)». */
export function laastLinje(dage: number, dato: string): string {
  return `Åbner ugen før dine 12 måneders medlemskab — ${omDage(dage)} (d. ${dato})`;
}

export interface CertifikatKortInput {
  /** useCertificate().loading — mens det henter: intet kort. */
  loading: boolean;
  /** useCertificate().fejl — en fejl er ikke et nej, men kortet viser intet. */
  fejl: string | null;
  /** Husets dom (certifikatDom). */
  dom: CertifikatDom | null | undefined;
}

export function certifikatKort(i: CertifikatKortInput): CertifikatKortVisning | null {
  if (i.loading || i.fejl || !i.dom) return null;
  if (i.dom.synlig === false) return null;
  const s = i.dom.status;
  if (s.state === "open") {
    return { tilstand: "klar", titel: CERTIFIKAT_KORT.klarTitel, link: CERTIFIKAT_KORT.klarLink, sti: CERTIFIKAT_KORT.sti };
  }
  if (s.state !== "locked") return null;
  // Låst betyder i dag < åbningsdatoen, så tallet er ≥ 1. Et 0 her ville være
  // en dom i utakt med sig selv — fail-closed: intet kort.
  if (!Number.isInteger(s.daysUntilUnlock) || s.daysUntilUnlock < 1) return null;
  const dato = formatDay(s.unlockDate);
  return { tilstand: "laast", titel: CERTIFIKAT_KORT.laastTitel, linje: laastLinje(s.daysUntilUnlock, dato), dage: s.daysUntilUnlock, dato };
}

// ── Linjen på forsidens Score-kort (docs/forside-v3.md §3, 2/10-2026) ─────────
/**
 * Score-kortets certifikat-input. `{ dageTil }` = låst med N dage til
 * åbningsdatoen; `{ klar: true }` = området er åbent. null = ingen linje.
 * Afledes af husets dom gennem certifikatKort → certifikatTilScore — her
 * regnes ingen dato.
 */
export type CertifikatScore = { dageTil: number } | { klar: true } | null;

/** Kortets visning (certifikatKort) → Score-kortets input. Ingen visning (skjult, henter, fejl) → null. */
export function certifikatTilScore(visning: CertifikatKortVisning | null): CertifikatScore {
  if (!visning) return null;
  return visning.tilstand === "klar" ? { klar: true } : { dageTil: visning.dage };
}

export type CertifikatLinje =
  | { tilstand: "laast"; tekst: string }
  | { tilstand: "klar"; tekst: string; sti: string };

/**
 * Score-kortets ene certifikatlinje:
 *   { dageTil: N ≥ 2 } → «Certifikatet åbner om N dage»
 *   { dageTil: 1 }     → «Certifikatet åbner om 1 dag»
 *   { dageTil: 0 }     → «Certifikatet åbner i dag»
 *   { klar: true }     → «Dit certifikat er klar» (link til CERTIFIKAT_KORT.sti)
 *   null/udeladt, et negativt tal eller et ikke-heltal → null (FAIL-CLOSED,
 *   som certifikatKort: hellere ingen linje end en forkert dato).
 * NB: husets dom giver i dag aldrig «låst med 0 dage» (fra og med åbningsdatoen
 * er tilstanden «open» — certifikatKort), så «i dag» står her for fuldstændighed.
 */
export function certifikatLinje(c: CertifikatScore | undefined): CertifikatLinje | null {
  if (!c) return null;
  if ("klar" in c) return c.klar === true ? { tilstand: "klar", tekst: "Dit certifikat er klar", sti: CERTIFIKAT_KORT.sti } : null;
  if (!Number.isInteger(c.dageTil) || c.dageTil < 0) return null;
  if (c.dageTil === 0) return { tilstand: "laast", tekst: "Certifikatet åbner i dag" };
  return { tilstand: "laast", tekst: `Certifikatet åbner ${omDage(c.dageTil)}` };
}
