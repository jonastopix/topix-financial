import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for virksomhedssiden PR 1 (17/9-2026) — ~/Downloads/analyse-
// virksomhedssiden.md §4, Jonas 17/9 (ordret: «Ja på alle»):
//   1. Planen: blok 3 i fuld bredde, før tallene.
//   2. Chatten: ned under tallene, 60 vh (min 420 px), med «Åbn i /chat».
//   3. Aftalen: foldet som standard med statuslinje åben; åbnes af
//      ?grund=fornyelse|indgang og ?section=aftale (scroll-effekten åbner folden).
//   4. Skridtene i Planen: åbne, op til seks pr. mål, resten «vis alle».
//   5. (Forberedelsen læser planen — PR 2, ikke låst her.)
// Seks domme, hver med selvbevis på en kopi:
//   1. RÆKKEFØLGEN i kompositionen: Planen før Tallene, Tallene før Chatten,
//      Chatten før Aktivitet, Aftalen efter Aktivitet, Mails efter Aftalen.
//   2. PLANENS FULDE BREDDE: VirksomhedPlanen står ikke i et grid med andre kort,
//      og dens rod er en HbSection (ikke et HbCard i en kolonne).
//   3. INGEN KLIPNING på mål- og skridttitler i VirksomhedPlanen (truncate/line-clamp).
//   4. AFTALEN FOLDET: <details open={aaben}> i section-aftale; startAaben
//      afledt af ?section=aftale og grundene fornyelse/indgang (AABNER_AFTALEN).
//   5. CHATTEN: 60 vh / min 420 px og «Åbn i /chat».
//   6. ANKRENE følger med: section-chat/-tal/-aftale/-handouts/-refleksion i
//      VirksomhedView, section-milestones i VirksomhedPlanen (forsideMaal.guard
//      læser den fil); GRUNDENS_ANKER har ingen_maal → section-milestones.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const VIEW = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const PLANEN = "src/components/hjemmebane/virksomhed/VirksomhedPlanen.tsx";

/** Kompositionen: fra `export const VirksomhedView` til filens slutning. */
export function komposition(view: string): string {
  const start = view.indexOf("export const VirksomhedView");
  return start === -1 ? "" : view.slice(start);
}

/** Dom 1: rækkefølgen i kompositionen. */
export const raekkefoelgenHolder = (view: string): boolean => {
  const k = komposition(view);
  const p = (s: string) => k.indexOf(s);
  const plan = p("<VirksomhedPlanen "), tal = p("<Blok5 "), chat = p("<Blok4 "), akt = p("<Blok6"), aftale = p("<Blok7 "), mails = p("<VirksomhedMailLog "), farlig = p("<FarligZone ");
  return [plan, tal, chat, akt, aftale, mails, farlig].every((i) => i > -1) &&
    p("<Blok1 ") < p("<Blok2 ") && p("<Blok2 ") < plan && plan < tal && tal < chat && chat < akt && akt < aftale && aftale < mails && mails < farlig;
};

/** Dom 2: Planen i fuld bredde — ikke i et grid, og selv en sektion. */
export const planenErFuldBredde = (view: string, planen: string): boolean => {
  const k = komposition(view);
  const i = k.indexOf("<VirksomhedPlanen ");
  if (i === -1) return false;
  // Nærmeste åbnende <div … før Planen i kompositionen må ikke være et grid.
  const foer = k.slice(0, i);
  const sidsteDiv = foer.lastIndexOf("<div");
  const sidsteLuk = foer.lastIndexOf("</div>");
  const iEtAabentDiv = sidsteDiv > sidsteLuk;
  const aabentDivErGrid = iEtAabentDiv && /grid-cols/.test(foer.slice(sidsteDiv, sidsteDiv + 200));
  // Blok6's Aktivitet-grid bærer ikke Planen længere.
  const aktStart = view.indexOf('eyebrow="Aktivitet"');
  const aktSlut = view.indexOf("</HbSection>", aktStart);
  const iAktivitet = aktStart > -1 && view.slice(aktStart, aktSlut).includes("VirksomhedPlanen");
  return !aabentDivErGrid && !iAktivitet &&
    /<HbSection id="section-milestones" eyebrow="Planen"/.test(planen) &&
    !/<HbCard id="section-milestones"/.test(planen);
};

/** Dom 3: fulde titler i Planen. */
export const fuldeTitler = (planen: string): boolean => !/\b(truncate|line-clamp-\d+)\b/.test(planen);

/** Dom 4: Aftalen foldet, og folden åbnes af ?section=aftale og grundene fornyelse/indgang. */
export const aftalenErFoldet = (view: string): boolean => {
  const start = view.indexOf('<HbSection id="section-aftale"');
  if (start === -1) return false;
  const blok = view.slice(start, view.indexOf("</HbSection>", start));
  return /<details open=\{aaben\}/.test(blok) && /<summary/.test(blok) && /<\/details>/.test(blok) &&
    /const \[aaben, setAaben\] = useState\(startAaben\);/.test(view) &&
    /if \(startAaben\) setAaben\(true\);/.test(view) &&
    /const startAftaleAaben = dybSektion === "aftale" \|\| \(derfor != null && AABNER_AFTALEN\.has\(derfor\.slags\)\);/.test(view) &&
    // Ventelisten (udkast 18/9) åbner også Aftalen — «Tilbyd pladsen til X» bor dér.
    /new Set<OpgaveSlags>\(\["fornyelse", "indgang", "venteliste"\]\)/.test(view) &&
    /startAaben=\{startAftaleAaben\}/.test(komposition(view));
};

/** Dom 5: chatten 60 vh / min 420 og «Åbn i /chat». */
export const chattenHolder = (view: string): boolean =>
  /const CHAT_HOEJDE = "h-\[60vh\] min-h-\[420px\]";/.test(view) &&
  !/h-\[calc\(100dvh-10rem\)\]/.test(view) &&
  /linkLabel="Åbn i \/chat" linkTo=\{`\/chat\?companyId=\$\{d\.company\.id\}`\}/.test(view);

/** Dom 6: ankrene. */
export const ankreneHolder = (view: string, planen: string): boolean =>
  ['id="section-chat"', 'id="section-tal"', 'id="section-aftale"', 'id="section-handouts"', 'id="section-refleksion"'].every((a) => view.includes(a)) &&
  planen.includes('id="section-milestones"') &&
  view.includes('ingen_maal: "section-milestones",') &&
  view.includes('maal_uden_bevaegelse: "section-milestones",') &&
  view.includes('fornyelse: "section-aftale",') && view.includes('indgang: "section-aftale",');

/** Bytter to markører om i kompositionen — til selvbevis 1. */
function bytOm(view: string, a: string, b: string): string {
  const k = komposition(view);
  const PLADS = "<<PLADS>>";
  return view.replace(k, k.replace(a, PLADS).replace(b, a).replace(PLADS, b));
}

describe("virksomhedsside.guard — PR 1: Planen før tallene i fuld bredde, chatten 60 vh, Aftalen foldet", () => {
  const view = udenKommentarer(laes(VIEW));
  const planen = udenKommentarer(laes(PLANEN));

  it("dom 1: rækkefølgen — 1 → 2 → Planen → Tallene → Chatten → Aktivitet → Aftalen → Mails → Farlig zone", () => {
    expect(raekkefoelgenHolder(view)).toBe(true);
  });
  it("dom 2: Planen i fuld bredde — egen HbSection, ikke i et grid, ikke i Aktivitet", () => {
    expect(planenErFuldBredde(view, planen)).toBe(true);
  });
  it("dom 3: ingen truncate/line-clamp i Planen", () => {
    expect(fuldeTitler(planen)).toBe(true);
  });
  it("dom 4: Aftalen foldet — åbnes af ?section=aftale og ?grund=fornyelse|indgang|venteliste", () => {
    expect(aftalenErFoldet(view)).toBe(true);
  });
  it("dom 5: chatten 60 vh (min 420 px) med «Åbn i /chat»", () => {
    expect(chattenHolder(view)).toBe(true);
  });
  it("dom 6: ankrene følger med — section-milestones i VirksomhedPlanen, ingen_maal peger derhen", () => {
    expect(ankreneHolder(view, planen)).toBe(true);
  });

  it("selvbevis 1: chatten før tallene, eller Planen efter tallene, falder", () => {
    expect(raekkefoelgenHolder(bytOm(view, "<Blok5 ", "<Blok4 "))).toBe(false);
    expect(raekkefoelgenHolder(bytOm(view, "<VirksomhedPlanen ", "<Blok5 "))).toBe(false);
  });
  it("selvbevis 2: Planen tilbage i Aktivitet-gridet, i et grid, eller som HbCard falder", () => {
    const k = komposition(view);
    const iGrid = view.replace(k, k.replace("<VirksomhedPlanen ", '<div className="grid gap-4 md:grid-cols-3">\n<VirksomhedPlanen '));
    expect(planenErFuldBredde(iGrid, planen)).toBe(false);
    const aktStart = view.indexOf('eyebrow="Aktivitet"');
    const iAkt = view.slice(0, aktStart) + view.slice(aktStart).replace("</HbSection>", "<VirksomhedPlanen companyId={d.company.id} />\n</HbSection>");
    expect(planenErFuldBredde(iAkt, planen)).toBe(false);
    expect(planenErFuldBredde(view, planen.replace('<HbSection id="section-milestones" eyebrow="Planen"', '<HbCard id="section-milestones"'))).toBe(false);
  });
  it("selvbevis 3: en truncate på en titel falder", () => {
    expect(fuldeTitler(planen.replace("break-words", "truncate"))).toBe(false);
  });
  it("selvbevis 4: Aftalen uden fold, eller uden åbning fra ?section/?grund, falder", () => {
    expect(aftalenErFoldet(view.replace("<details open={aaben}", "<div"))).toBe(false);
    expect(aftalenErFoldet(view.replace('new Set<OpgaveSlags>(["fornyelse", "indgang", "venteliste"])', 'new Set<OpgaveSlags>(["fornyelse"])'))).toBe(false);
    expect(aftalenErFoldet(view.replace("if (startAaben) setAaben(true);", ""))).toBe(false);
  });
  it("selvbevis 5: hele viewportet tilbage, eller uden link, falder", () => {
    expect(chattenHolder(view.replace('const CHAT_HOEJDE = "h-[60vh] min-h-[420px]";', 'const CHAT_HOEJDE = "h-[calc(100dvh-10rem)] min-h-[520px]";'))).toBe(false);
    expect(chattenHolder(view.replace('linkLabel="Åbn i /chat" ', ""))).toBe(false);
  });
  it("selvbevis 6: ankeret ude af Planen, eller ingen_maal uden anker, falder", () => {
    expect(ankreneHolder(view, planen.replace('id="section-milestones"', 'id="section-planen"'))).toBe(false);
    expect(ankreneHolder(view.replace('ingen_maal: "section-milestones",', "ingen_maal: null,"), planen)).toBe(false);
  });
});
