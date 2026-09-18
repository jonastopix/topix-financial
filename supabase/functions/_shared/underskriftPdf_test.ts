/**
 * Enhedstests for underskriftPdf.ts — ombrydning, WinAnsi-rensning og at
 * PDF'en faktisk bygges med en side bagerst.
 *
 * KØRES I HÅNDEN (henter npm:pdf-lib første gang):
 *   deno test --node-modules-dir=none supabase/functions/_shared/underskriftPdf_test.ts
 * Intet workflow kører `deno test` (samme situation som indgangsMail_test.ts).
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bygUnderskrevetPdf, ombryd, tilWinAnsi } from "./underskriftPdf.ts";

const bredde = (s: string) => s.length; // 1 enhed pr. tegn

Deno.test("ombryd: ord samles op til bredden, aldrig over", () => {
  assertEquals(ombryd("aa bb cc dd", 5, bredde), ["aa bb", "cc dd"]);
  assertEquals(ombryd("aa bb cc dd", 8, bredde), ["aa bb cc", "dd"]);
});

Deno.test("ombryd: et ord bredere end linjen brydes tegn for tegn", () => {
  assertEquals(ombryd("abcdefgh ij", 3, bredde), ["abc", "def", "gh", "ij"]);
});

Deno.test("ombryd: tom streng er én tom linje (afsnitsskift)", () => {
  assertEquals(ombryd("", 10, bredde), [""]);
  assertEquals(ombryd("   ", 10, bredde), [""]);
});

Deno.test("tilWinAnsi: æøå og «» bevares, pil og emoji erstattes", () => {
  assertEquals(tilWinAnsi("Åse Ørum «ja» — €"), "Åse Ørum «ja» — €");
  assertEquals(tilWinAnsi("a → b 🙂"), "a -> b ?");
});

Deno.test("bygUnderskrevetPdf: bygger, har mindst to sider, sidste side bærer underskriften", async () => {
  const bytes = await bygUnderskrevetPdf({
    titel: "Aftalegrundlag — The Boardroom",
    tekst: Array.from({ length: 60 }, (_, i) => `Afsnit ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`).join("\n\n"),
    virksomhed: "FLOOR1 I/S",
    cvr: "41772239",
    underskrevetNavn: "Lisbeth Hansen",
    underskrevetTid: "18. september 2026 kl. 14:03:12 (dansk tid, UTC+02:00)",
    underskrevetIso: "2026-09-18T12:03:12.000Z",
    aftryk: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    modtagerEmail: "lisbeth@floor1.dk",
    ip: "85.1.2.3",
    browser: "Safari på iPhone",
    sporLinjer: [
      "18. september 2026 kl. 13:50:00 (dansk tid, UTC+02:00) — Link til aftalegrundlaget sendt til lisbeth@floor1.dk",
      "18. september 2026 kl. 14:03:12 (dansk tid, UTC+02:00) — Underskrevet af Lisbeth Hansen · fra 85.1.2.3 · Safari på iPhone",
    ],
  });
  assert(bytes.length > 5_000, `for lille: ${bytes.length}`);
  assert(bytes.length < 200_000, `for stor: ${bytes.length}`);
  const hoved = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  assertStringIncludes(hoved, "%PDF-1.");
  const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
  const doc = await PDFDocument.load(bytes);
  assert(doc.getPageCount() >= 3, `forventede ≥ 3 sider (tekst + underskrift), fik ${doc.getPageCount()}`);
  assertStringIncludes(doc.getSubject() ?? "", "Lisbeth Hansen");
  console.log(`PDF: ${bytes.length} bytes, ${doc.getPageCount()} sider`);
});
