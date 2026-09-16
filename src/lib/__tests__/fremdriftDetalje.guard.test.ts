import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9): Fremdrift-fanens medlemsdetalje (ProgressView.tsx) skal
// dømme på detaljeTilstand — fejlgrenen står FØR tallet og listen, og tallet
// «N af M videoer gennemført» vises ikke uden at hentningerne er lykkedes
// («klar»). Målt 16/9 (vindue A): uden dette stod «0 af 0 videoer gennemført»
// når hentningen fejlede. Dommen selv testes i fremdriftDetalje.test.ts; her
// låses at fladen bruger den.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FIL = "src/components/hjemmebane/admin/views/ProgressView.tsx";

/** Medlemsdetaljens JSX: fra «Højre: valgt medlems fremdrift» til overblikket «Intet medlem valgt». */
export function detaljeUdsnit(kilde: string): string {
  const start = kilde.indexOf("const detail = selectedMember ? (");
  const slut = kilde.indexOf("<p className=\"text-xs font-medium uppercase tracking-[0.14em] text-hb-rust\">Svar pr. lektion</p>");
  if (start < 0 || slut < 0 || slut < start) throw new Error("ProgressView.tsx: fandt ikke medlemsdetaljen (detail = selectedMember ? … Svar pr. lektion)");
  return kilde.slice(start, slut);
}

/** Tallet vises kun ved «klar»: literalen «videoer gennemført» står i en `detalje.art === "klar" ? … : null`-gren. */
export function talletKunVedKlar(kilde: string): boolean {
  const k = udenKommentarer(detaljeUdsnit(kilde));
  const re = /detalje\.art === "klar"\s*\?\s*`\$\{doneCount\(selectedMember\.userId\)\} af \$\{trackedItems\.length\} videoer gennemført`\s*:\s*null/;
  const antal = (k.match(/videoer gennemført/g) ?? []).length;
  return antal === 1 && re.test(k);
}

/** Fejlgrenen (husets tekst, «listen») og henter-grenen står FØR listen med knapperne — og listen er ellers-grenen. */
export function fejlgrenFoerListen(kilde: string): boolean {
  const k = udenKommentarer(detaljeUdsnit(kilde));
  const fejl = k.indexOf('detalje.art === "fejl" ? (');
  const tekst = k.indexOf('raadgiverHentefejlTekst(detalje.error, "listen")');
  const henter = k.indexOf('detalje.art === "henter" ? (');
  const liste = k.indexOf("areaBlocks.map((block) =>");
  const knap = k.indexOf("Markér hele modulet");
  return fejl >= 0 && tekst > fejl && henter > tekst && liste > henter && knap > liste;
}

/** Dommen kommer fra den rene funktion med alle tre hentninger og antallet af publicerede lektioner. */
export function dommenErFremdriftDetalje(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  return (
    /import \{ detaljeTilstand \} from "@\/lib\/hjemmebane\/fremdriftDetalje";/.test(k) &&
    /const detalje = detaljeTilstand\(\{\s*lektioner: itemsQuery,\s*samlinger: collectionsQuery,\s*fremdrift: progressQuery,\s*publiceredeLektioner: publishedIds\.length,\s*\}\);/.test(k)
  );
}

describe("fremdriftDetalje.guard — medlemsdetaljen dømmer på detaljeTilstand", () => {
  const kilde = laes(FIL);

  it("dommen er fremdriftDetalje.detaljeTilstand med de tre hentninger", () => {
    expect(dommenErFremdriftDetalje(kilde)).toBe(true);
  });

  it("tallet «N af M videoer gennemført» vises kun ved «klar»", () => {
    expect(talletKunVedKlar(kilde)).toBe(true);
  });

  it("fejlgrenen (raadgiverHentefejlTekst, «listen») og «Henter…» står før listen og knapperne", () => {
    expect(fejlgrenFoerListen(kilde)).toBe(true);
    expect(udenKommentarer(detaljeUdsnit(kilde))).toContain(">Henter…</p>");
  });

  it("VÆRNET VIRKER: kopier uden dommen fejler (filen er ikke rørt)", () => {
    // tallet uden betingelse — som før 16/9
    const udenBetingelse = kilde.replace(
      'detalje.art === "klar" ? `${doneCount(selectedMember.userId)} af ${trackedItems.length} videoer gennemført` : null,',
      "`${doneCount(selectedMember.userId)} af ${trackedItems.length} videoer gennemført`,",
    );
    expect(udenBetingelse).not.toBe(kilde);
    expect(talletKunVedKlar(udenBetingelse)).toBe(false);
    // fejlgrenen fjernet
    const udenFejlgren = kilde.replace('detalje.art === "fejl" ? (', "false ? (");
    expect(udenFejlgren).not.toBe(kilde);
    expect(fejlgrenFoerListen(udenFejlgren)).toBe(false);
    // fejlteksten uden husets ord
    const udenTekst = kilde.replace('raadgiverHentefejlTekst(detalje.error, "listen")', '"Noget gik galt"');
    expect(fejlgrenFoerListen(udenTekst)).toBe(false);
    // dommen ikke fra den rene funktion
    const udenDom = kilde.replace("fremdrift: progressQuery,", "fremdrift: { isError: false, isSuccess: true },");
    expect(dommenErFremdriftDetalje(udenDom)).toBe(false);
    // et andet tal ved siden af (fx i en kommentar-fri kopi med tallet gentaget uden betingelse) fanges
    const toTal = kilde.replace("{error && <p", "{`${doneCount(selectedMember.userId)} af ${trackedItems.length} videoer gennemført`}{error && <p");
    expect(talletKunVedKlar(toTal)).toBe(false);
  });
});
