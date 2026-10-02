import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for medlemmets forside PR 5 (17/9-2026) — JONAS (ordret: «A på
// alle»), valg 7: velkomstvideoen som hovedhistorie den første uge for et
// nyt medlem. Fem ting låses:
//   1. VELKOMSTEN FØRST i rykkelisten: velkomst-kandidaten står som FØRSTE
//      element i pickMainStory-arrayet på forsiden, og om den findes afgøres
//      af den rene dom velkomstHovedhistorie (kontraktstart + harVideo +
//      velkomstvideo_set_at) — forsiden regner ingen dage selv.
//   2. ÉN KILDE til dagsregningen: erDag1 (14) og erFoersteUge (7) går begge
//      gennem forsideHilsen.erIndenDoegn; VELKOMST_UGE_DOEGN = 7, DAG1_DOEGN = 14.
//   3. IFRAME FØRST VED KLIK: VelkomstStory monterer HbVelkomstVideoEmbed kun
//      i `playing ?`-grenen, og eneste vej til playing er PlayCover's onPlay —
//      ingen ny iframe i BoardroomView (pushVideo.guard dom 6 står ved to).
//   4. FALD-TILBAGE: dommen siger nej uden video, når set_at er sat, og uden
//      startdato — så rykkelisten er som før for alle andre end den nye.
//   5. STEMPLET går gennem tjeklistens egen mutation (markerVelkomstSet) —
//      forsiden skriver ikke selv til profiles.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const DOM = "src/lib/hjemmebane/velkomstHistorie.ts";
const HILSEN = "src/lib/hjemmebane/forsideHilsen.ts";
const RYKKELISTE = "src/components/hjemmebane/boardroom/pushSelection.ts";

/** Blokken for én komponent: fra `const Navn = (` til næste top-level const/function/export. */
function blok(kode: string, navn: string): string {
  const fra = kode.indexOf(`const ${navn} = (`);
  if (fra === -1) return "";
  const rest = kode.slice(fra + 1);
  const m = rest.search(/\n(const|function|export|type) /);
  return m === -1 ? kode.slice(fra) : kode.slice(fra, fra + 1 + m);
}

/** Dom 1 — OMSKREVET 2/10-2026 (seks steder, seksSteder.guard): båndet «Fra
    os til dig» er taget af forsiden, og med det velkomst-hovedhistorien;
    velkomsten ses gennem «Kom godt i gang» (HbOnboardingTjekliste, #velkomst).
    Værnet holder nu det MODSATTE af før: forsiden kalder IKKE pickMainStory
    og regner stadig ingen dage selv; rykkelistens StoryKind er urørt
    (pushSelection.ts bærer dommen til «Nyt fra os» i Akademiet senere). Den
    gamle dom (velkomsten FØRST i rykkelisten) lever som pushSelection.test. */
export const velkomstenFoerst = (forside: string, rykkeliste: string): boolean =>
  !forside.includes("pickMainStory<") &&
  !forside.includes("velkomstHovedhistorie(") &&
  !/erFoersteUge\(|erIndenDoegn\(|dageMellem\(/.test(forside) &&
  rykkeliste.includes('export type StoryKind = "velkomst" | "push" | "video" | "redaktionelt" | "evergreen";');

/** Den gamle dom 1 (17/9–2/10), bevaret som reference til pushSelection.test. */
export const velkomstenFoerstFoer = (forside: string, rykkeliste: string): boolean => {
  const fra = forside.indexOf("pickMainStory<BandItem>([");
  const til = forside.indexOf("])", fra);
  const liste = fra === -1 ? "" : forside.slice(fra, til);
  const kandidater = liste.split("\n").map((l) => l.trim()).filter((l) => /^\S+ \? \{ kind: "/.test(l));
  return kandidater.length === 5 && kandidater[0].startsWith('visVelkomst ? { kind: "velkomst"') && kandidater[1].startsWith('pushItem ? { kind: "push"') &&
    forside.includes("const visVelkomst = velkomstHovedhistorie({") &&
    forside.includes("startDato: contractStartQuery.data ?? null,") &&
    forside.includes("harVideo: tjeklisteData.harVelkomstvideo && !!velkomstvideoGuid,") &&
    forside.includes("setAt: tjeklisteData.velkomstvideoSetAt,") &&
    !/erFoersteUge\(|erIndenDoegn\(|dageMellem\(/.test(forside) &&
    rykkeliste.includes('export type StoryKind = "velkomst" | "push" | "video" | "redaktionelt" | "evergreen";');
};

/** Dom 2: én kilde til dagsregningen. */
export const enKilde = (dom: string, hilsen: string): boolean =>
  dom.includes("export const VELKOMST_UGE_DOEGN = 7;") &&
  dom.includes("return erIndenDoegn(startDato, nu, VELKOMST_UGE_DOEGN);") &&
  !/new Intl\.DateTimeFormat|Date\.UTC|86400000/.test(dom) &&
  hilsen.includes("export const DAG1_DOEGN = 14;") &&
  hilsen.includes("export function erIndenDoegn(startDato: string | null | undefined, nu: Date, doegn: number): boolean {") &&
  hilsen.includes("return erIndenDoegn(startDato, nu, DAG1_DOEGN);");

/** Dom 3: iframe først ved klik. */
export const iframeVedKlik = (forside: string): boolean => {
  const story = blok(forside, "VelkomstStory");
  return story.length > 0 &&
    story.includes("const player = playing ? <HbVelkomstVideoEmbed /> : <PlayCover coverUrl={coverUrl} title={VELKOMST_TITEL} onPlay={() => setPlaying(true)} />;") &&
    story.includes("const [playing, setPlaying] = useState(false);") &&
    (story.match(/setPlaying\(true\)/g) ?? []).length === 1 &&
    !/<iframe/.test(story) &&
    (forside.match(/<iframe/g) ?? []).length === 2;
};

/** Dom 4: fald-tilbage i dommen. */
export const faldTilbage = (dom: string): boolean =>
  dom.includes("if (!harVideo) return false;") &&
  dom.includes("if (setAt) return false;") &&
  dom.includes("return erFoersteUge(startDato, nu);");

/** Dom 5: stemplet gennem tjeklistens mutation. 2/10 (båndet væk): StoryCard
    tegnes ikke på forsiden, så onVelkomstSet gives 0 gange — kortet selv
    stempler stadig gennem onSet, og forsiden skriver aldrig selv til profiles. */
export const stempletGennemTjeklisten = (forside: string): boolean =>
  (forside.match(/onVelkomstSet=\{tjeklisteData\.markerVelkomstSet\}/g) ?? []).length === 0 &&
  !/<StoryCard\b/.test(forside.slice(forside.indexOf("export const BoardroomView = () => {"))) &&
  blok(forside, "VelkomstStory").includes("await onSet();") &&
  !/velkomstvideo_set_at: new Date\(\)/.test(forside) &&
  !/from\("profiles"\)\s*\.update\(/.test(forside);

describe("forsideDag1.guard — PR 5: velkomsten først, én kilde, iframe ved klik, fald-tilbage, stemplet", () => {
  const forside = udenKommentarer(laes(FORSIDE));
  const dom = udenKommentarer(laes(DOM));
  const hilsen = udenKommentarer(laes(HILSEN));
  const rykkeliste = udenKommentarer(laes(RYKKELISTE));

  it("dom 1 (omskrevet 2/10): forsiden kalder hverken pickMainStory eller velkomstHovedhistorie og regner ingen dage; StoryKind er urørt", () => {
    expect(velkomstenFoerst(forside, rykkeliste)).toBe(true);
    expect(velkomstenFoerstFoer(forside, rykkeliste)).toBe(false);
  });
  it("dom 2: erDag1 (14) og erFoersteUge (7) deler erIndenDoegn — ingen egen dagsregning i velkomstHistorie", () => {
    expect(enKilde(dom, hilsen)).toBe(true);
  });
  it("dom 3: VelkomstStory monterer HbVelkomstVideoEmbed først ved klik bag PlayCover; ingen ny iframe i forsiden", () => {
    expect(iframeVedKlik(forside)).toBe(true);
  });
  it("dom 4: uden video, set, eller uden startdato → ikke hovedhistorien", () => {
    expect(faldTilbage(dom)).toBe(true);
  });
  it("dom 5: «Jeg har set den» stempler gennem markerVelkomstSet — forsiden skriver ikke selv til profiles", () => {
    expect(stempletGennemTjeklisten(forside)).toBe(true);
  });

  it("selvbevis 1: båndet tilbage på forsiden (pickMainStory), eller en egen dagsregning, falder", () => {
    expect(velkomstenFoerst(forside + "\nconst band = pickMainStory<BandItem>([]);", rykkeliste)).toBe(false);
    expect(velkomstenFoerst(forside + "\nconst visVelkomst = velkomstHovedhistorie({ startDato: null, nu: new Date(), harVideo: false, setAt: null });", rykkeliste)).toBe(false);
    expect(velkomstenFoerst(forside + "\nconst dag1 = erFoersteUge(contractStartQuery.data, new Date());", rykkeliste)).toBe(false);
    expect(velkomstenFoerst(forside, rykkeliste.replace('export type StoryKind = "velkomst" | "push" | "video" | "redaktionelt" | "evergreen";', 'export type StoryKind = "push" | "video" | "redaktionelt" | "evergreen";'))).toBe(false);
  });
  it("selvbevis 2: en egen dagsregning i velkomstHistorie, eller erDag1 uden erIndenDoegn, falder", () => {
    expect(enKilde(dom.replace("return erIndenDoegn(startDato, nu, VELKOMST_UGE_DOEGN);", "return (nu.getTime() - new Date(startDato ?? 0).getTime()) / 86400000 <= 7;"), hilsen)).toBe(false);
    expect(enKilde(dom, hilsen.replace("return erIndenDoegn(startDato, nu, DAG1_DOEGN);", "return true;"))).toBe(false);
  });
  it("selvbevis 3: embed'et uden gaten, eller en iframe direkte i VelkomstStory, falder", () => {
    expect(iframeVedKlik(forside.replace("const player = playing ? <HbVelkomstVideoEmbed /> : <PlayCover coverUrl={coverUrl} title={VELKOMST_TITEL} onPlay={() => setPlaying(true)} />;", "const player = <HbVelkomstVideoEmbed />;"))).toBe(false);
    expect(iframeVedKlik(forside.replace("const [playing, setPlaying] = useState(false);\n  const [gemmer, setGemmer] = useState(false);", '<iframe src="x" />\n  const [playing, setPlaying] = useState(false);\n  const [gemmer, setGemmer] = useState(false);'))).toBe(false);
  });
  it("selvbevis 4: en dom der viser videoen selv om den er set, falder", () => {
    expect(faldTilbage(dom.replace("if (setAt) return false;", ""))).toBe(false);
  });
  it("selvbevis 5: en direkte profiles-skrivning fra forsiden, eller knappen uden tjeklistens mutation, falder", () => {
    expect(stempletGennemTjeklisten(forside + '\nawait supabase.from("profiles").update({ velkomstvideo_set_at: new Date().toISOString() });')).toBe(false);
    // Et StoryCard tilbage på forsiden (båndet igen) falder — og en VelkomstStory uden onSet.
    expect(stempletGennemTjeklisten(forside.replace("<FornyelsesBaand />", '<FornyelsesBaand /><StoryCard story={band.main} variant="main" pushSender={null} pushCoverUrl={null} onVelkomstSet={tjeklisteData.markerVelkomstSet} />'))).toBe(false);
    expect(stempletGennemTjeklisten(forside.replace("await onSet();", "await Promise.resolve();"))).toBe(false);
  });
});
