/**
 * Det underskrevne dokument som PDF — tekst + UNDERSKRIFTSSIDE bagerst
 * (Jonas 18/9, punkt 3): navn, tidspunkt (dansk tid + UTC-offset), aftryk
 * og revisionssporet i klartekst.
 *
 * HUSETS FØRSTE SERVERSIDE-PDF (målt 18/9, README §5): i dag laves PDF'er
 * kun i browseren (src/lib/exportPdf.ts: jspdf + html2canvas) og gemmes
 * aldrig. Kvitteringen skal sendes uden en browser, så dokumentet bygges
 * her med pdf-lib (ren JS, ingen native afhængigheder, kører i Deno via
 * npm:). Standard-fonten Helvetica er indbygget i enhver PDF-læser, så
 * filen er lille (6,6 KB for 5 sider, målt i underskriftPdf_test.ts) og ensartet.
 *
 * WINANSI: Helvetica i pdf-lib kan kun de tegn WinAnsi kender — æøå,
 * ÆØÅ, «», —, ’ og € er med; emoji og fx «→» er det ikke, og pdf-lib
 * KASTER på et ukendt tegn. tilWinAnsi() erstatter de få gængse med
 * ASCII og alt andet med «?», så dokumentet altid kan bygges. Selve
 * aftrykket regnes over TEKSTEN (ikke PDF'en), så en erstatning her ændrer
 * aldrig hvad der er underskrevet.
 *
 * Ombrydningen er ren (ombryd) og testes med en falsk målefunktion.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { formaterAftryk } from "./aftryk.ts";

export interface UnderskriftPdfInput {
  titel: string;
  /** Den fastfrosne, kanoniske tekst — linjeskift = nyt afsnit. */
  tekst: string;
  virksomhed: string;
  cvr: string | null;
  underskrevetNavn: string;
  /** Færdigformateret: «18. september 2026 kl. 14:03:12 (dansk tid, UTC+02:00)». */
  underskrevetTid: string;
  /** Samme tidspunkt som ISO/UTC — står ved siden af, så begge kan læses. */
  underskrevetIso: string;
  aftryk: string;
  modtagerEmail: string;
  ip: string | null;
  browser: string;
  /** Linjerne fra revisionsspor.sporTilLinjer. */
  sporLinjer: readonly string[];
}

const A4 = { bredde: 595.28, hoejde: 841.89 } as const;
const MARGEN = 56;
const BROED = 10.5;
const LINJE = 15;
const SMAA = 8.5;
const SMAA_LINJE = 12;

const ERSTATNINGER: Record<string, string> = {
  "→": "->", "←": "<-", "…": "...", " ": " ", " ": " ", "​": "",
  "–": "-", "−": "-", "‚": ",", "„": '"', "•": "-",
};

/** Kun tegn WinAnsi kender; resten erstattes. Pdf-lib kaster ellers. */
export function tilWinAnsi(s: string): string {
  let ud = "";
  for (const ch of s) {
    const kode = ch.codePointAt(0) ?? 0;
    if (kode === 0x0a) { ud += "\n"; continue; }
    if (kode >= 0x20 && kode <= 0x7e) { ud += ch; continue; }
    if (kode >= 0xa1 && kode <= 0xff) { ud += ch; continue; }
    if ("€‘’“”—‹›™˜ŠšŽžŒœŸƒˆ†‡‰".includes(ch)) { ud += ch; continue; }
    ud += ERSTATNINGER[ch] ?? "?";
  }
  return ud;
}

/**
 * Ombryder ét afsnit i linjer der passer i `maxBredde` ifølge `bredde`.
 * Et enkelt ord der er bredere end linjen brydes tegn for tegn, så intet
 * nogensinde løber ud over margenen. Tom streng → én tom linje (afsnitsskift).
 */
export function ombryd(afsnit: string, maxBredde: number, bredde: (s: string) => number): string[] {
  const ord = afsnit.split(/ +/).filter((o) => o.length > 0);
  if (ord.length === 0) return [""];
  const linjer: string[] = [];
  let aktuel = "";
  const skub = (o: string) => {
    if (bredde(o) <= maxBredde) { linjer.push(o); return; }
    let stump = "";
    for (const ch of o) {
      if (bredde(stump + ch) > maxBredde && stump) { linjer.push(stump); stump = ch; } else stump += ch;
    }
    if (stump) linjer.push(stump);
  };
  for (const o of ord) {
    const forsoeg = aktuel ? `${aktuel} ${o}` : o;
    if (bredde(forsoeg) <= maxBredde) { aktuel = forsoeg; continue; }
    if (aktuel) linjer.push(aktuel);
    aktuel = "";
    if (bredde(o) <= maxBredde) aktuel = o; else { skub(o); }
  }
  if (aktuel) linjer.push(aktuel);
  return linjer;
}

class Skriver {
  page: PDFPage;
  y: number;
  constructor(readonly doc: PDFDocument, readonly font: PDFFont, readonly fed: PDFFont) {
    this.page = doc.addPage([A4.bredde, A4.hoejde]);
    this.y = A4.hoejde - MARGEN;
  }
  nySide() {
    this.page = this.doc.addPage([A4.bredde, A4.hoejde]);
    this.y = A4.hoejde - MARGEN;
  }
  plads(hoejde: number) {
    if (this.y - hoejde < MARGEN + 24) this.nySide();
  }
  linje(tekst: string, o: { stoerrelse?: number; fed?: boolean; linje?: number; farve?: [number, number, number] } = {}) {
    const st = o.stoerrelse ?? BROED;
    const lh = o.linje ?? LINJE;
    this.plads(lh);
    this.page.drawText(tekst, {
      x: MARGEN, y: this.y - st, size: st, font: o.fed ? this.fed : this.font,
      color: o.farve ? rgb(...o.farve) : rgb(0.07, 0.2, 0.2),
    });
    this.y -= lh;
  }
  afsnit(tekst: string, o: { stoerrelse?: number; linje?: number; fed?: boolean } = {}) {
    const st = o.stoerrelse ?? BROED;
    const f = o.fed ? this.fed : this.font;
    const linjer = ombryd(tekst, A4.bredde - 2 * MARGEN, (s) => f.widthOfTextAtSize(s, st));
    for (const l of linjer) this.linje(l, { ...o });
  }
  mellemrum(px = LINJE / 2) { this.y -= px; }
  streg() {
    this.plads(10);
    this.page.drawLine({ start: { x: MARGEN, y: this.y - 4 }, end: { x: A4.bredde - MARGEN, y: this.y - 4 }, thickness: 0.6, color: rgb(0.6, 0.66, 0.65) });
    this.y -= 12;
  }
}

/** Bygger PDF'en. Svarer bytes; kaster kun hvis pdf-lib selv fejler. */
export async function bygUnderskrevetPdf(input: UnderskriftPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(tilWinAnsi(input.titel));
  doc.setSubject(`Underskrevet af ${tilWinAnsi(input.underskrevetNavn)} — aftryk ${input.aftryk}`);
  doc.setProducer("The Boardroom — egen e-underskrift");
  doc.setCreationDate(new Date(input.underskrevetIso));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fed = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = new Skriver(doc, font, fed);

  // ── Dokumentet ──
  s.linje(tilWinAnsi(input.titel), { stoerrelse: 16, fed: true, linje: 22 });
  s.linje(tilWinAnsi(`${input.virksomhed}${input.cvr ? ` · CVR ${input.cvr}` : ""}`), { stoerrelse: 10, farve: [0.3, 0.4, 0.39], linje: 16 });
  s.streg();
  for (const afsnit of tilWinAnsi(input.tekst).split("\n")) {
    if (afsnit.trim() === "") { s.mellemrum(); continue; }
    s.afsnit(afsnit);
  }

  // ── Underskriftssiden — ALTID en ny side bagerst ──
  s.nySide();
  s.linje("Underskrift", { stoerrelse: 16, fed: true, linje: 22 });
  s.linje("Dette dokument er underskrevet elektronisk gennem The Boardrooms egen underskriftsside.", { stoerrelse: 9.5, farve: [0.3, 0.4, 0.39] });
  s.streg();
  const felt = (navn: string, vaerdi: string) => {
    s.linje(navn, { stoerrelse: 8.5, fed: true, linje: 11, farve: [0.3, 0.4, 0.39] });
    s.afsnit(tilWinAnsi(vaerdi), { linje: 15 });
    s.mellemrum(4);
  };
  felt("Underskrevet af", input.underskrevetNavn);
  felt("Virksomhed", `${input.virksomhed}${input.cvr ? ` (CVR ${input.cvr})` : ""}`);
  felt("Tidspunkt", `${input.underskrevetTid} — ${input.underskrevetIso} (UTC)`);
  felt("Metode", "Navnet skrevet i feltet, krydset sat ved «Jeg har læst aftalegrundlaget og accepterer det», og en sekscifret engangskode tastet fra en mail sendt til " + input.modtagerEmail + ". Navnet og krydset er underskriften; koden beviser hvem; sporet nedenfor beviser hvornår.");
  felt("Dokumentets aftryk (SHA-256 over teksten)", formaterAftryk(input.aftryk));
  felt("Fra", `${input.ip ?? "IP ukendt"} · ${input.browser}`);
  s.streg();
  s.linje("Revisionsspor", { stoerrelse: 12, fed: true, linje: 18 });
  for (const l of input.sporLinjer) {
    s.afsnit(tilWinAnsi(l), { stoerrelse: SMAA, linje: SMAA_LINJE });
  }

  // ── Sidefod på alle sider, med sidetal (kendes først nu) ──
  const sider = doc.getPages();
  sider.forEach((p, i) => {
    p.drawText(tilWinAnsi(`${input.titel} · side ${i + 1} af ${sider.length} · aftryk ${input.aftryk.slice(0, 16)}…`), {
      x: MARGEN, y: MARGEN - 20, size: 7.5, font, color: rgb(0.5, 0.56, 0.55),
    });
  });

  return await doc.save();
}
