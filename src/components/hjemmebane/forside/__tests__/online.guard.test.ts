import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ONLINE_KANAL } from "@/lib/hjemmebane/online";
import { RAADGIVER_KILDE_ORD, raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { HentningsFejl } from "@/lib/kraevRaekker";

// Kildeværn (16/9-2026): «Online nu» — medlemmer i realtid på rådgiverens
// forside (Jonas: «Ja» — kun rådgivere ser hvem der har appen åben; legat og
// gæster vises, legat mærket). Realtime-kode og JSX har ingen ren funktion at
// kalde (ubesvaredeOpslag.guard-mønstret), så syv ting læses i kilden:
//   1. Migrationens emne-literal = ONLINE_KANAL; INSERT for presence uden
//      rolle-gate (medlemmer tracker sig selv), SELECT kun med has_role advisor.
//   2. Medlemmets kanal: private: true, presence { key: user.id, enabled: true },
//      track() ét sted og kun i SUBSCRIBED-grenen, untrack + removeChannel i
//      cleanup, intet ved visibilitychange.
//   3. Rådgiverens kanal: private: true, ALDRIG track, læser presenceState
//      gennem onlineIds, og status fejl ved CHANNEL_ERROR/TIMED_OUT/CLOSED.
//   4. Fladen: fejlgrenen står FØR tom-teksten; kilden realtime_presence;
//      dommen er onlineMedlemmer; billederne er HbAvatar med onlineTitel.
//   5. De otte eksisterende postgres_changes-kanaler er urørte (ingen private).
//   6. Hooks i topblokken: skallen tracker på useAuth's rå isAdvisor (ikke
//      viewingAsMember); forsidens hook står før den første betingede return.
//   7. Ordbogen: realtime_presence → «hvem der er online».
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem på
// kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/--[^\n]*/g, "");

const MIGRATION = "supabase/migrations/20260917100000_online_presence.sql";
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

/** Dom 1: emnet i SQL'en = konstanten; INSERT uden rolle, SELECT med has_role advisor; kun presence. */
export const migrationenPasser = (sql: string): boolean => {
  const emner = [...sql.matchAll(/realtime\.topic\(\)\)\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  const politikker = sql.split(/create policy/i).slice(1);
  const insert = politikker.find((p) => /for insert/i.test(p));
  const select = politikker.find((p) => /for select/i.test(p));
  return emner.length === 2 && emner.every((e) => e === ONLINE_KANAL) &&
    politikker.length === 2 && !!insert && !!select &&
    /to authenticated/i.test(insert) && /extension = 'presence'/.test(insert) && !/has_role/.test(insert) &&
    /to authenticated/i.test(select) && /extension = 'presence'/.test(select) && /public\.has_role\(\(select auth\.uid\(\)\), 'advisor'::app_role\)/.test(select) &&
    !/drop policy/i.test(sql);
};

/** Dom 2: medlemmets kanal. */
export const medlemmetTrackerRigtigt = (k: string): boolean => {
  const trackKald = k.match(/\.track\(/g) ?? [];
  const gren = k.slice(k.indexOf('if (status === "SUBSCRIBED") {'), k.indexOf("}", k.indexOf('if (status === "SUBSCRIBED") {')));
  const cleanup = k.slice(k.indexOf("return () => {"));
  return k.includes("config: { private: true, presence: { key: userId, enabled: true } }") &&
    trackKald.length === 1 && gren.includes(".track(") &&
    cleanup.includes(".untrack()") && cleanup.includes("removeChannel(channel)") &&
    !/visibilitychange/.test(k);
};

/** Dom 3: rådgiverens kanal. */
export const raadgiverenLytterKun = (k: string): boolean =>
  k.includes("{ config: { private: true } }") &&
  !/\.track\(/.test(k) &&
  k.includes("onlineIds(channel.presenceState())") &&
  k.includes('if (s === "SUBSCRIBED") setStatus("live");') &&
  k.includes('else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("fejl");');

/** Blokken i fladen: fra kanal-fejlgrenen til Ubesvarede opslag.
    17/9 (PR 2, højre efter tid): var «til Pulsen» — Pulsen står nu i
    «Måneden»; Online følges af Ubesvarede opslag i «I dag». */
export function onlineBlok(flade: string): string {
  const start = flade.indexOf('if (online.status === "fejl") {');
  const slut = flade.indexOf("{KORT_OVERSKRIFT}", start);
  if (start === -1 || slut === -1) return "";
  return flade.slice(start, slut);
}

/** Dom 4: fladen — fejl før tom, husets kilde, dommen og billederne. */
export const fladenSigerFejlFoerTom = (flade: string): boolean => {
  const blok = onlineBlok(flade);
  const fejl = blok.indexOf('new HentningsFejl("realtime_presence"');
  const opslagsfejl = blok.indexOf('raadgiverHentefejlTekst(onlineQuery.error, "forsiden")');
  const tom = blok.indexOf("{INGEN_ONLINE_TEKST}");
  return blok !== "" && fejl !== -1 && opslagsfejl !== -1 && tom !== -1 && fejl < tom && opslagsfejl < tom &&
    blok.includes("onlineMedlemmer({ ids: online.ids, ...onlineQuery.data })") &&
    blok.includes("<HbAvatar navn={m.navn} avatarUrl={m.avatar_url}") &&
    blok.includes("title={onlineTitel(m)}") &&
    blok.includes("onlineUdsnit(liste)") &&
    !/\.filter\(/.test(blok);
};

/** Dom 5: de otte kanaler er urørte. */
export const deOtteErUroerte = (kilder: readonly string[]): boolean => {
  const kald = kilder.reduce((n, k) => n + (k.match(/\.channel\(/g) ?? []).length, 0);
  return kald === 8 && kilder.every((k) => !/private:\s*true/.test(k) && !/\.track\(/.test(k));
};

/** Dom 6: skallen tracker på rå isAdvisor og ikke på viewingAsMember. */
export const skallenTrackerRigtigt = (skal: string): boolean =>
  skal.includes("useOnlineTracking(!!user && !isAdvisor, user?.id);") &&
  skal.indexOf("useOnlineTracking(") < skal.indexOf("\n  return (") &&
  !/viewingAsMember/.test(skal);

describe("online.guard — «Online nu» på rådgiverens forside", () => {
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const tracking = udenKommentarer(laes(TRACKING));
  const lytter = udenKommentarer(laes(LYTTER));
  const flade = udenKommentarer(laes(FLADE));
  const skal = udenKommentarer(laes(SKAL));
  const deOtte = DE_OTTE.map((s) => udenKommentarer(laes(s)));

  it("1. migrationen: emnet = ONLINE_KANAL, INSERT for medlemmer, SELECT kun for rådgivere, kun presence, ingen DROP", () => {
    expect(migrationenPasser(sql)).toBe(true);
    expect(laes(MIGRATION)).toContain("JONAS 16/9 (ordret): «Ja»");
    expect(laes(MIGRATION)).toContain("IKKE KØRT");
  });
  it("2. medlemmet: private, presence { key: user.id, enabled: true }, track kun i SUBSCRIBED og ét sted, untrack + removeChannel i cleanup, intet ved visibilitychange", () => {
    expect(medlemmetTrackerRigtigt(tracking)).toBe(true);
  });
  it("3. rådgiveren: private, tracker aldrig, læser presenceState gennem onlineIds, fejl ved CHANNEL_ERROR/TIMED_OUT/CLOSED", () => {
    expect(raadgiverenLytterKun(lytter)).toBe(true);
    expect(lytter).toContain('kraevRaekker(profilRes, "profiles")');
    expect(lytter).toContain('kraevRaekker(raadgivereRes, "get_all_advisor_profiles")');
  });
  it("4. fladen: fejlgren (kanal og opslag) FØR tom-teksten, dommen er onlineMedlemmer, billederne er HbAvatar med onlineTitel", () => {
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
  it("7. ordbogen: realtime_presence → «Hvem der er online kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.»", () => {
    expect(RAADGIVER_KILDE_ORD.realtime_presence).toBe("hvem der er online");
    expect(raadgiverHentefejlTekst(new HentningsFejl("realtime_presence", "x"), "forsiden")).toBe("Hvem der er online kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.");
  });
});

describe("online.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const tracking = udenKommentarer(laes(TRACKING));
  const lytter = udenKommentarer(laes(LYTTER));
  const flade = udenKommentarer(laes(FLADE));
  const skal = udenKommentarer(laes(SKAL));

  it("1. et andet emne i SQL'en, eller en SELECT uden has_role, fælder dom 1", () => {
    expect(migrationenPasser(sql.replace("= 'online-medlemmer'\n    and realtime.messages.extension = 'presence'\n    and public.has_role", "= 'online'\n    and realtime.messages.extension = 'presence'\n    and public.has_role"))).toBe(false);
    expect(migrationenPasser(sql.replace("and public.has_role((select auth.uid()), 'advisor'::app_role)", ""))).toBe(false);
  });
  it("2. track uden for SUBSCRIBED, uden enabled: true, eller uden untrack fælder dom 2", () => {
    expect(medlemmetTrackerRigtigt(tracking.replace("channel.subscribe(", "void channel.track({});\n    channel.subscribe("))).toBe(false);
    expect(medlemmetTrackerRigtigt(tracking.replace("presence: { key: userId, enabled: true }", "presence: { key: userId }"))).toBe(false);
    expect(medlemmetTrackerRigtigt(tracking.replace("void channel.untrack().finally(() => {\n        void supabase.removeChannel(channel);\n      });", "void supabase.removeChannel(channel);"))).toBe(false);
  });
  it("3. en rådgiverkanal der tracker, eller ikke er privat, fælder dom 3", () => {
    expect(raadgiverenLytterKun(lytter.replace('if (s === "SUBSCRIBED") setStatus("live");', 'if (s === "SUBSCRIBED") { setStatus("live"); void channel.track({}); }'))).toBe(false);
    expect(raadgiverenLytterKun(lytter.replace("{ config: { private: true } }", "{}"))).toBe(false);
  });
  it("4. en flade uden kanal-fejlgren, eller med egen filtrering, fælder dom 4", () => {
    expect(fladenSigerFejlFoerTom(flade.replace('new HentningsFejl("realtime_presence", "kanalen kunne ikke åbnes")', "new Error()"))).toBe(false);
    expect(fladenSigerFejlFoerTom(flade.replace("onlineMedlemmer({ ids: online.ids, ...onlineQuery.data })", "onlineQuery.data.profiler.filter((p) => p.full_name)"))).toBe(false);
  });
  it("6. en skal der gater på viewingAsMember fælder dom 6", () => {
    expect(skallenTrackerRigtigt(skal.replace("useOnlineTracking(!!user && !isAdvisor, user?.id);", "useOnlineTracking(!!user && (!isAdvisor || viewingAsMember), user?.id);"))).toBe(false);
  });
});
