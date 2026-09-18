/**
 * ansoegningVisning — de rene læsere rådgiverens side af ansøgningen bruger
 * til at VISE en række: virksomhedsnavn, fornavn, trin-ord, årsags-ord,
 * ventetid. Ingen IO, ingen React. Navnet regnes som motoren gør det
 * (_shared/ansoegningMotor.ts:virksomhedsnavnAf — samme tre trin, låst af
 * ansoegningerFlade.guard: CVR-registrets navn, så ansøgerens, så mailen).
 */
import { TRIN, LUKKEAARSAGER, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";

export interface RaekkeTilNavn {
  cvr_opslag: Record<string, unknown> | null;
  navn: string | null;
  email: string | null;
}

/** CVR-registrets navn først, så ansøgerens eget, så mailen — aldrig tomt. */
export function virksomhedsnavnAf(a: RaekkeTilNavn): string {
  const cvrNavn = typeof a.cvr_opslag?.navn === "string" ? a.cvr_opslag.navn.trim() : "";
  if (cvrNavn) return cvrNavn;
  const navn = (a.navn ?? "").trim();
  if (navn) return `${navn}s virksomhed`;
  return (a.email ?? "").trim() || "Ukendt virksomhed";
}

/** «Morten Larsen Hansen» → «Morten»; tomt → null. */
export function fornavnAf(navn: string | null | undefined): string | null {
  const t = (navn ?? "").trim();
  return t ? t.split(/\s+/)[0] : null;
}

/** Trinnets ord som rådgiveren læser det — i den rækkefølge flowet går. */
export const TRIN_ORD: Record<Trin, string> = {
  ny: "Ny — tal med dem eller afvis?",
  indkaldt: "Indkaldt til samtale",
  booket: "Samtale booket",
  afholdt: "Samtale afholdt — tilbud eller afslag?",
  aftalegrundlag_sendt: "Aftalegrundlag sendt",
  underskrevet: "Underskrevet — betalingsforløbet kører",
  lukket: "Lukket",
};

export const LUKKEAARSAG_ORD: Record<Lukkeaarsag, string> = {
  afslag_efter_ansoegning: "afslag efter ansøgningen",
  afslag_efter_samtale: "afslag efter samtalen",
  svarer_ikke: "svarede ikke",
  udloebet: "aftalegrundlaget udløb",
  trak_sig: "trak sig",
  dublet: "dublet",
  andet: "andet",
};

/** Listens grupper: de to beslutningstrin først (der venter et menneske), så resten i flowets rækkefølge, lukket sidst. */
export const LISTE_RAEKKEFOELGE: readonly Trin[] = ["ny", "afholdt", "indkaldt", "booket", "aftalegrundlag_sendt", "underskrevet", "lukket"];

/** Dansk dato «YYYY-MM-DD» for et tidspunkt (sv-SE giver ISO-formen). */
export function danskDato(nu: Date): string {
  return nu.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

/** På pause = paa_pause_til er sat og ligger EFTER i dag (dansk dato). På selve dagen er pausen slut, og ansøgningen kommer op igen. */
export function erPaaPause(paaPauseTil: string | null | undefined, nu: Date): boolean {
  return !!paaPauseTil && paaPauseTil > danskDato(nu);
}

/** Venter på et menneske: de to beslutningstrin — og ikke på pause (Jonas 18/9: en pause frem i tiden tæller ikke som ventende). */
export function venterPaaMenneske(trin: Trin, paaPauseTil: string | null | undefined, nu: Date): boolean {
  return (trin === "ny" || trin === "afholdt") && !erPaaPause(paaPauseTil, nu);
}

/** Listens grupper (Jonas 18/9): efter hvad der venter på JER — samtale afholdt → ny → booket → indkaldt → aftalegrundlag sendt → underskrevet → på pause → lukket. */
export type Listegruppe = "afholdt" | "ny" | "booket" | "indkaldt" | "aftalegrundlag_sendt" | "underskrevet" | "paa_pause" | "lukket";
export const LISTEGRUPPER: readonly Listegruppe[] = ["afholdt", "ny", "booket", "indkaldt", "aftalegrundlag_sendt", "underskrevet", "paa_pause", "lukket"];

export const GRUPPE_ORD: Record<Listegruppe, string> = {
  afholdt: "Samtale afholdt — tilbud eller afslag?",
  ny: "Nye — tal med dem eller afvis?",
  booket: "Samtale booket",
  indkaldt: "Indkaldt — rykkerne kører",
  aftalegrundlag_sendt: "Aftalegrundlag sendt — rykkerne kører",
  underskrevet: "Underskrevet — betalingsforløbet kører",
  paa_pause: "På pause",
  lukket: "Lukkede",
};

/** Hvilken gruppe en række hører til: pausen vinder over trinnet (så længe den ligger frem i tiden), lukket er lukket. */
export function gruppeFor(a: { trin: Trin; paa_pause_til: string | null }, nu: Date): Listegruppe {
  if (a.trin === "lukket") return "lukket";
  if (erPaaPause(a.paa_pause_til, nu)) return "paa_pause";
  return a.trin;
}

export interface RaekkeTilListe {
  trin: Trin;
  trin_sat_at: string;
  paa_pause_til: string | null;
}

/** Grupperne i rækkefølge med deres rækker (nyeste trin_sat_at først; på pause: tidligste slutdato først). Tomme grupper udelades. */
export function grupperTilListe<T extends RaekkeTilListe>(raekker: readonly T[], nu: Date): Array<{ gruppe: Listegruppe; raekker: T[] }> {
  return LISTEGRUPPER
    .map((gruppe) => ({
      gruppe,
      raekker: raekker
        .filter((r) => gruppeFor(r, nu) === gruppe)
        .slice()
        .sort((a, b) => (gruppe === "paa_pause" ? (a.paa_pause_til ?? "").localeCompare(b.paa_pause_til ?? "") : b.trin_sat_at.localeCompare(a.trin_sat_at))),
    }))
    .filter((g) => g.raekker.length > 0);
}

/** Tæller det der faktisk venter på jer: ny + afholdt, ikke på pause. */
export function taelVentende(raekker: readonly RaekkeTilListe[], nu: Date): number {
  return raekker.filter((r) => venterPaaMenneske(r.trin, r.paa_pause_til, nu)).length;
}

/** Overskriften: tæller kun det der venter; er der intet, står der noget roligt. */
export function listeOverskrift(ventende: number, hentet: boolean): string {
  if (!hentet) return "Ansøgningerne";
  if (ventende === 0) return "Ingen venter på jer lige nu.";
  return ventende === 1 ? "Én venter på jeres beslutning." : `${ventende} venter på jeres beslutning.`;
}

/** «Hvad der venter» på én linje i listen — kort, aldrig fritekst. */
export function hvadVenter(a: { trin: Trin; paa_pause_til: string | null; lukkeaarsag: Lukkeaarsag | null; rykkere_sendt: number; samtale_start: string | null }, nu: Date): string {
  if (a.trin === "lukket") return a.lukkeaarsag ? LUKKEAARSAG_ORD[a.lukkeaarsag] : "lukket";
  if (erPaaPause(a.paa_pause_til, nu)) return `på pause til ${danskDatoOrd(a.paa_pause_til!)}`;
  switch (a.trin) {
    case "ny": return "tal med dem eller afvis?";
    case "afholdt": return "tilbud eller afslag?";
    case "indkaldt": return a.rykkere_sendt > 0 ? `rykker ${a.rykkere_sendt} sendt` : "indkaldelse sendt";
    case "booket": return a.samtale_start ? `samtale ${danskTidspunkt(a.samtale_start)}` : "samtale booket";
    case "aftalegrundlag_sendt": return a.rykkere_sendt > 0 ? `aftalegrundlag · rykker ${a.rykkere_sendt} sendt` : "aftalegrundlag sendt";
    case "underskrevet": return "betalingsforløbet kører";
  }
}

/** «10. december» af «2026-12-10». */
export function danskDatoOrd(dato: string): string {
  const d = new Date(`${dato}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dato;
  return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "long" }).format(d);
}

/** «i dag» · «i går» · «for 3 dage siden» · «for 2 uger siden» — regnet på hele døgn. */
export function ventetid(sidenAt: string, nu: Date): string {
  const t = Date.parse(sidenAt);
  if (Number.isNaN(t)) return "";
  const dage = Math.max(0, Math.floor((nu.getTime() - t) / 86_400_000));
  if (dage === 0) return "i dag";
  if (dage === 1) return "i går";
  if (dage < 14) return `for ${dage} dage siden`;
  const uger = Math.floor(dage / 7);
  return `for ${uger} uger siden`;
}

/** Dansk dato med klokke: «18. september kl. 10.05». */
export function danskTidspunkt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Gruppér rækker pr. trin i listens rækkefølge, nyeste (trin_sat_at) først inden for gruppen. Tomme grupper udelades. */
export function grupperEfterTrin<T extends { trin: Trin; trin_sat_at: string }>(raekker: readonly T[]): Array<{ trin: Trin; raekker: T[] }> {
  return LISTE_RAEKKEFOELGE
    .map((trin) => ({
      trin,
      raekker: raekker.filter((r) => r.trin === trin).slice().sort((a, b) => b.trin_sat_at.localeCompare(a.trin_sat_at)),
    }))
    .filter((g) => g.raekker.length > 0);
}

/** Alle syv trin har et ord (kildeværnet låser det mod TRIN). */
export const ALLE_TRIN_HAR_ORD = TRIN.every((t) => t in TRIN_ORD) && LUKKEAARSAGER.every((l) => l in LUKKEAARSAG_ORD);
