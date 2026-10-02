import { beforeEach, describe, expect, it, vi } from "vitest";

// Et kædbart Supabase-mock: hvert kald til from() tager næste svar fra køen og
// husker kæden (select-kolonner, insert/update-payload).
type Svar = { data: unknown; error: { code?: string; message: string } | null };
const koe: Svar[] = [];
const kald: { tabel: string; select?: string; insert?: unknown; update?: unknown; filtre: string[] }[] = [];

function kaede(tabel: string) {
  const svar = koe.shift() ?? { data: [], error: null };
  const post: (typeof kald)[number] = { tabel, filtre: [] };
  kald.push(post);
  const k: Record<string, unknown> = {};
  const self = () => k;
  k.select = (c: string) => {
    if (post.select === undefined) post.select = c;
    return k;
  };
  k.insert = (p: unknown) => ((post.insert = p), k);
  k.update = (p: unknown) => ((post.update = p), k);
  for (const f of ["eq", "not", "order", "limit", "in", "is"]) k[f] = (...a: unknown[]) => (post.filtre.push(`${f}:${JSON.stringify(a)}`), self());
  k.maybeSingle = () => Promise.resolve(svar);
  k.then = (res: (v: Svar) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(svar).then(res, rej);
  return k;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => kaede(t) } }));

import {
  AFVENTER_MIGRATION_TEKST,
  ALLEREDE_SKARPT_TEKST,
  byggDineMaal,
  dineMaalRetningKey,
  gemRetning,
  goerMaalSkarpt,
  hentMaalMedTal,
  hentRetning,
  hentSkridtTilMaal,
  iBidder,
  IKKE_AKTIVT_TEKST,
  invaliderEfterMaalSkrivning,
  MAAL_FINDES_IKKE_TEKST,
  MAAL_KOLONNER_GAMLE,
  MAAL_KOLONNER_NYE,
  MAAL_KOLONNER_SKIVE3,
  bekraeftMaal,
  BEKRAEFT_NUL_RAEKKER_TEKST,
  hentKvartalstjek,
  registrerKvartalstjek,
  KVARTALSTJEK_IKKE_GEMT_TEKST,
  slipMaal,
  maalSkrivningNoegler,
  opretMaalMedTal,
  alleRetningssvarTomme,
  RETNING_IKKE_GEMT_TEKST,
  RETNING_KOLONNER,
  RETNING_TOM_OVER_SVAR_TEKST,
  samlGrundlag,
  SKARPT_NUL_RAEKKER_TEKST,
  skarpPayload,
} from "../dineMaalGrundlag";
import { MAAL_ORD } from "@/lib/hjemmebane/maalTal";
import { KVARTALSTJEK_GRUND } from "@/lib/hjemmebane/maalBekraeft";
import type { ScoreMaaned } from "@/lib/boardroomScore";

const NU = new Date("2026-10-01T10:00:00Z");
const raekke = { id: "m1", title: "Mål", status: "active", deadline: "2027-04-01", created_at: "2026-04-01T08:00:00Z", target_value: 10, current_value: null, unit: null };

beforeEach(() => {
  koe.length = 0;
  kald.length = 0;
});

describe("hentMaalMedTal", () => {
  it("læser skive 3-kolonnerne (bekraeftet_at, source) — bekraeftet_at null er UBEKRÆFTET, ikke undefined", async () => {
    koe.push({ data: [{ ...raekke, art: "tal", maal_noegle: "db_grad", udgangspunkt: 30, udgangspunkt_dato: "2026-04-01", bekraeftet_at: null, bekraeftet_af: null, source: "advisor" }], error: null });
    const h = await hentMaalMedTal("c1");
    expect(kald[0].select).toBe(MAAL_KOLONNER_SKIVE3);
    expect(h.afventerMigration).toBe(false);
    expect(h.bekraeftelseAfventer).toBe(false);
    expect(h.maal[0]).toMatchObject({ art: "tal", maal_noegle: "db_grad", udgangspunkt: 30, source: "advisor" });
    expect("bekraeftet_at" in h.maal[0]).toBe(true);
    expect(h.maal[0].bekraeftet_at).toBeNull();
  });

  it("42703 på skive 3 → skive 2-kolonnerne; bekraeftet_at er UNDEFINED (modellen slået fra), bekraeftelseAfventer", async () => {
    koe.push({ data: null, error: { code: "42703", message: "column milestones.bekraeftet_at does not exist" } });
    koe.push({ data: [{ ...raekke, art: "tal", maal_noegle: "db_grad", udgangspunkt: 30, udgangspunkt_dato: "2026-04-01" }], error: null });
    const h = await hentMaalMedTal("c1");
    expect(kald.map((k) => k.select)).toEqual([MAAL_KOLONNER_SKIVE3, MAAL_KOLONNER_NYE]);
    expect(h.afventerMigration).toBe(false);
    expect(h.bekraeftelseAfventer).toBe(true);
    expect("bekraeftet_at" in h.maal[0]).toBe(false);
    expect(h.maal[0]).toMatchObject({ art: "tal", maal_noegle: "db_grad", udgangspunkt: 30 });
  });

  it("42703 på begge (kolonnen findes ikke) → de gamle kolonner, nye felter null, afventerMigration", async () => {
    koe.push({ data: null, error: { code: "42703", message: "column milestones.bekraeftet_at does not exist" } });
    koe.push({ data: null, error: { code: "42703", message: "column milestones.art does not exist" } });
    koe.push({ data: [raekke], error: null });
    const h = await hentMaalMedTal("c1");
    expect(kald.map((k) => k.select)).toEqual([MAAL_KOLONNER_SKIVE3, MAAL_KOLONNER_NYE, MAAL_KOLONNER_GAMLE]);
    expect(h.afventerMigration).toBe(true);
    expect(h.bekraeftelseAfventer).toBe(true);
    expect(h.maal[0]).toMatchObject({ id: "m1", art: null, maal_noegle: null, udgangspunkt: null, udgangspunkt_dato: null });
  });

  it("enhver anden fejl kaster — en fejl er ikke «ingen mål»", async () => {
    koe.push({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(hentMaalMedTal("c1")).rejects.toThrow(/milestones/);
  });

  it("fejl også i tilbagefaldet kaster", async () => {
    koe.push({ data: null, error: { code: "42703", message: "x" } });
    koe.push({ data: null, error: { code: "42703", message: "x" } });
    koe.push({ data: null, error: { message: "netværk" } });
    await expect(hentMaalMedTal("c1")).rejects.toThrow(/netværk/);
  });
});

describe("hentKvartalstjek (skive 3)", () => {
  it("læser rækkerne; tabellen mangler (PGRST205) → tom; anden fejl kaster", async () => {
    koe.push({ data: [{ milestone_id: "m1", kvartal: 1, valg: "behold", valgt_at: "2026-09-01T00:00:00Z" }], error: null });
    expect(await hentKvartalstjek("c1")).toEqual([{ milestone_id: "m1", kvartal: 1, valg: "behold", valgt_at: "2026-09-01T00:00:00Z" }]);
    expect(kald[0].tabel).toBe("maal_kvartalstjek");
    koe.push({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    expect(await hentKvartalstjek("c1")).toEqual([]);
    koe.push({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(hentKvartalstjek("c1")).rejects.toThrow(/maal_kvartalstjek/);
  });
});

describe("hentSkridtTilMaal (fund 12)", () => {
  it("læser skridtene under de givne mål med created_at og expires_at, og kaster ved fejl", async () => {
    koe.push({ data: [{ id: "s1" }], error: null });
    expect(await hentSkridtTilMaal("c1", ["m1", "m2"])).toEqual([{ id: "s1" }]);
    expect(kald[0].select).toContain("created_at");
    expect(kald[0].select).toContain("expires_at");
    expect(kald[0].filtre).toContain('in:["maal_id",["m1","m2"]]');
    expect(kald[0].filtre.some((f) => f.startsWith("limit"))).toBe(false);
    koe.push({ data: null, error: { message: "nej" } });
    await expect(hentSkridtTilMaal("c1", ["m1"])).rejects.toThrow(/company_actions/);
  });

  it("ingen mål → intet kald", async () => {
    expect(await hentSkridtTilMaal("c1", [])).toEqual([]);
    expect(kald).toHaveLength(0);
  });

  it("i bidder á 200: 401 mål → 3 kald (200 + 200 + 1); svarene samles ældste først; dubletter én gang", async () => {
    const ider = Array.from({ length: 401 }, (_, i) => `m${i}`);
    koe.push({ data: [{ id: "b", created_at: "2026-09-02" }], error: null });
    koe.push({ data: [{ id: "a", created_at: "2026-09-01" }], error: null });
    koe.push({ data: [], error: null });
    const r = await hentSkridtTilMaal("c1", [...ider, "m0"]);
    expect(kald).toHaveLength(3);
    expect(iBidder(ider).map((b) => b.length)).toEqual([200, 200, 1]);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("en fejl i én bid kaster", async () => {
    const ider = Array.from({ length: 201 }, (_, i) => `m${i}`);
    koe.push({ data: [], error: null });
    koe.push({ data: null, error: { message: "bid 2" } });
    await expect(hentSkridtTilMaal("c1", ider)).rejects.toThrow(/bid 2/);
  });
});

describe("samlGrundlag (fund 7)", () => {
  const maalH = { maal: [], afventerMigration: false, bekraeftelseAfventer: false };
  it("Score fejlede → grundlaget står, månederne er null (tallene «kan ikke læses endnu»)", () => {
    const g = samlGrundlag(maalH, [], { data: undefined, isError: true });
    expect(g).toEqual({ maal: [], skridt: [], kvartalstjek: [], maaneder: null, kontraktStart: null, afventerMigration: false, bekraeftelseAfventer: false });
  });
  it("skive 3: kvartalstjekkene venter, mens de henter; en fejlet hentning giver en tom liste", () => {
    expect(samlGrundlag(maalH, [], { data: undefined, isError: true }, { data: undefined, isError: false })).toBeUndefined();
    expect(samlGrundlag(maalH, [], { data: undefined, isError: true }, { data: undefined, isError: true })?.kvartalstjek).toEqual([]);
  });
  it("Score henter endnu → intet grundlag; mål eller skridt mangler → intet grundlag", () => {
    expect(samlGrundlag(maalH, [], { data: undefined, isError: false })).toBeUndefined();
    expect(samlGrundlag(undefined, [], { data: { tilstand: "afventer_migration" }, isError: false })).toBeUndefined();
    expect(samlGrundlag(maalH, undefined, { data: { tilstand: "afventer_migration" }, isError: false })).toBeUndefined();
  });
  it("et tal-mål med Score-fejl siger «Tallet kan ikke læses endnu» — siden vælter ikke", () => {
    const tm = { ...raekke, art: "tal", maal_noegle: "omsaetning_aarstakt", udgangspunkt: 1, udgangspunkt_dato: "2026-04-01" };
    const g = samlGrundlag({ maal: [tm], afventerMigration: false, bekraeftelseAfventer: false }, [], { data: undefined, isError: true })!;
    const b = byggDineMaal(g, NU);
    expect(b.kort[0].tal).toEqual({ status: "mangler", grund: MAAL_ORD.grund.intet_tal });
  });
});

describe("skrivning", () => {
  const input = { titel: "Første ansatte", art: "begivenhed" as const, frist: "2027-03-01" };
  const mdr: ScoreMaaned[] = [
    { key: "2026-07", basis: "measured", foersteGodkendtAt: null, metrics: { revenue: 100_000 } },
    { key: "2026-08", basis: "measured", foersteGodkendtAt: null, metrics: { revenue: 120_000 } },
    { key: "2026-09", basis: "measured", foersteGodkendtAt: null, metrics: { revenue: 140_000 } },
  ];
  const talInput = { titel: "Omsætning 2 mio.", art: "tal" as const, noegle: "omsaetning_aarstakt" as const, maaltal: 2_000_000, frist: "2027-03-01" };

  it("opret: dommen først — en ugyldig input når aldrig databasen", async () => {
    const s = await opretMaalMedTal({ companyId: "c1", userId: "u1", input: { ...input, titel: "" }, nu: NU, maaneder: null });
    expect(s).toEqual({ ok: false, grund: "Skriv målet som én sætning", afventerMigration: false });
    expect(kald).toHaveLength(0);
  });

  it("opret: ét insert med de dømte felter + ejerskab, aktiv, kilde manual — og (skive 3) bekræftet fra fødslen", async () => {
    koe.push({ data: { id: "ny" }, error: null });
    const s = await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU, maaneder: null });
    expect(s).toEqual({ ok: true, id: "ny" });
    expect(kald[0].insert).toMatchObject({ title: "Første ansatte", art: "begivenhed", target_value: 1, udgangspunkt: 0, udgangspunkt_dato: "2026-10-01", deadline: "2027-03-01", company_id: "c1", user_id: "u1", status: "active", source: "manual", progress: 0, bekraeftet_at: NU.toISOString(), bekraeftet_af: "u1" });
  });

  it("opret før skive 3-migrationen (PGRST204 på bekraeftet_at) → insert igen UDEN bekræftelsen — som i dag", async () => {
    koe.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'bekraeftet_at' column of 'milestones' in the schema cache" } });
    koe.push({ data: { id: "ny" }, error: null });
    expect(await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU, maaneder: null })).toEqual({ ok: true, id: "ny" });
    expect(kald).toHaveLength(2);
    expect(kald[0].insert).toHaveProperty("bekraeftet_at");
    expect(kald[1].insert).not.toHaveProperty("bekraeftet_at");
  });

  it("opret før skive 2-migrationen (PGRST204 to gange) → afventerMigration med husets tekst", async () => {
    koe.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'bekraeftet_at' column of 'milestones' in the schema cache" } });
    koe.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'art' column of 'milestones' in the schema cache" } });
    expect(await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU, maaneder: null })).toEqual({ ok: false, grund: AFVENTER_MIGRATION_TEKST, afventerMigration: true });
  });

  it("bekraeft (skive 3): UPDATE guardet på bekraeftet_at null + status active; nul rækker er en fejl", async () => {
    koe.push({ data: [{ id: "m1" }], error: null });
    expect(await bekraeftMaal({ maalId: "m1", userId: "u1", nu: NU })).toEqual({ ok: true, id: "m1" });
    expect(kald[0].update).toEqual({ bekraeftet_at: NU.toISOString(), bekraeftet_af: "u1" });
    expect(kald[0].filtre).toEqual(['eq:["id","m1"]', 'is:["bekraeftet_at",null]', 'eq:["status","active"]']);
    koe.push({ data: [], error: null });
    expect(await bekraeftMaal({ maalId: "m1", userId: "u1", nu: NU })).toEqual({ ok: false, grund: BEKRAEFT_NUL_RAEKKER_TEKST, afventerMigration: false });
    koe.push({ data: null, error: { code: "PGRST204", message: "bekraeftet_at" } });
    expect(await bekraeftMaal({ maalId: "m1", userId: "u1", nu: NU })).toMatchObject({ ok: false, afventerMigration: true });
  });

  it("slip (skive 3): status parked, guardet på active — aldrig delete", async () => {
    koe.push({ data: [{ id: "m1" }], error: null });
    expect(await slipMaal({ maalId: "m1" })).toEqual({ ok: true, id: "m1" });
    expect(kald[0].update).toEqual({ status: "parked" });
    expect(kald[0].filtre).toContain('eq:["status","active"]');
  });

  it("registrerKvartalstjek: én række med valgt_af; en fejl er «ikke gemt» (kortet står igen); ugyldigt valg når aldrig databasen", async () => {
    // Målet bekræftet 15/10-2026, i dag 20/4-2027 → kvartal 2 er forfaldent (anker 2026-10-15 + 6 mdr. = 2027-04-15 ≤ i dag).
    const maal = { id: "m1", status: "active", bekraeftet_at: "2026-10-15T12:00:00Z" };
    const nu = new Date("2027-04-20T10:00:00Z");
    const args = { maalId: "m1", companyId: "c1", userId: "u1", kvartal: 2 as const, valg: "behold" as const, maal, tjek: [], nu };
    koe.push({ data: { id: "k1" }, error: null });
    expect(await registrerKvartalstjek(args)).toEqual({ ok: true, id: "k1" });
    expect(kald[0]).toMatchObject({ tabel: "maal_kvartalstjek", insert: { milestone_id: "m1", company_id: "c1", kvartal: 2, valg: "behold", valgt_af: "u1" } });
    koe.push({ data: null, error: { code: "23505", message: "dublet" } });
    expect(await registrerKvartalstjek(args)).toEqual({ ok: false, grund: KVARTALSTJEK_IKKE_GEMT_TEKST, afventerMigration: false });
    expect(await registrerKvartalstjek({ ...args, valg: "slettet" as never })).toMatchObject({ ok: false });
    expect(kald).toHaveLength(2);
  });

  it("registrerKvartalstjek (runde 2, fund 9): klientens dom FØR INSERT'en — grunden vises, databasen kaldes ikke; målet ukendt (null) → ingen fordom", async () => {
    const maal = { id: "m1", status: "active", bekraeftet_at: "2026-10-15T12:00:00Z" };
    const basis = { maalId: "m1", companyId: "c1", userId: "u1", kvartal: 2 as const, valg: "behold" as const, maal, tjek: [] as const, nu: new Date("2027-04-20T10:00:00Z") };
    // Ikke forfaldent: i dag 1/2-2027 < 15/4-2027.
    expect(await registrerKvartalstjek({ ...basis, nu: new Date("2027-02-01T10:00:00Z") })).toEqual({ ok: false, grund: KVARTALSTJEK_GRUND.ikkeForfaldent, afventerMigration: false });
    // Allerede svaret: en række med kvartal ≥ 2.
    expect(await registrerKvartalstjek({ ...basis, tjek: [{ milestone_id: "m1", kvartal: 2 }] })).toEqual({ ok: false, grund: KVARTALSTJEK_GRUND.alleredeSvaret, afventerMigration: false });
    // Ikke bekræftet.
    expect(await registrerKvartalstjek({ ...basis, maal: { ...maal, bekraeftet_at: null } })).toEqual({ ok: false, grund: KVARTALSTJEK_GRUND.ubekraeftet, afventerMigration: false });
    // Status passer ikke til valget: «behold» på et parkeret mål.
    expect(await registrerKvartalstjek({ ...basis, maal: { ...maal, status: "parked" } })).toEqual({ ok: false, grund: KVARTALSTJEK_GRUND.status, afventerMigration: false });
    // Året gået: i dag 20/10-2027 ≥ 15/10-2027.
    expect(await registrerKvartalstjek({ ...basis, nu: new Date("2027-10-20T10:00:00Z") })).toEqual({ ok: false, grund: KVARTALSTJEK_GRUND.aaretGaaet, afventerMigration: false });
    expect(kald).toHaveLength(0);
    // Målet ukendt → databasen dømmer.
    koe.push({ data: { id: "k1" }, error: null });
    expect(await registrerKvartalstjek({ ...basis, maal: null })).toEqual({ ok: true, id: "k1" });
    expect(kald).toHaveLength(1);
  });

  it("opret: «højst tre aktive» oversættes af maalFejlTekst", async () => {
    koe.push({ data: null, error: { code: "P0001", message: "milestones: højst 3 aktive mål pr. virksomhed" } });
    const s = await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU, maaneder: null });
    expect(s.ok).toBe(false);
    expect(s.ok === false && s.afventerMigration).toBe(false);
  });

  it("opret husnøgle: udgangspunktet regnes af de SAMME måneder; uden måneder afvises målet uden databasekald", async () => {
    koe.push({ data: { id: "ny" }, error: null });
    expect(await opretMaalMedTal({ companyId: "c1", userId: "u1", input: talInput, nu: NU, maaneder: mdr })).toEqual({ ok: true, id: "ny" });
    expect(kald[0].insert).toMatchObject({ art: "tal", maal_noegle: "omsaetning_aarstakt", udgangspunkt: 1_440_000, target_value: 2_000_000 });
    expect(kald[0].insert).not.toHaveProperty("unit");
    expect(kald[0].insert).not.toHaveProperty("current_value");
    kald.length = 0;
    expect(await opretMaalMedTal({ companyId: "c1", userId: "u1", input: talInput, nu: NU, maaneder: null })).toEqual({ ok: false, grund: MAAL_ORD.grund.intet_tal, afventerMigration: false });
    expect(await opretMaalMedTal({ companyId: "c1", userId: "u1", input: { ...talInput, udgangspunkt: 999 }, nu: NU, maaneder: mdr })).toMatchObject({ ok: false });
    expect(kald).toHaveLength(0);
  });

  const aktivtGammelt = { data: { id: "m1", status: "active", art: null }, error: null };

  it("gør skarpt: slår målet op, dømmer fristen mod de åbne skridt, og UPDATE er guardet på art IS NULL og aktiv (fund 3, 4)", async () => {
    koe.push(aktivtGammelt);
    koe.push({ data: [{ id: "s1", title: "Ring", status: "active", due_date: "2027-02-01" }], error: null });
    koe.push({ data: [{ id: "m1" }], error: null });
    expect(await goerMaalSkarpt({ maalId: "m1", input: talInput, nu: NU, maaneder: mdr })).toEqual({ ok: true, id: "m1" });
    expect(kald.map((k) => k.tabel)).toEqual(["milestones", "company_actions", "milestones"]);
    expect(kald[1].filtre).toContain('in:["status",["active","proposed"]]');
    const upd = kald[2];
    expect(upd.filtre).toEqual(['eq:["id","m1"]', 'is:["art",null]', 'eq:["status","active"]']);
    expect(upd.update).toEqual({ title: "Omsætning 2 mio.", art: "tal", maal_noegle: "omsaetning_aarstakt", udgangspunkt: 1_440_000, udgangspunkt_dato: "2026-10-01", deadline: "2027-03-01", target_value: 2_000_000 });
    // de gamle tal nulstilles ikke: hverken current_value eller unit skrives
    expect(upd.update).not.toHaveProperty("current_value");
    expect(upd.update).not.toHaveProperty("unit");
    expect(upd.update).not.toHaveProperty("status");
    expect(upd.update).not.toHaveProperty("progress");
  });

  it("gør skarpt: en frist FØR et åbent skridts frist afvises før UPDATE (doemMaalFristModSkridt)", async () => {
    koe.push(aktivtGammelt);
    koe.push({ data: [{ id: "s1", title: "Ring til revisor", status: "proposed", due_date: "2027-04-01" }], error: null });
    const s = await goerMaalSkarpt({ maalId: "m1", input, nu: NU, maaneder: null });
    expect(s.ok).toBe(false);
    expect(s.ok === false && s.grund).toContain("Målets frist kan ikke ligge før skridtenes");
    expect(kald.some((k) => k.update !== undefined)).toBe(false);
  });

  it.each([
    ["parkeret", { data: { id: "m1", status: "parked", art: null }, error: null }, IKKE_AKTIVT_TEKST],
    ["nået", { data: { id: "m1", status: "completed", art: null }, error: null }, IKKE_AKTIVT_TEKST],
    ["allerede skarpt", { data: { id: "m1", status: "active", art: "tal" }, error: null }, ALLEREDE_SKARPT_TEKST],
    ["findes ikke", { data: null, error: null }, MAAL_FINDES_IKKE_TEKST],
  ] as const)("gør skarpt: %s → nej, ingen UPDATE", async (_n, svar, grund) => {
    koe.push(svar as Svar);
    expect(await goerMaalSkarpt({ maalId: "m1", input, nu: NU, maaneder: null })).toEqual({ ok: false, grund, afventerMigration: false });
    expect(kald.some((k) => k.update !== undefined)).toBe(false);
  });

  it("gør skarpt: nul rækker (guarden ramte et mål, der imens blev skarpt) er en tydelig fejl", async () => {
    koe.push(aktivtGammelt);
    koe.push({ data: [], error: null });
    koe.push({ data: [], error: null });
    expect(await goerMaalSkarpt({ maalId: "m1", input, nu: NU, maaneder: null })).toEqual({ ok: false, grund: SKARPT_NUL_RAEKKER_TEKST, afventerMigration: false });
  });

  it("gør skarpt: ugyldig input når aldrig databasen", async () => {
    expect((await goerMaalSkarpt({ maalId: "m1", input: { ...input, titel: "" }, nu: NU, maaneder: null })).ok).toBe(false);
    expect(kald).toHaveLength(0);
  });

  it("skarpPayload: begivenhed skriver hverken target_value eller current_value; andet_tal skriver unit", () => {
    expect(skarpPayload({ title: "x", art: "begivenhed", maal_noegle: null, target_value: 1, udgangspunkt: 0, udgangspunkt_dato: "2026-10-01", current_value: 0, deadline: "2027-01-01" })).toEqual({
      title: "x", art: "begivenhed", maal_noegle: null, udgangspunkt: 0, udgangspunkt_dato: "2026-10-01", deadline: "2027-01-01",
    });
    expect(skarpPayload({ title: "x", art: "tal", maal_noegle: "andet_tal", target_value: 30, udgangspunkt: 12, udgangspunkt_dato: "2026-10-01", current_value: 12, unit: "kunder", deadline: "2027-01-01" })).toEqual({
      title: "x", art: "tal", maal_noegle: "andet_tal", target_value: 30, udgangspunkt: 12, udgangspunkt_dato: "2026-10-01", deadline: "2027-01-01", unit: "kunder",
    });
  });
});

describe("invalidering (fund 17)", () => {
  it("dine-maal, virksomhedssiden og pulsens mål", async () => {
    const noegler: unknown[] = [];
    await invaliderEfterMaalSkrivning({ invalidateQueries: (f: { queryKey: unknown }) => (noegler.push(f.queryKey), Promise.resolve()) } as never, "c1");
    expect(noegler).toEqual([["dine-maal"], ["virksomhed", "c1"], ["pulse-milestones", "c1"], ["boardroom"], ["boardroom-score"]]);
    expect(maalSkrivningNoegler("c1")).toHaveLength(5);
  });
});

describe("byggDineMaal", () => {
  it("kort KUN for aktive mål; tidslinjen fra kontraktstarten", () => {
    const b = byggDineMaal(
      {
        maal: [
          { ...raekke, art: null, maal_noegle: null, udgangspunkt: null, udgangspunkt_dato: null },
          { ...raekke, id: "m2", status: "parked", art: null, maal_noegle: null, udgangspunkt: null, udgangspunkt_dato: null },
        ],
        skridt: [],
        kvartalstjek: [],
        maaneder: [],
        kontraktStart: "2026-05-15",
        afventerMigration: false,
        bekraeftelseAfventer: false,
      },
      NU,
    );
    expect(b.kort.map((k) => k.id)).toEqual(["m1"]);
    expect(b.kort[0].goerSkarpt).toBe(true);
    expect(b.tidslinje.start).toBe("2026-05-15");
  });

  it("skive 3: et ubekræftet aktivt mål er et FORSLAG, ikke et kort; et bekræftet får kvartalstjek (ankeret er aldrig før 2/10-2026)", () => {
    const tom = { art: null, maal_noegle: null, udgangspunkt: null, udgangspunkt_dato: null };
    // Bekræftet (backfillet) 15/1-2026 → anker 2/10-2026 → tjek 2/1, 2/4, 2/7-2027; i dag 20/4-2027 → kvartal 2.
    const NU_2027 = new Date("2027-04-20T10:00:00Z");
    const b = byggDineMaal(
      {
        maal: [
          { ...raekke, ...tom, bekraeftet_at: "2026-01-15T12:00:00Z", source: "manual" },
          { ...raekke, ...tom, id: "forslag", created_at: "2026-10-05T00:00:00Z", bekraeftet_at: null, source: "advisor" },
          { ...raekke, ...tom, id: "gammelt", created_at: "2026-06-01T00:00:00Z", bekraeftet_at: null, source: "agent" },
        ],
        skridt: [],
        kvartalstjek: [{ milestone_id: "m1", kvartal: 1 }],
        maaneder: [],
        kontraktStart: null,
        afventerMigration: false,
        bekraeftelseAfventer: false,
      },
      NU_2027,
    );
    expect(b.kort.map((k) => k.id)).toEqual(["m1"]);
    expect(b.bekraeftelser.forslag.map((m) => m.id)).toEqual(["forslag"]);
    expect(b.bekraeftelser.gamle.map((m) => m.id)).toEqual(["gammelt"]);
    expect(b.kvartalstjek).toEqual([{ maalId: "m1", maalTitel: "Mål", companyId: null, kvartal: 2, maaned: 6, dato: "2027-04-02" }]);
  });
});

describe("«Jeres retning» — hentRetning (Jonas 1/10 22:37)", () => {
  it("læser virksomhedens 'overordnet'-rækker og vælger den nyeste", async () => {
    koe.push({
      data: [
        { id: "h-ny", user_id: "u2", module: "overordnet", responses: { lykkedes_12mdr: "ny" }, updated_at: "2026-09-20T00:00:00Z", status: "in_progress" },
        { id: "h-gl", user_id: "u1", module: "overordnet", responses: { lykkedes_12mdr: "gammel" }, updated_at: "2026-09-01T00:00:00Z", status: "completed" },
      ],
      error: null,
    });
    const r = await hentRetning("c1");
    expect(kald[0].tabel).toBe("handouts");
    expect(kald[0].select).toBe(RETNING_KOLONNER);
    expect(kald[0].filtre).toEqual(['eq:["company_id","c1"]', 'eq:["module","overordnet"]', 'order:["updated_at",{"ascending":false}]']);
    expect(r.handoutId).toBe("h-ny");
    expect(r.svar.lykkedes_12mdr).toBe("ny");
  });
  it("ingen række → tomme svar; en fejl kaster (ikke «intet svaret»)", async () => {
    koe.push({ data: [], error: null });
    expect((await hentRetning("c1")).besvaret).toBe(0);
    koe.push({ data: null, error: { message: "nej" } });
    await expect(hentRetning("c1")).rejects.toThrow(/handouts/);
  });
  it("nøglen står under «dine-maal» — samme invalidering som målene", () => {
    expect(dineMaalRetningKey("c1")[0]).toBe("dine-maal");
  });
});

describe("«Jeres retning» — gemRetning", () => {
  it("findes rækken: UPDATE af KUN responses (flettet), guardet på id og user_id; status røres ikke fra 'completed'", async () => {
    koe.push({ data: { id: "h1", user_id: "u1", module: "overordnet", responses: { maal_forretning: "Vokse", lykkedes_12mdr: "x" }, updated_at: null, status: "completed" }, error: null });
    koe.push({ data: [{ id: "h1" }], error: null });
    const svar = await gemRetning({ companyId: "c1", userId: "u1", svar: { anderledes_hverdag: "Fri fredag" } });
    expect(svar).toEqual({ ok: true, id: "h1" });
    expect(kald[0].filtre).toEqual(['eq:["user_id","u1"]', 'eq:["module","overordnet"]']);
    expect(kald[1].update).toEqual({ responses: { maal_forretning: "Vokse", lykkedes_12mdr: "x", anderledes_hverdag: "Fri fredag" } });
    expect(kald[1].filtre).toEqual(['eq:["id","h1"]', 'eq:["user_id","u1"]']);
  });
  it("'not_started' med indhold → status 'in_progress' i samme UPDATE", async () => {
    koe.push({ data: { id: "h1", user_id: "u1", module: "overordnet", responses: {}, updated_at: null, status: "not_started" }, error: null });
    koe.push({ data: [{ id: "h1" }], error: null });
    await gemRetning({ companyId: "c1", userId: "u1", svar: { lykkedes_12mdr: "2 mio." } });
    expect(kald[1].update).toEqual({ responses: { lykkedes_12mdr: "2 mio." }, status: "in_progress" });
  });
  it("nul rækker (RLS afviser stille) er IKKE gemt", async () => {
    koe.push({ data: { id: "h1", user_id: "u1", module: "overordnet", responses: {}, updated_at: null, status: "in_progress" }, error: null });
    koe.push({ data: [], error: null });
    expect(await gemRetning({ companyId: "c1", userId: "u1", svar: { lykkedes_12mdr: "x" } })).toEqual({ ok: false, grund: RETNING_IKKE_GEMT_TEKST, afventerMigration: false });
  });
  it("findes rækken ikke: INSERT med module 'overordnet' i saveHandout's form", async () => {
    koe.push({ data: null, error: null });
    koe.push({ data: { id: "h-ny" }, error: null });
    const svar = await gemRetning({ companyId: "c1", userId: "u1", svar: { konsekvenser_ingen_aendring: "Vi brænder ud" } });
    expect(svar).toEqual({ ok: true, id: "h-ny" });
    expect(kald[1].insert).toEqual({
      user_id: "u1", company_id: "c1", module: "overordnet", responses: { konsekvenser_ingen_aendring: "Vi brænder ud" }, checklist: {}, levers: [], status: "in_progress",
    });
  });
  it("en fremmed nøgle afvises af dommen — ingen skrivning", async () => {
    koe.push({ data: null, error: null });
    const svar = await gemRetning({ companyId: "c1", userId: "u1", svar: { maal_forretning: "x" } as never });
    expect(svar.ok).toBe(false);
    expect(kald).toHaveLength(1);
  });
  it("opslaget fejler → nej uden skrivning", async () => {
    koe.push({ data: null, error: { message: "netværk" } });
    expect((await gemRetning({ companyId: "c1", userId: "u1", svar: { lykkedes_12mdr: "x" } })).ok).toBe(false);
    expect(kald).toHaveLength(1);
  });
  it("fund 6 (fail-closed): tre tomme svar oven på en række MED svar gemmes ikke — ingen skrivning", async () => {
    koe.push({ data: { id: "h1", user_id: "u1", module: "overordnet", responses: { lykkedes_12mdr: "2 mio." }, updated_at: null, status: "in_progress" }, error: null });
    const svar = await gemRetning({ companyId: "c1", userId: "u1", svar: { lykkedes_12mdr: "", anderledes_hverdag: " ", konsekvenser_ingen_aendring: "" } });
    expect(svar).toEqual({ ok: false, grund: RETNING_TOM_OVER_SVAR_TEKST, afventerMigration: false });
    expect(kald).toHaveLength(1);
  });
  it("fund 6: tre tomme svar på en række UDEN svar, eller uden række, må gerne gemmes (intet at slette)", async () => {
    koe.push({ data: { id: "h1", user_id: "u1", module: "overordnet", responses: { maal_forretning: "Vokse" }, updated_at: null, status: "in_progress" }, error: null });
    koe.push({ data: [{ id: "h1" }], error: null });
    expect((await gemRetning({ companyId: "c1", userId: "u1", svar: { lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" } })).ok).toBe(true);
    expect(alleRetningssvarTomme({ lykkedes_12mdr: " " })).toBe(true);
    expect(alleRetningssvarTomme({ lykkedes_12mdr: "x" })).toBe(false);
  });
});
