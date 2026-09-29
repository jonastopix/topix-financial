import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for «Spørg din rådgiver» ved et nøgletal (kort i mangellisten,
 * Jonas 22/9). Fire domme, hver bevist på en kopi med fejlen indsat:
 *
 *   1. CHIPPEN ER FROSSET: motoren og komponenten kender hverken databasen eller
 *      company_facts; visningen læser KUN beskedens context_meta.noegletal
 *      (laesNoegletalChip), og knappen bygger chippen af kortets EGNE tal ved
 *      klikket — intet opslag. Et tal, der ændrer sig efter nogen har spurgt til
 *      det, gør samtalen uforståelig (C12, refleksionSvar nr. 1).
 *   2. CHIPPEN ER REN TEKST: ChatNoegletalChip.tsx bruger aldrig
 *      dangerouslySetInnerHTML (samme regel som ChatSvarCitat).
 *   3. KNAPPEN FINDES KUN FOR MEDLEMMER: NoegletalView dømmer på den RÅ rolle og
 *      medlemsniveauet (maaSpoergeRaadgiver), knappen står bag den dom, og
 *      «Spørg din rådgiver» og banneret findes ingen andre steder — især ikke i
 *      rådgiverens flade (CompanyChatPane).
 *   4. VEJEN ER CHATTENS: nøgletallet sender chippen som router-state; medlemmets
 *      pane læser den (laesChipFraState), sender den i context_meta gennem
 *      bygBeskedMeta og rydder den efter en lykket sending; begge paners bobler
 *      (mobil + desktop) viser chippen — også rådgiverens.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const antal = (k: string, del: string): number => k.split(del).length - 1;

const LIB = "src/lib/noegletalChip.ts";
const KOMPONENT = "src/components/ChatNoegletalChip.tsx";
const VIEW = "src/components/hjemmebane/noegletal/NoegletalView.tsx";
const MEDLEM = "src/components/MemberChatPane.tsx";
const RAADGIVER = "src/components/CompanyChatPane.tsx";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const chippenErFrosset = (lib: string, komponent: string, view: string): boolean => {
  const l = udenKommentarer(lib), k = udenKommentarer(komponent), v = udenKommentarer(view);
  const start = v.indexOf("const spoerg = () => {");
  const knap = start === -1 ? "" : v.slice(start, start + 700);
  return (
    // Motoren og komponenten rører ingen database og ingen tabel.
    !/supabase|company_facts|useCompanyFacts|useQuery|fetch\(/.test(l) &&
    !/supabase|company_facts|useCompanyFacts|useQuery|fetch\(/.test(k) &&
    // Visningen læser KUN meta.
    k.includes("const chip = laesNoegletalChip(contextMeta);") &&
    l.includes("return laesChipObjekt(meta[NOEGLETAL_META_NOEGLE]);") &&
    // Knappen fryser kortets egne tal ved klikket: værdien er den viste tekst, perioden er seneste række.
    knap.length > 0 &&
    knap.includes("vaerdi: visTal,") &&
    knap.includes("periodKey: latestKF.sortKey,") &&
    knap.includes("estimat: senesteErEstimat,") &&
    knap.includes("bygNoegletalChip({") &&
    !/supabase|\.from\(|useQuery|fetch\(/.test(knap) &&
    // Chippen er en frosset kopi.
    l.includes("Object.freeze({ noegle: i.noegle")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const chippenErRenTekst = (komponent: string): boolean => {
  const k = udenKommentarer(komponent);
  return !/dangerouslySetInnerHTML/.test(k) && antal(k, "chipTekst(chip)") === 2;
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const knappenErKunForMedlemmer = (lib: string, view: string, medlem: string, raadgiver: string, komponent: string): boolean => {
  const l = udenKommentarer(lib), v = udenKommentarer(view), m = udenKommentarer(medlem), r = udenKommentarer(raadgiver);
  const dom = l.slice(l.indexOf("export function maaSpoergeRaadgiver"), l.indexOf("export function maaSpoergeRaadgiver") + 260);
  const knap = v.slice(v.indexOf("{kanSpoerge && ("), v.indexOf("{kanSpoerge && (") + 400);
  return (
    // Dommen: ikke rådgiver OG fuldt medlemskab.
    dom.includes("return !i.erRaadgiver && i.tier === \"full\";") &&
    // Visningen dømmer på den RÅ rolle (ikke viewMode-justeret) og på niveauet.
    v.includes("const kanSpoerge = maaSpoergeRaadgiver({ erRaadgiver: rawAdvisor, tier: membershipTier });") &&
    // Knappen står bag dommen, og teksten står kun der.
    knap.includes("Spørg din rådgiver") &&
    antal(v, "Spørg din rådgiver") === 1 &&
    antal(v, "{kanSpoerge && (") === 1 &&
    // Rådgiverens flade kender hverken knappen, banneret eller state-læseren.
    !/Spørg din rådgiver|NoegletalChipBanner|laesChipFraState|bygBeskedMeta|spoergRaadgiverRejse/.test(r) &&
    // Medlemmets chat er den ENESTE, der læser state og viser banneret; teksten «Spørg din rådgiver» bor kun i knappen.
    !/Spørg din rådgiver/.test(m) &&
    !/Spørg din rådgiver/.test(udenKommentarer(komponent))
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const vejenErChattens = (view: string, medlem: string, raadgiver: string): boolean => {
  const v = udenKommentarer(view), m = udenKommentarer(medlem), r = udenKommentarer(raadgiver);
  const bobler = (p: string) => antal(p, "<NoegletalChipVisning contextMeta={msg.context_meta} isMine={isMine} />") === 2;
  return (
    // Nøgletallet sender chippen som state til /chat.
    v.includes("const rejse = spoergRaadgiverRejse(dom.chip);") &&
    v.includes("navigate(rejse.to, { state: rejse.state });") &&
    // `=== false`, ikke `!dom.ok`: strict er slået fra, og et bart boolean-felt indsnævrer ikke unionen.
    v.includes("if (dom.ok === false) return;") &&
    // Medlemmets pane læser state én gang, rydder den, og sender chippen med beskeden.
    m.includes("useState<NoegletalChip | null>(() => laesChipFraState(location.state))") &&
    m.includes("navigate(`${location.pathname}${location.search}`, { replace: true, state: null });") &&
    m.includes("const contextMeta = bygBeskedMeta({ attachments, chip: noegletalChip });") &&
    m.includes("insertData.context_meta = contextMeta;") &&
    // Chippen ryddes EFTER en lykket sending (i if (!error && data)), ikke før.
    m.indexOf("if (!error && data) {") < m.indexOf("setNoegletalChip(null);\n        notifyChatMessage") &&
    m.includes("{noegletalChip && <NoegletalChipBanner chip={noegletalChip} onFjern={() => setNoegletalChip(null)} />}") &&
    // Begge paners bobler (mobil + desktop) viser chippen; medlemmets én gang for hver.
    bobler(m) && bobler(r) &&
    m.includes('import { NoegletalChipBanner, NoegletalChipVisning } from "@/components/ChatNoegletalChip";') &&
    r.includes('import { NoegletalChipVisning } from "@/components/ChatNoegletalChip";')
  );
};

describe("noegletalChip.guard — «Spørg din rådgiver» ved et nøgletal", () => {
  it("1. chippen er frosset: fra context_meta og kortets egne tal, aldrig et opslag", () => expect(chippenErFrosset(laes(LIB), laes(KOMPONENT), laes(VIEW))).toBe(true));
  it("2. chippen er ren tekst — ingen dangerouslySetInnerHTML", () => expect(chippenErRenTekst(laes(KOMPONENT))).toBe(true));
  it("3. knappen findes kun for medlemmer med adgang til chatten", () => expect(knappenErKunForMedlemmer(laes(LIB), laes(VIEW), laes(MEDLEM), laes(RAADGIVER), laes(KOMPONENT))).toBe(true));
  it("4. vejen er chattens: state → medlemmets pane → context_meta → begge paners bobler", () => expect(vejenErChattens(laes(VIEW), laes(MEDLEM), laes(RAADGIVER))).toBe(true));
});

describe("noegletalChip.guard — dommene fanger fejlen på en kopi", () => {
  const lib = laes(LIB), komponent = laes(KOMPONENT), view = laes(VIEW), medlem = laes(MEDLEM), raadgiver = laes(RAADGIVER);

  const erstat = (kilde: string, gammel: string, ny: string): string => {
    expect(kilde.includes(gammel), `mangler: ${gammel}`).toBe(true);
    return kilde.replace(gammel, ny);
  };

  it("et opslag i company_facts i motoren, i komponenten eller i knappen fælder dom 1", () => {
    expect(chippenErFrosset(`${lib}\nimport { supabase } from "@/integrations/supabase/client";\n`, komponent, view)).toBe(false);
    expect(chippenErFrosset(lib, `${komponent}\nconst q = useQuery({ queryKey: ["company_facts"] });\n`, view)).toBe(false);
    // Værdien slås op i stedet for at være den viste tekst.
    expect(chippenErFrosset(lib, komponent, erstat(view, "vaerdi: visTal,", "vaerdi: String(await supabase.from(\"company_facts\").select()),"))).toBe(false);
    // Perioden er ikke seneste række.
    expect(chippenErFrosset(lib, komponent, erstat(view, "periodKey: latestKF.sortKey,", "periodKey: selectedKPI,"))).toBe(false);
    // Estimat-flaget følger ikke med.
    expect(chippenErFrosset(lib, komponent, erstat(view, "estimat: senesteErEstimat,", "estimat: false,"))).toBe(false);
  });

  it("en visning, der ikke læser context_meta, eller en chip, der ikke er frosset, fælder dom 1", () => {
    expect(chippenErFrosset(lib, erstat(komponent, "const chip = laesNoegletalChip(contextMeta);", "const chip = null as never;"), view)).toBe(false);
    expect(chippenErFrosset(erstat(lib, "Object.freeze({ noegle: i.noegle", "({ noegle: i.noegle"), komponent, view)).toBe(false);
    expect(chippenErFrosset(erstat(lib, "return laesChipObjekt(meta[NOEGLETAL_META_NOEGLE]);", "return laesChipObjekt(meta);"), komponent, view)).toBe(false);
  });

  it("dangerouslySetInnerHTML i chippen fælder dom 2", () => {
    expect(chippenErRenTekst(erstat(komponent, "<span className=\"min-w-0 break-words\">{chipTekst(chip)}</span>", "<span dangerouslySetInnerHTML={{ __html: chipTekst(chip) }} />"))).toBe(false);
  });

  it("en knap uden dommen, på den justerede rolle, eller i rådgiverens flade fælder dom 3", () => {
    // Uden dommen: knappen vises altid.
    expect(knappenErKunForMedlemmer(lib, erstat(view, "{kanSpoerge && (", "{true && ("), medlem, raadgiver, komponent)).toBe(false);
    // Den viewMode-justerede rolle i stedet for den rå.
    expect(knappenErKunForMedlemmer(lib, erstat(view, "erRaadgiver: rawAdvisor,", "erRaadgiver: isAdvisor,"), medlem, raadgiver, komponent)).toBe(false);
    // Niveauet er ikke med.
    expect(knappenErKunForMedlemmer(lib, erstat(view, "tier: membershipTier });", "tier: \"full\" });"), medlem, raadgiver, komponent)).toBe(false);
    // Dommen løsnet: rådgivere tælles med, eller abonnenter slipper ind.
    expect(knappenErKunForMedlemmer(erstat(lib, "return !i.erRaadgiver && i.tier === \"full\";", "return i.tier === \"full\";"), view, medlem, raadgiver, komponent)).toBe(false);
    expect(knappenErKunForMedlemmer(erstat(lib, "return !i.erRaadgiver && i.tier === \"full\";", "return !i.erRaadgiver;"), view, medlem, raadgiver, komponent)).toBe(false);
    // Knappen (eller banneret) i rådgiverens flade.
    expect(knappenErKunForMedlemmer(lib, view, medlem, `${raadgiver}\n<HbButton>Spørg din rådgiver</HbButton>\n`, komponent)).toBe(false);
    expect(knappenErKunForMedlemmer(lib, view, medlem, `${raadgiver}\n<NoegletalChipBanner chip={x} onFjern={y} />\n`, komponent)).toBe(false);
    // En anden knap med samme tekst i visningen.
    expect(knappenErKunForMedlemmer(lib, `${view}\n<button>Spørg din rådgiver</button>\n`, medlem, raadgiver, komponent)).toBe(false);
  });

  it("en pane, der ikke sender chippen, ikke rydder den, eller en boble uden den, fælder dom 4", () => {
    expect(vejenErChattens(erstat(view, "navigate(rejse.to, { state: rejse.state });", "navigate(rejse.to);"), medlem, raadgiver)).toBe(false);
    expect(vejenErChattens(erstat(view, "if (dom.ok === false) return;", "if (!dom.ok) return;"), medlem, raadgiver)).toBe(false);
    expect(vejenErChattens(view, erstat(medlem, "const contextMeta = bygBeskedMeta({ attachments, chip: noegletalChip });", "const contextMeta = attachments.length > 0 ? { attachments } : undefined;"), raadgiver)).toBe(false);
    expect(vejenErChattens(view, erstat(medlem, "        setNoegletalChip(null);\n        notifyChatMessage", "        notifyChatMessage"), raadgiver)).toBe(false);
    expect(vejenErChattens(view, erstat(medlem, "{ replace: true, state: null }", "{ replace: true }"), raadgiver)).toBe(false);
    expect(vejenErChattens(view, erstat(medlem, "{noegletalChip && <NoegletalChipBanner", "{false && <NoegletalChipBanner"), raadgiver)).toBe(false);
    // Én af de fire bobler mister chippen — medlemmets eller rådgiverens.
    const enBoble = "<NoegletalChipVisning contextMeta={msg.context_meta} isMine={isMine} />";
    expect(vejenErChattens(view, erstat(medlem, enBoble, ""), raadgiver)).toBe(false);
    expect(vejenErChattens(view, medlem, erstat(raadgiver, enBoble, ""))).toBe(false);
  });
});
