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
import { gensendGemtKrop, sendHaendelse, type Afsendelse, type GemtHaendelse, type HaendelseInput, type SporSkriver } from "./klaviyoHaendelser.ts";
import { bygProfilKrop, PROFIL_STI, skrivProfil, type ProfilSkriver, type ProfilSkrivning } from "./klaviyoProfil.ts";
import { afmeld, AFMELD_STI, type AfmeldInput, type Afmelding, type AfmeldSkriver, bygAfmeldKrop, KLAVIYO_AFMELD_SECRET } from "./klaviyoAfmelding.ts";
import type { Profilvaerdier } from "./klaviyoDato.ts";

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

/**
 * Send en GEMT krop igen (gensenderen, 21/9-2026). KASTER ALDRIG — samme
 * kontrakt som sendHvisMail: nøglen læses HER, ét sted, og gives ind til
 * gensendGemtKrop, som sender kroppen uændret og skriver sporet. Fejler
 * noget alligevel, svares «fejl» uden en række — og cronen tæller det.
 *
 * Kun klaviyo-gensend-cron kalder den. Kroppen kommer fra
 * klaviyo_haendelser.sendt og bygges ikke om.
 */
export async function gensendHvisGemt(skriver: SporSkriver | null, raekke: GemtHaendelse): Promise<Afsendelse> {
  try {
    return await gensendGemtKrop(skriver, Deno.env.get(KLAVIYO_SECRET), raekke);
  } catch (e) {
    console.error(`[klaviyo] gensendelsen af ${raekke.metric}/${raekke.unikt_id} kastede — cronen går videre:`, e);
    return {
      sendt: false,
      spor: { udfald: "fejl", metode: "POST", sti: "/events/", status: null, svar: null, grund: `gensendelsen kastede: ${String(e).slice(0, 300)}`, varighed_ms: 0 },
    };
  }
}

/**
 * Skriv (eller fjern) webinar-felterne på PROFILEN for én mail (udkast 21/9-2026,
 * klaviyoProfil.ts). KASTER ALDRIG — samme kontrakt som sendHvisMail: nøglen
 * læses HER, ét sted, og gives ind. Fejler noget alligevel, svares «fejl»
 * uden en række — og cronen tæller det. Kun klaviyo-profil-cron kalder den.
 */
export async function skrivProfilHvisNoegle(
  skriver: ProfilSkriver | null,
  email: string,
  oensket: Profilvaerdier | null,
  nu: Date,
): Promise<ProfilSkrivning> {
  try {
    return await skrivProfil(skriver, Deno.env.get(KLAVIYO_SECRET), email, oensket, { nuDato: nu });
  } catch (e) {
    console.error(`[klaviyo] profilskrivningen for ${email} kastede — cronen går videre:`, e);
    return {
      sendt: false,
      spor: { udfald: "fejl", metode: "POST", sti: PROFIL_STI, status: null, svar: null, grund: `profilskrivningen kastede: ${String(e).slice(0, 300)}`, varighed_ms: 0 },
      krop: bygProfilKrop(email, oensket),
    };
  }
}
/**
 * Afmeld ÉN mail fra e-mailmarkedsføring hos Klaviyo (udkast 22/9-2026,
 * klaviyoAfmelding.ts). KASTER ALDRIG — samme kontrakt som de tre ovenfor.
 *
 * NØGLEN ER EN ANDEN, OG DET ER MED VILJE. Afmeldingen kræver scopes, som
 * `KLAVIYO_API_KEY` ikke har — og Klaviyo tillader ikke, at man tilfoejer et
 * scope til en eksisterende privat noegle («you cannot add a scope to an
 * existing private key», api_overview). Derfor `KLAVIYO_AFMELD_KEY`, laest
 * HER og kun her, praecis som den anden. Kaldstederne kender ingen af dem.
 */
export async function afmeldHvisNoegle(
  skriver: AfmeldSkriver | null,
  i: AfmeldInput,
  nu: Date,
): Promise<Afmelding> {
  try {
    return await afmeld(skriver, Deno.env.get(KLAVIYO_AFMELD_SECRET), i, { nuDato: nu });
  } catch (e) {
    console.error(`[klaviyo] afmeldingen af ${i.email} kastede — kalderen gaar videre:`, e);
    return {
      sendt: false,
      spor: { udfald: "fejl", metode: "POST", sti: AFMELD_STI, status: null, svar: null, grund: `afmeldingen kastede: ${String(e).slice(0, 300)}`, varighed_ms: 0 },
      krop: bygAfmeldKrop(i.email),
    };
  }
}
