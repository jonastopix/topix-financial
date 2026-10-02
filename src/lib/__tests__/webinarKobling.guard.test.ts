import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for webinarkoblingen (udkast 1/10-2026 — Jonas «forslag + klik»).
 * Ni domme, hver prøvet fra begge sider (rigtig kilde → sand, én ændring → falsk):
 *   1. Migrationens filhoved: FØRSTE linje er «IKKE KØRT …» eller «KØRT i prod …», FØR/EFTER-SQL står i hovedet.
 *   2. RLS: slået til, KUN rådgiverpolicies (has_role … 'advisor'), SELECT/INSERT/DELETE,
 *      ingen medlemsadgang (user_company_id, auth.uid() = user_id), ingen UPDATE, anon intet.
 *   3. Ingen SECURITY DEFINER, ingen ny funktion, ingen trigger; has_role/user_company_id/
 *      handle_new_user røres ikke.
 *   4. Én pr. ansøgning OG én pr. tilmelding (UNIQUE begge — rådets M2), FK'er med ON DELETE
 *      CASCADE, koblet_af = auth.uid() kræves, `NOTIFY pgrst, 'reload schema'` SIDST (L4).
 *   5. Tragten tæller koblingen ÉT sted: dommen (begge spejle) kalder medWebinarKobling
 *      FØR alt andet; annoncepriserne (begge spejle) gør det samme.
 *   6. Data hentes i hooken OG i webinar-delt (koblingerne pr. ansøgnings-id).
 *   7. Fladen tegner dommens forslag — ingen egen navne-/telefonsammenligning — og giver
 *      dommen de optagne tilmeldinger (M2).
 *   8. Kandidat-opslaget henter KUN typens kolonner, nyeste først, sideinddelt til loftet (L5).
 *   9. Beviset for udrulningen af webinar-delt: `koblinger_talt` i bygDeltSvar; PGRST200 er
 *      fail-soft i functionen og i hooken (M3, L4).
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const MIG = "supabase/migrations/20261001120000_ansoegning_webinar_kobling.sql";
const udenSqlKommentarer = (s: string) => s.replace(/--.*$/gm, "");

export const hovedetErRigtigt = (sql: string): boolean => {
  const linjer = sql.split("\n");
  const hoved = sql.slice(0, sql.indexOf("CREATE TABLE"));
  return (
    // Hovedet vendes til «KØRT i prod …», når migrationen er kørt (regelsættet §4c (dd)).
    /^-- (IKKE KØRT\.|KØRT i prod) /.test(linjer[0]) &&
    linjer[0].endsWith("DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).") &&
    /--.*FØR[\s\S]*information_schema\.tables/.test(hoved) &&
    /--.*EFTER[\s\S]*pg_policies/.test(hoved)
  );
};

export const rlsErKunRaadgivere = (sql: string): boolean => {
  const s = udenSqlKommentarer(sql);
  const policies = [...s.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map((m) => m[0]);
  const cmds = policies.map((p) => /FOR\s+(\w+)/i.exec(p)?.[1].toUpperCase()).sort();
  return (
    /ALTER TABLE public\.ansoegning_webinar_kobling ENABLE ROW LEVEL SECURITY;/.test(s) &&
    policies.length === 3 &&
    JSON.stringify(cmds) === JSON.stringify(["DELETE", "INSERT", "SELECT"]) &&
    policies.every((p) => /TO authenticated/.test(p) && /public\.has_role\(auth\.uid\(\), 'advisor'\)/.test(p)) &&
    !/AS RESTRICTIVE/i.test(s) &&
    !/user_company_id|auth\.uid\(\)\s*=\s*user_id|'member'/.test(s) &&
    /REVOKE ALL ON public\.ansoegning_webinar_kobling FROM anon;/.test(s) &&
    /GRANT SELECT, INSERT, DELETE ON public\.ansoegning_webinar_kobling TO authenticated;/.test(s) &&
    !/GRANT[^;]*UPDATE/i.test(s) &&
    !/TO anon/i.test(s)
  );
};

export const ingenDefinerEllerFunktion = (sql: string): boolean => {
  const s = udenSqlKommentarer(sql);
  return !/SECURITY\s+DEFINER/i.test(s) && !/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(s) && !/CREATE\s+TRIGGER/i.test(s) &&
    !/handle_new_user|user_company_id/i.test(s) && !/(FUNCTION|ALTER)[^;]*has_role/i.test(s);
};

export const formenErRigtig = (sql: string): boolean => {
  const s = udenSqlKommentarer(sql);
  return (
    /UNIQUE \(ansoegning_id\)/.test(s) &&
    /UNIQUE \(tilmelding_id\)/.test(s) &&
    /NOTIFY pgrst, 'reload schema';\s*$/.test(s) &&
    /ansoegning_id uuid NOT NULL REFERENCES public\.ansoegninger\(id\) ON DELETE CASCADE/.test(s) &&
    /tilmelding_id uuid NOT NULL REFERENCES public\.webinar_tilmeldinger\(id\) ON DELETE CASCADE/.test(s) &&
    /koblet_af\s+uuid NOT NULL DEFAULT auth\.uid\(\)/.test(s) &&
    /koblet_at\s+timestamptz NOT NULL DEFAULT now\(\)/.test(s) &&
    /WITH CHECK \(public\.has_role\(auth\.uid\(\), 'advisor'\) AND koblet_af = auth\.uid\(\)\)/.test(s)
  );
};

const DOM = "src/lib/webinar/dashboard.ts", DOM_S = "supabase/functions/_shared/webinarDashboard.ts";
const PRIS = "src/lib/webinar/annoncepriser.ts", PRIS_S = "supabase/functions/_shared/annoncepriser.ts";

export const tragtenTaellerKoblingen = (dom: string, pris: string): boolean =>
  dom.includes("export function medWebinarKobling(") &&
  /const ansoegninger = medWebinarKobling\(ind\.ansoegninger\);/.test(dom) &&
  !/const \{ tilmeldinger, ansoegninger, sporKolonnerFindes \} = ind;/.test(dom) &&
  pris.includes("ansoegerMails(medWebinarKobling(ansoegninger))") &&
  pris.includes("medlemsMails(medWebinarKobling(ansoegninger))");

export const koblingerneHentes = (hook: string, delt: string): boolean =>
  /hentKoblingsMails\(\)/.test(hook) && /webinar_email: koblinger\.get\(id\) \?\? null/.test(hook) &&
  /from\("ansoegning_webinar_kobling"\)\.select\("ansoegning_id, webinar_tilmeldinger\(email\)"\)/.test(delt) &&
  /webinar_email: koblinger\.get\(id\) \?\? null/.test(delt);

export const fladenTegnerDommen = (flade: string): boolean =>
  /foreslaaWebinarKobling\(d\.ansoegning, d\.kandidater, d\.optagne\)/.test(flade) &&
  /koblingsVisning\(/.test(flade) &&
  !/normaliserNavn|normaliserTelefon|toLowerCase\(\)|\.telefon ===|\.navn ===/.test(flade);

/** Kolonnelisten = typens felter (id, created_at + Pick'en), nyeste først, sideinddelt. */
export const kandidaterneErSmalle = (hook: string): boolean => {
  const kol = hook.match(/export const KOBLING_TILMELDING_KOLONNER =\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
  const pick = hook.match(/export type KoblingsTilmelding = Pick<WebinarTilmelding,\s*([^>]+)>/)?.[1] ?? "";
  const typens = ["id", "created_at", ...[...pick.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])].sort();
  const listen = kol.split(",").map((k) => k.trim()).filter(Boolean).sort();
  return (
    listen.length > 0 && JSON.stringify(listen) === JSON.stringify(typens) &&
    !/TILMELDING_KOLONNER\b(?!\s*=)/.test(hook.replace(/KOBLING_TILMELDING_KOLONNER/g, "")) &&
    /\.order\("registreret_at", \{ ascending: false, nullsFirst: false \}\)/.test(hook) &&
    /\.range\(start,/.test(hook) &&
    /afkortet: true/.test(hook)
  );
};

export const beviset = (svarFil: string, delt: string, hook: string): boolean =>
  /koblinger_talt: number;/.test(svarFil) &&
  /koblinger_talt: koblingerTalt\(ind\.ansoegninger\)/.test(svarFil) &&
  /const KOBLING_FAIL_SOFT_KODER = \[[^\]]*"PGRST200"[^\]]*\];/.test(delt) &&
  /res\.error\.code === "PGRST200"/.test(hook);

describe("webinarkoblingens kildeværn", () => {
  const sql = laes(MIG);

  it("1. filhovedet: IKKE KØRT øverst, FØR/EFTER-SQL i hovedet", () => {
    expect(hovedetErRigtigt(sql)).toBe(true);
    expect(hovedetErRigtigt(`-- Webinarkoblingen\n${sql}`)).toBe(false);
    expect(hovedetErRigtigt(sql.replace(/^[^\n]*/, "-- KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)."))).toBe(false);
    expect(hovedetErRigtigt(sql.replace(/pg_policies/g, "x"))).toBe(false);
  });

  it("2. RLS: kun rådgivere, SELECT/INSERT/DELETE, ingen medlemsadgang, ingen UPDATE, anon intet", () => {
    expect(rlsErKunRaadgivere(sql)).toBe(true);
    expect(rlsErKunRaadgivere(sql.replace("ENABLE ROW LEVEL SECURITY;", ";"))).toBe(false);
    expect(rlsErKunRaadgivere(sql.replace(
      'FOR SELECT TO authenticated\n  USING (public.has_role(auth.uid(), \'advisor\'));',
      "FOR SELECT TO authenticated\n  USING (public.has_role(auth.uid(), 'advisor') OR EXISTS (SELECT 1 FROM public.ansoegninger a WHERE a.company_id = public.user_company_id(auth.uid())));"))).toBe(false);
    expect(rlsErKunRaadgivere(`${sql}\nCREATE POLICY "x" ON public.ansoegning_webinar_kobling FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'advisor'));`)).toBe(false);
    expect(rlsErKunRaadgivere(sql.replace("GRANT SELECT, INSERT, DELETE", "GRANT SELECT, INSERT, UPDATE, DELETE"))).toBe(false);
    expect(rlsErKunRaadgivere(sql.replace("REVOKE ALL ON public.ansoegning_webinar_kobling FROM anon;", ""))).toBe(false);
  });

  it("3. ingen SECURITY DEFINER, ingen funktion/trigger, husets kernefunktioner urørte", () => {
    expect(ingenDefinerEllerFunktion(sql)).toBe(true);
    expect(ingenDefinerEllerFunktion(`${sql}\nCREATE FUNCTION public.x() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ $$;`)).toBe(false);
    expect(ingenDefinerEllerFunktion(`${sql}\nCREATE TRIGGER t BEFORE INSERT ON public.ansoegning_webinar_kobling FOR EACH ROW EXECUTE FUNCTION public.x();`)).toBe(false);
    expect(ingenDefinerEllerFunktion(`${sql}\nCREATE OR REPLACE FUNCTION public.has_role(uuid, app_role) RETURNS boolean AS $$ select true $$ LANGUAGE sql;`)).toBe(false);
  });

  it("4. én pr. ansøgning, FK'er med cascade, koblet_af = auth.uid()", () => {
    expect(formenErRigtig(sql)).toBe(true);
    expect(formenErRigtig(sql.replace("UNIQUE (ansoegning_id)", "CHECK (true)"))).toBe(false);
    expect(formenErRigtig(sql.replace("REFERENCES public.ansoegninger(id) ON DELETE CASCADE", "REFERENCES public.ansoegninger(id)"))).toBe(false);
    expect(formenErRigtig(sql.replace(" AND koblet_af = auth.uid())", ")"))).toBe(false);
    expect(formenErRigtig(sql.replace("CONSTRAINT ansoegning_webinar_kobling_en_pr_tilmelding UNIQUE (tilmelding_id)", "CHECK (true)"))).toBe(false);
    expect(formenErRigtig(sql.replace("\nNOTIFY pgrst, 'reload schema';", "\n"))).toBe(false);
    expect(formenErRigtig(`${sql}\nSELECT 1;\n`)).toBe(false);
  });

  it("5. tragten tæller koblingen ét sted — i begge spejle og i annoncepriserne", () => {
    for (const [d, p] of [[DOM, PRIS], [DOM_S, PRIS_S]]) {
      const dom = laes(d), pris = laes(p);
      expect(tragtenTaellerKoblingen(dom, pris)).toBe(true);
      expect(tragtenTaellerKoblingen(dom.replace("const ansoegninger = medWebinarKobling(ind.ansoegninger);", "const ansoegninger = ind.ansoegninger;"), pris)).toBe(false);
      expect(tragtenTaellerKoblingen(dom, pris.replace("ansoegerMails(medWebinarKobling(ansoegninger))", "ansoegerMails(ansoegninger)"))).toBe(false);
    }
  });

  it("6. koblingerne hentes i hooken og i webinar-delt", () => {
    const hook = laes("src/hooks/webinarDashboard.ts"), delt = laes("supabase/functions/webinar-delt/index.ts");
    expect(koblingerneHentes(hook, delt)).toBe(true);
    expect(koblingerneHentes(hook.replace("const koblinger = await hentKoblingsMails();", "const koblinger = new Map<string, string>();"), delt)).toBe(false);
    expect(koblingerneHentes(hook, delt.replace(/webinar_email: koblinger\.get\(id\) \?\? null/, "webinar_email: null"))).toBe(false);
  });

  it("7. fladen tegner dommens forslag og regner ikke selv", () => {
    const flade = laes("src/components/hjemmebane/ansoegninger/WebinarKoblingAfsnit.tsx");
    expect(fladenTegnerDommen(flade)).toBe(true);
    expect(fladenTegnerDommen(`${flade}\nconst egen = t.navn === a.navn;`)).toBe(false);
    expect(fladenTegnerDommen(flade.replace("foreslaaWebinarKobling(d.ansoegning, d.kandidater, d.optagne)", "d.kandidater.map((tilmelding) => ({ tilmelding }))"))).toBe(false);
    expect(fladenTegnerDommen(flade.replace("foreslaaWebinarKobling(d.ansoegning, d.kandidater, d.optagne)", "foreslaaWebinarKobling(d.ansoegning, d.kandidater)"))).toBe(false);
  });

  it("8. kandidat-opslaget: kun typens kolonner, nyeste først, sideinddelt til loftet", () => {
    const hook = laes("src/hooks/webinarKobling.ts");
    expect(kandidaterneErSmalle(hook)).toBe(true);
    expect(kandidaterneErSmalle(hook.replace('"id, created_at, email, navn,', '"id, created_at, email, navn, by,'))).toBe(false);
    expect(kandidaterneErSmalle(hook.replace('.order("registreret_at", { ascending: false, nullsFirst: false })', ""))).toBe(false);
    expect(kandidaterneErSmalle(hook.replace(".range(start,", ".limit(5000, "))).toBe(false);
  });

  it("9. beviset for udrulningen (koblinger_talt) og PGRST200 fail-soft", () => {
    const svarFil = laes("supabase/functions/_shared/webinarDelingSvar.ts");
    const delt = laes("supabase/functions/webinar-delt/index.ts"), hook = laes("src/hooks/webinarKobling.ts");
    expect(beviset(svarFil, delt, hook)).toBe(true);
    expect(beviset(svarFil.replace(", koblinger_talt: koblingerTalt(ind.ansoegninger)", ""), delt, hook)).toBe(false);
    expect(beviset(svarFil, delt.replace(', "PGRST200"', ""), hook)).toBe(false);
    expect(beviset(svarFil, delt, hook.replace('res.error.code === "PGRST200"', "false"))).toBe(false);
  });
});
