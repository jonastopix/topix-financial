import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn (29/9-2026, sikkerhedsanalysen fund 1 og 7): kolonneværnet på companies
// (migration 20260929210000) har en HVIDLISTE over de kolonner, et medlem må ændre.
// Den skal holdes i takt med src/: hver medlemssti, der skriver companies, må kun skrive
// hvidlistede kolonner; en ny fil, der skriver companies, skal klassificeres (medlem eller
// rådgiver), før suiten er grøn; og de beskyttede kolonner kommer aldrig på listen.
// Selvbevis: hver dom prøves også på en vredet kilde nederst.

const ROD = process.cwd();
const MIGRATION = "supabase/migrations/20260929210000_companies_kolonnevaern.sql";
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const udenSqlKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

/** Medlemsstier: skrivningerne her SKAL holde sig inden for hvidlisten. */
export const MEDLEMSFILER = [
  "src/components/hjemmebane/indstillinger/IndstillingerView.tsx",
  "src/components/MembershipExpiredGate.tsx",
  "src/hooks/useAuth.tsx",
  "src/lib/hjemmebane/memberProfile.ts",
  "src/lib/delingsbilleder.ts",
] as const;

/** Rådgiverstier: skriver kolonner uden for listen og bæres af has_role('advisor') i triggeren. */
export const RAADGIVERFILER = [
  "src/components/members/EditCompanyDialog.tsx",
  "src/hooks/useVirksomhed.ts",
] as const;

/** Må ALDRIG være medlemsskrivbare (adgang, sessioner, penge, status, Stripe). */
export const FORBUDTE = [
  "id",
  "contract_end_date",
  "contract_start_date",
  "start_date",
  "end_date",
  "is_legat",
  "is_demo",
  "status",
  "er_kunde",
  "certificate_eligible",
  "vis_i_netvaerk",
  "subscription_status",
  "subscription_current_period_end",
  "stripe_customer_id",
  "stripe_subscription_id",
  "sidste_checkout_session_id",
  "indgangspris_oere",
  "fornyelsespris_oere",
  "intro_session_used_at",
  "jonas_session_used_at",
  "intro_reminder_last_sent_at",
  "slack_channel",
  "application_context",
  "data_slettet_at",
] as const;

/** Hvidlisten, som den står i triggerens `tilladte constant text[] := array[ … ]`. */
export function hvidlisten(sql: string): string[] {
  const m = udenSqlKommentarer(sql).match(/tilladte\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** Argumentet til det første `.update(` efter hvert `.from("companies")`, til den matchende parentes. */
export function companiesUpdates(kilde: string): string[] {
  const k = udenKommentarer(kilde);
  const ud: string[] = [];
  for (const m of k.matchAll(/\.from\(\s*["'`]companies["'`]\s*\)/g)) {
    const efter = k.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
    // Kun hvis kæden fortsætter direkte i en .update( — ikke en senere, anden from().
    const u = efter.match(/^[\s\S]*?\.(update|select|insert|upsert|delete)\(/);
    if (!u || u[1] !== "update") continue;
    let i = u[0].length;
    let dybde = 1;
    const start = i;
    while (i < efter.length && dybde > 0) {
      const c = efter[i];
      if (c === "(" || c === "{" || c === "[") dybde++;
      else if (c === ")" || c === "}" || c === "]") dybde--;
      i++;
    }
    ud.push(efter.slice(start, i - 1).trim());
  }
  return ud;
}

/** Nøglerne i et objekt-literal (`{ a: x, b }`); null når argumentet ikke er et rent literal. */
export function literalNoegler(arg: string): string[] | null {
  const a = arg.replace(/\s+as\s+any\s*$/, "").trim();
  if (!a.startsWith("{") || !a.endsWith("}")) return null;
  const indre = a.slice(1, -1);
  const dele: string[] = [];
  let dybde = 0;
  let cur = "";
  for (const c of indre) {
    if (c === "(" || c === "{" || c === "[") dybde++;
    if (c === ")" || c === "}" || c === "]") dybde--;
    if (c === "," && dybde === 0) { dele.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) dele.push(cur);
  const noegler: string[] = [];
  for (const d of dele.map((x) => x.trim()).filter(Boolean)) {
    if (d.startsWith("...")) return null;
    const n = d.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)/);
    if (!n) return null;
    noegler.push(n[1]);
  }
  return noegler;
}

/** Dommen: tomme lister = i takt. */
export function doemMedlemsstier(
  filer: readonly { sti: string; kilde: string }[],
  hvid: readonly string[],
): { udenforListen: string[]; ikkeLiteral: string[] } {
  const udenforListen: string[] = [];
  const ikkeLiteral: string[] = [];
  for (const { sti, kilde } of filer) {
    for (const arg of companiesUpdates(kilde)) {
      const n = literalNoegler(arg);
      if (n === null) { ikkeLiteral.push(`${sti}: ${arg.slice(0, 60)}`); continue; }
      for (const k of n) if (!hvid.includes(k)) udenforListen.push(`${sti}: ${k}`);
    }
  }
  return { udenforListen, ikkeLiteral };
}

function alleKildefiler(dir: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(resolve(ROD, dir))) {
    const sti = join(dir, navn);
    if (navn === "__tests__" || navn === "node_modules") continue;
    const st = statSync(resolve(ROD, sti));
    if (st.isDirectory()) ud.push(...alleKildefiler(sti));
    else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn)) ud.push(sti);
  }
  return ud;
}

describe("companiesKolonnevaern.guard — hvidlisten i triggeren og medlemsstierne i src/ er i takt", () => {
  const sql = laes(MIGRATION);
  const hvid = hvidlisten(sql);

  it("migrationen: første linje, trigger BEFORE UPDATE, SECURITY INVOKER, search_path, ingen FORBIDDEN-ændring", () => {
    expect(sql.split("\n")[0]).toBe("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).");
    const krop = udenSqlKommentarer(sql);
    expect(krop).toMatch(/create trigger companies_medlem_kolonnevaern\s+before update on public\.companies\s+for each row execute function public\.companies_medlem_kolonnevaern\(\);/);
    expect(krop).toContain("security invoker");
    expect(krop).toContain("set search_path = public");
    expect(krop).not.toMatch(/security definer/i);
    expect(krop).toContain("errcode = '42501'");
    // Rådgiver-, service- og postgres-vejene står i koden — ellers brydes EditCompanyDialog, stripe-webhook og SQL editor.
    expect(krop).toContain("public.has_role(auth.uid(), 'advisor'::app_role)");
    expect(krop).toContain("current_user::text not in ('authenticated', 'anon') and jwt_rolle not in ('authenticated', 'anon')");
    // FORBIDDEN (CLAUDE.md): ingen SECURITY DEFINER-funktion, handle_new_user eller protect_*-trigger røres.
    for (const f of ["function public.has_role", "function public.user_company_id", "handle_new_user", "protect_"]) {
      expect(krop.toLowerCase()).not.toContain(f.toLowerCase());
    }
    // Ingen eksisterende companies-policy røres.
    expect(krop).not.toMatch(/policy[^;]*on public\.companies/i);
  });

  it("hvidlisten er læst og indeholder ingen forbudt kolonne", () => {
    expect(hvid.length).toBeGreaterThanOrEqual(10);
    expect(hvid.filter((k) => (FORBUDTE as readonly string[]).includes(k))).toEqual([]);
  });

  it("hver medlemssti skriver kun hvidlistede kolonner, og kun som objekt-literal", () => {
    const filer = MEDLEMSFILER.map((sti) => ({ sti, kilde: laes(sti) }));
    // Hver medlemsfil har mindst én skrivning — ellers er listen forældet.
    for (const f of filer) expect(companiesUpdates(f.kilde).length, f.sti).toBeGreaterThan(0);
    expect(doemMedlemsstier(filer, hvid)).toEqual({ udenforListen: [], ikkeLiteral: [] });
  });

  it("hver fil i src/, der opdaterer companies, er klassificeret som medlem eller rådgiver", () => {
    const skrivere = alleKildefiler("src").filter((sti) => companiesUpdates(laes(sti)).length > 0).sort();
    expect(skrivere).toEqual([...MEDLEMSFILER, ...RAADGIVERFILER].sort());
  });

  it("hvidlisten åbner intet, medlemsstierne ikke bruger (fail-closed)", () => {
    const brugt = new Set(
      MEDLEMSFILER.flatMap((sti) => companiesUpdates(laes(sti)).flatMap((a) => literalNoegler(a) ?? [])),
    );
    expect(hvid.filter((k) => !brugt.has(k))).toEqual([]);
  });

  it("fund 7: policyen droppes, og ingen klient indsætter i advisor_notifications", () => {
    expect(udenSqlKommentarer(sql)).toContain('drop policy if exists "Members can insert own notifications" on public.advisor_notifications;');
    const indsaettere = alleKildefiler("src").filter((sti) =>
      /from\(\s*["'`]advisor_notifications["'`](\s+as\s+any)?\s*\)\s*\.(insert|upsert)\(/.test(udenKommentarer(laes(sti))),
    );
    expect(indsaettere).toEqual([]);
  });

  it("selvbevis: dommene falder, når kilden vrides", () => {
    const vredet = 'await supabase.from("companies").update({ name, contract_end_date: "2099-01-01" }).eq("id", x);';
    expect(doemMedlemsstier([{ sti: "v.ts", kilde: vredet }], hvid).udenforListen).toEqual(["v.ts: contract_end_date"]);
    const spredt = 'await supabase.from("companies").update({ ...felter }).eq("id", x);';
    expect(doemMedlemsstier([{ sti: "s.ts", kilde: spredt }], hvid).ikkeLiteral.length).toBe(1);
    const flerlinje = 'await supabase\n  .from("companies")\n  .update({ offboarding_requested_at: null } as any)\n  .eq("id", x);';
    expect(companiesUpdates(flerlinje).map(literalNoegler)).toEqual([["offboarding_requested_at"]]);
    const kunLaes = 'await supabase.from("companies").select("id").eq("id", x); await supabase.from("x").update({ is_legat: true });';
    expect(companiesUpdates(kunLaes)).toEqual([]);
    expect(hvidlisten("tilladte constant text[] := array['name', 'is_legat'];")).toEqual(["name", "is_legat"]);
    expect(hvidlisten("tilladte constant text[] := array['name', 'is_legat'];").filter((k) => (FORBUDTE as readonly string[]).includes(k))).toEqual(["is_legat"]);
  });
});
