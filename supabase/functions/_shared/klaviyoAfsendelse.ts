/**
 * Afsendelsen til Klaviyo, som kaldstederne bruger den (udkast 19/9-2026).
 *
 * DENNE FIL LÆSER `Deno.env` — og det er hele grunden til, at den findes.
 * `klaviyo.ts` og `klaviyoHaendelser.ts` er bevidst Deno-fri, så hele formen
 * på kaldet og på hændelseskroppen kan prøves i vitest. Så snart én af dem
 * rørte `Deno.env`, ville en prøve trække Deno-globaler ind i tsc's graf, og
 * `Deno` findes ikke dér (fælden kostede en halv time på cvrCache 19/9).
 * Nøglen læses derfor her, ét sted, og gives ind.
 *
 * ÉN LINJE PR. KALDSTED. Et kaldsted skal ikke kende hverken nøglen, sporet
 * eller fejlhåndteringen — kun hvilken hændelse der skete.
 */
import { KLAVIYO_SECRET } from "./klaviyo.ts";
import { sendHaendelse, type HaendelseInput, type SporSkriver } from "./klaviyoHaendelser.ts";

/**
 * Send hændelsen, hvis der er en mailadresse. KASTER ALDRIG — heller ikke hvis
 * `byg` selv kaster, hvilket er grunden til at også DEN er inde i try'en.
 *
 * Uden mail sker der intet: Klaviyos profil findes på mailen, og en hændelse
 * uden profil har ingen modtager. Uden nøgle sker der heller intet — det er en
 * gyldig tilstand, ikke en fejl (samme kontrakt som Meta-hentningen).
 */
export async function sendHvisMail(
  skriver: SporSkriver | null,
  email: string | null | undefined,
  byg: (mail: string) => HaendelseInput,
): Promise<void> {
  try {
    const mail = typeof email === "string" ? email.trim() : "";
    if (mail === "" || !mail.includes("@")) return;
    await sendHaendelse(skriver, Deno.env.get(KLAVIYO_SECRET), byg(mail));
  } catch (e) {
    // Sidste værn. Intet herfra må nå en ansøger eller en Stripe-webhook.
    console.error("[klaviyo] afsendelsen kastede — hændelsen er tabt, kalderen går videre:", e);
  }
}
