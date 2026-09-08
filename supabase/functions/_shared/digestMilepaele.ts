/**
 * supabase/functions/_shared/digestMilepaele.ts
 *
 * Månedsdigestens milepæle — den rene del (udvælgelse + tekst), testet fra
 * src/lib/__tests__/digestMilepaele.test.ts som fornyelsens mails.
 *
 * FØR (send-monthly-digest:201-212, målt 8/9): filteret havde KUN en øvre
 * grænse (deadline <= i dag + 30) og dømte «aktiv» som progress < 100. En
 * milepæl med frist i april stod derfor som «Milestones med deadline
 * snart» — 21 af 27 milepæle hos aktive virksomheder var overskredne, og
 * digesten var den eneste kanal der nåede dem, med det modsatte af
 * sandheden.
 *
 * NU dømmer motoren (milepaelDom.afgoerMilepael) hver række, og digesten
 * siger to ting, hver for sig og hver bundet til tre linjer:
 *   KOMMENDE   aktive med frist i dag..+KOMMENDE_DAGE, nærmeste først.
 *   FORFALDNE  aktive med passeret frist inden for FORFALDEN_MAKS_DAGE,
 *              senest passerede først (de mest levende). Ældre nævnes
 *              kun som et tal — en månedsopsamling bærer ikke et halvt
 *              års efterslæb. Besluttet 8/9 (a): forfaldne NÆVNES, med
 *              deres tilstand, fordi at tie er ikke bedre end at kalde
 *              dem kommende. Tonen er opsamlingens, ikke rykkerens:
 *              «Fristen er passeret på:», og en udvej (ret fristen eller
 *              læg den i køleskabet), ikke en bebrejdelse.
 *
 * Titler er medlemsskrevne og escapes (htmlEscape) — brødteksten lægges
 * i HTML med white-space:pre-line.
 */

import { afgoerMilepael, type MilepaelInput } from "./milepaelDom.ts";
import { escHtml } from "./htmlEscape.ts";

export const KOMMENDE_DAGE = 30;
export const FORFALDEN_MAKS_DAGE = 60;
export const MAKS_KOMMENDE = 3;
/** Forfaldne fylder aldrig mere end de kommende kan: samme loft. */
export const MAKS_FORFALDNE = MAKS_KOMMENDE;

export interface DigestMilepael extends MilepaelInput {
  title: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
}

export interface DigestUdvalg {
  kommende: DigestMilepael[];
  forfaldne: DigestMilepael[];
  /** Alle forfaldne (også dem der ikke nævnes ved navn). */
  forfaldneIAlt: number;
  /** Forfaldne ældre end FORFALDEN_MAKS_DAGE — tælles, nævnes ikke. */
  aeldre: number;
}

export function udvaelgDigestMilepaele(raekker: DigestMilepael[], nu: Date): DigestUdvalg {
  const domme = raekker.map((r) => ({ r, dom: afgoerMilepael(r, nu) }));
  const kommende = domme
    .filter(({ dom }) => dom.aktiv && dom.dage_til_frist != null && dom.dage_til_frist >= 0 && dom.dage_til_frist <= KOMMENDE_DAGE)
    .sort((a, b) => a.dom.dage_til_frist! - b.dom.dage_til_frist!)
    .slice(0, MAKS_KOMMENDE)
    .map(({ r }) => r);
  const alleForfaldne = domme.filter(({ dom }) => dom.forfalden);
  const nylige = alleForfaldne
    .filter(({ dom }) => dom.dage_til_frist! >= -FORFALDEN_MAKS_DAGE)
    .sort((a, b) => b.dom.dage_til_frist! - a.dom.dage_til_frist!);
  return {
    kommende,
    forfaldne: nylige.slice(0, MAKS_FORFALDNE).map(({ r }) => r),
    forfaldneIAlt: alleForfaldne.length,
    aeldre: alleForfaldne.length - nylige.length,
  };
}

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** «16. april» — fra date-kolonnens «YYYY-MM-DD» uden tidszone-omvej. */
export function formatKortDato(deadline: string | Date | null | undefined): string {
  if (deadline == null) return "";
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]}`;
}

/** «: 3/10 kunder» for målbare, ellers « (40%)» — som digesten altid har sagt det. */
function fremdrift(m: DigestMilepael): string {
  return m.target_value && m.unit
    ? `: ${m.current_value ?? 0}/${m.target_value} ${escHtml(m.unit)}`
    : ` (${m.progress ?? 0}%)`;
}

/** Brødtekstens milepælsblok(ke) — null når der intet er at sige. Hver blok
    begynder med en tom linje (digestens form: «\n» + overskrift). */
export function digestMilepaeleTekst(udvalg: DigestUdvalg): string | null {
  const blokke: string[] = [];
  if (udvalg.kommende.length) {
    const linjer = udvalg.kommende.map((m) => `• ${escHtml(m.title)}${fremdrift(m)}, deadline ${formatKortDato(m.deadline)}`);
    blokke.push(`\nMilestones med deadline snart:\n${linjer.join("\n")}`);
  }
  if (udvalg.forfaldneIAlt > 0) {
    const linjer = udvalg.forfaldne.map((m) => `• ${escHtml(m.title)}${fremdrift(m)} · fristen var ${formatKortDato(m.deadline)}`);
    const rest = udvalg.forfaldneIAlt - udvalg.forfaldne.length;
    const restLinje = rest > 0 ? `\n… og ${rest} ${rest === 1 ? "anden" : "andre"} med passeret frist.` : "";
    const udvej = "\nPasser fristen ikke længere, så ret den eller læg milestonen i køleskabet.";
    blokke.push(
      linjer.length
        ? `\nFristen er passeret på:\n${linjer.join("\n")}${restLinje}${udvej}`
        : `\nDu har ${udvalg.forfaldneIAlt} ${udvalg.forfaldneIAlt === 1 ? "milestone" : "milestones"} med passeret frist.${udvej}`,
    );
  }
  return blokke.length ? blokke.join("\n") : null;
}
