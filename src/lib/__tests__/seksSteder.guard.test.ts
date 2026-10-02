import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { bygHbNav, medLiveMaerke, SEKS_STEDER } from "@/lib/hjemmebane/hbNav";
import { skallenTegnerSaetning, STEDER_MED_EGET_HOVED, STEDERNES_STIER, STEDS_SAETNINGER } from "@/lib/hjemmebane/stedsSaetninger";

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
 *      Score, Din plan, Dine mål-ankeret, Din måned, Dit næste skridt,
 *      fornyelsen, trofæerne. Kortene og dommene (pushSelection.ts) er
 *      IKKE slettet — de kan tegne «Nyt fra os» i Akademiet.
 *   5. «LIVE NU» følger Events ned under Netværket (medLiveMaerke).
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
const RAADGIVER_FOER = [
  ["Forside", "/"], ["Virksomheder", "/virksomheder"], ["Ansøgninger", "/ansoegninger"], ["Webinar", "/webinar"], ["Engagement", "/engagement"], ["Indbakke", "/chat"], ["Community", "/community"], ["Indhold", "/admin/indhold"],
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

/** Dom 4: forsiden ryddet — og det, der skulle blive, er der. */
export const forsidenRyddet = (forside: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const BoardroomView = () => {"));
  return krop.length > 0 &&
    !/"Fra os til dig"|Denne uges video|Værd at se igen|Se tidligere|Skjul tidligere/.test(krop) &&
    !/<StoryCard\b|pickMainStory\(|pickMainStory</.test(krop) &&
    !/pickActivePush\(|pickActiveWeekVideo\(|pickActiveItem\(|pickEvergreen\(|velkomstHovedhistorie\(/.test(krop) &&
    !/data-forside-venstre|data-forside-nyheden|data-forside-tiles|hasBand|band\.main|band\.side|redaktioneltHistory|countNewSince\(/.test(krop) &&
    /<ScoreKort\b/.test(krop) && /<TrofaeKort\b/.test(krop) && /id="din-plan"/.test(krop) && /id="dine-maal"/.test(krop) &&
    /data-forside-din-maaned/.test(krop) && /data-forside-naeste-skridt/.test(krop) && /<FornyelsesBaand \/>/.test(krop) &&
    // Kortene og dommene er IKKE slettet — de kan tegne «Nyt fra os» i Akademiet.
    /const StoryCard = \(/.test(forside) && /const VelkomstStory = \(/.test(forside) &&
    // Døde imports er væk (rådets fund 9) — dommene bor i pushSelection.ts og importeres ikke længere.
    !/pickMainStory,|countNewSince,|pickEvergreen,|velkomstHovedhistorie|useAppConfig|tileColsClass|stripHtml|truncateText/.test(forside) &&
    /export function pickMainStory</.test(udenKommentarer(laes("src/components/hjemmebane/boardroom/pushSelection.ts")));
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
  it("dom 4: «Fra os til dig», «Denne uges video», «Værd at se igen» og «Se tidligere» tegnes ikke på medlemmets forside — Score, Din plan, Din måned, Dit næste skridt står", () => {
    expect(forsidenRyddet(forside)).toBe(true);
  });
  it("dom 6 (rådets fund 7): de otte steder med eget hoved tegner sætningen selv under h1 — og skallen springer dem over; de fem andre får den fra skallen", () => {
    const VIEWS: Record<string, string> = {
      "/reports": "src/components/hjemmebane/rapportering/RapporteringView.tsx",
      "/kpis": "src/components/hjemmebane/noegletal/NoegletalView.tsx",
      "/budget": "src/components/hjemmebane/budget/BudgetteringView.tsx",
      "/milestones": "src/components/hjemmebane/milestones/DineMaalView.tsx",
      "/events": "src/components/hjemmebane/events/EventsView.tsx",
      "/medlemmer": "src/components/hjemmebane/members/MemberDirectoryView.tsx",
      "/rabataftaler": "src/components/hjemmebane/rabataftaler/RabataftalerView.tsx",
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
    for (const sti of ["/community", "/deling", "/chat", "/book-session"]) expect(skallenTegnerSaetning(sti), sti).toBe(true);
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
    // Sletter nogen kortene, falder værnet også — de skal blive til Akademiet.
    expect(forsidenRyddet(forside.replace("const StoryCard = (", "const StoryCardX = ("))).toBe(false);
  });
  it("selvbevis 5: et mærke på et andet barn, eller et toppunkt der rører Netværket, falder", () => {
    const maerke = { tekst: "Live nu", to: "/events/x", titel: "x" };
    const forkert = medlem.map((n) => (n.label === "Netværket" ? { ...n, children: n.children?.map((c) => ({ ...c, maerke })) } : n));
    expect(forkert.flatMap((n) => (n.children ?? []).filter((c) => c.to !== "/events").map((c) => c.maerke)).every((x) => x === undefined)).toBe(false);
  });
});
