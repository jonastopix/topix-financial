/**
 * src/lib/onboardingTjekliste.ts
 *
 * Onboarding-tjeklisten som ren funktion: hvilke af de seks punkter et nyt
 * medlem HAR gjort. Samme form som betalingsfrist.ts og indgangspris.ts —
 * nul imports, ingen IO, ingen Supabase, ingen React; samme input giver
 * altid samme output. Bruges KUN i fronten; spejles bevidst ikke til Deno.
 *
 * HVORFOR: tjeklisten skal krydse af AUTOMATISK efterhånden som medlemmet
 * gør tingene — ikke ved at de markerer noget selv. «Gjort» betyder
 * HANDLING, ikke besøg: de har uploadet, udfyldt, skrevet. Dommen skal
 * derfor ligge ét sted, være testet, og være uafhængig af fladen (boksen
 * der ligger på alle sider). Fladen henter data og viser; motoren afgør.
 *
 * DE SEKS PUNKTER (besluttet med Jonas 2/9) i FAST rækkefølge:
 *   1. velkomst    Se velkomsten (video) — først, fordi den forklarer resten.
 *   2. profil      Din profil — billede OG oplysninger      ┐ det platformen
 *   3. virksomhed  Din virksomhed — data platformen bruger  ┘ har brug for
 *   4. rapport     Dine tal — den første rapport            ┐ det de får
 *   5. handout     Dit første handout                       ┘ noget ud af
 *   6. besked      Skriv til din rådgiver                   — mennesket
 * Rækkefølgen er låst af testen i src/lib/__tests__/onboardingTjekliste.test.ts.
 *
 * DATAGRUNDLAG (målt 2/9, recon-onboarding-tjekliste.md §1): hvert felt i
 * TjeklisteInput har en kommentar om hvor det kommer fra. Kalderen henter
 * og mapper; motoren kender ingen tabeller.
 *
 * TOMME STRENGE tæller som ikke sat — der trimmes før tjek. Et website på
 * « » er ikke et website.
 */

export type TjeklistePunktId = "velkomst" | "profil" | "virksomhed" | "rapport" | "handout" | "besked";

export interface TjeklisteInput {
  /** profiles.velkomstvideo_set_at — nyt felt, se migrationen. Sættes af fladen når videoen er set. */
  velkomstvideo_set_at: string | null;
  /** profiles.avatar_url. Sættes af Settings (bucket `avatars`, sti {user_id}/avatar). */
  avatar_url: string | null;
  /**
   * member_profiles.ask_me_about — profilens BÆRENDE felt («Det kan du
   * spørge mig om», migration 20260810200000). Rækken findes ikke før
   * medlemmet gemmer første gang; kalderen sender null når den mangler.
   */
  ask_me_about: string | null;
  /**
   * companies.website, industry_label, cvr_number — de tre platformen
   * faktisk bruger. Branchen er nøgle til kpi_benchmarks: uden den er
   * sammenligningen tom.
   */
  website: string | null;
  industry_label: string | null;
  cvr_number: string | null;
  /**
   * Antal financial_reports med deleted_at IS NULL for virksomheden.
   * Uploadet er nok — godkendelsen (financial_report_facts) er
   * rådgiverens skridt, ikke medlemmets.
   */
  antal_rapporter: number;
  /** Antal handouts med status 'completed' for brugeren (handoutEngine.toggleHandoutCompleted). */
  antal_udfyldte_handouts: number;
  /**
   * conversations.last_member_message_at — sat af triggeren på messages
   * KUN når afsenderen ikke er rådgiver (migration 20260311043341). Null
   * = medlemmet har aldrig skrevet.
   */
  last_member_message_at: string | null;
}

export interface TjeklistePunkt {
  id: TjeklistePunktId;
  /** «Se velkomsten» */
  titel: string;
  /** Én kort linje. */
  beskrivelse: string;
  gjort: boolean;
  /** Hvor punktet føres hen. Relativ sti. Tom streng = åbnes i boksen, ikke en side. */
  sti: string;
  /**
   * Kun for punkter der kan være DELVIST gjort (profil, virksomhed): hvad
   * der mangler, så medlemmet ved hvorfor det ikke er krydset af. Tom
   * liste når punktet er gjort.
   */
  mangler?: string[];
}

export interface Tjekliste {
  /** Altid seks, i fast rækkefølge. */
  punkter: TjeklistePunkt[];
  antal_gjort: number;
  antal_i_alt: number;
  /** true når alle seks er gjort. */
  faerdig: boolean;
}

/** Den faste rækkefølge — ét sted, så testen kan låse den. */
export const TJEKLISTE_RAEKKEFOELGE: readonly TjeklistePunktId[] = [
  "velkomst",
  "profil",
  "virksomhed",
  "rapport",
  "handout",
  "besked",
];

/** Stierne (besluttet 2/9). velkomst er tom: videoen åbner i boksen, ikke på en side. */
export const TJEKLISTE_STIER: Readonly<Record<TjeklistePunktId, string>> = {
  velkomst: "",
  profil: "/settings",
  virksomhed: "/settings",
  rapport: "/rapportering",
  handout: "/handouts",
  besked: "/chat",
};

/** Teksterne for det der kan mangle — eksporteret så fladen og testen bruger samme ord. */
export const MANGLER_TEKST = {
  billede: "et profilbillede",
  ask_me_about: "hvad man kan spørge dig om",
  website: "virksomhedens website",
  branche: "branchen",
  cvr: "CVR-nummeret",
} as const;

/** Sat = ikke null OG ikke kun mellemrum. Et website på « » er ikke et website. */
function erSat(vaerdi: string | null | undefined): boolean {
  return (vaerdi ?? "").trim().length > 0;
}

export function byggTjekliste(input: TjeklisteInput): Tjekliste {
  // VELKOMST — stemplet sættes af fladen når videoen er set. Handling
  // (afspillet), ikke besøg: profiles.tour_completed_at måler kun første
  // besøg på forsiden og bruges bevidst ikke.
  const velkomstGjort = input.velkomstvideo_set_at !== null;

  // PROFIL — billede OG oplysninger. ask_me_about er valgt frem for
  // full_name, fordi full_name ALTID findes (sættes af handle_new_user ved
  // signup, med fallback til mail-præfikset) og derfor ikke siger om
  // medlemmet har gjort noget. ask_me_about findes kun når medlemmet selv
  // har skrevet noget — det er profilens bærende felt, og det er det
  // forsidens fokusmotor allerede regner som «tom profil».
  const profilMangler: string[] = [];
  if (!erSat(input.avatar_url)) profilMangler.push(MANGLER_TEKST.billede);
  if (!erSat(input.ask_me_about)) profilMangler.push(MANGLER_TEKST.ask_me_about);

  // VIRKSOMHED — website OG branche OG CVR. Tre felter, ikke alle:
  // adresse, telefon og logo bruges ikke af noget der regner. Branchen er
  // nøglen til kpi_benchmarks — uden den er sammenligningen tom. CVR er
  // nøglen til CVR-registret og til genbrug ved fornyelse.
  const virksomhedMangler: string[] = [];
  if (!erSat(input.website)) virksomhedMangler.push(MANGLER_TEKST.website);
  if (!erSat(input.industry_label)) virksomhedMangler.push(MANGLER_TEKST.branche);
  if (!erSat(input.cvr_number)) virksomhedMangler.push(MANGLER_TEKST.cvr);

  // RAPPORT — uploadet er nok. Godkendelsen (facts-laget) sker i
  // rådgiverens rytme og er ikke medlemmets at vente på; medlemmets
  // handling er uploaden.
  const rapportGjort = input.antal_rapporter > 0;

  // HANDOUT — udfyldt, ikke startet. En påbegyndt række (in_progress)
  // findes så snart et enkelt felt er gemt; «Markér udfyldt» er den
  // handling der tæller.
  const handoutGjort = input.antal_udfyldte_handouts > 0;

  // BESKED — triggeren sætter stemplet kun for beskeder fra ikke-
  // rådgivere, så det kan ikke krydses af ved at rådgiveren skriver først.
  const beskedGjort = input.last_member_message_at !== null;

  const punkterEfterId: Record<TjeklistePunktId, TjeklistePunkt> = {
    velkomst: {
      id: "velkomst",
      titel: "Se velkomsten",
      beskrivelse: "En kort video om hvordan du får mest ud af The Boardroom.",
      gjort: velkomstGjort,
      sti: TJEKLISTE_STIER.velkomst,
    },
    profil: {
      id: "profil",
      titel: "Din profil",
      beskrivelse: "Et billede, og hvad de andre kan spørge dig om.",
      gjort: profilMangler.length === 0,
      sti: TJEKLISTE_STIER.profil,
      mangler: profilMangler,
    },
    virksomhed: {
      id: "virksomhed",
      titel: "Din virksomhed",
      beskrivelse: "Website, branche og CVR — det platformen regner på.",
      gjort: virksomhedMangler.length === 0,
      sti: TJEKLISTE_STIER.virksomhed,
      mangler: virksomhedMangler,
    },
    rapport: {
      id: "rapport",
      titel: "Dine tal",
      beskrivelse: "Upload din første rapport, så tallene kommer i spil.",
      gjort: rapportGjort,
      sti: TJEKLISTE_STIER.rapport,
    },
    handout: {
      id: "handout",
      titel: "Dit første handout",
      beskrivelse: "Udfyld ét handout — start med Overordnet.",
      gjort: handoutGjort,
      sti: TJEKLISTE_STIER.handout,
    },
    besked: {
      id: "besked",
      titel: "Skriv til din rådgiver",
      beskrivelse: "Sig hej — så ved vi, hvor du er.",
      gjort: beskedGjort,
      sti: TJEKLISTE_STIER.besked,
    },
  };

  // Rækkefølgen kommer fra TJEKLISTE_RAEKKEFOELGE, ikke fra objektets
  // nøgleorden — så den er låst ét sted.
  const punkter = TJEKLISTE_RAEKKEFOELGE.map((id) => punkterEfterId[id]);
  const antal_gjort = punkter.filter((p) => p.gjort).length;

  return {
    punkter,
    antal_gjort,
    antal_i_alt: punkter.length,
    faerdig: antal_gjort === punkter.length,
  };
}
