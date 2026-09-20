/**
 * _shared/webinarHaendelser.ts — fremmøde fra eWebinar til Klaviyo.
 *
 * ── HVORFOR DEN FINDES (målt 19/9, recon-klaviyo-fremmoede) ─────────────────
 * Klaviyo ved INTET om fremmøde. Målt på 19 profiler: hver bærer præcis én
 * brugerdefineret egenskab, `eWebinar`, og den er en datostreng («09/22/2026»).
 * Ingen integration, ingen metrik, intet segment nævner deltagelse. Efter-
 * webinar-flowet YcBF9f er DATOSTYRET og fyrer derfor på alle tilmeldte —
 * «skal du nå at ansøge?» går i dag også til dem, der aldrig dukkede op.
 *
 * Vi har tallene selv, i realtid, i `ewebinar-webhook`. Der manglede en linje
 * mellem dem. Den er her.
 *
 * ── HVORFOR GRÆNSEN IKKE LIGGER I HÆNDELSENS NAVN ──────────────────────────
 * Der er TO hændelser, ikke tre. Ingen «Saa webinaret faerdigt».
 *
 * 75 %-grænsen er VORES dom, ikke et faktum, og den er allerede flyttet én
 * gang. Ligger den i hændelsens navn, er den støbt fast hos Klaviyo: en
 * ændring ville kræve, at både flows og segmenter bygges om, og gamle
 * hændelser ville bære den gamle grænse i deres navn for evigt.
 *
 * Ligger `set_procent` med som TAL, kan Klaviyo segmentere på `>= 75`, og
 * grænsen kan flyttes ét sted — i `webinarDom.ts`. `grad` sendes med som
 * bekvemmelighed, men tallet er sandheden. Samme princip som `webinarDom`
 * allerede følger: dommen udledes af tallet, aldrig gemt.
 *
 * ── HVORFOR SESSIONEN LIGGER PÅ HÆNDELSEN OG IKKE I PROFILEN ───────────────
 * `eWebinar`-egenskaben OVERSKRIVES. Målt: en profil oprettet 21/8, som fik
 * efter-webinar-mailen 26/8, bærer i dag «09/22/2026». Feltet holder den
 * SENESTE tilmelding, ikke den, personen deltog i.
 *
 * En hændelse er derimod et tidsstemplet faktum, der bliver liggende: «deltog
 * i webinar X den 25/8» forbliver sandt, også når personen tilmelder sig 22/9.
 * Det giver historikken gratis — efter tre webinarer kan Klaviyo segmentere på
 * «deltog mindst to gange», hvilket den nuværende model slet ikke kan udtrykke.
 *
 * ── HVORFOR KUN VED SKIFT ───────────────────────────────────────────────────
 * eWebinar POSTer ved HVER ændring. Sendte vi ved hver POST, ville «deltog»
 * stå femten gange på samme person. Vi sender kun, når graden SKIFTER til noget
 * endeligt — og `unique_id` er `<ewebinar_id>:<grad>`, så Klaviyo selv afviser
 * gentagelser («only the first processed event will be recorded»).
 */

import { HAENDELSE, brugbarMail, type HaendelseInput } from "./klaviyoHaendelser.ts";
import type { SetGrad } from "./webinarDom.ts";

/** De to grader, der betyder «var der». `set` og `delvist` — ikke tallet. */
const VAR_DER: readonly SetGrad[] = ["set", "delvist"];

/** Grader, der ikke er en endelig dom endnu. Fra dem må man gerne komme videre. */
const IKKE_AFGJORT: readonly SetGrad[] = ["tilmeldt", "ukendt"];

export type Overgang = "deltog" | "moedte_ikke" | "ingen";

/**
 * Skal der sendes noget, når graden går fra `foer` til `efter`?
 *
 * `foer` er null ved første besked om en tilmelding (ingen tidligere række).
 *
 *   tilmeldt/ukendt/null → set eller delvist  →  «deltog»
 *   tilmeldt/ukendt/null → moedte_ikke        →  «mødte ikke op»
 *   delvist              → set                →  «deltog» igen, med ny procent
 *   alt andet                                 →  intet
 *
 * DELVIST → SET SENDER IGEN MED VILJE. Procenten går aldrig ned
 * (`fletTilmelding`), så den overgang sker højst én gang pr. tilmelding, og
 * den bærer et bedre tal end den første. `unique_id` skiller dem ad, fordi
 * graden indgår — Klaviyo får to hændelser, ikke en dublet.
 *
 * SET → DELVIST KAN IKKE SKE, og hvis den gør, sender vi intet: en dom, der
 * går baglæns, er et tegn på noget galt, ikke på en ny kendsgerning.
 */
export function afgoerOvergang(foer: SetGrad | null, efter: SetGrad): Overgang {
  if (foer === efter) return "ingen";
  const fraStart = foer === null || IKKE_AFGJORT.includes(foer);

  if (VAR_DER.includes(efter)) {
    if (fraStart) return "deltog";
    // Den ene tilladte opgradering.
    if (foer === "delvist" && efter === "set") return "deltog";
    return "ingen";
  }
  if (efter === "moedte_ikke" && fraStart) return "moedte_ikke";
  return "ingen";
}

export interface FremmoedeInput {
  ewebinarId: string;
  email: string | null | undefined;
  grad: SetGrad;
  setProcent: number | null;
  webinarId: string | null;
  webinarTitel: string | null;
  sessionTid: string | null;
  tid?: Date;
}

/**
 * Bygger hændelsen. Returnerer null, når der ikke er en brugbar mail —
 * Klaviyos profil findes på mailen, og uden den er der ingen modtager.
 *
 * `set_procent` sendes som TAL. `grad` som tekst ved siden af. Se filhovedet.
 */
export function byggFremmoede(o: Overgang, i: FremmoedeInput): HaendelseInput | null {
  if (o === "ingen") return null;
  const mail = brugbarMail(i.email);
  if (mail === null) return null;

  return {
    metric: o === "deltog" ? HAENDELSE.deltog : HAENDELSE.moedteIkke,
    email: mail,
    // Graden indgår, så delvist→set bliver to hændelser og ikke en dublet.
    uniktId: `${i.ewebinarId}:${i.grad}`,
    egenskaber: {
      webinar_id: i.webinarId,
      webinar_titel: i.webinarTitel,
      // Sessionen ligger HER, ikke i profilen. Profilfeltet overskrives.
      session_tid: i.sessionTid,
      // Tallet er sandheden; grænsen bor i webinarDom.ts.
      set_procent: i.setProcent,
      grad: i.grad,
      ewebinar_id: i.ewebinarId,
    },
    // Hændelsen SKETE, da vi dømte den — ikke da vi nåede at sende den.
    tid: i.tid,
  };
}
