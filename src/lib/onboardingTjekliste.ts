/**
 * src/lib/onboardingTjekliste.ts
 *
 * Onboarding-tjeklisten («Kom godt i gang») som ren funktion: hvilke af de
 * seks punkter et nyt medlem HAR gjort. Samme form som betalingsfrist.ts og
 * indgangspris.ts — ingen IO, ingen Supabase, ingen React; de eneste imports
 * er rene: profildommen (hjemmebane/profilUdfyldt.ts), præsentationens sti
 * (hjemmebane/praesentation.ts), bekræftelsesdommen (hjemmebane/
 * maalBekraeft.ts: erBekraeftet), stedernes type (hjemmebane/
 * stedsSaetninger.ts) og månedsnøglen (maanedsnoegle.ts). Samme input og
 * samme `nu` giver altid samme output. Bruges KUN i fronten; spejles bevidst
 * ikke til Deno — kom-i-gang-mailen (onboardingRytme.ts, begge spejle)
 * følger titlerne, og onboardingRytme.test.ts låser pariteten.
 *
 * HVORFOR: tjeklisten skal krydse af AUTOMATISK efterhånden som medlemmet
 * gør tingene — ikke ved at de markerer noget selv. «Gjort» betyder
 * HANDLING, ikke besøg: de har uploadet, udfyldt, skrevet. Dommen skal
 * derfor ligge ét sted, være testet, og være uafhængig af fladen (boksen
 * der ligger på alle sider). Fladen henter data og viser; motoren afgør.
 *
 * SEKS PUNKTER, SEKS STEDER (2/10-2026 — Jonas 1/10 22:50: «medlemmer
 * føler sig holdt i hånden og ikke er et sekund i tvivl om hvad de skal
 * bruge hvilke områder til»; Jonas 2/10: «Fortæl det videre» ud: «Ja»).
 * Listen følger menuens seks steder (hbNav.ts: SEKS_STEDER), ét punkt pr.
 * sted, hvert med stedet som mærke — så listen også er en rundvisning.
 * Rækkefølgen er menuens, med ÉN flytning: rådgiveren som nr. 2 —
 * mennesket før tallene.
 *   1. boardroom   Dit Boardroom · Se velkomsten og udfyld din virksomhed
 *   2. raadgiver   Din rådgiver  · Skriv din første besked
 *   3. tal         Dine tal      · Upload og godkend din første rapport
 *   4. maal        Dine mål      · Sæt dit første mål (bekræftet)
 *   5. netvaerk    Netværket     · «Spørg mig om» + sig hej i Community
 *   6. akademi     Akademiet     · Gennemfør din første lektion med øvelse
 * Rækkefølgen er låst af testen i src/lib/__tests__/onboardingTjekliste.test.ts
 * mod SEKS_STEDER i hbNav.ts.
 *
 * DOMMENE ER DE GAMLE (handling, ikke kig) — ingen ny tabel, ingen ny dom
 * for «gjort». De otte gamle punkter (2/9–14/9) blev til seks sådan:
 *   velkomst + virksomhed  → boardroom  (gjort når BEGGE er: videoen set —
 *                            kun når der er en video — OG website, branche
 *                            og CVR er sat)
 *   besked                 → raadgiver  (uændret dom: last_member_message_at)
 *   rapport                → tal        (uændret dom: en facts-række)
 *   NYT                    → maal       (et AKTIVT, BEKRÆFTET mål — dommen
 *                            er Dine måls egen, maalBekraeft.erBekraeftet;
 *                            kun for medlemmer fra MAAL_PUNKT_FRA, se nedenfor)
 *   profil + praesentation → netvaerk   (gjort når BEGGE er: tekst OG foto —
 *                            profilUdfyldt — OG en aktiv præsentationstråd;
 *                            uden trådret kun profilen)
 *   handout                → akademi    (uændret dom: et udfyldt handout
 *                            uden for 'overordnet' — øvelsen ER handoutet)
 *   deling                 → UDGÅET     (Jonas 2/10 «Ja»; «Anbefal» lever
 *                            under Netværket i menuen, og stemplet
 *                            profiles.deling_hentet_at skrives stadig af
 *                            KreativFuldskaerm — det læses bare ikke her)
 * Et sammenlagt punkt er gjort, når begge halvdele er. Det kan IKKE sende
 * et medlem baglæns: var begge halvdele gjort før, er punktet gjort nu; var
 * én af dem ikke, var listen heller ikke færdig før. Tallet ændrer sig («6
 * af 8» → «4 af 5»), men «færdig» ændrer sig aldrig fra ja til nej af en
 * sammenlægning — og delingens udgang kan kun gøre en liste færdig.
 *
 * MÅL-PUNKTET KUN FOR NYE MEDLEMMER (MAAL_PUNKT_FRA — samme regel som
 * delingspunktet fik 14/9): det eneste punkt uden en gammel dom bag sig. Gav
 * vi det til alle, ville et medlem, der var FÆRDIG, vågne op til «5 af 6» —
 * en tjekliste, der går baglæns uden grund, og fokuskortet på forsiden ville
 * (for medlemmer under 30 dage) skifte tilbage til listen. Derfor findes
 * punktet kun for medlemmer, hvis profil er oprettet fra MAAL_PUNKT_FRA og
 * frem (profiles.created_at — sat af handle_new_user i samme transaktion som
 * company_members, rytmens dag 0). Uden dato (null/ukendt) udgår punktet —
 * hellere ét punkt for lidt til en gammel end en genåbnet liste. De gamle
 * medlemmer har fem punkter; Dine mål møder de gennem forsidens fokus
 * (maalFokus) og Score's løfter, som før.
 *
 * STIEN FØRER TIL HANDLINGEN, MÆRKET TIL STEDET: hvert punkt bærer sit sted
 * (`sted`, ordet fra menuen gennem TJEKLISTE_STED_LABEL), og `sti` fører
 * derhen, hvor handlingen gøres. To punkter har to handlinger og vælger den
 * første, der mangler: boardroom → velkomsten (sti "" = videoen åbner i
 * boksen, som før) så længe den ikke er set, ellers /settings; netvaerk →
 * profilen (/settings?fane=profil) så længe tekst eller foto mangler, ellers
 * composeren (/community?praesentation=1). `mangler` siger, hvad der er
 * tilbage, så medlemmet aldrig er i tvivl om, hvorfor punktet ikke er krydset.
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
 * velkomstvideo_guid), er velkomsten ikke en del af punkt 1 — titlen er da
 * «Udfyld din virksomhed», og fladen viser heller ikke overlejringen. Med
 * video: «Se velkomsten og udfyld din virksomhed». Antallet er seks (fem
 * for et medlem fra før MAAL_PUNKT_FRA) uanset video.
 */

import { PROFIL_MANGLER_FOTO_TEKST, PROFIL_MANGLER_TEKST, PROFIL_STI, profilMangler as profilManglerDom } from "./hjemmebane/profilUdfyldt";
import { PRAESENTATION_STI } from "./hjemmebane/praesentation";
import { erBekraeftet } from "./hjemmebane/maalBekraeft";
import type { Sted } from "./hjemmebane/stedsSaetninger";
import { afsluttedeMaanederTekst, erMaanedAfsluttet } from "./maanedsnoegle";

export type TjeklistePunktId = "boardroom" | "raadgiver" | "tal" | "maal" | "netvaerk" | "akademi";

/**
 * Mål-punktet gælder for medlemmer oprettet fra denne dag og frem
 * (UTC-midnat). Sat 2/10 til dagen efter bygningen — som DELING_PUNKT_FRA
 * blev 14/9. Rettes kun med vilje — flyttes den bagud, åbner listen igen
 * for dem der var færdige (filhovedet).
 */
export const MAAL_PUNKT_FRA = "2026-10-03T00:00:00.000Z";

/** Gælder mål-punktet for et medlem oprettet på dette tidspunkt? Null/ugyldig → nej. */
export function maalPunktGaelder(medlemSiden: string | null | undefined): boolean {
  if (!medlemSiden) return false;
  const t = new Date(medlemSiden).getTime();
  return Number.isFinite(t) && t >= new Date(MAAL_PUNKT_FRA).getTime();
}

/** Det af milestones-rækken tjeklisten læser — samme felter som Dine måls bekræftelsesdom. */
export interface MaalTilTjekliste {
  status: string;
  /** undefined = kolonnen ikke læst (migration 20261002100000 ikke kørt) = bekræftet, som i Dine mål. null = ubekræftet. */
  bekraeftet_at?: string | null;
}

export interface TjeklisteInput {
  /** Er der sat en velkomstvideo i platformconfig (app_config.velkomstvideo_guid)?
      Uden video er velkomsten ikke en del af punkt 1 — vi viser ikke tomt indhold. */
  har_velkomstvideo: boolean;
  /** profiles.velkomstvideo_set_at — sættes af fladen når videoen er set. */
  velkomstvideo_set_at: string | null;
  /**
   * Må medlemmet oprette en community-tråd? Klientens sammensatte dom
   * (useOnboardingTjekliste.ts): !isLegat && membershipTier === "full" —
   * MemberRoute (App.tsx:102) plus abonnent-udelukkelsen (hbNav.ts:97).
   * false → præsentationen er ikke en del af punkt 5 (kun profilen).
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
  /** Antal handouts med status 'completed' for brugeren (handoutEngine.toggleHandoutCompleted), uden 'overordnet'. */
  antal_udfyldte_handouts: number;
  /**
   * conversations.last_member_message_at — sat af triggeren på messages
   * KUN når afsenderen ikke er rådgiver (migration 20260311043341). Null
   * = medlemmet har aldrig skrevet.
   */
  last_member_message_at: string | null;
  /**
   * profiles.created_at — hvornår medlemmet kom ind (handle_new_user).
   * Grænsen for mål-punktet (maalPunktGaelder). Valgfri: udeladt/null
   * = punktet udgår, så ældre kaldere og tests er uændrede.
   */
  medlem_siden?: string | null;
  /**
   * Virksomhedens milestones (status + bekraeftet_at) — hentet fail-soft
   * som i Dine mål (dineMaalGrundlag: mangler kolonnen, læses status alene,
   * og bekraeftet_at er undefined = bekræftet). Valgfri: udeladt = ingen
   * mål = punktet ikke gjort (når det findes).
   */
  maal?: readonly MaalTilTjekliste[];
}

export interface TjeklistePunkt {
  id: TjeklistePunktId;
  /** Stedet i menuen, punktet hører til — mærket over titlen. */
  sted: Sted;
  /** «Skriv din første besked» */
  titel: string;
  /** Én kort linje. */
  beskrivelse: string;
  gjort: boolean;
  /** Hvor punktet føres hen. Relativ sti. Tom streng = velkomsten åbnes i boksen, ikke en side. */
  sti: string;
  /**
   * Kun for punkter der kan være DELVIST gjort (boardroom, netvaerk, maal —
   * og tal, når den er uploadet men ikke godkendt, 9/9): hvad der mangler,
   * så medlemmet ved hvorfor det ikke er krydset af. Tom liste når punktet
   * er gjort.
   */
  mangler?: string[];
}

export interface Tjekliste {
  /** Seks i fast rækkefølge — maal udgår for medlemmer fra før MAAL_PUNKT_FRA. */
  punkter: TjeklistePunkt[];
  antal_gjort: number;
  /** 6 for et nyt medlem; 5 for et medlem fra før MAAL_PUNKT_FRA. */
  antal_i_alt: number;
  /** true når alle punkter er gjort. */
  faerdig: boolean;
}

/** Den faste rækkefølge — ét sted, så testen kan låse den mod menuen (SEKS_STEDER, rådgiveren som nr. 2). */
export const TJEKLISTE_RAEKKEFOELGE: readonly TjeklistePunktId[] = ["boardroom", "raadgiver", "tal", "maal", "netvaerk", "akademi"];

/** Punktets sted (stedsSaetninger.Sted) — én liste, så fladen og testen læser samme kobling. */
export const TJEKLISTE_STED: Readonly<Record<TjeklistePunktId, Sted>> = {
  boardroom: "boardroom",
  raadgiver: "din_raadgiver",
  tal: "dine_tal",
  maal: "dine_maal",
  netvaerk: "netvaerket",
  akademi: "akademiet",
};

/** Stedets ord — menuens (hbNav.ts: SEKS_STEDER; testen låser, at de er ens). */
export const TJEKLISTE_STED_LABEL: Readonly<Record<Sted, string>> = {
  boardroom: "Dit Boardroom",
  dine_tal: "Dine tal",
  dine_maal: "Dine mål",
  netvaerket: "Netværket",
  akademiet: "Akademiet",
  din_raadgiver: "Din rådgiver",
};

/**
 * Stierne — til HANDLINGEN (filhovedet). boardroom og netvaerk har to:
 * den første, der mangler, vinder (byggTjekliste). «velkomst» er tom:
 * videoen åbner i boksen, ikke på en side (fladen og fokusCtaHref læser
 * sti "" som velkomsten).
 */
export const TJEKLISTE_STIER = {
  velkomst: "",
  virksomhed: "/settings",
  raadgiver: "/chat",
  tal: "/reports",
  maal: "/milestones",
  profil: PROFIL_STI,
  praesentation: PRAESENTATION_STI,
  // Handouts i Akademiet (1/10-2026 nat): øvelserne ligger under lektionerne
  // (OevelseKort) — punktet fører til Akademiet, aldrig /handouts (medlemmet
  // har ingen handout-liste). Tællingen (antal_udfyldte_handouts) er uændret:
  // øvelsen ER handoutet.
  akademi: "/akademiet",
} as const;

/** Teksterne for det der kan mangle — eksporteret så fladen og testen bruger samme ord. */
export const MANGLER_TEKST = {
  velkomst: "at se velkomsten",
  ask_me_about: PROFIL_MANGLER_TEKST,
  foto: PROFIL_MANGLER_FOTO_TEKST,
  praesentation: "et opslag om hvem du er",
  website: "virksomhedens website",
  branche: "branchen",
  cvr: "CVR-nummeret",
  godkendelse: "at godkende tallene",
  afsluttet_maaned: "en afsluttet måned",
  bekraeftelse: "at sige ja til det mål, der venter",
} as const;

/** Sat = ikke null OG ikke kun mellemrum. Et website på « » er ikke et website. */
function erSat(vaerdi: string | null | undefined): boolean {
  return (vaerdi ?? "").trim().length > 0;
}

export function byggTjekliste(input: TjeklisteInput, nu: Date = new Date()): Tjekliste {
  // VELKOMST — stemplet sættes af fladen når videoen er set. Handling
  // (afspillet), ikke besøg: profiles.tour_completed_at måler kun første
  // besøg på forsiden og bruges bevidst ikke. Uden video er velkomsten
  // ikke en del af punktet.
  const velkomstMangler = input.har_velkomstvideo && input.velkomstvideo_set_at === null;

  // VIRKSOMHED — website OG branche OG CVR. Tre felter, ikke alle:
  // adresse, telefon og logo bruges ikke af noget der regner. Branchen er
  // nøglen til kpi_benchmarks — uden den er sammenligningen tom. CVR er
  // nøglen til CVR-registret og til genbrug ved fornyelse.
  const virksomhedMangler: string[] = [];
  if (!erSat(input.website)) virksomhedMangler.push(MANGLER_TEKST.website);
  if (!erSat(input.industry_label)) virksomhedMangler.push(MANGLER_TEKST.branche);
  if (!erSat(input.cvr_number)) virksomhedMangler.push(MANGLER_TEKST.cvr);

  // 1. DIT BOARDROOM = velkomsten (med video) + virksomheden. Stien er den
  // første handling, der mangler: videoen i boksen, ellers /settings.
  const boardroomMangler = [...(velkomstMangler ? [MANGLER_TEKST.velkomst] : []), ...virksomhedMangler];

  // 2. DIN RÅDGIVER — triggeren sætter stemplet kun for beskeder fra ikke-
  // rådgivere, så det kan ikke krydses af ved at rådgiveren skriver først.
  const beskedGjort = input.last_member_message_at !== null;

  // 3. DINE TAL — GODKENDT, ikke bare uploadet (rettet 9/9, se TjeklisteInput).
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

  // 4. DINE MÅL — et AKTIVT, BEKRÆFTET mål: Dine måls egen dom (maalBekraeft.
  // erBekraeftet — kolonnen ulæst = bekræftet, som i Dine mål). «Nået» er
  // ikke kravet; at have sat målet er. Venter et aktivt mål på medlemmets ja
  // (en rådgivers forslag), siger punktet det og fører til Dine mål.
  const maalRaekker = input.maal ?? [];
  const maalGjort = maalRaekker.some((m) => m.status === "active" && erBekraeftet(m));
  const maalVenter = !maalGjort && maalRaekker.some((m) => m.status === "active" && !erBekraeftet(m));
  const maalMangler: string[] = maalVenter ? [MANGLER_TEKST.bekraeftelse] : [];

  // 5. NETVÆRKET = profilen (tekst OG foto, 17/9 Jonas «C» — profilUdfyldt.ts'
  // filhoved med begge citater; ask_me_about frem for full_name, fordi
  // full_name ALTID findes og ikke siger om medlemmet har gjort noget) +
  // præsentationen (en aktiv tråd, kun med trådret). Stien er profilen, så
  // længe den mangler, ellers composeren.
  const profilMangler = profilManglerDom(input);
  const praesentationMangler = input.kan_oprette_traad && !input.har_praesentation;
  const netvaerkMangler = [...profilMangler, ...(praesentationMangler ? [MANGLER_TEKST.praesentation] : [])];

  // 6. AKADEMIET — udfyldt, ikke startet. En påbegyndt række (in_progress)
  // findes så snart et enkelt felt er gemt; «Markér udfyldt» er den
  // handling der tæller. Tællingen (useOnboardingTjekliste) udelader
  // overordnet (2/10): det er retningen i Dine mål, ikke en øvelse.
  const handoutGjort = input.antal_udfyldte_handouts > 0;

  const punkterEfterId: Record<TjeklistePunktId, TjeklistePunkt> = {
    boardroom: {
      id: "boardroom",
      sted: TJEKLISTE_STED.boardroom,
      titel: input.har_velkomstvideo ? "Se velkomsten og udfyld din virksomhed" : "Udfyld din virksomhed",
      beskrivelse: input.har_velkomstvideo
        ? "En kort video om, hvordan du får mest ud af The Boardroom — og website, branche og CVR, så vi regner rigtigt fra start."
        : "Website, branche og CVR — så vi regner rigtigt fra start.",
      gjort: boardroomMangler.length === 0,
      sti: velkomstMangler ? TJEKLISTE_STIER.velkomst : TJEKLISTE_STIER.virksomhed,
      mangler: boardroomMangler,
    },
    raadgiver: {
      id: "raadgiver",
      sted: TJEKLISTE_STED.raadgiver,
      titel: "Skriv din første besked",
      beskrivelse: "Sig hej, og fortæl hvad du vil have ud af det næste år — så ved vi, hvor du er.",
      gjort: beskedGjort,
      sti: TJEKLISTE_STIER.raadgiver,
    },
    tal: {
      id: "tal",
      sted: TJEKLISTE_STED.tal,
      titel: "Upload og godkend din første rapport",
      beskrivelse: kunForTidligeUploads
        ? `Den måned du har uploadet, kan først godkendes når den er omme. Upload ${maaneder} imens.`
        : rapportUploadetIkkeGodkendt
          ? "Rapporten er uploadet — godkend tallene, så de kommer i spil."
          : `Upload ${maaneder} — én fil pr. måned, også fra før du blev medlem.`,
      gjort: rapportGjort,
      sti: TJEKLISTE_STIER.tal,
      mangler: rapportMangler,
    },
    maal: {
      id: "maal",
      sted: TJEKLISTE_STED.maal,
      titel: "Sæt dit første mål",
      beskrivelse: maalVenter
        ? "Et mål venter på dit ja — sig ja til det, eller sæt dit eget."
        : "Ét mål med en frist — så ved vi begge, hvad vi arbejder hen imod.",
      gjort: maalGjort,
      sti: TJEKLISTE_STIER.maal,
      mangler: maalMangler,
    },
    netvaerk: {
      id: "netvaerk",
      sted: TJEKLISTE_STED.netvaerk,
      titel: input.kan_oprette_traad ? "Fortæl, hvad man kan spørge dig om — og sig hej" : "Fortæl, hvad man kan spørge dig om",
      beskrivelse: input.kan_oprette_traad
        ? "Et foto, hvad de andre kan spørge dig om — og et opslag om hvem du er."
        : "Et foto, og hvad de andre kan spørge dig om.",
      gjort: netvaerkMangler.length === 0,
      sti: profilMangler.length > 0 ? TJEKLISTE_STIER.profil : TJEKLISTE_STIER.praesentation,
      mangler: netvaerkMangler,
    },
    akademi: {
      id: "akademi",
      sted: TJEKLISTE_STED.akademi,
      titel: "Gennemfør din første lektion med øvelse",
      beskrivelse: "Øvelsen ligger under lektionen — udfyld den, og tag den med til din rådgiver.",
      gjort: handoutGjort,
      sti: TJEKLISTE_STIER.akademi,
    },
  };

  // Rækkefølgen kommer fra TJEKLISTE_RAEKKEFOELGE, ikke fra objektets
  // nøgleorden — så den er låst ét sted. Før MAAL_PUNKT_FRA filtreres maal
  // fra; resten beholder deres indbyrdes orden.
  const punkter = TJEKLISTE_RAEKKEFOELGE.filter((id) => id !== "maal" || maalPunktGaelder(input.medlem_siden)).map((id) => punkterEfterId[id]);
  const antal_gjort = punkter.filter((p) => p.gjort).length;

  return {
    punkter,
    antal_gjort,
    antal_i_alt: punkter.length,
    faerdig: antal_gjort === punkter.length,
  };
}
