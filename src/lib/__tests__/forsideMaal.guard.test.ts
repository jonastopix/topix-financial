import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Én plan» fase 4 (16/9-2026): rådgiverens forside viser mål
// uden bevægelse og refleksioner med «hjælp ønskes». Fem ting låses:
//   1. forsidensDom regner IKKE selv på dage: «uden bevægelse» og gennemgang
//      kommer fra planen.ts (planenDom / UDEN_BEVAEGELSE_DAGE) — én regel,
//      samme som Planen på virksomhedssiden. Ingen egen «30» i dommen.
//   2. Hentningen (AdvisorDashboard) bærer begge felter ind i tilDom: aktive
//      mål med ALLE planen.ts' kolonner gennem hentAlleSider (PostgREST-loftet),
//      og den nyeste refleksion med help_needed (id med i select'en).
//   3. FORM og INDSATS har de to slags; formen er tilstand hhv. hændelse.
//   4. Lukningen bruger husets kvittering (erLukket) — ingen ny kolonne:
//      ingen migration efter fase 2 tilføjer en set-/kvitteringskolonne på
//      milestones eller pulse_checkins.
//   5. Virksomhedssiden har ankre for begge slags (deep-link ?grund=).
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const DOM = "src/lib/forsidensDom.ts";
const DASH = "src/components/AdvisorDashboard.tsx";
const VIEW = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const PLANEN = "src/lib/hjemmebane/planen.ts";

/** Dom 1: dommen låner reglen af planen.ts. */
export const dommenLaanerReglen = (dom: string): boolean =>
  dom.includes('import { planenDom, UDEN_BEVAEGELSE_DAGE, type MaalRaekke } from "@/lib/hjemmebane/planen";') &&
  /const plan = planenDom\(v\.maal, \[\], nu\);/.test(dom) &&
  /if \(plan\.gennemgang\) \{/.test(dom) &&
  /x\.dageUdenBevaegelse >= UDEN_BEVAEGELSE_DAGE/.test(dom) &&
  !/\b30\b\s*\*\s*86_?400_?000|>= 30\b|dage\s*>=\s*30/.test(dom) &&
  /grundlag: `gennemgang:\$\{antal\}`/.test(dom) &&
  /grundlag: stille\.map\(\(x\) => `\$\{x\.maal\.id\}=\$\{x\.maal\.progress_updated_at \?\? "aldrig"\}`\)\.sort\(\)\.join\(","\)/.test(dom) &&
  /grundlag: r\.id,/.test(dom) &&
  // 17/9: refleksionen lukker af sig selv på rådgiverens svar, og længdekravet står ét sted (REFLEKSION_MIN_TEGN).
  /export const REFLEKSION_MIN_TEGN = 3;/.test(dom) &&
  /r\.helpNeeded\.trim\(\)\.length < REFLEKSION_MIN_TEGN\) return null;/.test(dom) &&
  /if \(refleksionBesvaret\(r\.createdAt, v\.sidsteRaadgiverBeskedAt\)\) return null;/.test(dom) &&
  /return svar > sendt;/.test(dom) &&
  /Refleksion \$\{periode\}: /.test(dom) &&
  // Fase 5: «ingen mål» (grundFraIngenMaal) står mellem målene og refleksionen.
  /const m = grundFraMaal\(v, nu\);\s*if \(m\) grunde\.push\(m\);\s*const im = grundFraIngenMaal\(v\);\s*if \(im\) grunde\.push\(im\);\s*const r = grundFraRefleksion\(v\);\s*if \(r\) grunde\.push\(r\);\s*return grunde\.filter\(\(g\) => !erLukket\(g, v\.kvittering\)\);/.test(dom);

/** Dom 2: hentningen bærer felterne. */
export const hentningenBaerer = (dash: string): boolean =>
  dash.includes('import { hentAlleSider } from "@/lib/budgetEngine";') &&
  /hentAlleSider<MaalRaekke & \{ company_id: string \}>\(\(fra, til\) =>\s*supabase\s*\.from\("milestones"\)\s*\.select\("id, company_id, title, deadline, progress, status, category, source, progress_updated_at, completed_at, created_at"\)\s*\.eq\("status", "active"\)\s*\.order\("deadline", \{ ascending: true \}\)\s*\.order\("id"\)\s*\.range\(fra, til\),/.test(dash) &&
  /\.from\("pulse_checkins"\)\s*\.select\("id, company_id, period_key, went_well, biggest_challenge, help_needed, created_at"\)/.test(dash) &&
  /maal: maalByCompany\.get\(c\.company_id\) \?\? \[\],/.test(dash) &&
  /refleksionHjaelp: refleksionHjaelpByCompany\.get\(c\.company_id\) \?\? null,/.test(dash) &&
  /kraevRaekker\(milestonesRes, "milestones"\)/.test(dash) &&
  /typeof p\.help_needed === "string" && p\.help_needed\.trim\(\) && !refleksionHjaelpByCompany\.has\(p\.company_id\)/.test(dash) &&
  // 17/9: periodKey bæres med; INGEN egen længderegel i hentningen (den bor i dommen).
  /periodKey: p\.period_key \?\? null/.test(dash) &&
  !/help_needed[^\n]*\.length\s*[<>]=?\s*\d/.test(dash);

/** Dom 3: FORM og INDSATS. */
export const formenHolder = (dom: string): boolean =>
  /maal_uden_bevaegelse: "tilstand",/.test(dom) && /refleksion_hjaelp: "haendelse",/.test(dom) && /ingen_maal: "tilstand",/.test(dom) &&
  /maal_uden_bevaegelse: 2,/.test(dom) && /refleksion_hjaelp: 2,/.test(dom) && /ingen_maal: 2,/.test(dom) &&
  /export const ALVOR_INGEN_MAAL = 70;/.test(dom) &&
  /grundlag: `ingen:\$\{v\.maal\.length\}`,/.test(dom) &&
  /export const ALVOR_MAAL = \{\s*stilstand: 55,\s*stilstand_laenge: 70,\s*gennemgang: 70,\s*\} as const;/.test(dom) &&
  /export const ALVOR_REFLEKSION_HJAELP = 80;/.test(dom);

/** Dom 4: ingen ny kvitteringskolonne. */
export const ingenNyKolonne = (migrationer: readonly { sti: string; sql: string }[]): string[] =>
  migrationer
    .filter((m) => m.sti > "supabase/migrations/20260917150000")
    .filter((m) => /alter table public\.(milestones|pulse_checkins)[\s\S]*?add column[^;]*(seen|set_at|kvitter|acknowledg|laest)/i.test(m.sql.replace(/--[^\n]*/g, "")))
    .map((m) => m.sti);

describe("forsideMaal.guard — fase 4: mål uden bevægelse og refleksion med hjælp på forsiden", () => {
  it("dom 1: forsidensDom låner reglen af planen.ts og regner ikke selv på 30 dage; grundlagene er målenes stempler / antallet / refleksionens id", () => {
    expect(dommenLaanerReglen(udenKommentarer(laes(DOM)))).toBe(true);
    expect(laes(PLANEN)).toContain("export const UDEN_BEVAEGELSE_DAGE = 30;");
  });
  it("dom 2: AdvisorDashboard henter aktive mål med planen.ts' kolonner gennem hentAlleSider og bærer maal + refleksionHjaelp ind i tilDom", () => {
    expect(hentningenBaerer(udenKommentarer(laes(DASH)))).toBe(true);
  });
  it("dom 3: FORM (tilstand/hændelse), INDSATS (2/2) og alvorstallene (55/70/70, 80)", () => {
    expect(formenHolder(udenKommentarer(laes(DOM)))).toBe(true);
  });
  it("dom 4: ingen migration efter fase 2 tilføjer en set-/kvitteringskolonne på milestones eller pulse_checkins", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = resolve(process.cwd(), "supabase/migrations");
    const migrationer = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => ({ sti: `supabase/migrations/${f}`, sql: laes(`supabase/migrations/${f}`) }));
    expect(ingenNyKolonne(migrationer)).toEqual([]);
  });
  it("dom 5: virksomhedssiden har ankre for begge slags", () => {
    const v = udenKommentarer(laes(VIEW));
    expect(v).toContain('maal_uden_bevaegelse: "section-milestones",');
    expect(v).toContain('refleksion_hjaelp: "section-refleksion",');
    expect(v).toContain('ingen_maal: "section-milestones",');
    expect(v).toContain('<HbCard id="section-refleksion"');
    // Planen-kortet (fase 2) bærer ankeret section-milestones.
    expect(udenKommentarer(laes("src/components/hjemmebane/virksomhed/VirksomhedPlanen.tsx"))).toContain('id="section-milestones"');
  });

  it("selvbevis 1: en dom med egen 30-dages regning, eller uden planenDom, falder", () => {
    const d = udenKommentarer(laes(DOM));
    expect(dommenLaanerReglen(d.replace("x.dageUdenBevaegelse >= UDEN_BEVAEGELSE_DAGE", "x.dageUdenBevaegelse >= 30"))).toBe(false);
    expect(dommenLaanerReglen(d.replace("const plan = planenDom(v.maal, [], nu);", "const plan = { gennemgang: v.maal.length > 3, aktive: [] };"))).toBe(false);
    expect(dommenLaanerReglen(d.replace("grundlag: r.id,", "grundlag: r.createdAt,"))).toBe(false);
    // 17/9: uden besvaret-dommen, med «>=» (samme tidspunkt lukker), eller uden længdekravet falder.
    expect(dommenLaanerReglen(d.replace("if (refleksionBesvaret(r.createdAt, v.sidsteRaadgiverBeskedAt)) return null;", ""))).toBe(false);
    expect(dommenLaanerReglen(d.replace("return svar > sendt;", "return svar >= sendt;"))).toBe(false);
    expect(dommenLaanerReglen(d.replace("r.helpNeeded.trim().length < REFLEKSION_MIN_TEGN) return null;", 'r.helpNeeded.trim() === "") return null;'))).toBe(false);
  });
  it("selvbevis 2: hentning uden hentAlleSider, uden id på pulse, eller uden felterne i tilDom falder", () => {
    const h = udenKommentarer(laes(DASH));
    expect(hentningenBaerer(h.replace(".order(\"id\")\n            .range(fra, til),", ".limit(200),"))).toBe(false);
    expect(hentningenBaerer(h.replace('.select("id, company_id, period_key, went_well', '.select("company_id, period_key, went_well'))).toBe(false);
    expect(hentningenBaerer(h.replace("maal: maalByCompany.get(c.company_id) ?? [],", ""))).toBe(false);
    // 17/9: en egen længderegel i hentningen falder; manglende periodKey falder.
    expect(hentningenBaerer(h.replace("p.help_needed.trim() && !refleksionHjaelpByCompany", "p.help_needed.trim() && p.help_needed.length >= 3 && !refleksionHjaelpByCompany"))).toBe(false);
    expect(hentningenBaerer(h.replace("periodKey: p.period_key ?? null", "periodKey: null"))).toBe(false);
  });
  it("selvbevis 3: FORM med hændelse for målene, eller andre alvorstal, falder", () => {
    const d = udenKommentarer(laes(DOM));
    expect(formenHolder(d.replace('maal_uden_bevaegelse: "tilstand",', 'maal_uden_bevaegelse: "haendelse",'))).toBe(false);
    expect(formenHolder(d.replace("stilstand: 55,", "stilstand: 75,"))).toBe(false);
  });
  it("selvbevis 4: en migration med en set-kolonne fanges; ældre og andre tabeller ikke", () => {
    expect(ingenNyKolonne([{ sti: "supabase/migrations/20260918000000_x.sql", sql: "alter table public.pulse_checkins add column if not exists seen_at timestamptz;" }])).toHaveLength(1);
    expect(ingenNyKolonne([{ sti: "supabase/migrations/20260918000000_x.sql", sql: "alter table public.milestones add column laest_af uuid;" }])).toHaveLength(1);
    expect(ingenNyKolonne([{ sti: "supabase/migrations/20260918000000_x.sql", sql: "alter table public.companies add column seen_at timestamptz;" }])).toHaveLength(0);
    expect(ingenNyKolonne([{ sti: "supabase/migrations/20260901000000_x.sql", sql: "alter table public.milestones add column seen_at timestamptz;" }])).toHaveLength(0);
  });
});
