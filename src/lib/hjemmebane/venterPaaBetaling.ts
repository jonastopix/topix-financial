/**
 * src/lib/hjemmebane/venterPaaBetaling.ts
 *
 * «Venter på betaling» — forsidekortet til rådgiverne (19/9-2026,
 * recon-indgangspaamindelser §5): ÉN samlet liste over dem, der har skrevet
 * under og endnu ikke betalt — med hvor længe, og hvad vi har sendt dem.
 * Ren dom, ingen React, ingen Supabase; hentningen bor i
 * src/hooks/venterPaaBetaling.ts og fladen i RaadgiverForsideView.
 *
 * HVORFOR (reconens §5, målt 19/9): der fandtes INGEN liste over hvem der
 * ikke har betalt. Økonomisiden nævner ikke indgangen; virksomhedslisten har
 * intet indgangsmærke; det eneste samlede sted var /admin's mail-log — en
 * teknikerflade, ikke en arbejdsliste. Forsidens egne indgangslinjer
 * (forsidensDom.grundFraIndgang) findes, men `afventer_betaling` har alvor
 * 60 og kommer først op, når vinduet er ≤ 7 dage, altså fra DAG 23. Dag 1–22
 * er tavse. Og skriver femten under samme aften, står der fra dag 23
 * pludselig femten enkeltlinjer, der drukner hinanden (USAEDVANLIGT_MANGE).
 * Dette kort er svaret på begge dele: ét sted, fra dag 0, med højst KORT_LOFT
 * linjer og «og N mere».
 *
 * ÉN DOM, IKKE EN NY: tilstanden er afgoerBetalingsfrist (lib/betalingsfrist.ts)
 * — den samme motor som cronen, virksomhedssiden og forsidens dom bruger.
 * Denne fil sorterer og formulerer; den regner ikke selv.
 *
 * MED I LISTEN: alle med en linkrække, hvor tilstanden IKKE er «betalt».
 * Altså også `afventer_pris` og `klar_til_mail`, hvor det er OS, der mangler
 * at gøre noget — de er de vigtigste, ikke de mindst vigtige.
 *
 * RÆKKEFØLGEN — det, der haster mest, øverst:
 *   1. afventer_pris      det er os, der blokerer; fristen løber imens.
 *   2. frist_overskredet  fristen er passeret; fakturaen er vejen nu.
 *   3. klar_til_mail      prisen er sat, dag 0-mailen er ikke sendt.
 *   4. afventer_betaling  de har bolden.
 * Inden for samme tilstand: flest dage siden underskriften først.
 */
import { afgoerBetalingsfrist, BETALINGSFRIST_DAGE, type Betalingsfriststatus } from "@/lib/betalingsfrist";

export const KORT_LOFT = 5;
export const KORT_OVERSKRIFT = "Venter på betaling";
export const INGEN_VENTER_TEKST = "Ingen i indgangen venter på at betale.";
export const VIRKSOMHEDER_STI = "/virksomheder";

/** Én linkrække + dens virksomhed, som hentningen leverer dem. */
export interface VenterRaekke {
  company_id: string;
  navn: string;
  prisniveau_oere: number | null;
  underskrevet_at: string;
  betalingsmail_sendt_at: string | null;
  sidste_paamindelse_dag: number | null;
  faktura_sendt_at: string | null;
  contract_end_date: string | null;
}

export interface VenterLinje {
  companyId: string;
  navn: string;
  status: Exclude<Betalingsfriststatus, "betalt">;
  /** Hele kalenderdage siden underskriften; null når stemplet er ulæseligt. */
  dage: number | null;
  /** «14 dage siden underskriften · dag 14 sendt» — hele den grå del. */
  tekst: string;
  /** Det der haster (afventer_pris, frist_overskredet) farves rust af fladen. */
  haster: boolean;
}

export interface VenterPaaBetaling {
  liste: VenterLinje[];
  ialt: number;
}

/** Rækkefølgen fra filhovedet. Lavest tal = øverst. */
const RANG: Record<Exclude<Betalingsfriststatus, "betalt">, number> = {
  afventer_pris: 0,
  frist_overskredet: 1,
  klar_til_mail: 2,
  afventer_betaling: 3,
};

/** De to tilstande, hvor nogen skal gøre noget nu. */
export function haster(status: Exclude<Betalingsfriststatus, "betalt">): boolean {
  return status === "afventer_pris" || status === "frist_overskredet";
}

function flertal(n: number, ental: string, flertal: string): string {
  return `${n} ${n === 1 ? ental : flertal}`;
}

/**
 * Hvad har vi sendt dem? Det seneste, der faktisk gik — stempler, ikke
 * dagstal. Fakturaen slår påmindelserne, påmindelserne slår dag 0-mailen.
 * «Seneste», ikke «alle»: cronen springer et trin over, når det er løbet fra
 * (betalingsfrist.ts findForfaldenPaamindelse), så dag 25 uden dag 14 før er
 * det normale.
 */
export function sendtTekst(r: VenterRaekke): string {
  if (r.faktura_sendt_at) return "fakturaen er sendt";
  if (r.sidste_paamindelse_dag != null) return `dag ${r.sidste_paamindelse_dag} sendt`;
  if (r.betalingsmail_sendt_at) return "betalingsmailen er sendt";
  if (r.prisniveau_oere === null) return "prisen er ikke sat — intet er sendt";
  return "betalingsmailen er ikke sendt";
}

/** «14 dage siden underskriften · dag 14 sendt» — og fristen, når den er passeret. */
export function linjeTekst(r: VenterRaekke, dage: number | null, status: Exclude<Betalingsfriststatus, "betalt">): string {
  const alder = dage === null ? "underskrevet (dato ukendt)" : `${flertal(dage, "dag", "dage")} siden underskriften`;
  const frist =
    dage !== null && status === "frist_overskredet"
      ? ` · fristen udløb for ${flertal(dage - BETALINGSFRIST_DAGE, "dag", "dage")} siden`
      : "";
  return `${alder}${frist} · ${sendtTekst(r)}`;
}

export function venterPaaBetaling(raekker: readonly VenterRaekke[], nu: Date = new Date()): VenterPaaBetaling {
  const liste: VenterLinje[] = [];
  for (const r of raekker) {
    const t = afgoerBetalingsfrist(
      {
        prisniveau_oere: r.prisniveau_oere,
        underskrevet_at: r.underskrevet_at,
        betalingsmail_sendt_at: r.betalingsmail_sendt_at,
        sidste_paamindelse_dag: r.sidste_paamindelse_dag,
        contract_end_date: r.contract_end_date,
      },
      nu,
    );
    if (t.status === "betalt") continue;
    const status = t.status;
    liste.push({
      companyId: r.company_id,
      navn: r.navn,
      status,
      dage: t.dage_siden_underskrift,
      tekst: linjeTekst(r, t.dage_siden_underskrift, status),
      haster: haster(status),
    });
  }
  liste.sort((a, b) => RANG[a.status] - RANG[b.status] || (b.dage ?? -1) - (a.dage ?? -1) || a.navn.localeCompare(b.navn, "da"));
  return { liste, ialt: liste.length };
}

/** Samme udsnit-form som «Ubesvarede opslag»: højst KORT_LOFT, resten tælles. */
export function kortUdsnit<T>(liste: readonly T[], loft = KORT_LOFT): { viste: T[]; flere: number } {
  return { viste: liste.slice(0, loft), flere: Math.max(0, liste.length - loft) };
}

export function flereTekst(flere: number): string {
  return `og ${flere} mere i indgangen`;
}

export const virksomhedsSti = (companyId: string): string => `/virksomhed/${companyId}`;
