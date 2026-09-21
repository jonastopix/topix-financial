/**
 * annoncekildeStreng — kildeNavn for en IKKE-TOM streng (udkast webinar-deling
 * 21/9-2026). Kun til spejlet _shared/webinarDashboard.ts: fladens dashboard.ts
 * skriver `return kildeNavn(kilde)` i kildeAf (kilde er allerede trimmet og
 * ikke-tom, så kildeNavn svarer aldrig null dér), og den linje er låst af
 * annoncekilde.guard. Vite kompilerer den under tsconfig strict: false; Deno
 * kører strictNullChecks og afviser `string | null` som `string`. Frem for at
 * ændre den låste linje i begge spejle, snævrer denne fil signaturen ind —
 * samme funktion, samme svar, én linje. Pariteten (webinarDashboard.paritet)
 * kortlægger @/lib/webinar/annoncekilde → ./annoncekildeStreng.ts.
 */
import { kildeNavn as kildeNavnRaa } from "./annoncekilde.ts";

/** Som annoncekilde.kildeNavn, men for en ikke-tom streng: aldrig null (råværdien, hvis oversættelsen mangler). */
export function kildeNavn(utmSource: string): string {
  return kildeNavnRaa(utmSource) ?? utmSource;
}
