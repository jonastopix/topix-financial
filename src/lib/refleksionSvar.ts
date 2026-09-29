/**
 * refleksionSvar — rådgiverens svar på ét felt i medlemmets refleksion, som
 * en besked i chatten (29/9-2026; kort m28-refleksion-svar).
 *
 * JONAS 28/9: «Morten og jeg skal kunne svare/kommentere direkte på felterne i
 * refleksionen på virksomhedssiderne, så svaret ender i chatten.» Grundlaget
 * er ~/Downloads/recon-to-oensker.md §4–§6: felterne har ingen identitet
 * (tre kolonner på én række pr. måned, ingen updated_at), og medlemmet kan
 * overskrive rækken via /pulse?period= efter svaret.
 *
 * BESLUTNINGER (29/9):
 *   1. Svaret bærer et FROSSET citat af feltet, som det stod, da der blev
 *      svaret — refleksionen er et øjebliksbillede (Jonas 28/9). Citatet bor
 *      i context_meta.citat og slås ALDRIG op i pulse_checkins ved visning
 *      (modsat svar_paa_id, der følger beskeden). Højst CITAT_MAKS tegn med «…».
 *   2. Mail og klokke er uændrede («Ny besked fra din rådgiver»).
 *
 * FORMEN er rapportkommentarens (VirksomhedView.tsx RapportRaekke.sendKommentar):
 * message_type "user", ren tekst i content, context_type/context_id/context_meta
 * — så beskeden går samme vej gennem notifyChatMessage, Slack, klokke og
 * conversations.last_advisor_reply_at (triggeren i 20260311050600 — som også
 * lukker forsidens «refleksion_hjaelp»-linje, forsidensDom.refleksionBesvaret).
 *
 * Feltets korte navn er virksomhedssidens egne etiketter (Blok2's Ord-labels);
 * måneden er husets maanedOrd («September 2026»), ikke en egen liste.
 *
 * REN: ingen React, ingen Supabase. Prøvet i __tests__/refleksionSvar.test.ts;
 * kildeværn refleksionSvar.guard.test.ts.
 */
import { maanedOrd } from "@/lib/factsCsv";
import type { RefleksionsNoegle } from "@/lib/hjemmebane/refleksioner";

/** context_type på beskeden — chippen i begge paner kender ordet (chatShared.TOPIC_COLORS). */
export const REFLEKSION_CONTEXT_TYPE = "refleksion";

/** Citatet fryses og afkortes — en mail på 2.000 tegn skal ikke bære 2.000 tegn citat. */
export const CITAT_MAKS = 500;

/** Samme loft som rapportkommentaren (VirksomhedView: maxLength 2000). */
export const SVAR_MAKS = 2000;

/** Feltets korte navn — virksomhedssidens egne etiketter, i modalens rækkefølge. */
export const FELT_KORT: Readonly<Record<RefleksionsNoegle, string>> = {
  went_well: "Hvad gik godt",
  biggest_challenge: "Største udfordring",
  help_needed: "Søger hjælp til",
};

export const REFLEKSIONS_NOEGLER: readonly RefleksionsNoegle[] = ["went_well", "biggest_challenge", "help_needed"];

/**
 * Et `type`, ikke et `interface`: kun et objekttype-alias har den implicitte
 * indeks-signatur, Supabases `Json` kræver — så insert'et i messages går uden
 * `as any` (rapportkommentaren har stadig sit).
 */
export type RefleksionsSvarMeta = {
  /** «Refleksion September 2026 · Største udfordring» — chippens «Re: …». */
  title: string;
  felt: RefleksionsNoegle;
  /** Feltet, som det stod, da der blev svaret. Frosset. */
  citat: string;
  period_key: string;
};

/** Det, der indsættes i messages ud over conversation_id, sender_id og message_type. */
export interface RefleksionsSvar {
  content: string;
  context_type: typeof REFLEKSION_CONTEXT_TYPE;
  context_id: string;
  context_meta: RefleksionsSvarMeta;
}

export type SvarGrund = "tomt_svar" | "for_langt_svar" | "tomt_felt" | "ukendt_felt" | "ingen_refleksion";

export type SvarDom = { ok: true; besked: RefleksionsSvar } | { ok: false; grund: SvarGrund };

/** Citatet, frosset: trimmet, højst `maks` tegn, «…» når det er afkortet. Linjeskift bevares. */
export function afkortCitat(tekst: string, maks: number = CITAT_MAKS): string {
  const t = tekst.trim();
  if (t.length <= maks) return t;
  return `${t.slice(0, maks - 1).trimEnd()}…`;
}

/** «Refleksion September 2026 · Største udfordring». */
export function refleksionsTitel(periodKey: string, felt: RefleksionsNoegle): string {
  return `Refleksion ${maanedOrd(periodKey)} · ${FELT_KORT[felt]}`;
}

export function erRefleksionsNoegle(felt: string): felt is RefleksionsNoegle {
  return (REFLEKSIONS_NOEGLER as readonly string[]).includes(felt);
}

/**
 * Byg beskeden. Fail-closed: tomt svar, for langt svar, tomt felt, ukendt
 * felt eller manglende refleksion giver en grund — aldrig en halv besked.
 */
export function bygRefleksionsSvar(i: {
  checkin: { id: string | null | undefined; period_key: string | null | undefined };
  felt: string;
  /** Feltets tekst, som den står på virksomhedssiden i det øjeblik, der svares. */
  feltTekst: string | null | undefined;
  svar: string;
}): SvarDom {
  if (!i.checkin.id || !i.checkin.period_key) return { ok: false, grund: "ingen_refleksion" };
  if (!erRefleksionsNoegle(i.felt)) return { ok: false, grund: "ukendt_felt" };
  const citat = afkortCitat(i.feltTekst ?? "");
  if (!citat) return { ok: false, grund: "tomt_felt" };
  const content = i.svar.trim();
  if (!content) return { ok: false, grund: "tomt_svar" };
  if (content.length > SVAR_MAKS) return { ok: false, grund: "for_langt_svar" };
  return {
    ok: true,
    besked: {
      content,
      context_type: REFLEKSION_CONTEXT_TYPE,
      context_id: i.checkin.id,
      context_meta: {
        title: refleksionsTitel(i.checkin.period_key, i.felt),
        felt: i.felt,
        citat,
        period_key: i.checkin.period_key,
      },
    },
  };
}

/** Læs citatet ud af en beskeds context_meta ved visning — KUN derfra, aldrig et opslag. */
export function laesRefleksionsCitat(meta: unknown): { citat: string; felt: string | null } | null {
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.citat !== "string" || !m.citat.trim()) return null;
  return { citat: m.citat, felt: typeof m.felt === "string" ? m.felt : null };
}

const KLOKKE = new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Den stille linje under feltet: «Svaret i chatten kl. 10.42». Ulæselig tid → uden klokkeslæt. */
export function svaretIChattenTekst(sendtAt: string | Date): string {
  const d = typeof sendtAt === "string" ? new Date(sendtAt) : sendtAt;
  if (Number.isNaN(d.getTime())) return "Svaret i chatten";
  return `Svaret i chatten kl. ${KLOKKE.format(d)}`;
}
