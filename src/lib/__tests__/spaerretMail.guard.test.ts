import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPAERRET_KLOKKE_LABELS } from "../../../supabase/functions/_shared/spaerretMail.ts";

// Kildeværn (16/9 2026): klokken når en mail om adgang eller penge er
// spærret hos Lovable. Tre steder skal holde — læst i kilden, fordi de tre
// funktioner rører Supabase og npm og ikke kan køres i vitest:
//   1. sendIndgangsMail (_shared/indgangsMailAfsendelse.ts) kalder
//      meldSpaerretMail i sin recipient_suppressed-gren, før return false.
//   2. stripe-webhooks kvitteringsgren (label LABEL_KVITTERING) gør det samme.
//   3. meldSpaerretMail (_shared/raadgiverBesked.ts) har try/catch og kaster
//      aldrig — klokken må ikke koste kalderens udfald.
// Plus: labellisten i motoren matcher kodens konstanter (fornyelsesMail.ts,
// indgangsBetalingsmail.ts) og cronens `indgang-dag${trin}`-form — og
//   4. KUN levende dag-labels: indgang-dag<N> i listen er PRÆCIS
//      PAAMINDELSESDAGE (betalingsfrist.ts), ikke en delmængde.
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører de
// samme domme på kopier med fejlen indsat (emailSendLogStatus.guard-mønstret).

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const AFSENDELSE = "supabase/functions/_shared/indgangsMailAfsendelse.ts";
const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";
const BESKED = "supabase/functions/_shared/raadgiverBesked.ts";

/** Kroppen for `export async function <navn>(` frem til første `}` i kolonne 0. */
export function funktionsBlok(kilde: string, navn: string): string {
  const start = kilde.indexOf(`export async function ${navn}(`);
  if (start === -1) throw new Error(`fandt ikke \`export async function ${navn}(\``);
  const slut = kilde.indexOf("\n}", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 2);
}

/** 1. sendIndgangsMailMedUdfald (kernen, 19/9 — før da hed den sendIndgangsMail):
    i `if (!resultat.sent) {`-grenen står et recipient_suppressed-tjek med
    meldSpaerretMail(…) FØR den returnerer det ikke-sendte udfald. Spærringen
    må ikke kunne falde ud, når indpakningen skiftes. */
export function sendIndgangsMailMelderSpaerret(kilde: string): boolean {
  const blok = funktionsBlok(udenKommentarer(kilde), "sendIndgangsMailMedUdfald");
  const gren = blok.indexOf("if (!resultat.sent) {");
  if (gren === -1) return false;
  const retur = blok.indexOf("return { sent: false", gren);
  if (retur === -1) return false;
  const grenTekst = blok.slice(gren, retur);
  return (
    grenTekst.includes('resultat.reason === "recipient_suppressed"') &&
    grenTekst.includes("await meldSpaerretMail(adminClient, { label, companyId, modtager: til })")
  );
}

/** 1b. Indpakningen (19/9): sendIndgangsMail returnerer STADIG boolean og går
    gennem kernen — de seks øvrige kaldere er uændrede, og ingen af dem kan
    komme uden om spærrings-klokken. */
export function indpakningenGaarGennemKernen(kilde: string): boolean {
  const blok = funktionsBlok(udenKommentarer(kilde), "sendIndgangsMail");
  return blok.includes("): Promise<boolean> {") && blok.includes("await sendIndgangsMailMedUdfald(args)");
}

/** 2. Kvitteringsgrenen: fra `label: LABEL_KVITTERING` til den næste `console.log(`
    står et recipient_suppressed-tjek med meldSpaerretMail på LABEL_KVITTERING. */
export function kvitteringsgrenMelderSpaerret(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const start = k.indexOf("label: LABEL_KVITTERING");
  if (start === -1) return false;
  const slut = k.indexOf("console.log(", start);
  const gren = k.slice(start, slut === -1 ? k.length : slut);
  return (
    gren.includes("if (!resultat.sent) {") &&
    gren.includes('resultat.reason === "recipient_suppressed"') &&
    gren.includes("await meldSpaerretMail(adminClient, { label: LABEL_KVITTERING, companyId: args.companyId, modtager: til })")
  );
}

/** PAAMINDELSESDAGE som tal, læst af betalingsfrist.ts' kilde. Kaster når linjen mangler. */
export function paamindelsesdageAf(fristKilde: string): number[] {
  const m = /export const PAAMINDELSESDAGE = \[([^\]]*)\] as const;/.exec(fristKilde);
  if (!m) throw new Error("betalingsfrist.ts: fandt ikke `export const PAAMINDELSESDAGE = [...] as const;`");
  return m[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
}

/** 4. LIGHED: mængden af indgang-dag<N>-labels i listen (N ≠ 0) er PRÆCIS
    PAAMINDELSESDAGE — hverken et dødt trin i listen eller et trin cronen
    sender uden label. */
export function dagLabelerErPaamindelsesdage(labels: readonly string[], fristKilde: string): boolean {
  const iListen = labels
    .map((l) => /^indgang-dag(\d+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => n !== 0)
    .sort((a, b) => a - b);
  const iKoden = [...paamindelsesdageAf(fristKilde)].sort((a, b) => a - b);
  return iListen.length === iKoden.length && iListen.every((n, i) => n === iKoden[i]);
}

/** 3. meldSpaerretMail: try/catch om det hele, intet throw, og skriver gennem skrivRaadgiverBesked. */
export function meldSpaerretMailKasterAldrig(kilde: string): boolean {
  const blok = funktionsBlok(udenKommentarer(kilde), "meldSpaerretMail");
  return (
    blok.includes("try {") &&
    /\}\s*catch\s*\(/.test(blok) &&
    !/\bthrow\b/.test(blok) &&
    blok.includes("await skrivRaadgiverBesked(admin, besked)") &&
    blok.includes("beskedVedSpaerretMail(")
  );
}

describe("spaerretMail.guard — klokken ringer i de to spærrings-grene", () => {
  const afsendelse = laes(AFSENDELSE);
  const webhook = laes(WEBHOOK);
  const besked = laes(BESKED);

  it("1. sendIndgangsMailMedUdfald kalder meldSpaerretMail i recipient_suppressed-grenen, før den returnerer udfaldet", () => {
    expect(sendIndgangsMailMelderSpaerret(afsendelse)).toBe(true);
  });

  it("1b. sendIndgangsMail er stadig boolean og går gennem kernen — ingen kalder ændres, ingen kommer uden om klokken", () => {
    expect(indpakningenGaarGennemKernen(afsendelse)).toBe(true);
    expect(funktionsBlok(afsendelse, "sendIndgangsMail")).toContain("): Promise<boolean> {");
  });

  it("2. stripe-webhooks kvitteringsgren kalder meldSpaerretMail på LABEL_KVITTERING", () => {
    expect(kvitteringsgrenMelderSpaerret(webhook)).toBe(true);
    expect(webhook).toContain("  meldSpaerretMail,\n"); // importeret fra raadgiverBesked.ts
  });

  it("3. meldSpaerretMail har try/catch og intet throw", () => {
    expect(meldSpaerretMailKasterAldrig(besked)).toBe(true);
  });

  it("labellisten matcher kodens konstanter: fornyelsesMail.ts, indgangsBetalingsmail.ts og cronens indgang-dag${trin}", () => {
    const fornyelse = laes("supabase/functions/_shared/fornyelsesMail.ts");
    for (const [konstant, label] of [
      ["LABEL_VARSEL_1", "fornyelse-varsel1"],
      ["LABEL_VARSEL_2", "fornyelse-varsel2"],
      ["LABEL_VINDUE_1", "fornyelse-vindue1"],
      ["LABEL_VINDUE_2", "fornyelse-vindue2"],
      ["LABEL_KVITTERING", "fornyelse-kvittering"],
    ]) {
      expect(fornyelse).toContain(`export const ${konstant} = "${label}";`);
      expect(SPAERRET_KLOKKE_LABELS).toContain(label);
    }
    expect(laes("supabase/functions/_shared/indgangsBetalingsmail.ts")).toContain('const LABEL_DAG0 = "indgang-dag0";');
    expect(laes("supabase/functions/indgangs-paamindelser-cron/index.ts")).toContain("label: `indgang-dag${trin}`");
    expect(laes("supabase/functions/send-invitation-email/index.ts")).toContain("label: 'invitation',");
  });

  it("4. kun levende dag-labels: indgang-dag<N> i listen er PRÆCIS PAAMINDELSESDAGE (betalingsfrist.ts)", () => {
    const frist = laes("supabase/functions/_shared/betalingsfrist.ts");
    expect(paamindelsesdageAf(frist)).toEqual([14, 25, 31]);
    expect(dagLabelerErPaamindelsesdage(SPAERRET_KLOKKE_LABELS, frist)).toBe(true);
  });

  it("VÆRNET VIRKER: kopier med fejlen indsat fanges (filerne er ikke rørt)", () => {
    // 1: kaldet fjernet fra kernen
    const kopiA = afsendelse.replace("await meldSpaerretMail(adminClient, { label, companyId, modtager: til });", "");
    expect(kopiA).not.toBe(afsendelse);
    expect(sendIndgangsMailMelderSpaerret(kopiA)).toBe(false);
    // 1b: kaldet flyttet EFTER returneringen af udfaldet (dødt kode) fanges også
    const RETUR_UDFALD = "    return { sent: false, reason: resultat.reason };";
    const SPAERRINGSGREN = "    if (resultat.reason === \"recipient_suppressed\") {\n      await meldSpaerretMail(adminClient, { label, companyId, modtager: til });\n    }\n";
    const kopiA2 = afsendelse.replace(SPAERRINGSGREN + RETUR_UDFALD, RETUR_UDFALD + "\n" + SPAERRINGSGREN);
    expect(kopiA2).not.toBe(afsendelse);
    expect(sendIndgangsMailMelderSpaerret(kopiA2)).toBe(false);
    // 1c: en indpakning der sender UDEN OM kernen (og dermed uden om klokken) fanges
    const kopiA3 = afsendelse.replace("await sendIndgangsMailMedUdfald(args)", "await sendManagedEmail(args as never)");
    expect(kopiA3).not.toBe(afsendelse);
    expect(indpakningenGaarGennemKernen(kopiA3)).toBe(false);
    // 2: kvitteringsgrenen uden kaldet
    const kopiB = webhook.replace("await meldSpaerretMail(adminClient, { label: LABEL_KVITTERING, companyId: args.companyId, modtager: til });", "");
    expect(kopiB).not.toBe(webhook);
    expect(kvitteringsgrenMelderSpaerret(kopiB)).toBe(false);
    // 3: et throw i meldSpaerretMail — og en udgave uden try
    const blok = funktionsBlok(udenKommentarer(besked), "meldSpaerretMail");
    const kopiC = besked.replace("console.error(`${log}: klokken ringede ikke —`", "throw new Error(`${log}: klokken ringede ikke —`");
    expect(kopiC).not.toBe(besked);
    expect(meldSpaerretMailKasterAldrig(kopiC)).toBe(false);
    const kopiD = besked.replace(blok, blok.replace("try {", "{"));
    expect(kopiD).not.toBe(besked);
    expect(meldSpaerretMailKasterAldrig(kopiD)).toBe(false);
    // 4a: en kopi af betalingsfrist.ts med et ekstra trin cronen ville sende uden label
    const frist = laes("supabase/functions/_shared/betalingsfrist.ts");
    const kopiFrist = frist.replace("export const PAAMINDELSESDAGE = [14, 25, 31] as const;", "export const PAAMINDELSESDAGE = [14, 21, 25, 31] as const;");
    expect(kopiFrist).not.toBe(frist);
    expect(paamindelsesdageAf(kopiFrist)).toEqual([14, 21, 25, 31]);
    expect(dagLabelerErPaamindelsesdage(SPAERRET_KLOKKE_LABELS, kopiFrist)).toBe(false);
    // 4b: en liste med et ekstra dødt trin
    expect(dagLabelerErPaamindelsesdage([...SPAERRET_KLOKKE_LABELS, "indgang-dag7"], frist)).toBe(false);
    // 4c: et trin for lidt i listen
    expect(dagLabelerErPaamindelsesdage(SPAERRET_KLOKKE_LABELS.filter((l) => l !== "indgang-dag25"), frist)).toBe(false);
    // 4d: dag0 tæller ikke med i sammenligningen (det er betalingsmailen, ikke en påmindelse)
    expect(dagLabelerErPaamindelsesdage(["indgang-dag0", "indgang-dag14", "indgang-dag25", "indgang-dag31"], frist)).toBe(true);
    // 4e: mangler linjen i betalingsfrist.ts, kastes der — aldrig en tavs sand
    expect(() => paamindelsesdageAf("export const X = 1;")).toThrow(/PAAMINDELSESDAGE/);
    // Og en tekst uden funktionen fanges, ikke overses.
    expect(() => funktionsBlok("", "sendIndgangsMail")).toThrow(/sendIndgangsMail/);
  });
});
