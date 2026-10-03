// a29-vedhaeftning-slettes-ikke (3/10-2026): en slettet besked tager sine egne filer med.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { vedhaeftningerAtSlette } from "../chatVedhaeftningSletning";

const MIG = "11111111-1111-4111-8111-111111111111";
const ANDEN = "22222222-2222-4222-8222-222222222222";

describe("vedhaeftningerAtSlette", () => {
  it("tager begge former i afsenderens mappe, hver sti én gang", () => {
    const meta = {
      attachments: [
        { path: `${MIG}/1-a.pdf` },
        { url: `https://x.supabase.co/storage/v1/object/public/chat-attachments/${MIG}/2-b.png` },
        { path: `${MIG}/1-a.pdf` }, // dublet
      ],
    };
    expect(vedhaeftningerAtSlette(meta, MIG)).toEqual([`${MIG}/1-a.pdf`, `${MIG}/2-b.png`]);
  });

  it("aldrig en andens fil, aldrig en sti der bryder ud af mappen", () => {
    const meta = { attachments: [{ path: `${ANDEN}/1-a.pdf` }, { path: `${MIG}/../${ANDEN}/x` }, { path: "/abs" }, { url: "https://andet.dk/f.pdf" }] };
    expect(vedhaeftningerAtSlette(meta, MIG)).toEqual([]);
  });

  it("intet at slette uden afsender, uden meta eller uden en liste", () => {
    expect(vedhaeftningerAtSlette({ attachments: [{ path: `${MIG}/1-a.pdf` }] }, undefined)).toEqual([]);
    expect(vedhaeftningerAtSlette(null, MIG)).toEqual([]);
    expect(vedhaeftningerAtSlette({ attachments: "x" }, MIG)).toEqual([]);
    expect(vedhaeftningerAtSlette({ video: { guid: "g" } }, MIG)).toEqual([]);
  });
});

// Kildeværn: filerne fjernes EFTER beskedens .delete(), kun gennem dommen, med kalderens egen id.
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
export const sletterVedhaeftningerEfter = (kilde: string): boolean => {
  const k = udenKommentarer(kilde);
  const fn = k.slice(k.indexOf("const deleteMessage = useCallback("), k.indexOf("const canEdit = useCallback("));
  const iDelete = fn.indexOf(".delete()");
  const iDom = fn.indexOf("const stier = vedhaeftningerAtSlette(contextMeta, currentUserId);");
  const iRemove = fn.indexOf('supabase.storage.from("chat-attachments").remove(stier)');
  // currentUserId i afhængighederne — ellers sletter et forældet callback med en gammel id.
  return iDelete > -1 && iDom > iDelete && iRemove > iDom && fn.includes("}, [messageTable, currentUserId]);");
};

describe("useMessageActions — vedhæftningerne følger med (kildeværn)", () => {
  const kilde = readFileSync(resolve(process.cwd(), "src/hooks/useMessageActions.ts"), "utf8");
  it("filerne fjernes efter beskeden, gennem dommen", () => expect(sletterVedhaeftningerEfter(kilde)).toBe(true));
  it("selvbevis: fjernet FØR beskeden, eller uden dommen, fælder", () => {
    const blok = 'const stier = vedhaeftningerAtSlette(contextMeta, currentUserId);\n    if (stier.length > 0) {\n      const { error: filFejl } = await supabase.storage.from("chat-attachments").remove(stier);\n      if (filFejl) console.warn("Vedhæftningerne kunne ikke slettes:", filFejl);\n    }';
    expect(kilde.includes(blok)).toBe(true);
    const foer = kilde.replace(blok, "").replace("    const { error } = await supabase\n      .from(messageTable as any)\n      .delete()", blok + "\n    const { error } = await supabase\n      .from(messageTable as any)\n      .delete()");
    expect(sletterVedhaeftningerEfter(foer)).toBe(false);
    expect(sletterVedhaeftningerEfter(kilde.replace("vedhaeftningerAtSlette(contextMeta, currentUserId)", "[]"))).toBe(false);
  });
});
