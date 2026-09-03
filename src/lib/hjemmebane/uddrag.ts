/**
 * src/lib/hjemmebane/uddrag.ts
 *
 * De første par sætninger af et opslags rene tekst — ren funktion, nul
 * imports, ingen React. Bruges af forsidens «Fra fællesskabet»
 * (forsideOpslag.ts / BoardroomView).
 *
 * HVOR DEN KOMMER FRA: motoren blev skrevet i opslagsmailen (#576) og bor
 * dér som `uddrag` i supabase/functions/_shared/opslagsMail.ts. Husets
 * regel er den modsatte vej — src/lib er kanonisk, _shared er spejlet
 * (betalingsfrist, fornyelse, branchekode) — så fladen får sin egen
 * udgave HER, ordret den samme. Mailen er bevidst ikke rørt i denne
 * omgang; når den næste gang åbnes, importerer den herfra (spejlet
 * _shared/uddrag.ts) i stedet for at bære sin egen kopi. Indtil da
 * håndhæver src/lib/hjemmebane/__tests__/uddrag.test.ts pariteten mellem
 * de to udgaver: samme input skal give samme uddrag.
 *
 * Grænserne er mailens (280 tegn, tre sætninger): ét tal for «de første
 * par sætninger» i huset, uanset om de læses i en mail eller på forsiden.
 */

export const UDDRAG_MAKS_TEGN = 280;
export const UDDRAG_MAKS_SAETNINGER = 3;

export interface Uddrag {
  /** Teksten der vises. Ender på «…» KUN når der er klippet midt i en sætning. */
  tekst: string;
  /** Sandt når hele opslaget IKKE er med (uanset hvor der blev klippet). */
  afkortet: boolean;
}

/**
 * De første par sætninger af opslagets rene tekst (community_traade.indhold),
 * uden at klippe midt i et ord.
 *
 * Regler:
 * 1. Whitespace normaliseres (indhold er allerede én linje med mellemrum).
 * 2. Sætninger deles ved . ! ? efterfulgt af mellemrum eller slut. En
 *    forkortelse som «kr. 5.000» tæller som sætningsgrænse — det gør kun
 *    uddraget kortere, aldrig klippet midt i et ord.
 * 3. Hele sætninger tages med så længe antallet ≤ maksSaetninger og
 *    længden ≤ maksTegn. Når hele teksten er med: afkortet = false.
 * 4. Passer den første sætning ikke inden for maksTegn, klippes ved sidste
 *    mellemrum før grænsen (plads til «…»), efterhængende tegnsætning
 *    fjernes, og «…» sættes på. Ét ord længere end grænsen hårdklippes.
 */
export function uddrag(
  indhold: string | null | undefined,
  maksTegn = UDDRAG_MAKS_TEGN,
  maksSaetninger = UDDRAG_MAKS_SAETNINGER,
): Uddrag {
  const tekst = String(indhold ?? "").replace(/\s+/g, " ").trim();
  if (tekst === "") return { tekst: "", afkortet: false };
  if (tekst.length <= maksTegn) {
    const alle = delISaetninger(tekst);
    if (alle.length <= maksSaetninger) return { tekst, afkortet: false };
    return { tekst: alle.slice(0, maksSaetninger).join(" "), afkortet: true };
  }

  const saetninger = delISaetninger(tekst);
  const valgte: string[] = [];
  let laengde = 0;
  for (const s of saetninger) {
    if (valgte.length >= maksSaetninger) break;
    const ny = laengde === 0 ? s.length : laengde + 1 + s.length;
    if (ny > maksTegn) break;
    valgte.push(s);
    laengde = ny;
  }
  if (valgte.length > 0) return { tekst: valgte.join(" "), afkortet: true };

  // Første sætning er for lang: klip ved ordgrænse.
  return { tekst: klipVedOrd(tekst, maksTegn), afkortet: true };
}

function delISaetninger(tekst: string): string[] {
  return tekst
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function klipVedOrd(tekst: string, maksTegn: number): string {
  const plads = Math.max(1, maksTegn - 1); // plads til «…»
  const stump = tekst.slice(0, plads);
  const sidsteMellemrum = stump.lastIndexOf(" ");
  const kerne = (sidsteMellemrum > 0 ? stump.slice(0, sidsteMellemrum) : stump)
    .replace(/[\s,;:.!?–-]+$/g, "");
  return `${kerne}…`;
}
