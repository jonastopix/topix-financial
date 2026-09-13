/**
 * Lækagen (13/9): hardDeleteCompany skal slette virksomhedens filer og
 * melde fejlet kontosletning frem for at sluge den i en console.warn.
 * Prod-målingen 13/9 kl. 16:53 fandt 129 filer i financial-documents uden
 * ejer og fire auth-konti uden profil — begge kom herfra
 * (~/Downloads/recon-efterladenskaberne.md 0.3-0.4, 1b, 2b, 2c).
 *
 * Adfærd låses med en mock-klient (filen har ingen Deno-imports og kan
 * importeres af vitest, som sletningParitet.test.ts gør med sletning.ts).
 * Kilde-værn som sletningRoererIkkeBilag.guard.test.ts låser at
 * kaldestederne bærer svaret og at bucket-valget følger policyerne.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMPANY_BUCKETS, hardDeleteCompany } from "../../../supabase/functions/_shared/companyHardDelete.ts";

const CID = "11111111-1111-1111-1111-111111111111";

type Svar = { data?: unknown; error?: { message: string } | null };

interface MockOpts {
  medlemmer?: string[];
  /** bucket → præfiks → poster (id null = mappe). */
  lister?: Record<string, Record<string, { name: string; id: string | null }[]>>;
  listFejl?: Record<string, string>;
  removeFejl?: Record<string, string>;
  deleteUserFejl?: Record<string, string>;
}

function mockKlient(o: MockOpts = {}) {
  const kald: { tabel: string; op: string }[] = [];
  const storageKald: { bucket: string; op: "list" | "remove"; arg: unknown }[] = [];
  const slettedeKonti: string[] = [];

  const from = (tabel: string) => {
    const k: any = {};
    let op = "select";
    for (const m of ["select", "eq", "in", "neq", "is"]) k[m] = () => k;
    k.delete = () => { op = "delete"; return k; };
    k.update = () => { op = "update"; return k; };
    k.then = (res: (v: Svar) => void) => {
      kald.push({ tabel, op });
      const data = tabel === "company_members" && op === "select" ? (o.medlemmer ?? []).map((user_id) => ({ user_id })) : [];
      return Promise.resolve({ data, error: null }).then(res);
    };
    return k;
  };

  const storage = {
    from: (bucket: string) => ({
      list: async (praefiks: string) => {
        storageKald.push({ bucket, op: "list", arg: praefiks });
        if (o.listFejl?.[bucket]) return { data: null, error: { message: o.listFejl[bucket] } };
        return { data: o.lister?.[bucket]?.[praefiks] ?? [], error: null };
      },
      remove: async (stier: string[]) => {
        storageKald.push({ bucket, op: "remove", arg: stier });
        if (o.removeFejl?.[bucket]) return { data: null, error: { message: o.removeFejl[bucket] } };
        return { data: stier.map((name) => ({ name })), error: null };
      },
    }),
  };

  const auth = {
    admin: {
      deleteUser: async (id: string) => {
        const f = o.deleteUserFejl?.[id];
        if (f) return { data: { user: null }, error: { message: f } };
        slettedeKonti.push(id);
        return { data: { user: { id } }, error: null };
      },
    },
  };

  return { klient: { from, storage, auth }, kald, storageKald, slettedeKonti };
}

describe("hardDeleteCompany — storage: mappen <company_id>/ tømmes i de company-nøglede buckets", () => {
  it("financial-documents listes rekursivt (to niveauer), company-logos ét niveau, og begge fjernes", async () => {
    const m = mockKlient({
      lister: {
        "financial-documents": {
          [CID]: [{ name: "rep-1", id: null }, { name: "annual", id: null }],
          [`${CID}/rep-1`]: [{ name: "regnskab.pdf", id: "f1" }],
          [`${CID}/annual`]: [{ name: "2025_1_aarsrapport.pdf", id: "f2" }, { name: "2024_1_aarsrapport.pdf", id: "f3" }],
        },
        "company-logos": { [CID]: [{ name: "logo", id: "l1" }] },
      },
    });
    const r = await hardDeleteCompany(m.klient, CID);

    const removes = m.storageKald.filter((k) => k.op === "remove");
    expect(removes).toEqual([
      { bucket: "financial-documents", op: "remove", arg: [`${CID}/rep-1/regnskab.pdf`, `${CID}/annual/2025_1_aarsrapport.pdf`, `${CID}/annual/2024_1_aarsrapport.pdf`] },
      { bucket: "company-logos", op: "remove", arg: [`${CID}/logo`] },
    ]);
    expect(r.storage).toEqual({ "financial-documents": 3, "company-logos": 1 });
    expect(r.ok).toBe(true);
    expect(r.fejl).toEqual([]);
  });

  it("kun de to company-nøglede buckets røres — aldrig bruger-buckets", async () => {
    const m = mockKlient();
    await hardDeleteCompany(m.klient, CID);
    const buckets = new Set(m.storageKald.map((k) => k.bucket));
    expect([...buckets].sort()).toEqual([...COMPANY_BUCKETS].sort());
    expect(COMPANY_BUCKETS).toEqual(["financial-documents", "company-logos"]);
    // Første sti-led der listes er virksomhedens id, i hver bucket.
    for (const b of COMPANY_BUCKETS) {
      expect(m.storageKald.find((k) => k.bucket === b && k.op === "list")?.arg).toBe(CID);
    }
  });

  it("tom mappe → ingen remove-kald (cronens fjernFiler-regel)", async () => {
    const m = mockKlient();
    const r = await hardDeleteCompany(m.klient, CID);
    expect(m.storageKald.filter((k) => k.op === "remove")).toEqual([]);
    expect(r.storage).toEqual({ "financial-documents": 0, "company-logos": 0 });
  });

  it("storage-fejl afbryder IKKE resten — men samles i fejl[], og ok bliver false", async () => {
    const m = mockKlient({
      lister: { "company-logos": { [CID]: [{ name: "logo", id: "l1" }] } },
      listFejl: { "financial-documents": "bucket utilgængelig" },
      removeFejl: { "company-logos": "remove afvist" },
    });
    const r = await hardDeleteCompany(m.klient, CID);
    expect(r.ok).toBe(false);
    expect(r.fejl).toEqual([
      `storage/financial-documents: list ${CID} fejlede: bucket utilgængelig`,
      "storage/company-logos: remove fejlede: remove afvist",
    ]);
    // Rækkerne blev slettet alligevel — helt til companies.
    expect(m.kald.some((k) => k.tabel === "financial_reports" && k.op === "delete")).toBe(true);
    expect(m.kald.at(-1)).toEqual({ tabel: "companies", op: "delete" });
  });
});

describe("hardDeleteCompany — en fejlet kontosletning ender i svaret, ikke kun i loggen", () => {
  it("fejler deleteUser for én af to brugere: den står i brugereIkkeSlettet, ok er false, og løkken fortsætter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = mockKlient({
      medlemmer: ["u-1", "u-2", "u-3"],
      deleteUserFejl: { "u-2": "Database error deleting user" },
    });
    const r = await hardDeleteCompany(m.klient, CID, { deleteUsers: true });

    expect(r.brugereIkkeSlettet).toEqual([{ user_id: "u-2", fejl: "Database error deleting user" }]);
    expect(r.ok).toBe(false);
    expect(r.userIds).toEqual(["u-1", "u-2", "u-3"]);
    // De to andre blev slettet — løkken stoppede ikke ved u-2.
    expect(m.slettedeKonti).toEqual(["u-1", "u-3"]);
    // Virksomheden ER væk (svaret bærer efterladenskaben, kalderen må ikke melde succes).
    expect(m.kald.at(-1)).toEqual({ tabel: "companies", op: "delete" });
    // Ingen tavs console.warn — svaret er kanalen.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("kontoen slettes FØR profil og loginlog — fejler kontoen, røres de ikke (hel konto, ikke halv)", async () => {
    const m = mockKlient({ medlemmer: ["u-ok", "u-fejl"], deleteUserFejl: { "u-fejl": "FK blokerer" } });
    await hardDeleteCompany(m.klient, CID, { deleteUsers: true });
    const profilSletninger = m.kald.filter((k) => k.tabel === "profiles" && k.op === "delete").length;
    const loginlogSletninger = m.kald.filter((k) => k.tabel === "user_login_log" && k.op === "delete").length;
    // Én bruger lykkedes → én profil- og én loginlog-sletning; den fejlede fik ingen.
    expect(profilSletninger).toBe(1);
    expect(loginlogSletninger).toBe(1);
  });

  it("«not found» tolereres som allerede slettet (idempotent, som cronen)", async () => {
    const m = mockKlient({ medlemmer: ["u-vaek"], deleteUserFejl: { "u-vaek": "User not found" } });
    const r = await hardDeleteCompany(m.klient, CID, { deleteUsers: true });
    expect(r.brugereIkkeSlettet).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("uden deleteUsers røres ingen konto, og brugereIkkeSlettet er tom", async () => {
    const m = mockKlient({ medlemmer: ["u-1"], deleteUserFejl: { "u-1": "skulle aldrig kaldes" } });
    const r = await hardDeleteCompany(m.klient, CID);
    expect(m.slettedeKonti).toEqual([]);
    expect(r.brugereIkkeSlettet).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

/* KILDEVÆRN — kaldestederne skal bære svaret, og bucket-valget følger policyerne. */
describe("kildeværn: svaret bæres af kaldestederne, og bucket-valget er policyernes", () => {
  const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
  const uKommentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("companyHardDelete.ts rører storage og har ingen console.warn tilbage", () => {
    const k = uKommentar(laes("supabase/functions/_shared/companyHardDelete.ts"));
    expect(k).toMatch(/\.storage\.from\(/);
    expect(k).toMatch(/\.remove\(/);
    expect(k).not.toMatch(/console\.warn/);
    expect(k).toMatch(/brugereIkkeSlettet/);
  });

  it("manage-advisor: success er kun true når intet mislykkedes — i cleanup-shells OG bulk-remove-members", () => {
    const k = uKommentar(laes("supabase/functions/manage-advisor/index.ts"));
    expect(k).not.toMatch(/success:\s*true\s*,\s*accepted/);
    expect(k).not.toMatch(/success:\s*true\s*,\s*deleted/);
    expect(k).toMatch(/success:\s*authDeleteFailed\.length === 0 && leftovers\.length === 0 && errors\.length === 0/);
    expect(k).toMatch(/success:\s*notDeleted\.length === 0/);
    expect(k).toMatch(/deleted_with_leftovers/);
    expect(k).toMatch(/brugere_ikke_slettet:\s*r\.brugereIkkeSlettet/);
    // deleteUser kaster ikke — returværdien SKAL læses, alle tre steder.
    const raa = k.match(/await adminSupabase\.auth\.admin\.deleteUser\(/g) ?? [];
    const laest = k.match(/const \{ error(?::\s*\w+)? \} = await adminSupabase\.auth\.admin\.deleteUser\(/g) ?? [];
    expect(raa.length).toBeGreaterThan(0);
    expect(laest.length).toBe(raa.length);
  });

  it("admin-cleanup-test-data: ok er resultatets eget, og efterladenskaberne logges", () => {
    const k = uKommentar(laes("supabase/functions/admin-cleanup-test-data/index.ts"));
    expect(k).not.toMatch(/JSON\.stringify\(\{\s*ok:\s*true,\s*deleted:\s*company/);
    expect(k).toMatch(/ok:\s*result\.ok/);
    expect(k).toMatch(/result\.brugereIkkeSlettet/);
    expect(k).toMatch(/result\.fejl/);
  });

  it("de to buckets er dem hvis policy nøgler mappen på user_company_id; feedback-screenshots nøgler på auth.uid() og er med vilje ikke med", () => {
    const fin = laes("supabase/migrations/20260226070216_24e57cce-34f6-4a49-be51-e6ff1670cb6c.sql");
    const logo = laes("supabase/migrations/20260225124103_a2411df7-e772-410c-846b-810c80bf53d1.sql");
    const fb = laes("supabase/migrations/20260911030000_feedback_bucket_mappetjek.sql");
    expect(fin).toMatch(/bucket_id = 'financial-documents' AND\s*\(storage\.foldername\(name\)\)\[1\] = public\.user_company_id\(auth\.uid\(\)\)::text/);
    expect(logo).toMatch(/bucket_id = 'company-logos'\s*AND \(storage\.foldername\(name\)\)\[1\] = \(public\.user_company_id\(auth\.uid\(\)\)\)::text/);
    expect(fb).toMatch(/bucket_id = 'feedback-screenshots'\s*AND \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
    expect(COMPANY_BUCKETS).not.toContain("feedback-screenshots");
  });
});
