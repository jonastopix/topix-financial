import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for de tre rettelser før webinaret 22/9 (17/9-2026 — JONAS
// ordret: «1. Ja 2. JA 3. Ja»; recon-webinar-22-9.md §7 pkt. 3, 4 og 7).
// Bygget OVEN PÅ vindue A's kontrakter-webhook (skrivKontraktraekke). Låses:
//   1. KLOKKEN indgang_betalt: stripe-webhook skriver den ved en indgangs-
//      betaling (checkout OG faktura) — KUN første gang: ikke i gensendelses-
//      grenene og ikke efter racen (PeriodeFandtesAllerede returnerer før).
//      Teksten er ren (_shared/indgangBetaltBesked.ts), typen bor hos de andre.
//   2. FORSIDELINJEN «N har betalt, men ikke oprettet konto»: dommen har den
//      femtende slags (hændelse, alvor 85, indsats 1) som ÉN foldet linje med
//      lukning gennem erLukket (ingen ny kolonne); AdvisorDashboard bygger
//      listen af companies med contract_start_date og INGEN company_members
//      (uden om pending-gaten) og giver den til dommen; fladen folder, linker
//      hvert navn til virksomhedssiden og kvitterer alle.
//   3. MAIL A følger tjeklisten efter #957: «Din profil — et foto af dig, og
//      hvad de andre i netværket kan spørge dig om.» i BEGGE kopier.
//   4. UNIKHEDSREGLEN: migration 20260918140000 (delvist unikt indeks på
//      company_perioder.stripe_reference med STOP-værn), og webhooken fanger
//      23505 — opretIndgangsPeriode kaster PeriodeFandtesAllerede, begge
//      kaldere svarer «allerede_behandlet»/«concurrent_duplicate», fornyelsens
//      insert svarer «concurrent_duplicate» — så en race aldrig vælter
//      betalingen eller skriver kontraktår/klokke to gange.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/^\s*--[^\n]*/gm, "");

const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";
const TEKST = "supabase/functions/_shared/indgangBetaltBesked.ts";
const TYPER = "supabase/functions/_shared/raadgiverBeskedTekst.ts";
const DOM = "src/lib/forsidensDom.ts";
const DASH = "src/components/AdvisorDashboard.tsx";
const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const RYTME_SRC = "src/lib/onboardingRytme.ts";
const RYTME_DENO = "supabase/functions/_shared/onboardingRytme.ts";
const MIGRATION = "supabase/migrations/20260918140000_company_perioder_stripe_reference_unik.sql";

/** Udsnittet fra gensendelses-opslaget til «gensendelse fuldførte …» — dér må klokken IKKE stå. */
const gensendelsesGren = (w: string, opslag: string): string => {
  const fra = w.indexOf(opslag);
  if (fra === -1) return "";
  const til = w.indexOf("gensendelse fuldførte halvt udført arbejde", fra);
  return til === -1 ? "" : w.slice(fra, til);
};

/** Dom 1: klokken — to steder, første gang, efter invitationen, ren tekst. */
export const klokkenHolder = (w: string, tekst: string, typer: string): boolean => {
  const kald = w.match(/await meldIndgangBetalt\(adminClient, \{/g) ?? [];
  const fakturaGren = gensendelsesGren(w, "const eksisterende = await findIndgangsPeriode(adminClient, invoiceId);");
  const checkoutGren = gensendelsesGren(w, "const eksisterende = await findIndgangsPeriode(adminClient, session.id);");
  const foersteKald = w.indexOf("await meldIndgangBetalt(adminClient, {");
  const raceFaktura = w.indexOf('if (e instanceof PeriodeFandtesAllerede) return { udfald: "allerede_behandlet" };');
  const raceCheckout = w.indexOf('skipped: "concurrent_duplicate"');
  return kald.length === 2 &&
    fakturaGren.length > 0 && checkoutGren.length > 0 &&
    !fakturaGren.includes("meldIndgangBetalt") && !checkoutGren.includes("meldIndgangBetalt") &&
    raceFaktura > -1 && raceFaktura < foersteKald && raceCheckout > -1 && raceCheckout < w.lastIndexOf("await meldIndgangBetalt(adminClient, {") &&
    (w.match(/await meldInvitationsUdfald\(adminClient, [a-zA-Z]+, invitation, [a-zA-Z.]+\);\n\s*await meldIndgangBetalt\(adminClient, \{/g) ?? []).length === 2 &&
    w.includes("type: TYPE_INDGANG_BETALT,") && w.includes('reference_type: "periode",') && w.includes("reference_id: a.periodeId,") &&
    typer.includes('export const TYPE_INDGANG_BETALT = "indgang_betalt";') &&
    tekst.includes("title: `${a.virksomhed} er nyt medlem — har betalt`,") &&
    tekst.includes("indgangLoginTekst(a.invitation)") && !/supabase/.test(tekst);
};

/** Dom 2: forsidelinjen — dom, datalag, flade. */
export const forsidelinjenHolder = (dom: string, dash: string, flade: string): boolean =>
  dom.includes('| "betalt_ikke_oprettet";') && dom.includes('betalt_ikke_oprettet: "haendelse",') && dom.includes("betalt_ikke_oprettet: 1,") &&
  dom.includes("export const ALVOR_BETALT_IKKE_OPRETTET = 85;") &&
  dom.includes(".filter(({ grund, b }) => !erLukket(grund, b.kvittering))") &&
  dom.includes("grundlag: `betalt:${b.betaltDag}`,") &&
  dom.includes("...(betalt ? [betalt] : []),") &&
  dom.includes("ekstra: ForsidensEkstra = {}") &&
  dash.includes("created_at, er_kunde, contract_start_date\")") &&
  dash.includes("!!c.contract_start_date && !expiredCompanyIds.has(c.id) && !companiesWithActiveMembers.has(c.id))") &&
  // 18/9 (rådgiverens side af ansøgningen): dommen får også ansøgningerne i ekstra — betalt-listen står stadig først i kaldet.
  dash.includes("afgoerForsidensDom(virksomhederTilDom, now, { betaltIkkeOprettet, ansoegninger: ansoegningerTilForside })") &&
  flade.includes('if (l.linje === "betalt") {') &&
  flade.includes("<Link to={virksomhedsLink(v.companyId)} className={TEKSTLINK}>") &&
  flade.includes('input.linje.linje === "boelge" || input.linje.linje === "betalt"') &&
  flade.includes("data-betalt-ikke-oprettet={l.antal}");

/** Dom 3: mail A i begge kopier. */
const NY_LINJE = '"Din profil — et foto af dig, og hvad de andre i netværket kan spørge dig om.",';
const GAMMEL_LINJE = '"Din profil — hvad de andre i netværket kan spørge dig om.",';
export const mailAHolder = (src: string, deno: string): boolean =>
  src.includes(NY_LINJE) && deno.includes(NY_LINJE) && !src.includes(GAMMEL_LINJE) && !deno.includes(GAMMEL_LINJE);

/** Dom 4: unikhedsreglen — migration + webhook. */
export const unikhedenHolder = (sql: string, w: string): boolean =>
  sql.includes("create unique index if not exists company_perioder_stripe_reference_uidx") &&
  sql.includes("on public.company_perioder (stripe_reference)") &&
  sql.includes("where stripe_reference is not null;") &&
  sql.includes("raise exception 'STOP:") &&
  w.includes("class PeriodeFandtesAllerede extends Error {") &&
  (w.match(/\.code === "23505"\)/g) ?? []).length === 2 &&
  w.includes("throw new PeriodeFandtesAllerede(raekke.stripe_reference, eksisterende?.id ?? null);") &&
  w.includes('if (e instanceof PeriodeFandtesAllerede) return { udfald: "allerede_behandlet" };') &&
  (w.match(/skipped: "concurrent_duplicate"/g) ?? []).length === 2 &&
  (w.match(/periodeId = await opretIndgangsPeriode\(adminClient, \{/g) ?? []).length === 2;

describe("foer22.guard — klokken indgang_betalt, «betalt, ikke oprettet konto», mail A med fotoet, unikhedsreglen", () => {
  const w = udenKommentarer(laes(WEBHOOK));
  const tekst = udenKommentarer(laes(TEKST));
  const typer = udenKommentarer(laes(TYPER));
  const dom = udenKommentarer(laes(DOM));
  const dash = udenKommentarer(laes(DASH));
  const flade = udenKommentarer(laes(FLADE));
  const src = udenKommentarer(laes(RYTME_SRC));
  const deno = udenKommentarer(laes(RYTME_DENO));
  const sql = udenSqlKommentarer(laes(MIGRATION));

  it("dom 1: klokken skrives ved checkout og faktura — kun første gang, efter invitationen, med ren tekst og typen indgang_betalt", () => {
    expect(klokkenHolder(w, tekst, typer)).toBe(true);
  });
  it("dom 2: den femtende slags er en hændelse (85, indsats 1), lukkes gennem erLukket, bygges i AdvisorDashboard uden om pending-gaten og foldes i fladen med navnelinks og kvittering af alle", () => {
    expect(forsidelinjenHolder(dom, dash, flade)).toBe(true);
  });
  it("dom 3: mail A nævner fotoet i begge kopier (src og Deno), og den gamle linje er væk", () => {
    expect(mailAHolder(src, deno)).toBe(true);
  });
  it("dom 4: delvist unikt indeks med STOP-værn; webhooken fanger 23505 i opretIndgangsPeriode og fornyelsens insert og svarer uden at gøre mere", () => {
    expect(existsSync(resolve(process.cwd(), MIGRATION))).toBe(true);
    expect(unikhedenHolder(sql, w)).toBe(true);
  });

  it("selvbevis 1: klokken i gensendelses-grenen, klokken før invitationen, eller racen der ikke returnerer først, falder", () => {
    const iGensendelse = w.replace('await nulstilIndgangsSession(adminClient, companyId);\n      const invitation = await sikrIndgangsInvitation(adminClient, companyId, invoiceId);', 'await nulstilIndgangsSession(adminClient, companyId);\n      await meldIndgangBetalt(adminClient, { companyId, navn: null, samletOere: 0, betalingsmodel: "faktura", periode: eksisterende, periodeId: eksisterende.id, invitation: { udfald: "sendt" } });\n      const invitation = await sikrIndgangsInvitation(adminClient, companyId, invoiceId);');
    expect(iGensendelse).not.toBe(w);
    expect(klokkenHolder(iGensendelse, tekst, typer)).toBe(false);
    expect(klokkenHolder(w.replace('if (e instanceof PeriodeFandtesAllerede) return { udfald: "allerede_behandlet" };', "if (e instanceof PeriodeFandtesAllerede) console.warn(e.message);"), tekst, typer)).toBe(false);
    expect(klokkenHolder(w, 'import { supabase } from "x";\n' + tekst, typer)).toBe(false);
  });
  it("selvbevis 2: datalaget uden medlems-filteret, dommen uden lukning, eller fladen uden kvittering af alle, falder", () => {
    expect(forsidelinjenHolder(dom, dash.replace(" && !companiesWithActiveMembers.has(c.id))", ")"), flade)).toBe(false);
    expect(forsidelinjenHolder(dom.replace(".filter(({ grund, b }) => !erLukket(grund, b.kvittering))", ""), dash, flade)).toBe(false);
    expect(forsidelinjenHolder(dom, dash, flade.replace('input.linje.linje === "boelge" || input.linje.linje === "betalt"', 'input.linje.linje === "boelge"'))).toBe(false);
  });
  it("selvbevis 3: den gamle linje i én af kopierne falder", () => {
    expect(mailAHolder(src.replace(NY_LINJE, GAMMEL_LINJE), deno)).toBe(false);
    expect(mailAHolder(src, deno.replace(NY_LINJE, GAMMEL_LINJE))).toBe(false);
  });
  it("selvbevis 4: et indeks uden where-led eller uden STOP-værn, eller en webhook uden 23505-grenen, falder", () => {
    expect(unikhedenHolder(sql.replace("where stripe_reference is not null;", ";"), w)).toBe(false);
    expect(unikhedenHolder(sql.replace("raise exception 'STOP:", "raise notice 'STOP:"), w)).toBe(false);
    expect(unikhedenHolder(sql, w.replace('if ((error as { code?: string }).code === "23505") {', "if (false) {"))).toBe(false);
  });
});
