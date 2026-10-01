import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Mobil-chat (Jonas 29/9: «mobilversionen er dårligt formateret … chatten er
 * dårligt skåret. Svært at arbejde i»). Målt med Playwright 29/9 (ved 375 px):
 * rådgiverens header gav navnet 31 px; onboarding-pillen lå over sendefeltet;
 * chattens felter var 14/15/12 px (iOS zoomer under 16); nøgletal-banneret
 * tog 2-3 linjer. Kildeværn (husets form: kildelæsning, kommentarer strippet,
 * mutationer) for de fire ting, der kan skride stille. Punkt 4 (medlemmets
 * tilbage-pil) er låst i src/components/__tests__/MemberChatPaneMobil.test.tsx;
 * pillens regel som ren funktion i src/lib/hjemmebane/__tests__/ankomst.test.ts.
 * Desktop er uændret: alle mobilklasser er `max-md:` (samme grænse som
 * useIsMobile, 768) eller gates på isMobile.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const erstat = (k: string, fra: string, til: string): string => {
  if (!k.includes(fra)) throw new Error(`mutation rammer ingenting: ${fra}`);
  return k.replace(fra, til);
};

const RAADGIVER = "src/components/CompanyChatPane.tsx";
const SKAL = "src/components/hjemmebane/HbMemberShell.tsx";
const EDITOR = "src/components/ChatRichInput.tsx";
const BANNER = "src/components/ChatNoegletalChip.tsx";

// ── 1. Rådgiverens header ──────────────────────────────────────────────────
/** Rækken er tilbage + avatar + navn + ⋯ på mobil; resten bor i ⋯-menuen. */
export const headerenErSmalPaaMobil = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  const menu = k.indexOf("data-mobil-handlinger");
  const raekkeStart = k.indexOf('<div className="flex items-center gap-3">');
  const seTalKnap = k.indexOf("Se tal\n");
  const prik = k.indexOf("data-afventer-prik");
  const prikTag = prik === -1 ? "" : k.slice(prik - 200, prik + 200);
  return (
    raekkeStart !== -1 &&
    menu !== -1 &&
    // Navnet kan krympe og afkortes — men aldrig til 0 px (rådets fund 1/10:
    // en fast minimumsbredde; truncate klarer resten).
    k.includes('<div className="flex-1 min-w-[6rem]" data-samtale-navn>') &&
    k.includes('<p className="text-sm font-medium text-hb-ink truncate">') &&
    // «Se tal» findes kun INDE i mobilhandlingerne i ⋯-menuen, ikke i rækken.
    seTalKnap > menu &&
    (k.match(/Se tal\n/g) ?? []).length === 1 &&
    // Prev/next: mobil-punkter i menuen + desktop-pilene gated på !isMobile.
    k.includes("Forrige samtale") &&
    k.includes("Næste samtale") &&
    k.includes("{!isMobile && advisorConvList.length > 1 && (") &&
    // «Afventer»-chippen er desktop; mobilen får en prik med aria-label og title.
    k.includes('{!isMobile && activeConv?.awaiting_reply_from === "advisor" && (') &&
    k.includes('{isMobile && activeConv?.awaiting_reply_from === "advisor" ? (') &&
    prikTag.includes('aria-label="Afventer dit svar"') &&
    prikTag.includes('title="Afventer dit svar"') &&
    prikTag.includes('role="img"')
  );
};

describe("rådgiverens samtaleheader på mobil", () => {
  const raa = laes(RAADGIVER);
  it("dom: navnet kan krympe, «Se tal» og prev/next bor i menuen, chippen er en prik med aria-label og title", () => {
    expect(headerenErSmalPaaMobil(raa)).toBe(true);
  });
  it("mutationer fælder dommen", () => {
    // Navnet mister sin minimumsbredde (eller får 0) eller truncate.
    expect(headerenErSmalPaaMobil(erstat(raa, '<div className="flex-1 min-w-[6rem]" data-samtale-navn>', '<div className="flex-1" data-samtale-navn>'))).toBe(false);
    expect(headerenErSmalPaaMobil(erstat(raa, '<div className="flex-1 min-w-[6rem]" data-samtale-navn>', '<div className="flex-1 min-w-0" data-samtale-navn>'))).toBe(false);
    expect(headerenErSmalPaaMobil(erstat(raa, '<p className="text-sm font-medium text-hb-ink truncate">', '<p className="text-sm font-medium text-hb-ink">'))).toBe(false);
    // «Se tal» tilbage i rækken (en ekstra knap med teksten).
    expect(headerenErSmalPaaMobil(erstat(raa, "{/* Primary contextual action", '{isMobile && <button type="button"><span>Se tal\n</span></button>}\n{/* Primary contextual action'))).toBe(false);
    // Prev/next igen på mobil.
    expect(headerenErSmalPaaMobil(erstat(raa, "{!isMobile && advisorConvList.length > 1 && (", "{advisorConvList.length > 1 && ("))).toBe(false);
    // Chippen igen på mobil, eller prikken uden navn.
    expect(headerenErSmalPaaMobil(erstat(raa, '{!isMobile && activeConv?.awaiting_reply_from === "advisor" && (', '{activeConv?.awaiting_reply_from === "advisor" && ('))).toBe(false);
    expect(headerenErSmalPaaMobil(erstat(raa, '                            aria-label="Afventer dit svar"\n', ""))).toBe(false);
    expect(headerenErSmalPaaMobil(erstat(raa, '                            title="Afventer dit svar"\n', ""))).toBe(false);
    // Mobilhandlingerne væk fra menuen.
    expect(headerenErSmalPaaMobil(erstat(raa, "data-mobil-handlinger", "data-x"))).toBe(false);
  });
});

// ── 2. Onboarding-boksen på chatten (mobil) ────────────────────────────────
export const boksenErVaekFraChattenPaaMobil = (skal: string): boolean => {
  const k = udenKommentarer(skal);
  return (
    k.includes('import { erErfarentMedlem, onboardingBoksMonteres, pillenTraekkerSig } from "@/lib/hjemmebane/ankomst";') &&
    k.includes("const boksMonteres = onboardingBoksMonteres(active, erMobil);") &&
    // Selve monteringen, bund-luften (pb-[72vh]) og menupunktet følger dommen.
    k.includes("{!isAdvisor && boksMonteres && (\n        <HbOnboardingTjekliste") &&
    k.includes('const tjeklisteBundluft = tjeklisteUdfoldet && boksMonteres ? "pb-[72vh] lg:pb-[30rem]" : "";') &&
    k.includes("!isAdvisor && boksMonteres && tjeklisteData.tjekliste &&") &&
    // Bredden læses synkront (ikke useIsMobile, der er false ved første render) og grænsen er md.
    (k.match(/window\.innerWidth < 768\)/g) ?? []).length === 2 &&
    k.includes('window.matchMedia("(max-width: 767px)")') &&
    !/useIsMobile/.test(k)
  );
};

describe("onboarding-boksen dækker ikke sendefeltet på mobil", () => {
  const skal = laes(SKAL);
  it("dom: skallen monterer ikke boksen når active er chatten og bredden er under md", () => {
    expect(boksenErVaekFraChattenPaaMobil(skal)).toBe(true);
  });
  it("mutationer fælder dommen", () => {
    expect(boksenErVaekFraChattenPaaMobil(erstat(skal, "{!isAdvisor && boksMonteres && (\n        <HbOnboardingTjekliste", "{!isAdvisor && (\n        <HbOnboardingTjekliste"))).toBe(false);
    expect(boksenErVaekFraChattenPaaMobil(erstat(skal, "tjeklisteUdfoldet && boksMonteres ?", "tjeklisteUdfoldet ?"))).toBe(false);
    expect(boksenErVaekFraChattenPaaMobil(erstat(skal, "!isAdvisor && boksMonteres && tjeklisteData.tjekliste &&", "!isAdvisor && tjeklisteData.tjekliste &&"))).toBe(false);
    expect(boksenErVaekFraChattenPaaMobil(erstat(skal, "onboardingBoksMonteres(active, erMobil)", "onboardingBoksMonteres(active, false)"))).toBe(false);
    expect(boksenErVaekFraChattenPaaMobil(erstat(skal, "window.innerWidth < 768);", "window.innerWidth < 1024);"))).toBe(false);
  });
});

// ── 3. 16 px i chattens felter på mobil ────────────────────────────────────
export const chatfelterErSekstenPx = (editor: string, raadgiver: string): boolean => {
  const e = udenKommentarer(editor), r = udenKommentarer(raadgiver);
  const soeg = r.indexOf('placeholder="Søg virksomhed..."');
  const soegTag = soeg === -1 ? "" : r.slice(soeg, soeg + 200);
  const menuFelter = r.match(/className=\{`\$\{hbControlClasses\} mb-1\.5[^`]*`\}/g) ?? [];
  return (
    // Editoren: 16 px og linjehøjde 20 px på mobil; min-h (Jonas 10/9) urørt.
    e.includes('"px-3 text-sm max-md:text-[16px] max-md:leading-5 focus:outline-none overflow-y-auto"') &&
    e.includes('isCompact ? "py-2.5 min-h-[80px] max-h-[33vh]" : "py-2 min-h-[76px] max-h-[33vh]"') &&
    // Søgefeltet og menuens tre felter.
    soegTag.includes("max-md:text-[16px]") &&
    menuFelter.length === 3 &&
    menuFelter.every((k) => k.includes("max-md:text-[16px]"))
  );
};

describe("chattens felter er 16 px på mobil (iOS zoomer ikke ved fokus)", () => {
  const editor = laes(EDITOR);
  const raa = laes(RAADGIVER);
  it("dom", () => {
    expect(chatfelterErSekstenPx(editor, raa)).toBe(true);
  });
  it("mutationer fælder dommen (også en ændret min-h)", () => {
    expect(chatfelterErSekstenPx(erstat(editor, "max-md:text-[16px] max-md:leading-5 ", ""), raa)).toBe(false);
    expect(chatfelterErSekstenPx(erstat(editor, "max-md:text-[16px] ", ""), raa)).toBe(false);
    expect(chatfelterErSekstenPx(erstat(editor, "py-2.5 min-h-[80px]", "py-2.5 min-h-[44px]"), raa)).toBe(false);
    expect(chatfelterErSekstenPx(editor, erstat(raa, "pl-9 pr-4 text-sm max-md:text-[16px]", "pl-9 pr-4 text-sm"))).toBe(false);
    expect(chatfelterErSekstenPx(editor, erstat(raa, "mb-1.5 px-2 py-1.5 text-xs max-md:text-[16px]", "mb-1.5 px-2 py-1.5 text-xs"))).toBe(false);
  });
  it("kun chattens felter: den delte hbControlClasses er uændret (15 px)", () => {
    const felt = laes("src/components/hjemmebane/admin/HbField.tsx");
    expect(felt).toContain("py-2.5 text-[15px] text-hb-ink");
    expect(felt).not.toContain("max-md:text-[16px]");
  });
});

// ── 5. Nøgletal-banneret over sendefeltet ──────────────────────────────────
export const banneretErEnLinjePaaMobil = (komponent: string): boolean => {
  const k = udenKommentarer(komponent);
  const start = k.indexOf("export const NoegletalChipBanner");
  const banner = start === -1 ? "" : k.slice(start, start + 900);
  return banner.includes('<span className="min-w-0 flex-1 max-md:truncate">');
};

describe("nøgletal-banneret tager højst én linje på mobil", () => {
  const komponent = laes(BANNER);
  it("dom + mutation", () => {
    expect(banneretErEnLinjePaaMobil(komponent)).toBe(true);
    expect(banneretErEnLinjePaaMobil(erstat(komponent, "min-w-0 flex-1 max-md:truncate", "min-w-0 flex-1"))).toBe(false);
    expect(banneretErEnLinjePaaMobil(erstat(komponent, "min-w-0 flex-1 max-md:truncate", "min-w-0 flex-1 truncate"))).toBe(false);
  });
});
