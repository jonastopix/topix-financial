/**
 * src/lib/ansoegning/lokalt.ts
 *
 * Tokenet i browseren, så samme telefon finder ansøgningen igen uden
 * link. localStorage kan mangle eller kaste (privat vindue, blokeret
 * lager) — hver læsning og skrivning er pakket ind, og siden virker uden.
 */
const NOEGLE = "ansoegning.token";

export function laesLokaltToken(): string | null {
  try {
    const t = window.localStorage.getItem(NOEGLE);
    return t && /^[0-9a-f-]{36}$/i.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function gemLokaltToken(token: string): void {
  try {
    window.localStorage.setItem(NOEGLE, token);
  } catch {
    /* uden lager — linket og mailen er stadig veje tilbage */
  }
}

export function glemLokaltToken(): void {
  try {
    window.localStorage.removeItem(NOEGLE);
  } catch {
    /* ingenting at glemme */
  }
}
