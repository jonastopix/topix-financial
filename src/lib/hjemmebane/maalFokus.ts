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
 *       Teksten siger «mod målet: <titel>». Har målet en frist i
 *       FRISTVINDUET (nedenfor), siges den også — ellers ville (3) aldrig
 *       blive hørt for et mål med skridt, fordi (1) altid vinder.
 *
 * PLADSEN på kortet afgøres IKKE her, men i nextStep.ts (slot (e)): kun (1)
 * står altid over løse skridt (f); (2) og (3) lægges under et hastende
 * aktivt (f)-skridt (rådets fund 6, 1/10).
 *   (2) FØRSTE SKRIDT: et aktivt mål uden noget i gang — intet aktivt skridt
 *       og intet ventende forslag (proposed, ikke udløbet: forslaget står i
 *       «Din plan» med knapper, så et «tilføj» oveni ville sige to ting).
 *       Mål, hvor ALLE skridt er gjort, springes over: dér er næste handling
 *       «marker som nået» (ALLE_SKRIDT_GJORT_TEKST i «Din plan»), ikke et
 *       nyt skridt. Det samme gælder et mål, hvis viste fremdrift er ≥ 100
 *       (rådets fund 8, 1/10 — fx skyderen sat til 100 på et mål uden skridt
 *       i en ældre række, der stadig står aktiv). Rækkefølge: nærmeste
 *       målfrist først (uden frist sidst), så ældste mål. Ord: «det første
 *       skridt» når målet aldrig har haft et skridt; «det næste skridt» når
 *       det har (et gjort/droppet/ikke gjort) — «første» ville være usandt dér.
 *   (3) FRIST: et aktivt mål med frist i vinduet (se FRISTVINDUET) OG
 *       fremdrift under MAAL_FRIST_FREMDRIFT_UNDER (50 %) OG ikke alle
 *       skridt gjort → «<titel>: N dage tilbage» (0 = «fristen er i dag»,
 *       negativ = «fristen er passeret»). Rådets fund 5 (1/10): et mål på
 *       vej (≥ halvvejs) eller med alle skridt gjort skal ikke skræmmes med
 *       en frist — kortet skal pege på det, der halter. Nås kun, når hverken
 *       (1) eller (2) gav et punkt — dvs. i praksis et mål med et ventende
 *       forslag og ingen aktive skridt.
 *
 * FREMDRIFTEN er den, «Din plan» viser: planen.visteFremdrift (beregnet af
 * de tællende skridt, ellers rækkens eget tal) — samme funktion som
 * planenDom, så fokuskortet og baren nedenunder aldrig er uenige.
 *
 * FRISTVINDUET (MAAL_FRIST_DAGE, MAAL_FRIST_EFTER_DAGE): en frist nævnes,
 * når −30 ≤ dage ≤ 30 — dvs. op til 30 dage FØR, og en passeret frist kun i
 * højst 30 dage EFTER (rådets fund 5, 1/10: et mål, hvis frist gik for et
 * halvt år siden, er ikke en nyhed på forsiden hver dag; det hører til en
 * snak om at flytte fristen eller parkere målet). Vinduet gælder både (3) og
 * tillægget i (1).
 *
 * DAGE: målets deadline er en date-kolonne; «i dag» er den DANSKE kalenderdag
 * (dagsdatoDansk), ikke browserens — samme dag som skridtenes frister dømmes
 * i (skridtForslag.doemFrist), og samme dag som fokusmotorens «hastende
 * skridt» (nextStep.ts, slot (e)/(f)). Regnestykket: dage = (UTC-midnat(
 * deadline) − UTC-midnat(dansk dato for nu)) / 86 400 000. Eksempel: nu =
 * 1/10-2026 kl. 23:30 UTC = 2/10 kl. 01:30 dansk → i dag = «2026-10-02»;
 * deadline «2026-10-31» → 29 dage.
 *   HVORFOR IKKE afgoerMilepael(...).dage_til_frist (rådets fund 14)?
 *   milepaelDom regner «nu» som LÆSERENS kalenderdag (browserens lokale tid,
 *   UTC i en edge function) og er spejlet i _shared/milepaelDom.ts med
 *   paritetstest — at ændre den ville flytte dommen i edge-laget og på
 *   /milestones. Her vælges den danske dato, fordi målpunktet står ved siden
 *   af skridtenes frister, som ALLE dømmes på dansk dato; i en dansk browser
 *   er de to tal ens, og kun en læser uden for dansk tid kan omkring
 *   midnat se én dags forskel mellem kortet og «Din plan»s fristtekst.
 *
 * CTA: «Tilføj skridt» og «Åbn dine mål» peger på forsidens eget anker
 * #dine-maal (rådets fund 13, 1/10) — «Din plan» står længere nede på samme
 * side med «+ Tilføj det første skridt» under hvert mål, så medlemmet bliver
 * på siden. Ankeret står inde i #din-plan (BoardroomView; dineMaal.guard dom
 * 7). Har virksomheden over tre aktive mål (gennemgangen), viser «Din plan»
 * kun tre — linjen «+N aktive mål mere» og «Se hele planen» fører videre.
 *
 * Testet i __tests__/maalFokus.test.ts.
 */
import { afgoerMilepael } from "@/lib/milepaelDom";
import { TAELLENDE_SKRIDT } from "./maal";
import { visteFremdrift } from "./planen";
import { dagsdatoDansk } from "./skridtForslag";

/** Målets frist inden for så mange dage nævnes (kilde (3) og tillægget i (1)). */
export const MAAL_FRIST_DAGE = 30;
/** En PASSERET frist nævnes i højst så mange dage efter fristen (rådets fund 5). */
export const MAAL_FRIST_EFTER_DAGE = 30;
/** Kilde (3) kun for mål med viste fremdrift UNDER denne procent (rådets fund 5). */
export const MAAL_FRIST_FREMDRIFT_UNDER = 50;

/** Er fristen i vinduet −MAAL_FRIST_EFTER_DAGE … MAAL_FRIST_DAGE? Regnestykket står i filhovedet. */
export function iFristvinduet(dage: number | null | undefined): dage is number {
  return dage != null && dage <= MAAL_FRIST_DAGE && dage >= -MAAL_FRIST_EFTER_DAGE;
}

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

/** Hele dage fra den danske dag `nu` til datoen «YYYY-MM-DD…»; null uden (læselig) dato. Regnestykket står i filhovedet.
    Bruges også af nextStep.ts til skridtenes due_date (samme danske dag). */
export function dageTilDanskDato(dato: string | null | undefined, nu: Date): number | null {
  if (!dato) return null;
  const frist = datoMs(dato);
  const idag = datoMs(dagsdatoDansk(nu));
  if (frist == null || idag == null) return null;
  return Math.round((frist - idag) / MS_PER_DOEGN);
}

/** Hele dage fra den danske dag `nu` til målets frist; null uden (læselig) frist. */
export function dageTilMaalFrist(deadline: string | null | undefined, nu: Date): number | null {
  return dageTilDanskDato(deadline, nu);
}

const erVentendeForslag = (s: MaalFokusSkridt, nu: Date): boolean =>
  s.status === "proposed" && !(s.expires_at != null && nu.getTime() > new Date(s.expires_at).getTime());

/** Målenes ÉT punkt — eller null. Kilderne og rækkefølgen står i filhovedet. */
export function maalFokus(maal: readonly MaalFokusMaal[], skridt: readonly MaalFokusSkridt[], nu: Date): MaalFokus | null {
  const aktive = maal.filter((m) => afgoerMilepael(m, nu).aktiv);
  if (aktive.length === 0) return null;
  const aktivtMaal = new Map(aktive.map((m) => [m.id, m]));
  const fristDage = new Map(aktive.map((m) => [m.id, dageTilMaalFrist(m.deadline, nu)]));
  const indenForFristen = iFristvinduet;
  const egneSkridt = (maalId: string) => skridt.filter((s) => s.maal_id === maalId);

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
    const egne = egneSkridt(m.id);
    if (egne.some((s) => s.status === "active" || erVentendeForslag(s, nu))) continue;
    const taellende = egne.filter((s) => TAELLENDE_SKRIDT.includes(s.status));
    const alleGjort = taellende.length > 0 && taellende.every((s) => s.status === "done");
    if (alleGjort) continue;
    // Fremdrift ≥ 100 (rådets fund 8): som «alle gjort» — næste handling er «nået», ikke et skridt.
    if (visteFremdrift(egne, m.progress).fremdrift >= 100) continue;
    return { art: "foerste_skridt", maalId: m.id, maalTitel: m.title, foerste: taellende.length === 0 };
  }

  // (3) Et aktivt mål med frist i vinduet, under halvvejs og ikke alle skridt gjort (rådets fund 5).
  for (const m of efterFrist) {
    const d = fristDage.get(m.id);
    if (!indenForFristen(d)) continue;
    const egne = egneSkridt(m.id);
    const taellende = egne.filter((s) => TAELLENDE_SKRIDT.includes(s.status));
    const alleGjort = taellende.length > 0 && taellende.every((s) => s.status === "done");
    if (alleGjort) continue;
    if (visteFremdrift(egne, m.progress).fremdrift >= MAAL_FRIST_FREMDRIFT_UNDER) continue;
    return { art: "frist", maalId: m.id, maalTitel: m.title, dageTilbage: d };
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
/** Forsidens eget anker for «Din plan» (rådets fund 13) — medlemmet bliver på siden; se filhovedet. */
export const MAAL_FOKUS_STI = "#dine-maal";

export function modMaaletLinje(maalTitel: string): string {
  return `mod målet: ${maalTitel}`;
}

export function foersteSkridtTitel(maalTitel: string, foerste: boolean): string {
  return `Tilføj ${foerste ? "det første" : "det næste"} skridt mod ${maalTitel}`;
}

export function fristTitel(maalTitel: string, dage: number): string {
  return `${maalTitel}: ${dageTilbageTekst(dage)}`;
}
