/**
 * Værtskonsollen (minimal) — rene domme bag /webinar/motor/session/:id
 * (3/10-2026, docs/webinarmotor.md §7.7). Hook = I/O (hooks/webinarKonsol.ts),
 * lib = dom (her). Ingen Supabase, intet ur: tiden gives ind.
 *
 * Svarvejen til seeren (målt i koden, webinar-puls trin 3): pulsen læser
 * rækker med status «besvaret» og leveret = null og sender svar_tekst; derefter
 * sætter den leveret = «live». Konsollen skriver derfor KUN status, svar_tekst
 * og svaret_af (svaret_at sættes af databasens trigger på serverens ur) —
 * migration 20261003050000 håndhæver det samme.
 */
import { positionDom, type Position, type SessionUr } from "@/lib/webinarMotor/ur";
import { I_RUMMET_SEK } from "@/lib/webinarMotor/puls";
import { erManglendeKolonne, erManglendeTabel } from "@/lib/manglendeTabel";
import { tidskode } from "@/lib/webinarMotorAdmin/opsaetning";
import { laesSvarMailLaas, SVAR_MAIL_GAAET_SEK } from "@/lib/webinarMotor/svarMail";

/** Spørgsmålskøen hentes hvert 10. sekund — ingen Realtime (spec §D3). */
export const KONSOL_POLL_MS = 10_000;
/** Serverens ur måles igen hvert minut (urForskydning tager den korteste rundtur). */
export const KONSOL_UR_MAAL_MS = 60_000;
/** Svarets længde efter trim — samme grænse som triggeren i 20261003050000. */
export const KONSOL_SVAR_MIN = 1;
export const KONSOL_SVAR_MAKS = 1000;

/** Opsætningens sti (konsollens «tilbage»-link) — App.tsx og denne fil er de eneste, der nævner stierne. */
export const OPSAETNING_STI = "/webinar/motor";

/** Den eneste sti til konsollen (også linket fra /webinar/motor). */
export const konsolSti = (sessionId: string): string => `${OPSAETNING_STI}/session/${encodeURIComponent(sessionId)}`;

export interface KonsolSpoergsmaal {
  id: string;
  tekst: string;
  /** null = stillet før start (i lobbyen). */
  pos_sek: number | null;
  stillet_at: string;
  art: string;
  status: string;
  svar_tekst: string | null;
  svaret_at: string | null;
  leveret: string | null;
  leveret_at: string | null;
  /** Svarmailens udfald (sendt · ukendt · afvist; null = intet mailforsøg) — migration 20261003080000. */
  mail_udfald: string | null;
  /** webinar_tilmeldinger.fornavn — det ENESTE personfelt, konsollen henter. */
  fornavn: string | null;
}

/** Nyeste øverst; samme tidspunkt → id, så rækkefølgen er stabil mellem to hentninger. */
export function sorterKoe<T extends { id: string; stillet_at: string }>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => {
    const d = Date.parse(b.stillet_at) - Date.parse(a.stillet_at);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Ubesvaret = status «ny». Kun et ubesvaret spørgsmål får et svarfelt (ét svar pr. spørgsmål). */
export const erUbesvaret = (s: Pick<KonsolSpoergsmaal, "status">): boolean => s.status === "ny";

/** Svarfeltet vises KUN for et ubesvaret spørgsmål og ALDRIG for en tjenestekonto (den ser, den svarer ikke — RLS siger det samme). */
export const visSvarfelt = (s: Pick<KonsolSpoergsmaal, "status">, erTjenestekonto: boolean): boolean => !erTjenestekonto && erUbesvaret(s);

export type SvarDom = { ok: true; svar: string } | { ok: false; fejl: "tom" | "for_lang" };

/** Svarets validering: trim, 1–1000 tegn. */
export function laesSvar(raa: string | null | undefined): SvarDom {
  const svar = (raa ?? "").trim();
  if (svar.length < KONSOL_SVAR_MIN) return { ok: false, fejl: "tom" };
  if (svar.length > KONSOL_SVAR_MAKS) return { ok: false, fejl: "for_lang" };
  return { ok: true, svar };
}

export const SVAR_FEJL_TEKST: Record<"tom" | "for_lang", string> = {
  tom: "Skriv et svar.",
  for_lang: `Højst ${KONSOL_SVAR_MAKS} tegn.`,
};

/** «før start» eller tidskoden i videoen. */
export const posTekst = (pos: number | null): string => (pos === null ? "før start" : tidskode(pos));

const klok = (iso: string): string =>
  new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

/**
 * Leveringens status i ord. Pulsen leverer til en seer, der stadig pulser
 * («live»); webinar-motor-cron leverer på mail til den, der er gået (skive 5,
 * §7.10) — kun med låsen åben, så «mail» står kun på rækken, når det skete.
 */
export function leveringTekst(s: Pick<KonsolSpoergsmaal, "status" | "leveret" | "leveret_at"> & { mail_udfald?: string | null }): string {
  if (s.status === "ny") return "Ubesvaret";
  if (s.status !== "besvaret") return s.status;
  if (s.leveret === "live" && s.leveret_at) return `Set i rummet kl. ${klok(s.leveret_at)}`;
  // Mail skelnes på rækkens udfald (CTO 3/10, fund 7): sendt · ukendt · (under afsendelse).
  if (s.leveret === "mail" && s.leveret_at) {
    if (s.mail_udfald === "sendt") return `Sendt på mail kl. ${klok(s.leveret_at)}`;
    if (s.mail_udfald === "ukendt") return `Forsøgt sendt på mail kl. ${klok(s.leveret_at)} — det vides ikke, om den kom frem`;
    return `Sendes på mail (kl. ${klok(s.leveret_at)})`;
  }
  if (s.mail_udfald === "afvist") return "Mailen blev afvist — svaret vises, hvis seeren kommer tilbage i rummet";
  return "Besvaret — vises, når seeren er i rummet";
}

/**
 * Låsens værdi, som hooken læste den: true/false — eller null, når den ikke kunne
 * læses (fail-soft: teksten siger så, at det ikke vides). En manglende række er
 * false (låsen er fraværende = lukket, som i cronen).
 */
export function laasFraRaekke(raekke: { config_value?: unknown } | null, fejl: unknown): boolean | null {
  if (fejl) return null;
  return raekke === null ? false : laesSvarMailLaas(raekke.config_value);
}

/**
 * Konsollens løfte om leveringen — ÉN dom, så teksten følger låsen
 * (app_config.webinar_svar_mail_aktiv, den samme, cronen læser):
 *   true  → svaret går på mail, når seeren er gået (ingen puls i 3 min) eller sessionen er slut;
 *   false → der sendes intet på mail;
 *   null  → låsen kunne ikke læses; teksten lover intet.
 */
export function svarLoefteTekst(laas: boolean | null): string {
  const rummet = "Svaret vises for seeren ved næste puls, hvis seeren stadig er i rummet";
  const min = Math.round(SVAR_MAIL_GAAET_SEK / 60);
  if (laas === true) return `${rummet}. Er seeren gået (ingen puls i ${min} min), eller er sessionen slut, sendes svaret på mail inden for ca. 5 minutter — hvis seeren kan modtage mail (ikke afmeldt, og adressen tager imod).`;
  if (laas === false) return `${rummet} — der sendes intet på mail (svarmailen er slået fra).`;
  return `${rummet}. Om svaret også sendes på mail til den, der er gået, kan ikke læses lige nu.`;
}

export const RUM_ORD: Record<Position["rum"], string> = {
  foer_lobby: "Før venteværelset",
  lobby: "Venteværelset",
  intro: "Intro",
  afspilning: "Webinaret kører",
  exitrum: "Exitrummet",
  afsluttet: "Afsluttet",
  aflyst: "Aflyst",
};

/** Motorens positionDom på serverens ur: klientens ur + forskydningen (urForskydning). */
export function konsolPosition(ur: SessionUr, klientNuMs: number, forskydningMs: number): Position {
  return positionDom(ur, klientNuMs + forskydningMs);
}

/** «I rummet nu» = en puls inden for I_RUMMET_SEK (samme vindue som pulsens tal), på serverens ur. */
export const iRummetSiden = (serverNuMs: number): string => new Date(serverNuMs - I_RUMMET_SEK * 1000).toISOString();

/**
 * Konsollens fejl i én dom: en manglende tabel/kolonne (skive 1 ikke kørt)
 * er «migration» — fladen står roligt; alt andet er en fejl, der skal ses.
 */
export function konsolFejlArt(fejl: { code?: string | null; message?: string | null } | null | undefined): "migration" | "fejl" {
  return erManglendeTabel(fejl) || erManglendeKolonne(fejl) ? "migration" : "fejl";
}

/**
 * Efter en UPDATE med 0 rækker: læs rækken igen. En tjenestekonto har aldrig
 * UPDATE (politikken udelukker den) — det er grunden, uanset status. Står rækken
 * ellers stadig «ny», nægtede RLS (migration 20261003050000 er ikke kørt) — ellers
 * har en anden svaret imens.
 */
export function nulRaekkerGrund(statusNu: string | null, erTjenestekonto = false): "tjenestekonto" | "kraever_migration" | "besvaret_imens" | "forsvundet" {
  if (erTjenestekonto) return "tjenestekonto";
  if (statusNu === null) return "forsvundet";
  return statusNu === "ny" ? "kraever_migration" : "besvaret_imens";
}

export const NUL_RAEKKER_TEKST: Record<ReturnType<typeof nulRaekkerGrund>, string> = {
  tjenestekonto: "En tjenestekonto kan se konsollen, men ikke svare.",
  kraever_migration: "Svaret blev ikke gemt: konsollen kan først svare, når migrationen 20261003050000 er kørt.",
  besvaret_imens: "En anden har svaret på spørgsmålet imens.",
  forsvundet: "Spørgsmålet findes ikke længere.",
};
