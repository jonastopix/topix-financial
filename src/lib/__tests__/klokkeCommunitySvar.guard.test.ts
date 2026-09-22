import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (udkast 21/9-2026): rådgivernes klokke ved et SVAR i Community —
// klokkeCommunity.guard-mønstret, dom for dom, på notify-community-svar:
//   1. Functionen importerer skrivRaadgiverBesked og beskedVedSvar (den rene dom)
//      og kalder writeren KUN gennem dommen: `const besked = beskedVedSvar({…})`
//      med forfatterErRaadgiver, og `if (besked)` før kaldet. Ét writer-kald.
//   2. Klokken står EFTER writeNotification (medlemmets række, URØRT) og FØR
//      svaret `return jsonResponse({ notificeret: indsat })` — i try/catch med
//      console.error, så den aldrig koster medlemmets notifikation eller svaret.
//   3. Rollen slås op i user_roles på advisor/admin for SVARETS forfatter;
//      reference_id er TRÅDENS id (linket går til tråden).
//   4. Medlemmets notifikation er urørt: samme writeNotification-kald med samme
//      felter som før (type community_svar, priority info, dedup pr. svar) —
//      kun gatet af egetSvar, ikke fjernet.
//   5. ÉN ULÆST KLOKKE PR. TRÅD PR. RÅDGIVER (Jonas 21/9): writeren kaldes med
//      { dedupKunUlaeste: true }; raadgiverBesked.ts læser read_at med i dedup-
//      opslaget og giver `valg.dedupKunUlaeste === true` videre til den rene dom
//      raadgivereUdenRaekke, som KUN springer læste rækker over under flaget —
//      og ingen anden kalder i supabase/functions bruger indstillingen.
// «VÆRNET VIRKER» kører dommene på kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const SVAR = "supabase/functions/notify-community-svar/index.ts";
const REN = "supabase/functions/_shared/communitySvarBesked.ts";
const IMPORT_WRITER = 'import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";';
const IMPORT_DOM = 'import { beskedVedSvar } from "../_shared/communitySvarBesked.ts";';
const KALD_WRITER = "await skrivRaadgiverBesked(adminClient, besked, { dedupKunUlaeste: true })";
const WRITER = "supabase/functions/_shared/raadgiverBesked.ts";
const KALD_MEDLEM = "const indsat = egetSvar ? false : await writeNotification(adminClient, {";
const SVARET = "return jsonResponse({ notificeret: indsat });";

export function klokkeBlok(kilde: string): string {
  const medlem = kilde.indexOf(KALD_MEDLEM);
  if (medlem === -1) throw new Error("fandt ikke writeNotification-kaldet");
  const start = kilde.indexOf("try {", medlem);
  const slut = kilde.indexOf(SVARET, medlem);
  if (start === -1 || slut === -1 || start > slut) return "";
  return kilde.slice(start, slut);
}

export const kalderGennemDommen = (kilde: string): boolean => {
  const blok = klokkeBlok(kilde);
  return kilde.includes(IMPORT_WRITER) && kilde.includes(IMPORT_DOM) &&
    blok.includes("const besked = beskedVedSvar({") && blok.includes("forfatterErRaadgiver,") &&
    blok.includes("if (besked) {") && blok.indexOf("if (besked) {") < blok.indexOf(KALD_WRITER) &&
    (kilde.match(/skrivRaadgiverBesked\(/g) ?? []).length === 1;
};

export const efterMedlemmetITryCatch = (kilde: string): boolean => {
  const medlem = kilde.indexOf(KALD_MEDLEM), writer = kilde.indexOf(KALD_WRITER), svar = kilde.indexOf(SVARET);
  if (medlem === -1 || writer === -1 || svar === -1) return false;
  if (!(medlem < writer && writer < svar)) return false;
  const blok = klokkeBlok(kilde);
  return blok.startsWith("try {") && /\}\s*catch \(err\) \{[\s\S]*console\.error\(/.test(blok) && blok.includes(KALD_WRITER);
};

export const rollenOgTraaden = (kilde: string, ren: string): boolean => {
  const blok = klokkeBlok(kilde);
  const r = udenKommentarer(ren);
  // Rolle-opslaget som ÉN sammenhængende kæde — company_members-opslaget bruger samme .eq, så et løst includes ville dømme tavst grønt.
  return /\.from\("user_roles"\)\s*\.select\("role"\)\s*\.eq\("user_id", svar\.forfatter_id\)\s*\.in\("role", \["advisor", "admin"\]\)/.test(blok) &&
    blok.includes("const forfatterErRaadgiver = (roller ?? []).length > 0;") &&
    blok.includes("traadId: traad.id,") && blok.includes("forfatterId: svar.forfatter_id,") &&
    r.includes("reference_id: traadId,") && r.includes('reference_type: REFERENCE_COMMUNITY_TRAAD,') && r.includes('export const REFERENCE_COMMUNITY_TRAAD = "community_traad";');
};

export const medlemmetsRaekkeErUroert = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  const i = k.indexOf(KALD_MEDLEM);
  const kald = i === -1 ? "" : k.slice(i, k.indexOf("});", i));
  return kald.includes("user_id: traad.forfatter_id,") && kald.includes('type: "community_svar",') && kald.includes('priority: "info",') &&
    kald.includes('title: "Nyt svar på dit opslag",') && kald.includes("dedup_key: `community_svar:${svarId}`,") &&
    k.includes("const egetSvar = traad.forfatter_id === svar.forfatter_id;");
};

export function alleFunktionsfiler(rod = "supabase/functions"): { sti: string; kilde: string }[] {
  const ud: { sti: string; kilde: string }[] = [];
  const gaa = (dir: string) => {
    for (const navn of readdirSync(resolve(ROD, dir)).sort()) {
      const sti = `${dir}/${navn}`;
      if (statSync(resolve(ROD, sti)).isDirectory()) gaa(sti);
      else if (navn.endsWith(".ts")) ud.push({ sti, kilde: laes(sti) });
    }
  };
  gaa(rod);
  return ud;
}

const TEKST = "supabase/functions/_shared/raadgiverBeskedTekst.ts";
export const dedupKunUlaesteErAfgraenset = (writer: string, tekst: string, filer: readonly { sti: string; kilde: string }[]): boolean => {
  const w = udenKommentarer(writer), t = udenKommentarer(tekst);
  const brugere = filer.filter(({ kilde }) => udenKommentarer(kilde).includes("dedupKunUlaeste")).map((f) => f.sti).sort();
  return w.includes("valg: SkrivValg = {},") &&
    w.includes('.select("advisor_id, reference_id, title, read_at")') &&
    w.includes("raadgivereUdenRaekke(raadgivere, (eksisterende ?? []) as EksisterendeRaekke[], besked, valg.dedupKunUlaeste === true)") &&
    !/\.is\("read_at"/.test(w) &&
    t.includes("kunUlaeste = false,") && t.includes("if (kunUlaeste && r.read_at) continue;") &&
    brugere.length === 2 && brugere[0].endsWith("_shared/raadgiverBesked.ts") && brugere[1] === SVAR;
};

describe("klokkeCommunitySvar.guard — rådgivernes klokke ved et svar", () => {
  const svar = udenKommentarer(laes(SVAR));
  it("1. writeren kaldes kun gennem beskedVedSvar og `if (besked)`", () => expect(kalderGennemDommen(svar)).toBe(true));
  it("2. klokken står efter medlemmets række og før svaret, i try/catch med console.error — svaret er uændret", () => {
    expect(efterMedlemmetITryCatch(svar)).toBe(true);
    expect((svar.match(/return jsonResponse\(\{ notificeret: indsat \}\);/g) ?? []).length).toBe(1);
  });
  it("3. rollen slås op for svarets forfatter; reference_id er trådens id", () => expect(rollenOgTraaden(svar, laes(REN))).toBe(true));
  it("4. medlemmets notifikation er urørt (samme felter, kun gatet af egetSvar)", () => expect(medlemmetsRaekkeErUroert(svar)).toBe(true));
  it("5. dedupKunUlaeste: writeren lægger kun read_at IS NULL på under indstillingen; kun notify-community-svar bruger den", () => {
    expect(dedupKunUlaesteErAfgraenset(laes(WRITER), laes(TEKST), alleFunktionsfiler())).toBe(true);
  });
  it("den rene fil er ren: kun opslagsMail-importen; kun notify-community-svar importerer den", () => {
    const ren = udenKommentarer(laes(REN));
    expect(ren.match(/^import .*$/gm) ?? []).toEqual(['import { visningsnavn } from "./opslagsMail.ts";']);
    expect(svar).toContain(IMPORT_DOM);
  });
});

describe("klokkeCommunitySvar.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const svar = udenKommentarer(laes(SVAR));
  it("1. uden dommen, uden `if (besked)`, eller et writer-kald nr. to, fælder dom 1", () => {
    expect(kalderGennemDommen(svar.replace("if (besked) {", "if (true) {"))).toBe(false);
    expect(kalderGennemDommen(svar.replace("forfatterErRaadgiver,", "forfatterErRaadgiver: false,"))).toBe(false);
    expect(kalderGennemDommen(svar + "\nawait skrivRaadgiverBesked(adminClient, besked);\n")).toBe(false);
  });
  it("2. klokken FØR medlemmets række, eller uden catch, fælder dom 2", () => {
    const blok = klokkeBlok(svar);
    const foer = svar.replace(blok, "").replace(KALD_MEDLEM, blok + KALD_MEDLEM);
    expect(efterMedlemmetITryCatch(foer)).toBe(false);
    expect(efterMedlemmetITryCatch(svar.replace('console.error("[notify-community-svar] klokken ringede ikke —"', "void("))).toBe(false);
  });
  it("3. rollen for TRÅDENS forfatter i stedet for svarets, eller reference_id = svarets id, fælder dom 3", () => {
    expect(rollenOgTraaden(svar.replace('.eq("user_id", svar.forfatter_id)', '.eq("user_id", traad.forfatter_id)'), laes(REN))).toBe(false);
    expect(rollenOgTraaden(svar, laes(REN).replace("reference_id: traadId,", "reference_id: svarId,"))).toBe(false);
  });
  it("5. read_at-filtret uden indstillingen (alle kaldere ændret), eller en kalder mere, fælder dom 5", () => {
    const w = laes(WRITER), t = laes(TEKST), filer = alleFunktionsfiler();
    // Flaget hårdkodet sandt (alle kaldere ændret) — eller den rene dom uden filtret.
    expect(dedupKunUlaesteErAfgraenset(w.replace("besked, valg.dedupKunUlaeste === true)", "besked, true)"), t, filer)).toBe(false);
    expect(dedupKunUlaesteErAfgraenset(w, t.replace("if (kunUlaeste && r.read_at) continue;", ""), filer)).toBe(false);
    expect(dedupKunUlaesteErAfgraenset(w, t, [...filer, { sti: "supabase/functions/x/index.ts", kilde: "await skrivRaadgiverBesked(admin, b, { dedupKunUlaeste: true });" }])).toBe(false);
    expect(kalderGennemDommen(svar.replace(", { dedupKunUlaeste: true })", ")"))).toBe(false);
  });
  it("4. medlemmets række ændret (priority, dedup) eller fjernet fælder dom 4", () => {
    expect(medlemmetsRaekkeErUroert(svar.replace('priority: "info",', 'priority: "important",'))).toBe(false);
    expect(medlemmetsRaekkeErUroert(svar.replace("dedup_key: `community_svar:${svarId}`,", ""))).toBe(false);
  });
});
