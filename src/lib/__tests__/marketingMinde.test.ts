import { describe, expect, it } from "vitest";
import { doemBudget, doemMinde, erProevetFoer, type Sporraekke, type SessionTid } from "@/lib/marketing/minde";

const spor = (id: string, dato: string, o: Partial<Sporraekke> = {}): Sporraekke => ({
  id, created_at: dato, handling: "opdater_flow_mail", klaviyo_id: "AbC123", klaviyo_type: "flow-message",
  toerkoersel: false, udfald: "skrevet", aendringer: [{ felt: "emnelinje", foer: "A", efter: "B" }], ...o,
});
const s = (id: string, dato: string): SessionTid => ({ session_id: id, session_tid: dato });

const uger = ["2026-08-04T18:00:00Z", "2026-08-11T18:00:00Z", "2026-08-18T18:00:00Z", "2026-08-25T18:00:00Z"].map((d, i) => s(`w${i}`, d));

describe("mindet — hvad er prøvet før", () => {
  it("tæller kun de webinarer, der kom EFTER ændringen", () => {
    const m = doemMinde([spor("a", "2026-08-12T09:00:00Z")], uger);
    expect(m).toHaveLength(1);
    expect(m[0].sessionerEfter).toBe(2); // 18/8 og 25/8, ikke 4/8 og 11/8
    expect(m[0].kanAflaeses).toBe(false);
    expect(m[0].saetning).toContain("FOR TIDLIGT AT SIGE NOGET");
  });

  it("tre webinarer efter, og virkningen kan aflæses", () => {
    const m = doemMinde([spor("a", "2026-08-05T09:00:00Z")], uger);
    expect(m[0].sessionerEfter).toBe(3);
    expect(m[0].kanAflaeses).toBe(true);
    expect(m[0].saetning).toContain("Virkningen kan aflæses");
  });

  it("EN TØRKØRSEL ER IKKE ET FORSØG — den huskes ikke som ét", () => {
    expect(doemMinde([spor("a", "2026-08-05T09:00:00Z", { toerkoersel: true })], uger)).toHaveLength(0);
  });

  it("en skrivning, der ikke ændrede noget, huskes heller ikke", () => {
    expect(doemMinde([spor("a", "2026-08-05T09:00:00Z", { aendringer: [] })], uger)).toHaveLength(0);
  });

  it("EN AFVIST ELLER FEJLET ÆNDRING NÅEDE ALDRIG FREM — og er ikke et forsøg", () => {
    for (const udfald of ["afvist", "fejl", "toerkoersel"]) {
      expect(doemMinde([spor("a", "2026-08-05T09:00:00Z", { udfald })], uger), udfald).toHaveLength(0);
    }
  });

  it("nyeste først — uanset hvilken rækkefølge rækkerne kom i", () => {
    const m = doemMinde(
      [spor("gammel", "2026-07-01T09:00:00Z"), spor("ny", "2026-08-20T09:00:00Z"), spor("midt", "2026-08-01T09:00:00Z")],
      uger,
    );
    expect(m.map((x) => x.id)).toEqual(["ny", "midt", "gammel"]);
  });

  it("datoen står på dansk, så den kan læses af et menneske", () => {
    expect(doemMinde([spor("a", "2026-08-05T09:00:00Z")], uger)[0].dato).toBe("5. august");
  });

  it("uden webinarer overhovedet kan intet aflæses", () => {
    const m = doemMinde([spor("a", "2026-08-05T09:00:00Z")], []);
    expect(m[0].sessionerEfter).toBe(0);
    expect(m[0].kanAflaeses).toBe(false);
  });
});

describe("grænsen — hvor meget der må ændres ad gangen", () => {
  it("en åben ændring spærrer for den næste", () => {
    const m = doemMinde([spor("a", "2026-08-20T09:00:00Z")], uger);
    const b = doemBudget(m, "sammenligning");
    expect(b.tilbage).toBe(0);
    expect(b.venterPaa?.id).toBe("a");
    expect(b.saetning).toContain("INGEN NYE ÆNDRINGER NU");
    expect(b.saetning).toContain("hvilken ændring der flyttede tallet");
  });

  it("er alt aflæst, må der ændres ÉN ting", () => {
    const m = doemMinde([spor("a", "2026-07-01T09:00:00Z")], uger);
    const b = doemBudget(m, "moenster");
    expect(b.tilbage).toBe(1);
    expect(b.venterPaa).toBeNull();
    expect(b.saetning).toContain("ÉN ting");
  });

  it("PÅ OBSERVATIONSNIVEAU MÅ DER IKKE ÆNDRES NOGET — heller ikke med tomt minde", () => {
    const b = doemBudget([], "observation");
    expect(b.tilbage).toBe(0);
    expect(b.saetning).toContain("rammer lige så ofte det, der virkede");
  });

  it("den åbne ændring spærrer FØR niveauet — begrundelsen skal være den rigtige", () => {
    const m = doemMinde([spor("a", "2026-08-20T09:00:00Z")], uger);
    expect(doemBudget(m, "observation").venterPaa?.id).toBe("a");
  });

  it("er den seneste åben, spærrer den — også når en ældre er aflæst", () => {
    const m = doemMinde([spor("gammel", "2026-07-01T09:00:00Z"), spor("ny", "2026-08-20T09:00:00Z")], uger);
    expect(doemBudget(m, "sammenligning").venterPaa?.id).toBe("ny");
  });
});

describe("er det prøvet før — målt på felter, ikke på formuleringer", () => {
  const m = doemMinde(
    [spor("a", "2026-07-01T09:00:00Z", { aendringer: [{ felt: "emnelinje" }] }),
     spor("b", "2026-06-01T09:00:00Z", { aendringer: [{ felt: "afsendetid" }, { felt: "emnelinje" }] })],
    uger,
  );

  it("samme felt, anden formulering — genkendes", () => {
    expect(erProevetFoer(["emnelinje"], m)?.id).toBe("a");
  });

  it("rækkefølgen af felterne betyder intet", () => {
    expect(erProevetFoer(["emnelinje", "afsendetid"], m)?.id).toBe("b");
  });

  it("et felt mere er IKKE det samme forsøg", () => {
    expect(erProevetFoer(["emnelinje", "forhåndstekst"], m)).toBeNull();
  });

  it("et forslag uden felter matcher ingenting", () => {
    expect(erProevetFoer([], m)).toBeNull();
  });
});
