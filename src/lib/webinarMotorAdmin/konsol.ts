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
 * Leveringens status i ord. Pulsen leverer kun til en seer, der stadig pulser —
 * svar på mail til den, der er gået, er skive 5 og ikke bygget; teksten lover det ikke.
 */
export function leveringTekst(s: Pick<KonsolSpoergsmaal, "status" | "leveret" | "leveret_at">): string {
  if (s.status === "ny") return "Ubesvaret";
  if (s.status !== "besvaret") return s.status;
  if (s.leveret === "live" && s.leveret_at) return `Set i rummet kl. ${klok(s.leveret_at)}`;
  if (s.leveret === "mail" && s.leveret_at) return `Sendt på mail kl. ${klok(s.leveret_at)}`;
  return "Besvaret — vises, når seeren er i rummet";
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
 * Efter en UPDATE med 0 rækker: læs rækken igen. Står den stadig «ny», nægtede
 * RLS (migration 20261003050000 er ikke kørt) — ellers har en anden svaret imens.
 */
export function nulRaekkerGrund(statusNu: string | null): "kraever_migration" | "besvaret_imens" | "forsvundet" {
  if (statusNu === null) return "forsvundet";
  return statusNu === "ny" ? "kraever_migration" : "besvaret_imens";
}

export const NUL_RAEKKER_TEKST: Record<ReturnType<typeof nulRaekkerGrund>, string> = {
  kraever_migration: "Svaret blev ikke gemt: konsollen kan først svare, når migrationen 20261003050000 er kørt.",
  besvaret_imens: "En anden har svaret på spørgsmålet imens.",
  forsvundet: "Spørgsmålet findes ikke længere.",
};
