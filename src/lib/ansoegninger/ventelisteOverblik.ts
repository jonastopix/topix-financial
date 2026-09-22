/**
 * ventelisteOverblik — ventelisten set fra ANSØGNINGERNES side (udkast 22/9-2026).
 *
 * JONAS 22/9 18:3x (ordret): «Det kunne være smart, at vi havde ventelisten under
 * ansøgninger. Det her er for bøvlet.» Målt samme dag: for at tilbyde Tatti pladsen
 * hos Studio Mini måtte han åbne `/virksomhed/<id>` direkte fra en URL, fordi Studio
 * Mini er et TIDLIGERE medlem og derfor ikke står i Virksomheder-listen. Ventepladsen
 * hænger på en virksomhed, men handlingen hører til ansøgeren.
 *
 * DENNE FIL REGNER INTET NYT. Den KOMPONERER husets eksisterende domme og svarer med
 * én række pr. venteplads. Hver eneste afgørelse herunder er et kald til en dom, der
 * allerede findes og allerede har prøver:
 *
 *   erPladsLedig(fornyelseStatus)   ventelisteDom.ts:77  — er pladsen overhovedet ledig
 *   klarTilTilbud(raekker, nu)      ventelisteDom.ts:122 — «tidligst»-datoen er nået
 *   naesteIKoen(raekker)            ventelisteDom.ts:95  — anciennitet afgør, hvem der er først
 *   harTilbudUde(raekker)           ventelisteDom.ts:100 — kun ét tilbud ude ad gangen
 *   sorterKoe(raekker)              ventelisteDom.ts:87  — køens rækkefølge og nummer
 *
 * Fornyelsesstatussen gives IND (fra `afgoerFornyelsestilstand`, som AdvisorDashboard
 * allerede kalder pr. virksomhed, `AdvisorDashboard.tsx:1026-1033`) — ikke regnet her.
 * Samme form som forsidens `VentelisteTilDom`: dataen samles ét sted, dommen er ren.
 *
 * HVORFOR EN DOM OG IKKE LOGIK I FLADEN: fladen på virksomhedssiden
 * (`VentelisteHandlinger.tsx:22-34`) kalder de fem domme selv. Gør den nye flade det
 * samme, står reglen to steder, og de to kan komme til at sige forskelligt om den
 * SAMME venteplads — brugeren ville se «kan tilbydes» ét sted og ingenting det andet.
 * Derfor: ÉN dom, to flader. Værnet `ventelisteOverblik.guard` låser, at fladen ikke
 * regner selv (samme form som `webinarFlade.guard`).
 */
import {
  anciennitet,
  erPladsLedig,
  harTilbudUde,
  klarTilTilbud,
  naesteIKoen,
  sorterKoe,
  type VentepladsRaekke,
  type VentepladsStatus,
} from "../ventelisteDom";

/**
 * Hvorfor en venteplads står, som den står. Rækkefølgen HER er sorteringens
 * rækkefølge: det, der kan handles på nu, står øverst.
 */
export const TILSTANDE = [
  /** Første i køen, pladsen er ledig, intet tilbud ude, «tidligst» er nået → knappen virker. */
  "kan_tilbydes_nu",
  /** Denne venteplads HAR tilbuddet; fristen løber. */
  "tilbudt",
  /** Først i køen, men «tidligst»-datoen er ikke nået (fx ABC → Doggybed, 13/10). */
  "venter_paa_dato",
  /** Pladsen er ledig, men en ANDEN i samme kø har tilbuddet ude. */
  "tilbud_ude",
  /** Står i køen, men ikke først. */
  "venter_i_koe",
  /** Pladsen er ikke ledig endnu (fornyelsesdommen siger, medlemmet bliver). */
  "venter_paa_plads",
] as const;
export type Ventepladstilstand = (typeof TILSTANDE)[number];

/** Ordene på skærmen — ét sted, så listen og ansøgningen siger det samme. */
export const TILSTAND_ORD: Readonly<Record<Ventepladstilstand, string>> = {
  kan_tilbydes_nu: "Kan tilbydes nu",
  tilbudt: "Tilbudt",
  venter_paa_dato: "Venter på dato",
  tilbud_ude: "Tilbud ude til en anden",
  venter_i_koe: "Venter i kø",
  venter_paa_plads: "Venter på pladsen",
};

/** Én venteplads, som den kommer ind — dataen samles af hooken, ikke her. */
export interface OverblikInput {
  venteplads: VentepladsRaekke;
  /** Ansøgerens virksomhedsnavn (virksomhedsnavnAf på ansøgningen). */
  ansoegerNavn: string;
  /** Den virksomhed, pladsen hænger på. */
  virksomhed: string;
  /** `afgoerFornyelsestilstand(...).status` for DEN virksomhed — gives ind, regnes ikke her. */
  fornyelseStatus: string;
  /** Hele køen hos samme virksomhed (inkl. denne) — nummer og «først i køen» afgøres af den. */
  koe: readonly VentepladsRaekke[];
  tilbudUdloeberAt: string | null;
}

export interface OverblikRaekke {
  ventepladsId: string;
  ansoegningId: string;
  ansoegerNavn: string;
  companyId: string;
  virksomhed: string;
  status: VentepladsStatus;
  tilstand: Ventepladstilstand;
  /** Nummer i køen (1 = først). null når rækken ikke er i den sorterede kø. */
  nummer: number | null;
  tilbudUdloeberAt: string | null;
  tidligstTilbudAt: string | null;
  pladsLedig: boolean;
}

/**
 * Tilstanden for ÉN venteplads. Rækkefølgen af tjek er meningen:
 *
 *   1. Bærer DENNE række tilbuddet? Så er den «tilbudt», uanset alt andet —
 *      også hvis pladsen i mellemtiden er holdt op med at være ledig.
 *   2. Er pladsen ikke ledig, venter alle andre på pladsen. Det er den eneste
 *      tilstand, hvor køens orden er ligegyldig: ingen kan tilbydes noget.
 *   3. Har en anden tilbuddet, venter resten på svaret (7 dage).
 *   4. Er den først i køen, afgør «tidligst»-datoen: nået → kan tilbydes nu,
 *      ellers venter den på datoen.
 *   5. Ellers står den i kø.
 */
export function tilstandFor(i: OverblikInput, nu: Date): Ventepladstilstand {
  if (i.venteplads.status === "tilbudt") return "tilbudt";
  if (!erPladsLedig(i.fornyelseStatus)) return "venter_paa_plads";
  if (harTilbudUde(i.koe)) return "tilbud_ude";
  const foerst = naesteIKoen(klarTilTilbud(i.koe, nu));
  if (foerst && foerst.id === i.venteplads.id) return "kan_tilbydes_nu";
  // Først i den FULDE kø, men holdt tilbage af «tidligst»-datoen.
  const foerstUdenDato = naesteIKoen(i.koe);
  if (foerstUdenDato && foerstUdenDato.id === i.venteplads.id) return "venter_paa_dato";
  return "venter_i_koe";
}

/** Nummeret i køen — sorterKoe er køens egen orden (anciennitet). 1-indekseret. */
export function nummerFor(i: OverblikInput): number | null {
  const plads = sorterKoe(i.koe).findIndex((r) => r.id === i.venteplads.id);
  return plads === -1 ? null : plads + 1;
}

/** Én række pr. venteplads, sorteret så det, der kan handles på, står øverst. */
export function bygVentelisteOverblik(input: readonly OverblikInput[], nu: Date): OverblikRaekke[] {
  const raekker = input.map((i): OverblikRaekke => ({
    ventepladsId: i.venteplads.id,
    ansoegningId: i.venteplads.ansoegning_id,
    ansoegerNavn: i.ansoegerNavn,
    companyId: i.venteplads.company_id,
    virksomhed: i.virksomhed,
    status: i.venteplads.status,
    tilstand: tilstandFor(i, nu),
    nummer: nummerFor(i),
    tilbudUdloeberAt: i.tilbudUdloeberAt,
    tidligstTilbudAt: i.venteplads.tidligst_tilbud_at ?? null,
    pladsLedig: erPladsLedig(i.fornyelseStatus),
  }));
  const raekkefoelge = new Map<Ventepladstilstand, number>(TILSTANDE.map((t, n) => [t, n]));
  const ancienniteter = new Map(input.map((i) => [i.venteplads.id, anciennitet(i.venteplads)]));
  return raekker.sort((a, b) => {
    const t = (raekkefoelge.get(a.tilstand) ?? 99) - (raekkefoelge.get(b.tilstand) ?? 99);
    if (t !== 0) return t;
    // Inden for samme tilstand: ancienniteten, som køen selv sorterer.
    const aa = ancienniteter.get(a.ventepladsId) ?? Number.POSITIVE_INFINITY;
    const bb = ancienniteter.get(b.ventepladsId) ?? Number.POSITIVE_INFINITY;
    if (aa !== bb) return aa - bb;
    return a.ansoegerNavn.localeCompare(b.ansoegerNavn, "da-DK");
  });
}

/** Hvor mange der kan tilbydes NU — tallet på fanen. */
export function antalKanTilbydes(raekker: readonly OverblikRaekke[]): number {
  return raekker.filter((r) => r.tilstand === "kan_tilbydes_nu").length;
}
