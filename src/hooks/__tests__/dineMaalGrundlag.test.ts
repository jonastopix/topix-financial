import { beforeEach, describe, expect, it, vi } from "vitest";

// Et kædbart Supabase-mock: hvert kald til from() tager næste svar fra køen og
// husker kæden (select-kolonner, insert/update-payload).
type Svar = { data: unknown; error: { code?: string; message: string } | null };
const koe: Svar[] = [];
const kald: { tabel: string; select?: string; insert?: unknown; update?: unknown }[] = [];

function kaede(tabel: string) {
  const svar = koe.shift() ?? { data: [], error: null };
  const post: (typeof kald)[number] = { tabel };
  kald.push(post);
  const k: Record<string, unknown> = {};
  const self = () => k;
  k.select = (c: string) => {
    if (post.select === undefined) post.select = c;
    return k;
  };
  k.insert = (p: unknown) => ((post.insert = p), k);
  k.update = (p: unknown) => ((post.update = p), k);
  for (const f of ["eq", "not", "order", "limit"]) k[f] = self;
  k.maybeSingle = () => Promise.resolve(svar);
  k.then = (res: (v: Svar) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(svar).then(res, rej);
  return k;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => kaede(t) } }));

import {
  AFVENTER_MIGRATION_TEKST,
  byggDineMaal,
  goerMaalSkarpt,
  hentMaalMedTal,
  hentSkridtTilMaal,
  MAAL_KOLONNER_GAMLE,
  MAAL_KOLONNER_NYE,
  opretMaalMedTal,
} from "../dineMaalGrundlag";

const NU = new Date("2026-10-01T10:00:00Z");
const raekke = { id: "m1", title: "Mål", status: "active", deadline: "2027-04-01", created_at: "2026-04-01T08:00:00Z", target_value: 10, current_value: null, unit: null };

beforeEach(() => {
  koe.length = 0;
  kald.length = 0;
});

describe("hentMaalMedTal", () => {
  it("læser de nye kolonner", async () => {
    koe.push({ data: [{ ...raekke, art: "tal", maal_noegle: "db_grad", udgangspunkt: 30, udgangspunkt_dato: "2026-04-01" }], error: null });
    const h = await hentMaalMedTal("c1");
    expect(kald[0].select).toBe(MAAL_KOLONNER_NYE);
    expect(h.afventerMigration).toBe(false);
    expect(h.maal[0]).toMatchObject({ art: "tal", maal_noegle: "db_grad", udgangspunkt: 30 });
  });

  it("42703 (kolonnen findes ikke) → de gamle kolonner, nye felter null, afventerMigration", async () => {
    koe.push({ data: null, error: { code: "42703", message: "column milestones.art does not exist" } });
    koe.push({ data: [raekke], error: null });
    const h = await hentMaalMedTal("c1");
    expect(kald.map((k) => k.select)).toEqual([MAAL_KOLONNER_NYE, MAAL_KOLONNER_GAMLE]);
    expect(h.afventerMigration).toBe(true);
    expect(h.maal[0]).toMatchObject({ id: "m1", art: null, maal_noegle: null, udgangspunkt: null, udgangspunkt_dato: null });
  });

  it("enhver anden fejl kaster — en fejl er ikke «ingen mål»", async () => {
    koe.push({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(hentMaalMedTal("c1")).rejects.toThrow(/milestones/);
  });

  it("fejl også i tilbagefaldet kaster", async () => {
    koe.push({ data: null, error: { code: "42703", message: "x" } });
    koe.push({ data: null, error: { message: "netværk" } });
    await expect(hentMaalMedTal("c1")).rejects.toThrow(/netværk/);
  });
});

describe("hentSkridtTilMaal", () => {
  it("læser skridtene med created_at og kaster ved fejl", async () => {
    koe.push({ data: [{ id: "s1" }], error: null });
    expect(await hentSkridtTilMaal("c1")).toEqual([{ id: "s1" }]);
    expect(kald[0].select).toContain("created_at");
    koe.push({ data: null, error: { message: "nej" } });
    await expect(hentSkridtTilMaal("c1")).rejects.toThrow(/company_actions/);
  });
});

describe("skrivning", () => {
  const input = { titel: "Første ansatte", art: "begivenhed" as const, frist: "2027-03-01" };

  it("opret: dommen først — en ugyldig input når aldrig databasen", async () => {
    const s = await opretMaalMedTal({ companyId: "c1", userId: "u1", input: { ...input, titel: "" }, nu: NU });
    expect(s).toEqual({ ok: false, grund: "Skriv målet som én sætning", afventerMigration: false });
    expect(kald).toHaveLength(0);
  });

  it("opret: ét insert med de dømte felter + ejerskab, aktiv, kilde manual", async () => {
    koe.push({ data: { id: "ny" }, error: null });
    const s = await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU });
    expect(s).toEqual({ ok: true, id: "ny" });
    expect(kald[0].insert).toMatchObject({ title: "Første ansatte", art: "begivenhed", target_value: 1, udgangspunkt: 0, udgangspunkt_dato: "2026-10-01", deadline: "2027-03-01", company_id: "c1", user_id: "u1", status: "active", source: "manual", progress: 0 });
  });

  it("opret før migrationen (PGRST204) → afventerMigration med husets tekst", async () => {
    koe.push({ data: null, error: { code: "PGRST204", message: "Could not find the 'art' column of 'milestones' in the schema cache" } });
    expect(await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU })).toEqual({ ok: false, grund: AFVENTER_MIGRATION_TEKST, afventerMigration: true });
  });

  it("opret: «højst tre aktive» oversættes af maalFejlTekst", async () => {
    koe.push({ data: null, error: { code: "P0001", message: "milestones: højst 3 aktive mål pr. virksomhed" } });
    const s = await opretMaalMedTal({ companyId: "c1", userId: "u1", input, nu: NU });
    expect(s.ok).toBe(false);
    expect(s.ok === false && s.afventerMigration).toBe(false);
  });

  it("gør skarpt: update uden status/progress; nul rækker er ikke «gemt»", async () => {
    koe.push({ data: [{ id: "m1" }], error: null });
    expect(await goerMaalSkarpt({ maalId: "m1", input, nu: NU })).toEqual({ ok: true, id: "m1" });
    expect(kald[0].update).not.toHaveProperty("status");
    expect(kald[0].update).not.toHaveProperty("progress");
    koe.push({ data: [], error: null });
    const s = await goerMaalSkarpt({ maalId: "m1", input, nu: NU });
    expect(s.ok).toBe(false);
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
        maaneder: [],
        kontraktStart: "2026-05-15",
        afventerMigration: false,
      },
      NU,
    );
    expect(b.kort.map((k) => k.id)).toEqual(["m1"]);
    expect(b.kort[0].goerSkarpt).toBe(true);
    expect(b.tidslinje.start).toBe("2026-05-15");
  });
});
