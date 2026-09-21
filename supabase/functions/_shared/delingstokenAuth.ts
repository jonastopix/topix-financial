/**
 * Delingstoken som legitimation — det private links auth-prædikat (udkast
 * webinar-deling 21/9-2026).
 *
 * SAMME KLASSE som verifyAftaletoken (aftaletokenAuth.ts) og verifyBetalingstoken:
 * kalderen af webinar-delt er en ekstern UDEN session og uden konto. Legitimationen
 * ligger i KALDET: tokenet fra linket /delt/webinar?t=…, 256 bit (32 bytes fra
 * crypto.getRandomValues, base64url, 43 tegn), kan ikke gættes. Registreret som
 * prædikat i scripts/check-edge-function-auth.ts. Kald den FØR enhver anden
 * service-role-handling — husets invariant.
 *
 * NYT I HUSET: TOKENET GEMMES KUN SOM SHA-256-AFTRYK. De tre andre token-veje
 * (aftale, ansøgning, betaling) gemmer en uuid i klartekst og slår op på lighed.
 * Her er adgangen bredere og længere: ét link åbner ALLE /webinars tal for en
 * person uden konto i 90 dage (kan forlænges), og rækken skal kunne LÆSES af
 * rådgiverne (listen på /webinar: navn, udløb, sidst set) gennem RLS. Stod tokenet
 * i klartekst, ville enhver rådgiver-session, ethvert databasedump og enhver
 * SELECT-log bære en færdig adgang. Aftrykket kan ikke bruges til at åbne linket;
 * selve tokenet findes kun i svaret ved oprettelsen (vist én gang) og i
 * modtagerens link. Aftrykket regnes med samme sha256Hex som dokumentaftrykket
 * (aftryk.ts), og sammenlignes i konstant tid (konstantTidLighed.ts) — som
 * mailkoden i e-underskriften — så svartiden ikke røber, hvor mange tegn der var
 * rigtige, heller ikke i det led, der ligger EFTER databasens opslag.
 *
 * Ugyldig form afvises FØR opslaget (ingen 22P02, ingen unødig hash). Svaret
 * udadtil er ÉT for ukendt, udløbet og lukket (webinar-delt: 403 «ukendt») —
 * grunden røbes ikke. For en KENDT deling står den i sporet (afvist_udloebet/
 * _lukket); et ukendt token når aldrig sporet (kun functionens log, uden tokenet).
 * Kaster aldrig.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { sha256Hex } from "./aftryk.ts";
import { erKonstantTidLig } from "./konstantTidLighed.ts";
import { AFTRYK_FORM, delingsTilstand, type DelingsRaekke, type DelingsTilstand, erTokenForm } from "./webinarDeling.ts";

export const DELING_FELTER = "id, navn, oprettet_at, udloeber_at, lukket_at, token_aftryk";

export interface DelingMedAftryk extends DelingsRaekke {
  token_aftryk: string;
}

export type Delingsdom =
  | { tilstand: DelingsTilstand; raekke: DelingMedAftryk }
  | { tilstand: "ukendt"; raekke: null };

/** Aftrykket af et token — samme funktion ved oprettelse og opslag. */
export async function delingsAftryk(token: string): Promise<string> {
  return await sha256Hex(token);
}

export async function verifyDelingstoken(token: unknown, adminClient: SupabaseClient, nu: Date): Promise<Delingsdom> {
  if (!erTokenForm(token)) return { tilstand: "ukendt", raekke: null };
  const aftryk = await delingsAftryk(token);
  const { data, error } = await adminClient
    .from("webinar_delinger")
    .select(DELING_FELTER)
    .eq("token_aftryk", aftryk)
    .maybeSingle();
  if (error) {
    console.error("[verifyDelingstoken] opslag fejlede:", error.message);
    return { tilstand: "ukendt", raekke: null };
  }
  const raekke = (data ?? null) as DelingMedAftryk | null;
  if (!raekke || !AFTRYK_FORM.test(raekke.token_aftryk) || !erKonstantTidLig(raekke.token_aftryk, aftryk)) {
    return { tilstand: "ukendt", raekke: null };
  }
  return { tilstand: delingsTilstand(raekke, nu), raekke };
}
