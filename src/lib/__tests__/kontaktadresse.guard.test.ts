import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dag0Mail, dag14Mail, dag25Mail, dag31Mail, KONTAKT_ADRESSE } from "../../../supabase/functions/_shared/indgangsMail.ts";
import { kvitteringMail } from "../../../supabase/functions/_shared/fornyelsesMail.ts";

// Kildeværn for kontaktadressen i indgangen (Jonas 14/9 2026):
// kontakt@theboardroom.dk. Mailene sendes fra noreply@theboardroom.dk, så
// «skriv til mig» og «svar på denne mail» lover et svar der forsvinder, og
// en personlig adresse (jonas@, morten@, @topix.dk, @molainvest.dk) er den
// forkerte. Målt 14/9 i _shared og indgangens/fornyelsens functions: to
// fund — dag 0-mailen (indgangsMail.ts) og fornyelsens kvittering
// (fornyelsesMail.ts). Samme form som invitationsMail.guard.test.ts.
//
// Adressen defineres ÉT sted, indgangsMail.ts, og deles derfra; derfor
// låses definitionen dér, brugen i fornyelsesMail.ts via konstanten, og
// den færdige mail (rendret) for begge — så «findes i begge» gælder det
// medlemmet får, ikke kun kildeteksten.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FILER = ["supabase/functions/_shared/indgangsMail.ts", "supabase/functions/_shared/fornyelsesMail.ts"];
const FORBUDT = [/\bskriv til mig\b/, /\bsvar på denne mail\b/, /jonas@/, /morten@/, /@topix\.dk/, /@molainvest\.dk/];
/** De tre gamle kontaktlinjer i dag 14/25/31 (set i drift 16/9 14:57) — lover svar uden en adresse. Kun for indgangsMail.ts. */
const FORBUDT_INDGANG = [/\bring eller skriv\b/, /\bkun en mail væk\b/, /\bså sig til\b/];

/** indgangsMail.ts bærer ingen af de tre gamle linjer, og dag 14/25/31 bruger ${KONTAKT_ADRESSE} — ikke en literal. */
export function paamindelserneBrugerAdressen(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  if (FORBUDT_INDGANG.some((f) => f.test(k))) return false;
  const i14 = k.indexOf("export function dag14Mail(");
  const i25 = k.indexOf("export function dag25Mail(");
  const i31 = k.indexOf("export function dag31Mail(");
  const iRaadgiver = k.indexOf("export function raadgiverManglerPrisMail(");
  if ([i14, i25, i31, iRaadgiver].some((i) => i === -1) || !(i14 < i25 && i25 < i31 && i31 < iRaadgiver)) return false;
  const blokke = [k.slice(i14, i25), k.slice(i25, i31), k.slice(i31, iRaadgiver)];
  return blokke.every((b) => b.includes("skriv til ${KONTAKT_ADRESSE}")) && !k.includes("skriv til kontakt@theboardroom.dk");
}

describe("kontaktadresse.guard — dag 0 og fornyelsens kvittering lover ikke svar fra noreply", () => {
  it("ingen af de seks forbudte former står i nogen af de to filer", () => {
    for (const sti of FILER) {
      const kode = udenKommentarer(laes(sti));
      for (const f of FORBUDT) expect(kode, `${sti}: ${f}`).not.toMatch(f);
    }
  });

  it("adressen er defineret ét sted, indgangsMail.ts, og fornyelsesMail.ts bruger konstanten", () => {
    expect(KONTAKT_ADRESSE).toBe("kontakt@theboardroom.dk");
    expect(udenKommentarer(laes(FILER[0]))).toContain('export const KONTAKT_ADRESSE = "kontakt@theboardroom.dk";');
    const fornyelse = udenKommentarer(laes(FILER[1]));
    expect(fornyelse).toMatch(/import \{[^}]*\bKONTAKT_ADRESSE\b[^}]*\} from "\.\/indgangsMail\.ts";/);
    expect(fornyelse).toContain("${KONTAKT_ADRESSE}");
    // Ingen anden fil i _shared definerer adressen igen (invitationsMail.ts re-eksporterer den).
    expect(udenKommentarer(laes("supabase/functions/_shared/invitationsMail.ts"))).not.toMatch(/const KONTAKT_ADRESSE\s*=/);
  });

  it("de færdige mails bærer kontakt@theboardroom.dk — alle fem (dag 0, 14, 25, 31 og fornyelsens kvittering)", () => {
    const betalingsUrl = "https://app.theboardroom.dk/betal?token=x";
    const dag0 = dag0Mail({ fornavn: "Gry", betalingsUrl, fristDato: "14. oktober 2026", beloebKr: 40000 });
    const dag14 = dag14Mail({ fornavn: "Gry", betalingsUrl });
    const dag25 = dag25Mail({ fornavn: "Gry", betalingsUrl, fristDato: "14. oktober 2026", beloebKr: 40000 });
    const dag31 = dag31Mail({ fornavn: "Gry", beloebKr: 40000, fakturaTotalOere: 5_000_000, momsBeregnet: true });
    const kvittering = kvitteringMail({ fornavn: "Gry", virksomhed: "Nordic By Hand", nySlutDato: "14. september 2027", betalingsmodel: "fuld", samletOere: 2_000_000 });
    for (const m of [dag0, dag14, dag25, dag31, kvittering]) {
      expect(m.html).toContain("skriv til kontakt@theboardroom.dk");
      for (const f of FORBUDT) expect(m.html).not.toMatch(f);
    }
    expect(dag0.html).toContain("så skriv til kontakt@theboardroom.dk — så finder vi ud af det.");
    // Jonas 16/9 — de tre påmindelser, ordret; ingen «ring» (der er intet nummer).
    expect(dag14.html).toContain("Har du spørgsmål, så skriv til kontakt@theboardroom.dk — så finder vi ud af det.");
    expect(dag25.html).toContain("Er der noget i vejen, så skriv til kontakt@theboardroom.dk. Jeg vil hellere høre fra dig end sende en faktura.");
    expect(dag31.html).toContain("Er der noget vi skal tale om, så skriv til kontakt@theboardroom.dk. Vi tager den gerne.");
    expect(dag31.html).not.toMatch(/\bring\b/);
    for (const m of [dag14, dag25, dag31]) for (const f of FORBUDT_INDGANG) expect(m.html).not.toMatch(f);
    expect(kvittering.html).toContain("Har du spørgsmål til fornyelsen, så skriv til kontakt@theboardroom.dk.");
  });

  it("indgangsMail.ts: ingen af de tre gamle linjer, og dag 14/25/31 bruger konstanten — ikke en literal", () => {
    expect(paamindelserneBrugerAdressen(laes(FILER[0]))).toBe(true);
  });
});

describe("kontaktadresse.guard — VÆRNET VIRKER (dommen på kopier med de gamle linjer sat ind)", () => {
  const k = laes(FILER[0]);
  it("den gamle dag 14-linje sat ind igen → falsk", () => {
    const kopi = k.replace("`Har du spørgsmål, så skriv til ${KONTAKT_ADRESSE} — så finder vi ud af det.`", '"Har du spørgsmål, er jeg kun en mail væk."');
    expect(kopi).not.toBe(k);
    expect(paamindelserneBrugerAdressen(kopi)).toBe(false);
  });
  it("den gamle dag 31-linje («ring eller skriv») sat ind igen → falsk", () => {
    const kopi = k.replace("`Er der noget vi skal tale om, så skriv til ${KONTAKT_ADRESSE}. Vi tager den gerne.`", '"Er der noget vi skal tale om, så ring eller skriv. Vi tager den gerne."');
    expect(kopi).not.toBe(k);
    expect(paamindelserneBrugerAdressen(kopi)).toBe(false);
  });
  it("«så sig til» i dag 25 igen → falsk", () => {
    const kopi = k.replace("så skriv til ${KONTAKT_ADRESSE}. Jeg vil", "så sig til. Jeg vil");
    expect(kopi).not.toBe(k);
    expect(paamindelserneBrugerAdressen(kopi)).toBe(false);
  });
  it("adressen som literal i stedet for konstanten → falsk", () => {
    const kopi = k.replace("skriv til ${KONTAKT_ADRESSE} — så finder", "skriv til kontakt@theboardroom.dk — så finder");
    expect(kopi).not.toBe(k);
    expect(paamindelserneBrugerAdressen(kopi)).toBe(false);
  });
});
