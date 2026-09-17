/**
 * src/lib/hjemmebane/planen.ts — «Én plan pr. virksomhed», fase 2 (16/9-2026).
 *
 * REN dom for rådgiverens «Planen» på virksomhedssiden (VirksomhedView blok
 * 6, kortet der før hed «Milestones»): målene (højst tre aktive, parkerede,
 * nåede), skridtene under hvert mål, knappernes tilstand, og GENNEMGANGEN
 * af de mål virksomheden har for mange af (prod 16/9: 87 aktive fordelt på
 * 14 kunder — seneste fremdrift 30/6). Ingen React, ingen Supabase. Testet i
 * __tests__/planen.test.ts. Tilstanden pr. mål kommer fra milepaelDom
 * (afgoerMilepael) — den ene sandhed; fremdriften for mål MED skridt fra
 * maal.ts (maalFremdrift) — samme motor som opgave-luk skriver med.
 *
 * Jonas 16/9: rådgiveren sætter målene sammen med medlemmet; højst tre
 * aktive; ingen af de eksisterende mål parkeres uden at en rådgiver har
 * klikket (plan §1c). «Gennemgået» = antallet aktive er højst tre — ingen ny
 * kolonne (plan §3c).
 */
import { afgoerMilepael, type MilepaelDom } from "@/lib/milepaelDom";
import { gennemgangVenter, kanOpretteMaal, maalFremdrift, MAX_AKTIVE_MAAL, TAELLENDE_SKRIDT } from "@/lib/hjemmebane/maal";

/** Det af milestones-rækken Planen læser (useVirksomhed). */
export interface MaalRaekke {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  deadline: string | null;
  category: string | null;
  source: string | null;
  progress_updated_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Det af company_actions-rækken Planen læser. */
export interface SkridtRaekke {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  maal_id: string | null;
  /** company_actions.source_type — 'manual' er medlemmets eget skridt (skridt-tilfoej, 17/9). Valgfri: ældre kaldere læser den ikke. */
  source_type?: string | null;
}

/** Medlemmets eget skridt (skridt-tilfoej, 17/9 — Jonas «ja»): source_type
    'manual' — den gamle Milestones-sides værdi for medlemmets egne opgaver,
    som ingen anden skriver bruger i dag. Rådgiveren ser mærket i Planen. */
export const MEDLEMMETS_EGET_KILDE = "manual";
export const MEDLEMMETS_EGET_TEKST = "medlemmets eget";

export function erMedlemmetsEget(s: Pick<SkridtRaekke, "source_type">): boolean {
  return s.source_type === MEDLEMMETS_EGET_KILDE;
}

export type SkridtGruppe = "venter" | "aktive" | "gjorte" | "andre";

export interface MaalIPlanen {
  maal: MaalRaekke;
  dom: MilepaelDom;
  /** Fremdriften fladen viser: beregnet af skridtene når målet HAR tællende skridt, ellers rækkens tal. */
  fremdrift: number;
  /** Sandt når fremdriften er beregnet (skyderen er låst i fase 3). */
  beregnet: boolean;
  skridt: { venter: SkridtRaekke[]; aktive: SkridtRaekke[]; gjorte: SkridtRaekke[]; andre: SkridtRaekke[] };
  /** Hele dage siden fremdriften sidst rykkede; null uden stempel. */
  dageUdenBevaegelse: number | null;
  handlinger: { kanAktivere: boolean; kanParkere: boolean; kanMarkereNaaet: boolean; kanForeslaaSkridt: boolean };
}

export interface PlanenDom {
  aktive: MaalIPlanen[];
  parkerede: MaalIPlanen[];
  naaede: MaalIPlanen[];
  /** Skridt der ikke hører til noget mål (forslag fra før planen) — vises som «uden mål». */
  udenMaal: SkridtRaekke[];
  /** Flere end tre aktive: rådgiveren skal beholde højst tre — behold/parkér/nået pr. mål. */
  gennemgang: boolean;
  kanSaetteMaal: boolean;
  /** Én linje under overskriften — tilstanden i ord. */
  tekst: string;
}

export const UDEN_BEVAEGELSE_DAGE = 30;

const MS_PER_DOEGN = 86_400_000;

function dageSiden(iso: string | null, nu: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nu.getTime() - t) / MS_PER_DOEGN));
}

export function grupperSkridt(skridt: readonly SkridtRaekke[]): MaalIPlanen["skridt"] {
  const g: MaalIPlanen["skridt"] = { venter: [], aktive: [], gjorte: [], andre: [] };
  for (const s of skridt) {
    if (s.status === "proposed") g.venter.push(s);
    else if (s.status === "active") g.aktive.push(s);
    else if (s.status === "done") g.gjorte.push(s);
    else g.andre.push(s);
  }
  return g;
}

/** Sortering: ældste først (created_at), så gennemgangen viser dem i den rækkefølge de kom. */
function aeldsteFoerst(a: MaalIPlanen, b: MaalIPlanen): number {
  return a.maal.created_at < b.maal.created_at ? -1 : a.maal.created_at > b.maal.created_at ? 1 : 0;
}

export function planenDom(maal: readonly MaalRaekke[], skridt: readonly SkridtRaekke[], nu: Date): PlanenDom {
  const skridtPrMaal = new Map<string, SkridtRaekke[]>();
  const udenMaal: SkridtRaekke[] = [];
  for (const s of skridt) {
    if (!s.maal_id) {
      udenMaal.push(s);
      continue;
    }
    const liste = skridtPrMaal.get(s.maal_id) ?? [];
    liste.push(s);
    skridtPrMaal.set(s.maal_id, liste);
  }

  const alle: MaalIPlanen[] = maal.map((m) => {
    const dom = afgoerMilepael(m, nu);
    const egne = skridtPrMaal.get(m.id) ?? [];
    const taellende = egne.filter((s) => TAELLENDE_SKRIDT.includes(s.status));
    const beregnet = taellende.length > 0;
    const fremdrift = beregnet ? maalFremdrift(taellende, m.progress) : Math.min(100, Math.max(0, Math.round(m.progress ?? 0)));
    return {
      maal: m,
      dom,
      fremdrift,
      beregnet,
      skridt: grupperSkridt(egne),
      dageUdenBevaegelse: dageSiden(m.progress_updated_at, nu),
      handlinger: { kanAktivere: false, kanParkere: false, kanMarkereNaaet: false, kanForeslaaSkridt: false },
    };
  });

  const aktive = alle.filter((x) => x.dom.aktiv).sort(aeldsteFoerst);
  const parkerede = alle.filter((x) => x.dom.parkeret).sort(aeldsteFoerst);
  const naaede = alle.filter((x) => x.dom.faerdig).sort(aeldsteFoerst);
  // ÉN regel (maal.ts gennemgangVenter) — samme som forsiden og AI-skriverne.
  const gennemgang = gennemgangVenter(aktive.length);
  const kanSaetteMaal = kanOpretteMaal(aktive.length);

  for (const x of aktive) x.handlinger = { kanAktivere: false, kanParkere: true, kanMarkereNaaet: true, kanForeslaaSkridt: !gennemgang };
  // Et parkeret mål kan aktiveres når der er plads — også midt i en gennemgang er svaret nej.
  for (const x of parkerede) x.handlinger = { kanAktivere: kanSaetteMaal, kanParkere: false, kanMarkereNaaet: false, kanForeslaaSkridt: false };
  // Et nået mål kan genåbnes (aktiveres) når der er plads; ellers står det som historik.
  for (const x of naaede) x.handlinger = { kanAktivere: kanSaetteMaal, kanParkere: false, kanMarkereNaaet: false, kanForeslaaSkridt: false };

  return { aktive, parkerede, naaede, udenMaal, gennemgang, kanSaetteMaal, tekst: planenTekst(aktive.length, parkerede.length, naaede.length, gennemgang) };
}

export function planenTekst(aktive: number, parkerede: number, naaede: number, gennemgang: boolean): string {
  if (gennemgang) return `Gennemgå målene: ${aktive} aktive — behold højst ${MAX_AKTIVE_MAAL}, parkér eller markér resten som nået`;
  if (aktive === 0 && parkerede === 0 && naaede === 0) return "Ingen mål endnu — sæt dem sammen med medlemmet";
  const dele = [`${aktive} af ${MAX_AKTIVE_MAAL} aktive`];
  if (parkerede > 0) dele.push(`${parkerede} ${parkerede === 1 ? "parkeret" : "parkerede"}`);
  if (naaede > 0) dele.push(`${naaede} ${naaede === 1 ? "nået" : "nåede"}`);
  return dele.join(" · ");
}

/** «Ingen bevægelse i 45 dage» — kun når det er længe; null ellers. */
export function udenBevaegelseTekst(dage: number | null): string | null {
  if (dage == null || dage < UDEN_BEVAEGELSE_DAGE) return null;
  return `Ingen bevægelse i ${dage} dage`;
}

/** Fremdriften i ord: «2 af 3 skridt gjort · 67 %» eller «40 %» (sat af et menneske). */
export function fremdriftTekst(x: Pick<MaalIPlanen, "fremdrift" | "beregnet" | "skridt">): string {
  if (!x.beregnet) return `${x.fremdrift} %`;
  const gjort = x.skridt.gjorte.length;
  const taellende = gjort + x.skridt.aktive.length + x.skridt.andre.filter((s) => s.status === "not_done" || s.status === "dropped").length;
  return `${gjort} af ${taellende} skridt gjort · ${x.fremdrift} %`;
}
