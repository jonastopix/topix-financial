/**
 * ansoegerAftale — hvad ansøgerens statusside skal vide om e-underskriften
 * (generalprøvens brist 8, 18/9-2026). Ren: ingen Deno, ingen Supabase.
 *
 * FØR pegede statussidens «Læs og underskriv» på ansoegninger.aftale_url —
 * det link rådgiveren tastede i den gamle vej (PDF, tom side, hvad som
 * helst). Nu findes e-underskriften (#991, #993, #994): findes der en aftale
 * i aftale_underskrift på ansøgningen, er DET linket — /aftale?token=… —
 * og aftale_url er kun fald-tilbage, når der ingen aftale er.
 *
 * Dommen over aftalens tilstand er underskriftDom.afgoerAftaletilstand (21
 * dage, underskrevet vinder, annulleret er annulleret). Herfra får siden:
 * url, tilstand, udløb — og intet andet fra aftalen (ingen tekst, intet
 * aftryk, ingen modtager; det læser ansøgeren på /aftale).
 *
 * TOKENET I SVARET: aftale-tokenet er en bæreradgang. Det udleveres kun bag
 * ansøgningens eget token (verifyAnsoegningslink i ansoegning-link) — samme
 * person, som allerede har linket i sin mail. Kildeværn:
 * src/lib/__tests__/generalproeveRest2.guard.test.ts.
 */
import { afgoerAftaletilstand, type Aftalestatus } from "./underskriftDom.ts";
import { aftaleUrl } from "./underskriftMail.ts";

/** De fire felter statussiden behøver fra aftale_underskrift — ikke flere. */
export interface AftaleRaekkeTilAnsoeger {
  token: string;
  status: Aftalestatus;
  sendt_at: string;
  underskrevet_at: string | null;
}

export type UnderskriftTilstand = "kan_underskrives" | "underskrevet" | "udloebet" | "annulleret" | "ugyldig";

export interface UnderskriftTilAnsoeger {
  /** /aftale?token=… — kun brugbart når tilstand = kan_underskrives. */
  url: string;
  tilstand: UnderskriftTilstand;
  udloeber_at: string | null;
  underskrevet_at: string | null;
}

/** null ind → null ud (ingen aftale på ansøgningen: siden falder tilbage på aftale_url). */
export function aftaleTilAnsoeger(a: AftaleRaekkeTilAnsoeger | null | undefined, nu: Date): UnderskriftTilAnsoeger | null {
  if (!a) return null;
  const t = afgoerAftaletilstand({ status: a.status, sendt_at: a.sendt_at, underskrevet_at: a.underskrevet_at }, nu);
  return {
    url: aftaleUrl(a.token),
    tilstand: t.tilstand,
    udloeber_at: t.tilstand === "kan_underskrives" ? t.udloeber_at : null,
    underskrevet_at: t.tilstand === "underskrevet" ? t.underskrevet_at : null,
  };
}

/** Den nyeste ikke-annullerede aftale vinder — sendt_at faldende; annullerede er kun historik. */
export const AFTALE_TIL_ANSOEGER_FELTER = "token, status, sendt_at, underskrevet_at";
