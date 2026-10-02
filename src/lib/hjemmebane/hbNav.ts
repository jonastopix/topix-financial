/**
 * src/lib/hjemmebane/hbNav.ts
 *
 * Hb-skallens navigation som REN funktion — én for medlemmet, én for
 * rådgiveren — så menuen kan låses med tests
 * (src/lib/hjemmebane/__tests__/hbNav.test.ts). HbMemberShell kalder
 * bygHbNav og giver resultatet til HbSidebar (desktop) og
 * HbSidebarDrawer (mobil) — SAMME array begge steder.
 *
 * MEDLEMMETS MENU er flyttet ORDRET fra HbMemberShell (8/9) og må ikke
 * ændre sig: testen låser labels, links og rækkefølge for både fuldt
 * medlem og abonnent.
 *
 * SEKS STEDER (2/10-2026 nat, FORBEREDT — afventer Jonas' ja kl. 08:15;
 * Jonas 1/10 22:50 «Fedt med menuen. Jeg er enig med dig»): det fulde
 * medlems menu er seks steder, seks opgaver —
 *   Dit Boardroom · Dine tal (Rapportering, KPI'er, Budget) · Dine mål ·
 *   Netværket (Community, Events, Medlemmerne, Fordele, Anbefal) ·
 *   Akademiet · Din rådgiver (Chat, Book session)
 * «Dine mål» er sit EGET punkt (ud af Dine tal — et mål er ikke et tal).
 * «Netværket» samler det, der før var fire punkter: Community, Events,
 * Netværket (nu «Medlemmerne», /medlemmer), Rabataftaler (nu «Fordele»:
 * en rabat er noget du får af netværket, ikke noget du lærer — Jonas skal
 * bekræfte; linjen FORDELE_PUNKT flyttes med ét greb) og «Fortæl det
 * videre» (nu «Anbefal», /deling — kun teksten er ny). INGEN rute er
 * ændret: /community, /events, /medlemmer, /rabataftaler og /deling er
 * links og mails udefra. Stedsætningerne («Det her er stedet, hvor …»)
 * bor i stedsSaetninger.ts. Abonnentens og rådgiverens menu er URØRT —
 * abonnenten har intet netværk og beholder «Rabataftaler» som direkte
 * punkt. Værn: seksSteder.guard.test.ts.
 *
 * RÅDGIVERENS MENU (Jonas 8/9): «Bør det ikke ligge øverst for os? …
 * Rådgiverne skal have en menustruktur der passer til den måde vi
 * arbejder på.» Før fik rådgiveren medlemmets ni punkter og en admin-blok
 * nederst (raadgiverfladen-design §3.1, «indholdet skifter efter rolle,
 * ikke pladsen») — i praksis ni punkter at komme forbi, og «Din rådgiver ›
 * Chat, Book session» i en menu hvor de selv ER rådgiveren. Besluttet:
 * det I bruger øverst, medlemmets flader nedenunder, tilgængelige men
 * ikke i vejen. «Podcast og Community skal ikke fjernes … men skubbes
 * ned» — Community står dog øverst efter Jonas' egen liste (Forside,
 * Virksomheder, Community, Indhold).
 *
 * PODCASTEN ER UDE (Jonas 11/9, beslutning 17; bygget 15/9): «podcasten
 * ikke giver mening lige nu … Det er for alle. Så det skal ikke fylde så
 * meget.» Menupunktet «Podcast & Talks» (/podcast) er væk fra alle tre
 * menuer — fuldt medlem, abonnent og rådgiver — og ruten er nedlagt (målt
 * 15/9: ingen dybe links fra mails, tjeklisten eller Akademiet; feedet har
 * 18 episoder, nyeste 17/9 2025). I stedet ét stille tekstlink til showet
 * på Spotify nederst i sidebaren (HbSidebar `spotifyLink`, adressen i
 * podcastSpotify.ts) for medlemmer og abonnenter. Abonnentens menu er
 * dermed «Dine tal» + «Rabataftaler». «Talks» var aldrig en liste —
 * optagelser hører til sit event (content_items.area = 'talks', urørt).
 *
 *   ØVERST (uden overskrift)
 *     Forside        «/» — dommen (Index.tsx: rådgiver uden valgt
 *                    virksomhed lander på RaadgiverForsideView). Ordet er
 *                    Jonas' eget fra 8/9; det siger hvad fladen er for en
 *                    rådgiver — dagens forside — ikke medlemmets «Dit
 *                    Boardroom». Ruten er uændret.
 *     Virksomheder   /virksomheder
 *     Indbakke       /chat — for en rådgiver er /chat CompanyChatPane, den
 *                    flade indbakke over alle samtaler (ChatShell.tsx:16,
 *                    :104-111), ikke medlemmets chat. Det er rådgiverens
 *                    egen flade og hører øverst; «Din rådgiver › Chat» var
 *                    det samme link under et forkert navn.
 *     Community      /community
 *     Indhold        /admin/indhold — de otte indholdsfaner (HbAdminShell).
 *   MEDLEMMETS FLADER (overskrift «Medlemmets flader»)
 *     Dine tal › Rapportering, KPI'er, Budget, Milestones, Handouts —
 *                    for en rådgiver uden valgt virksomhed viser de fem
 *                    «Vælg en virksomhed» (HbAdvisorCompanyPrompt), og med
 *                    valgt virksomhed medlemmets tal. De BRUGES (det er
 *                    vejen ind i tallene med override), så de bliver.
 *     Akademiet, Rabataftaler, Events, Netværket —
 *                    medlemmets flader uden rådgiver-gren; bliver, skubbet ned.
 *     Dit certifikat /certifikat/forhaandsvisning (Jonas 29/9: «Jeg kan jo
 *                    heller ikke finde det som rådgiver») — SIDST i blokken.
 *                    Forhåndsvisningen, ikke /certifikat: den skjuler siden
 *                    for rådgivere (certifikat/dom.ts).
 *                    (Podcast & Talks stod her til 15/9.)
 *     IKKE med: «Dit Boardroom» (for rådgiveren er «/» Forside ovenfor;
 *                    medlemmets Boardroom vises kun med valgt virksomhed,
 *                    og så er man der allerede) og «Book session»
 *                    (BookSessionView: Morten-kortet skjules for
 *                    rådgivere, resten er medlemmets betalte booking af
 *                    Jonas — meningsløs for dem).
 *   PLATFORM (overskrift «Platform», nederst)
 *     E-mails, E-mail-log, Review Queue, Platformconfig, Feedback, Legat,
 *     Import — driften. Seks af syv kræver admin-rollen (App.tsx
 *     AdminRoute); det er ikke ændret her. Navnene er ikke afgjort
 *     (mangellisten «Menuen: tingene skal hedde det de er»).
 *
 * «Opgaver» er ude af menuen (Jonas 8/9: listen hører på forsiden);
 * ruten /opgaver bliver som «vis alle».
 */

import type { HbNavEntry } from "@/components/hjemmebane/HbSidebar";
import type { CertifikatMenu } from "@/lib/certifikat/dom";

export type HbAktiv =
  | "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget" | "milestones" | "handouts"
  | "booksession" | "rabataftaler" | "events" | "medlemmer" | "community" | "chat"
  | "virksomheder" | "opgaver" | "konto"
  /** /ansoegninger (18/9): rådgiverens pipeline over ansøgninger — punktet ved siden af Virksomheder. */
  | "ansoegninger"
  /** /engagement (1/10): rådgivernes overblik over kundernes score, streak og trofæer — ved siden af Virksomheder. */
  | "engagement"
  /** /oekonomi (Ø2, 18/9): økonomioverblikket — kun partnere. */
  | "oekonomi"
  /** /webinar (19/9): webinartallene — tilmeldte, deltagelse, annoncespor. Alle rådgivere. */
  | "webinar"
  /** /deling (14/9): «Fortæl det videre», sidste punkt i medlemmets menu. */
  | "deling"
  /** /certifikat (29/9): «Dit certifikat» — efter «Fortæl det videre», kun når medlemmet er berettiget. */
  | "certifikat";

export interface HbNavInput {
  isAdvisor: boolean;
  erAbonnent: boolean;
  active: HbAktiv;
  /** Rollen partner (Ø2, 18/9 — Jonas: «Kun mig og Morten»): «Økonomi» i
      rådgivermenuen KUN for partnere. Udeladt = ikke partner; menuen er
      uændret for alle andre rådgivere. */
  isPartner?: boolean;
  /** «Dit certifikat» (29/9, HANDOFF §3 «Menupunkt»): punktets tilstand fra
      lib/certifikat/dom.ts certifikatMenu — «ny» (åbent, aldrig hentet: mærket
      «Ny»), «laast» (hængelås efter teksten), «aaben» (punktet alene). Udeladt
      eller null = intet punkt: menuen er ordret som før for alle, der ikke er
      berettiget — og for rådgivere altid. */
  certifikat?: CertifikatMenu | null;
}

export const BLOK_MEDLEMMETS_FLADER = "Medlemmets flader";
export const BLOK_PLATFORM = "Platform";

/** «Handouts» i «Dine tal» (1/10-2026 nat): rådgiverens vej ind i
    virksomhedens handouts med override — og abonnentens (exit-produktet,
    rådets fund 2, 2/10): abonnenten har ingen lektioner i Akademiet, så
    uden punktet mistede den sine handouts. Det FULDE medlem har intet
    punkt — handouts hører til Akademiet som lektionens øvelse (Jonas 1/10
    22:29: «Handouts hører til Akademiet … Enkelthed er et nøgleord»;
    motoren lib/hjemmebane/oevelse.ts, værn handoutsIAkademiet.guard). */
export const HANDOUTS_PUNKT = { label: "Handouts", to: "/handouts" } as const;

/** «Dine tal». `fuldListe` (før 2/10: `medHandouts`): rådgiveren og
    abonnenten får den FULDE liste — Rapportering, KPI'er, Budget, Dine mål,
    Handouts; det fulde medlem (seks steder, 2/10) de tre tal-flader alene:
    «Dine mål» er dets eget punkt, og handouts hører til Akademiet (1/10).
    De to fravalg følges ad, derfor ét flag. */
function dineTal(active: HbAktiv, fuldListe: boolean): HbNavEntry {
  return {
    label: "Dine tal",
    children: [
      { label: "Rapportering", to: "/reports", active: active === "rapportering" },
      { label: "KPI'er", to: "/kpis", active: active === "noegletal" },
      { label: "Budget", to: "/budget", active: active === "budget" },
      ...(fuldListe
        ? [
            // «Dine mål» («Én plan», fase 3, 16/9): stien /milestones beholdes, ordet er målenes.
            { label: "Dine mål", to: "/milestones", active: active === "milestones" },
            { ...HANDOUTS_PUNKT, active: active === "handouts" },
          ]
        : []),
    ],
  };
}

const rabataftaler = (active: HbAktiv): HbNavEntry => ({ label: "Rabataftaler", to: "/rabataftaler", active: active === "rabataftaler" });

/** «Fordele» under Netværket (seks steder, 2/10): rabataftalerne som
    underpunkt — forslagets anbefaling, som Jonas skal bekræfte. Skal de
    tilbage som eget punkt, flyttes denne ene linje ud af NETVAERKET og ind
    i punkterne (rabataftaler(active)). Ruten er den samme. */
export const FORDELE_PUNKT = { label: "Fordele", to: "/rabataftaler" } as const;

/** «Anbefal» (seks steder, 2/10) afløser ordet «Fortæl det videre» — kun
    teksten; /deling og kreativerne er urørte. */
export const ANBEFAL_PUNKT = { label: "Anbefal", to: "/deling" } as const;

/** Netværket (seks steder, 2/10): Community er forsiden (første barn), så
    Events (mærket «Live nu» lander på barnet — HbMemberShell), Medlemmerne
    (/medlemmer — ordet «Netværket» er nu stedets, ikke listens), Fordele,
    Anbefal. Som «Dine tal» har gruppen intet eget link. */
function netvaerket(active: HbAktiv): HbNavEntry {
  return {
    label: "Netværket",
    children: [
      { label: "Community", to: "/community", active: active === "community" },
      { label: "Events", to: "/events", active: active === "events" },
      { label: "Medlemmerne", to: "/medlemmer", active: active === "medlemmer" },
      { ...FORDELE_PUNKT, active: active === "rabataftaler" },
      { ...ANBEFAL_PUNKT, active: active === "deling" },
    ],
  };
}

/** Det fulde medlems seks steder i menuens rækkefølge (seks steder, 2/10)
    — én liste, som værnet læser; menuen bygges af den. */
export const SEKS_STEDER = ["Dit Boardroom", "Dine tal", "Dine mål", "Netværket", "Akademiet", "Din rådgiver"] as const;

/** Medlemmets menu — abonnenten ORDRET som før 8/9 (minus «Podcast & Talks»,
    15/9); det fulde medlem de seks steder (2/10, se filhovedet). */
export function medlemmetsNav(active: HbAktiv, erAbonnent: boolean, boardroomTo: string, certifikat?: CertifikatMenu | null): HbNavEntry[] {
  if (erAbonnent) return [dineTal(active, true), rabataftaler(active)];
  const punkter: HbNavEntry[] = [
    { label: "Dit Boardroom", to: boardroomTo, active: active === "boardroom" },
    dineTal(active, false),
    // Eget punkt (seks steder, 2/10): et mål er ikke et tal. Samme sti som før.
    { label: "Dine mål", to: "/milestones", active: active === "milestones" },
    netvaerket(active),
    { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },
    {
      label: "Din rådgiver",
      children: [
        { label: "Chat", to: "/chat", active: active === "chat" },
        { label: "Book session", to: "/book-session", active: active === "booksession" },
      ],
    },
  ];
  // «Dit certifikat» (29/9): SIDST, efter de seks steder — og KUN når
  // medlemmet er berettiget (certifikat sat). Et lukket område skal ikke
  // stå i menuen for dem, det aldrig åbner for. Mærket «Ny» går til siden
  // selv (der er ingen anden side at gå til, modsat Events' «Live nu»).
  if (certifikat) punkter.push(certifikatPunkt(active, certifikat));
  return punkter;
}

export const CERTIFIKAT_LABEL = "Dit certifikat";
export const CERTIFIKAT_NY = "Ny";

function certifikatPunkt(active: HbAktiv, tilstand: CertifikatMenu): HbNavEntry {
  const punkt: HbNavEntry = { label: CERTIFIKAT_LABEL, to: "/certifikat", active: active === "certifikat" };
  if (tilstand === "ny") punkt.maerke = { tekst: CERTIFIKAT_NY, to: "/certifikat", titel: "Dit certifikat er klar til at blive hentet" };
  if (tilstand === "laast") punkt.laast = true;
  return punkt;
}

/** Rådgiverens menu (8/9) — se filhovedet. «Økonomi» (Ø2, 18/9) står sidst
    i den øverste blok og KUN når isPartner er sand — for alle andre
    rådgivere er arrayet ordret som før. */
export function raadgiverensNav(active: HbAktiv, isPartner = false): HbNavEntry[] {
  const medlem = BLOK_MEDLEMMETS_FLADER;
  const platform = BLOK_PLATFORM;
  return [
    { label: "Forside", to: "/", active: active === "boardroom" },
    { label: "Virksomheder", to: "/virksomheder", active: active === "virksomheder" },
    // Jonas 18/9 (flow-gennemgangen §7): pipelinen skal kunne findes uden om forsidens linje.
    { label: "Ansøgninger", to: "/ansoegninger", active: active === "ansoegninger" },
    // Jonas 19/9: webinartallene skal kunne findes uden om ansøgningerne —
    // de 330 tilmeldte er pipelinen FØR pipelinen. Alle rådgivere, ikke kun
    // partnere: det er ikke omsætningstal, det er hvem der kommer.
    { label: "Webinar", to: "/webinar", active: active === "webinar" },
    // 1/10 (efter Webinar: Ansøgninger skal stå lige efter Virksomheder og Webinar lige efter Ansøgninger — flowRettelser.guard 7, hbNav.test): trofæer og streak pr. kunde (docs/boardroom-score.md «Trofæer»).
    { label: "Engagement", to: "/engagement", active: active === "engagement" },
    { label: "Indbakke", to: "/chat", active: active === "chat" },
    { label: "Community", to: "/community", active: active === "community" },
    { label: "Indhold", to: "/admin/indhold" },
    ...(isPartner === true ? [{ label: "Økonomi", to: "/oekonomi", active: active === "oekonomi" }] : []),
    { ...dineTal(active, true), blok: medlem },
    { label: "Akademiet", to: "/akademiet", active: active === "akademiet", blok: medlem },
    { ...rabataftaler(active), blok: medlem },
    { label: "Events", to: "/events", active: active === "events", blok: medlem },
    { label: "Netværket", to: "/medlemmer", active: active === "medlemmer", blok: medlem },
    // «Dit certifikat» (29/9): rådgiveren ser medlemmets side gennem forhåndsvisningen.
    { label: CERTIFIKAT_LABEL, to: "/certifikat/forhaandsvisning", active: active === "certifikat", blok: medlem },
    {
      label: "Platform",
      blok: platform,
      children: [
        { label: "E-mails", to: "/admin/emails" },
        { label: "E-mail-log", to: "/admin/email-log" },
        { label: "Review Queue", to: "/admin/review-queue" },
        { label: "Platformconfig", to: "/admin/config" },
        { label: "Feedback", to: "/admin/feedback" },
        { label: "Legat", to: "/admin/legat" },
        { label: "Import", to: "/admin/import" },
      ],
    },
  ];
}

/** «Live nu» (10/9) på det punkt, der peger på /events — uanset om det står
    øverst (rådgiveren) eller som barn (det fulde medlem, seks steder 2/10:
    Events under Netværket). Ren; rører ingen andre punkter. HbMemberShell
    kalder den med liveEvent-mærket. */
export function medLiveMaerke(nav: HbNavEntry[], maerke: NonNullable<HbNavEntry["maerke"]>): HbNavEntry[] {
  return nav.map((e) => {
    if (e.to === "/events") return { ...e, maerke };
    if (e.children?.some((c) => c.to === "/events")) {
      return { ...e, children: e.children.map((c) => (c.to === "/events" ? { ...c, maerke } : c)) };
    }
    return e;
  });
}

/** Hele nav'en for skallen. Rådgiveren får sin egen; medlemmet sin — den
    dag en rådgivers egen tier skulle være abonnent, vinder rådgivermenuen
    (før hang admin-blokken på begge grene af samme grund). */
export function bygHbNav({ isAdvisor, erAbonnent, active, isPartner, certifikat }: HbNavInput): HbNavEntry[] {
  if (isAdvisor) return raadgiverensNav(active, isPartner === true);
  return medlemmetsNav(active, erAbonnent, erAbonnent ? "/kpis" : "/", certifikat);
}
