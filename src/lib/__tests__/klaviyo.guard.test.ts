import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KLAVIYO_SECRET } from "../../../supabase/functions/_shared/klaviyo.ts";

/**
 * Kildeværn for Klaviyo-hændelserne (udkast 19/9-2026, lag 2). Seks domme,
 * hver bevist på en kopi med fejlen indsat:
 *
 *   1. De TRE kaldsteder kalder gennem `sendHvisMail` — ikke `fetch`, ikke
 *      `sendHaendelse` direkte. Ét sted at rette, hvis afsendelsen skal
 *      ændres (fx til en baggrundskø, den dag huset får en).
 *   2. INTET kaldsted kan kastes fra: hvert kald er `await sendHvisMail(...)`,
 *      og `sendHvisMail` har try/catch om ALT, inklusive `byg`.
 *   3. Nøglen læses ÉT sted (klaviyoAfsendelse.ts). Fundamentet er Deno-frit,
 *      så det kan prøves i vitest uden at vælte tsc.
 *   4. Revisionen er pinnet og sendes på hvert kald.
 *   5. Sporet skrives også ved «ingen_noegle» — ellers kan «vi har ingen
 *      hændelser» ikke skelnes fra «Klaviyo afviste dem».
 *   7. SPORET HAR INGEN TAVS STI (19/9 kl. 22.30): der findes ingen `return`
 *      i `sendHaendelse` FØR sporet er skrevet. Den ene undtagelse kostede
 *      «Ansoegning paabegyndt» — nul rækker, og en kodelæsning for at finde ud
 *      af hvorfor.
 *   8. «Ansoegning paabegyndt» sendes fra «gem»-grenen, når mailen kommer ind
 *      — ALDRIG fra «opret», hvor der kun er et CVR-nummer.
 *
 *   6. Migrationen har INGEN unikhedsregel på (metric, unikt_id): dubletter
 *      afvises hos Klaviyo, og sporet skal vise hvert forsøg.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const KLIENT = "supabase/functions/_shared/klaviyo.ts";
const HAENDELSER = "supabase/functions/_shared/klaviyoHaendelser.ts";
const AFSENDELSE = "supabase/functions/_shared/klaviyoAfsendelse.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const STRIPE = "supabase/functions/stripe-webhook/index.ts";
const MIGRATION = "supabase/migrations/20260919200000_klaviyo_haendelser.sql";

export const kaldstederneGaarGennemEt = (gem: string, motor: string, stripe: string): boolean => {
  const raa = [gem, motor, stripe];
  const alle = raa.map(udenKommentarer);
  return alle.every((k) => k.includes("sendHvisMail(")) &&
    // Ingen af dem må kalde Klaviyo udenom. Prøvet mod den RÅ kilde:
    // `udenKommentarer` klipper fra «//» til linjeskift, og en URL bærer
    // «//» midt i sig — så «https://a.klaviyo.com» bliver til «https:» og
    // mutationen ville bestå. (Fundet 19/9 da netop den prøve ikke slog ud.)
    raa.every((k) => !/fetch\(\s*["'`]https:\/\/a\.klaviyo/.test(k)) &&
    alle.every((k) => !k.includes("sendHaendelse(")) &&
    // Præcis ét kald hvert sted.
    alle.every((k) => (k.split("sendHvisMail(").length - 1) >= 1);
};

/**
 * NY PRÆMIS 19/9 kl. 22.30: hændelsen bygges nu af KALDEREN, ikke af en
 * `byg`-funktion inde i `sendHvisMail` — så metric og id er kendt, også når
 * mailen mangler. Invarianten er uændret: intet fra afsendelsen kan kastes ud
 * til en ansøger eller en Stripe-webhook. Der er nu TO try/catch'e at holde
 * på: `sendHvisMail` om hele kaldet, og `skrivSpor` om logningen.
 */
export const ingenKanKastes = (afsendelse: string, haendelser: string, gem: string, motor: string, stripe: string): boolean => {
  const a = udenKommentarer(afsendelse);
  const h = udenKommentarer(haendelser);
  const krop = (k: string, navn: string) =>
    new RegExp(`function ${navn}\\((?:(?!\\nexport |\\nasync function |\\nfunction )[\\s\\S])*?try \\{(?:(?!\\nexport |\\nasync function |\\nfunction )[\\s\\S])*?\\} catch \\(e\\) \\{`).test(k);
  const afventes = [gem, motor, stripe].map(udenKommentarer).every((k) => /await sendHvisMail\(/.test(k));
  return krop(a, "sendHvisMail") && krop(h, "skrivSpor") && afventes;
};

export const noeglenLaesesEtSted = (klient: string, haendelser: string, afsendelse: string): boolean => {
  const denoIKlient = /Deno\.env/.test(udenKommentarer(klient));
  const denoIHaendelser = /Deno\.env/.test(udenKommentarer(haendelser));
  const denoIAfsendelse = /Deno\.env\.get\(KLAVIYO_SECRET\)/.test(udenKommentarer(afsendelse));
  return !denoIKlient && !denoIHaendelser && denoIAfsendelse;
};

export const revisionenErPinnet = (klient: string): boolean => {
  const k = udenKommentarer(klient);
  return /export const KLAVIYO_REVISION = "\d{4}-\d{2}-\d{2}(\.[a-z]+)?";/.test(k) &&
    k.includes("revision: valg.revision ?? KLAVIYO_REVISION");
};

/**
 * NY PRÆMIS: selve insert'et bor nu i `skrivSpor`, og `sendHaendelse` kalder
 * den på BEGGE stier — den tomme mail og det rigtige kald. Værnet tæller
 * kaldene i stedet for at lede efter insert'et inde i `sendHaendelse`.
 */
export const sporetDaekkerOgsaaDetUsendte = (haendelser: string): boolean => {
  const h = udenKommentarer(haendelser);
  const iSend = h.slice(h.indexOf("export async function sendHaendelse"));
  return h.includes('.from("klaviyo_haendelser").insert(') &&
    // To kald: ingen_mail-stien og den almindelige.
    (iSend.split("skrivSpor(").length - 1) === 2 &&
    // Og logningen må ALDRIG ligge bag en «kun hvis ok»-gren.
    !/if \(svar\.ok\)[\s\S]{0,120}skrivSpor\(/.test(iSend) &&
    h.includes("udfald: spor.udfald");
};

export const sporetHarIngenUnikhedsregel = (sql: string): boolean =>
  /create table if not exists public\.klaviyo_haendelser/i.test(sql) &&
  !/unique\s*\(/i.test(sql) &&
  !/on conflict/i.test(sql) &&
  /enable row level security/i.test(sql);

// ── 7 ──────────────────────────────────────────────────────────────────────
export const ingenTavsSti = (haendelser: string): boolean => {
  const h = udenKommentarer(haendelser);
  const krop = h.slice(h.indexOf("export async function sendHaendelse"));
  // Hver «return» i sendHaendelse skal komme EFTER en skrivSpor.
  const foerste = krop.indexOf("return");
  const spor = krop.indexOf("skrivSpor(");
  return spor !== -1 && foerste > spor &&
    // Og den tomme mail skal have sit eget, navngivne udfald.
    krop.includes('udfald: "ingen_mail"') &&
    h.includes("export function brugbarMail");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const paabegyndtKommerFraGem = (gem: string): boolean => {
  const g = udenKommentarer(gem);
  const opret = g.indexOf('handling === "opret"');
  const gemGren = g.indexOf('handling === "gem"');
  const kald = g.indexOf("paabegyndt(");
  // Kaldet skal ligge EFTER «gem»-grenen begynder, ikke i «opret».
  return opret !== -1 && gemGren !== -1 && kald !== -1 && kald > gemGren && gemGren > opret &&
    g.includes('"email" in del.svar') &&
    // Præcis ét kald.
    (g.split("paabegyndt(").length - 1) === 1;
};

describe("Klaviyo — kildeværn", () => {
  it("1. de tre kaldsteder går gennem sendHvisMail", () => {
    const g = laes(GEM), m = laes(MOTOR), s = laes(STRIPE);
    expect(kaldstederneGaarGennemEt(g, m, s)).toBe(true);
    expect(kaldstederneGaarGennemEt(`${g}\nawait fetch("https://a.klaviyo.com/api/events/");`, m, s)).toBe(false);
    expect(kaldstederneGaarGennemEt(g.replace(/sendHvisMail\(/g, "sendHaendelse("), m, s)).toBe(false);
  });

  it("2. intet kaldsted kan kastes fra", () => {
    const a = laes(AFSENDELSE), h = laes(HAENDELSER), g = laes(GEM), m = laes(MOTOR), s = laes(STRIPE);
    expect(ingenKanKastes(a, h, g, m, s)).toBe(true);
    expect(ingenKanKastes(a.replace(/\} catch \(e\) \{/g, "} finally {"), h, g, m, s)).toBe(false);
    expect(ingenKanKastes(a, h.replace(/\} catch \(e\) \{/g, "} finally {"), g, m, s)).toBe(false);
    expect(ingenKanKastes(a, h, g.replace(/await sendHvisMail\(/g, "void sendHvisMail("), m, s)).toBe(false);
  });

  it("3. nøglen læses ét sted, og fundamentet er Deno-frit", () => {
    const k = laes(KLIENT), h = laes(HAENDELSER), a = laes(AFSENDELSE);
    expect(noeglenLaesesEtSted(k, h, a)).toBe(true);
    expect(noeglenLaesesEtSted(`${k}\nconst n = Deno.env.get("X");`, h, a)).toBe(false);
    expect(noeglenLaesesEtSted(k, `${h}\nconst n = Deno.env.get("X");`, a)).toBe(false);
    expect(KLAVIYO_SECRET).toBe("KLAVIYO_API_KEY");
  });

  it("4. revisionen er pinnet og sendes på hvert kald", () => {
    const k = laes(KLIENT);
    expect(revisionenErPinnet(k)).toBe(true);
    expect(revisionenErPinnet(k.replace(/export const KLAVIYO_REVISION = "[^"]+";/, "export const KLAVIYO_REVISION = latest;"))).toBe(false);
    expect(revisionenErPinnet(k.replace("revision: valg.revision ?? KLAVIYO_REVISION", 'revision: "2020-01-01"'))).toBe(false);
  });

  it("5. sporet dækker også det, der aldrig blev sendt", () => {
    const h = laes(HAENDELSER);
    expect(sporetDaekkerOgsaaDetUsendte(h)).toBe(true);
    // Fjernes den ene af de to skrivSpor-kald, falder værnet.
    expect(sporetDaekkerOgsaaDetUsendte(h.replace('await skrivSpor(skriver, i, spor, { ikke_sendt: "ingen_mail"', 'await intet(skriver, i, spor, { ikke_sendt: "ingen_mail"'))).toBe(false);
    expect(sporetDaekkerOgsaaDetUsendte(h.replace('.from("klaviyo_haendelser").insert(', 'X('))).toBe(false);
  });

  it("7. sporet har ingen tavs sti", () => {
    const h = laes(HAENDELSER);
    expect(ingenTavsSti(h)).toBe(true);
    // Præcis den fejl der var: en return før sporet skrives.
    expect(ingenTavsSti(h.replace("export async function sendHaendelse(", "export async function sendHaendelse(\n  // @ts-expect-error\n  return;\n"))).toBe(false);
    expect(ingenTavsSti(h.replace(/udfald: "ingen_mail"/g, 'udfald: "fejl"'))).toBe(false);
  });

  it("8. «Ansoegning paabegyndt» sendes fra gem, ikke fra opret", () => {
    const g = laes(GEM);
    expect(paabegyndtKommerFraGem(g)).toBe(true);
    // Flyttes den tilbage til «opret»-grenen, falder værnet.
    expect(paabegyndtKommerFraGem(g.replace(/handling === "gem"/g, 'handling === "XX"'))).toBe(false);
    expect(paabegyndtKommerFraGem(g.replace(/"email" in del\.svar/g, "true"))).toBe(false);
  });

  it("6. migrationen har ingen unikhedsregel — sporet skal vise hvert forsøg", () => {
    const sql = laes(MIGRATION);
    expect(sporetHarIngenUnikhedsregel(sql)).toBe(true);
    expect(sporetHarIngenUnikhedsregel(`${sql}\nalter table public.klaviyo_haendelser add constraint u unique (metric, unikt_id);`)).toBe(false);
  });
});
