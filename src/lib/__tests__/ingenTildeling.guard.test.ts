import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn: ingen tildeling af rådgiver, og chattens to handlinger i lyset
 * (1/10-2026).
 *
 * JONAS 1/10 09:32 (ordret): «Tildeling af rådgiver skal helt fjernes fra
 * platformen. Det arbejder vi ikke med. Rådgiverne er sammen om alle
 * medlemmer.» Og om chattens hoved: «Kræver ikke svar, skal være meget mere
 * let tilgængeligt … foreslå skridt skal også være lettere tilgængelig. Vi
 * får det ikke brugt, hvis det gemmer sig oppe i hjørnet bag tre streger.»
 *
 * DOMME:
 *   1. Klienten (src/, uden de genererede typer og tests) læser og skriver
 *      ALDRIG conversations.assigned_advisor_id — kolonnen står i databasen
 *      (ingen migration), men ingen flade bruger den. Kommentarer tæller ikke.
 *   2. Teksterne «Tildel rådgiver», «Fjern tildeling» og «Tildelt:» findes
 *      ikke i nogen flade.
 *   3. Virksomhedschatten: «Kræver ikke svar» og «Foreslå skridt» står i
 *      samtaleHandlinger, UDEN FOR ⋯-menuen (HbMenu); handlingerne vises på
 *      desktop i rækken og på mobil i egen række; ⋯-menuen findes kun på
 *      mobil; «Kræver ikke svar» kun når samtalen afventer svar; formularen
 *      bor i en HbPopover.
 *   4. Sidebarens tæller tæller ALLE samtaler, der afventer en rådgiver
 *      (ikke «mine + utildelte»).
 * Edge functions er bevidst IKKE omfattet: run-company-agent,
 * send-welcome-message og nudge-report-no-reflection læser stadig kolonnen
 * (docs/chat-design.md §9).
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const erstat = (k: string, fra: string, til: string): string => {
  if (!k.includes(fra)) throw new Error(`mutation rammer ingenting: ${fra}`);
  return k.replace(fra, til);
};

function filer(dir: string): string[] {
  const ud: string[] = [];
  const gaa = (rel: string) => {
    for (const navn of readdirSync(resolve(ROD, rel)).sort()) {
      const sti = join(rel, navn);
      if (statSync(resolve(ROD, sti)).isDirectory()) {
        if (navn === "__tests__" || navn === "node_modules") continue;
        gaa(sti);
      } else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn)) {
        ud.push(sti);
      }
    }
  };
  gaa(dir);
  return ud;
}

const kilder = Object.fromEntries(
  filer("src")
    .filter((f) => !f.endsWith("integrations/supabase/types.ts"))
    .map((f) => [f, udenKommentarer(laes(f))]),
);

const TILDELINGS_TEKSTER = [/Tildel rådgiver/i, /Fjern tildeling/i, /Tildelt:/, /TILDEL RÅDGIVER/];

/** Dom 1 + 2: filerne, der stadig bruger kolonnen eller viser teksterne. */
export const tildelingsSteder = (k: Readonly<Record<string, string>>): string[] =>
  Object.entries(k)
    .filter(([, kilde]) => /assigned_advisor/.test(kilde) || TILDELINGS_TEKSTER.some((r) => r.test(kilde)))
    .map(([sti]) => sti);

const CHAT = "src/components/CompanyChatPane.tsx";
const SIDEBAR = "src/components/AppSidebar.tsx";

/** Dom 3: handlingerne er synlige, uden for ⋯-menuen. */
export const handlingerneErSynlige = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  const h0 = k.indexOf("const samtaleHandlinger = (");
  const h1 = k.indexOf("</HbPopover>", h0);
  const handlinger = h0 > -1 && h1 > h0 ? k.slice(h0, h1) : "";
  const m0 = k.indexOf("<HbMenu\n");
  const m1 = k.indexOf("</HbMenu>", m0);
  const menu = m0 > -1 && m1 > m0 ? k.slice(m0, m1) : "";
  const kraever = handlinger.indexOf("Kræver ikke svar");
  return (
    handlinger !== "" &&
    menu !== "" &&
    // «Kræver ikke svar»: kun når samtalen afventer svar, samme handling som før.
    kraever > -1 &&
    handlinger.slice(0, kraever).includes('{activeConv?.awaiting_reply_from === "advisor" && (') &&
    handlinger.includes("onClick={() => void handleNoReplyNeeded()}") &&
    // «Foreslå skridt»: knap, der åbner formularen i en HbPopover.
    handlinger.includes("<HbPopover") &&
    handlinger.includes("open={forslagAaben}") &&
    handlinger.includes("data-foreslaa-skridt-knap") &&
    handlinger.includes("data-foreslaa-skridt") &&
    handlinger.includes('placeholder="Hvad er skridtet?"') &&
    handlinger.includes('placeholder="Hvorfor? (valgfrit)"') &&
    handlinger.includes("void handleForeslaaOpgave();") &&
    // Ingen af dem i ⋯-menuen.
    !menu.includes("Kræver ikke svar") &&
    !menu.includes("Foreslå skridt") &&
    !menu.includes("handleNoReplyNeeded") &&
    !menu.includes("handleForeslaaOpgave") &&
    // Begge steder i headeren; ⋯-menuen kun på mobil.
    k.includes("{!isMobile && samtaleHandlinger}") &&
    /\{isMobile && \(\s*<div className="mt-2 flex items-center gap-2" data-samtale-handlinger>\s*\{samtaleHandlinger\}/.test(k) &&
    /\{isMobile && \(\s*<HbMenu\n/.test(k) &&
    // Handlingerne findes kun ÉT sted i filen.
    (k.match(/Kræver ikke svar\n/g) ?? []).length === 1 &&
    (k.match(/handleForeslaaOpgave\(\)/g) ?? []).length === 1
  );
};

/** Dom 4: sidebarens tæller tæller alle, der afventer en rådgiver. */
export const sidebarenTaellerAlle = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  return (
    /\.from\("conversations"\)\s*\.select\("id"\)\s*\.eq\("awaiting_reply_from", "advisor"\);\s*setUnreadChat\(convs\?\.length \?\? 0\);/.test(k) &&
    !/=== user\.id\s*\)\.length/.test(k)
  );
};

describe("ingenTildeling.guard — tildeling af rådgiver er væk, chattens handlinger er i lyset", () => {
  it("1+2. ingen klient-fil læser/skriver assigned_advisor_id eller viser tildelings-tekster", () => {
    expect(tildelingsSteder(kilder)).toEqual([]);
  });

  it("1+2. mutation: tildelings-vælgeren tilbage fælder dommen", () => {
    const tilbage = { ...kilder, [CHAT]: kilder[CHAT] + '\n<p className="x">Tildel rådgiver</p>' };
    expect(tildelingsSteder(tilbage)).toEqual([CHAT]);
    const skriv = { ...kilder, "src/lib/nyTildeling.ts": 'await supabase.from("conversations").update({ assigned_advisor_id: id }).eq("id", c);' };
    expect(tildelingsSteder(skriv)).toEqual(["src/lib/nyTildeling.ts"]);
    const laesning = { ...kilder, "src/hooks/nyLaesning.ts": '.select("id, awaiting_reply_from, assigned_advisor_id")' };
    expect(tildelingsSteder(laesning)).toEqual(["src/hooks/nyLaesning.ts"]);
    const visning = { ...kilder, "src/components/NyVisning.tsx": "<span>Tildelt: {navn}</span>" };
    expect(tildelingsSteder(visning)).toEqual(["src/components/NyVisning.tsx"]);
  });

  it("1. en kommentar om kolonnen tæller ikke (historikken må stå)", () => {
    const kommentar = { ...kilder, "src/lib/note.ts": udenKommentarer("// conversations.assigned_advisor_id står i databasen\n/* Tildel rådgiver var en vælger */\nexport const x = 1;") };
    expect(tildelingsSteder(kommentar)).toEqual([]);
  });

  it("3. «Kræver ikke svar» og «Foreslå skridt» står synligt i headeren, uden for ⋯-menuen", () => {
    expect(handlingerneErSynlige(laes(CHAT))).toBe(true);
  });

  it("3. mutationer fælder dommen", () => {
    const raa = laes(CHAT);
    // «Kræver ikke svar» tilbage i menuen.
    expect(handlingerneErSynlige(erstat(raa, "                                <div className=\"px-1\" data-mobil-handlinger>", '                                <button onClick={() => { handleNoReplyNeeded(); }}>Kræver ikke svar\n</button>\n                                <div className="px-1" data-mobil-handlinger>'))).toBe(false);
    // «Foreslå skridt» tilbage i menuen.
    expect(handlingerneErSynlige(erstat(raa, "                                <div className=\"px-1\" data-mobil-handlinger>", '                                <p>Foreslå skridt</p>\n                                <div className="px-1" data-mobil-handlinger>'))).toBe(false);
    // Desktop uden handlinger, eller mobil uden.
    expect(handlingerneErSynlige(erstat(raa, "{!isMobile && samtaleHandlinger}", ""))).toBe(false);
    expect(handlingerneErSynlige(erstat(raa, "data-samtale-handlinger>\n                        {samtaleHandlinger}", "data-samtale-handlinger>\n                        {null}"))).toBe(false);
    // ⋯-menuen tilbage på desktop.
    expect(handlingerneErSynlige(erstat(raa, "{isMobile && (\n                      <HbMenu\n", "{(\n                      <HbMenu\n"))).toBe(false);
    // «Kræver ikke svar» uden betingelsen.
    expect(handlingerneErSynlige(erstat(raa, '      {activeConv?.awaiting_reply_from === "advisor" && (\n        <HbButton', "      {(\n        <HbButton"))).toBe(false);
    // Formularen ud af popoveren.
    expect(handlingerneErSynlige(erstat(raa, "open={forslagAaben}", "open={true}"))).toBe(false);
  });

  it("4. sidebarens tæller tæller alle samtaler, der afventer en rådgiver", () => {
    const raa = laes(SIDEBAR);
    expect(sidebarenTaellerAlle(raa)).toBe(true);
    expect(sidebarenTaellerAlle(erstat(raa, "setUnreadChat(convs?.length ?? 0);", "setUnreadChat((convs ?? []).filter((c: any) => c.ejer === user.id).length);"))).toBe(false);
  });
});
