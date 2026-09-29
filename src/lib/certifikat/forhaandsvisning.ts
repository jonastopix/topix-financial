/**
 * Forhåndsvisningen af «Dit certifikat» for rådgivere (29/9-2026).
 *
 * Jonas 29/9: «Hvordan dælen ser jeg området med certifikat?» — /certifikat
 * skjuler siden for rådgivere (dom.ts, useCertificate), så Jonas og Morten
 * kunne ikke se, hvad medlemmerne får. /certifikat/forhaandsvisning viser den
 * ÆGTE CertificatePage med eksempeldata. Intet gemmes: ingen upload, ingen
 * række i certificate_downloads (siden giver ingen onDownloaded).
 *
 * REN: ingen React, ingen Supabase. Tiden gives ind som `nu`.
 */
import { addDays, addMonths, copenhagenDate } from "@/components/hjemmebane/certifikat/format";

export type Forhaandstilstand = "laast" | "aaben";

export const FORHAANDSVISNING_LINJE = "Forhåndsvisning. Sådan ser medlemmet siden. Intet gemmes.";
export const EKSEMPEL_NAVN = "Anne Sofie Holm";
export const EKSEMPEL_VIRKSOMHED = "Holm & Co. ApS";
export const UPLOAD_SLAAET_FRA = "Upload er slået fra i forhåndsvisningen.";

/**
 * Startdatoen, der giver tilstanden — regnet af dagens danske dato, så den
 * altid passer:
 *   låst  = i dag − 7 måneder. 12-månedersdatoen er så i dag + 5 måneder
 *           (7 + 5 = 12), og området åbner 7 dage før den — altså om cirka
 *           5 måneder minus en uge. Dermed «locked».
 *   åben  = i dag − 12 måneder − 3 dage. 12-månedersdatoen er så for 3 dage
 *           siden, og området åbnede 7 dage før den — for 10 dage siden.
 *           Dermed «open».
 * addMonths holder dagen inden for måneden (31. + 1 md → sidste dag), så en
 * måned-ende kan flytte datoen nogle dage — aldrig nok til at skifte tilstand.
 */
export function forhaandsvisningsStart(tilstand: Forhaandstilstand, nu: Date = new Date()): Date {
  const idag = copenhagenDate(nu);
  return tilstand === "laast" ? addMonths(idag, -7) : addDays(addMonths(idag, -12), -3);
}
