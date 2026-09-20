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
import { sendHaendelse, type Afsendelse, type HaendelseInput, type SporSkriver } from "./klaviyoHaendelser.ts";

/**
 * Send hændelsen. KASTER ALDRIG — men SIGER, hvad der skete (20/9,
 * recon-platformsiden §1.3): udfaldet returneres, så et kaldsted kan logge
 * «sendt» eller «ikke sendt (timeout)» i stedet for «sendt» for alt. Før
 * returnerede den void, og webhookens log sagde «fremmoede sendt» uanset.
 *
 * NAVNET ER BEHOLDT, MEN BETYDNINGEN ER SKÆRPET (19/9 kl. 22.30): den sender
 * stadig kun, når der er en mail — men den er ikke længere TAVS, når der ikke
 * er. `sendHaendelse` skriver en række med udfaldet «ingen_mail», så en
 * manglende modtager kan ses i sporet i stedet for at kræve en kodelæsning.
 *
 * Hændelsen bygges af KALDEREN, ikke her. Så er metric og unikt id kendt,
 * også når mailen mangler — og det er netop dét, rækken skal bære.
 */
export async function sendHvisMail(skriver: SporSkriver | null, i: HaendelseInput): Promise<Afsendelse> {
  try {
    return await sendHaendelse(skriver, Deno.env.get(KLAVIYO_SECRET), i);
  } catch (e) {
    // Sidste værn. Intet herfra må nå en ansøger eller en Stripe-webhook.
    console.error("[klaviyo] afsendelsen kastede — hændelsen er tabt, kalderen går videre:", e);
    return {
      sendt: false,
      spor: { udfald: "fejl", metode: "POST", sti: "/events/", status: null, svar: null, grund: `afsendelsen kastede: ${String(e).slice(0, 300)}`, varighed_ms: 0 },
    };
  }
}
