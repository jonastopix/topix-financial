/**
 * src/lib/raadgiverOpgaver.ts
 *
 * Dommen over rådgivernes to-do-liste — ren og testet
 * (src/lib/__tests__/raadgiverOpgaver.test.ts). Tabellen er
 * raadgiver_opgaver (migration 20260908170000); fladen er /opgaver
 * (OpgavelisteView); skrivevejen er hooks/raadgiverOpgaver.ts.
 *
 * BESLUTTET af Jonas 8/9: en liste VED SIDEN AF forsiden. Frit skrevet,
 * ingen virksomhed kommer automatisk på. «Notifikationer er måske dumme,
 * men det der med at den sorterer efter deadline giver god mening.»
 * Fristen sorterer derfor; den notificerer ikke.
 *
 * RÆKKEFØLGEN (sammenlignOpgaver), og hvorfor:
 *   1. forfaldne øverst, den ældste frist først — det der er MEST for
 *      sent står højest. Jonas: «det skal SES, ikke skjules».
 *   2. frist i dag, så kommende efter frist (nærmeste først).
 *   3. uden frist sidst, nyeste først — en huskeseddel læses ovenfra, og
 *      det man lige skrev er det man leder efter.
 *   Inden for lige frist: ældst oprettet først, så to punkter med samme
 *   dag ikke bytter plads fra dag til dag.
 *
 * KIRKEGÅRDEN (21 af 27 milepæle forfaldne, den ældste 145 dage — målt 8/9):
 *   - Intet ÅBENT punkt lukkes, skjules eller begrænses automatisk. Et
 *     forfaldent punkt står øverst med «Forfaldt for N dage siden» i rust,
 *     og et udateret punkt ældre end GAMMEL_DAGE mærkes «ligger N dage» —
 *     alderen er synlig, så listen selv siger når den er ved at blive en
 *     kirkegård. Grænsen er ikke i data; den er i øjnene.
 *   - GJORTE punkter forlader fladen efter GJORT_SYNLIG_DAGE. Rækken bliver
 *     i tabellen (det er en log), men listen viser kun de seneste, så «Gjort»
 *     ikke vokser til hundrede linjer. Det er den eneste grænse.
 *
 * DAGE regnes som kalenderdage på læserens dag, samme regning som
 * milepaelDom.dageTilFrist (frist er en date-kolonne, «YYYY-MM-DD»).
 */

import { dageTilFrist } from "./milepaelDom";

export type OpgaveStatus = "aaben" | "gjort";

export interface RaadgiverOpgave {
  id: string;
  tekst: string;
  ejer_id: string;
  oprettet_af: string;
  company_id: string | null;
  /** «YYYY-MM-DD» eller null. */
  frist: string | null;
  status: OpgaveStatus;
  gjort_at: string | null;
  created_at: string;
}

export type OpgaveTilstand = "forfalden" | "i_dag" | "kommende" | "uden_frist" | "gjort";

export interface OpgaveDom {
  tilstand: OpgaveTilstand;
  /** Hele kalenderdage til fristen; negativ = passeret; null uden frist. */
  dage_til_frist: number | null;
  /** Hele dage siden punktet blev skrevet. */
  alder_dage: number;
  /** Udateret og ældre end GAMMEL_DAGE — mærkes, skjules ikke. */
  gammel: boolean;
}

/** Et udateret punkt ældre end dette mærkes med sin alder. */
export const GAMMEL_DAGE = 30;
/** Gjorte punkter vises på fladen så længe; rækken bliver i tabellen. */
export const GJORT_SYNLIG_DAGE = 30;

const MS_PER_DOEGN = 86_400_000;

function heleDageSiden(iso: string, nu: Date): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((nu.getTime() - t) / MS_PER_DOEGN));
}

export function afgoerOpgave(o: Pick<RaadgiverOpgave, "frist" | "status" | "created_at">, nu: Date): OpgaveDom {
  const dage = dageTilFrist(o.frist, nu);
  const alder = heleDageSiden(o.created_at, nu);
  if (o.status === "gjort") return { tilstand: "gjort", dage_til_frist: dage, alder_dage: alder, gammel: false };
  const tilstand: OpgaveTilstand =
    dage == null ? "uden_frist" : dage < 0 ? "forfalden" : dage === 0 ? "i_dag" : "kommende";
  return { tilstand, dage_til_frist: dage, alder_dage: alder, gammel: tilstand === "uden_frist" && alder > GAMMEL_DAGE };
}

/** Åbne punkter: forfaldne (ældst først), i dag, kommende (nærmeste først),
    uden frist (nyest først). Se filhovedet. */
export function sammenlignOpgaver(a: RaadgiverOpgave, b: RaadgiverOpgave, nu: Date): number {
  const da = afgoerOpgave(a, nu);
  const db = afgoerOpgave(b, nu);
  const aFrist = da.dage_til_frist;
  const bFrist = db.dage_til_frist;
  if (aFrist != null && bFrist != null) {
    if (aFrist !== bFrist) return aFrist - bFrist;
    return a.created_at.localeCompare(b.created_at);
  }
  if (aFrist != null) return -1;
  if (bFrist != null) return 1;
  return b.created_at.localeCompare(a.created_at);
}

export interface OpgaveListe {
  aabne: RaadgiverOpgave[];
  /** Gjorte inden for GJORT_SYNLIG_DAGE, senest gjort først. */
  gjorte: RaadgiverOpgave[];
  /** Gjorte ældre end GJORT_SYNLIG_DAGE — tælles, vises ikke. */
  gjorteSkjult: number;
  forfaldne: number;
}

export function delListe(opgaver: readonly RaadgiverOpgave[], nu: Date): OpgaveListe {
  const aabne = opgaver.filter((o) => o.status !== "gjort").sort((a, b) => sammenlignOpgaver(a, b, nu));
  const alleGjorte = opgaver.filter((o) => o.status === "gjort");
  const synlige = alleGjorte
    .filter((o) => heleDageSiden(o.gjort_at ?? o.created_at, nu) <= GJORT_SYNLIG_DAGE)
    .sort((a, b) => (b.gjort_at ?? "").localeCompare(a.gjort_at ?? ""));
  return {
    aabne,
    gjorte: synlige,
    gjorteSkjult: alleGjorte.length - synlige.length,
    forfaldne: aabne.filter((o) => afgoerOpgave(o, nu).tilstand === "forfalden").length,
  };
}

function flertal(n: number, ental: string, flertal: string): string {
  return `${n} ${n === 1 ? ental : flertal}`;
}

/** Fristens ord — husets: «i dag / i morgen / om N dage», «Forfaldt for N dage siden». */
export function fristTekst(dom: OpgaveDom): string {
  const d = dom.dage_til_frist;
  if (d == null) return dom.gammel ? `Ingen frist · ligger ${flertal(dom.alder_dage, "dag", "dage")}` : "Ingen frist";
  if (d < 0) return d === -1 ? "Forfaldt i går" : `Forfaldt for ${flertal(-d, "dag", "dage")} siden`;
  if (d === 0) return "I dag";
  if (d === 1) return "I morgen";
  return `Om ${d} dage`;
}
