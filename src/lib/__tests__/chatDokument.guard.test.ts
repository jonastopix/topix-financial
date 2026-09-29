import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn for «#» i chatten, motoren og migrationen (29/9-2026). Tre domme,
 * hver bevist nedenfor på en kopi med fejlen indsat:
 *
 *   1. MIGRATIONEN: første linje «-- IKKE KØRT. DEPLOY:», kolonnen
 *      messages.indhold_json jsonb NULL, og CHECK (indhold_json IS NULL OR
 *      jsonb_typeof(indhold_json) = 'object').
 *   2. CONTENT UDLEDES AF DOKUMENTET: byggChatBesked bygger content af
 *      chatDokumentTilTekst(parseChatDokument(input)) — og en fil, der skriver
 *      til messages (insert/update/upsert) og nævner indhold_json, SKAL kalde byggChatBesked og må
 *      ALDRIG sætte `indhold_json:` selv (ellers kan content skrives frit ved
 *      siden af dokumentet og komme i utakt).
 *   3. PARSEREN GENBRUGES: chatDokument.ts kalder parseCommunityDokument og har
 *      ingen egen node-oversætter — Community's værn gælder, og Community's
 *      opførsel ændres ikke.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

const MIG = "supabase/migrations/20260929160000_messages_indhold_json.sql";
const MOTOR = "src/lib/chatDokument.ts";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const migrationenErRigtig = (sql: string): boolean => {
  const s = udenSql(sql).replace(/\s+/g, " ");
  return (
    sql.split("\n")[0].startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).") &&
    s.includes("ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS indhold_json jsonb NULL;") &&
    s.includes("CHECK (indhold_json IS NULL OR jsonb_typeof(indhold_json) = 'object');")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const contentUdledesIMotoren = (motor: string): boolean => {
  const m = udenKommentarer(motor);
  const i = m.indexOf("export function byggChatBesked(");
  const krop = i === -1 ? "" : m.slice(i);
  return (
    krop.includes("const tekst = chatDokumentTilTekst(parseChatDokument(input));") &&
    krop.includes("return { content: tekstTilContent(tekst), indhold_json: input as Record<string, unknown> };") &&
    (m.match(/indhold_json:/g) ?? []).length === 2 // interfacet ChatBesked og byggChatBesked's return
  );
};

// En SKRIVER er en insert/update/upsert på messages — ikke en læsning. Forsiden
// (BoardroomView) læser tællinger fra messages og læser Community-trådens
// indhold_json; det er ikke en skriver (fundet 29/9, første kørsel af dommen).
const SKRIVER_TIL_MESSAGES = /from\(\s*(?:["']messages["']|messageTable(?:\s+as\s+any)?)\s*\)\s*\.(?:insert|update|upsert)\s*\(/;

/** Filer, der skriver til messages og nævner indhold_json, uden at gå gennem motoren. */
export const fremmedeSkrivere = (filer: ReadonlyMap<string, string>): string[] => {
  const ud: string[] = [];
  for (const [sti, raa] of filer) {
    const k = udenKommentarer(raa);
    if (!SKRIVER_TIL_MESSAGES.test(k) || !k.includes("indhold_json")) continue;
    if (!k.includes("byggChatBesked(") || /indhold_json\s*:/.test(k)) ud.push(sti);
  }
  return ud;
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const parserenGenbruges = (motor: string): boolean => {
  const m = udenKommentarer(motor);
  return (
    m.includes('import { parseCommunityDokument, type CommunityNode } from "@/lib/hjemmebane/communityDokument";') &&
    m.includes("return filtrer(parseCommunityDokument(input));") &&
    !/function oversaetNode|function hvidlistMarks|function sikkerHref/.test(m)
  );
};

const kildefiler = (): Map<string, string> => {
  const ud = new Map<string, string>();
  const gaa = (mappe: string) => {
    for (const navn of readdirSync(mappe)) {
      const sti = join(mappe, navn);
      if (statSync(sti).isDirectory()) {
        if (navn === "__tests__" || navn === "node_modules") continue;
        gaa(sti);
      } else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$|_test\.ts$/.test(navn) && sti !== MOTOR && !sti.endsWith("integrations/supabase/types.ts")) {
        ud.set(sti, readFileSync(sti, "utf8"));
      }
    }
  };
  gaa("src");
  gaa("supabase/functions");
  return ud;
};

describe("chatDokument.guard", () => {
  it("1. migrationen: IKKE KØRT, kolonnen og CHECK'en", () => expect(migrationenErRigtig(laes(MIG))).toBe(true));
  it("2a. motoren udleder content af dokumentet", () => expect(contentUdledesIMotoren(laes(MOTOR))).toBe(true));
  it("2b. ingen skriver til messages sætter indhold_json uden om motoren", () => expect(fremmedeSkrivere(kildefiler())).toEqual([]));
  it("3. parseren genbruges — ingen kopi af Community's oversætter", () => expect(parserenGenbruges(laes(MOTOR))).toBe(true));
});

describe("chatDokument.guard — dommene fælder på en kopi", () => {
  it("en migration uden CHECK, uden kolonnen eller uden IKKE KØRT-linjen, fælder dom 1", () => {
    const sql = laes(MIG);
    expect(migrationenErRigtig(sql.split("CHECK (indhold_json IS NULL OR jsonb_typeof(indhold_json) = 'object');").join("CHECK (true);"))).toBe(false);
    expect(migrationenErRigtig(sql.split("ADD COLUMN IF NOT EXISTS indhold_json jsonb NULL;").join("ADD COLUMN IF NOT EXISTS indhold_json text NULL;"))).toBe(false);
    expect(migrationenErRigtig(sql.split("\n").slice(1).join("\n"))).toBe(false);
  });

  it("content skrevet frit i motoren, eller et ekstra indhold_json-felt, fælder dom 2a", () => {
    const motor = laes(MOTOR);
    expect(contentUdledesIMotoren(motor.split("return { content: tekstTilContent(tekst), indhold_json: input as Record<string, unknown> };").join("return { content: String((input as any).tekst ?? \"\"), indhold_json: input as Record<string, unknown> };"))).toBe(false);
    expect(contentUdledesIMotoren(motor.split("const tekst = chatDokumentTilTekst(parseChatDokument(input));").join("const tekst = \"x\";"))).toBe(false);
    expect(contentUdledesIMotoren(motor.split("export interface ChatBesked {").join("export const ekstra = { indhold_json: null };\nexport interface ChatBesked {"))).toBe(false);
  });

  it("en skriver, der sætter indhold_json selv — eller nævner det uden motoren — fælder dom 2b", () => {
    const frit = new Map([["src/components/X.tsx", 'await supabase.from("messages").insert({ content: tekst, indhold_json: doc });']]);
    expect(fremmedeSkrivere(frit)).toEqual(["src/components/X.tsx"]);
    const medMotorMenFrit = new Map([["src/components/X.tsx", 'const b = byggChatBesked(doc); await supabase.from("messages").insert({ ...b, indhold_json: andet });']]);
    expect(fremmedeSkrivere(medMotorMenFrit)).toEqual(["src/components/X.tsx"]);
    const udenMotor = new Map([["supabase/functions/y/index.ts", 'admin.from("messages").update({ content }); // indhold_json\nconst k = row.indhold_json;']]);
    expect(fremmedeSkrivere(udenMotor)).toEqual(["supabase/functions/y/index.ts"]);
    const rigtig = new Map([["src/components/X.tsx", 'const b = byggChatBesked(doc);\nif (b) await supabase.from("messages").insert({ conversation_id, sender_id, ...b }); // læser row.indhold_json ved visning']]);
    expect(fremmedeSkrivere(rigtig)).toEqual([]);
    // En LÆSER, der også nævner et andet indhold_json (forsidens mønster), er ikke en skriver.
    const laeser = new Map([["src/components/F.tsx", 'await supabase.from("messages").select("*", { count: "exact", head: true });\nconst sti = foersteBilledsti(traad.indhold_json);']]);
    expect(fremmedeSkrivere(laeser)).toEqual([]);
    // Redigeringens form (from(messageTable as any)\n  .update(…)) er en skriver.
    const redigering = new Map([["src/hooks/R.ts", 'await supabase\n  .from(messageTable as any)\n  .update({ content: trimmed, indhold_json: doc })']]);
    expect(fremmedeSkrivere(redigering)).toEqual(["src/hooks/R.ts"]);
  });

  it("en kopieret parser, eller en motor uden Community-parseren, fælder dom 3", () => {
    const motor = laes(MOTOR);
    expect(parserenGenbruges(motor.split("return filtrer(parseCommunityDokument(input));").join("return filtrer(egenParser(input));"))).toBe(false);
    expect(parserenGenbruges(motor + "\nfunction oversaetNode() { return null; }\n")).toBe(false);
  });
});
