/**
 * noegletalChip — «Spørg din rådgiver» ved et nøgletal (kort i mangellisten,
 * Jonas 22/9: «gør det»; historik docs/chat-design.md C12).
 *
 * MEDLEMMET klikker på et nøgletal, og chatten åbner med tallet som en CHIP
 * over sendefeltet. Medlemmet skriver sit spørgsmål; chippen følger med i
 * beskedens context_meta.noegletal og står i boblen for både medlem og rådgiver.
 *
 * BESLUTNINGER:
 *   1. CHIPPEN ER FROSSET. Navn, værdi og periode fryses ved klikket, som
 *      teksten stod på kortet, og lægges i beskeden. De slås ALDRIG op i
 *      company_facts ved visning (samme beslutning som refleksionSvar.ts nr. 1
 *      og C12: et tal, der ændrer sig efter nogen har spurgt til det, gør
 *      samtalen uforståelig). Levende henvisning venter — det er et andet kort.
 *   2. VÆRDIEN ER TEKST, som medlemmet så den («1.234.567», «45,7 %»). Motoren
 *      regner ikke og formaterer ikke; den vogter formen. Estimat-flaget følger
 *      med, så et estimat aldrig ser ud som et målt tal (dataGrundlag-kontrakten).
 *   3. FORMEN ER refleksionsCitatets: en nøgle i context_meta, en ren læser
 *      (laesNoegletalChip) der fail-closed dømmer formen ved visning, og ingen
 *      Supabase-import her. context_type røres ikke — chippen er ikke et emne.
 *   4. DEN OVERSKRIVER INTET: bygBeskedMeta lægger chippen ved siden af
 *      vedhæftninger, aldrig i stedet for dem.
 *
 * REN: ingen React, ingen Supabase. Prøvet i __tests__/noegletalChip.test.ts;
 * kildeværn noegletalChip.guard.test.ts.
 */
import { maanedOrd } from "@/lib/factsCsv";

/** Nøglen i beskedens context_meta. */
export const NOEGLETAL_META_NOEGLE = "noegletal";

/** Nøglen i router-state, når nøgletallet sender medlemmet til chatten. */
export const NOEGLETAL_STATE_NOEGLE = "spoergNoegletal";

export const NAVN_MAKS = 60;
export const VAERDI_MAKS = 40;

const NOEGLE_RE = /^[a-z][a-z0-9_]{0,39}$/;
const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Et type, ikke et interface: implicit indeks-signatur, så context_meta går som Json uden `as any`. */
export type NoegletalChip = {
  /** KPI_DEFS-nøglen («omsaetning») — hvilket tal, ikke hvad det var. */
  noegle: string;
  /** Kortets overskrift: «Omsætning». */
  navn: string;
  /** Tallet, som teksten stod på kortet: «1.234.567» eller «45,7 %». */
  vaerdi: string;
  /** period_key, «2026-09». Visningen skriver måneden ud (chipTekst). */
  periode: string;
  /** Sandt når rækken bag tallet var et estimat. */
  estimat: boolean;
};

export type ChipGrund = "ukendt_noegle" | "tomt_navn" | "for_langt_navn" | "tom_vaerdi" | "for_lang_vaerdi" | "ukendt_periode";

export type ChipDom = { ok: true; chip: Readonly<NoegletalChip> } | { ok: false; grund: ChipGrund };

/**
 * Byg chippen. Fail-closed: en nøgle, et navn, en værdi eller en periode i
 * forkert form giver en grund — aldrig en halv chip. Resultatet er en frosset
 * kopi: senere ændringer af kortets tal rører den ikke.
 */
export function bygNoegletalChip(i: {
  noegle: string;
  navn: string;
  vaerdi: string;
  periodKey: string;
  estimat: boolean;
}): ChipDom {
  if (!NOEGLE_RE.test(i.noegle)) return { ok: false, grund: "ukendt_noegle" };
  const navn = i.navn.trim();
  if (!navn) return { ok: false, grund: "tomt_navn" };
  if (navn.length > NAVN_MAKS) return { ok: false, grund: "for_langt_navn" };
  const vaerdi = i.vaerdi.trim();
  if (!vaerdi) return { ok: false, grund: "tom_vaerdi" };
  if (vaerdi.length > VAERDI_MAKS) return { ok: false, grund: "for_lang_vaerdi" };
  if (!PERIODE_RE.test(i.periodKey)) return { ok: false, grund: "ukendt_periode" };
  return { ok: true, chip: Object.freeze({ noegle: i.noegle, navn, vaerdi, periode: i.periodKey, estimat: i.estimat === true }) };
}

const erObjekt = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Chippen ud af en ukendt værdi (en beskeds context_meta.noegletal, eller
 * router-state) — KUN formen dømmes, intet slås op. Ugyldig form er «ingen chip».
 * Går gennem bygNoegletalChip, så læsning og bygning har ÉN dom.
 */
function laesChipObjekt(x: unknown): Readonly<NoegletalChip> | null {
  if (!erObjekt(x)) return null;
  if (typeof x.noegle !== "string" || typeof x.navn !== "string" || typeof x.vaerdi !== "string" || typeof x.periode !== "string") return null;
  const dom = bygNoegletalChip({ noegle: x.noegle, navn: x.navn, vaerdi: x.vaerdi, periodKey: x.periode, estimat: x.estimat === true });
  return dom.ok ? dom.chip : null;
}

/** Læs chippen ud af en beskeds context_meta ved visning — KUN derfra, aldrig et opslag. */
export function laesNoegletalChip(meta: unknown): Readonly<NoegletalChip> | null {
  if (!erObjekt(meta)) return null;
  return laesChipObjekt(meta[NOEGLETAL_META_NOEGLE]);
}

/** Læs chippen ud af router-state, når chatten åbnes fra et nøgletal. Kaster aldrig. */
export function laesChipFraState(state: unknown): Readonly<NoegletalChip> | null {
  if (!erObjekt(state)) return null;
  return laesChipObjekt(state[NOEGLETAL_STATE_NOEGLE]);
}

/** Chippens tekst: «Omsætning: 1.234.567 · September 2026 · estimat». */
export function chipTekst(chip: NoegletalChip): string {
  return `${chip.navn}: ${chip.vaerdi} · ${maanedOrd(chip.periode)}${chip.estimat ? " · estimat" : ""}`;
}

/** Adressen og state, når medlemmet klikker «Spørg din rådgiver». */
export function spoergRaadgiverRejse(chip: NoegletalChip): { to: string; state: Record<string, NoegletalChip> } {
  return { to: "/chat", state: { [NOEGLETAL_STATE_NOEGLE]: chip } };
}

/**
 * Knappen findes KUN for et medlem med adgang til rådgiverchatten: ikke for en
 * rådgiver (en rådgiver spørger ikke sig selv — og «Se som medlem» sender ellers
 * en besked som rådgiver) og ikke for abonnenter, hvis chat er en mur. Uden
 * kendt niveau (henter endnu) vises den ikke.
 */
export function maaSpoergeRaadgiver(i: { erRaadgiver: boolean; tier: "full" | "subscriber" | "expired" | null }): boolean {
  return !i.erRaadgiver && i.tier === "full";
}

/**
 * Beskedens context_meta: vedhæftninger og chip side om side. Uden nogen af
 * dem: undefined (så feltet slet ikke sendes, som før).
 */
export function bygBeskedMeta(i: {
  attachments?: readonly unknown[];
  chip?: Readonly<NoegletalChip> | null;
}): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (i.attachments && i.attachments.length > 0) meta.attachments = i.attachments;
  if (i.chip) meta[NOEGLETAL_META_NOEGLE] = { ...i.chip };
  return Object.keys(meta).length > 0 ? meta : undefined;
}
