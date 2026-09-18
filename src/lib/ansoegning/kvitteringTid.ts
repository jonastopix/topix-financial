/**
 * src/lib/ansoegning/kvitteringTid.ts — HVORNÅR kommer kvitteringsmailen?
 * (generalprøvens brist 2, 18/9). Kvitteringen er trappen «indsendt» i
 * rykkerkøen, og køen har sin egen dom: hverdage 07–16, dag 0 kl. 10 eller
 * nu hvis vi er i vinduet (rykkerkoe.planlaegTrappe → hverdage.ts).
 * Skærmen SPØRGER køen i stedet for at gætte («i morgen tidlig» var forkert
 * fredag efter 16 og i weekenden — der er svaret mandag kl. 07).
 *
 * Ren funktion: samme dom som cronen bruger, så teksten og mailen følges ad.
 */
import { planlaegTrappe } from "@/lib/rykkerkoe";
import { erHverdagDato, kbhDato, kbhDele, laegDageTilDato } from "@/lib/hverdage";

/** Planlæggerens eget svar: første række i trappen «indsendt» ankret i `nu`. */
export function kvitteringensTidspunkt(nu: Date): Date {
  const plan = planlaegTrappe({ ansoegningId: "00000000-0000-0000-0000-000000000000", trappe: "indsendt", anker: nu, nu });
  if (plan.length === 0) throw new Error("kvitteringTid: trappen «indsendt» er tom");
  return new Date(plan[0].planlagt_til);
}

const UGEDAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

/**
 * «om et øjeblik» (vinduet er åbent og tidspunktet er nu), «i dag kl. 10»
 * (før kl. 10 på en hverdag), «i morgen tidlig» (hverdagsaften, næste hverdag er i morgen),
 * «mandag morgen» (inden for en uge), ellers «28. december om morgenen».
 */
export function hvornaarKommerKvitteringen(nu: Date): string {
  const t = kvitteringensTidspunkt(nu);
  if (t.getTime() <= nu.getTime()) return "om et øjeblik";
  const iDag = kbhDato(nu);
  const dato = kbhDato(t);
  const { time } = kbhDele(t);
  if (dato === iDag) return `i dag kl. ${time}`;
  // «i morgen tidlig» kun fra en hverdagsaften; søndag aften hedder det «mandag morgen».
  if (dato === laegDageTilDato(iDag, 1) && erHverdagDato(iDag)) return "i morgen tidlig";
  for (let d = 1; d <= 6; d++) {
    if (dato === laegDageTilDato(iDag, d)) return `${UGEDAGE[kbhDele(t).ugedag]} morgen`;
  }
  const { dag, maaned } = kbhDele(t);
  return `${dag}. ${MAANEDER[maaned - 1]} om morgenen`;
}
