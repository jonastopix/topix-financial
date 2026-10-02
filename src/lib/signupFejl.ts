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
 *   signupFejl — Supabase Auths fejl → husets sætning + om formen skal
 *     skifte til login. Dommen læser `code` FØRST (30/9, m28-signupfejl-en-
 *     linje: en rigtig CFO kunne ikke oprette sin konto 28/9, og alt fik
 *     samme sætning) og `message` bagefter. Sammenligningen af teksten er
 *     case-insensitiv og trimmet; en ukendt fejl vises ALDRIG rå (den går til
 *     console.warn hos kalderen).
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

/**
 * Fristen for invitationsopslaget (30/9, m28-invitationsopslag-haenger). Før
 * ventede /auth på lookup_invite_company_info uden frist, og et svar, der
 * aldrig kom, gav en spinner for evigt. Regnestykket: opslaget er én RPC
 * (målt 22/9: REST gns. 0,37 s fra Jonas' maskine, ny forbindelse pr. kald);
 * 10 s er over 25 × det, så en langsom mobilforbindelse når det, mens et
 * udeblevet svar ikke holder personen længere, end hun venter på en side.
 */
export const INVITATIONSOPSLAG_FRIST_MS = 10_000;

/**
 * Det, opslaget «svarer» når fristen er gået: ingen data og en fejl, der ikke
 * er 22P02. afgoerInvitationslink dømmer det derfor «fejl» — samme gren som et
 * netværksfejl-svar: signup-formen som før, og triggeren (handle_new_user)
 * afgør. Aldrig «ukendt»: et udeblevet svar siger intet om, at linket er brugt.
 */
export const INVITATIONSOPSLAG_UDEBLEV = {
  data: null,
  error: { code: "frist_udloebet", message: `lookup_invite_company_info svarede ikke inden ${INVITATIONSOPSLAG_FRIST_MS} ms` },
} as const;

/** Linjen over login-formen når linket ikke svarer (ukendt). */
export const LINK_UKENDT_TEKST =
  `Linket er allerede brugt, eller det virker ikke længere. Har du oprettet din konto, så log ind herunder. Ellers skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig.`;

export interface SignupFejl {
  tekst: string;
  skiftTilLogin: boolean;
}

/** Supabase Auths tekster, som målt 16/9 — sammenlignes normaliseret. Bruges kun når koden ikke er kendt. */
const ALLEREDE_REGISTRERET = "user already registered";
const INGEN_INVITATION = "database error saving new user";

export const SIGNUP_FEJL_TEKSTER = {
  alleredeRegistreret:
    "Der findes allerede en konto med den mail. Log ind i stedet — har du glemt adgangskoden, kan du nulstille den.",
  ingenInvitation:
    `Kontoen kunne ikke oprettes: der er ingen gyldig invitation til den mail. Skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig.`,
  ukendt: `Kontoen kunne ikke oprettes. Prøv igen, eller skriv til ${KONTAKT_ADRESSE}.`,
  // 30/9: en tekst pr. kode, som medlemmet selv kan handle på.
  svagAdgangskode: "Adgangskoden er ikke stærk nok. Vælg en anden, og prøv igen.",
  forKort: "Den er for kort — vælg en længere.",
  forFaaTegn: "Den skal blande store og små bogstaver, tal og specialtegn.",
  kendtFraLaek: "Den er kendt fra datalæk — vælg en, du ikke bruger andre steder.",
  forMangeMails:
    "Der er sendt for mange mails til den adresse på kort tid. Vent lidt, og prøv igen — tjek også din indbakke og spam for en mail, vi allerede har sendt.",
  forMangeForsoeg: "Der er kommet for mange forsøg fra din forbindelse. Vent et par minutter, og prøv igen.",
  lukketForOprettelse: `Nye konti kan ikke oprettes lige nu. Skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig.`,
  mailAfvist:
    "Mailadressen kan ikke bruges. Tjek, at den er skrevet rigtigt, og at det er din egen arbejdsmail og ikke en test- eller eksempeladresse.",
  mailIkkeGodkendt: `Vi kan ikke sende en mail til den adresse endnu. Skriv til ${KONTAKT_ADRESSE}, så hjælper vi dig.`,
  formatFejl: "Noget af det, du har skrevet, er i et format, vi ikke kan bruge. Tjek mail, navn og adgangskode, og prøv igen.",
} as const;

/**
 * Det, dommen læser af fejlen. AuthError fra supabase-js opfylder formen:
 * `code` (fx «weak_password»), `message`, `status`. Ved weak_password kaster
 * klienten en AuthWeakPasswordError, hvor grundene ligger som `reasons` (auth-js
 * lib/fetch.ts + lib/errors.ts); rå svar fra serveren har dem som
 * `weak_password.reasons`. Begge læses.
 */
export interface SignupFejlInput {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  reasons?: unknown;
  weak_password?: { reasons?: unknown } | null;
}

/**
 * KILDE til koderne: Supabase Auth error codes —
 *   docs: https://supabase.com/docs/guides/auth/debugging/error-codes (slået op 30/9
 *     via Supabase docs-søgningen, service AUTH), og
 *   kode: supabase/auth internal/api/apierrors/errorcode.go + @supabase/auth-js 2.97.0
 *     src/lib/error-codes.ts.
 * Dokumentationens ordlyd pr. kode, som vi bruger:
 *   weak_password — «User is signing up or changing their password without meeting
 *     the password strength criteria.» Grunde (auth-js WeakPasswordReasons): length · characters · pwned.
 *   over_email_send_rate_limit — «Too many emails have been sent to this email address.»
 *   over_request_rate_limit — «Too many requests have been sent by this client (IP address).»
 *   signup_disabled — «Sign ups (new account creation) are disabled on the server.»
 *   email_provider_disabled — «Signups are disabled for email and password.»
 *   user_already_exists — «User with this information (email address, phone number) cannot be created again as it already exists.»
 *   email_exists — «Email address already exists in the system.»
 *   email_address_invalid — «Example and test domains are currently not supported.»
 *   email_address_not_authorized — «Email sending is not allowed for this address as your project is using the default SMTP service.»
 *   validation_failed — «Provided parameters are not in the expected format.»
 */
function svagAdgangskodeTekst(reasons: unknown): string {
  const gyldige = Array.isArray(reasons) ? reasons.filter((r): r is string => typeof r === "string") : [];
  const dele: string[] = [];
  if (gyldige.includes("length")) dele.push(SIGNUP_FEJL_TEKSTER.forKort);
  if (gyldige.includes("characters")) dele.push(SIGNUP_FEJL_TEKSTER.forFaaTegn);
  if (gyldige.includes("pwned")) dele.push(SIGNUP_FEJL_TEKSTER.kendtFraLaek);
  if (dele.length === 0) return SIGNUP_FEJL_TEKSTER.svagAdgangskode;
  return `Adgangskoden er ikke stærk nok. ${dele.join(" ")}`;
}

function fraKode(kode: string, fejl: SignupFejlInput): SignupFejl | null {
  switch (kode) {
    case "weak_password":
      return { tekst: svagAdgangskodeTekst(fejl.reasons ?? fejl.weak_password?.reasons), skiftTilLogin: false };
    case "over_email_send_rate_limit":
      return { tekst: SIGNUP_FEJL_TEKSTER.forMangeMails, skiftTilLogin: false };
    case "over_request_rate_limit":
      return { tekst: SIGNUP_FEJL_TEKSTER.forMangeForsoeg, skiftTilLogin: false };
    case "signup_disabled":
    case "email_provider_disabled":
      return { tekst: SIGNUP_FEJL_TEKSTER.lukketForOprettelse, skiftTilLogin: false };
    case "user_already_exists":
    case "email_exists":
      return { tekst: SIGNUP_FEJL_TEKSTER.alleredeRegistreret, skiftTilLogin: true };
    case "email_address_invalid":
      return { tekst: SIGNUP_FEJL_TEKSTER.mailAfvist, skiftTilLogin: false };
    case "email_address_not_authorized":
      return { tekst: SIGNUP_FEJL_TEKSTER.mailIkkeGodkendt, skiftTilLogin: false };
    case "validation_failed":
      return { tekst: SIGNUP_FEJL_TEKSTER.formatFejl, skiftTilLogin: false };
    default:
      return null;
  }
}

/** Kode FØRST, tekst bagefter. En streng er en fejl uden kode (kun message). */
export function signupFejl(fejl: SignupFejlInput | string | null | undefined): SignupFejl {
  const input: SignupFejlInput = typeof fejl === "string" ? { message: fejl } : (fejl ?? {});
  const kode = typeof input.code === "string" ? input.code.trim().toLowerCase() : "";
  if (kode) {
    const dom = fraKode(kode, input);
    if (dom) return dom;
  }
  const m = (input.message ?? "").trim().toLowerCase();
  if (m === ALLEREDE_REGISTRERET) return { tekst: SIGNUP_FEJL_TEKSTER.alleredeRegistreret, skiftTilLogin: true };
  if (m === INGEN_INVITATION) return { tekst: SIGNUP_FEJL_TEKSTER.ingenInvitation, skiftTilLogin: false };
  return { tekst: SIGNUP_FEJL_TEKSTER.ukendt, skiftTilLogin: false };
}
