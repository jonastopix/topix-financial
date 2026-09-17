/**
 * src/lib/onboardingTjekliste.ts
 *
 * Onboarding-tjeklisten som ren funktion: hvilke af de seks punkter et nyt
 * medlem HAR gjort. Samme form som betalingsfrist.ts og indgangspris.ts —
 * ingen IO, ingen Supabase, ingen React; de eneste imports er rene: profildommen
 * (hjemmebane/profilUdfyldt.ts) og månedsnøglen (maanedsnoegle.ts). Samme input
 * og samme `nu` giver altid samme output. Bruges KUN i fronten; spejles
 * bevidst ikke til Deno.
 *
 * HVORFOR: tjeklisten skal krydse af AUTOMATISK efterhånden som medlemmet
 * gør tingene — ikke ved at de markerer noget selv. «Gjort» betyder
 * HANDLING, ikke besøg: de har uploadet, udfyldt, skrevet. Dommen skal
 * derfor ligge ét sted, være testet, og være uafhængig af fladen (boksen
 * der ligger på alle sider). Fladen henter data og viser; motoren afgør.
 *
 * DE SYV PUNKTER (seks besluttet med Jonas 2/9; præsentationen 11/9) i
 * FAST rækkefølge:
 *   1. velkomst       Se velkomsten (video) — først, fordi den forklarer resten.
 *   2. profil         Din profil — hvad man kan spørge dig om ┐ det platformen
 *   3. praesentation  Præsentér dig i fællesskabet (kort 60)  │ har brug for
 *   4. virksomhed     Din virksomhed — data platformen bruger  ┘
 *   5. rapport        Dine tal — den første rapport            ┐ det de får
 *   6. handout        Dit første handout                       ┘ noget ud af
 *   7. besked         Skriv til din rådgiver                   — mennesket
 *   8. deling         Fortæl det videre (14/9)                 — ud af huset
 * Rækkefølgen er låst af testen i src/lib/__tests__/onboardingTjekliste.test.ts.
 *
 * DELINGEN (14/9, delingens del 2): /deling med tolv kreativer, hendes navn
 * og billede og «Hent PNG» er i drift (#866-#884), men hun FANDT den ikke
 * af sig selv — Jonas skulle sende linket i hånden til hver ny. Punktet
 * står SIDST, som menupunktet «Fortæl det videre» står sidst i menuen
 * (hbNav.ts): de syv andre handler om hende og huset, dette vender ud af
 * huset. Gjort = profiles.deling_hentet_at (migration 20260914220000),
 * stemplet af KreativFuldskaerm når en PNG faktisk er hentet — HANDLING,
 * ikke besøg, som alle de andre punkter. Et besøg på /deling tæller ikke.
 * KUN NYE MEDLEMMER: punktet findes kun for medlemmer hvis profil er
 * oprettet fra DELING_PUNKT_FRA og frem (profiles.created_at — sat af
 * handle_new_user i samme transaktion som company_members, rytmens
 * dag 0). Et medlem der var færdig før, forbliver færdig: listen åbner
 * ikke igen for de 30 eksisterende, og fokuskortet på forsiden skifter
 * ikke tilbage til tjeklisten. Uden dato (null/ukendt) udgår punktet —
 * hellere ét punkt for lidt til en gammel end en genåbnet liste.
 *
 * PRÆSENTATIONEN (11/9, kort 60) står lige efter profilen — punktet er et
 * opslag om hvem du er, og composeren starter tom (Jonas 16/9: intet udkast,
 * ingen foreslået tekst; hjemmebane/praesentation.ts). Gjort = en
 * community-tråd med kilde_type 'praesentation' og status = 'aktiv'
 * (kalderen tæller). AKTIV, fordi punktets formål er at medlemmet bliver
 * set af de andre: en tråd skjult af en rådgiver ses ikke, og medlemmets
 * SELECT-policy viser i forvejen kun aktive (20260811160000:66-69) — dommen
 * lover ikke mere end RLS giver. Punktet findes KUN for dem der kan oprette en
 * tråd (kan_oprette_traad) — for en legatmodtager eller abonnent ville
 * stien føre til en dør der er lukket i datalaget (har_aktivt_medlemskab).
 * Uden ret til at oprette udgår punktet HELT, som velkomst uden video.
 *
 * DATAGRUNDLAG (målt 2/9, recon-onboarding-tjekliste.md §1): hvert felt i
 * TjeklisteInput har en kommentar om hvor det kommer fra. Kalderen henter
 * og mapper; motoren kender ingen tabeller.
 *
 * TOMME STRENGE tæller som ikke sat — der trimmes før tjek. Et website på
 * « » er ikke et website.
 *
 * UDEN VIDEO INGEN VELKOMST (Jonas 2/9: «Vi viser ikke tomt indhold»): er
 * der ikke sat en velkomstvideo i platformconfig (app_config.
 * velkomstvideo_guid), udgår punktet «Se velkomsten» HELT — fem punkter,
 * «N af 5». Fladen viser heller ikke overlejringen. Med video: seks.
 */

import { PROFIL_MANGLER_FOTO_TEKST, PROFIL_MANGLER_TEKST, PROFIL_STI, profilMangler as profilManglerDom } from "./hjemmebane/profilUdfyldt";
import { PRAESENTATION_STI } from "./hjemmebane/praesentation";
import { afsluttedeMaanederTekst, erMaanedAfsluttet } from "./maanedsnoegle";

export type TjeklistePunktId = "velkomst" | "profil" | "praesentation" | "virksomhed" | "rapport" | "handout" | "besked" | "deling";

/**
 * Delingspunktet gælder for medlemmer oprettet fra denne dag og frem
 * (UTC-midnat). Sat 14/9 aften til dagen efter bygningen: de 10-15 der
 * importeres 22/9 er efter; de 30 eksisterende er før. Rettes kun med
 * vilje — flyttes den bagud, åbner listen igen for dem der var færdige.
 */
export const DELING_PUNKT_FRA = "2026-09-15T00:00:00.000Z";

/** Gælder delingspunktet for et medlem oprettet på dette tidspunkt? Null/ugyldig → nej. */
export function delingPunktGaelder(medlemSiden: string | null | undefined): boolean {
  if (!medlemSiden) return false;
  const t = new Date(medlemSiden).getTime();
  return Number.isFinite(t) && t >= new Date(DELING_PUNKT_FRA).getTime();
}

export interface TjeklisteInput {
  /** Er der sat en velkomstvideo i platformconfig (app_config.velkomstvideo_guid)?
      Uden video udgår punktet helt — vi viser ikke tomt indhold. */
  har_velkomstvideo: boolean;
  /** profiles.velkomstvideo_set_at — nyt felt, se migrationen. Sættes af fladen når videoen er set. */
  velkomstvideo_set_at: string | null;
  /**
   * Må medlemmet oprette en community-tråd? Klientens sammensatte dom
   * (useOnboardingTjekliste.ts): !isLegat && membershipTier === "full" —
   * MemberRoute (App.tsx:102) plus abonnent-udelukkelsen (hbNav.ts:97).
   * false → punktet «praesentation» udgår helt.
   */
  kan_oprette_traad: boolean;
  /**
   * Findes der en community_traade-række med forfatter_id = medlemmet,
   * kilde_type = 'praesentation' og status = 'aktiv'? Kalderen tæller.
   * Aktiv, ikke blot «ikke slettet»: en skjult tråd ses ikke af de andre,
   * og medlemmets SELECT-policy viser kun aktive.
   */
  har_praesentation: boolean;
  /**
   * member_profiles.ask_me_about — profilens BÆRENDE felt («Det kan du
   * spørge mig om», migration 20260810200000). Rækken findes ikke før
   * medlemmet gemmer første gang; kalderen sender null når den mangler.
   * Billedet (profiles.avatar_url) indgik indtil 9/9, blev taget ud (bor på
   * /konto, #757) — og er FRA 17/9 IGEN en del af punktet (Jonas «C»,
   * forside PR 4b): dommen er profilUdfyldt.ts (tekst OG foto).
   */
  ask_me_about: string | null;
  /**
   * profiles.avatar_url — self-only RLS, samme opslag som velkomstvideo_set_at.
   * Null/tom = intet foto → punktet mangler «et foto» (17/9, Jonas «C»).
   */
  avatar_url: string | null;
  /**
   * companies.website, industry_label, cvr_number — de tre platformen
   * faktisk bruger. Branchen er nøgle til kpi_benchmarks: uden den er
   * sammenligningen tom.
   */
  website: string | null;
  industry_label: string | null;
  cvr_number: string | null;
  /**
   * Antal financial_reports med deleted_at IS NULL for virksomheden —
   * uploads, uanset status. Bruges til at skelne «uploadet, ikke godkendt»
   * fra «aldrig uploadet» i teksten; afgør IKKE længere om punktet er gjort.
   */
  antal_rapporter: number;
  /**
   * Uploadenes effektive periode-nøgler («YYYY-MM»; null = perioden kunne
   * ikke læses) — samme rækker som antal_rapporter (instruks F, 16/9).
   * Skelner «kun måneder der ikke er omme» (limbo: intet kan godkendes før
   * den 1.) fra «en afsluttet måned der venter på godkendelse». Valgfri:
   * udeladt → som før (enhver upload regnes som noget der kan godkendes).
   * En upload uden læselig periode (null) tæller som en almindelig upload.
   */
  upload_perioder?: readonly (string | null)[];
  /**
   * Antal financial_report_facts-rækker for virksomheden — godkendte tal.
   * RETTET 9/9: første udgave (2/9) sagde «uploadet er nok — godkendelsen
   * er rådgiverens skridt». Det var forkert: godkendelsen ER medlemmets
   * klik («Gennemgå og godkend» → commit_report_facts, ingen automatik).
   * Så medlemmet uploadede, tjeklisten sagde færdig, fokuskortet gik
   * videre, og rapporten blev aldrig godkendt — 73 ventende rapporter,
   * PHILBERTs seks. Punktet er først gjort når der findes en facts-række.
   * «Findes der en række» (ikke data_basis = measured): tjeklisten spørger
   * om medlemmet har gjort handlingen, ikke om tallet er målt — det er
   * pulsens spørgsmål.
   */
  antal_godkendte: number;
  /** Antal handouts med status 'completed' for brugeren (handoutEngine.toggleHandoutCompleted). */
  antal_udfyldte_handouts: number;
  /**
   * conversations.last_member_message_at — sat af triggeren på messages
   * KUN når afsenderen ikke er rådgiver (migration 20260311043341). Null
   * = medlemmet har aldrig skrevet.
   */
  last_member_message_at: string | null;
  /**
   * profiles.created_at — hvornår medlemmet kom ind (handle_new_user).
   * Grænsen for delingspunktet (delingPunktGaelder). Valgfri: udeladt/null
   * = punktet udgår, så ældre kaldere og tests er uændrede.
   */
  medlem_siden?: string | null;
  /**
   * profiles.deling_hentet_at — første gang hun hentede en PNG på /deling
   * (KreativFuldskaerm → useMarkerDelingHentet). Null = ikke hentet.
   */
  deling_hentet_at?: string | null;
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
   * Kun for punkter der kan være DELVIST gjort (profil, virksomhed — og
   * rapport, når den er uploadet men ikke godkendt, 9/9): hvad der
   * mangler, så medlemmet ved hvorfor det ikke er krydset af. Tom liste
   * når punktet er gjort.
   */
  mangler?: string[];
}

export interface Tjekliste {
  /** Otte i fast rækkefølge — velkomst udgår uden video, praesentation udgår
      uden ret til at oprette en tråd, deling udgår for medlemmer fra før
      DELING_PUNKT_FRA. */
  punkter: TjeklistePunkt[];
  antal_gjort: number;
  /** 8 for et nyt medlem med video og trådret; 7, 6 eller 5 når punkter udgår. */
  antal_i_alt: number;
  /** true når alle punkter er gjort. */
  faerdig: boolean;
}

/** Den faste rækkefølge — ét sted, så testen kan låse den. */
export const TJEKLISTE_RAEKKEFOELGE: readonly TjeklistePunktId[] = [
  "velkomst",
  "profil",
  "praesentation",
  "virksomhed",
  "rapport",
  "handout",
  "besked",
  "deling",
];

/** Stierne (besluttet 2/9; profil rettet 9/9 til fanen, ikke siden — profilUdfyldt.ts;
    praesentation 11/9, tom composer fra 16/9: hjemmebane/praesentation.ts).
    velkomst er tom: videoen åbner i boksen, ikke på en side. */
export const TJEKLISTE_STIER: Readonly<Record<TjeklistePunktId, string>> = {
  velkomst: "",
  profil: PROFIL_STI,
  praesentation: PRAESENTATION_STI,
  virksomhed: "/settings",
  rapport: "/rapportering",
  handout: "/handouts",
  besked: "/chat",
  deling: "/deling",
};

/** Teksterne for det der kan mangle — eksporteret så fladen og testen bruger samme ord. */
export const MANGLER_TEKST = {
  ask_me_about: PROFIL_MANGLER_TEKST,
  foto: PROFIL_MANGLER_FOTO_TEKST,
  website: "virksomhedens website",
  branche: "branchen",
  cvr: "CVR-nummeret",
  godkendelse: "at godkende tallene",
  afsluttet_maaned: "en afsluttet måned",
} as const;

/** Sat = ikke null OG ikke kun mellemrum. Et website på « » er ikke et website. */
function erSat(vaerdi: string | null | undefined): boolean {
  return (vaerdi ?? "").trim().length > 0;
}

export function byggTjekliste(input: TjeklisteInput, nu: Date = new Date()): Tjekliste {
  // VELKOMST — stemplet sættes af fladen når videoen er set. Handling
  // (afspillet), ikke besøg: profiles.tour_completed_at måler kun første
  // besøg på forsiden og bruges bevidst ikke.
  const velkomstGjort = input.velkomstvideo_set_at !== null;

  // PROFIL — TO felter (17/9, Jonas «C» — omgør 9/9's «ét felt», se
  // profilUdfyldt.ts' filhoved med begge citater): ask_me_about OG
  // avatar_url. ask_me_about er stadig valgt frem for full_name, fordi
  // full_name ALTID findes (handle_new_user) og ikke siger om medlemmet har
  // gjort noget. Fotoet: kun 6 af 30 har et (prod 17/9 13:01); 24 får
  // punktet tilbage. Samme dom som forsidens fokusmotor.
  const profilMangler = profilManglerDom(input);

  // VIRKSOMHED — website OG branche OG CVR. Tre felter, ikke alle:
  // adresse, telefon og logo bruges ikke af noget der regner. Branchen er
  // nøglen til kpi_benchmarks — uden den er sammenligningen tom. CVR er
  // nøglen til CVR-registret og til genbrug ved fornyelse.
  const virksomhedMangler: string[] = [];
  if (!erSat(input.website)) virksomhedMangler.push(MANGLER_TEKST.website);
  if (!erSat(input.industry_label)) virksomhedMangler.push(MANGLER_TEKST.branche);
  if (!erSat(input.cvr_number)) virksomhedMangler.push(MANGLER_TEKST.cvr);

  // RAPPORT — GODKENDT, ikke bare uploadet (rettet 9/9, se TjeklisteInput).
  // Er der uploadet men ikke godkendt, siger punktet præcis det: «Mangler:
  // at godkende tallene» — og stien fører til rapporteringen, hvor knappen
  // står.
  // INSTRUKS F (16/9): de tre seneste AFSLUTTEDE måneder ved navn — «juni,
  // juli og august» den 22/9 — i stedet for «din første rapport». Og har
  // hun KUN uploadet måneder der ikke er omme (september i september), er
  // «godkend tallene» en lukket dør: så siger punktet det, og beder om de
  // afsluttede måneder imens. En upload uden læselig periode (null) tæller
  // som en almindelig upload — som før (beslutning 5).
  const maaneder = afsluttedeMaanederTekst(nu);
  const rapportGjort = input.antal_godkendte > 0;
  const harUploads = input.antal_rapporter > 0;
  const perioder = input.upload_perioder;
  const kunForTidligeUploads =
    !rapportGjort &&
    harUploads &&
    perioder !== undefined &&
    perioder.length > 0 &&
    perioder.every((k) => k !== null && !erMaanedAfsluttet(k, nu));
  const rapportUploadetIkkeGodkendt = !rapportGjort && harUploads && !kunForTidligeUploads;
  const rapportMangler: string[] = kunForTidligeUploads
    ? [MANGLER_TEKST.afsluttet_maaned]
    : rapportUploadetIkkeGodkendt
      ? [MANGLER_TEKST.godkendelse]
      : [];

  // HANDOUT — udfyldt, ikke startet. En påbegyndt række (in_progress)
  // findes så snart et enkelt felt er gemt; «Markér udfyldt» er den
  // handling der tæller.
  const handoutGjort = input.antal_udfyldte_handouts > 0;

  // BESKED — triggeren sætter stemplet kun for beskeder fra ikke-
  // rådgivere, så det kan ikke krydses af ved at rådgiveren skriver først.
  const beskedGjort = input.last_member_message_at !== null;

  // DELING — stemplet sættes når en PNG er hentet (KreativFuldskaerm), ikke
  // ved besøg på siden: at hun har billedet, er det vi kan måle; at hun
  // slår det op, kan vi ikke.
  const delingGjort = (input.deling_hentet_at ?? null) !== null;

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
      beskrivelse: "Et foto, og hvad de andre kan spørge dig om.",
      gjort: profilMangler.length === 0,
      sti: TJEKLISTE_STIER.profil,
      mangler: profilMangler,
    },
    praesentation: {
      id: "praesentation",
      titel: "Præsentér dig i fællesskabet",
      beskrivelse: "Et opslag om hvem du er.",
      gjort: input.har_praesentation,
      sti: TJEKLISTE_STIER.praesentation,
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
      beskrivelse: kunForTidligeUploads
        ? `Den måned du har uploadet, kan først godkendes når den er omme. Upload ${maaneder} imens.`
        : rapportUploadetIkkeGodkendt
          ? "Rapporten er uploadet — godkend tallene, så de kommer i spil."
          : `Upload ${maaneder} — én fil pr. måned, også fra før du blev medlem.`,
      gjort: rapportGjort,
      sti: TJEKLISTE_STIER.rapport,
      mangler: rapportMangler,
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
    deling: {
      id: "deling",
      titel: "Fortæl det videre",
      beskrivelse: "Dit medlemskab som billede til LinkedIn — så dit netværk ved, hvor du får sparring.",
      gjort: delingGjort,
      sti: TJEKLISTE_STIER.deling,
    },
  };

  // Rækkefølgen kommer fra TJEKLISTE_RAEKKEFOELGE, ikke fra objektets
  // nøgleorden — så den er låst ét sted. Uden video filtreres velkomst
  // fra, uden trådret filtreres praesentation fra, før DELING_PUNKT_FRA
  // filtreres deling fra; resten beholder deres indbyrdes orden.
  const punkter = TJEKLISTE_RAEKKEFOELGE
    .filter((id) => id !== "velkomst" || input.har_velkomstvideo)
    .filter((id) => id !== "praesentation" || input.kan_oprette_traad)
    .filter((id) => id !== "deling" || delingPunktGaelder(input.medlem_siden))
    .map((id) => punkterEfterId[id]);
  const antal_gjort = punkter.filter((p) => p.gjort).length;

  return {
    punkter,
    antal_gjort,
    antal_i_alt: punkter.length,
    faerdig: antal_gjort === punkter.length,
  };
}
