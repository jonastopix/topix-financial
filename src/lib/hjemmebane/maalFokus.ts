/**
 * src/lib/hjemmebane/maalFokus.ts — målenes kilde i «Dit næste skridt»
 * (forsidens fokusmotor, slot (e)), genindført 1/10-2026.
 *
 * Jonas 1/10: «Dine mål» skal være «meget skarpere … et vigtigt fundament for
 * hele arbejdet over 12 mdr». Målt i prod 1/10: 36 aktive mål hos 14 af 30
 * kunder, 6 med ≥ 1 skridt. Slot (e) var UDGÅET siden «Én plan» fase 3 (16/9)
 * — målet stod kun i «Din plan» længere nede, og fokuskortet øverst nævnte
 * det aldrig. Designet: maal-produkt.md §4 «Forside — Dit næste skridt».
 *
 * REN: ingen React, ingen Supabase, ingen Date.now() — tiden gives ind som
 * `nu`. Kalderen (BoardroomView) giver de rækker, forsiden ALLEREDE henter
 * (milestonesQuery + skridtQuery) — ingen ny hentning.
 *
 * ÉT PUNKT, ALDRIG FLERE. Tre kilder i fast rækkefølge — den første, der
 * giver noget, vinder:
 *   (1) SKRIDT: det nærmeste AKTIVE skridt (status 'active', med frist —
 *       databasen kræver frist på et aktivt skridt) under et AKTIVT mål
 *       (afgoerMilepael(...).aktiv: ikke parkeret, ikke nået). Nærmeste =
 *       tidligste due_date; uafgjort → målets created_at, så skridtets id.
 *       Teksten siger «mod målet: <titel>». Har målet en frist inden for
 *       MAAL_FRIST_DAGE, siges den også — ellers ville (3) aldrig blive hørt
 *       for et mål med skridt, fordi (1) altid vinder.
 *   (2) FØRSTE SKRIDT: et aktivt mål uden noget i gang — intet aktivt skridt
 *       og intet ventende forslag (proposed, ikke udløbet: forslaget står i
 *       «Din plan» med knapper, så et «tilføj» oveni ville sige to ting).
 *       Mål, hvor ALLE skridt er gjort, springes over: dér er næste handling
 *       «marker som nået» (ALLE_SKRIDT_GJORT_TEKST i «Din plan»), ikke et
 *       nyt skridt. Rækkefølge: nærmeste målfrist først (uden frist sidst),
 *       så ældste mål. Ord: «det første skridt» når målet aldrig har haft et
 *       skridt; «det næste skridt» når det har (et gjort/droppet/ikke gjort)
 *       — «første» ville være usandt dér.
 *   (3) FRIST: et aktivt mål med frist ≤ MAAL_FRIST_DAGE dage (dansk dato)
 *       → «<titel>: N dage tilbage» (0 = «fristen er i dag», negativ =
 *       «fristen er passeret»). Nås kun, når hverken (1) eller (2) gav et
 *       punkt — dvs. i praksis et mål med et ventende forslag og ingen aktive
 *       skridt (eller alle skridt gjort).
 *
 * DAGE: målets deadline er en date-kolonne; «i dag» er den DANSKE kalenderdag
 * (dagsdatoDansk), ikke browserens — samme dag som skridtenes frister dømmes
 * i (skridtForslag.doemFrist). Regnestykket: dage = (UTC-midnat(deadline) −
 * UTC-midnat(dansk dato for nu)) / 86 400 000. Eksempel: nu = 1/10-2026 kl.
 * 23:30 UTC = 2/10 kl. 01:30 dansk → i dag = «2026-10-02»; deadline
 * «2026-10-31» → 29 dage.
 *
 * Testet i __tests__/maalFokus.test.ts.
 */
import { afgoerMilepael } from "@/lib/milepaelDom";
import { TAELLENDE_SKRIDT } from "./maal";
import { dagsdatoDansk } from "./skridtForslag";

/** Målets frist inden for så mange dage nævnes (kilde (3) og tillægget i (1)). */
export const MAAL_FRIST_DAGE = 30;

/** Det af milestones-rækken dommen læser (et udsnit af planen.MaalRaekke). */
export interface MaalFokusMaal {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  deadline: string | null;
  created_at: string;
}

/** Det af company_actions-rækken dommen læser (forsidens skridtQuery). */
export interface MaalFokusSkridt {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  maal_id: string | null;
  /** Kun forslag har en; et forslag med passeret expires_at tæller ikke som «i gang» (B8 på læsesiden). Valgfri. */
  expires_at?: string | null;
}

export type MaalFokus =
  | { art: "skridt"; maalId: string; maalTitel: string; skridtId: string; skridtTitel: string; frist: string; maalDageTilbage: number | null }
  | { art: "foerste_skridt"; maalId: string; maalTitel: string; foerste: boolean }
  | { art: "frist"; maalId: string; maalTitel: string; dageTilbage: number };

const MS_PER_DOEGN = 86_400_000;

function datoMs(dato: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dato);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Hele dage fra den danske dag `nu` til fristen; null uden (læselig) frist. Regnestykket står i filhovedet. */
export function dageTilMaalFrist(deadline: string | null | undefined, nu: Date): number | null {
  if (!deadline) return null;
  const frist = datoMs(deadline);
  const idag = datoMs(dagsdatoDansk(nu));
  if (frist == null || idag == null) return null;
  return Math.round((frist - idag) / MS_PER_DOEGN);
}

const erVentendeForslag = (s: MaalFokusSkridt, nu: Date): boolean =>
  s.status === "proposed" && !(s.expires_at != null && nu.getTime() > new Date(s.expires_at).getTime());

/** Målenes ÉT punkt — eller null. Kilderne og rækkefølgen står i filhovedet. */
export function maalFokus(maal: readonly MaalFokusMaal[], skridt: readonly MaalFokusSkridt[], nu: Date): MaalFokus | null {
  const aktive = maal.filter((m) => afgoerMilepael(m, nu).aktiv);
  if (aktive.length === 0) return null;
  const aktivtMaal = new Map(aktive.map((m) => [m.id, m]));
  const fristDage = new Map(aktive.map((m) => [m.id, dageTilMaalFrist(m.deadline, nu)]));
  const indenForFristen = (d: number | null | undefined): d is number => d != null && d <= MAAL_FRIST_DAGE;

  // (1) Nærmeste aktive skridt under et aktivt mål.
  const kandidater = skridt
    .filter((s) => s.status === "active" && s.due_date && s.maal_id && aktivtMaal.has(s.maal_id))
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return (a.due_date as string) < (b.due_date as string) ? -1 : 1;
      const ma = aktivtMaal.get(a.maal_id as string)!.created_at;
      const mb = aktivtMaal.get(b.maal_id as string)!.created_at;
      if (ma !== mb) return ma < mb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const naermeste = kandidater[0];
  if (naermeste) {
    const m = aktivtMaal.get(naermeste.maal_id as string)!;
    const d = fristDage.get(m.id);
    return {
      art: "skridt",
      maalId: m.id,
      maalTitel: m.title,
      skridtId: naermeste.id,
      skridtTitel: naermeste.title,
      frist: naermeste.due_date as string,
      maalDageTilbage: indenForFristen(d) ? d : null,
    };
  }

  // Nærmeste målfrist først (uden frist sidst), så ældste mål.
  const efterFrist = [...aktive].sort((a, b) => {
    const da = fristDage.get(a.id) ?? null;
    const db = fristDage.get(b.id) ?? null;
    if (da !== db) {
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    }
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });

  // (2) Et aktivt mål uden noget i gang.
  for (const m of efterFrist) {
    const egne = skridt.filter((s) => s.maal_id === m.id);
    if (egne.some((s) => s.status === "active" || erVentendeForslag(s, nu))) continue;
    const taellende = egne.filter((s) => TAELLENDE_SKRIDT.includes(s.status));
    const alleGjort = taellende.length > 0 && taellende.every((s) => s.status === "done");
    if (alleGjort) continue;
    return { art: "foerste_skridt", maalId: m.id, maalTitel: m.title, foerste: taellende.length === 0 };
  }

  // (3) Et aktivt mål med frist inden for MAAL_FRIST_DAGE.
  for (const m of efterFrist) {
    const d = fristDage.get(m.id);
    if (indenForFristen(d)) return { art: "frist", maalId: m.id, maalTitel: m.title, dageTilbage: d };
  }
  return null;
}

/** «12 dage tilbage» / «1 dag tilbage» / «fristen er i dag» / «fristen er passeret». */
export function dageTilbageTekst(dage: number): string {
  if (dage < 0) return "fristen er passeret";
  if (dage === 0) return "fristen er i dag";
  return dage === 1 ? "1 dag tilbage" : `${dage} dage tilbage`;
}

/** Ordene på fokuskortet — ét sted. */
export const MAAL_FOKUS_SKRIDT_CTA = "Se dine skridt";
export const MAAL_FOKUS_MAAL_CTA = "Åbn dine mål";
export const MAAL_FOKUS_TILFOEJ_CTA = "Tilføj skridt";
export const MAAL_FOKUS_STI = "/milestones";

export function modMaaletLinje(maalTitel: string): string {
  return `mod målet: ${maalTitel}`;
}

export function foersteSkridtTitel(maalTitel: string, foerste: boolean): string {
  return `Tilføj ${foerste ? "det første" : "det næste"} skridt mod ${maalTitel}`;
}

export function fristTitel(maalTitel: string, dage: number): string {
  return `${maalTitel}: ${dageTilbageTekst(dage)}`;
}
