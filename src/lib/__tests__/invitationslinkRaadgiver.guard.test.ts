import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for m28-invitationslink-raadgiver (29/9-2026). Hver dom grøn på
 * repoets filer og rød på en kopi med fejlen:
 *   1. ÉT LINK: rådgiverens «Kopiér link» og kundens «Kopiér invitationslink»
 *      bygger linket i invitationsLink (lib/invitationer) — ingen af dem har
 *      en egen streng med /auth?mode=signup&invite=.
 *   2. TOKENET HENTES: hentInvitationer (og virksomhedssidens læsning) vælger
 *      token, ellers har knappen intet at kopiere.
 *   3. KUN PENDING: knappen står bag kanKopiereLink, og kanKopiereLink kræver
 *      status 'pending'.
 *   4. ROLIGT SVAR: bekræftelsen «Linket er kopieret» og en fejlbesked, hvis
 *      clipboard fejler.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

const HB = "src/components/hjemmebane/virksomheder/HbInvitationer.tsx";
const KUNDE = "src/components/CompanyInvitations.tsx";
const HOOK = "src/hooks/invitationer.ts";
const VIRKSOMHED = "src/hooks/useVirksomhed.ts";
const LIB = "src/lib/invitationer.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const sammeFunktion = (hb: string, kunde: string, lib: string): boolean => {
  const h = udenKommentarer(hb);
  const k = udenKommentarer(kunde);
  const l = udenKommentarer(lib);
  return h.includes("invitationsLink(token)") &&
    k.includes("invitationsLink(inv.token)") &&
    !/invite=/.test(h) &&
    !/mode=signup&invite=/.test(k) &&
    (l.match(/mode=signup&invite=/g) ?? []).length === 1;
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const tokenHentes = (hook: string, virksomhed: string): boolean =>
  /\.from\("company_invitations"\)\.select\("id, company_id, email, status, created_at, accepted_at, token"\)/.test(udenKommentarer(hook)) &&
  /\.from\("company_invitations"\)\s*\.select\("id, email, status, created_at, accepted_at, token"\)/.test(udenKommentarer(virksomhed));

// ── 3 ──────────────────────────────────────────────────────────────────────
export const kunPending = (hb: string, lib: string): boolean => {
  const h = udenKommentarer(hb);
  const l = udenKommentarer(lib);
  const fn = l.slice(l.indexOf("export function kanKopiereLink("), l.indexOf("export async function kopierTilClipboard("));
  return h.includes("{kanKopiereLink(inv) && (") &&
    (h.match(/Kopiér link/g) ?? []).length === 1 &&
    fn.includes('inv.status === "pending"');
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const roligtSvar = (hb: string): boolean => {
  const h = udenKommentarer(hb);
  const fn = h.slice(h.indexOf("const kopierLink = async"), h.indexOf("export const InvitationHandlinger"));
  return /try\s*\{\s*await kopierTilClipboard\(invitationsLink\(token\)\);\s*toast\.success\("Linket er kopieret"\);\s*\}\s*catch\s*\{\s*toast\.error\("Linket kunne ikke kopieres"/.test(fn);
};

describe("invitationslinkRaadgiver.guard — på repoets filer", () => {
  const hb = laes(HB), kunde = laes(KUNDE), hook = laes(HOOK), virksomhed = laes(VIRKSOMHED), lib = laes(LIB);
  it("1. rådgiverens og kundens link går gennem samme funktion", () => expect(sammeFunktion(hb, kunde, lib)).toBe(true));
  it("2. token hentes i begge læsninger", () => expect(tokenHentes(hook, virksomhed)).toBe(true));
  it("3. knappen står kun ved pending", () => expect(kunPending(hb, lib)).toBe(true));
  it("4. rolig bekræftelse og fejlbesked", () => expect(roligtSvar(hb)).toBe(true));
});

describe("invitationslinkRaadgiver.guard — mutationer låser", () => {
  const hb = laes(HB), kunde = laes(KUNDE), hook = laes(HOOK), virksomhed = laes(VIRKSOMHED), lib = laes(LIB);

  it("1. rød, når rådgiveren bygger sin egen streng", () => {
    expect(sammeFunktion(hb.replace("invitationsLink(token)", "`https://app.theboardroom.dk/auth?mode=signup&invite=${token}`"), kunde, lib)).toBe(false);
  });
  it("1. rød, når kunden bygger sin egen streng", () => {
    expect(sammeFunktion(hb, kunde.replace("invitationsLink(inv.token)", "`https://app.theboardroom.dk/auth?mode=signup&invite=${inv.token}`"), lib)).toBe(false);
  });
  it("1. rød, når linkformen findes to steder i lib", () => {
    expect(sammeFunktion(hb, kunde, lib + '\nconst x = "mode=signup&invite=";\n')).toBe(false);
  });
  it("2. rød, når hentInvitationer ikke vælger token", () => {
    expect(tokenHentes(hook.replace("accepted_at, token", "accepted_at"), virksomhed)).toBe(false);
  });
  it("2. rød, når virksomhedssiden ikke vælger token", () => {
    expect(tokenHentes(hook, virksomhed.replace('"id, email, status, created_at, accepted_at, token"', '"id, email, status, created_at, accepted_at"'))).toBe(false);
  });
  it("3. rød, når knappen står uden kanKopiereLink", () => {
    expect(kunPending(hb.replace("{kanKopiereLink(inv) && (", "{true && ("), lib)).toBe(false);
  });
  it("3. rød, når kanKopiereLink ikke kræver pending", () => {
    expect(kunPending(hb, lib.replace('inv.status === "pending"', "true"))).toBe(false);
  });
  it("3. rød, når knappen står to steder", () => {
    expect(kunPending(hb + "\n<span>Kopiér link</span>", lib)).toBe(false);
  });
  it("4. rød uden fejlbesked ved clipboard-fejl", () => {
    expect(roligtSvar(hb.replace(/catch \{\s*toast\.error\("Linket kunne ikke kopieres"/, 'catch { void ("Linket kunne ikke kopieres"'))).toBe(false);
  });
  it("4. rød uden bekræftelsen", () => {
    expect(roligtSvar(hb.replace('toast.success("Linket er kopieret")', "void 0"))).toBe(false);
  });
});
