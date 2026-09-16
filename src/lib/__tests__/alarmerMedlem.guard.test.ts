import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9-2026, valg B — Jonas: «Der skal satme ikke sendes så meget.
// Og slet ikke for gamle rapporter.»). Fire ting læses i kilden, fordi
// detect-financial-alerts og skriveren rører Supabase:
//   1. Medlemmets alert_financial_summary skrives KUN inde i grenen der er
//      gated af skalMedlemsAlarm(period_key, nu) — ellers en loglinje med
//      perioden og den seneste afsluttede måned, og retur uden medlemsrække.
//   2. Medlemsrækken kan ikke nå mailkøen: den skrives med email_sent_at
//      sat (notificationWriter bærer feltet atomisk i samme INSERT), og
//      køen henter stadig kun .is("email_sent_at", null); vagten tæller
//      stadig kun email_sent_at IS NULL.
//   3. Rådgivergrenen er urørt: de tre rå alarmer, én pr. alarm pr.
//      rådgiver, uden email_sent_at, med samme dedup_key.
//   4. Prioriteten står (important/action_required), så klokkens pille
//      tæller rækken (erUset læser kun seen_at + priority).
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem på
// kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const DETECT = "supabase/functions/detect-financial-alerts/index.ts";
const WRITER = "supabase/functions/_shared/notificationWriter.ts";
const MAILKOE = "supabase/functions/send-notification-email/index.ts";
const VAGT = "supabase/migrations/20260910170000_vagtens_timeouts.sql";
const KLOKKE = "src/lib/hjemmebane/klokke.ts";

/** Medlemsgrenen: fra `if (!skalMedlemsAlarm(period_key, nu))` til slutningen af medlemsløkken. */
export function medlemsGren(kilde: string): string {
  const start = kilde.indexOf("if (!skalMedlemsAlarm(period_key, nu))");
  if (start === -1) return "";
  const slut = kilde.indexOf('dedup_key: `alert_financial_summary:${company_id}:${period_key}`,', start);
  if (slut === -1) return "";
  return kilde.slice(start, kilde.indexOf("});", slut) + 3);
}

/** Rådgivergrenen: fra `for (const alert of alerts) {` til `// B)`-grenens start (kommentarer strippet: til medlemsgrenens `const nu`). */
export function raadgiverGren(kilde: string): string {
  const start = kilde.indexOf("for (const alert of alerts) {");
  const slut = kilde.indexOf("const nu = new Date();", start);
  if (start === -1 || slut === -1) return "";
  return kilde.slice(start, slut);
}

/** Dom 1: medlemsrækken skrives kun bag skalMedlemsAlarm; den ubestemte gren returnerer uden at skrive. */
export const medlemsRaekkenErGated = (kilde: string): boolean => {
  const gren = medlemsGren(kilde);
  if (!gren) return false;
  const retur = gren.indexOf("return new Response(");
  const skriv = gren.indexOf('type: "alert_financial_summary"');
  return (
    kilde.includes('import { senesteAfsluttedeMaaned, skalMedlemsAlarm } from "../_shared/alarmPeriode.ts";') &&
    retur !== -1 && skriv !== -1 && retur < skriv &&
    gren.includes("senesteAfsluttedeMaaned(nu)") &&
    (kilde.match(/type: "alert_financial_summary"/g) ?? []).length === 1
  );
};

/** Dom 2: medlemsrækken bærer email_sent_at, skriveren tager feltet, køen og vagten filtrerer på det. */
export const medlemsRaekkenNaarIkkeKoeen = (detect: string, writer: string, koe: string, vagt: string): boolean => {
  const gren = medlemsGren(detect);
  return (
    gren.includes("email_sent_at: nu.toISOString(),") &&
    writer.includes("email_sent_at?: string;") &&
    writer.includes("...(payload.email_sent_at ? { email_sent_at: payload.email_sent_at } : {}),") &&
    koe.includes('.is("email_sent_at", null)') &&
    vagt.includes("WHERE n.email_sent_at IS NULL")
  );
};

/** Dom 3: rådgivergrenen ordret som før — tre rå alarmer, ingen email_sent_at, samme dedup. */
export const raadgiverGrenenErUroert = (kilde: string): boolean => {
  const gren = raadgiverGren(kilde);
  return (
    gren.includes("for (const advisorUserId of advisorUserIds) {") &&
    gren.includes("user_id: advisorUserId,") &&
    gren.includes("type: alert.type,") &&
    gren.includes("priority: alert.priority,") &&
    gren.includes("dedup_key: `${alert.type}:${company_id}:${alert.dedup_suffix}`,") &&
    !gren.includes("email_sent_at") &&
    !gren.includes("skalMedlemsAlarm")
  );
};

/** Dom 4: prioriteten er stadig summaryPriority (important/action_required) — pillen tæller. */
export const prioritetenStaar = (detect: string, klokke: string): boolean =>
  medlemsGren(detect).includes("priority: summaryPriority,") &&
  detect.includes('const summaryPriority: "important" | "action_required" = hasNegativeCash') &&
  klokke.includes('return !n.seen_at && (n.priority === "important" || n.priority === "action_required");');

describe("alarmerMedlem.guard — kun den seneste måned, kun i klokken", () => {
  const detect = udenKommentarer(laes(DETECT));
  const writer = udenKommentarer(laes(WRITER));
  const koe = udenKommentarer(laes(MAILKOE));
  const vagt = laes(VAGT);
  const klokke = udenKommentarer(laes(KLOKKE));

  it("1. medlemmets alert_financial_summary er gated af skalMedlemsAlarm — ellers log og retur", () => {
    expect(medlemsRaekkenErGated(detect)).toBe(true);
  });
  it("2. medlemsrækken kan ikke nå mailkøen: email_sent_at ved skrivning, køen og vagten filtrerer på det", () => {
    expect(medlemsRaekkenNaarIkkeKoeen(detect, writer, koe, vagt)).toBe(true);
  });
  it("3. rådgivergrenen er urørt", () => {
    expect(raadgiverGrenenErUroert(detect)).toBe(true);
  });
  it("4. prioriteten står — klokkens pille tæller rækken", () => {
    expect(prioritetenStaar(detect, klokke)).toBe(true);
  });
  it("alarmPeriode.ts er ren: kun maanedsnoegle-importen", () => {
    const ren = udenKommentarer(laes("supabase/functions/_shared/alarmPeriode.ts"));
    expect(ren.match(/^import .*$/gm) ?? []).toEqual(['import { afsluttedeMaanederFoer, maanedsNoegleKbh } from "./maanedsnoegle.ts";']);
  });
});

describe("alarmerMedlem.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const detect = udenKommentarer(laes(DETECT));
  const writer = udenKommentarer(laes(WRITER));
  const koe = udenKommentarer(laes(MAILKOE));
  const vagt = laes(VAGT);

  it("1. en medlemsrække skrevet uden for gaten (den gamle form) fælder dom 1", () => {
    const uden = detect.replace("if (!skalMedlemsAlarm(period_key, nu)) {", "if (false) {");
    expect(medlemsRaekkenErGated(uden)).toBe(false);
    expect(medlemsRaekkenErGated(detect + '\nawait writeNotification(adminClient, { type: "alert_financial_summary" });\n')).toBe(false);
  });
  it("2. en medlemsrække uden email_sent_at, eller en skriver der ikke bærer feltet, fælder dom 2", () => {
    expect(medlemsRaekkenNaarIkkeKoeen(detect.replace("email_sent_at: nu.toISOString(),", ""), writer, koe, vagt)).toBe(false);
    expect(medlemsRaekkenNaarIkkeKoeen(detect, writer.replace("...(payload.email_sent_at ? { email_sent_at: payload.email_sent_at } : {}),", ""), koe, vagt)).toBe(false);
    // Køen har filtret to steder (køen og samlemailens hentning) — begge væk før dommen falder.
    expect(medlemsRaekkenNaarIkkeKoeen(detect, writer, koe.split('.is("email_sent_at", null)').join(""), vagt)).toBe(false);
  });
  it("3. et email_sent_at eller en gate i rådgivergrenen fælder dom 3", () => {
    expect(raadgiverGrenenErUroert(detect.replace("priority: alert.priority,", "priority: alert.priority,\n          email_sent_at: nu.toISOString(),"))).toBe(false);
  });
  it("4. priority 'info' på medlemsrækken fælder dom 4", () => {
    expect(prioritetenStaar(detect.replace("priority: summaryPriority,", 'priority: "info",'), udenKommentarer(laes(KLOKKE)))).toBe(false);
  });
});
