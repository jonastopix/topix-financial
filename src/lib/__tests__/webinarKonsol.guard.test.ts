import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for værtskonsollen (minimal, 3/10-2026 — docs/webinarmotor.md §7.7).
 * Hver dom har en MUTATION, der viser, at værnet fælder den fejl, det er sat til.
 *
 *   1. RUTEN: /webinar/motor/session/:id står bag AdvisorRoute og i INGEN menu —
 *      kun App.tsx og konsol.ts (stiens eneste bygger) nævner stierne.
 *   2. INGEN REALTIME (spec §D3): hverken hook, flade eller side åbner en kanal;
 *      køen og «i rummet» hentes med refetchInterval = KONSOL_POLL_MS (10 s).
 *   3. PERSONDATA: af tilmeldingen hentes KUN fornavn — aldrig mail, navn,
 *      telefon eller andet; spørgsmålets egne kolonner er en fast liste.
 *   4. SVARET skrives KUN i svar-kolonnerne (status, svar_tekst, svaret_af),
 *      vagtet på status «ny»; triggeren tillader præcis de fire svar-kolonner.
 *   5. MIGRATIONEN: første linje, ingen SECURITY DEFINER, ingen anon, UPDATE-
 *      politikken udelukker tjenestekonti, triggeren dømmer «ny → besvaret»,
 *      leveret null og 1–1000 tegn, DROP kun af egne objekter, efter 20261003040000.
 *   6. HOOKS I TOPBLOKKEN (React #310): ingen hook efter konsollens første return;
 *      rækken har ingen hooks.
 *   7. TJENESTEKONTOEN (CTO 3/10, LAV): svarfeltet vises aldrig for den (visSvarfelt
 *      med erTjenestekonto fra AuthContext), mutationen afviser den før skrivningen,
 *      og 0 rækker for den hedder «tjenestekonto»; migrationens prøve dækker
 *      tjenestekonto → 0, medlem → 0 og andet svar → 55000.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const udenSql = (s: string) => s.replace(/--[^\n]*/g, "");

const APP = "src/App.tsx";
const LIB = "src/lib/webinarMotorAdmin/konsol.ts";
const HOOK = "src/hooks/webinarKonsol.ts";
const FLADE = "src/components/hjemmebane/webinarMotor/WebinarKonsol.tsx";
const SIDE = "src/pages/WebinarKonsol.tsx";
const MIG = "supabase/migrations/20261003050000_webinar_vaertskonsol.sql";
const FOERSTE = "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";

// ── 1. Ruten ─────────────────────────────────────────────────────────────────

const RUTE = '<Route path="/webinar/motor/session/:id" element={<AdvisorRoute><WebinarKonsol /></AdvisorRoute>} />';

function alleKildefiler(): string[] {
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const n of readdirSync(resolve(ROD, dir), { withFileTypes: true })) {
      const p = `${dir}/${n.name}`;
      if (n.isDirectory()) { if (n.name !== "__tests__") gaa(p); } else if (/\.tsx?$/.test(n.name)) ud.push(p);
    }
  };
  gaa("src");
  return ud;
}

/** Filer, der nævner konsollens sti i en streng (uden kommentarer). */
function naevnerKonsolStien(filer: Array<{ sti: string; kilde: string }>): string[] {
  return filer.filter((f) => /["'`](\/webinar\/motor\/session|\$\{OPSAETNING_STI\}\/session)/.test(udenKommentarer(f.kilde))).map((f) => f.sti);
}

describe("webinarKonsol.guard 1 — ruten", () => {
  it("bag AdvisorRoute", () => expect(laes(APP)).toContain(RUTE));
  it("ingen menu: kun App.tsx og konsol.ts nævner konsollens sti", () => {
    const filer = alleKildefiler().map((sti) => ({ sti, kilde: laes(sti) }));
    expect(naevnerKonsolStien(filer).sort()).toEqual([APP, LIB].sort());
  });
  it("konsolSti() kaldes kun fra opsætningens sessionsrække — og fra klokkens vej (skive 5: et nyt spørgsmål fører til konsollen)", () => {
    const kaldere = alleKildefiler().filter((f) => f !== LIB && /\bkonsolSti\(/.test(udenKommentarer(laes(f))));
    expect(kaldere.sort()).toEqual(["src/components/hjemmebane/webinarMotor/WebinarMotorOpsaetning.tsx", "src/lib/hjemmebane/klokke.ts"]);
  });
  it("MUTATION: en menu med stien og en rute uden AdvisorRoute fanges", () => {
    const filer = [{ sti: APP, kilde: laes(APP) }, { sti: LIB, kilde: laes(LIB) }, { sti: "src/lib/hjemmebane/hbNav.ts", kilde: 'const x = { sti: "/webinar/motor/session/1" };' }];
    expect(naevnerKonsolStien(filer)).toContain("src/lib/hjemmebane/hbNav.ts");
    expect(laes(APP).replace(RUTE, '<Route path="/webinar/motor/session/:id" element={<ProtectedRoute><WebinarKonsol /></ProtectedRoute>} />')).not.toContain(RUTE);
  });
});

// ── 2. Ingen Realtime ────────────────────────────────────────────────────────

const REALTIME = /\.channel\(|postgres_changes|removeChannel|\.subscribe\(|realtime/i;
function udenRealtime(kilde: string): boolean {
  return !REALTIME.test(udenKommentarer(kilde));
}

describe("webinarKonsol.guard 2 — ingen Realtime", () => {
  it("hook, flade og side åbner ingen kanal", () => {
    for (const f of [HOOK, FLADE, SIDE, LIB]) expect(udenRealtime(laes(f))).toBe(true);
  });
  it("køen og «i rummet» hentes med refetchInterval = KONSOL_POLL_MS = 10 s", () => {
    expect(laes(LIB)).toMatch(/export const KONSOL_POLL_MS = 10_000;/);
    const h = udenKommentarer(laes(HOOK));
    expect([...h.matchAll(/refetchInterval: KONSOL_POLL_MS/g)].length).toBe(2);
  });
  it("MUTATION: en kanal fanges", () => {
    expect(udenRealtime(laes(HOOK) + '\nsupabase.channel("konsol").on("postgres_changes", {}, () => {}).subscribe();')).toBe(false);
  });
});

// ── 3. Persondata ────────────────────────────────────────────────────────────

// + mail_udfald (skive 5, CTO 3/10 fund 7): svarmailens udfald — ingen persondata.
const SPOERGSMAAL_FELTER = ["id", "tekst", "pos_sek", "stillet_at", "art", "status", "svar_tekst", "svaret_at", "leveret", "leveret_at", "mail_udfald"];

/** Kolonnerne i køens select — og tilmeldingens indlejrede felter. */
function koeensFelter(hook: string): { egne: string[]; tilmelding: string[] } | null {
  const m = udenKommentarer(hook).match(/tabel\("webinar_spoergsmaal"\)\s*\.select\("([^"]+)"\)/);
  if (!m) return null;
  const emb = m[1].match(/tilmelding:webinar_tilmeldinger\(([^)]*)\)/);
  const egne = m[1].replace(/,?\s*tilmelding:webinar_tilmeldinger\([^)]*\)/, "").split(",").map((x) => x.trim()).filter(Boolean);
  return { egne, tilmelding: emb ? emb[1].split(",").map((x) => x.trim()) : [] };
}

function kunFornavn(hook: string): boolean {
  const f = koeensFelter(hook);
  if (!f) return false;
  if (JSON.stringify(f.tilmelding) !== JSON.stringify(["fornavn"])) return false;
  if (JSON.stringify([...f.egne].sort()) !== JSON.stringify([...SPOERGSMAAL_FELTER].sort())) return false;
  // Ingen anden læsning af tilmeldingerne i konsollen.
  return [...udenKommentarer(hook).matchAll(/webinar_tilmeldinger/g)].length === 1;
}

describe("webinarKonsol.guard 3 — persondata", () => {
  it("af tilmeldingen KUN fornavn; spørgsmålets kolonner er den faste liste", () => expect(kunFornavn(laes(HOOK))).toBe(true));
  it("fladen viser intet personfelt ud over fornavn", () => {
    const k = udenKommentarer(laes(FLADE));
    expect(k).not.toMatch(/\b(email|telefon|ip_dagshash|user_agent|ewebinar_id)\b/);
  });
  it("MUTATION: mail i indlejringen, en ekstra kolonne og et ekstra opslag fanges", () => {
    const h = laes(HOOK);
    expect(kunFornavn(h.replace("webinar_tilmeldinger(fornavn)", "webinar_tilmeldinger(fornavn, email)"))).toBe(false);
    expect(kunFornavn(h.replace('"id, tekst, pos_sek,', '"id, tekst, offentlig_tekst, pos_sek,'))).toBe(false);
    expect(kunFornavn(h + '\nconst y = tabel("webinar_tilmeldinger").select("email");')).toBe(false);
  });
});

// ── 4. Svaret kun i svar-kolonnerne ──────────────────────────────────────────

/** Nøglerne i hookens eneste .update({...}) og vagten på status «ny». */
function svarSkrivning(hook: string): { noegler: string[]; vagtet: boolean; antalUpdates: number } {
  const k = udenKommentarer(hook);
  const updates = [...k.matchAll(/\.update\(\{([^}]*)\}\)/g)];
  const noegler = updates.length === 1 ? updates[0][1].split(",").map((x) => x.split(":")[0].trim()).filter(Boolean) : [];
  return { noegler, vagtet: /\.update\(\{[^}]*\}\)\s*\.eq\("id", a\.id\)\s*\.eq\("status", "ny"\)/.test(k), antalUpdates: updates.length };
}

function triggerTilladte(sql: string): string[] | null {
  const m = sql.match(/tilladte constant text\[\] := array\[([^\]]*)\]/);
  return m ? m[1].split(",").map((x) => x.trim().replace(/'/g, "")) : null;
}

describe("webinarKonsol.guard 4 — svaret kun i svar-kolonnerne", () => {
  it("hooken skriver kun status, svar_tekst og svaret_af — vagtet på «ny»", () => {
    const s = svarSkrivning(laes(HOOK));
    expect(s.antalUpdates).toBe(1);
    expect(s.noegler.sort()).toEqual(["status", "svar_tekst", "svaret_af"]);
    expect(s.vagtet).toBe(true);
  });
  it("fladen og siden skriver ikke selv (kun gennem hooken)", () => {
    for (const f of [FLADE, SIDE]) expect(udenKommentarer(laes(f))).not.toMatch(/\bsupabase\b/);
  });
  it("triggeren tillader præcis de fire svar-kolonner", () => {
    expect(triggerTilladte(laes(MIG))).toEqual(["status", "svar_tekst", "svaret_af", "svaret_at"]);
  });
  it("MUTATION: leveret i skrivningen, en manglende vagt og en udvidet trigger fanges", () => {
    const h = laes(HOOK);
    expect(svarSkrivning(h.replace('svaret_af: user.id })', 'svaret_af: user.id, leveret: "live" })')).noegler).toContain("leveret");
    expect(svarSkrivning(h.replace('.eq("status", "ny")\n', "\n")).vagtet).toBe(false);
    expect(triggerTilladte(laes(MIG).replace("'svaret_at'];", "'svaret_at', 'tekst'];"))).not.toEqual(["status", "svar_tekst", "svaret_af", "svaret_at"]);
  });
});

// ── 5. Migrationen ───────────────────────────────────────────────────────────

function migrationErRigtig(sql: string): boolean {
  if (sql.split("\n")[0] !== FOERSTE) return false;
  const k = udenSql(sql);
  if (/security definer/i.test(k)) return false;
  if (/\bto anon\b/i.test(k)) return false;
  if (/^\s*(update|delete|truncate|alter)\b/im.test(k)) return false;
  // DROP kun af objekter, filen selv opretter.
  for (const m of k.matchAll(/drop policy if exists "([^"]+)" on/gi)) if (!k.includes(`create policy "${m[1]}"`)) return false;
  for (const m of k.matchAll(/drop trigger if exists (\w+) on/gi)) if (!k.includes(`create trigger ${m[1]}`)) return false;
  if (/drop (table|column|function)\b/i.test(k)) return false;
  const politikker = [...k.matchAll(/create policy "([^"]+)" on public\.(\w+)\s+for (\w+) to (\w+)([\s\S]*?);/gi)];
  if (politikker.length !== 1) return false;
  const [, , tabel, cmd, rolle, krop] = politikker[0];
  if (tabel !== "webinar_spoergsmaal" || cmd !== "update" || rolle !== "authenticated") return false;
  if ((krop.match(/public\.has_role\(auth\.uid\(\), 'advisor'\)/g) ?? []).length !== 2) return false;
  if ((krop.match(/not exists \(select 1 from public\.tjenestekonti tk where tk\.user_id = auth\.uid\(\)\)/g) ?? []).length !== 2) return false;
  // Triggerens domme.
  if (!/create trigger webinar_spoergsmaal_vaert_kolonnevaern\s+before update on public\.webinar_spoergsmaal/.test(k)) return false;
  if (!k.includes("old.status is distinct from 'ny' or old.leveret is not null")) return false;
  if (!k.includes("new.status is distinct from 'besvaret'")) return false;
  if (!k.includes("length(btrim(new.svar_tekst)) not between 1 and 1000")) return false;
  if (!k.includes("new.svaret_af is distinct from auth.uid()")) return false;
  if (!k.includes("new.svaret_at := now();")) return false;
  // Serverens ur: kun authenticated.
  if (!/revoke all on function public\.webinar_server_nu\(\) from public, anon;/.test(k)) return false;
  return true;
}

describe("webinarKonsol.guard 5 — migrationen", () => {
  it("første linje, ingen definer, ingen anon, kun egne objekter, rådgiver minus tjenestekonti, triggerens domme", () => {
    expect(migrationErRigtig(laes(MIG))).toBe(true);
  });
  it("tidsstemplet ligger efter 20261003040000 (ukørte efter alle andre)", () => {
    expect(MIG.split("/")[2].slice(0, 14) > "20261003040000").toBe(true);
    const alle = readdirSync(resolve(ROD, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    // 3/10: kun webinarmotorens egne, senere skiver må ligge efter — nævnt ved navn
    // (+ tilmeldingerne til Metas spor, 20261003070000, webinarTilmeldMeta.guard).
    // (+ webinarchattens bagende, 20261003080000, §7.10; webinarChatBagende.guard).
    expect(alle.slice(alle.indexOf(MIG.split("/")[2]) + 1)).toEqual(["20261003070000_meta_haendelser_tilmelding.sql", "20261003080000_webinar_chat_bagende.sql"]);
  });
  it("MUTATION: forkert første linje, SECURITY DEFINER, anon, tjenestekonto-hul og løsere trigger fanges", () => {
    const m = laes(MIG);
    expect(migrationErRigtig(m.replace(FOERSTE, "-- KØRT"))).toBe(false);
    expect(migrationErRigtig(m.replace("stable\nsecurity invoker", "stable\nsecurity definer"))).toBe(false);
    expect(migrationErRigtig(m.replace("for update to authenticated", "for update to anon"))).toBe(false);
    const udenTk = m.replace(/(using \(\n\s+public\.has_role\(auth\.uid\(\), 'advisor'\))\n\s+and not exists \(select 1 from public\.tjenestekonti tk where tk\.user_id = auth\.uid\(\)\)/, "$1");
    expect(udenTk).not.toBe(m);
    expect(migrationErRigtig(udenTk)).toBe(false);
    expect(migrationErRigtig(m.replace("not between 1 and 1000", "not between 1 and 4000"))).toBe(false);
    expect(migrationErRigtig(m + '\ndrop policy if exists "Advisors can view webinar_spoergsmaal" on public.webinar_spoergsmaal;')).toBe(false);
  });
});

// ── 6. Hooks i topblokken ────────────────────────────────────────────────────

function hooksITopblokken(flade: string): boolean {
  const k = udenKommentarer(flade);
  const hoved = k.slice(k.indexOf("export const WebinarKonsol"), k.indexOf("interface RaekkeProps"));
  const foersteReturn = hoved.indexOf("return (");
  if (foersteReturn === -1) return false;
  if (![...hoved.matchAll(/\buse[A-Z]\w*\(/g)].every((m) => (m.index ?? 0) < foersteReturn)) return false;
  return !/\buse[A-Z]\w*\(/.test(k.slice(k.indexOf("function SpoergsmaalRaekke")));
}

describe("webinarKonsol.guard 6 — hooks i topblokken", () => {
  it("ingen hook efter første return; rækken har ingen hooks", () => expect(hooksITopblokken(laes(FLADE))).toBe(true));
  it("MUTATION: en hook efter return og en hook i rækken fanges", () => {
    const f = laes(FLADE);
    expect(hooksITopblokken(f.replace("  const s = session.data ?? null;", "  const s = session.data ?? null;\n  const [x] = useState(0);"))).toBe(false);
    expect(hooksITopblokken(f.replace('  const feltId = `konsol-svar-${q.id}`;', '  const feltId = `konsol-svar-${q.id}`;\n  const [y] = useState(1);'))).toBe(false);
  });
});

// ── 7. Tjenestekontoen ───────────────────────────────────────────────────────

function tjenestekontoLaast(flade: string, hook: string, lib: string): boolean {
  const f = udenKommentarer(flade), h = udenKommentarer(hook), l = udenKommentarer(lib);
  if (!/const \{ erTjenestekonto \} = useAuth\(\);/.test(f)) return false;
  if (!f.includes("kanSvare={visSvarfelt(q, erTjenestekonto)}")) return false;
  if (!f.includes("{kanSvare && (")) return false;
  if (/\{erUbesvaret\(q\) && \(/.test(f)) return false;
  if (!l.includes("!erTjenestekonto && erUbesvaret(s)")) return false;
  if (!/if \(erTjenestekonto\) return "tjenestekonto";/.test(l)) return false;
  if (!/const \{ user, erTjenestekonto \} = useAuth\(\);/.test(h)) return false;
  // Afvist FØR skrivningen, og 0 rækker dømmes med kontoen.
  const afvis = h.indexOf("if (erTjenestekonto) throw");
  const upd = h.indexOf(".update({");
  if (afvis === -1 || upd === -1 || afvis > upd) return false;
  return h.includes("nulRaekkerGrund((nu?.status as string | undefined) ?? null, erTjenestekonto)");
}

describe("webinarKonsol.guard 7 — tjenestekontoen", () => {
  it("svarfeltet skjules, mutationen afviser, grunden hedder «tjenestekonto»", () => {
    expect(tjenestekontoLaast(laes(FLADE), laes(HOOK), laes(LIB))).toBe(true);
  });
  it("migrationens prøve dækker tjenestekonto, medlem og andet svar — med forventet udfald", () => {
    const m = laes(MIG);
    expect(m).toMatch(/-- a\) tjenestekonto[\s\S]*?-- → UPDATE 0/);
    expect(m).toMatch(/-- b\) medlem[\s\S]*?-- → UPDATE 0/);
    expect(m).toMatch(/-- d\) andet svar på samme spørgsmål:[\s\S]*?-- → FEJL 55000/);
  });
  it("MUTATION: svarfelt uden kontoen, ingen afvisning og en grund uden kontoen fanges", () => {
    const f = laes(FLADE), h = laes(HOOK), l = laes(LIB);
    expect(tjenestekontoLaast(f.replace("{kanSvare && (", "{erUbesvaret(q) && ("), h, l)).toBe(false);
    expect(tjenestekontoLaast(f, h.replace(/\n\s*if \(erTjenestekonto\) throw[^\n]*/, ""), l)).toBe(false);
    expect(tjenestekontoLaast(f, h, l.replace('if (erTjenestekonto) return "tjenestekonto";', ""))).toBe(false);
    expect(tjenestekontoLaast(f, h, l.replace("!erTjenestekonto && erUbesvaret(s)", "erUbesvaret(s)"))).toBe(false);
  });
});
