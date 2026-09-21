import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for svargrupperne og rådgiverens oversigt (udkast 21/9). Seks
 * domme, hver med selvbevis på en muteret kopi:
 *   1. SQL-funktionen event_svar_grupper dømmer med SAMME regel som
 *      _shared/eventSvar.ts: har_aktivt_medlemskab (events-RLS), aldrig
 *      rådgivere (has_role advisor), aktiv række = cancelled_at null,
 *      attending → tilmeldt, declined → kan_ikke, ellers har_ikke_svaret.
 *      EXECUTE kun til service_role.
 *   2. get_event_svaroversigt AFVISER SELV alle uden rollen: første sætning
 *      efter begin er «if not has_role(auth.uid(), 'advisor') then raise
 *      exception»; security definer + search_path; bygger på (1); grant til
 *      authenticated, ingen til anon.
 *   3. Migrationen er bogført KØRT i prod (21/9 14:27, FØR merge — filhovedet rettet ved
 *      ilægningen 21/9; var «IKKE KØRT» indtil da).
 *   4. Medlemsfladen kalder aldrig den nye RPC: akademiApi.ts og
 *      medlemskomponenterne under events/ (uden EventSvaroversigt) nævner
 *      ikke get_event_svaroversigt; kun eventSvarApi.ts kalder den.
 *   5. Oversigten står KUN bag isAdvisor i EventDetailView, og komponenten
 *      svarer selv null uden rollen.
 *   6. flyt-event henter modtagerne fra event_svar_grupper (rpc) FØR UPDATE
 *      og sender tekst A og B (flyttetBesked/nytTidspunktBesked) EFTER.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenSqlKommentarer = (k: string) => k.replace(/^\s*--[^\n]*$/gm, "");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MIGRATION = "supabase/migrations/20260921210000_event_svar_grupper.sql";
const DOM = "supabase/functions/_shared/eventSvar.ts";
const FUNKTION = "supabase/functions/flyt-event/index.ts";
const MEDLEMS_API = "src/lib/hjemmebane/akademiApi.ts";
const OVERSIGT_API = "src/lib/hjemmebane/eventSvarApi.ts";
const DETALJE = "src/components/hjemmebane/events/EventDetailView.tsx";
const REGISTER = "src/components/hjemmebane/events/EventRegisterAction.tsx";
const OVERSIGT = "src/components/hjemmebane/events/EventSvaroversigt.tsx";

export const sqlDoemmerSammeRegel = (sql: string): string[] => {
  const k = udenSqlKommentarer(sql);
  const f = k.slice(k.indexOf("create or replace function public.event_svar_grupper"), k.indexOf("create or replace function public.get_event_svaroversigt"));
  const fejl: string[] = [];
  if (!f.includes("public.har_aktivt_medlemskab(cm.user_id)")) fejl.push("adgangen er ikke har_aktivt_medlemskab (events-RLS)");
  if (/is_membership_active|legat_enrollments/.test(f)) fejl.push("bruger publiceringsmailens regel (is_membership_active/legat_enrollments)");
  if (!f.includes("not public.has_role(cm.user_id, 'advisor')")) fejl.push("rådgivere udelukkes ikke");
  if (!f.includes("and er.cancelled_at is null")) fejl.push("den aktive række er ikke cancelled_at null");
  if (!f.includes("when a.response = 'attending' then 'tilmeldt'")) fejl.push("attending → tilmeldt mangler");
  if (!f.includes("when a.response = 'declined'  then 'kan_ikke'")) fejl.push("declined → kan_ikke mangler");
  if (!f.includes("else 'har_ikke_svaret'")) fejl.push("resten → har_ikke_svaret mangler");
  if (!/security definer\s+set search_path = public/.test(f)) fejl.push("ikke definer + search_path");
  if (!k.includes("revoke all on function public.event_svar_grupper(uuid) from authenticated;")) fejl.push("authenticated må kalde grupperne direkte");
  if (!k.includes("grant execute on function public.event_svar_grupper(uuid) to service_role;")) fejl.push("service_role mangler execute");
  return fejl;
};

export const oversigtenAfviserSelv = (sql: string): string[] => {
  const k = udenSqlKommentarer(sql);
  const f = k.slice(k.indexOf("create or replace function public.get_event_svaroversigt"));
  const fejl: string[] = [];
  const begin = f.indexOf("begin");
  const efterBegin = f.slice(begin + "begin".length).trim();
  if (!efterBegin.startsWith("if not has_role(auth.uid(), 'advisor') then")) fejl.push("første sætning er ikke rolletjekket");
  if (!/if not has_role\(auth\.uid\(\), 'advisor'\) then\s+raise exception/.test(efterBegin)) fejl.push("rolletjekket kaster ikke");
  if (!/security definer\s+set search_path = public/.test(f.slice(0, begin))) fejl.push("ikke definer + search_path");
  if (!f.includes("from public.event_svar_grupper(p_event_id) g")) fejl.push("bygger ikke på event_svar_grupper (to regler)");
  if (!f.includes("grant execute on function public.get_event_svaroversigt(uuid) to authenticated;")) fejl.push("authenticated mangler execute");
  if (!f.includes("revoke all on function public.get_event_svaroversigt(uuid) from anon;")) fejl.push("anon er ikke frataget");
  return fejl;
};

export const medlemsfladenKalderAldrig = (api: string, detalje: string, register: string): boolean =>
  !api.includes("get_event_svaroversigt") && !detalje.includes("get_event_svaroversigt") && !register.includes("get_event_svaroversigt") &&
  !api.includes("hentEventSvaroversigt") && !register.includes("EventSvaroversigt");

export const kunBagIsAdvisor = (detalje: string, oversigt: string): boolean =>
  detalje.includes("{isAdvisor && <EventSvaroversigt eventId={eventId} />}") &&
  (detalje.split("<EventSvaroversigt").length - 1) === 1 &&
  oversigt.includes("if (!isAdvisor) return null;") &&
  oversigt.includes("enabled: !!user && isAdvisor === true,");

export const flytEventSenderTilBegge = (k: string): string[] => {
  const fejl: string[] = [];
  const rpc = k.indexOf('admin.rpc("event_svar_grupper", { p_event_id: eventId })');
  const update = k.indexOf('.from("events").update(patch)');
  const a = k.indexOf("flyttetBesked(tilMail, event.starts_at)");
  const b = k.indexOf("nytTidspunktBesked(tilMail, event.starts_at)");
  if (rpc < 0) fejl.push("modtagerne hentes ikke fra event_svar_grupper");
  if (/\.from\("event_registrations"\)/.test(k)) fejl.push("læser event_registrations direkte (egen regel)");
  if (!k.includes("delModtagere(")) fejl.push("deler ikke med delModtagere");
  if (!(rpc < update && update < a && update < b)) fejl.push("rækkefølgen er ikke modtagere → UPDATE → A og B");
  if (a < 0 || b < 0) fejl.push("tekst A eller B mangler");
  return fejl;
};

describe("eventSvar.guard", () => {
  it("1. SQL'en dømmer med samme regel som eventSvar.ts, og kun service_role må kalde den", () => expect(sqlDoemmerSammeRegel(laes(MIGRATION))).toEqual([]));
  it("2. get_event_svaroversigt afviser selv alle uden rollen og bygger på grupperne", () => expect(oversigtenAfviserSelv(laes(MIGRATION))).toEqual([]));
  it("3. migrationen er bogført KØRT i prod (14:27)", () => expect(laes(MIGRATION).startsWith("-- KØRT i prod — 21/9-2026 kl. 14:27")).toBe(true));
  it("4. medlemsfladen kalder aldrig den nye RPC — kun eventSvarApi.ts gør", () => {
    expect(medlemsfladenKalderAldrig(udenKommentarer(laes(MEDLEMS_API)), udenKommentarer(laes(DETALJE)), udenKommentarer(laes(REGISTER)))).toBe(true);
    expect(udenKommentarer(laes(OVERSIGT_API))).toContain('supabase.rpc("get_event_svaroversigt" as any');
  });
  it("5. oversigten står kun bag isAdvisor, og komponenten svarer selv null uden rollen", () => expect(kunBagIsAdvisor(udenKommentarer(laes(DETALJE)), udenKommentarer(laes(OVERSIGT)))).toBe(true));
  it("6. flyt-event: modtagerne fra event_svar_grupper før UPDATE, tekst A og B efter", () => expect(flytEventSenderTilBegge(udenKommentarer(laes(FUNKTION)))).toEqual([]));
  it("dommens ord i eventSvar.ts og SQL'en peger på samme prædikater", () => {
    const dom = laes(DOM);
    for (const ord of ["har_aktivt_medlemskab", "cancelled_at", "attending", "declined", "har_ikke_svaret", "kan_ikke", "tilmeldt"]) expect(dom).toContain(ord);
  });
});

describe("eventSvar.guard — selvbevis", () => {
  it("1: publiceringsmailens regel, en manglende rådgiver-udelukkelse eller execute til authenticated falder", () => {
    const sql = laes(MIGRATION);
    expect(sqlDoemmerSammeRegel(sql.replace("public.har_aktivt_medlemskab(cm.user_id)", "public.is_membership_active(public.user_company_id(cm.user_id))"))).not.toEqual([]);
    expect(sqlDoemmerSammeRegel(sql.replace("and not public.has_role(cm.user_id, 'advisor')", ""))).not.toEqual([]);
    expect(sqlDoemmerSammeRegel(sql.replace("revoke all on function public.event_svar_grupper(uuid) from authenticated;", "grant execute on function public.event_svar_grupper(uuid) to authenticated;"))).not.toEqual([]);
  });
  it("2: rolletjekket fjernet, eller en egen regel i oversigten, falder", () => {
    const sql = laes(MIGRATION);
    expect(oversigtenAfviserSelv(sql.replace(/ {2}if not has_role\(auth\.uid\(\), 'advisor'\) then\n {4}raise exception[^\n]*\n {2}end if;\n/, ""))).not.toEqual([]);
    expect(oversigtenAfviserSelv(sql.replace("from public.event_svar_grupper(p_event_id) g", "from public.event_registrations g"))).not.toEqual([]);
  });
  it("3: et filhoved tilbage på IKKE KØRT falder — migrationen ER kørt (14:27)", () => {
    expect(laes(MIGRATION).replace("-- KØRT i prod — 21/9-2026 kl. 14:27", "-- IKKE KØRT. DEPLOY:").startsWith("-- KØRT i prod — 21/9-2026 kl. 14:27")).toBe(false);
  });
  it("4: akademiApi.ts der kalder RPC'en falder", () => {
    expect(medlemsfladenKalderAldrig(`${laes(MEDLEMS_API)}\nsupabase.rpc("get_event_svaroversigt")`, laes(DETALJE), laes(REGISTER))).toBe(false);
  });
  it("5: oversigten uden isAdvisor-gate, eller uden eget null, falder", () => {
    expect(kunBagIsAdvisor(laes(DETALJE).replace("{isAdvisor && <EventSvaroversigt eventId={eventId} />}", "<EventSvaroversigt eventId={eventId} />"), laes(OVERSIGT))).toBe(false);
    expect(kunBagIsAdvisor(laes(DETALJE), laes(OVERSIGT).replace("if (!isAdvisor) return null;", ""))).toBe(false);
  });
  it("6: event_registrations læst direkte, eller besked før UPDATE, falder", () => {
    const k = udenKommentarer(laes(FUNKTION));
    expect(flytEventSenderTilBegge(k.replace('admin.rpc("event_svar_grupper", { p_event_id: eventId })', 'admin.from("event_registrations").select("user_id")'))).not.toEqual([]);
    const foer = k.replace('.from("events").update(patch)', '.from("events").select("id")') + '\nawait admin.from("events").update(patch).eq("id", eventId);\n';
    expect(flytEventSenderTilBegge(foer)).not.toEqual([]);
  });
});
