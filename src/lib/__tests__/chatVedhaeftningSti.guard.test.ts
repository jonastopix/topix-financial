import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for chattens vedhæftninger (29/9-2026, «ændring 5»,
 * ~/Downloads/recon-video-i-chatten.md §2). Tre domme, hver bevist nedenfor på
 * en kopi med fejlen indsat:
 *
 *   1. STIEN TILHØRER AFSENDEREN, FØR DER SIGNERES: get-chat-attachment-url
 *      importerer stiTilhoererAfsender fra _shared, læser sender_id i SAMME
 *      callerClient-opslag som context_meta, og kalder dommen FØR adminClient
 *      konstrueres og FØR createSignedUrl — og et nej er 403 uden signering.
 *   2. UPLOAD HAR MAPPETJEK: den NYESTE migration, der opretter «Authenticated
 *      users can upload chat attachments», droppede den gamle først og har
 *      (storage.foldername(name))[1] = auth.uid()::text i WITH CHECK — og dens
 *      første linje er bogført «-- KØRT i prod — 29/9-2026» med FØR = EFTER
 *      (vendt 29/9; var «-- IKKE KØRT. DEPLOY:», CLAUDE.md 19/9-lærdommen, indtil
 *      migrationen var kørt — mappetjekket fandtes allerede i prod, #1123).
 *   3. KLIENTEN UPLOADER I EGEN MAPPE: uploadChatAttachments bygger stien som
 *      `${userId}/…`. Det er præmissen for dom 1 og 2 — uden den ville en ægte
 *      vedhæftning blive afvist af begge.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const udenSql = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const FN = "supabase/functions/get-chat-attachment-url/index.ts";
const UPLOAD = "src/lib/chatAttachments.ts";
const MIG_DIR = "supabase/migrations";
const POLITIK = '"Authenticated users can upload chat attachments"';

// ── 1 ──────────────────────────────────────────────────────────────────────
export const stienTjekkesFoerSignering = (fn: string): boolean => {
  const f = udenKommentarer(fn);
  const TJEK = "if (!stiTilhoererAfsender(path, senderId)) {";
  const i = f.indexOf(TJEK);
  // Blokken slutter ved den lukkende klamme på egen linje — ikke ved første «}»,
  // som ellers ville være den i `${messageId}`.
  const slut = i === -1 ? -1 : f.indexOf("\n  }\n", i);
  const blok = i === -1 || slut === -1 ? "" : f.slice(i, slut);
  return (
    f.includes('import { stiTilhoererAfsender, vedhaeftningsSti } from "../_shared/chatVedhaeftningSti.ts";') &&
    f.includes('.select("id, sender_id, context_meta")') &&
    foer(f, "await callerClient", TJEK) &&
    f.includes("const senderId = (row as { sender_id?: unknown }).sender_id;") &&
    foer(f, TJEK, "const adminClient = createClient(") &&
    foer(f, TJEK, ".createSignedUrl(path") &&
    blok.includes('return jsonResponse({ error: "Forbidden" }, 403);') &&
    blok.includes("console.error(") &&
    blok.includes("${messageId}")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
/** Den nyeste migration, der opretter politikken — navn og indhold. */
export const nyestePolitikMigration = (filer: ReadonlyMap<string, string>): [string, string] | null => {
  const med = [...filer.entries()]
    .filter(([, sql]) => /CREATE POLICY\s+"Authenticated users can upload chat attachments"/i.test(udenSql(sql)))
    .sort(([a], [b]) => a.localeCompare(b));
  return med.length === 0 ? null : med[med.length - 1];
};

export const uploadHarMappetjek = (filer: ReadonlyMap<string, string>): boolean => {
  const n = nyestePolitikMigration(filer);
  if (!n) return false;
  const [, raa] = n;
  const sql = udenSql(raa).replace(/\s+/g, " ");
  return (
    raa.split("\n")[0].startsWith("-- KØRT i prod — 29/9-2026") &&
    raa.split("\n")[0].includes("FØR = EFTER") &&
    foer(sql, `DROP POLICY IF EXISTS ${POLITIK} ON storage.objects;`, `CREATE POLICY ${POLITIK}`) &&
    sql.includes(`CREATE POLICY ${POLITIK} ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);`)
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const klientenUploaderIEgenMappe = (upload: string): boolean => {
  const u = udenKommentarer(upload);
  return u.includes("const path = `${userId}/${ts}-${safeName}`;") && u.includes('.from("chat-attachments")') && u.includes(".upload(path, file,");
};

const migrationer = (): Map<string, string> => {
  const m = new Map<string, string>();
  for (const navn of readdirSync(resolve(process.cwd(), MIG_DIR))) if (navn.endsWith(".sql")) m.set(navn, laes(`${MIG_DIR}/${navn}`));
  return m;
};

describe("chatVedhaeftningSti.guard", () => {
  it("1. stien tjekkes mod afsenderen FØR adminClient og createSignedUrl — nej er 403", () => expect(stienTjekkesFoerSignering(laes(FN))).toBe(true));
  it("2. den nyeste upload-politik har mappetjekket, og migrationen er bogført KØRT (FØR = EFTER)", () => expect(uploadHarMappetjek(migrationer())).toBe(true));
  it("3. klienten uploader i sin egen mappe", () => expect(klientenUploaderIEgenMappe(laes(UPLOAD))).toBe(true));
});

describe("chatVedhaeftningSti.guard — dommene fælder på en kopi", () => {
  const fn = laes(FN);
  it("tjekket fjernet, flyttet efter signeringen, sender_id ikke læst, eller et nej der signerer alligevel, fælder dom 1", () => {
    expect(stienTjekkesFoerSignering(fn.split("  if (!stiTilhoererAfsender(path, senderId)) {").join("  if (false) {"))).toBe(false);
    expect(stienTjekkesFoerSignering(fn.split('.select("id, sender_id, context_meta")').join('.select("id, context_meta")'))).toBe(false);
    const blokStart = fn.indexOf("  const senderId = (row as");
    const blokSlut = fn.indexOf("  // ── 7.");
    const blok = fn.slice(blokStart, blokSlut);
    const flyttet = fn.slice(0, blokStart) + fn.slice(blokSlut).split("  const expiresAt = ").join(`${blok}  const expiresAt = `);
    expect(stienTjekkesFoerSignering(flyttet)).toBe(false);
    expect(stienTjekkesFoerSignering(fn.split('    return jsonResponse({ error: "Forbidden" }, 403);\n  }\n\n  // ── 7.').join("  }\n\n  // ── 7."))).toBe(false);
  });

  it("en genskabt politik uden mappetjek, uden DROP først, uden KØRT-linjen eller tilbage på IKKE KØRT, fælder dom 2", () => {
    const m = migrationer();
    const [navn, sql] = nyestePolitikMigration(m)!;
    const uden = new Map(m); uden.set(navn, sql.split(" AND (storage.foldername(name))[1] = auth.uid()::text").join(""));
    expect(uploadHarMappetjek(uden)).toBe(false);
    const udenDrop = new Map(m); udenDrop.set(navn, sql.split('\nDROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;\n').join("\n"));
    expect(uploadHarMappetjek(udenDrop)).toBe(false);
    const udenHoved = new Map(m); udenHoved.set(navn, sql.split("\n").slice(1).join("\n"));
    expect(uploadHarMappetjek(udenHoved)).toBe(false);
    const tilbage = new Map(m); tilbage.set(navn, ["-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).", ...sql.split("\n").slice(1)].join("\n"));
    expect(uploadHarMappetjek(tilbage)).toBe(false);
    // En SENERE migration, der genskaber den gamle politik, vinder og fælder dommen.
    const senere = new Map(m); senere.set("20991231000000_tilbage.sql", `-- IKKE KØRT. DEPLOY: x\nCREATE POLICY "Authenticated users can upload chat attachments"\nON storage.objects FOR INSERT\nTO authenticated\nWITH CHECK (bucket_id = 'chat-attachments');\n`);
    expect(uploadHarMappetjek(senere)).toBe(false);
  });

  it("en klient, der uploader uden for egen mappe, fælder dom 3", () => {
    const upload = laes(UPLOAD);
    expect(klientenUploaderIEgenMappe(upload.split("const path = `${userId}/${ts}-${safeName}`;").join("const path = `delt/${ts}-${safeName}`;"))).toBe(false);
  });
});
