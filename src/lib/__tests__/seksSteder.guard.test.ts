import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { bygHbNav, medLiveMaerke, NETVAERKETS_BOERN, SEKS_STEDER } from "@/lib/hjemmebane/hbNav";
import { netvaerksSti, skallenTegnerSaetning, STEDER_MED_EGET_HOVED, STEDERNES_STIER, STEDS_SAETNINGER, visStedsSaetning } from "@/lib/hjemmebane/stedsSaetninger";
import { netvaerkFaner, visNetvaerkFaner } from "@/lib/hjemmebane/netvaerkFaner";

/**
 * seksSteder.guard — SEKS STEDER, skridt 1 (2/10-2026 nat; FORBEREDT,
 * afventer Jonas' ja kl. 08:15). Jonas 1/10 22:50: «Fedt med menuen. Jeg er
 * enig med dig» og «Måske skal nyheder væk? Måske skal Denne uges video væk.
 * Måske skal Værd at se igen væk. Det var fyld … Enkelthed er et nøgleord.»
 *
 *   1. MENUEN: det fulde medlems toppunkter er præcis SEKS_STEDER i den
 *      rækkefølge — Dit Boardroom · Dine tal · Dine mål · Netværket ·
 *      Akademiet · Din rådgiver; Netværkets fem børn i rækkefølgen Community,
 *      Events, Medlemmerne, Fordele, Anbefal; «Dine mål» eget punkt og IKKE
 *      under Dine tal; ingen rute ændret (de tretten links findes).
 *   2. ABONNENT OG RÅDGIVER URØRTE: deres lister er ordret som før 2/10.
 *   3. STEDSÆTNINGERNE ÉT STED: ordene «Det her er stedet, hvor» står i kode
 *      KUN i stedsSaetninger.ts; HbStedsSaetning læser STEDS_SAETNINGER og
 *      gater fail-closed (visStedsSaetning — rådets fund 2); skallen tegner
 *      komponenten KUN hvor den er den eneste indledning (skallenTegnerSaetning:
 *      ikke forsiden, ikke de otte steder med eget hoved — rådets fund 7),
 *      skjult på mobil i «fuld» (chatten — rådets fund 3); forsiden tegner
 *      den én gang under hilsenen; hvert sted med eget hoved tegner den selv
 *      under sin h1; rådgiverens forside aldrig.
 *   4. FORSIDEN RYDDET: «Fra os til dig», «Denne uges video», «Værd at se
 *      igen» og «Se tidligere» tegnes ikke i BoardroomView — intet StoryCard,
 *      ingen pickMainStory, ingen tiles; og det, der skulle blive, er der:
 *      Score, Din plan, Dine mål-ankeret, Dit næste skridt, fornyelsen,
 *      trofæerne (siden 2/10 eftermiddag inde i ScoreKortets «Se hvad der
 *      tæller», ikke som egen sektion — designgennemsynet i drift). Kortene og dommene (pushSelection.ts) er IKKE slettet — de
 *      kan tegne «Nyt fra os» i Akademiet. SKRIDT 2 (dom 8): «Din måned»,
 *      «Kommende» og «Fra fællesskabet» er heller ikke på forsiden — nederst
 *      står ÉT kort «Næste i Netværket» (næste event + nyeste opslag).
 *   5. «LIVE NU» følger Events ned under Netværket (medLiveMaerke).
 *
 * SKRIDT 2 (2/10-2026 — Jonas' ja: «Fordele» under Netværket; «Din måned»,
 * «Kommende», «Fra fællesskabet» forlader forsiden «med én linje tilbage»;
 * «Nyeste opslag fra community vil jeg dog gerne have vist nederst, under
 * næste event»):
 *   7. NETVÆRKET SOM ÉT STED MED FANER: fanerne ER menuens fem børn
 *      (NETVAERKETS_BOERN — én liste), dømt af STIEN (netvaerksSti: kun de
 *      fem forsider, ingen underside); gaten er sætningens (visNetvaerkFaner
 *      === visStedsSaetning: fuldt medlem, rådgiver i «Se som medlem», aldrig
 *      abonnenten, null tier = intet); skallen tegner HbNetvaerkFaner på de
 *      fem stier (netvaerkHovedSti) og sætningen IKKE dér
 *      (skallenTegnerSaetning er falsk for Netværket); hovedet er eyebrow →
 *      h1 → sætningen (HbStedsSaetning) → <nav> med vandret scroll og
 *      aria-current; Events, Medlemmerne og Fordele tegner HbNetvaerkFaneHoved
 *      (h2 under fanerne, eyebrow → h1 → intro uden) og IKKE sætningen;
 *      Community-fladen er URØRT (en anden agent bygger dér); «Community er
 *      forsiden.» står i Netværkets sætning igen.
 *   8. FORSIDEN, SKRIDT 2: intet «Din måned»/«Kommende»/«Fra fællesskabet»;
 *      «Næste i Netværket» nederst (efter «Din plan»), dommen
 *      naesteINetvaerket (ren), begge dele med tom tilstand; ingen
 *      member-directory-hentning, ingen ny RPC.
 * Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const NAV = "src/lib/hjemmebane/hbNav.ts";
const ORD = "src/lib/hjemmebane/stedsSaetninger.ts";
const KOMPONENT = "src/components/hjemmebane/HbStedsSaetning.tsx";
const SKAL = "src/components/hjemmebane/HbMemberShell.tsx";
const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const RAADGIVER_FORSIDE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const FANER = "src/components/hjemmebane/netvaerk/HbNetvaerkFaner.tsx";
const FANE_HOVED = "src/components/hjemmebane/netvaerk/HbNetvaerkFaneHoved.tsx";
const FANE_DOM = "src/lib/hjemmebane/netvaerkFaner.ts";
const COMMUNITY_VIEW = "src/components/hjemmebane/community/CommunityView.tsx";
const NETVAERK_VIEWS: Record<string, string> = {
  "/events": "src/components/hjemmebane/events/EventsView.tsx",
  "/medlemmer": "src/components/hjemmebane/members/MemberDirectoryView.tsx",
  "/rabataftaler": "src/components/hjemmebane/rabataftaler/RabataftalerView.tsx",
  // Rådets fund 1 (2/10): /deling havde to h1 under fanerne — nu fanens hoved som de tre andre.
  "/deling": "src/components/hjemmebane/deling/DelingView.tsx",
};
const NETVAERK_STIER = ["/community", "/events", "/medlemmer", "/rabataftaler", "/deling"];

const flad = (nav: ReturnType<typeof bygHbNav>) =>
  nav.map((n) => ({ label: n.label, to: n.to ?? null, children: n.children?.map((c) => ({ label: c.label, to: c.to ?? null })) ?? null }));

/** Alle .ts/.tsx under en mappe, uden tests. */
function kildefiler(mappe: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(resolve(ROD, mappe))) {
    const sti = join(mappe, navn);
    if (statSync(resolve(ROD, sti)).isDirectory()) {
      if (navn === "__tests__" || navn === "node_modules") continue;
      ud.push(...kildefiler(sti));
    } else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.|\.guard\./.test(navn)) ud.push(sti);
  }
  return ud;
}

/** Dom 1. */
export const menuenErSeksSteder = (medlem: ReturnType<typeof bygHbNav>): boolean => {
  const f = flad(medlem);
  const net = f.find((n) => n.label === "Netværket");
  const tal = f.find((n) => n.label === "Dine tal");
  const links = f.flatMap((n) => [n.to, ...(n.children ?? []).map((c) => c.to)]).filter((x): x is string => !!x);
  return f.map((n) => n.label).join("·") === SEKS_STEDER.join("·") &&
    JSON.stringify(net?.children) === JSON.stringify([
      { label: "Community", to: "/community" }, { label: "Events", to: "/events" }, { label: "Medlemmerne", to: "/medlemmer" },
      { label: "Fordele", to: "/rabataftaler" }, { label: "Anbefal", to: "/deling" },
    ]) &&
    JSON.stringify(tal?.children) === JSON.stringify([{ label: "Rapportering", to: "/reports" }, { label: "KPI'er", to: "/kpis" }, { label: "Budget", to: "/budget" }]) &&
    f.find((n) => n.label === "Dine mål")?.to === "/milestones" &&
    ["/", "/reports", "/kpis", "/budget", "/milestones", "/community", "/events", "/medlemmer", "/rabataftaler", "/deling", "/akademiet", "/chat", "/book-session"].every((to) => links.includes(to)) &&
    !f.some((n) => ["Fortæl det videre", "Rabataftaler", "Community", "Events", "Medlemmerne"].includes(n.label)) &&
    !links.includes("/handouts");
};

/** Dom 2: abonnent og rådgiver ordret som før 2/10. */
const ABONNENT_FOER = [
  { label: "Dine tal", to: null, children: [{ label: "Rapportering", to: "/reports" }, { label: "KPI'er", to: "/kpis" }, { label: "Budget", to: "/budget" }, { label: "Dine mål", to: "/milestones" }, { label: "Handouts", to: "/handouts" }] },
  { label: "Rabataftaler", to: "/rabataftaler", children: null },
];
// 2/10 14:22 (Jonas «Jeg kan ikke se /opkald»): «Opkald» under Webinar — en bevidst tilføjelse, ikke en glidning.
const RAADGIVER_FOER = [
  ["Forside", "/"], ["Virksomheder", "/virksomheder"], ["Ansøgninger", "/ansoegninger"], ["Webinar", "/webinar"], ["Opkald", "/opkald"], ["Engagement", "/engagement"], ["Indbakke", "/chat"], ["Community", "/community"], ["Indhold", "/admin/indhold"],
  ["Dine tal", null], ["Akademiet", "/akademiet"], ["Rabataftaler", "/rabataftaler"], ["Events", "/events"], ["Netværket", "/medlemmer"], ["Dit certifikat", "/certifikat/forhaandsvisning"], ["Platform", null],
];
export const abonnentOgRaadgiverUroerte = (abonnent: ReturnType<typeof bygHbNav>, raadgiver: ReturnType<typeof bygHbNav>): boolean =>
  JSON.stringify(flad(abonnent)) === JSON.stringify(ABONNENT_FOER) &&
  JSON.stringify(flad(raadgiver).map((n) => [n.label, n.to])) === JSON.stringify(RAADGIVER_FOER) &&
  JSON.stringify(raadgiver.find((n) => n.label === "Dine tal")?.children?.map((c) => c.to)) === JSON.stringify(["/reports", "/kpis", "/budget", "/milestones", "/handouts"]);

/** Dom 3: sætningerne ét sted. `kilder` = [sti, kode uden kommentarer]. */
export const saetningerneEtSted = (kilder: Array<[string, string]>, komponent: string, skal: string, forside: string, raadgiverForside: string): boolean => {
  const medOrdene = kilder.filter(([, k]) => k.includes("Det her er stedet, hvor")).map(([sti]) => sti);
  return medOrdene.length === 1 && medOrdene[0] === ORD &&
    komponent.includes('import { stedForSti, STEDS_SAETNINGER, visStedsSaetning } from "@/lib/hjemmebane/stedsSaetninger";') &&
    komponent.includes("{STEDS_SAETNINGER[sted]}") &&
    komponent.includes("data-steds-saetning={sted}") &&
    /const \{ isAdvisor, membershipTier \} = useAuth\(\);/.test(komponent) &&
    komponent.indexOf("useViewMode()") < komponent.indexOf("if (!sted) return null;") &&
    // Gaten ude: `ellers` (sidens gamle intro) — aldrig sætningen.
    komponent.includes("if (!vises) return <>{ellers}</>;") &&
    komponent.includes("const vises = visStedsSaetning({ isAdvisor, viewingAsMember, membershipTier });") &&
    !komponent.includes('"subscriber"') &&
    (skal.match(/<HbStedsSaetning sti=\{stedsSaetningSti\}/g) ?? []).length === 2 &&
    skal.includes("skallenTegnerSaetning(location.pathname) ? location.pathname : null") &&
    // «fuld» (chatten): skjult under md — på mobil er chatten hele skærmen (rådets fund 3).
    /<HbStedsSaetning sti=\{stedsSaetningSti\} className="hidden [^"]*md:block[^"]*" \/>/.test(skal) &&
    (forside.match(/<HbStedsSaetning sti="\/"/g) ?? []).length === 1 &&
    forside.indexOf("<PageHeader") < forside.indexOf('<HbStedsSaetning sti="/"') &&
    forside.indexOf('<HbStedsSaetning sti="/"') < forside.indexOf("<FornyelsesBaand />") &&
    !raadgiverForside.includes("HbStedsSaetning");
};

/** Dom 4: forsiden ryddet — og det, der skulle blive, er der. (Skridt 2:
    «Din måned» er ikke længere blandt det, der skal blive — dom 8.) */
export const forsidenRyddet = (forside: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  return krop.length > 0 &&
    !/"Fra os til dig"|Denne uges video|Værd at se igen|Se tidligere|Skjul tidligere/.test(krop) &&
    !/<StoryCard\b|pickMainStory\(|pickMainStory</.test(krop) &&
    !/pickActivePush\(|pickActiveWeekVideo\(|pickActiveItem\(|pickEvergreen\(|velkomstHovedhistorie\(/.test(krop) &&
    !/data-forside-venstre|data-forside-nyheden|data-forside-tiles|hasBand|band\.main|band\.side|redaktioneltHistory|countNewSince\(/.test(krop) &&
    /<ScoreKort\b/.test(krop) &&
    // Trofæerne (2/10 eftermiddag, designgennemsynet i drift): de BLIVER på forsiden, men inde i
    // ScoreKortets «Se hvad der tæller» — givet ind som props; ingen separat <TrofaeKort> på forsiden.
    /<ScoreKort\b[^/]*\btrofaeer=\{trofaeer\.data\}[^/]*\btrofaeerFejl=\{trofaeer\.isError\}/.test(krop) && !/<TrofaeKort\b/.test(krop) &&
    /id="din-plan"/.test(krop) && /id="dine-maal"/.test(krop) &&
    /data-forside-naeste-skridt/.test(krop) && /<FornyelsesBaand \/>/.test(krop) &&
    // Kortene og dommene er IKKE slettet — de kan tegne «Nyt fra os» i Akademiet.
    /const StoryCard = \(/.test(forside) && /const VelkomstStory = \(/.test(forside) &&
    // Døde imports er væk (rådets fund 9) — dommene bor i pushSelection.ts og importeres ikke længere.
    !/pickMainStory,|countNewSince,|pickEvergreen,|velkomstHovedhistorie|useAppConfig|tileColsClass|stripHtml|truncateText/.test(forside) &&
    /export function pickMainStory</.test(udenKommentarer(laes("src/components/hjemmebane/boardroom/pushSelection.ts")));
};

/** Dom 7: Netværket som ét sted med faner. `kilder` som dom 3. */
export const netvaerketHarFaner = (faner: string, faneHoved: string, faneDom: string, skal: string, ord: string, views: Record<string, string>, community: string): boolean =>
  // Fanerne ER menuens børn — én liste, læst af dommen.
  faneDom.includes('import { NETVAERKETS_BOERN } from "./hbNav";') &&
  faneDom.includes("const faner = NETVAERKETS_BOERN.map((b) => ({ label: b.label, to: b.to, aktiv: b.to === sti }));") &&
  faneDom.includes("export const visNetvaerkFaner = visStedsSaetning;") &&
  // Komponenten: hooks først, gaten er dommens, sætningen gennem HbStedsSaetning, <nav> med vandret scroll og aria-current.
  /const \{ isAdvisor, membershipTier \} = useAuth\(\);/.test(faner) &&
  faner.indexOf("useViewMode()") < faner.indexOf("if (!faner || !vises) return null;") &&
  faner.includes("const vises = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });") &&
  faner.includes("<HbStedsSaetning sti={sti} className=\"mt-3\" />") &&
  faner.indexOf("<h1") < faner.indexOf("<HbStedsSaetning sti={sti}") && faner.indexOf("<HbStedsSaetning sti={sti}") < faner.indexOf("<nav") &&
  /<nav aria-label="Netværket" className="[^"]*overflow-x-auto[^"]*"/.test(faner) &&
  /<ul className="[^"]*min-w-max[^"]*"/.test(faner) && /whitespace-nowrap/.test(faner) &&
  faner.includes('aria-current={f.aktiv ? "page" : undefined}') &&
  !/role="tab"|role="tablist"|"subscriber"/.test(faner) &&
  // Rådets fund 2 (2/10): den aktive fane rulles ind (nearest, begge akser) i en effekt FØR den betingede return, og kantfadet er tokenets, kun når bjælken kan rulles videre.
  faner.includes('aktivRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });') &&
  faner.indexOf("useEffect(") > -1 && faner.indexOf("useEffect(") < faner.indexOf("if (!faner || !vises) return null;") &&
  faner.includes("ref={f.aktiv ? aktivRef : undefined}") &&
  /\{kanRulleVidere && \(\s*<span aria-hidden="true" data-netvaerk-fade className="[^"]*pointer-events-none[^"]*from-hb-paper[^"]*"/.test(faner) &&
  // Skallen: netværkshovedet på de fem stier, dømt af netvaerksSti — og sætningen ikke dér.
  skal.includes("const netvaerkHovedSti = netvaerksSti(location.pathname);") &&
  (skal.match(/<HbNetvaerkFaner sti=\{netvaerkHovedSti\} \/>/g) ?? []).length === 1 &&
  skal.indexOf("<HbNetvaerkFaner sti={netvaerkHovedSti} />") < skal.indexOf("{children}", skal.indexOf("<HbNetvaerkFaner")) &&
  ord.includes('sted !== "netvaerket"') &&
  // Fanens hoved: h2 under fanerne, det gamle hoved uden — samme dom.
  faneHoved.includes("const underFaner = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });") &&
  faneHoved.indexOf("useViewMode()") < faneHoved.indexOf("if (underFaner) {") &&
  /<h2 className="[^"]*">\{rubrik\}<\/h2>/.test(faneHoved.slice(faneHoved.indexOf("if (underFaner) {"), faneHoved.indexOf("return (", faneHoved.indexOf("if (underFaner) {") + 30 + 1))) &&
  /<h1 className="[^"]*">\{rubrik\}<\/h1>/.test(faneHoved) && faneHoved.includes("{intro}") &&
  !faneHoved.includes("HbStedsSaetning") &&
  // De fire views (Events, Medlemmerne, Fordele, Anbefal) tegner fanens hoved — ikke sætningen, ikke en egen h1.
  Object.entries(views).every(([, k]) => (k.match(/<HbNetvaerkFaneHoved\b/g) ?? []).length === 1 && !/<HbStedsSaetning\b|<h1\b/.test(k)) &&
  // Community-fladen tegner ikke selv fanerne eller hovedet — skallen gør.
  !/HbNetvaerkFaner|HbNetvaerkFaneHoved|HbStedsSaetning/.test(community);

/** Dom 8: forsiden, skridt 2 — «Næste i Netværket» efter planen; «Kommende» og «Fra fællesskabet» væk.
    FORSIDE V3 (2/10-2026 aften, Jonas 20:05 — «er det med vilje man ikke lige ser sine nyeste tal …»): «Din
    måned» er TILBAGE på forsiden (forsideTop.guard dom 1 vogter den); dette værn vogter kun de to andre. */
export const forsidenSkridt2 = (forside: string, naesteDom: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  const plan = krop.indexOf('id="din-plan"');
  const naeste = krop.indexOf("data-forside-naeste-netvaerk");
  const event = krop.indexOf("data-naeste-event=", naeste);
  const opslag = krop.indexOf("data-naeste-opslag=", event);
  return krop.length > 0 && plan > -1 && naeste > plan && event > naeste && opslag > event &&
    !/"Kommende"|"Fra fællesskabet"|<FremhaevetOpslag\b|aktiveMedlemmer\(|"member-directory"/.test(krop) &&
    (krop.match(/data-forside-naeste-netvaerk/g) ?? []).length === 1 &&
    krop.includes("const naesteNetvaerk = useMemo(() => naesteINetvaerket(eventsQuery.data ?? [], communityQuery.data ?? []), [eventsQuery.data, communityQuery.data]);") &&
    krop.includes('queryFn: () => hentFeed(30),') && krop.includes("queryFn: () => listUpcomingEvents(3),") &&
    /data-naeste-event-tom/.test(krop) && /data-naeste-opslag-tom/.test(krop) &&
    krop.includes("const event = naesteNetvaerk.event;") &&
    krop.includes("<EventRegisterAction eventId={event.id} phase={eventMeetPhase(event)} />") &&
    krop.includes("to={`/community/${naesteNetvaerk.opslag.id}`}") &&
    !/\.rpc\("get_community_feed"|\.rpc\("get_member_directory"/.test(forside) &&
    // Rådets fund 3 (2/10): kun aktive opslag, filtreret FØR valget.
    naesteDom.includes('const aktive = traade.filter((t) => t.status === "aktiv");') &&
    naesteDom.includes("return { event: events[0] ?? null, opslag: vaelgForsideOpslag(aktive).fremhaevet };") &&
    // Rådets fund 4 (2/10): opslagsrækken kun med Netværket — fanernes dom, hooks i topblokken.
    krop.includes("const harNetvaerket = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });") &&
    krop.indexOf("{harNetvaerket && (") > -1 && krop.indexOf("{harNetvaerket && (") < opslag &&
    // Rådets fund 5 (2/10; v3-mockuppen): eventets handling på EGEN linje på 375 (flugtet med titlen), ved
    // siden af fra sm; opslagets «Læs» står til højre i rækken (kort ord, ingen ombrydning).
    (krop.match(/className="w-full shrink-0 pl-14 sm:w-auto sm:pl-0"/g) ?? []).length === 1;
};

describe("seksSteder.guard — skridt 1: menuen, stedsætningerne, forsiden ryddet", () => {
  const medlem = bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom" });
  const abonnent = bygHbNav({ isAdvisor: false, erAbonnent: true, active: "noegletal" });
  const raadgiver = bygHbNav({ isAdvisor: true, erAbonnent: false, active: "boardroom" });
  const kilder: Array<[string, string]> = [...kildefiler("src/lib"), ...kildefiler("src/components"), ...kildefiler("src/pages"), ...kildefiler("src/hooks")].map((sti) => [sti, udenKommentarer(laes(sti))]);
  const komponent = udenKommentarer(laes(KOMPONENT));
  const skal = udenKommentarer(laes(SKAL));
  const forside = udenKommentarer(laes(FORSIDE));
  const raadgiverForside = udenKommentarer(laes(RAADGIVER_FORSIDE));
  const nav = udenKommentarer(laes(NAV));
  const faner = udenKommentarer(laes(FANER));
  const faneHoved = udenKommentarer(laes(FANE_HOVED));
  const faneDom = udenKommentarer(laes(FANE_DOM));
  const ord = udenKommentarer(laes(ORD));
  const community = udenKommentarer(laes(COMMUNITY_VIEW));
  const netvaerkViews = Object.fromEntries(Object.entries(NETVAERK_VIEWS).map(([sti, fil]) => [sti, udenKommentarer(laes(fil))]));
  const naesteDom = udenKommentarer(laes("src/lib/hjemmebane/naesteINetvaerket.ts"));

  it("dom 1: det fulde medlems menu er de seks steder i rækkefølge, Netværkets fem børn, Dine mål eget punkt, ingen rute ændret", () => {
    expect(menuenErSeksSteder(medlem)).toBe(true);
    expect(SEKS_STEDER).toEqual(["Dit Boardroom", "Dine tal", "Dine mål", "Netværket", "Akademiet", "Din rådgiver"]);
    // Også med certifikat: de seks først, certifikatet syvende.
    const med = bygHbNav({ isAdvisor: false, erAbonnent: false, active: "boardroom", certifikat: "aaben" });
    expect(menuenErSeksSteder(med.slice(0, 6))).toBe(true);
    expect(med[6]?.to).toBe("/certifikat");
  });
  it("dom 2: abonnentens og rådgiverens menuer er ordret som før 2/10", () => {
    expect(abonnentOgRaadgiverUroerte(abonnent, raadgiver)).toBe(true);
  });
  it("dom 3: «Det her er stedet, hvor» står i kode KUN i stedsSaetninger.ts; komponenten læser listen og gater selv; skallen og forsiden tegner den ét sted hver", () => {
    expect(saetningerneEtSted(kilder, komponent, skal, forside, raadgiverForside)).toBe(true);
    // Skallen læser ikke viewingAsMember (online.guard dom 6) — gaten bor i komponenten.
    expect(skal).not.toMatch(/viewingAsMember/);
    // Seks sætninger, forslagets ordlyd i de seks indledninger.
    expect(STEDS_SAETNINGER.boardroom).toContain("hvordan din virksomhed har det");
    expect(STEDS_SAETNINGER.dine_tal).toContain("afleverer dine tal hver måned");
    expect(STEDS_SAETNINGER.dine_maal).toContain("sætter mål for virksomheden");
    expect(STEDS_SAETNINGER.netvaerket).toContain("møder de andre medlemmer");
    expect(STEDS_SAETNINGER.akademiet).toContain("lærer det, du skal bruge");
    expect(STEDS_SAETNINGER.din_raadgiver).toContain("skriver til os og booker en session");
  });
  it("dom 4: «Fra os til dig», «Denne uges video», «Værd at se igen» og «Se tidligere» tegnes ikke på medlemmets forside — Score, Din plan, Dit næste skridt står", () => {
    expect(forsidenRyddet(forside)).toBe(true);
  });
  it("dom 6 (rådets fund 7; skridt 2: fem steder): de steder med eget hoved tegner sætningen selv under h1 — og skallen springer dem over; chatten og booking får den fra skallen; Netværket får den fra fanehovedet", () => {
    const VIEWS: Record<string, string> = {
      "/reports": "src/components/hjemmebane/rapportering/RapporteringView.tsx",
      "/kpis": "src/components/hjemmebane/noegletal/NoegletalView.tsx",
      "/budget": "src/components/hjemmebane/budget/BudgetteringView.tsx",
      "/milestones": "src/components/hjemmebane/milestones/DineMaalView.tsx",
      "/akademiet": "src/components/hjemmebane/akademi/views/ForsideView.tsx",
    };
    expect([...STEDER_MED_EGET_HOVED].sort()).toEqual(Object.keys(VIEWS).sort());
    for (const [sti, fil] of Object.entries(VIEWS)) {
      const k = udenKommentarer(laes(fil));
      // Én gang, og EFTER h1 — eyebrow → h1 → sætningen.
      expect((k.match(new RegExp(`<HbStedsSaetning\\s+sti="${sti}"`, "g")) ?? []).length, fil).toBe(1);
      expect(k.indexOf("<h1"), fil).toBeLessThan(k.indexOf(`sti="${sti}"`));
      expect(skallenTegnerSaetning(sti), sti).toBe(false);
    }
    for (const sti of ["/chat", "/book-session"]) expect(skallenTegnerSaetning(sti), sti).toBe(true);
    // Netværkets fem stier: sætningen kommer fra fanehovedet (dom 7), ikke skallen.
    for (const sti of NETVAERK_STIER) expect(skallenTegnerSaetning(sti), sti).toBe(false);
    expect(skallenTegnerSaetning("/")).toBe(false);
    expect(skallenTegnerSaetning("/community/abc")).toBe(false);
    // Ingen anden flade tegner komponenten med en fast sti (ud over forsiden og de otte).
    const medFastSti = kilder.filter(([sti, k]) => /<HbStedsSaetning\s+sti="/.test(k) && !Object.values(VIEWS).includes(sti) && sti !== FORSIDE).map(([sti]) => sti);
    expect(medFastSti).toEqual([]);
    // Hver sti i STEDER_MED_EGET_HOVED er et steds forside.
    for (const sti of STEDER_MED_EGET_HOVED) expect(STEDERNES_STIER[sti], sti).toBeDefined();
  });
  it("dom 5: «Live nu» lander på Events under Netværket for medlemmet — og på toppunktet for rådgiveren; intet andet punkt røres", () => {
    const maerke = { tekst: "Live nu", to: "/events/x", titel: "x" };
    const m = medLiveMaerke(medlem, maerke);
    expect(m.find((n) => n.label === "Netværket")?.children?.find((c) => c.to === "/events")?.maerke).toEqual(maerke);
    expect(m.flatMap((n) => [n.maerke, ...(n.children ?? []).filter((c) => c.to !== "/events").map((c) => c.maerke)]).every((x) => x === undefined)).toBe(true);
    const r = medLiveMaerke(raadgiver, maerke);
    expect(r.find((n) => n.to === "/events")?.maerke).toEqual(maerke);
    expect(JSON.stringify(flad(r))).toBe(JSON.stringify(flad(raadgiver)));
    // Ordet «Fortæl det videre» er ude af menuens kode (kun «Anbefal»); «Fordele» er ÉN linje, let at flytte.
    expect(nav).not.toContain('label: "Fortæl det videre"');
    expect(nav).toContain('export const FORDELE_PUNKT = { label: "Fordele", to: "/rabataftaler" } as const;');
    expect(nav).toContain('export const ANBEFAL_PUNKT = { label: "Anbefal", to: "/deling" } as const;');
  });

  it("dom 7 (skridt 2): Netværket er ét sted med fem faner — menuens børn, dømt af stien, sætningens gate, skallen på de fem stier, h2 under fanerne, Community uden egne faner", () => {
    expect(netvaerketHarFaner(faner, faneHoved, faneDom, skal, ord, netvaerkViews, community)).toBe(true);
    // Dommen: de fem forsider får fanerne (præcis én aktiv, menuens ord og links); undersider og alt andet intet.
    for (const sti of NETVAERK_STIER) {
      const f = netvaerkFaner(sti);
      expect(f?.map((x) => [x.label, x.to]), sti).toEqual(NETVAERKETS_BOERN.map((b) => [b.label, b.to]));
      expect(f?.filter((x) => x.aktiv).map((x) => x.to), sti).toEqual([sti]);
      expect(netvaerksSti(sti + "/"), sti).toBe(sti);
      expect(netvaerksSti(sti + "?x=1"), sti).toBe(sti);
    }
    for (const sti of ["/community/abc", "/events/abc", "/medlemmer/abc", "/", "/akademiet", "/chat", "/nyheder", "/rabataftaler/x"]) {
      expect(netvaerkFaner(sti), sti).toBeNull();
      expect(netvaerksSti(sti), sti).toBeNull();
    }
    expect(NETVAERKETS_BOERN.map((b) => b.label)).toEqual(["Community", "Events", "Medlemmerne", "Fordele", "Anbefal"]);
    expect(STEDS_SAETNINGER.netvaerket.endsWith("Community er forsiden.")).toBe(true);
    // Gaten er sætningens — samme funktion, samme svar for alle former.
    expect(visNetvaerkFaner).toBe(visStedsSaetning);
    expect(visNetvaerkFaner({ isAdvisor: false, viewingAsMember: false, membershipTier: "full" })).toBe(true);
    expect(visNetvaerkFaner({ isAdvisor: false, viewingAsMember: false, membershipTier: "subscriber" })).toBe(false);
    expect(visNetvaerkFaner({ isAdvisor: false, viewingAsMember: false, membershipTier: null })).toBe(false);
    expect(visNetvaerkFaner({ isAdvisor: true, viewingAsMember: false, membershipTier: "full" })).toBe(false);
    expect(visNetvaerkFaner({ isAdvisor: true, viewingAsMember: true, membershipTier: "full" })).toBe(true);
    // Ruterne er uændrede: fanernes links er stedets stier.
    for (const b of NETVAERKETS_BOERN) expect(STEDERNES_STIER[b.to], b.to).toBe("netvaerket");
  });
  it("dom 8 (skridt 2, v3): forsiden uden Kommende og Fra fællesskabet — «Næste i Netværket» efter planen med næste event og nyeste opslag, hver med tom tilstand, ingen ny hentning", () => {
    expect(forsidenSkridt2(forside, naesteDom)).toBe(true);
  });

  it("selvbevis 1: Dine mål tilbage under Dine tal, Netværket med Rabataftaler-ordet, eller en byttet rækkefølge falder", () => {
    const f = structuredClone(medlem);
    const kopi1 = f.map((n) => (n.label === "Dine tal" ? { ...n, children: [...(n.children ?? []), { label: "Dine mål", to: "/milestones" }] } : n));
    expect(menuenErSeksSteder(kopi1)).toBe(false);
    const kopi2 = f.map((n) => (n.label === "Netværket" ? { ...n, children: n.children?.map((c) => (c.label === "Fordele" ? { ...c, label: "Rabataftaler" } : c)) } : n));
    expect(menuenErSeksSteder(kopi2)).toBe(false);
    expect(menuenErSeksSteder([f[0], f[2], f[1], ...f.slice(3)])).toBe(false);
    expect(menuenErSeksSteder(f.filter((n) => n.label !== "Dine mål"))).toBe(false);
  });
  it("selvbevis 2: et punkt flyttet i abonnentens eller rådgiverens menu falder", () => {
    expect(abonnentOgRaadgiverUroerte([abonnent[1], abonnent[0]], raadgiver)).toBe(false);
    expect(abonnentOgRaadgiverUroerte(abonnent, raadgiver.filter((n) => n.label !== "Rabataftaler"))).toBe(false);
  });
  it("selvbevis 3: sætningen skrevet i en flade, komponenten uden gate, eller forsiden med to sætninger falder", () => {
    expect(saetningerneEtSted([...kilder, ["src/pages/X.tsx", 'const t = "Det her er stedet, hvor du …";']], komponent, skal, forside, raadgiverForside)).toBe(false);
    expect(saetningerneEtSted(kilder, komponent.replace("const vises = visStedsSaetning({ isAdvisor, viewingAsMember, membershipTier });", "const vises = true;"), skal, forside, raadgiverForside)).toBe(false);
    expect(saetningerneEtSted(kilder, komponent.replace("const vises = visStedsSaetning({ isAdvisor, viewingAsMember, membershipTier });", 'const vises = membershipTier !== "subscriber";'), skal, forside, raadgiverForside)).toBe(false);
    expect(saetningerneEtSted(kilder, komponent, skal, forside.replace("<FornyelsesBaand />", '<FornyelsesBaand /><HbStedsSaetning sti="/" />'), raadgiverForside)).toBe(false);
    expect(saetningerneEtSted(kilder, komponent, skal, forside, raadgiverForside + '\n<HbStedsSaetning sti="/" />')).toBe(false);
    expect(saetningerneEtSted(kilder, komponent, skal.replace("skallenTegnerSaetning(location.pathname) ? location.pathname : null", "location.pathname"), forside, raadgiverForside)).toBe(false);
    expect(saetningerneEtSted(kilder, komponent, skal.replace('className="hidden shrink-0 px-6 pt-6 md:block md:pt-8"', 'className="shrink-0 px-6 pt-6 md:pt-8"'), forside, raadgiverForside)).toBe(false);
  });
  it("selvbevis 4: båndet tilbage på forsiden, eller Score-kortet fjernet, falder", () => {
    expect(forsidenRyddet(forside.replace("<FornyelsesBaand />", '<FornyelsesBaand /><HbSection eyebrow="Fra os til dig"><StoryCard story={band.main} variant="main" /></HbSection>'))).toBe(false);
    expect(forsidenRyddet(forside.replace("<FornyelsesBaand />", "<FornyelsesBaand />{pickEvergreen([], new Date())}"))).toBe(false);
    expect(forsidenRyddet(forside.replace(/<ScoreKort\b/, "<ScoreKortX"))).toBe(false);
    // Trofæerne som egen sektion igen (2/10: fyldte en mobilskærm over «Din plan»), eller ikke givet til ScoreKortet, falder.
    expect(forsidenRyddet(forside.replace("<FornyelsesBaand />", "<FornyelsesBaand /><TrofaeKort trofaeer={trofaeer.data} isError={trofaeer.isError} />"))).toBe(false);
    expect(forsidenRyddet(forside.replace("trofaeer={trofaeer.data}", ""))).toBe(false);
    // Sletter nogen kortene, falder værnet også — de skal blive til Akademiet.
    expect(forsidenRyddet(forside.replace("const StoryCard = (", "const StoryCardX = ("))).toBe(false);
  });
  it("selvbevis 7: fanerne med egen liste, uden gate, uden vandret scroll, skallen uden hovedet, eller Community med faner falder", () => {
    expect(netvaerketHarFaner(faner, faneHoved, faneDom.replace("const faner = NETVAERKETS_BOERN.map((b) => ({ label: b.label, to: b.to, aktiv: b.to === sti }));", 'const faner = [{ label: "Community", to: "/community", aktiv: true }];'), skal, ord, netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner.replace("const vises = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });", "const vises = true;"), faneHoved, faneDom, skal, ord, netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner.replace("overflow-x-auto", "overflow-x-visible"), faneHoved, faneDom, skal, ord, netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner.replace('aktivRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });', ""), faneHoved, faneDom, skal, ord, netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner.replace("from-hb-paper", "from-white"), faneHoved, faneDom, skal, ord, netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner, faneHoved, faneDom, skal, ord, { ...netvaerkViews, "/deling": netvaerkViews["/deling"].replace("<HbNetvaerkFaneHoved", "<h1>Din kreativ</h1><HbNetvaerkFaneHoved") }, community)).toBe(false);
    expect(netvaerketHarFaner(faner, faneHoved, faneDom, skal.replace("{netvaerkHovedSti && <HbNetvaerkFaner sti={netvaerkHovedSti} />}", ""), ord, netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner, faneHoved, faneDom, skal, ord.replace('sted !== "netvaerket" && ', ""), netvaerkViews, community)).toBe(false);
    expect(netvaerketHarFaner(faner, faneHoved, faneDom, skal, ord, netvaerkViews, community + "\n<HbNetvaerkFaner sti=\"/community\" />")).toBe(false);
    expect(netvaerketHarFaner(faner, faneHoved, faneDom, skal, ord, { ...netvaerkViews, "/events": netvaerkViews["/events"].replace("<HbNetvaerkFaneHoved", '<h1>Events</h1><HbNetvaerkFaneHoved') }, community)).toBe(false);
  });
  it("selvbevis 8: Fra fællesskabet tilbage, Netværket over planen, eller en member-directory-hentning falder", () => {
    expect(forsidenSkridt2(forside.replace("<FornyelsesBaand />", '<FornyelsesBaand /><HbSection eyebrow="Fra fællesskabet" />'), naesteDom)).toBe(false);
    expect(forsidenSkridt2(forside.replace("<Pakning>", "<Pakning><div data-forside-naeste-netvaerk />"), naesteDom)).toBe(false);
    expect(forsidenSkridt2(forside, naesteDom.replace('traade.filter((t) => t.status === "aktiv")', "traade"))).toBe(false);
    expect(forsidenSkridt2(forside.replace("{harNetvaerket && (", "{true && ("), naesteDom)).toBe(false);
    expect(forsidenSkridt2(forside.replace("w-full shrink-0 pl-14 sm:w-auto sm:pl-0", "shrink-0"), naesteDom)).toBe(false);
    expect(forsidenSkridt2(forside.replace("const naesteNetvaerk = useMemo(", 'const d = useQuery({ queryKey: ["member-directory"], queryFn: listMemberDirectory });\n  const naesteNetvaerk = useMemo('), naesteDom)).toBe(false);
  });
  it("selvbevis 5: et mærke på et andet barn, eller et toppunkt der rører Netværket, falder", () => {
    const maerke = { tekst: "Live nu", to: "/events/x", titel: "x" };
    const forkert = medlem.map((n) => (n.label === "Netværket" ? { ...n, children: n.children?.map((c) => ({ ...c, maerke })) } : n));
    expect(forkert.flatMap((n) => (n.children ?? []).filter((c) => c.to !== "/events").map((c) => c.maerke)).every((x) => x === undefined)).toBe(false);
  });
});
