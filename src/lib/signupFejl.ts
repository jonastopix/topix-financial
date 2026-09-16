/**
 * src/lib/signupFejl.ts
 *
 * Signup siger hvad der er galt — de rene domme bag /auth (16/9 2026,
 * mangellisten w2 «de dårlige dage», recon-signup-daarlige-dage.md).
 *
 * MÅLT I DRIFT 16/9 (privat vindue): et forvansket invitationstoken gav
 * signup-formen uden besked og, efter «Opret konto», toasten «Database error
 * saving new user»; en eksisterende mail gav «User already registered». Begge
 * engelske og rå fra Supabase Auth; ingen af dem pegede på «Log ind».
 *
 * TO DOMME, ingen IO:
 *   afgoerInvitationslink — hvad opslaget lookup_invite_company_info gav:
 *     ingen_token · gyldig (data med name) · ukendt (token, men intet svar —
 *     data null, eller Postgres 22P02 «ugyldig uuid-syntaks», som huset
 *     allerede læser som «ikke fundet» i akademiApi.ts:235-238,
 *     memberProfile.ts:65-71 og _shared/betalingstokenAuth.ts:41) · fejl
 *     (alt andet: netværk, RLS, en anden kode).
 *   signupFejl — Supabase Auths fejltekst → husets sætning + om formen skal
 *     skifte til login. Sammenligningen er case-insensitiv og trimmet; en
 *     ukendt tekst vises ALDRIG rå (den går til console.warn hos kalderen).
 *
 * Kontaktadressen kommer fra lib/kontaktadresse (kontaktadresseFladen.guard).
 */
import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";

export type Invitationslink = "ingen_token" | "gyldig" | "ukendt" | "fejl";

/** Postgres: «invalid input syntax for type uuid» — et token der ikke er en uuid. */
export const UGYLDIG_UUID_KODE = "22P02";

export function afgoerInvitationslink(a: {
  harToken: boolean;
  data: unknown;
  error: { code?: string | null; message?: string | null } | null | undefined;
}): Invitationslink {
  if (!a.harToken) return "ingen_token";
  const navn = a.data && typeof a.data === "object" ? (a.data as { name?: unknown }).name : null;
  if (typeof navn === "string" && navn.trim()) return "gyldig";
  if (a.error) return a.error.code === UGYLDIG_UUID_KODE ? "ukendt" : "fejl";
  return "ukendt";
}

/** Linjen over login-formen når linket ikke svarer (ukendt). */
export const LINK_UKENDT_TEKST =
  `Linket er allerede brugt, eller det virker ikke længere. Har du oprettet din konto, så log ind herunder. Ellers skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig.`;

export interface SignupFejl {
  tekst: string;
  skiftTilLogin: boolean;
}

/** Supabase Auths tekster, som målt 16/9 — sammenlignes normaliseret. */
const ALLEREDE_REGISTRERET = "user already registered";
const INGEN_INVITATION = "database error saving new user";

export const SIGNUP_FEJL_TEKSTER = {
  alleredeRegistreret:
    "Der findes allerede en konto med den mail. Log ind i stedet — har du glemt adgangskoden, kan du nulstille den.",
  ingenInvitation:
    `Kontoen kunne ikke oprettes: der er ingen gyldig invitation til den mail. Skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig.`,
  ukendt: `Kontoen kunne ikke oprettes. Prøv igen, eller skriv til ${KONTAKT_ADRESSE}.`,
} as const;

export function signupFejl(message: string | null | undefined): SignupFejl {
  const m = (message ?? "").trim().toLowerCase();
  if (m === ALLEREDE_REGISTRERET) return { tekst: SIGNUP_FEJL_TEKSTER.alleredeRegistreret, skiftTilLogin: true };
  if (m === INGEN_INVITATION) return { tekst: SIGNUP_FEJL_TEKSTER.ingenInvitation, skiftTilLogin: false };
  return { tekst: SIGNUP_FEJL_TEKSTER.ukendt, skiftTilLogin: false };
}
