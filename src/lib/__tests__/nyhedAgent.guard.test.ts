import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { klassificer } from "../../../supabase/functions/_shared/klokkeMail";
import { NYHED_AGENT_SKIVE, TYPE_NYHED_UDKAST_KLAR } from "../../../supabase/functions/_shared/nyhedAgent";

/**
 * Kildeværn for nyhedsagenten, skive 1 (30/9-2026). Hver dom er en navngiven ren
 * funktion over kildeteksten og bevist på en KOPI med fejlen indsat
 * (ansoegning.guard-mønstret) — filerne røres ikke.
 *
 *   1. INTET PUBLICERES UDEN RÅDGIVERENS KLIK: cronen kender ikke community-
 *      skrivevejen (ingen opret_community_traad, ingen community_traade, ingen
 *      notify-community-*), og den skriver kun i sine egne tre tabeller +
 *      advisor_notifications (klokken). Tråden oprettes KUN i nyhederApi.ts, og
 *      KUN efter «tag» og før «publiceret».
 *   2. BUCKET B + TØRKØRSEL + LÅS: authenticateServiceRole FØR createClient;
 *      dry_run !== false; skriver = !toerKoersel && laasAktiv; hver skrivning
 *      står efter «if (!skriver)»-porten eller er bag «skriver &&».
 *   3. SAMME LLM-VEJ: gatewayens URL, LOVABLE_API_KEY og MODEL er ordret
 *      run-company-agents; ingen anden nøgle (ANTHROPIC/OPENAI) læses.
 *   4. INGEN PERSONDATA TIL LLM'EN: cronen læser ingen medlemstabel.
 *   5. LLM-SVARET DØMMES: begge værktøjskald går gennem validerVurderinger/
 *      validerUdkast, før noget bruges; tool_choice tvinger værktøjet.
 *   6. BEVISET: svaret bærer nyhed_agent: NYHED_AGENT_SKIVE («skive-1»).
 *   7. BUCKET A for klikket: authenticateUser → has_role via callerClient →
 *      læsning med callerClient → FØRST DA service role; skrivningen guardet på
 *      status; afgjort_af er kalderens id.
 *   8. MIGRATIONERNE: første linje præcis husets; cron-filens første linje
 *      «KØRES FØRST EFTER UDRULNING OG TØRKØRSEL.»; timeout = JOB_TIMEOUT_MS.
 *   9. KLOKKEN har plads i MORGEN-listen og fører til /nyheder.
 *  10. INGEN DOBBELT TRÅD (det tekniske råd 30/9, fund 2 og 7): «slip» spørger
 *      traadFraForsoeget FØR udkastet frigives og svarer 409 «traad_findes» +
 *      traad_id; «publiceret» dømmer tråden med traadKanKnyttes; fladen kaster
 *      TraadFindesFejl videre fra et afvist slip.
 *  11. INGEN MAIL SOM STANDARD (fund 4): NYHED_OPSLAG_MAIL = false; nyheds-
 *      opslaget kalder notificerNytOpslag med udenMail: !NYHED_OPSLAG_MAIL;
 *      notify-community-opslag giver «info» KUN for udenMail === true; alle
 *      andre opslag (CommunityView) sender body'en som før.
 *  12. FEEDET (fund 3 og 8): kroppen læses KUN gennem laesKropMedLoft (loft
 *      2 MB, frist, tiden tjekket igen efter læsningen), og emnerne går
 *      gennem filtrerVaerter med kildens egne vaerter, før de bruges.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/ [^\n]*/g, "");

const CRON = "supabase/functions/nyhed-agent-cron/index.ts";
const AFGOER = "supabase/functions/nyhed-udkast-afgoer/index.ts";
const API = "src/lib/nyheder/nyhederApi.ts";
const AGENT = "supabase/functions/run-company-agent/index.ts";
const MIG = "supabase/migrations/20260930170000_nyhedsagent.sql";
const MIG_CRON = "supabase/migrations/20260930171000_nyhedsagent_cron.sql";
const KLOKKE = "src/lib/hjemmebane/klokke.ts";
const MOTOR = "supabase/functions/_shared/nyhedAgent.ts";
const OPSLAG = "supabase/functions/notify-community-opslag/index.ts";
const COMMUNITY_API = "src/lib/hjemmebane/communityApi.ts";
const COMMUNITY_VIEW = "src/components/hjemmebane/community/CommunityView.tsx";

// ── 1 ──
const TILLADTE_SKRIVEMAAL = ["nyhed_emne", "nyhed_udkast", "nyhed_agent_koersel"];
export function cronenPublicererIkke(cron: string): boolean {
  const k = udenKommentarer(cron);
  if (/opret_community_traad|community_traade|community_svar|notify-community|functions\.invoke|\.rpc\(/.test(k)) return false;
  const skrivemaal = [...k.matchAll(/\.from\("([a-z_]+)"\)\s*\.(insert|update|upsert|delete)\(/g)].map((m) => m[1]);
  return skrivemaal.length > 0 && skrivemaal.every((t) => TILLADTE_SKRIVEMAAL.includes(t)) && k.includes("await skrivRaadgiverBesked(admin, {");
}
export function klikketErEnesteVej(api: string): boolean {
  const k = udenKommentarer(api);
  const tag = k.indexOf('await afgoer({ handling: "tag"');
  const opret = k.indexOf("traadId = await opretTraad(");
  const publiceret = k.indexOf('await afgoer({ handling: "publiceret"');
  const notificer = k.indexOf("await notificerNyhedsopslag(traadId);");
  const fn = k.indexOf("async function notificerNyhedsopslag(");
  const naevnIFn = k.indexOf("await notificerNaevnelser({ traadId });", fn);
  const opslag = k.indexOf("await notificerNytOpslag(traadId, { udenMail: !NYHED_OPSLAG_MAIL });", fn);
  return tag !== -1 && tag < opret && opret < publiceret && publiceret < notificer && notificer < fn &&
    fn !== -1 && fn < naevnIFn && naevnIFn < opslag && (k.match(/opretTraad\(/g) ?? []).length === 1;
}

// ── 2 ──
export function bucketBOgToerkoersel(cron: string): boolean {
  const k = udenKommentarer(cron);
  const serve = k.slice(k.indexOf("Deno.serve("));
  const fn = k.slice(k.indexOf("export async function koerNyhedsagent("), k.indexOf("async function skrivSpor("));
  const port = fn.indexOf("if (!skriver) {");
  const foersteUdkastSkriv = fn.indexOf('.from("nyhed_udkast")\n    .insert(');
  const klokke = fn.indexOf("await skrivRaadgiverBesked(");
  // Skrivninger i nyhed_emne FØR porten skal stå bag «if (skriver && …» (inden for 200 tegn); efter porten er de dækket af den.
  const emneSkriv = [...fn.matchAll(/admin\.from\("nyhed_emne"\)\s*\.(upsert|update)\(/g)].map((m) => m.index!);
  const foerPorten = emneSkriv.filter((i) => i < port);
  const emnePort = foerPorten.length === 2 && foerPorten.every((i) => fn.slice(Math.max(0, i - 200), i).includes("if (skriver && "));
  return serve.indexOf("authenticateServiceRole(req)") !== -1 && serve.indexOf("authenticateServiceRole(req)") < serve.indexOf("createClient(") &&
    serve.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    fn.includes("const skriver = !a.toerKoersel && laasAktiv;") &&
    port !== -1 && foersteUdkastSkriv > port && klokke > port && emnePort;
}

// ── 3 ──
export function sammeLlmVej(cron: string, agent: string): boolean {
  const model = agent.match(/const MODEL = "([^"]+)";/)?.[1];
  const k = udenKommentarer(cron);
  return !!model && k.includes(`const MODEL = "${model}";`) &&
    agent.includes('"https://ai.gateway.lovable.dev/v1/chat/completions"') && k.includes('const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";') &&
    k.includes('Deno.env.get("LOVABLE_API_KEY")') && agent.includes('Deno.env.get("LOVABLE_API_KEY")') &&
    (k.match(/Deno\.env\.get\("([A-Z_]+)"\)/g) ?? []).every((m) => /SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|LOVABLE_API_KEY/.test(m));
}

// ── 4 ──
const MEDLEMSTABELLER = ["companies", "company_members", "profiles", "user_roles", "ansoegninger", "webinar_tilmeldinger", "messages", "financial_reports", "financial_report_facts", "notifications", "handouts", "auth.users"];
export function ingenPersondata(cron: string): boolean {
  const k = udenKommentarer(cron);
  const laeste = [...k.matchAll(/\.from\("([a-z_.]+)"\)/g)].map((m) => m[1]);
  return laeste.every((t) => !MEDLEMSTABELLER.includes(t));
}

// ── 5 ──
export function llmSvaretDoemmes(cron: string): boolean {
  const k = udenKommentarer(cron);
  const kald = [...k.matchAll(/const svar = await kaldLlm\(/g)].map((m) => m.index!);
  return kald.length === 2 &&
    /const svar = await kaldLlm\(SYSTEM_VURDERING[^\n]*\n\s*const dom = validerVurderinger\(svar,/.test(k) &&
    /const svar = await kaldLlm\(SYSTEM_UDKAST[^\n]*\n\s*const dom = validerUdkast\(svar,/.test(k) &&
    k.includes("tool_choice: { type: \"function\", function: { name: vaerktoej.function.name } },");
}

// ── 7 ──
export function bucketAKlik(afgoer: string): boolean {
  const k = udenKommentarer(afgoer);
  const i = (s: string) => k.indexOf(s);
  const auth = i("await authenticateUser(req)");
  const rolle = i('callerClient.rpc("has_role"');
  const laes = i('await callerClient\n    .from("nyhed_udkast")');
  const admin = i("createClient(");
  return auth !== -1 && auth < rolle && rolle < laes && laes < admin &&
    k.includes('.eq("status", u.status);') &&
    k.includes('if (handling === "publiceret" || handling === "slip") opdatering = opdatering.eq("afgjort_af", u.afgjort_af as string);') &&
    k.includes("const afvist = traadKanKnyttes(u, t, ") && k.includes("if (afvist) return json({ error: afvist.fejl }, afvist.http);") &&
    !/afgjort_af: body|afgjort_af: \(body/.test(k) &&
    !/opret_community_traad|\.insert\(/.test(k);
}

// ── 8 ──
export const migrationerneErRigtige = (mig: string, cron: string, motor: string): boolean => {
  const timeout = motor.match(/export const JOB_TIMEOUT_MS = ([\d_]+);/)?.[1]?.replace(/_/g, "");
  return (mig.split("\n")[0] === "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)." || mig.split("\n")[0].startsWith("-- KØRT i prod")) &&
    cron.split("\n")[0] === "-- KØRES FØRST EFTER UDRULNING OG TØRKØRSEL." &&
    // Fund 6: linje 2 må ikke bære husets markør — den, der scanner efter «IKKE KØRT», må ikke køre cron-jobbet med de andre.
    !cron.split("\n").slice(1).some((l) => l.includes("IKKE KØRT")) &&
    !!timeout && cron.includes(`    ${timeout},`) && cron.includes("'40 4 * * 1'") && cron.includes("'nyhed-agent-cron'") &&
    !/drop\s+(table|policy|function)\s/i.test(mig.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n")) &&
    /for select to authenticated using \(public\.has_role\(auth\.uid\(\), 'advisor'\)\)/.test(mig) &&
    !/for (insert|update|delete|all)/i.test(mig);
};

// ── 10 ──
export function ingenDobbeltTraad(afgoer: string, api: string): boolean {
  const k = udenKommentarer(afgoer);
  const slip = k.slice(k.indexOf('case "slip": {'), k.indexOf('case "afvis":'));
  const spurgt = slip.indexOf("const fundet = traadFraForsoeget(");
  const afvist = slip.indexOf("if (fundet) {");
  const frigiv = slip.indexOf("patch = { status: dom.til, afgjort_af: null, afgjort_at: null };");
  const svar = slip.slice(afvist, frigiv);
  const a = udenKommentarer(api);
  return spurgt !== -1 && spurgt < afvist && afvist < frigiv &&
    svar.includes('kode: "traad_findes"') && svar.includes("traad_id: fundet") && /\}, 409\);/.test(svar) &&
    k.includes('.eq("forfatter_id", u.afgjort_af)') && k.includes('.gte("created_at", u.afgjort_at)') &&
    a.includes("if (slipFejl instanceof TraadFindesFejl) throw slipFejl;") &&
    a.includes('if (krop?.kode === "traad_findes" && typeof krop?.traad_id === "string") traadFindes = krop.traad_id;');
}

// ── 11 ──
export function ingenMailSomStandard(api: string, opslag: string, communityApi: string, communityView: string): boolean {
  const a = udenKommentarer(api);
  const o = udenKommentarer(opslag);
  const c = udenKommentarer(communityApi);
  const v = udenKommentarer(communityView);
  return a.includes("export const NYHED_OPSLAG_MAIL: boolean = false;") &&
    (a.match(/notificerNytOpslag\(/g) ?? []).length === 1 &&
    a.includes("await notificerNytOpslag(traadId, { udenMail: !NYHED_OPSLAG_MAIL });") &&
    o.includes('priority: udenMail === true ? "info" : "important",') &&
    (o.match(/priority:/g) ?? []).length === 1 &&
    c.includes("body: valg?.udenMail === true ? { traadId, udenMail: true } : { traadId },") &&
    v.includes("await notificerNytOpslag(nytId);") && !/udenMail/.test(v);
}

// ── 12 ──
export function feedetMedLoftOgVaerter(cron: string, motor: string): boolean {
  const k = udenKommentarer(cron);
  const fn = k.slice(k.indexOf("async function hentKilde("), k.indexOf("}\n", k.indexOf("  } catch (err) {", k.indexOf("async function hentKilde("))));
  const laes = fn.indexOf("const krop = await laesKropMedLoft(res.body, FEED_MAKS_BYTES, start + FEED_FRIST_MS);");
  const efter = fn.indexOf("if (Date.now() - start > FEED_FRIST_MS)");
  const vaert = fn.indexOf("filtrerVaerter(parseFeed(krop.tekst, k.noegle), k.vaerter)");
  const m = udenKommentarer(motor);
  const kilder = m.slice(m.indexOf("export const KILDER"), m.indexOf("];", m.indexOf("export const KILDER")));
  const antalKilder = (kilder.match(/\bnoegle: "/g) ?? []).length;
  return laes !== -1 && laes < efter && efter < vaert && !/\.text\(\)|\.json\(\)|\.arrayBuffer\(\)/.test(fn) &&
    m.includes("export const FEED_MAKS_BYTES = 2 * 1024 * 1024;") &&
    antalKilder > 0 && (kilder.match(/\bvaerter: \["[a-z0-9.-]+"/g) ?? []).length === antalKilder;
}

describe("nyhedsagenten — kildeværn", () => {
  const cron = laes(CRON), afgoer = laes(AFGOER), api = laes(API), agent = laes(AGENT);

  it("1. cronen publicerer aldrig; tråden oprettes kun i klikket, mellem «tag» og «publiceret»", () => {
    expect(cronenPublicererIkke(cron)).toBe(true);
    expect(klikketErEnesteVej(api)).toBe(true);
  });
  it("1. VÆRNET VIRKER: skrivevejen smuglet ind i cronen → falsk; opret før tag → falsk", () => {
    expect(cronenPublicererIkke(cron + '\nawait admin.rpc("opret_community_traad", {});\n')).toBe(false);
    expect(cronenPublicererIkke(cron + '\nawait admin.from("community_traade").insert({});\n')).toBe(false);
    expect(cronenPublicererIkke(cron + '\nawait admin.from("notifications").insert({});\n')).toBe(false);
    expect(klikketErEnesteVej(api.replace('await afgoer({ handling: "tag", udkast_id: udkastId });', ""))).toBe(false);
    expect(klikketErEnesteVej(api.replace("  await notificerNyhedsopslag(traadId);\n  return traadId;\n}\n\n/** Samme", "  return traadId;\n}\n\n/** Samme"))).toBe(false);
    expect(klikketErEnesteVej(api.replace("await notificerNytOpslag(traadId, { udenMail: !NYHED_OPSLAG_MAIL });", ""))).toBe(false);
  });

  it("2. Bucket B, tørkørsel som standard, og intet skrives uden dry_run: false OG låsen", () => {
    expect(bucketBOgToerkoersel(cron)).toBe(true);
  });
  it("2. VÆRNET VIRKER: låsen væk → falsk; tørkørslen vendt → falsk; porten væk → falsk", () => {
    expect(bucketBOgToerkoersel(cron.replace("const skriver = !a.toerKoersel && laasAktiv;", "const skriver = !a.toerKoersel;"))).toBe(false);
    expect(bucketBOgToerkoersel(cron.replace("const toerKoersel = raaBody?.dry_run !== false;", "const toerKoersel = raaBody?.dry_run === true;"))).toBe(false);
    expect(bucketBOgToerkoersel(cron.replace("if (!skriver) {", "if (false) {"))).toBe(false);
    expect(bucketBOgToerkoersel(cron.replace("if (skriver && nye.length > 0) {", "if (nye.length > 0) {"))).toBe(false);
  });

  it("3. samme LLM-vej som run-company-agent: gateway, LOVABLE_API_KEY, MODEL — ingen ny nøgle", () => {
    expect(sammeLlmVej(cron, agent)).toBe(true);
    expect(sammeLlmVej(cron.replace('Deno.env.get("LOVABLE_API_KEY")', 'Deno.env.get("ANTHROPIC_API_KEY")'), agent)).toBe(false);
    expect(sammeLlmVej(cron.replace('const MODEL = "google/gemini-2.5-flash";', 'const MODEL = "anden/model";'), agent)).toBe(false);
  });

  it("4. ingen persondata: cronen læser ingen medlemstabel", () => {
    expect(ingenPersondata(cron)).toBe(true);
    expect(ingenPersondata(cron + '\nawait admin.from("companies").select("name");\n')).toBe(false);
  });

  it("5. LLM-svaret dømmes af skemaet, før det bruges", () => {
    expect(llmSvaretDoemmes(cron)).toBe(true);
    expect(llmSvaretDoemmes(cron.replace("const dom = validerUdkast(svar,", "const dom = { ok: true, udkast: svar } as any; (svar,"))).toBe(false);
  });

  it("6. beviset: svaret bærer nyhed_agent: «skive-1»", () => {
    expect(NYHED_AGENT_SKIVE).toBe("skive-1");
    expect(udenKommentarer(cron)).toContain("nyhed_agent: NYHED_AGENT_SKIVE");
  });

  it("7. klikket er Bucket A med rådgiver-gate FØR service role, guardet på status", () => {
    expect(bucketAKlik(afgoer)).toBe(true);
    expect(bucketAKlik(afgoer.split('callerClient.rpc("has_role"').join('callerClient.rpc("noget_andet"'))).toBe(false);
    expect(bucketAKlik(afgoer.replace('.eq("status", u.status);', ";"))).toBe(false);
    expect(bucketAKlik(afgoer + '\nawait adminClient.rpc("opret_community_traad", {});\n')).toBe(false);
    expect(bucketAKlik(afgoer.replace('if (handling === "publiceret" || handling === "slip") opdatering', 'if (handling === "publiceret") opdatering'))).toBe(false);
    expect(bucketAKlik(afgoer.replace("if (afvist) return json({ error: afvist.fejl }, afvist.http);", ""))).toBe(false);
  });

  it("8. migrationerne: første linjer, kun SELECT-politikker, ingen DROP, cron-timeout = JOB_TIMEOUT_MS", () => {
    const mig = laes(MIG), mc = laes(MIG_CRON), motor = laes(MOTOR);
    expect(migrationerneErRigtige(mig, mc, motor)).toBe(true);
    expect(migrationerneErRigtige(mig.replace(/^[^\n]*\n/, "-- Nyhedsagenten.\n"), mc, motor)).toBe(false);
    expect(migrationerneErRigtige(mig, mc.replace(/^[^\n]*\n/, "-- IKKE KØRT.\n"), motor)).toBe(false);
    expect(migrationerneErRigtige(mig, mc.replace("\n-- Venter. ", "\n-- IKKE KØRT. "), motor)).toBe(false);
    expect(migrationerneErRigtige(mig, mc, motor.replace("export const JOB_TIMEOUT_MS = 140_000;", "export const JOB_TIMEOUT_MS = 120_000;"))).toBe(false);
    expect(migrationerneErRigtige(mig + "\ncreate policy x on public.nyhed_udkast for update to authenticated using (true);\n", mc, motor)).toBe(false);
  });

  it("9. klokken er MORGEN og fører til /nyheder", () => {
    expect(klassificer(TYPE_NYHED_UDKAST_KLAR)).toBe("morgen");
    expect(laes(KLOKKE)).toMatch(/case "nyhed_udkast":\s*\n\s*return "\/nyheder";/);
  });

  it("10. ingen dobbelt tråd: «slip» afvises med 409 traad_findes, når forsøget fik oprettet en tråd", () => {
    const afgoer = laes(AFGOER), api = laes(API);
    expect(ingenDobbeltTraad(afgoer, api)).toBe(true);
    expect(ingenDobbeltTraad(afgoer.replace("if (fundet) {", "if (false) {"), api)).toBe(false);
    expect(ingenDobbeltTraad(afgoer.replace("    }, 409);", "    }, 200);"), api)).toBe(false);
    expect(ingenDobbeltTraad(afgoer.replace('.gte("created_at", u.afgjort_at)', '.gte("created_at", "1970-01-01")'), api)).toBe(false);
    expect(ingenDobbeltTraad(afgoer, api.replace("if (slipFejl instanceof TraadFindesFejl) throw slipFejl;", ""))).toBe(false);
  });

  it("11. nyhedsopslaget mailer ikke som standard; andre opslag er uændrede", () => {
    const api = laes(API), opslag = laes(OPSLAG), capi = laes(COMMUNITY_API), view = laes(COMMUNITY_VIEW);
    expect(ingenMailSomStandard(api, opslag, capi, view)).toBe(true);
    expect(ingenMailSomStandard(api.replace("NYHED_OPSLAG_MAIL: boolean = false;", "NYHED_OPSLAG_MAIL: boolean = true;"), opslag, capi, view)).toBe(false);
    expect(ingenMailSomStandard(api.replace("{ udenMail: !NYHED_OPSLAG_MAIL }", "{ udenMail: false }"), opslag, capi, view)).toBe(false);
    expect(ingenMailSomStandard(api, opslag.replace('priority: udenMail === true ? "info" : "important",', 'priority: "important",'), capi, view)).toBe(false);
    expect(ingenMailSomStandard(api, opslag.replace('priority: udenMail === true ? "info" : "important",', 'priority: udenMail ? "info" : "important",'), capi, view)).toBe(false);
    expect(ingenMailSomStandard(api, opslag, capi, view.replace("await notificerNytOpslag(nytId);", "await notificerNytOpslag(nytId, { udenMail: true });"))).toBe(false);
  });

  it("12. feedet: kroppen med loft og frist, emnerne gennem kildens værtsliste", () => {
    const cron = laes(CRON), motor = laes(MOTOR);
    expect(feedetMedLoftOgVaerter(cron, motor)).toBe(true);
    expect(feedetMedLoftOgVaerter(cron.replace("const krop = await laesKropMedLoft(res.body, FEED_MAKS_BYTES, start + FEED_FRIST_MS);", "const krop = { ok: true as const, tekst: await res.text() };"), motor)).toBe(false);
    expect(feedetMedLoftOgVaerter(cron.replace("filtrerVaerter(parseFeed(krop.tekst, k.noegle), k.vaerter)", "filtrerVaerter(parseFeed(krop.tekst, k.noegle), [])"), motor)).toBe(false);
    expect(feedetMedLoftOgVaerter(cron.replace("if (Date.now() - start > FEED_FRIST_MS)", "if (false)"), motor)).toBe(false);
    expect(feedetMedLoftOgVaerter(cron, motor.replace("export const FEED_MAKS_BYTES = 2 * 1024 * 1024;", "export const FEED_MAKS_BYTES = 200 * 1024 * 1024;"))).toBe(false);
    expect(feedetMedLoftOgVaerter(cron, motor.replace('    vaerter: ["nemhandel.dk"],\n', ""))).toBe(false);
  });
});
