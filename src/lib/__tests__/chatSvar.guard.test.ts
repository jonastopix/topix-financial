import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9): «svar på en besked» fejler STILLE hvis en af de fem ting
// forsvinder — ingen exception, bare et svar uden citat, et citat der
// renderer HTML, eller en knap på en besked databasen afviser. Mønstret er
// memberChatPane.guard.test.ts (CI har ingen DB/DOM). memberChatPane.guard og
// klokkeChat.guard er URØRTE; deres krav genprøves ikke her — de kører selv.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const PANER = ["src/components/CompanyChatPane.tsx", "src/components/MemberChatPane.tsx"] as const;

/** 1. Begge paner læser kolonnen: select-listen for beskederne bærer svar_paa_id. */
export function panenLaeserKolonnen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return /\.select\("id, conversation_id, sender_id, content, read_at, created_at, message_type, context_type, context_id, context_meta, pinned_at, svar_paa_id"\)/.test(k);
}

/** 2. Begge paner sender svar_paa_id i insert — fra svarPaa-tilstanden, kun når den er sat. */
export function panenSenderSvarPaa(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return /if \(svarPaa\) \{\s*insertData\.svar_paa_id = svarPaa\.id;\s*\}/.test(k) && /supabase\.from\("messages"\)\.insert\(insertData\)/.test(k);
}

/** 3. Citatet renderes gennem den fælles komponent (begge bobler) — og HVER «Svar»-knap gates af kanBesvares. */
export function panenBrugerCitatOgGate(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const importerer = /import \{ SvarCitat, SvarerPaaBanner \} from "@\/components\/ChatSvarCitat";/.test(k)
    && /import \{ kanBesvares, svarUddrag \} from "@\/lib\/chatSvar";/.test(k);
  const citat = (k.match(/<SvarCitat\b/g) ?? []).length >= 2; // mobil-skuffen OG desktop-boblen
  // HVER onReply skal være gate't — én ugate't (mobil eller desktop) er en knap databasen afviser.
  const alleOnReply = (k.match(/onReply=\{/g) ?? []).length;
  const gatede = (k.match(/onReply=\{kanBesvares\(msg\) \? \(\) => startSvar\(msg\) : undefined\}/g) ?? []).length;
  return importerer && citat && alleOnReply >= 2 && gatede === alleOnReply;
}

/** 4. Citatet er ren tekst: den fælles komponent bruger ALDRIG dangerouslySetInnerHTML, og dommen er lib'ens. */
export function citatErRenTekst(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return !/dangerouslySetInnerHTML/.test(k) && /citatTilstand\(\{/.test(k) && /from "@\/lib\/chatSvar"/.test(k);
}

/** 5. Redigering rører ikke svar_paa_id: saveEdit opdaterer content + edited_at og intet andet. */
export function redigeringRoererIkkeSvar(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return /\.update\(\{ content: trimmed, edited_at: new Date\(\)\.toISOString\(\) \} as any\)/.test(k) && !/svar_paa_id/.test(k);
}

describe("chatSvar.guard — svar på en besked i begge paner", () => {
  const paner = PANER.map((p) => [p, laes(p)] as const);
  const citat = laes("src/components/ChatSvarCitat.tsx");
  const handlinger = laes("src/hooks/useMessageActions.ts");

  it("1. begge paner læser svar_paa_id i beskedhentningen", () => {
    for (const [p, k] of paner) expect(panenLaeserKolonnen(k), p).toBe(true);
  });

  it("2. begge paner sender svar_paa_id i insert — kun når svarPaa er sat", () => {
    for (const [p, k] of paner) expect(panenSenderSvarPaa(k), p).toBe(true);
  });

  it("3. begge paner renderer citatet via SvarCitat og gater «Svar» med kanBesvares", () => {
    for (const [p, k] of paner) expect(panenBrugerCitatOgGate(k), p).toBe(true);
  });

  it("4. citatet er ren tekst — ingen dangerouslySetInnerHTML i ChatSvarCitat.tsx, dommen fra lib/chatSvar", () => {
    expect(citatErRenTekst(citat)).toBe(true);
  });

  it("5. redigering (useMessageActions.saveEdit) rører ikke svar_paa_id", () => {
    expect(redigeringRoererIkkeSvar(handlinger)).toBe(true);
  });

  it("6. menuerne tilbyder «Svar» (onReply) på desktop og mobil", () => {
    const menu = udenKommentarer(laes("src/components/MessageActionMenu.tsx"));
    const drawer = udenKommentarer(laes("src/components/MobileMessageActionDrawer.tsx"));
    expect(menu).toMatch(/onReply\?: \(\) => void;/);
    expect(menu).toMatch(/if \(!canEdit && !canDelete && !onReply\) return null;/);
    expect(drawer).toMatch(/onReply\?: \(\) => void;/);
    expect(drawer).toMatch(/const hasActions = canEdit \|\| canDelete \|\| !!onReaction \|\| !!onReply;/);
  });

  it("VÆRNET VIRKER: kopier uden hver af de fem ting fejler (filerne er ikke rørt)", () => {
    const [, company] = paner[0];
    // 1. kolonnen ude af select-listen
    const udenKolonne = company.replace(", pinned_at, svar_paa_id\"", ", pinned_at\"");
    expect(udenKolonne).not.toBe(company);
    expect(panenLaeserKolonnen(udenKolonne)).toBe(false);
    // 2. insert uden svar_paa_id
    const udenInsert = company.replace(/if \(svarPaa\) \{\s*insertData\.svar_paa_id = svarPaa\.id;\s*\}/, "");
    expect(udenInsert).not.toBe(company);
    expect(panenSenderSvarPaa(udenInsert)).toBe(false);
    // 3. «Svar» uden gate
    const udenGate = company.replace("onReply={kanBesvares(msg) ? () => startSvar(msg) : undefined}", "onReply={() => startSvar(msg)}");
    expect(udenGate).not.toBe(company);
    expect(panenBrugerCitatOgGate(udenGate)).toBe(false);
    // 4. HTML i citatet
    const medHtml = citat.replace("<span className=\"truncate\">{tilstand.uddrag}</span>", "<span className=\"truncate\" dangerouslySetInnerHTML={{ __html: tilstand.uddrag }} />");
    expect(medHtml).not.toBe(citat);
    expect(citatErRenTekst(medHtml)).toBe(false);
    // 5. redigering der skriver svar_paa_id
    const medSvar = handlinger.replace("{ content: trimmed, edited_at: new Date().toISOString() } as any", "{ content: trimmed, edited_at: new Date().toISOString(), svar_paa_id: null } as any");
    expect(medSvar).not.toBe(handlinger);
    expect(redigeringRoererIkkeSvar(medSvar)).toBe(false);
  });
});
