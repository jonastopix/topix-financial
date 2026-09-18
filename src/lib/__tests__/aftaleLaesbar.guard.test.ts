import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Jonas' prøve 18/9 aften: aftalen skal kunne læses — på /aftale (det de skriver under på), i forhåndsvisningen,
// i PDF'en; e-underskriften også i folden; «Åbn» som en rigtig knap; mailknappen brækker ikke.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const AFTALE = "src/pages/Aftale.tsx";
const SEND = "src/components/hjemmebane/virksomhed/SendTilUnderskrift.tsx";
const DOKUMENT = "src/components/hjemmebane/AftaleDokument.tsx";
const PDF = "supabase/functions/_shared/underskriftPdf.ts";
const LISTE = "src/components/hjemmebane/ansoegninger/AnsoegningslisteView.tsx";
const KNAP = "supabase/functions/_shared/emailButtonHelpers.ts";
const MAIL = "supabase/functions/_shared/underskriftMail.ts";

export const sidenOgForhaandsvisningenDelerDokumentet = (aftale: string, send: string, dok: string): boolean =>
  aftale.includes("<AftaleDokument tekst={tekst} />") && send.includes("<AftaleDokument tekst={dom.tekst} />") &&
  !aftale.includes("dangerouslySetInnerHTML") && !send.includes("dangerouslySetInnerHTML") && !dok.includes("dangerouslySetInnerHTML") &&
  dok.includes("parseAftaleTekst(tekst)") && !/tekst\.split\("\\n"\)\.map/.test(aftale);
export const pdfenTegnerStruktur = (k: string): boolean =>
  k.includes('import { erHeltFed, parseAftaleTekst, spansTilTekst } from "./aftaleMarkdown.ts";') &&
  k.includes("for (const blok of parseAftaleTekst(tilWinAnsi(input.tekst)))") && !/for \(const afsnit of tilWinAnsi\(input\.tekst\)\.split/.test(k) &&
  k.includes('blok.slags === "overskrift"') && k.includes("fed: erHeltFed(blok.spans)");
export const foldenHarUnderskriften = (k: string): boolean =>
  /\(a\.trin === "afholdt" \|\| a\.trin === "aftalegrundlag_sendt"\) && !erPaaPause\(a\.paa_pause_til, new Date\(\)\) && \([\s\S]{0,300}<SendTilUnderskrift ansoegningId=\{a\.id\}/.test(k) &&
  k.includes("data-underskrift-i-folden");
export const aabnErEnKnap = (k: string): boolean =>
  /<Link to=\{`\/ansoegninger\/\$\{a\.id\}`\} className=\{cn\(hbButtonVariants\(\{ variant: "secondary" \}\)/.test(k) && k.includes("data-aabn-ansoegning") && k.includes("Åbn ansøgningen");
export const mailknappenBraekkerIkke = (knap: string, mail: string): boolean =>
  knap.includes("white-space:nowrap;padding:0 22px;box-sizing:border-box;min-width:${") && !/text-decoration:none;width:\$\{/.test(knap) &&
  /tekst: "Hent det underskrevne dokument", url: a\.url \},\s*knapBredde: 300/.test(mail);

describe("aftaleLaesbar.guard", () => {
  it("/aftale og forhåndsvisningen viser det samme dokument gennem AftaleDokument — ingen HTML fra data", () =>
    expect(sidenOgForhaandsvisningenDelerDokumentet(udenKommentarer(laes(AFTALE)), udenKommentarer(laes(SEND)), udenKommentarer(laes(DOKUMENT)))).toBe(true));
  it("PDF'en tegner blokke: overskrifter fede, hel-fede linjer fede, lister med punkttegn", () => expect(pdfenTegnerStruktur(udenKommentarer(laes(PDF)))).toBe(true));
  it("e-underskriften står i folden efter samtalen og ved gensendelse, ikke på pause", () => expect(foldenHarUnderskriften(udenKommentarer(laes(LISTE)))).toBe(true));
  it("«Åbn ansøgningen» er en rigtig knap", () => expect(aabnErEnKnap(udenKommentarer(laes(LISTE)))).toBe(true));
  it("mailknappen: bredden følger teksten, teksten brydes ikke; kvitteringens knap 300 px i Outlook", () => expect(mailknappenBraekkerIkke(udenKommentarer(laes(KNAP)), udenKommentarer(laes(MAIL)))).toBe(true));
  it("VÆRNET VIRKER", () => {
    const aftale = udenKommentarer(laes(AFTALE)); const send = udenKommentarer(laes(SEND)); const dok = udenKommentarer(laes(DOKUMENT));
    expect(sidenOgForhaandsvisningenDelerDokumentet(aftale.replace("<AftaleDokument tekst={tekst} />", "<pre>{tekst}</pre>"), send, dok)).toBe(false);
    expect(sidenOgForhaandsvisningenDelerDokumentet(aftale, send, dok + "\n<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(false);
    expect(pdfenTegnerStruktur(udenKommentarer(laes(PDF)).replace("fed: erHeltFed(blok.spans)", "fed: false"))).toBe(false);
    expect(foldenHarUnderskriften(udenKommentarer(laes(LISTE)).replace(" && !erPaaPause(a.paa_pause_til, new Date())", ""))).toBe(false);
    expect(aabnErEnKnap(udenKommentarer(laes(LISTE)).replace("data-aabn-ansoegning", "data-x"))).toBe(false);
    expect(mailknappenBraekkerIkke(udenKommentarer(laes(KNAP)).replace("white-space:nowrap;", ""), udenKommentarer(laes(MAIL)))).toBe(false);
  });
});
