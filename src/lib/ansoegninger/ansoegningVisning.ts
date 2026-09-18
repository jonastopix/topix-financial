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

/** Kun de to trin hvor et menneske skal træffe en beslutning. */
export function venterPaaMenneske(trin: Trin): boolean {
  return trin === "ny" || trin === "afholdt";
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
