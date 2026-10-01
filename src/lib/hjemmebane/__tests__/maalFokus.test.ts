import { describe, expect, it } from "vitest";
import {
  dageTilbageTekst, dageTilMaalFrist, foersteSkridtTitel, fristTitel, iFristvinduet, maalFokus, MAAL_FOKUS_STI,
  MAAL_FRIST_DAGE, MAAL_FRIST_EFTER_DAGE, MAAL_FRIST_FREMDRIFT_UNDER,
  type MaalFokusMaal, type MaalFokusSkridt,
} from "../maalFokus";
import { planenDom } from "../planen";

// Fast «nu»: 1/10-2026 kl. 10:00 UTC = 12:00 dansk (sommertid) → dansk dato 2026-10-01.
const NU = new Date("2026-10-01T10:00:00Z");

const maal = (o: Partial<MaalFokusMaal> & { id: string }): MaalFokusMaal => ({
  title: `Mål ${o.id}`, status: "active", progress: 0, deadline: null, created_at: "2026-09-01T00:00:00Z", ...o,
});
const skridt = (o: Partial<MaalFokusSkridt> & { id: string }): MaalFokusSkridt => ({
  title: `Skridt ${o.id}`, status: "active", due_date: "2026-10-15", maal_id: null, ...o,
});

describe("dageTilMaalFrist — dansk kalenderdag", () => {
  it("regner fra den danske dato, ikke UTC-datoen", () => {
    // 1/10 23:30 UTC = 2/10 01:30 dansk → i dag = 2/10; 31/10 = 29 dage.
    expect(dageTilMaalFrist("2026-10-31", new Date("2026-10-01T23:30:00Z"))).toBe(29);
    expect(dageTilMaalFrist("2026-10-31", NU)).toBe(30);
  });
  it("0 i dag, negativ passeret, null uden eller ulæselig frist", () => {
    expect(dageTilMaalFrist("2026-10-01", NU)).toBe(0);
    expect(dageTilMaalFrist("2026-09-30", NU)).toBe(-1);
    expect(dageTilMaalFrist(null, NU)).toBeNull();
    expect(dageTilMaalFrist("snart", NU)).toBeNull();
  });
});

describe("maalFokus — tre kilder, ét punkt", () => {
  it("ingen aktive mål → null (parkerede og nåede tæller ikke)", () => {
    expect(maalFokus([], [], NU)).toBeNull();
    expect(maalFokus([maal({ id: "a", status: "parked" }), maal({ id: "b", status: "completed" })], [], NU)).toBeNull();
  });

  it("(1) nærmeste aktive skridt under et aktivt mål — tidligste frist vinder", () => {
    const m = [maal({ id: "a", title: "Omsætning 10 mio." }), maal({ id: "b", title: "Ny sælger" })];
    const s = [
      skridt({ id: "s1", maal_id: "a", due_date: "2026-10-20" }),
      skridt({ id: "s2", maal_id: "b", due_date: "2026-10-05", title: "Skriv jobopslag" }),
    ];
    expect(maalFokus(m, s, NU)).toEqual({
      art: "skridt", maalId: "b", maalTitel: "Ny sælger", skridtId: "s2", skridtTitel: "Skriv jobopslag", frist: "2026-10-05", maalDageTilbage: null,
    });
  });

  it("(1) springer skridt under parkerede/nåede mål, skridt uden mål og ikke-aktive skridt over", () => {
    const m = [maal({ id: "a", status: "parked" }), maal({ id: "b" })];
    const s = [
      skridt({ id: "s1", maal_id: "a", due_date: "2026-10-02" }),
      skridt({ id: "s2", maal_id: null, due_date: "2026-10-02" }),
      skridt({ id: "s3", maal_id: "b", status: "proposed", due_date: null }),
      skridt({ id: "s4", maal_id: "b", status: "done", due_date: "2026-10-01" }),
      skridt({ id: "s5", maal_id: "b", due_date: "2026-11-01" }),
    ];
    expect(maalFokus(m, s, NU)).toMatchObject({ art: "skridt", skridtId: "s5" });
  });

  it("(1) uafgjort frist → ældste mål, så skridtets id — deterministisk", () => {
    const m = [maal({ id: "a", created_at: "2026-09-10T00:00:00Z" }), maal({ id: "b", created_at: "2026-09-01T00:00:00Z" })];
    const s = [skridt({ id: "s2", maal_id: "a", due_date: "2026-10-10" }), skridt({ id: "s1", maal_id: "b", due_date: "2026-10-10" })];
    expect(maalFokus(m, s, NU)).toMatchObject({ skridtId: "s1", maalId: "b" });
    expect(maalFokus([...m].reverse(), [...s].reverse(), NU)).toMatchObject({ skridtId: "s1", maalId: "b" });
  });

  it("(1) målets frist inden for 30 dage følger med — ellers null", () => {
    const s = [skridt({ id: "s1", maal_id: "a" })];
    expect(maalFokus([maal({ id: "a", deadline: "2026-10-13" })], s, NU)).toMatchObject({ maalDageTilbage: 12 });
    expect(maalFokus([maal({ id: "a", deadline: "2026-10-31" })], s, NU)).toMatchObject({ maalDageTilbage: MAAL_FRIST_DAGE });
    expect(maalFokus([maal({ id: "a", deadline: "2026-11-01" })], s, NU)).toMatchObject({ maalDageTilbage: null });
  });

  it("(2) aktivt mål uden skridt → første skridt; nærmeste målfrist først, uden frist sidst", () => {
    const m = [
      maal({ id: "a", deadline: null, created_at: "2026-01-01T00:00:00Z" }),
      maal({ id: "b", deadline: "2027-03-31" }),
      maal({ id: "c", deadline: "2026-12-31" }),
    ];
    expect(maalFokus(m, [], NU)).toEqual({ art: "foerste_skridt", maalId: "c", maalTitel: "Mål c", foerste: true });
  });

  it("(2) et ventende forslag er «i gang» — et udløbet er ikke", () => {
    const m = [maal({ id: "a", deadline: "2026-10-20" })];
    const venter = skridt({ id: "f", maal_id: "a", status: "proposed", due_date: null, expires_at: "2026-10-05T00:00:00Z" });
    // Forslaget venter → (2) springer målet over → (3) fristen (19 dage).
    expect(maalFokus(m, [venter], NU)).toEqual({ art: "frist", maalId: "a", maalTitel: "Mål a", dageTilbage: 19 });
    const udloebet = { ...venter, expires_at: "2026-09-30T00:00:00Z" };
    expect(maalFokus(m, [udloebet], NU)).toMatchObject({ art: "foerste_skridt", maalId: "a", foerste: true });
  });

  it("(2) mål med viste fremdrift ≥ 100 springes over som «alle gjort» (rådets fund 8)", () => {
    expect(maalFokus([maal({ id: "a", progress: 100 })], [], NU)).toBeNull();
    expect(maalFokus([maal({ id: "a", progress: 99 })], [], NU)).toMatchObject({ art: "foerste_skridt", foerste: true });
    // Det næste mål tager over.
    expect(maalFokus([maal({ id: "a", progress: 100 }), maal({ id: "b" })], [], NU)).toMatchObject({ art: "foerste_skridt", maalId: "b" });
  });

  it("(2) «det næste skridt», når målet har haft skridt; mål med alle skridt gjort springes over", () => {
    const m = [maal({ id: "a" })];
    expect(maalFokus(m, [skridt({ id: "x", maal_id: "a", status: "dropped" })], NU)).toMatchObject({ art: "foerste_skridt", foerste: false });
    expect(maalFokus(m, [skridt({ id: "x", maal_id: "a", status: "done" })], NU)).toBeNull();
    // Dismissed/expired tæller ikke — målet har aldrig haft et skridt.
    expect(maalFokus(m, [skridt({ id: "x", maal_id: "a", status: "dismissed" })], NU)).toMatchObject({ foerste: true });
  });

  // (3) nås kun, når målet har et ventende forslag (så (2) springer det over) og intet aktivt skridt.
  const venter = (id: string) => skridt({ id: `f${id}`, maal_id: id, status: "proposed", due_date: null });

  it("(3) frist: ≤ 30 dage, passeret medregnet; over 30 dage giver intet", () => {
    expect(maalFokus([maal({ id: "a", deadline: "2026-09-20" })], [venter("a")], NU)).toMatchObject({ art: "frist", dageTilbage: -11 });
    expect(maalFokus([maal({ id: "a", deadline: "2026-11-15" })], [venter("a")], NU)).toBeNull();
  });

  it("(3) en passeret frist vises kun i højst 30 dage efter fristen (rådets fund 5)", () => {
    // 1/9 → −30 (sidste dag), 31/8 → −31 (ude).
    expect(maalFokus([maal({ id: "a", deadline: "2026-09-01" })], [venter("a")], NU)).toMatchObject({ art: "frist", dageTilbage: -MAAL_FRIST_EFTER_DAGE });
    expect(maalFokus([maal({ id: "a", deadline: "2026-08-31" })], [venter("a")], NU)).toBeNull();
    expect(iFristvinduet(-30)).toBe(true);
    expect(iFristvinduet(-31)).toBe(false);
    expect(iFristvinduet(30)).toBe(true);
    expect(iFristvinduet(31)).toBe(false);
    expect(iFristvinduet(null)).toBe(false);
  });

  it("(3) kun under halvvejs — fremdriften er den, «Din plan» viser (rådets fund 5)", () => {
    const fremme = maal({ id: "a", deadline: "2026-10-10", progress: 49 });
    expect(maalFokus([fremme], [venter("a")], NU)).toMatchObject({ art: "frist", dageTilbage: 9 });
    expect(maalFokus([{ ...fremme, progress: MAAL_FRIST_FREMDRIFT_UNDER }], [venter("a")], NU)).toBeNull();
    // Beregnet af skridtene: 1 af 2 gjort = 50 % → ingen frist; rækkens progress (0) læses ikke.
    const toSkridt = [venter("a"), skridt({ id: "d1", maal_id: "a", status: "done" }), skridt({ id: "d2", maal_id: "a", status: "dropped" })];
    expect(maalFokus([{ ...fremme, progress: 0 }], toSkridt, NU)).toBeNull();
    // Samme tal som planenDom (Din plan) — én definition.
    const planensTal = planenDom(
      [{ ...fremme, progress: 0, category: null, source: null, progress_updated_at: null, completed_at: null }],
      toSkridt.map((x) => ({ ...x, due_date: x.due_date ?? null, maal_id: x.maal_id ?? null })),
      NU,
    ).aktive[0].fremdrift;
    expect(planensTal).toBe(50);
    // 1 af 3 gjort = 33 % → fristen vises.
    expect(maalFokus([{ ...fremme, progress: 0 }], [...toSkridt, skridt({ id: "d3", maal_id: "a", status: "not_done" })], NU)).toMatchObject({ art: "frist" });
  });

  it("(3) aldrig et mål, hvor alle skridt er gjort", () => {
    const done = (id: string) => skridt({ id: `d${id}`, maal_id: id, status: "done" });
    expect(maalFokus([maal({ id: "a", deadline: "2026-10-05" })], [done("a"), venter("a")], NU)).toBeNull();
  });

  it("rækkefølgen: (1) slår (2), (2) slår (3)", () => {
    const m = [maal({ id: "a", deadline: "2026-10-05" }), maal({ id: "b" })];
    // a har kun et ventende forslag (→ ville være (3)); b er uden skridt (→ (2)); intet aktivt skridt.
    const s = [skridt({ id: "f", maal_id: "a", status: "proposed", due_date: null })];
    expect(maalFokus(m, s, NU)).toMatchObject({ art: "foerste_skridt", maalId: "b" });
    expect(maalFokus(m, [...s, skridt({ id: "s", maal_id: "b", due_date: "2026-12-01" })], NU)).toMatchObject({ art: "skridt", skridtId: "s" });
  });

  it("tiden kommer udefra: samme input, andet «nu», andet svar", () => {
    const m = [maal({ id: "a", deadline: "2026-11-15" })];
    const s = [skridt({ id: "f", maal_id: "a", status: "proposed", due_date: null })];
    expect(maalFokus(m, s, NU)).toBeNull();
    expect(maalFokus(m, s, new Date("2026-10-20T10:00:00Z"))).toMatchObject({ art: "frist", dageTilbage: 26 });
  });
});

describe("ordene", () => {
  it("titler og dage", () => {
    expect(foersteSkridtTitel("Ny sælger", true)).toBe("Tilføj det første skridt mod Ny sælger");
    expect(foersteSkridtTitel("Ny sælger", false)).toBe("Tilføj det næste skridt mod Ny sælger");
    expect(fristTitel("Ny sælger", 12)).toBe("Ny sælger: 12 dage tilbage");
    expect(dageTilbageTekst(1)).toBe("1 dag tilbage");
    expect(dageTilbageTekst(0)).toBe("fristen er i dag");
    expect(dageTilbageTekst(-3)).toBe("fristen er passeret");
  });
  it("CTA'en peger på forsidens eget anker for «Din plan» (rådets fund 13)", () => {
    expect(MAAL_FOKUS_STI).toBe("#dine-maal");
  });
});
