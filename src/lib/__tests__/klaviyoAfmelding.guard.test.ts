import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KLAVIYO_AFMELD_SECRET } from "../../../supabase/functions/_shared/klaviyoAfmelding.ts";

/**
 * Kildeværn for afmeldingerne (udkast 22/9-2026,
 * ~/Downloads/udkast-ewebinar-afmelding/README.md). Otte domme, hver bevist på
 * en kopi med fejlen indsat:
 *
 *   1. KLAVIYO_AFMELD_KEY læses ÉT sted (klaviyoAfsendelse.ts), og
 *      klaviyoAfmelding.ts er Deno-frit — så hele kroppen kan prøves i vitest.
 *   2. Den EKSISTERENDE nøgle røres ikke: KLAVIYO_API_KEY står ingen steder i
 *      afmeldingens filer, og afmeldingen bruger aldrig KLAVIYO_SECRET.
 *   3. Kroppen er afmelding, ikke undertrykkelse: stien er
 *      profile-subscription-bulk-delete-jobs, consent er UNSUBSCRIBED, og
 *      ordet «suppress» findes ingen steder.
 *   4. PORTEN: webhooken sender INGEN fremmøde-hændelse for en afmeldt
 *      tilmelding — `overgang` går gennem erAfmeldt FØR byggFremmoede.
 *   5. Webhooken afmelder EFTER fletningen (rækken er skrevet først) og
 *      gennem afmeldHvisNoegle — ikke gennem fetch eller kald.
 *   6. Migrationens CHECK rummer HELE klaviyo.ts' udfaldsliste — ellers vælter
 *      en 429 sporskrivningen — og den har den unikke regel på (email) ok.
 *   7. Migrationens første linje bogfører den som KØRT i prod 22/9 kl. 13:26 —
 *      med FØR-tilstanden, EFTER-tilstanden og låsens værdi i selve linjen.
 *   8. Bagud-functionen er bag BÅDE tørkørsel og lås, og profil-cronen
 *      udelader de afmeldte.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
/** SQL-udgaven: «--» til linjeskift. */
const udenSqlKommentarer = (k: string) => k.replace(/^\s*--[^\n]*$/gm, "");

const AFMELDING = "supabase/functions/_shared/klaviyoAfmelding.ts";
const DOM = "supabase/functions/_shared/webinarAfmelding.ts";
const AFSENDELSE = "supabase/functions/_shared/klaviyoAfsendelse.ts";
const WEBHOOK = "supabase/functions/ewebinar-webhook/index.ts";
const BAGUD = "supabase/functions/klaviyo-afmeld-bagud/index.ts";
const PROFIL_CRON = "supabase/functions/klaviyo-profil-cron/index.ts";
const MIGRATION = "supabase/migrations/20260922060000_klaviyo_afmeldinger.sql";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const noeglenLaesesEtSted = (afmelding: string, dom: string, afsendelse: string): boolean => {
  const denoIAfmelding = /Deno\.env/.test(udenKommentarer(afmelding));
  const denoIDom = /Deno\.env/.test(udenKommentarer(dom));
  const denoIAfsendelse = /Deno\.env\.get\(KLAVIYO_AFMELD_SECRET\)/.test(udenKommentarer(afsendelse));
  return !denoIAfmelding && !denoIDom && denoIAfsendelse;
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const denGamleNoegleRoeresIkke = (afmelding: string, dom: string, bagud: string): boolean => {
  const a = udenKommentarer(afmelding), d = udenKommentarer(dom), b = udenKommentarer(bagud);
  return [a, d, b].every((k) => !k.includes("KLAVIYO_API_KEY") && !k.includes("KLAVIYO_SECRET")) &&
    // Bagud-functionen må ikke kalde Klaviyo udenom afsendelsen. Prøvet mod den
    // RÅ kilde: udenKommentarer klipper fra «//», og en URL bærer «//» midt i sig
    // (klaviyo.guard's lærdom 19/9).
    !/fetch\(\s*["'`]https:\/\/a\.klaviyo/.test(bagud) &&
    b.includes("afmeldHvisNoegle(") &&
    a.includes(`export const KLAVIYO_AFMELD_SECRET = "KLAVIYO_AFMELD_KEY";`);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const afmeldingIkkeUndertrykkelse = (afmelding: string): boolean => {
  const a = udenKommentarer(afmelding);
  return a.includes('export const AFMELD_STI = "/profile-subscription-bulk-delete-jobs/";') &&
    a.includes('type: "profile-subscription-bulk-delete-job"') &&
    a.includes('consent: "UNSUBSCRIBED"') &&
    // Undertrykkelsens endepunkt og ord må ikke optræde i koden.
    !a.includes("suppression") &&
    !/\bsuppress/i.test(a) &&
    // Global: intet list_id i kroppen.
    !a.includes("list_id");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const portenForanFremmoedet = (webhook: string): boolean => {
  const w = udenKommentarer(webhook);
  const iPort = w.indexOf("erAfmeldt(");
  const iByg = w.indexOf("byggFremmoede(");
  return iPort !== -1 && iByg !== -1 && iPort < iByg &&
    // Overgangen SKAL gå gennem porten — ikke direkte fra afgoerOvergang.
    /const overgang = erAfmeldtNu \? "ingen" : afgoerOvergang\(/.test(w) &&
    w.includes('from "../_shared/webinarAfmelding.ts"');
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const webhookenAfmelderEfterFletningen = (webhook: string): boolean => {
  const w = udenKommentarer(webhook);
  const iUpsert = w.indexOf('.from("webinar_tilmeldinger")');
  const iAfmeld = w.indexOf("afmeldHvisNoegle(");
  return iUpsert !== -1 && iAfmeld !== -1 && iUpsert < iAfmeld &&
    // Dommen får den NYE besked (t), ikke den flettede.
    w.includes("skalAfmeldes(kendt, t)") &&
    // Await'et — ingen løs promise.
    /await afmeldHvisNoegle\(/.test(w) &&
    // Aldrig Klaviyo udenom.
    !/\bkald\s*\(/.test(w) &&
    !w.includes("KLAVIYO_AFMELD_KEY");
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const migrationenRummerHeleUdfaldslisten = (sql: string): boolean => {
  const s = udenSqlKommentarer(sql);
  const noedvendige = ["ok", "ingen_noegle", "ingen_mail", "noegle_afvist", "loft", "ugyldig", "fejl", "timeout"];
  const check = /check\s*\(\s*udfald in \(([^)]*)\)/i.exec(s);
  if (!check) return false;
  const liste = check[1];
  return noedvendige.every((u) => liste.includes(`'${u}'`)) &&
    /create unique index[^;]*klaviyo_afmeldinger_ok_unik[\s\S]*?\(email\)\s*where udfald = 'ok'/i.test(s) &&
    /enable row level security/i.test(s) &&
    /to service_role/i.test(s);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
/**
 * VENDT 22/9 kl. 13:26: migrationen ER kørt i prod (Jonas, Lovable SQL editor,
 * FØR merge) — filhovedet sagde «IKKE KØRT» indtil da. Dommen er vendt, ikke
 * fjernet: den krævede før den ene linje, nu kræver den den anden, og den
 * afviser stadig den forkerte. Samme form som afslagLuk.guard dom 5,
 * eventSvar.guard dom 3 og klaviyoGensend.guard dom 5.
 *
 * HVORFOR EN DOM PÅ ÉN LINJE OVERHOVEDET: den, der kører migrationer, scanner
 * mappen efter linje 1. `20260919090000_ventepladser_tidligst.sql` startede med
 * forklaringen i stedet, blev sprunget over, og forsiden var nede for alle
 * rådgivere i tolv timer. Linjen er en grænseflade, ikke en kommentar.
 */
export const migrationsHovedetErRigtigt = (sql: string): boolean => {
  const linje1 = sql.split("\n")[0];
  return linje1.startsWith("-- KØRT i prod — 22/9-2026 kl. 13:26 (Jonas, Lovable SQL editor), før merge.") &&
    // Beviset skal stå i hovedet, ikke kun datoen: FØR-tilstanden, EFTER-tilstanden
    // og låsens værdi.
    linje1.includes("FØR 13:23") &&
    linje1.includes("2 politikker (SELECT authenticated, ALL service_role)") &&
    linje1.includes("4 indekser (pkey, email_idx, forsoegt_idx, ok_unik)") &&
    linje1.includes("klaviyo_afmeld_aktiv = false");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const bagudErBagLaasOgToerkoersel = (bagud: string): boolean => {
  const b = udenKommentarer(bagud);
  return b.includes("authenticateServiceRole(req)") &&
    b.includes('export const AFMELD_LAAS_NOEGLE = "klaviyo_afmeld_aktiv";') &&
    // Tørkørsel er standard: kun et eksplicit false slår den fra.
    b.includes("raaBody?.dry_run !== false") &&
    // Og der sendes KUN, når begge er opfyldt.
    /sender_rigtigt:\s*!a\.toerKoersel && laas/.test(b) &&
    /if \(!r\.sender_rigtigt\) return r;/.test(b);
};

export const profilCronenUdeladerAfmeldte = (cron: string): boolean => {
  const c = udenKommentarer(cron);
  return /\.or\("subscribed\.ilike\.unsubscribed,sidste_action\.ilike\.unsubscribed"\)/.test(c) &&
    c.includes("if (afmeldte.has(email)) { r.afmeldte_udeladt++; continue; }");
};

describe("Klaviyo-afmelding — kildeværn", () => {
  it("1. nøglen læses ét sted, og dom + afsendelse er Deno-frie", () => {
    const a = laes(AFMELDING), d = laes(DOM), s = laes(AFSENDELSE);
    expect(noeglenLaesesEtSted(a, d, s)).toBe(true);
    expect(noeglenLaesesEtSted(`${a}\nconst n = Deno.env.get("X");`, d, s)).toBe(false);
    expect(noeglenLaesesEtSted(a, `${d}\nconst n = Deno.env.get("X");`, s)).toBe(false);
    expect(noeglenLaesesEtSted(a, d, s.replace(/Deno\.env\.get\(KLAVIYO_AFMELD_SECRET\)/g, "undefined"))).toBe(false);
    expect(KLAVIYO_AFMELD_SECRET).toBe("KLAVIYO_AFMELD_KEY");
  });

  it("2. den eksisterende KLAVIYO_API_KEY røres ikke", () => {
    const a = laes(AFMELDING), d = laes(DOM), b = laes(BAGUD);
    expect(denGamleNoegleRoeresIkke(a, d, b)).toBe(true);
    expect(denGamleNoegleRoeresIkke(a.replace(/KLAVIYO_AFMELD_KEY/g, "KLAVIYO_API_KEY"), d, b)).toBe(false);
    expect(denGamleNoegleRoeresIkke(a, d, `${b}\nawait fetch("https://a.klaviyo.com/api/x/");`)).toBe(false);
    expect(denGamleNoegleRoeresIkke(a, d, b.replace(/afmeldHvisNoegle\(/g, "afmeld("))).toBe(false);
  });

  it("3. det er en AFMELDING, ikke en undertrykkelse — og den er global", () => {
    const a = laes(AFMELDING);
    expect(afmeldingIkkeUndertrykkelse(a)).toBe(true);
    expect(afmeldingIkkeUndertrykkelse(a.replace(/profile-subscription-bulk-delete-jobs/g, "profile-suppression-bulk-create-jobs"))).toBe(false);
    expect(afmeldingIkkeUndertrykkelse(a.replace(/consent: "UNSUBSCRIBED"/g, 'consent: "SUBSCRIBED"'))).toBe(false);
    expect(afmeldingIkkeUndertrykkelse(a.replace(/email: mail,\n/, 'email: mail, list_id: "abc",\n'))).toBe(false);
  });

  it("4. PORTEN: ingen fremmøde-hændelse for en afmeldt tilmelding", () => {
    const w = laes(WEBHOOK);
    expect(portenForanFremmoedet(w)).toBe(true);
    // Fjernes porten, falder værnet.
    expect(portenForanFremmoedet(w.replace(/const overgang = erAfmeldtNu \? "ingen" : afgoerOvergang\(/g, "const overgang = afgoerOvergang("))).toBe(false);
    expect(portenForanFremmoedet(w.replace(/erAfmeldt\(/g, "ignorer("))).toBe(false);
  });

  it("5. webhooken afmelder EFTER fletningen, gennem afsendelsen, på den NYE besked", () => {
    const w = laes(WEBHOOK);
    expect(webhookenAfmelderEfterFletningen(w)).toBe(true);
    expect(webhookenAfmelderEfterFletningen(w.replace(/skalAfmeldes\(kendt, t\)/g, "skalAfmeldes(kendt, flettet)"))).toBe(false);
    expect(webhookenAfmelderEfterFletningen(w.replace(/await afmeldHvisNoegle\(/g, "void afmeldHvisNoegle("))).toBe(false);
  });

  it("6. migrationens CHECK rummer hele udfaldslisten, og den unikke regel står", () => {
    const m = laes(MIGRATION);
    expect(migrationenRummerHeleUdfaldslisten(m)).toBe(true);
    // Den fælde, dommen findes for: en for snæver liste.
    expect(migrationenRummerHeleUdfaldslisten(m.replace(/'loft', /g, ""))).toBe(false);
    expect(migrationenRummerHeleUdfaldslisten(m.replace(/'ugyldig', /g, ""))).toBe(false);
    expect(migrationenRummerHeleUdfaldslisten(m.replace(/where udfald = 'ok'/g, ""))).toBe(false);
  });

  it("7. migrationens første linje bogfører den som KØRT i prod 22/9 kl. 13:26, med beviset", () => {
    const m = laes(MIGRATION);
    expect(migrationsHovedetErRigtigt(m)).toBe(true);
    // Mutationerne køres på DEN FAKTISKE fil (#1064-formen), ikke på en opdigtet streng:
    // tilbage til «IKKE KØRT» → falsk.
    expect(migrationsHovedetErRigtigt(m.replace("-- KØRT i prod — 22/9-2026 kl. 13:26", "-- IKKE KØRT. DEPLOY:"))).toBe(false);
    // en forklaring skubbet op foran linje 1 → falsk (ventepladser-fælden).
    expect(migrationsHovedetErRigtigt(`-- En forklaring først\n${m}`)).toBe(false);
    // beviset fjernet fra hovedet, datoen beholdt → falsk.
    expect(migrationsHovedetErRigtigt(m.replace(/ FØR 13:23[^\n]*/, ""))).toBe(false);
    expect(migrationsHovedetErRigtigt(m.replace("klaviyo_afmeld_aktiv = false", "klaviyo_afmeld_aktiv = true"))).toBe(false);
    expect(migrationsHovedetErRigtigt(m.replace("4 indekser (pkey, email_idx, forsoegt_idx, ok_unik)", "4 indekser"))).toBe(false);
  });

  it("8. bagud-fejet er bag tørkørsel OG lås, og profil-cronen udelader afmeldte", () => {
    const b = laes(BAGUD), p = laes(PROFIL_CRON);
    expect(bagudErBagLaasOgToerkoersel(b)).toBe(true);
    expect(bagudErBagLaasOgToerkoersel(b.replace(/sender_rigtigt: !a\.toerKoersel && laas/g, "sender_rigtigt: !a.toerKoersel"))).toBe(false);
    expect(bagudErBagLaasOgToerkoersel(b.replace(/if \(!r\.sender_rigtigt\) return r;/g, ""))).toBe(false);
    expect(bagudErBagLaasOgToerkoersel(b.replace(/raaBody\?\.dry_run !== false/g, "raaBody?.dry_run === true"))).toBe(false);

    expect(profilCronenUdeladerAfmeldte(p)).toBe(true);
    expect(profilCronenUdeladerAfmeldte(p.replace(/if \(afmeldte\.has\(email\)\) \{ r\.afmeldte_udeladt\+\+; continue; \}/g, ""))).toBe(false);
  });
});
