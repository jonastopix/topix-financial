import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { TRAPPER } from "@/lib/rykkerkoe";

// Kildeværn for Jonas' gennemlæsning af rykkermailene (18/9-2026):
//   1. managedEmail.ts har et VALGFRIT replyTo, som kun sendes når det er sat —
//      og KUN ansøgningskøens cron sætter det. Alle andre afsendere er uberørte.
//   2. Sidste rykker om samtalen siger «inden tre dage» (rykker dag 11, luk dag 14).
//   3. Indkaldt-trappen er dag 2, 7, 11 med tre rykkere — dag 4 er væk.
// Kildelæsning (cvrKilde.guard-mønstret); hver dom beviser sig selv på en kopi.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const MANAGED = "supabase/functions/_shared/managedEmail.ts";
const CRON = "supabase/functions/ansoegning-rykker-cron/index.ts";
const MAILS = "supabase/functions/_shared/ansoegningRykkerMails.ts";

/** Alle .ts-filer under supabase/functions der kalder sendManagedEmail( — målt, ikke listet. */
export function afsendere(rod = resolve(ROD, "supabase/functions")): string[] {
  const ud: string[] = [];
  const gaa = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) gaa(p);
      else if (n.endsWith(".ts") && !n.endsWith("_test.ts") && readFileSync(p, "utf8").includes("sendManagedEmail(")) ud.push(p.slice(resolve(ROD).length + 1));
    }
  };
  gaa(rod);
  return ud.sort();
}

// ── Dommene ──────────────────────────────────────────────────────────────

/** Feltet er valgfrit (`replyTo?: string`) — aldrig påkrævet. */
export const replyToErValgfrit = (k: string): boolean => /replyTo\?: string;/.test(k) && !/replyTo: string;/.test(k);

/** Nøglen reply_to sendes KUN når feltet er sat — ellers ikke engang nøglen. */
export const replyToKunNaarSat = (k: string): boolean =>
  k.includes("...(args.replyTo ? { reply_to: args.replyTo } : {})") && (k.match(/reply_to/g) ?? []).length === 1;

/**
 * ÉN afsender sætter replyTo — motoren (19/9, prøven pkt. 8): kvitteringen straks OG køens
 * fælles afsendelse sendKoeMail, som cronen og «straks» begge går igennem. Cronen sender ikke
 * længere selv. Begge steder KONTAKT_ADRESSE.
 */
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
export function kunCronenSaetterReplyTo(filer: string[], laeser: (f: string) => string): { kun: boolean; hvem: string[] } {
  const hvem = filer.filter((f) => f !== MANAGED && /\breplyTo\s*:/.test(udenKommentarer(laeser(f)))).sort();
  return { kun: hvem.length === 1 && hvem[0] === MOTOR, hvem };
}
/** Cronen sender gennem motoren — ingen egen sendManagedEmail, ingen egen svaradresse. */
export const cronenSenderGennemMotoren = (cron: string): boolean =>
  cron.includes("await sendKoeMail(admin, raekke, a, nu, { venteplads: ventepladsKontekst, vej: \"koe\" })") && !/sendManagedEmail\(|replyTo/.test(cron);
export const motorenBrugerKontaktadressen = (motor: string): boolean =>
  (motor.match(/replyTo: KONTAKT_ADRESSE/g) ?? []).length === 2 && motor.includes('import { KONTAKT_ADRESSE } from "./indgangsMail.ts";');

/** «Svar på denne mail» må kun stå i mails, når svaradressen er sat (parret med replyTo). */
export const svarPaaMailenFindes = (mails: string): number => (mails.match(/svar på (denne mail|mailen)/gi) ?? []).length;

/** Sidste rykker om samtalen: «inden tre dage», ikke «et par dage». */
export function sidsteRykkerSigerTreDage(mails: string): boolean {
  const fra = mails.indexOf('"ansoegning-indkaldt-rykker-3"');
  const til = mails.indexOf('"ansoegning-samtale-i-morgen"');
  if (fra < 0 || til < fra) return false;
  const blok = mails.slice(fra, til);
  return blok.includes("inden tre dage") && !blok.includes("et par dage");
}

/** Trappen: dag 0 + rykkere dag 2, 7, 11 + luk dag 14 — ingen rykker-4, ingen dag 4. */
export const trappenErTreRykkere = (t: readonly { dag: number; handling: string; skabelon: string | null }[]): boolean =>
  t.map((x) => x.dag).join(",") === "0,2,7,11,14" && t.filter((x) => x.handling === "send_mail").length === 4 && !t.some((x) => x.skabelon === "ansoegning-indkaldt-rykker-4");

// ── Værnet ───────────────────────────────────────────────────────────────

describe("ansoegningRykkerRettelser.guard — svaradressen er valgfri og kun køens", () => {
  const managed = udenKommentarer(laes(MANAGED));
  it("replyTo er valgfrit og sendes kun når det er sat", () => {
    expect(replyToErValgfrit(managed)).toBe(true);
    expect(replyToKunNaarSat(managed)).toBe(true);
  });
  it("præcis én afsender sætter replyTo — motoren (kvitteringen straks + køens sendKoeMail) — med KONTAKT_ADRESSE; cronen sender gennem motoren; de øvrige er uberørte", () => {
    const alle = afsendere();
    expect(alle.length).toBeGreaterThanOrEqual(12); // huset har mange afsendere — er tallet lavere, er målingen brudt
    const r = kunCronenSaetterReplyTo(alle, laes);
    expect(r.hvem).toEqual([MOTOR]);
    expect(r.kun).toBe(true);
    expect(cronenSenderGennemMotoren(udenKommentarer(laes(CRON)))).toBe(true);
    expect(motorenBrugerKontaktadressen(udenKommentarer(laes(MOTOR)))).toBe(true);
  });
  it("VÆRNET VIRKER: en cron der sender selv → falsk; motoren med kun én svaradresse → falsk", () => {
    expect(cronenSenderGennemMotoren(udenKommentarer(laes(CRON)) + "\nawait sendManagedEmail({});")).toBe(false);
    expect(motorenBrugerKontaktadressen(udenKommentarer(laes(MOTOR)).replace("replyTo: KONTAKT_ADRESSE", "replyTo: undefined"))).toBe(false);
  });
  it("«svar på denne mail» står i to mails (aftalegrundlagets rykkere) — og kun fordi svaradressen er sat; tider-mailen beder ikke om svar (Jonas 18/9, anden runde: «Det foregår KUN på linket»)", () => {
    expect(svarPaaMailenFindes(udenKommentarer(laes(MAILS)))).toBe(2);
  });
});

describe("ansoegningRykkerRettelser.guard — trappen og teksten", () => {
  it("sidste rykker om samtalen siger «inden tre dage»", () => {
    expect(sidsteRykkerSigerTreDage(udenKommentarer(laes(MAILS)))).toBe(true);
  });
  it("indkaldt-trappen er dag 2, 7, 11 (tre rykkere), luk dag 14", () => {
    expect(trappenErTreRykkere(TRAPPER.indkaldt)).toBe(true);
  });
});

describe("ansoegningRykkerRettelser.guard — VÆRNET VIRKER: kopier med fejlen indsat fanges", () => {
  const managed = udenKommentarer(laes(MANAGED));
  const cron = udenKommentarer(laes(CRON));
  const mails = udenKommentarer(laes(MAILS));

  it("replyTo påkrævet → falsk; reply_to sendt altid → falsk", () => {
    expect(replyToErValgfrit(managed.replace("replyTo?: string;", "replyTo: string;"))).toBe(false);
    expect(replyToKunNaarSat(managed.replace("...(args.replyTo ? { reply_to: args.replyTo } : {})", "reply_to: args.replyTo"))).toBe(false);
  });
  it("en anden afsender sætter replyTo → fanges; cronen bruger en anden adresse → falsk", () => {
    const laeser = (f: string) => (f === "supabase/functions/send-pulse-reminder/index.ts" ? laes(f) + "\nx({ replyTo: 'a@b.dk' });\n" : laes(f));
    const r = kunCronenSaetterReplyTo(afsendere(), laeser);
    expect(r.kun).toBe(false);
    expect(r.hvem).toContain("supabase/functions/send-pulse-reminder/index.ts");
    expect(cronenSenderGennemMotoren(cron.replace('vej: "koe" })', 'vej: "koe" }); await sendManagedEmail({ replyTo: "jonas@topix.dk" })'))).toBe(false);
  });
  it("«et par dage» tilbage i sidste rykker → falsk; en fjerde rykker igen → falsk", () => {
    expect(sidsteRykkerSigerTreDage(mails.replace("inden tre dage", "inden for et par dage"))).toBe(false);
    expect(trappenErTreRykkere([...TRAPPER.indkaldt.slice(0, 2), { dag: 4, handling: "send_mail", skabelon: "ansoegning-indkaldt-rykker-2" }, ...TRAPPER.indkaldt.slice(2)])).toBe(false);
  });
});
