import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LUKKEAARSAGER } from "@/lib/ansoegningTrin";
import { bygRykkerMail, type MailKontekst } from "../../../supabase/functions/_shared/ansoegningRykkerMails.ts";

/**
 * Kildeværn for «Giv afslag» / «Luk uden svar» (Jonas 21/9-2026). Syv domme, hver bevist på en
 * kopi med fejlen indsat:
 *   1. Linjen om mail udledes: ordene «de får en mail nu» og «ingen mail» står ÉT sted
 *      (ansoegningHandlinger.ts, konstanterne bag foelgeLinje) og aldrig i dialogkomponenten,
 *      som kalder foelgeLinje. Ingen dialog siger «i sendevinduet».
 *   2. Forklaringerne ved afvis/afslag/luk og ordene for grunde og årsager nævner ikke mail —
 *      så det eneste, der siges om mail, er det udledte.
 *   3. Forhåndsvisningen er mailens: dialogen kalder afslagsMailTekst/grundTekst/koeNummerForNy
 *      og bærer ingen egen afslagstekst; mailbyggeren kalder den samme funktion; teksten bor i
 *      afslagsTilbud.ts (begge spejle).
 *   4. ansoegning-handling afviser luk med «andet» uden begrundelse (400) FØR overgangen.
 *   5. Migrationen: IKKE KØRT, drop if exists, den fulde liste = LUKKEAARSAGER (også betalte_ikke),
 *      FØR-SQL med pg_get_constraintdef.
 *   6. De forældede kommentarer «andet giver ingen mail» er væk (handling, ansoegningTrin ×2, rykkerkoe ×2).
 *   7. «Kom ikke»-forklaringen lover ikke «vælg en ny tid» — den citerer rykker 1's faktiske emne.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const HANDLINGER = "src/lib/ansoegninger/ansoegningHandlinger.ts";
const DIALOG = "src/components/hjemmebane/ansoegninger/AnsoegningHandlinger.tsx";
const VISNING = "src/lib/ansoegninger/ansoegningVisning.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";
const DOM_SRC = "src/lib/afslagsTilbud.ts";
const DOM_DENO = "supabase/functions/_shared/afslagsTilbud.ts";
const HANDLING_FN = "supabase/functions/ansoegning-handling/index.ts";
const MIGRATION = "supabase/migrations/20260921170000_ansoegning_lukkeaarsag_gensidigt.sql";
const FORAELDEDE = [HANDLING_FN, "supabase/functions/_shared/ansoegningTrin.ts", "src/lib/ansoegningTrin.ts", "supabase/functions/_shared/rykkerkoe.ts", "src/lib/rykkerkoe.ts"];

const tael = (k: string, s: string) => k.split(s).length - 1;

// ── 1 ──────────────────────────────────────────────────────────────────────
export const linjenErUdledt = (handlinger: string, dialog: string): boolean => {
  const h = udenKommentarer(handlinger);
  const d = udenKommentarer(dialog);
  return tael(h, '"de får en mail nu"') === 1 && tael(h, '"ingen mail"') === 1 &&
    h.includes("export function foelgeLinje(") &&
    !/ingen mail\b|de får en mail|i sendevinduet/i.test(d) &&
    d.includes("foelgeLinje(") && d.includes('data-foelge-linje="dialog"');
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const forklaringerneNaevnerIkkeMail = (handlinger: string, visning: string): boolean => {
  const h = udenKommentarer(handlinger);
  for (const art of ["afvis", "afslag", "luk"]) {
    const m = h.match(new RegExp(`\\n\\s*${art}: \\{[^\\n]*forklaring: "([^"]*)"`));
    if (!m || /mail/i.test(m[1])) return false;
  }
  const ord = h.slice(h.indexOf("export const AFSLAGSGRUND_ORD"), h.indexOf("};", h.indexOf("export const AFSLAGSGRUND_ORD")));
  const aarsager = udenKommentarer(visning).slice(udenKommentarer(visning).indexOf("export const LUKKEAARSAG_ORD"));
  const aarsagBlok = aarsager.slice(0, aarsager.indexOf("};"));
  return ord.length > 0 && !/mail/i.test(ord) && aarsagBlok.length > 0 && !/mail/i.test(aarsagBlok);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const forhaandsvisningenErMailens = (dialog: string, mails: string, domSrc: string, domDeno: string): boolean => {
  const d = udenKommentarer(dialog), m = udenKommentarer(mails);
  const bygger = m.slice(m.indexOf('BYGGERE["ansoegning-afslag"]'));
  return d.includes("afslagsMailTekst({") && d.includes("grundTekst(grund)") && d.includes("koeNummerForNy(") &&
    !/Vi må sige nej|Tak for din ansøgning|tak for snakken/.test(d) &&
    bygger.includes("afslagsMailTekst({") && !/Vi må sige nej|tak for snakken/.test(m) &&
    [domSrc, domDeno].every((k) => udenKommentarer(k).includes("Vi må sige nej denne gang") && udenKommentarer(k).includes("koeSaetningTilAnsoeger(a.ventepladser)"));
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const handlingenAfviserAndetUdenBegrundelse = (h: string): boolean => {
  const k = udenKommentarer(h);
  const tjek = 'if (handling?.art === "luk" && !erLukBegrundelseGyldig(handling.aarsag, begrundelse)) {';
  return k.includes(tjek) && /erLukBegrundelseGyldig\(handling\.aarsag, begrundelse\)\) \{[\s\S]{0,300}\}, 400\);/.test(k) &&
    foer(k, tjek, "const res = await udfoerOvergang(admin, {") &&
    k.includes("erLukBegrundelseGyldig,") && k.includes('from "../_shared/ansoegningTrin.ts"');
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const migrationenErRigtig = (sql: string, aarsager: readonly string[]): boolean => {
  const k = udenSqlKommentarer(sql);
  const m = k.match(/ansoegninger_lukkeaarsag_check\s*check\s*\(\s*lukkeaarsag is null or lukkeaarsag in \(([^)]*)\)/);
  if (!m) return false;
  const db = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  return sql.startsWith("-- IKKE KØRT. DEPLOY:") &&
    k.includes("drop constraint if exists ansoegninger_lukkeaarsag_check") &&
    aarsager.every((a) => db.includes(a)) && db.every((a) => aarsager.includes(a)) &&
    db.includes("gensidigt_ikke_match") && db.includes("betalte_ikke") &&
    sql.includes("pg_get_constraintdef(oid)") && !/security definer/i.test(sql);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const ingenForaeldedeKommentarer = (filer: readonly string[]): boolean =>
  filer.every((k) => !/andet» giver ingen mail|andet giver ingen mail/.test(k));

// ── 7 ──────────────────────────────────────────────────────────────────────
export const komIkkeForklaringenErRykkerEns = (handlinger: string, rykker1Emne: string): boolean => {
  const m = udenKommentarer(handlinger).match(/\n\s*ikke_moedt: \{[^\n]*forklaring: "([^"]*)"/);
  return !!m && !/vælg en ny tid/i.test(m[1]) && m[1].includes(`«${rykker1Emne}»`) && /rykkerne dag 2, 7 og 11/.test(m[1]) && /dag 14/.test(m[1]);
};

const K: MailKontekst = { fornavn: "Lisbeth", virksomhedsnavn: "X", bookingUrl: "https://c", statusUrl: "https://s", ikkeNuUrl: "https://i", samtaleStart: null, aftaleUrl: null, token: "t", manglerSvar: null };

describe("afslagLuk.guard — de syv domme på repoets filer", () => {
  it("1. linjen om mail udledes ét sted, og dialogen siger aldrig «i sendevinduet»", () => expect(linjenErUdledt(laes(HANDLINGER), laes(DIALOG))).toBe(true));
  it("2. forklaringer og ord nævner ikke mail", () => expect(forklaringerneNaevnerIkkeMail(laes(HANDLINGER), laes(VISNING))).toBe(true));
  it("3. forhåndsvisningen er mailens — samme funktion, teksten i afslagsTilbud (begge spejle)", () => expect(forhaandsvisningenErMailens(laes(DIALOG), laes(MAILS), laes(DOM_SRC), laes(DOM_DENO))).toBe(true));
  it("4. ansoegning-handling afviser «andet» uden begrundelse med 400 før overgangen", () => expect(handlingenAfviserAndetUdenBegrundelse(laes(HANDLING_FN))).toBe(true));
  it("5. migrationen: IKKE KØRT, drop if exists, den fulde liste = LUKKEAARSAGER, FØR-SQL", () => expect(migrationenErRigtig(laes(MIGRATION), LUKKEAARSAGER)).toBe(true));
  it("6. de forældede kommentarer er væk", () => expect(ingenForaeldedeKommentarer(FORAELDEDE.map(laes))).toBe(true));
  it("7. «Kom ikke» citerer rykker 1's emne og lover ikke «vælg en ny tid»", () => {
    const emne = bygRykkerMail("ansoegning-indkaldt-rykker-1", K)!.emne;
    expect(emne).toBe("Har du fundet et tidspunkt til vores snak?");
    expect(komIkkeForklaringenErRykkerEns(laes(HANDLINGER), emne)).toBe(true);
  });
});

describe("afslagLuk.guard — dommene fanger fejlen på en kopi", () => {
  it("1. et hardkodet «ingen mail» i dialogen, eller «i sendevinduet», eller linjen uden foelgeLinje fælder dom 1", () => {
    const h = laes(HANDLINGER), d = laes(DIALOG);
    expect(linjenErUdledt(h, d + '\nconst x = "ingen mail — afslaget skriver I selv";')).toBe(false);
    expect(linjenErUdledt(h, d + '\nconst y = "Afslagsmailen sendes i sendevinduet";')).toBe(false);
    expect(linjenErUdledt(h + '\nexport const Z = "ingen mail";', d)).toBe(false);
    expect(linjenErUdledt(h, d.replace(/foelgeLinje\(/g, "tekst("))).toBe(false);
  });
  it("2. ordet mail i en forklaring eller i et grundord fælder dom 2", () => {
    const h = laes(HANDLINGER), v = laes(VISNING);
    expect(forklaringerneNaevnerIkkeMail(h.replace('forklaring: "Lukkes med den valgte årsag;', 'forklaring: "Ingen mail. Lukkes med den valgte årsag;'), v)).toBe(false);
    expect(forklaringerneNaevnerIkkeMail(h.replace('andet: "Ikke det rigtige lige nu",', 'andet: "Ikke det rigtige lige nu (ingen mail)",'), v)).toBe(false);
    expect(forklaringerneNaevnerIkkeMail(h, v.replace('gensidigt_ikke_match: "gensidigt ikke et match",', 'gensidigt_ikke_match: "gensidigt ikke et match — mail",'))).toBe(false);
  });
  it("3. en egen afslagstekst i dialogen, eller en mailbygger uden den fælles funktion, fælder dom 3", () => {
    const d = laes(DIALOG), m = laes(MAILS), s = laes(DOM_SRC), n = laes(DOM_DENO);
    expect(forhaandsvisningenErMailens(d + '\nconst t = "Vi må sige nej denne gang.";', m, s, n)).toBe(false);
    expect(forhaandsvisningenErMailens(d, m.replace("afslagsMailTekst({", "egenTekst({"), s, n)).toBe(false);
    expect(forhaandsvisningenErMailens(d.replace("grundTekst(grund)", '"Nej."'), m, s, n)).toBe(false);
  });
  it("4. tjekket fjernet, eller lagt EFTER overgangen, fælder dom 4", () => {
    const h = laes(HANDLING_FN);
    const tjek = 'if (handling?.art === "luk" && !erLukBegrundelseGyldig(handling.aarsag, begrundelse)) {';
    expect(handlingenAfviserAndetUdenBegrundelse(h.replace(tjek, "if (false) {"))).toBe(false);
    const i = h.indexOf(tjek), j = h.indexOf("\n", h.indexOf("}, 400);", i)) + 1;
    const blok = h.slice(i, j);
    expect(handlingenAfviserAndetUdenBegrundelse(h.replace(blok, "").replace("console.log(`[ansoegning-handling] ${handling.art}", blok + "\n  console.log(`[ansoegning-handling] ${handling.art}"))).toBe(false);
  });
  it("5. en liste uden betalte_ikke, uden drop if exists, eller uden IKKE KØRT fælder dom 5", () => {
    const sql = laes(MIGRATION);
    expect(migrationenErRigtig(sql.replace("'gensidigt_ikke_match', 'andet', 'betalte_ikke'))", "'gensidigt_ikke_match', 'andet'))"), LUKKEAARSAGER)).toBe(false);
    // Alle forekomster — rollback-kommentaren i filhovedet bærer også sætningen, og den tæller ikke.
    expect(migrationenErRigtig(sql.replace(/drop constraint if exists ansoegninger_lukkeaarsag_check/g, "drop constraint ansoegninger_lukkeaarsag_check"), LUKKEAARSAGER)).toBe(false);
    expect(migrationenErRigtig(sql.replace("-- IKKE KØRT. DEPLOY:", "-- KØRT. DEPLOY:"), LUKKEAARSAGER)).toBe(false);
    expect(migrationenErRigtig(sql, [...LUKKEAARSAGER, "spoegelse"])).toBe(false);
  });
  it("6. den gamle sætning tilbage i én fil fælder dom 6", () => {
    expect(ingenForaeldedeKommentarer([...FORAELDEDE.map(laes), "// «andet» giver ingen mail: Jonas skriver selv."])).toBe(false);
  });
  it("7. «vælg en ny tid» tilbage, eller et andet emne, fælder dom 7", () => {
    const h = laes(HANDLINGER);
    expect(komIkkeForklaringenErRykkerEns(h.replace("Ingen ny indkaldelse sendes.", "Rykker 1 bærer «vælg en ny tid»."), "Har du fundet et tidspunkt til vores snak?")).toBe(false);
    expect(komIkkeForklaringenErRykkerEns(h, "Et andet emne")).toBe(false);
  });
});
