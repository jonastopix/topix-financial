import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for økonomi Ø2 (18/9-2026) — rollen partner («Kun mig og
// Morten», Jonas 17/9) og dashboardets RPC. Fire domme:
//   1. RPC'ens FØRSTE sætning er partner-tjekket: i hent_oekonomi_overblik
//      står «if not has_role(auth.uid(), 'partner') then raise exception»
//      umiddelbart efter begin — intet læses før.
//   2. kontrakter har ingen advisor-læsning: migration B dropper «Advisors
//      can view kontrakter» og opretter «Partners can view kontrakter» med
//      has_role(auth.uid(), 'partner'); ingen migration EFTER Ø1's
//      genopretter advisor-politikken.
//   3. PartnerRoute gater på isPartner (ikke isAdmin/isAdvisor), og
//      /oekonomi står bag den.
//   4. Menupunktet «Økonomi» findes kun bag isPartner i hbNav, og skallen
//      giver isPartner fra useAuth (aldrig isAdmin).
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/^\s*--[^\n]*/gm, "");

const MIG_B = "supabase/migrations/20260918120000_partner_roller_og_oekonomi_rpc.sql";
const MIG_OE1 = "supabase/migrations/20260918100000_kontrakter.sql";
const APP = "src/App.tsx";
const NAV = "src/lib/hjemmebane/hbNav.ts";
const SHELL = "src/components/hjemmebane/HbMemberShell.tsx";
const HOOK = "src/hooks/oekonomiOverblik.ts";
const OVERBLIK = "src/lib/oekonomi/overblik.ts";

/** Dom 1: første sætning i funktionens krop er partner-tjekket. */
export const foersteSaetningErPartnerTjek = (sql: string): boolean => {
  const start = sql.indexOf("create or replace function public.hent_oekonomi_overblik()");
  if (start === -1) return false;
  const krop = sql.slice(start);
  const begin = krop.indexOf("begin");
  if (begin === -1) return false;
  const efterBegin = krop.slice(begin + "begin".length).replace(/^\s+/, "");
  return efterBegin.startsWith("if not has_role(auth.uid(), 'partner') then") &&
    /if not has_role\(auth\.uid\(\), 'partner'\) then\s+raise exception/.test(efterBegin) &&
    /security definer\s+set search_path = public/.test(krop.slice(0, begin)) &&
    /revoke all on function public\.hent_oekonomi_overblik\(\) from anon;/.test(sql) &&
    /grant execute on function public\.hent_oekonomi_overblik\(\) to authenticated;/.test(sql);
};

/** Dom 2: kontrakter læses kun af partnere. */
export const kunPartnereLaeserKontrakter = (migB: string, migOe1: string): boolean =>
  migB.includes('drop policy if exists "Advisors can view kontrakter" on public.kontrakter;') &&
  /create policy "Partners can view kontrakter"\s+on public\.kontrakter for select to authenticated\s+using \(has_role\(auth\.uid\(\), 'partner'::app_role\)\);/.test(migB) &&
  !/create policy "Advisors can view kontrakter"/.test(migB) &&
  migOe1.includes('create policy "Advisors can view kontrakter"'); // Ø1 skabte den — B fjerner den

/** Dom 3: PartnerRoute på isPartner; /oekonomi bag den. */
export const partnerRouteHolder = (app: string): boolean => {
  const start = app.indexOf("const PartnerRoute = (");
  if (start === -1) return false;
  const krop = app.slice(start, app.indexOf("};", start));
  return krop.includes("const { user, loading, isPartner } = useAuth();") &&
    krop.includes('if (!isPartner) return <Navigate to="/" replace />;') &&
    !/isAdmin|isAdvisor/.test(krop) &&
    app.includes('<Route path="/oekonomi" element={<PartnerRoute><Oekonomi /></PartnerRoute>} />');
};

/** Dom 4: «Økonomi» kun bag isPartner; skallen giver isPartner fra useAuth. */
export const menupunktKunForPartnere = (nav: string, shell: string): boolean => {
  const forekomster = nav.match(/label: "Økonomi"/g) ?? [];
  return forekomster.length === 1 &&
    nav.includes('...(isPartner === true ? [{ label: "Økonomi", to: "/oekonomi", active: active === "oekonomi" }] : []),') &&
    nav.includes("if (isAdvisor) return raadgiverensNav(active, isPartner === true);") &&
    nav.indexOf('label: "Økonomi"') > nav.indexOf("export function raadgiverensNav(") &&
    nav.indexOf('label: "Økonomi"') < nav.indexOf("export function bygHbNav(") &&
    shell.includes("const { user, profile, signOut, membershipTier, isAdvisor, isPartner } = useAuth();") &&
    shell.includes("bygHbNav({ isAdvisor, erAbonnent, active, isPartner })");
};

/** Dom 5 (tillæg): hooket kalder præcis RPC'en og kun for partnere. */
export const hooketKalderRpcKunForPartnere = (hook: string, overblik: string): boolean =>
  overblik.includes('export const OEKONOMI_RPC = "hent_oekonomi_overblik" as const;') &&
  hook.includes("await supabase.rpc(OEKONOMI_RPC)") &&
  hook.includes("enabled: !!user && isPartner === true,") &&
  !/\.from\("kontrakter"\)/.test(hook);

describe("oekonomiPartner.guard — Ø2: partner-tjek først, kun partnere læser kontrakter, PartnerRoute, menupunktet", () => {
  const migB = udenSqlKommentarer(laes(MIG_B));
  const migOe1 = udenSqlKommentarer(laes(MIG_OE1));
  const app = udenKommentarer(laes(APP));
  const nav = udenKommentarer(laes(NAV));
  const shell = udenKommentarer(laes(SHELL));
  const hook = udenKommentarer(laes(HOOK));
  const overblik = udenKommentarer(laes(OVERBLIK));

  it("dom 1: hent_oekonomi_overblik begynder med has_role(auth.uid(), 'partner'); definer + search_path; anon uden execute", () => {
    expect(foersteSaetningErPartnerTjek(migB)).toBe(true);
  });
  it("dom 2: «Advisors can view kontrakter» droppes, «Partners can view kontrakter» oprettes", () => {
    expect(kunPartnereLaeserKontrakter(migB, migOe1)).toBe(true);
  });
  it("dom 3: PartnerRoute bruger isPartner og gater /oekonomi", () => {
    expect(partnerRouteHolder(app)).toBe(true);
  });
  it("dom 4: «Økonomi» står præcis ét sted, bag isPartner; skallen giver useAuth's isPartner", () => {
    expect(menupunktKunForPartnere(nav, shell)).toBe(true);
  });
  it("dom 5: hooket kalder RPC'en, ikke tabellen, og kun for partnere", () => {
    expect(hooketKalderRpcKunForPartnere(hook, overblik)).toBe(true);
  });

  it("selvbevis 1: en select før tjekket, eller admin i stedet for partner, falder", () => {
    expect(foersteSaetningErPartnerTjek(migB.replace("begin\n  if not has_role(auth.uid(), 'partner') then", "begin\n  perform 1 from public.kontrakter;\n  if not has_role(auth.uid(), 'partner') then"))).toBe(false);
    expect(foersteSaetningErPartnerTjek(migB.replace("if not has_role(auth.uid(), 'partner') then", "if not has_role(auth.uid(), 'admin') then"))).toBe(false);
    expect(foersteSaetningErPartnerTjek(migB.replace("revoke all on function public.hent_oekonomi_overblik() from anon;", ""))).toBe(false);
  });
  it("selvbevis 2: advisor-politikken genoprettet, eller partner-politikken væk, falder", () => {
    expect(kunPartnereLaeserKontrakter(migB + '\ncreate policy "Advisors can view kontrakter" on public.kontrakter for select using (true);', migOe1)).toBe(false);
    expect(kunPartnereLaeserKontrakter(migB.replace("using (has_role(auth.uid(), 'partner'::app_role));", "using (has_role(auth.uid(), 'advisor'::app_role));"), migOe1)).toBe(false);
  });
  it("selvbevis 3: PartnerRoute på isAdmin, eller ruten bag AdvisorRoute, falder", () => {
    expect(partnerRouteHolder(app.replace("const { user, loading, isPartner } = useAuth();", "const { user, loading, isAdmin } = useAuth();").replace('if (!isPartner) return <Navigate to="/" replace />;', 'if (!isAdmin) return <Navigate to="/" replace />;'))).toBe(false);
    expect(partnerRouteHolder(app.replace('<Route path="/oekonomi" element={<PartnerRoute><Oekonomi /></PartnerRoute>} />', '<Route path="/oekonomi" element={<AdvisorRoute><Oekonomi /></AdvisorRoute>} />'))).toBe(false);
  });
  it("selvbevis 4: «Økonomi» uden gate, eller skallen der giver isAdmin, falder", () => {
    expect(menupunktKunForPartnere(nav.replace('...(isPartner === true ? [{ label: "Økonomi", to: "/oekonomi", active: active === "oekonomi" }] : []),', '{ label: "Økonomi", to: "/oekonomi", active: active === "oekonomi" },'), shell)).toBe(false);
    expect(menupunktKunForPartnere(nav, shell.replace("bygHbNav({ isAdvisor, erAbonnent, active, isPartner })", "bygHbNav({ isAdvisor, erAbonnent, active, isPartner: isAdmin })"))).toBe(false);
  });
  it("selvbevis 5: hooket der læser tabellen direkte, eller uden partner-gate, falder", () => {
    expect(hooketKalderRpcKunForPartnere(hook + '\nsupabase.from("kontrakter").select("*");', overblik)).toBe(false);
    expect(hooketKalderRpcKunForPartnere(hook.replace("enabled: !!user && isPartner === true,", "enabled: !!user,"), overblik)).toBe(false);
  });
});
