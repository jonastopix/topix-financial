/**
 * webinarRum/lager — tokenet og enhedens id i sessionStorage (skive 2, 30/9-2026).
 *
 * KUN sessionStorage (spec §C6): fanen husker sit token, så en genindlæsning
 * genoptager rummet, og tokenet kan fjernes fra adresselinjen. Det er strengt
 * nødvendigt for den tjeneste, personen selv har bedt om — intet samtykke
 * kræves, og intet lever efter, at fanen lukkes. Aldrig localStorage, aldrig en
 * cookie. Enhver adgang er fail-soft: en privat fane uden lager giver blot
 * et rum, der ikke overlever en genindlæsning.
 *
 * ENHEDENS ID skal overleve en genindlæsning: serveren tillader højst fem
 * enheder pr. tilmelding (puls.ts:MAKS_ENHEDER), og et nyt id pr. indlæsning
 * ville lukke seeren ude efter femte genindlæsning.
 */
import { ENHED_ID_FORM } from "./pulsplan";
import { gyldigtToken, tokenNoegle } from "./links";

function lager(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function laesGemtToken(slug: string): string | null {
  try {
    const t = lager()?.getItem(tokenNoegle(slug)) ?? null;
    return gyldigtToken(t) ? t : null;
  } catch {
    return null;
  }
}

export function gemToken(slug: string, token: string): void {
  try {
    lager()?.setItem(tokenNoegle(slug), token);
  } catch {
    // intet lager — rummet virker, men overlever ikke en genindlæsning
  }
}

export function glemToken(slug: string): void {
  try {
    lager()?.removeItem(tokenNoegle(slug));
  } catch {
    // intet at glemme
  }
}

const ENHED_NOEGLE = "webinar-rum:enhed";

function nytId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Fanens enheds-id: det gemte, hvis det findes og har formen — ellers et nyt, som gemmes. */
export function enhedId(): string {
  try {
    const gemt = lager()?.getItem(ENHED_NOEGLE) ?? null;
    if (gemt && ENHED_ID_FORM.test(gemt)) return gemt;
    const ny = nytId();
    lager()?.setItem(ENHED_NOEGLE, ny);
    return ny;
  } catch {
    return nytId();
  }
}
