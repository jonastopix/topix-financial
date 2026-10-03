/**
 * KILDEVÆRN + DOMME — ansøgningen kobles til webinartilmeldingen på id
 * (skive 4, 3/10-2026; spec §A9, docs/webinarmotor.md §7.8).
 *
 * Seks domme, hver med mutationsbevis:
 *   1. Tokenet gemmes aldrig — hverken i en kolonne (functionen, migrationen) eller på
 *      enheden (hooken, siden): kun tilmeldingens id skrives.
 *   2. Tokenet når aldrig `landing` (= Metas event_source_url) — i begge spejle.
 *   3. Fail-soft: et ugyldigt token, en manglende secret, en manglende kolonne eller en
 *      undtagelse giver et udfald, aldrig en stoppet ansøgning; koblingen ligger EFTER
 *      insert'en, og ingen afvisning står mellem den og svaret.
 *   4. Kun prædikatet fra _shared/webinarDeltagerAuth.ts — ansoegning-gem læser hverken
 *      secret'en eller tokenets HMAC selv.
 *   5. STRIKS body kender feltet, og klienten sender det kun med «opret».
 *   6. Migrationens første linje, kun tilføjende, skive 1 som forudsætning.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  harWebinarToken,
  koblWebinarTilmelding,
  type DeltagerPraedikat,
  KOBLINGS_KOLONNE,
  udfaldAfGrund,
  udfaldUdenKobling,
  WEBINAR_KOBLING_UDFALD,
} from "../../../supabase/functions/_shared/ansoegningWebinarKobling";
import { landingUdenToken as landingKlient, laesAnnoncespor } from "@/lib/ansoegning/skema";
import { landingUdenToken as landingServer } from "../../../supabase/functions/_shared/ansoegningSkema";

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const GEM = "supabase/functions/ansoegning-gem/index.ts";
const KOBLING = "supabase/functions/_shared/ansoegningWebinarKobling.ts";
const HOOK = "src/hooks/useWebinarForudfyld.ts";
const SIDE = "src/pages/Ansoeg.tsx";
const API = "src/lib/ansoegning/api.ts";
const MIGRATION = "supabase/migrations/20261003060000_ansoegning_webinar_tilmelding.sql";

const TOKEN = `${"A".repeat(27)}.${"b".repeat(43)}`;
const TILMELDING = "3f1c2b8e-9a4d-4c1e-8b2a-0d9e7f6a5b41";

// ── Falsk admin-klient: optager update-kaldene ───────────────────────────────

interface Optagelse {
  updates: Record<string, unknown>[];
}
function falskAdmin(svar: { data?: unknown; error?: { code?: string; message: string } | null; kast?: boolean }, opt: Optagelse) {
  const kaede = {
    update(v: Record<string, unknown>) {
      if (svar.kast) throw new Error("netværket gik ned");
      opt.updates.push(v);
      return kaede;
    },
    eq() {
      return kaede;
    },
    is() {
      return kaede;
    },
    select() {
      return Promise.resolve({ data: svar.data ?? null, error: svar.error ?? null });
    },
  };
  return { from: () => kaede } as never;
}
const godkend: DeltagerPraedikat = async () => ({ ok: true, deltager: { id: TILMELDING } });
const afvis = (grund: string): DeltagerPraedikat => async () => ({ ok: false, grund });

// ── 1. Tokenet gemmes aldrig ─────────────────────────────────────────────────

/** Ingen insert/update/upsert-objekt i kilden nævner webinar_token. */
export function tokenSkrivesAldrig(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  for (const m of k.matchAll(/\.(insert|update|upsert)\(/g)) {
    const krop = k.slice(m.index!, m.index! + 400);
    const slut = krop.indexOf(")");
    if (/webinar_token|\bwt\b/.test(krop.slice(0, slut === -1 ? 400 : slut))) return false;
  }
  return true;
}
/** Hooken og siden lægger aldrig tokenet på enheden. */
export function tokenPaaEnhedenAldrig(hook: string, side: string): boolean {
  const h = udenKommentarer(hook);
  if (/localStorage|sessionStorage|document\.cookie|indexedDB/.test(h)) return false;
  const s = udenKommentarer(side);
  // Siden må kun bruge ref'en i opret-kaldet og til at nulstille den.
  const brug = s.split("\n").filter((l) => l.includes("webinarToken.current"));
  return brug.every((l) => /webinar_token: webinarToken\.current \?\? undefined|webinarToken\.current = null;/.test(l)) && brug.length === 2;
}

describe("webinarAnsoegningKobling.guard 1 — tokenet gemmes aldrig", () => {
  it("functionen og koblingen skriver aldrig tokenet; koblingen skriver kun webinar_tilmelding_id", () => {
    expect(tokenSkrivesAldrig(laes(GEM))).toBe(true);
    expect(tokenSkrivesAldrig(laes(KOBLING))).toBe(true);
    expect(KOBLINGS_KOLONNE).toBe("webinar_tilmelding_id");
    expect(udenKommentarer(laes(KOBLING))).toMatch(/\.update\(\{ \[KOBLINGS_KOLONNE\]: dom\.deltager\.id \}\)/);
  });
  it("koblingen skriver præcis tilmeldingens id — aldrig tokenet", async () => {
    const opt: Optagelse = { updates: [] };
    await koblWebinarTilmelding(falskAdmin({ data: [{ id: "x" }] }, opt), "a", TOKEN, godkend);
    expect(opt.updates).toEqual([{ webinar_tilmelding_id: TILMELDING }]);
    expect(JSON.stringify(opt.updates)).not.toContain(TOKEN);
  });
  it("hooken og siden holder tokenet KUN i hukommelsen", () => {
    expect(tokenPaaEnhedenAldrig(laes(HOOK), laes(SIDE))).toBe(true);
  });
  it("migrationen skaber ingen token-kolonne", () => {
    const m = laes(MIGRATION).replace(/--[^\n]*/g, "");
    expect(m).not.toMatch(/add column[^;]*\b(webinar_|join_|deltager)?token\b/i);
    expect(m.toLowerCase().match(/add column/g)).toHaveLength(1);
  });
  it("MUTATION: et update med webinar_token fanges", () => {
    const m = laes(GEM).replace(
      "await koblVisning(adminClient, data.id, body?.visning_id);",
      "await koblVisning(adminClient, data.id, body?.visning_id);\n      await adminClient.from(\"ansoegninger\").update({ webinar_token: body?.webinar_token }).eq(\"id\", data.id);",
    );
    expect(m).not.toBe(laes(GEM));
    expect(tokenSkrivesAldrig(m)).toBe(false);
  });
  it("MUTATION: tokenet i sessionStorage fanges", () => {
    const m = laes(HOOK).replace("webinarToken.current = wt;", 'webinarToken.current = wt;\n    sessionStorage.setItem("wt", wt);');
    expect(m).not.toBe(laes(HOOK));
    expect(tokenPaaEnhedenAldrig(m, laes(SIDE))).toBe(false);
  });
});

// ── 2. Tokenet når aldrig landing ────────────────────────────────────────────

describe("webinarAnsoegningKobling.guard 2 — tokenet når aldrig landing (Metas event_source_url)", () => {
  const href = `https://app.theboardroom.dk/ansoeg?kilde=webinar#wt=${TOKEN}`;
  it("landingUdenToken skræller fragmentet af i begge spejle", () => {
    for (const f of [landingKlient, landingServer]) {
      const l = f(href)!;
      expect(l).not.toContain(TOKEN);
      expect(l).not.toContain("#");
      expect(l).toBe("https://app.theboardroom.dk/ansoeg?kilde=webinar");
    }
  });
  it("også en URL, der ikke kan parses", () => {
    for (const f of [landingKlient, landingServer]) expect(f(`ikke en url#wt=${TOKEN}`)).not.toContain(TOKEN);
  });
  it("hele annoncesporet fra /ansoeg bærer ikke tokenet", () => {
    const spor = laesAnnoncespor({ get: (n) => (n === "kilde" ? "webinar" : null), href, referrer: "https://app.theboardroom.dk/w/boardroom" });
    expect(JSON.stringify(spor)).not.toContain(TOKEN);
  });
  it("MUTATION: uden u.hash = \"\" slipper tokenet igennem", () => {
    const kilde = laes("src/lib/ansoegning/skema.ts");
    const fn = kilde.slice(kilde.indexOf("export function landingUdenToken("));
    expect(fn.slice(0, 500)).toContain('u.hash = "";');
    const u = new URL(href);
    u.searchParams.delete("t");
    expect(u.toString()).toContain(TOKEN); // uden hash-skrælningen — beviset for, at linjen bærer
  });
});

// ── 3. Fail-soft ─────────────────────────────────────────────────────────────

/** I «opret»: insert → koblingen → ingen jsonResponse imellem → svaret bærer webinar_kobling. */
export function koblingErFailSoft(gem: string): boolean {
  const k = udenKommentarer(gem);
  const iInsert = k.indexOf('.from("ansoegninger")\n        .insert(');
  const iKobl = k.indexOf("const webinarKobling = await koblWebinarTilmelding(");
  const iSvar = k.indexOf("return jsonResponse({ token: data.token,");
  if (iInsert < 0 || iKobl < 0 || iSvar < 0) return false;
  if (!(iInsert < iKobl && iKobl < iSvar)) return false;
  const mellem = k.slice(iKobl, iSvar);
  if (/jsonResponse\(|throw\b/.test(mellem)) return false;
  return /webinar_kobling: webinarKobling\.udfald/.test(k.slice(iSvar, iSvar + 200));
}

describe("webinarAnsoegningKobling.guard 3 — fail-soft: ansøgningen stoppes aldrig", () => {
  it("udfaldene er de fire", () => {
    expect([...WEBINAR_KOBLING_UDFALD]).toEqual(["koblet", "intet_token", "ugyldigt", "fejl"]);
  });
  it("intet token → «intet_token», prædikatet kaldes ikke", async () => {
    let kaldt = 0;
    const p: DeltagerPraedikat = async () => {
      kaldt++;
      return { ok: true, deltager: { id: TILMELDING } };
    };
    for (const t of [undefined, null, "", "   "]) {
      const opt: Optagelse = { updates: [] };
      expect((await koblWebinarTilmelding(falskAdmin({}, opt), "a", t, p)).udfald).toBe("intet_token");
      expect(opt.updates).toEqual([]);
    }
    expect(kaldt).toBe(0);
    expect(harWebinarToken(TOKEN)).toBe(true);
  });
  it("ugyldigt/forfalsket/tilbagekaldt token → «ugyldigt», intet skrevet", async () => {
    for (const g of ["form", "aftryk", "ukendt", "version", "ikke_platform"]) {
      const opt: Optagelse = { updates: [] };
      expect(await koblWebinarTilmelding(falskAdmin({}, opt), "a", TOKEN, afvis(g))).toEqual({ udfald: "ugyldigt", grund: g });
      expect(opt.updates).toEqual([]);
    }
  });
  it("manglende secret eller fejlet opslag → «fejl», intet skrevet", async () => {
    for (const g of ["ingen_secret", "opslag"]) {
      expect(udfaldAfGrund(g)).toBe("fejl");
      const opt: Optagelse = { updates: [] };
      expect((await koblWebinarTilmelding(falskAdmin({}, opt), "a", TOKEN, afvis(g))).udfald).toBe("fejl");
      expect(opt.updates).toEqual([]);
    }
  });
  it("kolonnen mangler (42703, migrationen ikke kørt) → «fejl» med grunden", async () => {
    const r = await koblWebinarTilmelding(falskAdmin({ error: { code: "42703", message: "column does not exist" } }, { updates: [] }), "a", TOKEN, godkend);
    expect(r).toEqual({ udfald: "fejl", grund: "kolonne_mangler" });
  });
  it("nul rækker opdateret → «fejl»; en undtagelse → «fejl» (kaster aldrig)", async () => {
    expect((await koblWebinarTilmelding(falskAdmin({ data: [] }, { updates: [] }), "a", TOKEN, godkend)).grund).toBe("ingen_raekke");
    expect(await koblWebinarTilmelding(falskAdmin({ kast: true }, { updates: [] }), "a", TOKEN, godkend)).toEqual({ udfald: "fejl", grund: "undtagelse" });
    const kaster: DeltagerPraedikat = async () => {
      throw new Error("x");
    };
    expect((await koblWebinarTilmelding(falskAdmin({}, { updates: [] }), "a", TOKEN, kaster)).udfald).toBe("fejl");
  });
  it("gyldigt token → «koblet»", async () => {
    expect(await koblWebinarTilmelding(falskAdmin({ data: [{ id: "a" }] }, { updates: [] }), "a", TOKEN, godkend)).toEqual({ udfald: "koblet", grund: null });
  });
  it("honningfeltets svar har samme form uden prædikatet", () => {
    expect(udfaldUdenKobling(undefined)).toBe("intet_token");
    expect(udfaldUdenKobling(TOKEN)).toBe("ugyldigt");
    expect(udenKommentarer(laes(GEM))).toMatch(/webinar_kobling: udfaldUdenKobling\(body\?\.webinar_token\)/);
  });
  it("i ansoegning-gem: efter insert'en, ingen afvisning før svaret, svaret bærer udfaldet", () => {
    expect(koblingErFailSoft(laes(GEM))).toBe(true);
  });
  it("MUTATION: en afvisning på et ugyldigt token fanges", () => {
    const m = laes(GEM).replace(
      "const webinarKobling = await koblWebinarTilmelding(adminClient, data.id, body?.webinar_token, verifyDeltagertoken);",
      'const webinarKobling = await koblWebinarTilmelding(adminClient, data.id, body?.webinar_token, verifyDeltagertoken);\n      if (webinarKobling.udfald === "ugyldigt") return jsonResponse({ error: "Ugyldigt webinartoken" }, 403);',
    );
    expect(m).not.toBe(laes(GEM));
    expect(koblingErFailSoft(m)).toBe(false);
  });
  it("MUTATION: koblingen før insert'en fanges", () => {
    const g = laes(GEM);
    const linje = "      const webinarKobling = await koblWebinarTilmelding(adminClient, data.id, body?.webinar_token, verifyDeltagertoken);\n";
    expect(g).toContain(linje);
    const m = g.replace(linje, "").replace("      const del = validerDel(body?.svar ?? {});\n      if (!del.ok) return jsonResponse({ error: \"Ugyldigt svar\", fejl: del.fejl }, 400);\n\n      const { data, error }", `      const del = validerDel(body?.svar ?? {});\n      if (!del.ok) return jsonResponse({ error: "Ugyldigt svar", fejl: del.fejl }, 400);\n${linje}\n      const { data, error }`);
    expect(m).not.toBe(g);
    expect(koblingErFailSoft(m)).toBe(false);
  });
});

// ── 4. Kun prædikatet ────────────────────────────────────────────────────────

/** ansoegning-gem bruger verifyDeltagertoken fra webinarDeltagerAuth.ts og intet andet af tokenets maskineri. */
export function kunPraedikatet(gem: string, kobling: string): boolean {
  const g = udenKommentarer(gem);
  if (!g.includes('import { verifyDeltagertoken } from "../_shared/webinarDeltagerAuth.ts";')) return false;
  if (!g.includes("verifyDeltagertoken);")) return false;
  for (const k of [g, udenKommentarer(kobling)]) {
    if (/WEBINAR_JOIN_SECRET|JOIN_SECRET|laesDeltagertoken|webinarMotor\/token|crypto\.subtle\.importKey|Deno\.env/.test(k.replace(/Deno\.env\.get\("SUPABASE_(URL|SERVICE_ROLE_KEY)"\)/g, ""))) return false;
  }
  // Koblingen importerer kun typer — prædikatet gives ind.
  const imports = [...udenKommentarer(kobling).matchAll(/^import\s+(type\s+)?[^;]*;/gm)];
  return imports.every((m) => m[1] === "type ");
}

describe("webinarAnsoegningKobling.guard 4 — kun husets prædikat", () => {
  it("ansoegning-gem importerer verifyDeltagertoken og læser hverken secret eller HMAC selv", () => {
    expect(kunPraedikatet(laes(GEM), laes(KOBLING))).toBe(true);
  });
  it("MUTATION: secret'en læst i ansoegning-gem fanges", () => {
    const m = laes(GEM).replace("const supabaseUrl = Deno.env.get(\"SUPABASE_URL\")!;", 'const supabaseUrl = Deno.env.get("SUPABASE_URL")!;\n    const s = Deno.env.get("WEBINAR_JOIN_SECRET");');
    expect(m).not.toBe(laes(GEM));
    expect(kunPraedikatet(m, laes(KOBLING))).toBe(false);
  });
  it("MUTATION: tokenet læst med laesDeltagertoken direkte fanges", () => {
    const m = `import { laesDeltagertoken } from "./webinarMotor/token.ts";\n${laes(KOBLING)}`;
    expect(m).not.toBe(laes(KOBLING));
    expect(kunPraedikatet(laes(GEM), m)).toBe(false);
  });
});

// ── 5. STRIKS body ───────────────────────────────────────────────────────────

/** Functionens KENDTE_FELTER, som de står (samme læsning som ansoegningGemKendteFelter.guard). */
function kendteFelterAf(gem: string): string[] {
  const m = /const KENDTE_FELTER = \[([^\]]*)\] as const;/.exec(gem);
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
}
/** Feltet står i opret's args-type og i INGEN af de andre ansoegning-gem-kald. */
export function kunOpretSender(api: string): boolean {
  const k = udenKommentarer(api);
  const type = /opretAnsoegning\(args: \{([^}]*)\}/.exec(k);
  if (!type || !/\bwebinar_token\?: string\b/.test(type[1])) return false;
  const andre = [...k.matchAll(/kald(?:<[^>]*>)?\("ansoegning-gem",\s*\{([^\n]*)/g)].map((m) => m[1]).filter((l) => !l.includes('handling: "opret"'));
  return andre.length >= 4 && andre.every((l) => !l.includes("webinar_token"));
}

describe("webinarAnsoegningKobling.guard 5 — STRIKS body kender feltet", () => {
  it("KENDTE_FELTER har webinar_token, og kun «opret» sender det", () => {
    expect(kendteFelterAf(laes(GEM))).toContain("webinar_token");
    expect(kunOpretSender(laes(API))).toBe(true);
  });
  it("siden sender ref'en med opret", () => {
    expect(udenKommentarer(laes(SIDE))).toMatch(/opretAnsoegning\(\{[^}]*webinar_token: webinarToken\.current \?\? undefined \}\)/);
  });
  it("MUTATION: feltet fjernet fra listen fanges", () => {
    const m = laes(GEM).replace(', "webinar_token"] as const;', "] as const;");
    expect(m).not.toBe(laes(GEM));
    expect(kendteFelterAf(m)).not.toContain("webinar_token");
  });
  it("MUTATION: tokenet sendt med «hent» fanges", () => {
    const m = laes(API).replace('{ handling: "hent", token }', '{ handling: "hent", token, webinar_token: "x" }');
    expect(m).not.toBe(laes(API));
    expect(kunOpretSender(m)).toBe(false);
  });
});

// ── 6. Migrationen ───────────────────────────────────────────────────────────

/** Første linje præcis, kun tilføjende, skive 1 som forudsætning, FK on delete set null. */
export function migrationenErRigtig(sql: string): boolean {
  if (sql.split("\n")[0] !== "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).") return false;
  const k = sql.replace(/--[^\n]*/g, "").toLowerCase();
  if (/\bdrop\b|\balter column\b|\bupdate\s+public\.|\bdelete\s+from\b|\bcreate policy\b|\bgrant\b/.test(k)) return false;
  if (!/add column if not exists webinar_tilmelding_id uuid references public\.webinar_tilmeldinger\(id\) on delete set null/.test(k)) return false;
  if (!/create index if not exists ansoegninger_webinar_tilmelding_idx/.test(k)) return false;
  return /raise exception[^;]*20261003010000/.test(k);
}

describe("webinarAnsoegningKobling.guard 6 — migrationen", () => {
  it("første linje, kun tilføjende, kræver skive 1", () => {
    expect(migrationenErRigtig(laes(MIGRATION))).toBe(true);
  });
  it("samme kolonne og indeks som skive 1 (no-op efter den)", () => {
    const s1 = laes("supabase/migrations/20261003010000_webinarmotor_skive1.sql").replace(/--[^\n]*/g, "");
    expect(s1).toMatch(/add column if not exists webinar_tilmelding_id uuid references public\.webinar_tilmeldinger\(id\) on delete set null/);
    expect(s1).toMatch(/create index if not exists ansoegninger_webinar_tilmelding_idx/);
  });
  it("MUTATION: forklaringen som første linje fanges", () => {
    const m = laes(MIGRATION).replace(/^[^\n]*\n/, "-- WEBINARMOTOREN, SKIVE 4\n");
    expect(migrationenErRigtig(m)).toBe(false);
  });
  it("MUTATION: en DROP fanges", () => {
    const m = laes(MIGRATION).replace("commit;", "alter table public.ansoegninger drop column kilde_raa;\ncommit;");
    expect(migrationenErRigtig(m)).toBe(false);
  });
  it("MUTATION: uden skive 1-porten fanges", () => {
    const m = laes(MIGRATION).replace(/^\s+raise exception[^;]*;/m, "    null;");
    expect(m).not.toBe(laes(MIGRATION));
    expect(migrationenErRigtig(m)).toBe(false);
  });
});
