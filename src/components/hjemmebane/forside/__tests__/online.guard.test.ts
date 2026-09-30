import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ONLINE_FRISKE_FUNKTION,
  ONLINE_GENHENT_MS,
  ONLINE_HJERTESLAG_MS,
  ONLINE_MIN_AFSTAND_MS,
  ONLINE_TABEL,
  ONLINE_VINDUE_S,
  vinduetHolder,
} from "@/lib/hjemmebane/online";
import { RAADGIVER_KILDE_ORD, raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { HentningsFejl } from "@/lib/kraevRaekker";

// Kildeværn (16/9-2026; HJERTESLAG 30/9-2026): «Online nu» — medlemmer på
// rådgiverens forside (Jonas: «Ja» — kun rådgivere ser hvem der har appen
// åben; legat og gæster vises, legat mærket). Presence-kanalen viste aldrig
// et navn (Jonas 30/9; recon-online-nu.md) og er erstattet af hjerteslag i
// tabellen online_hjerteslag (migration 20260930120000). Hooks og JSX har
// ingen ren funktion at kalde (ubesvaredeOpslag.guard-mønstret), så ni ting
// læses i kilden:
//   1. Den nye migration: første linje IKKE KØRT; tabellen = ONLINE_TABEL med
//      RLS; præcis fire PERMISSIVE politikker — INSERT/UPDATE kun egen række
//      (user_id = auth.uid(), UPDATE også WITH CHECK), SELECT egen række
//      (upsert kræver den), SELECT kun med has_role advisor; ingen DELETE-
//      politik, DELETE/TRUNCATE tilbagekaldt; serverens ur (trigger now());
//      friske-funktionen = ONLINE_FRISKE_FUNKTION; INGEN security definer,
//      ingen DROP, intet om realtime.messages. Den gamle Presence-migration
//      står urørt.
//   2. Medlemmet skriver KUN egen række: ét upsert({ user_id: userId }), ingen
//      tid fra klienten, skalSlaa over document.visibilityState, interval
//      ONLINE_HJERTESLAG_MS, stop (clearInterval + removeEventListener) i
//      cleanup, fail-soft (try/catch, ingen toast).
//   3. Rådgiveren: friske-funktionen med ONLINE_VINDUE_S gennem kraevRaekker,
//      refetchInterval ONLINE_GENHENT_MS + ved fokus, status fejl/live/henter,
//      skriver aldrig.
//   4. Fladen: fejlgrenen står FØR tallet; kilden online_hjerteslag;
//      dommen er onlineMedlemmer; billederne er HbAvatar med onlineTitel.
//   5. De otte eksisterende postgres_changes-kanaler er urørte (ingen private).
//   6. Hooks i topblokken: skallen slår hjerteslag på useAuth's rå
//      isAdvisor (ikke viewingAsMember); forsidens hook før første return.
//   7. Ordbogen: online_hjerteslag → «hvem der er online»; realtime_presence er væk.
//   8. Ingen realtime-kanal tilbage i «Online nu»-koden.
//   9. Vinduet: husets tal holder (interval + mindste afstand < vinduet).
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem på
// kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260930120000_online_hjerteslag.sql";
const GAMMEL_MIGRATION = "supabase/migrations/20260917100000_online_presence.sql";
const FOERSTE_LINJE = "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";
const REN = "src/lib/hjemmebane/online.ts";
const TRACKING = "src/hooks/onlineTracking.ts";
const LYTTER = "src/hooks/onlineMedlemmer.ts";
const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const SKAL = "src/components/hjemmebane/HbMemberShell.tsx";
const DE_OTTE = [
  "src/components/AdvisorNotifications.tsx",
  "src/components/MemberChatPane.tsx",
  "src/components/CompanyChatPane.tsx",
  "src/components/AppSidebar.tsx",
  "src/hooks/useAdvisorNotifications.ts",
  "src/hooks/useNotifications.ts",
  "src/hooks/useMessageReactions.ts",
];

const EGEN = "user_id = (select auth.uid())";

/** Dom 1: den nye migration (uden kommentarer). */
export const migrationenPasser = (sql: string): boolean => {
  const politikker = sql.split(/create policy/i).slice(1).map((p) => p.slice(0, p.indexOf(";")));
  const af = (cmd: string) => politikker.filter((p) => new RegExp(`for ${cmd}\\b`, "i").test(p));
  const insert = af("insert");
  const update = af("update");
  const select = af("select");
  const selectEgen = select.filter((p) => p.includes(`using (${EGEN})`) && !/has_role/.test(p));
  const selectRaadgiver = select.filter((p) => /using \(public\.has_role\(\(select auth\.uid\(\)\), 'advisor'::app_role\)\)/.test(p));
  return new RegExp(`create table public\\.${ONLINE_TABEL} \\(`).test(sql) &&
    new RegExp(`alter table public\\.${ONLINE_TABEL} enable row level security;`).test(sql) &&
    politikker.length === 4 &&
    politikker.every((p) => new RegExp(`on public\\.${ONLINE_TABEL}\\b`).test(p) && /to authenticated/i.test(p) && !/as restrictive/i.test(p)) &&
    insert.length === 1 && insert[0].includes(`with check (${EGEN})`) && !/using/i.test(insert[0]) &&
    update.length === 1 && update[0].includes(`using (${EGEN})`) && update[0].includes(`with check (${EGEN})`) &&
    select.length === 2 && selectEgen.length === 1 && selectRaadgiver.length === 1 &&
    af("delete").length === 0 && af("all").length === 0 &&
    new RegExp(`revoke delete, truncate on table public\\.${ONLINE_TABEL} from authenticated;`).test(sql) &&
    new RegExp(`revoke all on table public\\.${ONLINE_TABEL} from anon;`).test(sql) &&
    /new\.sidst_set := now\(\);/.test(sql) && /before insert or update on public\.online_hjerteslag/.test(sql) &&
    new RegExp(`create function public\\.${ONLINE_FRISKE_FUNKTION}\\(vindue_sekunder integer\\)`).test(sql) &&
    /security invoker/i.test(sql) &&
    !/security definer/i.test(sql) && !/drop /i.test(sql) && !/realtime\./i.test(sql);
};

/** Dom 2: medlemmet skriver kun egen række, kun med synlig fane, stopper ved afmontering. */
export const medlemmetSkriverKunEgen = (k: string): boolean => {
  const skriv = k.match(/\.(upsert|insert|update|delete|rpc)\(/g) ?? [];
  const cleanup = k.slice(k.indexOf("return () => {"));
  return skriv.length === 1 &&
    k.includes('.upsert({ user_id: userId }, { onConflict: "user_id" })') &&
    k.includes("supabase.from(ONLINE_TABEL as never)") &&
    !/sidst_set/.test(k) &&
    k.includes('skalSlaa({ synlig: document.visibilityState === "visible", nuMs, sidsteMs: sidsteSlagMs })') &&
    k.includes("window.setInterval(slag, ONLINE_HJERTESLAG_MS)") &&
    k.includes('document.addEventListener("visibilitychange", vedSynlighed)') &&
    cleanup.includes("window.clearInterval(timer)") &&
    cleanup.includes('document.removeEventListener("visibilitychange", vedSynlighed)') &&
    /try \{[\s\S]*\.upsert\([\s\S]*\} catch \{/.test(k) &&
    !/toast/.test(k);
};

/** Dom 3: rådgiveren læser friske hjerteslag og skriver aldrig. */
export const raadgiverenLaeserKun = (k: string): boolean =>
  k.includes("supabase.rpc(ONLINE_FRISKE_FUNKTION as never, { vindue_sekunder: ONLINE_VINDUE_S } as never)") &&
  k.includes("onlineIds(kraevRaekker(res, ONLINE_TABEL))") &&
  k.includes("refetchInterval: ONLINE_GENHENT_MS,") &&
  k.includes("refetchOnWindowFocus: true,") &&
  k.includes('const status: OnlineStatus = q.isError ? "fejl" : q.data ? "live" : "henter";') &&
  !/\.(upsert|insert|update|delete)\(/.test(k);

/** Dom 8: ingen realtime-kanal tilbage i «Online nu»-koden. */
export const ingenKanalTilbage = (kilder: readonly string[]): boolean =>
  kilder.every((k) => !/\.channel\(|presenceState|removeChannel|\.track\(|ONLINE_KANAL|private:\s*true/.test(k));

/** Blokken i fladen: fra kanal-fejlgrenen til Ubesvarede opslag.
    17/9 (PR 2, højre efter tid): var «til Pulsen» — Pulsen står nu i
    «Måneden»; Online følges af Ubesvarede opslag i «I dag». */
export function onlineBlok(flade: string): string {
  const start = flade.indexOf('if (online.status === "fejl") {');
  // 30/9 (redesign af højre kolonne, «I dag» som felter): kæden er flyttet
  // ud af JSX'en og står i udledningen før iDag — den slutter, hvor opslagene
  // begynder. Før: «til {KORT_OVERSKRIFT}» i JSX'en.
  const slut = flade.indexOf("const opslagDom =", start);
  if (start === -1 || slut === -1) return "";
  return flade.slice(start, slut);
}

/** Feltet «Online nu» i gitteret med profilbillederne (30/9). */
export function onlineFelt(flade: string): string {
  const start = flade.indexOf('<TalFelt slags="online"');
  const slut = flade.indexOf("</TalFelt>", start);
  if (start === -1 || slut === -1) return "";
  return flade.slice(start, slut);
}

/** Dom 4: fladen — fejl før tom, husets kilde, dommen og billederne.
    RETTET 30/9 (redesign): «tom» er ikke længere INGEN_ONLINE_TEKST i
    JSX'en, men feltets tal (`{ art: "tal", antal: onlineListe.length }`),
    der tegnes som «0 · Ingen lige nu» (lib/hjemmebane/hoejreKolonne). Dommen
    er den samme: kanalfejl og opslagsfejl (med husets tekst) kommer FØR
    tallet, så en fejl aldrig ligner «ingen online». Billederne står i
    feltet, højst ONLINE_FELT_LOFT (fem i et halvt gitter) + «+N». */
export const fladenSigerFejlFoerTom = (flade: string): boolean => {
  const blok = onlineBlok(flade);
  const felt = onlineFelt(flade);
  const fejl = blok.indexOf('new HentningsFejl("online_hjerteslag"');
  const opslagsfejl = blok.indexOf('raadgiverHentefejlTekst(onlineQuery.error, "forsiden")');
  const tom = blok.indexOf('onlineFelt = { art: "tal", antal: onlineListe.length };');
  return blok !== "" && felt !== "" && fejl !== -1 && opslagsfejl !== -1 && tom !== -1 && fejl < tom && opslagsfejl < tom &&
    blok.includes("onlineMedlemmer({ ids: online.ids, ...onlineQuery.data })") &&
    felt.includes("<HbAvatar navn={m.navn} avatarUrl={m.avatar_url}") &&
    felt.includes("title={onlineTitel(m)}") &&
    felt.includes("onlineUdsnit(iDag.online.liste, ONLINE_FELT_LOFT)") &&
    !/\.filter\(/.test(blok) && !/\.filter\(/.test(felt);
};

/** Dom 5: de otte kanaler er urørte. */
export const deOtteErUroerte = (kilder: readonly string[]): boolean => {
  const kald = kilder.reduce((n, k) => n + (k.match(/\.channel\(/g) ?? []).length, 0);
  return kald === 8 && kilder.every((k) => !/private:\s*true/.test(k) && !/\.track\(/.test(k));
};

/** Dom 6: skallen slår hjerteslag på rå isAdvisor og ikke på viewingAsMember. */
export const skallenTrackerRigtigt = (skal: string): boolean =>
  skal.includes("useOnlineTracking(!!user && !isAdvisor, user?.id);") &&
  skal.indexOf("useOnlineTracking(") < skal.indexOf("\n  return (") &&
  !/viewingAsMember/.test(skal);

describe("online.guard — «Online nu» på rådgiverens forside", () => {
  const raaSql = laes(MIGRATION);
  const sql = udenSqlKommentarer(raaSql);
  const ren = udenKommentarer(laes(REN));
  const tracking = udenKommentarer(laes(TRACKING));
  const lytter = udenKommentarer(laes(LYTTER));
  const flade = udenKommentarer(laes(FLADE));
  const skal = udenKommentarer(laes(SKAL));
  const deOtte = DE_OTTE.map((s) => udenKommentarer(laes(s)));

  it("1. migrationen: IKKE KØRT først; RLS; INSERT/UPDATE kun egen række, SELECT egen + rådgiver, ingen DELETE; serverens ur; ingen security definer, ingen DROP; den gamle står", () => {
    expect(raaSql.split("\n")[0]).toBe(FOERSTE_LINJE);
    expect(migrationenPasser(sql)).toBe(true);
    expect(raaSql).toContain("kontakt@topix.dk");
    expect(existsSync(resolve(ROD, GAMMEL_MIGRATION))).toBe(true);
    expect(udenSqlKommentarer(laes(GAMMEL_MIGRATION)).match(/create policy/gi)?.length).toBe(2);
  });
  it("2. medlemmet: ét upsert af egen række, ingen tid fra klienten, kun med synlig fane, interval, stop ved afmontering, fail-soft", () => {
    expect(medlemmetSkriverKunEgen(tracking)).toBe(true);
  });
  it("3. rådgiveren: friske-funktionen med vinduet gennem kraevRaekker, genhentning + fokus, status fejl/live/henter, skriver aldrig", () => {
    expect(raadgiverenLaeserKun(lytter)).toBe(true);
    expect(lytter).toContain('kraevRaekker(profilRes, "profiles")');
    expect(lytter).toContain('kraevRaekker(raadgivereRes, "get_all_advisor_profiles")');
  });
  it("4. fladen: fejlgren (hjerteslag og opslag) FØR tallet, dommen er onlineMedlemmer, billederne er HbAvatar med onlineTitel", () => {
    expect(fladenSigerFejlFoerTom(flade)).toBe(true);
  });
  it("5. de otte eksisterende postgres_changes-kanaler er urørte — ingen private, ingen track", () => {
    expect(deOtteErUroerte(deOtte)).toBe(true);
  });
  it("6. hooks i topblokken: skallen på rå isAdvisor (ikke viewingAsMember); forsidens hook før første betingede return", () => {
    expect(skallenTrackerRigtigt(skal)).toBe(true);
    const krop = flade.slice(flade.indexOf("export const RaadgiverForsideView = () => {"));
    expect(krop.indexOf("const online = useOnlineMedlemmer(!!user);")).toBeLessThan(krop.indexOf("\n  if (isError) {"));
    expect(krop.indexOf("const onlineQuery = useQuery(")).toBeLessThan(krop.indexOf("\n  if (isError) {"));
  });
  it("7. ordbogen: online_hjerteslag → «Hvem der er online kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.»", () => {
    expect(RAADGIVER_KILDE_ORD.online_hjerteslag).toBe("hvem der er online");
    expect(RAADGIVER_KILDE_ORD.realtime_presence).toBeUndefined();
    expect(raadgiverHentefejlTekst(new HentningsFejl("online_hjerteslag", "x"), "forsiden")).toBe("Hvem der er online kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.");
  });
  it("8. ingen realtime-kanal tilbage i den rene dom, hooks og fladen", () => {
    expect(ingenKanalTilbage([ren, tracking, lytter, flade])).toBe(true);
  });
  it("9. vinduet: husets tal holder (60 s + 20 s < 150 s)", () => {
    expect(vinduetHolder({ hjerteslagMs: ONLINE_HJERTESLAG_MS, minAfstandMs: ONLINE_MIN_AFSTAND_MS, vindueS: ONLINE_VINDUE_S })).toBe(true);
    expect(ONLINE_GENHENT_MS).toBeLessThan(ONLINE_VINDUE_S * 1000);
  });
});

describe("online.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const ren = udenKommentarer(laes(REN));
  const tracking = udenKommentarer(laes(TRACKING));
  const lytter = udenKommentarer(laes(LYTTER));
  const flade = udenKommentarer(laes(FLADE));
  const skal = udenKommentarer(laes(SKAL));

  it("1. en INSERT uden egen-række-check, en UPDATE uden WITH CHECK, en SELECT for alle, en DELETE-politik, security definer, DROP eller en klient-tid fælder dom 1", () => {
    expect(migrationenPasser(sql.replace("for insert\n  to authenticated\n  with check (user_id = (select auth.uid()));", "for insert\n  to authenticated\n  with check (true);"))).toBe(false);
    expect(migrationenPasser(sql.replace("  using (user_id = (select auth.uid()))\n  with check (user_id = (select auth.uid()));", "  using (user_id = (select auth.uid()));"))).toBe(false);
    expect(migrationenPasser(sql.replace("using (public.has_role((select auth.uid()), 'advisor'::app_role));", "using (true);"))).toBe(false);
    expect(migrationenPasser(sql + '\ncreate policy "x" on public.online_hjerteslag for delete to authenticated using (user_id = (select auth.uid()));')).toBe(false);
    expect(migrationenPasser(sql.replace("  security invoker\n", "  security definer\n"))).toBe(false);
    expect(migrationenPasser(sql + "\ndrop policy if exists \"Medlemmer tracker sig i online-medlemmer\" on realtime.messages;")).toBe(false);
    expect(migrationenPasser(sql.replace("  new.sidst_set := now();\n", ""))).toBe(false);
    expect(migrationenPasser(sql.replace("revoke delete, truncate on table public.online_hjerteslag from authenticated;", ""))).toBe(false);
  });
  it("2. et medlem der skriver en andens række, sender sin egen tid, slår med skjult fane eller ikke stopper, fælder dom 2", () => {
    expect(medlemmetSkriverKunEgen(tracking.replace(".upsert({ user_id: userId }, ", ".upsert({ user_id: andenId }, "))).toBe(false);
    expect(medlemmetSkriverKunEgen(tracking.replace(".upsert({ user_id: userId }, ", ".upsert({ user_id: userId, sidst_set: new Date().toISOString() }, "))).toBe(false);
    expect(medlemmetSkriverKunEgen(tracking.replace('synlig: document.visibilityState === "visible"', "synlig: true"))).toBe(false);
    expect(medlemmetSkriverKunEgen(tracking.replace("      window.clearInterval(timer);\n", ""))).toBe(false);
    expect(medlemmetSkriverKunEgen(tracking.replace("  } catch {", "  } finally {"))).toBe(false);
    expect(medlemmetSkriverKunEgen(tracking.replace("void slaaHjerteslag(userId);", "void slaaHjerteslag(userId);\n      void supabase.from(ONLINE_TABEL as never).delete();"))).toBe(false);
  });
  it("3. en rådgiver uden vinduet, uden genhentning, der viser et gammelt svar ved fejl, eller skriver, fælder dom 3", () => {
    expect(raadgiverenLaeserKun(lytter.replace("{ vindue_sekunder: ONLINE_VINDUE_S }", "{ vindue_sekunder: 3600 }"))).toBe(false);
    expect(raadgiverenLaeserKun(lytter.replace("refetchInterval: ONLINE_GENHENT_MS,", ""))).toBe(false);
    expect(raadgiverenLaeserKun(lytter.replace('q.isError ? "fejl" : q.data ? "live" : "henter"', 'q.data ? "live" : q.isError ? "fejl" : "henter"'))).toBe(false);
    expect(raadgiverenLaeserKun(lytter.replace("export function useOnlineMedlemmer", 'void supabase.from("online_hjerteslag").upsert({});\nexport function useOnlineMedlemmer'))).toBe(false);
  });
  it("4. en flade uden fejlgren, eller med egen filtrering, fælder dom 4", () => {
    expect(fladenSigerFejlFoerTom(flade.replace('new HentningsFejl("online_hjerteslag", "hjerteslagene kunne ikke hentes")', "new Error()"))).toBe(false);
    expect(fladenSigerFejlFoerTom(flade.replace("onlineMedlemmer({ ids: online.ids, ...onlineQuery.data })", "onlineQuery.data.profiler.filter((p) => p.full_name)"))).toBe(false);
  });
  it("6. en skal der gater på viewingAsMember fælder dom 6", () => {
    expect(skallenTrackerRigtigt(skal.replace("useOnlineTracking(!!user && !isAdvisor, user?.id);", "useOnlineTracking(!!user && (!isAdvisor || viewingAsMember), user?.id);"))).toBe(false);
  });
  it("8. en Presence-kanal tilbage i nogen af filerne fælder dom 8", () => {
    expect(ingenKanalTilbage([ren, tracking, lytter + '\nsupabase.channel("online-medlemmer", { config: { private: true } });', flade])).toBe(false);
    expect(ingenKanalTilbage([ren, tracking.replace("slag();\n    const timer", "void channel.track({});\n    slag();\n    const timer"), lytter, flade])).toBe(false);
  });
});
