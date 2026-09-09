/**
 * src/lib/konto.ts
 *
 * Kontoens rene dele — navn, adgangskode, login-metoder, initialer — testet
 * (src/lib/__tests__/konto.test.ts). Fladen er /konto (KontoView, 9/9):
 * kontoen skilt ud af /settings, som svarede på fire spørgsmål (analyse-
 * settings.md); de tre andre — virksomheden, netværksprofilen og
 * notifikationerne — bliver i /settings indtil de tages hver for sig.
 *
 * ADGANGSKODEREGLEN er husets fra signup (PasswordStrengthIndicator.
 * getPasswordScore: mindst 8 tegn, stort bogstav, tal, specialtegn — fire
 * kriterier) og Settings' krav «score < 2 → for svag» (Settings.tsx:400).
 * Scoren regnes af kalderen med getPasswordScore og gives ind, så reglen
 * har ét hjem og denne fil ingen komponent-import.
 */

export const NAVN_MAKS = 100;
/** Settings.tsx:400: score under 2 af 4 er «for svag». */
export const ADGANGSKODE_MIN_SCORE = 2;

export function validerNavn(navn: string): { ok: true; navn: string } | { ok: false; fejl: string } {
  const rent = navn.trim().replace(/\s+/g, " ");
  if (!rent) return { ok: false, fejl: "Skriv dit navn." };
  if (rent.length > NAVN_MAKS) return { ok: false, fejl: `Navnet er for langt (højst ${NAVN_MAKS} tegn).` };
  return { ok: true, navn: rent };
}

export interface AdgangskodeInput {
  nuvaerende: string;
  ny: string;
  gentag: string;
  /** getPasswordScore(ny), 0–4. */
  score: number;
}

/** Samme tre tjek som Settings.handleChangePassword, i samme rækkefølge. */
export function tjekAdgangskode(i: AdgangskodeInput): { ok: true } | { ok: false; fejl: string } {
  if (!i.nuvaerende) return { ok: false, fejl: "Indtast din nuværende adgangskode." };
  if (!i.ny) return { ok: false, fejl: "Skriv en ny adgangskode." };
  if (i.score < ADGANGSKODE_MIN_SCORE) return { ok: false, fejl: "Vælg en stærkere adgangskode — mindst 8 tegn, og gerne et stort bogstav, et tal eller et specialtegn." };
  if (i.ny !== i.gentag) return { ok: false, fejl: "De to adgangskoder er ikke ens." };
  if (i.ny === i.nuvaerende) return { ok: false, fejl: "Den nye adgangskode er den samme som den nuværende." };
  return { ok: true };
}

/** Styrkens ord til baren: 0–1 svag, 2 rimelig, 3 god, 4 stærk. */
export function styrkeOrd(score: number): string {
  if (score >= 4) return "Stærk";
  if (score === 3) return "God";
  if (score === 2) return "Rimelig";
  return "Svag";
}

export interface LoginIdentitet {
  provider: string;
  identity_data?: { email?: string | null } | null;
}

export interface LoginMetoder {
  harAdgangskode: boolean;
  googleEmail: string | null;
  harGoogle: boolean;
}

/** Læses af auth-brugerens identities: 'email' = adgangskode, 'google'. */
export function loginMetoder(identities: readonly LoginIdentitet[] | null | undefined): LoginMetoder {
  const liste = identities ?? [];
  const google = liste.find((i) => i.provider === "google");
  return {
    harAdgangskode: liste.some((i) => i.provider === "email"),
    harGoogle: !!google,
    googleEmail: google?.identity_data?.email ?? null,
  };
}

/** Initialer som Settings (:246-247): første bogstav af de to første ord. */
export function initialer(navn: string): string {
  return navn.trim().split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}
