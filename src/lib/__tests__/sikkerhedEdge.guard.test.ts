import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for sikkerhedsrettelserne 30/9-2026 (sikkerhedsanalysen fund 2,
 * 4, 5, 8, 9 og C7). De rene domme er testet hver for sig
 * (rapportEjerskab, agentLiveAdgang, webhookSignatur, sikkerReturUrl); dette
 * værn holder, at functions og sider faktisk KALDER dem, og i den rigtige
 * rækkefølge — FØR service role. Hver dom er bevist nedenfor på en kopi med
 * fejlen indsat (mutationen skal fælde).
 *
 *   1. extract-annual-report: rapporten slås op med callerClient og dømmes
 *      (ejer + fil) før adminClient; filen er rækkens sti, ikke body'ens;
 *      committed_by er kalderen; hver service-role-skrivning på rapporten er
 *      bundet til company_id.
 *   2. update-annual-report-revenue: samme ejerdom før adminClient, og
 *      læsning/skrivning af rapporten er bundet til company_id.
 *   3. notify-chat-reply: rådgiver-rollen og samtalen (callerClient) før
 *      adminClient; samtalen slås ikke op med service role.
 *   4. run-company-agent: live-porten (maaKoereLive) før adminClient, 403.
 *   5. stripe-/calendly-webhook: ingen `===` på signaturen; den delte dom;
 *      Stripe med 300 s-vinduet; signaturen før JSON.parse.
 *   6. Auth.tsx/App.tsx: returnUrl går gennem sikkerReturSti; ingen
 *      window.location.href med returnUrl.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const foer = (k: string, a: string, b: string) => {
  const i = k.indexOf(a), j = k.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
};
const ADMIN = "const adminClient = createClient(";

/** Hver `.eq("id", report_id)` efter adminClient er fulgt af `.eq("company_id", company_id)`. */
const rapportSkrivningerBundet = (k: string): boolean => {
  const efter = k.slice(k.indexOf(ADMIN));
  const steder = [...efter.matchAll(/\.eq\("id", report_id\)/g)];
  return steder.length > 0 && steder.every((m) => /^\s*\.eq\("company_id", company_id\)/.test(efter.slice(m.index! + m[0].length)));
};

// ── 1 ──
const EXTRACT = "supabase/functions/extract-annual-report/index.ts";
export const extractEjertjek = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  return (
    k.includes('import { doemRapportEjer, doemRapportFil, gyldigtAarstal } from "../_shared/rapportEjerskab.ts";') &&
    k.includes("const { report_id, year, company_id } = await req.json();") &&
    foer(k, "if (!gyldigtAarstal(year)) {", ADMIN) &&
    foer(k, 'await callerClient\n    .from("financial_reports")\n    .select("id, company_id, file_path")', ADMIN) &&
    foer(k, "const ejerDom = doemRapportEjer(rapport, company_id);", ADMIN) &&
    foer(k, "if (!ejerDom.ok) {", ADMIN) &&
    foer(k, "const filDom = doemRapportFil(rapport, company_id);", ADMIN) &&
    foer(k, "if (!filDom.ok) {", ADMIN) &&
    foer(k, "const file_path = filDom.filSti;", ".download(file_path)") &&
    k.includes("committed_by: callerId,") &&
    !/\buser_id\b/.test(k.slice(k.indexOf(ADMIN)).replace(/\.eq\('user_id'/g, "")) &&
    rapportSkrivningerBundet(k)
  );
};

// ── 2 ──
const REVENUE = "supabase/functions/update-annual-report-revenue/index.ts";
export const revenueEjertjek = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  return (
    k.includes('import { doemRapportEjer, gyldigtAarstal } from "../_shared/rapportEjerskab.ts";') &&
    foer(k, "if (!gyldigtAarstal(year)) {", ADMIN) &&
    foer(k, 'await callerClient\n    .from("financial_reports")', ADMIN) &&
    foer(k, "const ejerDom = doemRapportEjer(rapport, company_id);", ADMIN) &&
    foer(k, "if (!ejerDom.ok) {", ADMIN) &&
    rapportSkrivningerBundet(k)
  );
};

// ── 3 ──
const CHAT = "supabase/functions/notify-chat-reply/index.ts";
export const chatReplyAdgang = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  const efterAdmin = k.slice(k.indexOf(ADMIN));
  return (
    foer(k, 'await callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" });', ADMIN) &&
    foer(k, "if (erRaadgiver !== true) {", ADMIN) &&
    foer(k, 'await callerClient\n    .from("conversations")', ADMIN) &&
    foer(k, "if (!conv) {", ADMIN) &&
    !efterAdmin.includes('.from("conversations")')
  );
};

// ── 4 ──
const AGENT = "supabase/functions/run-company-agent/index.ts";
const AGENT_ADMIN = "const adminClient = createClient(supabaseUrl, serviceRoleKey);";
export const agentLivePort = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  const i = k.indexOf("if (!dryRun) {");
  const blok = i === -1 ? "" : k.slice(i, k.indexOf(AGENT_ADMIN));
  return (
    k.includes('import { maaKoereLive } from "../_shared/agentLiveAdgang.ts";') &&
    k.includes("callerId = auth.callerId;") &&
    foer(k, "if (!dryRun) {", AGENT_ADMIN) &&
    blok.includes('callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" })') &&
    blok.includes("if (!maaKoereLive({ dryRun, isServiceRole, isAdvisor: erRaadgiver === true, trigger })) {") &&
    // v8 (3/10): alle svar går gennem svarJson (agentV8.guard dom 4) — afvisningen er 403 dér.
    blok.includes('return svarJson({ ok: false, error: "live_kraever_raadgiver" }, 403);')
  );
};

// ── 5 ──
const STRIPE = "supabase/functions/stripe-webhook/index.ts";
const CALENDLY = "supabase/functions/calendly-webhook/index.ts";
export const stripeSignatur = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  return (
    !/expected\s*===\s*v1/.test(k) &&
    k.includes('from "../_shared/webhookSignatur.ts";') &&
    k.includes("toleranceSek: STRIPE_TOLERANCE_SEK,") &&
    foer(k, "if (!signaturDom.ok) {", "const event = JSON.parse(payload);")
  );
};
export const calendlySignatur = (raa: string): boolean => {
  const k = udenKommentarer(raa);
  return (
    !/expected\s*===\s*v1/.test(k) &&
    k.includes('from "../_shared/webhookSignatur.ts";') &&
    k.includes("return await verificerTV1Signatur({") &&
    foer(k, "if (!verificeretMed) {", "const event = JSON.parse(rawBody);")
  );
};

// ── 6 ──
const AUTH = "src/pages/Auth.tsx";
const APP = "src/App.tsx";
export const returUrlSikret = (auth: string, app: string): boolean => {
  const a = udenKommentarer(auth);
  const p = udenKommentarer(app);
  return (
    a.includes("const returnUrl = raaReturUrl ? sikkerReturSti(raaReturUrl, window.location.origin) : \"\";") &&
    !/window\.location\.href\s*=\s*returnUrl/.test(a) &&
    !/window\.location\.(href|assign|replace)\s*[=(]\s*raaReturUrl/.test(a) &&
    p.includes("const returnUrl = raaReturUrl ? sikkerReturSti(raaReturUrl, window.location.origin) : null;")
  );
};

describe("sikkerhedEdge.guard — rettelserne 30/9 kaldes, og før service role", () => {
  it("dom 1: extract-annual-report ejertjekker rapport og fil", () => {
    const k = laes(EXTRACT);
    expect(extractEjertjek(k)).toBe(true);
    // Mutationer:
    expect(extractEjertjek(k.replace("const file_path = filDom.filSti;", "const file_path = body_file_path;"))).toBe(false);
    expect(extractEjertjek(k.replace("committed_by: callerId,", "committed_by: user_id || null,"))).toBe(false);
    expect(extractEjertjek(k.replace("const { report_id, year, company_id } = await req.json();", "const { report_id, file_path, year, company_id, user_id } = await req.json();"))).toBe(false);
    expect(extractEjertjek(k.replace('.eq("id", report_id)\n      .eq("company_id", company_id);', '.eq("id", report_id);'))).toBe(false);
    const flyttet = k.replace("  const ejerDom = doemRapportEjer(rapport, company_id);\n", "").replace(
      "const adminClient = createClient(supabaseUrl, serviceKey);",
      "const adminClient = createClient(supabaseUrl, serviceKey);\n  const ejerDom = doemRapportEjer(rapport, company_id);",
    );
    expect(extractEjertjek(flyttet)).toBe(false);
  });

  it("dom 2: update-annual-report-revenue binder report_id til company_id", () => {
    const k = laes(REVENUE);
    expect(revenueEjertjek(k)).toBe(true);
    expect(revenueEjertjek(k.replace('.eq("id", report_id)\n    .eq("company_id", company_id)\n    .maybeSingle();', '.eq("id", report_id)\n    .maybeSingle();'))).toBe(false);
    expect(revenueEjertjek(k.replace("if (!ejerDom.ok) {", "if (false) {"))).toBe(false);
  });

  it("dom 3: notify-chat-reply kræver rådgiver og en samtale", () => {
    const k = laes(CHAT);
    expect(chatReplyAdgang(k)).toBe(true);
    expect(chatReplyAdgang(k.replace("if (erRaadgiver !== true) {", "if (false) {"))).toBe(false);
    expect(chatReplyAdgang(k.replace('await callerClient\n    .from("conversations")', 'await adminClient\n    .from("conversations")'))).toBe(false);
    expect(chatReplyAdgang(k.replace("if (!conv) {", "if (false) {"))).toBe(false);
  });

  it("dom 4: run-company-agent har live-porten før service role", () => {
    const k = laes(AGENT);
    expect(agentLivePort(k)).toBe(true);
    expect(agentLivePort(k.replace("if (!maaKoereLive({ dryRun, isServiceRole, isAdvisor: erRaadgiver === true, trigger })) {", "if (false) {"))).toBe(false);
    expect(agentLivePort(k.replace("if (!dryRun) {", "if (false) {"))).toBe(false);
    expect(agentLivePort(k.replace("    callerId = auth.callerId;\n", ""))).toBe(false);
  });

  it("dom 5: webhooks bruger den delte, konstant-tids dom — Stripe med 300 s", () => {
    const s = laes(STRIPE);
    const c = laes(CALENDLY);
    expect(stripeSignatur(s)).toBe(true);
    expect(calendlySignatur(c)).toBe(true);
    expect(stripeSignatur(s.replace("toleranceSek: STRIPE_TOLERANCE_SEK,", "toleranceSek: null,"))).toBe(false);
    expect(stripeSignatur(s + "\nconst x = expected === v1;")).toBe(false);
    expect(calendlySignatur(c + "\nconst x = expected === v1;")).toBe(false);
    expect(calendlySignatur(c.replace("return await verificerTV1Signatur({", "return await egenSammenligning({"))).toBe(false);
  });

  it("dom 6: returnUrl er altid en sikker intern sti", () => {
    const a = laes(AUTH);
    const p = laes(APP);
    expect(returUrlSikret(a, p)).toBe(true);
    expect(returUrlSikret(a.replace("sikkerReturSti(raaReturUrl, window.location.origin) : \"\";", "raaReturUrl : \"\";"), p)).toBe(false);
    expect(returUrlSikret(a + "\nwindow.location.href = returnUrl;", p)).toBe(false);
    expect(returUrlSikret(a, p.replace("sikkerReturSti(raaReturUrl, window.location.origin) : null;", "raaReturUrl : null;"))).toBe(false);
  });
});
