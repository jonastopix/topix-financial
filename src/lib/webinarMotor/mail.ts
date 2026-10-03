/**
 * webinarMotor/mail — hvilken vej en før-webinar-mail går: eWebinars eller motorens (skive 3, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/mail.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * webinar-mail-cron's dom (webinarMailDom.ts: HVEM, HVAD, HVORNÅR, PLANEN,
 * dubletværnet, nåden) er URØRT. Den her fil afgør kun LINKENE og
 * KALENDERFILEN for én sending, EFTER dommen har sagt ja:
 *
 *   eWebinars række  → uændret: join_link og kalender_link fra rækken, og
 *                      eWebinars invite.ics hentes (hentInvitation).
 *   motorens række   → rum-linket /w/<slug>?t=<HMAC-token> og husets egen .ics
 *                      (bygIcs), bygget i processen — aldrig hentet over nettet.
 *   motorens række,  → mailen sendes IKKE i denne kørsel (ingen række i sporet,
 *   der ikke kan       så den forsøges igen næste gang, indtil dommens nåde
 *   bygges             lukker den). En påmindelse uden link til rummet er ikke
 *                      en påmindelse — og en eWebinar-«reserve» findes ikke for
 *                      en række, eWebinar aldrig har set.
 *
 * NØGLEN ER KILDE_SYSTEM, IKKE PRÆFIKSET. «P-» i ewebinar_id er kun filteret
 * for, hvilke rækker cronen slår op (et felt, vi selv sætter — platformEwebinarId);
 * dommen kræver, at opslaget siger kilde_system = 'platform'.
 */

/** «P-» + en uuid — platformEwebinarId's form (tilmelding.ts). */
export const MOTOR_ID_FORM = /^P-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function erMotorId(ewebinarId: string | null | undefined): boolean {
  return typeof ewebinarId === "string" && MOTOR_ID_FORM.test(ewebinarId);
}

/** Tilmeldingens id ud af «P-<uuid>» — null, hvis formen ikke passer. */
export function motorTilmeldingId(ewebinarId: string | null | undefined): string | null {
  return erMotorId(ewebinarId) ? (ewebinarId as string).slice(2) : null;
}

/** Det, cronen har slået op om en motor-række (webinar_tilmeldinger + session + webinar). */
export interface MotorOpslag {
  tilmeldingId: string;
  kildeSystem: string | null;
  tokenVersion: number | null;
  email: string;
  slug: string | null;
  titel: string | null;
  vaertNavn: string | null;
  starterMs: number | null;
  /** Hovedvideoens slut (sessionTider.afspilningSlutMs) — .ics'ens DTEND. */
  slutMs: number | null;
  icsSekvens: number;
  sessionStatus: string | null;
}

export type UdenLinkGrund = "ikke_fundet" | "ikke_platform" | "ingen_session" | "ingen_secret" | "aflyst";

export type MailVej =
  | { vej: "ewebinar" }
  | { vej: "motor"; opslag: MotorOpslag }
  | { vej: "motor_uden_link"; grund: UdenLinkGrund };

/**
 * Vejen for én sending. `harSecret` = deltagertokenets secret er sat (uden den kan
 * intet token bygges). En aflyst session får ingen påmindelse fra motoren —
 * den får en CANCEL-invitation, når flyt/aflys-mailarten findes (spec §B3).
 */
export function mailVejDom(ewebinarId: string, opslag: MotorOpslag | undefined, harSecret: boolean): MailVej {
  if (!erMotorId(ewebinarId)) return { vej: "ewebinar" };
  if (!opslag) return { vej: "motor_uden_link", grund: "ikke_fundet" };
  if (opslag.kildeSystem !== "platform") return { vej: "motor_uden_link", grund: "ikke_platform" };
  if (!opslag.slug || opslag.starterMs === null || opslag.slutMs === null || opslag.tokenVersion === null) {
    return { vej: "motor_uden_link", grund: "ingen_session" };
  }
  if (opslag.sessionStatus === "aflyst") return { vej: "motor_uden_link", grund: "aflyst" };
  if (!harSecret) return { vej: "motor_uden_link", grund: "ingen_secret" };
  return { vej: "motor", opslag };
}

/** Tællingen i cronens svar — beviset for, at den nye kode kører, og hvad den gjorde. */
export interface MotorMailTal {
  /** Sendinger på motorens vej (link + .ics bygget). */
  vej_motor: number;
  /** Sendinger, der IKKE blev forsøgt, fordi motorens link ikke kunne bygges — pr. grund. */
  uden_link: Record<UdenLinkGrund, number>;
}

export function tomtMotorMailTal(): MotorMailTal {
  return { vej_motor: 0, uden_link: { ikke_fundet: 0, ikke_platform: 0, ingen_session: 0, ingen_secret: 0, aflyst: 0 } };
}
