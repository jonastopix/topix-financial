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
 *     Akademiet, Podcast & Talks, Rabataftaler, Events, Netværket —
 *                    medlemmets flader uden rådgiver-gren; bliver, skubbet ned.
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

export type HbAktiv =
  | "boardroom" | "akademiet" | "rapportering" | "noegletal" | "budget" | "milestones" | "handouts"
  | "booksession" | "podcast" | "rabataftaler" | "events" | "medlemmer" | "community" | "chat"
  | "virksomheder" | "opgaver" | "konto";

export interface HbNavInput {
  isAdvisor: boolean;
  erAbonnent: boolean;
  active: HbAktiv;
}

export const BLOK_MEDLEMMETS_FLADER = "Medlemmets flader";
export const BLOK_PLATFORM = "Platform";

function dineTal(active: HbAktiv): HbNavEntry {
  return {
    label: "Dine tal",
    children: [
      { label: "Rapportering", to: "/reports", active: active === "rapportering" },
      { label: "KPI'er", to: "/kpis", active: active === "noegletal" },
      { label: "Budget", to: "/budget", active: active === "budget" },
      { label: "Milestones", to: "/milestones", active: active === "milestones" },
      { label: "Handouts", to: "/handouts", active: active === "handouts" },
    ],
  };
}

const podcastTalks = (active: HbAktiv): HbNavEntry => ({ label: "Podcast & Talks", to: "/podcast", active: active === "podcast" });
const rabataftaler = (active: HbAktiv): HbNavEntry => ({ label: "Rabataftaler", to: "/rabataftaler", active: active === "rabataftaler" });

/** Medlemmets menu — ORDRET som før 8/9 (HbMemberShell.tsx:107-220). */
export function medlemmetsNav(active: HbAktiv, erAbonnent: boolean, boardroomTo: string): HbNavEntry[] {
  if (erAbonnent) return [dineTal(active), podcastTalks(active), rabataftaler(active)];
  return [
    { label: "Dit Boardroom", to: boardroomTo, active: active === "boardroom" },
    dineTal(active),
    {
      label: "Din rådgiver",
      children: [
        { label: "Chat", to: "/chat", active: active === "chat" },
        { label: "Book session", to: "/book-session", active: active === "booksession" },
      ],
    },
    { label: "Akademiet", to: "/akademiet", active: active === "akademiet" },
    podcastTalks(active),
    rabataftaler(active),
    { label: "Events", to: "/events", active: active === "events" },
    { label: "Netværket", to: "/medlemmer", active: active === "medlemmer" },
    { label: "Community", to: "/community", active: active === "community" },
  ];
}

/** Rådgiverens menu (8/9) — se filhovedet. */
export function raadgiverensNav(active: HbAktiv): HbNavEntry[] {
  const medlem = BLOK_MEDLEMMETS_FLADER;
  const platform = BLOK_PLATFORM;
  return [
    { label: "Forside", to: "/", active: active === "boardroom" },
    { label: "Virksomheder", to: "/virksomheder", active: active === "virksomheder" },
    { label: "Indbakke", to: "/chat", active: active === "chat" },
    { label: "Community", to: "/community", active: active === "community" },
    { label: "Indhold", to: "/admin/indhold" },
    { ...dineTal(active), blok: medlem },
    { label: "Akademiet", to: "/akademiet", active: active === "akademiet", blok: medlem },
    { ...podcastTalks(active), blok: medlem },
    { ...rabataftaler(active), blok: medlem },
    { label: "Events", to: "/events", active: active === "events", blok: medlem },
    { label: "Netværket", to: "/medlemmer", active: active === "medlemmer", blok: medlem },
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

/** Hele nav'en for skallen. Rådgiveren får sin egen; medlemmet sin — den
    dag en rådgivers egen tier skulle være abonnent, vinder rådgivermenuen
    (før hang admin-blokken på begge grene af samme grund). */
export function bygHbNav({ isAdvisor, erAbonnent, active }: HbNavInput): HbNavEntry[] {
  if (isAdvisor) return raadgiverensNav(active);
  return medlemmetsNav(active, erAbonnent, erAbonnent ? "/kpis" : "/");
}
