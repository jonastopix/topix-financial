import { describe, expect, it } from "vitest";
import { afgoerDubletter, kontraktGaelder } from "../../../supabase/functions/_shared/ansoegningDubletter.ts";

// Dubletdommen (18/9, flow-gennemgangen §4-5): hvad rådgiveren skal vide FØR «tal med dem».
const nu = new Date("2026-09-18T12:00:00Z");
const V = { id: "c1", name: "Nordic Byg ApS", status: "active", contract_end_date: "2027-03-01" };
const tom = { virksomhederPaaCvr: [], virksomhederPaaMail: [], andreAabneAnsoegninger: [], nu };

describe("afgoerDubletter", () => {
  it("intet fundet → ingen advarsler, ikke alvorlig, intet medlem", () => {
    expect(afgoerDubletter(tom)).toEqual({ advarsler: [], alvorlig: false, medlem: null });
  });
  it("virksomheden findes på CVR med gældende medlemskab → alvorlig, og medlemskabet siges", () => {
    const d = afgoerDubletter({ ...tom, virksomhederPaaCvr: [V] });
    expect(d.alvorlig).toBe(true);
    expect(d.medlem?.id).toBe("c1");
    expect(d.advarsler).toEqual(["findes allerede som virksomheden «Nordic Byg ApS» (CVR, active, medlemskab til 2027-03-01)"]);
  });
  it("samme virksomhed på CVR og mail nævnes én gang; udløbet kontrakt, tom dato og ukendt status siges", () => {
    const gammel = { id: "c2", name: "Gammel ApS", status: "tidligere", contract_end_date: "2025-01-01" };
    const d = afgoerDubletter({ ...tom, virksomhederPaaCvr: [V], virksomhederPaaMail: [V, gammel] });
    expect(d.advarsler).toEqual([
      "findes allerede som virksomheden «Nordic Byg ApS» (CVR, active, medlemskab til 2027-03-01)",
      "findes allerede som virksomheden «Gammel ApS» (mail, tidligere, kontrakt udløbet 2025-01-01)",
    ]);
    expect(d.medlem?.id).toBe("c1");
    expect(afgoerDubletter({ ...tom, virksomhederPaaMail: [{ ...V, status: null, contract_end_date: null }] }).advarsler[0])
      .toBe("findes allerede som virksomheden «Nordic Byg ApS» (mail, status ukendt, ingen kontraktdato)");
  });
  it("anden åben ansøgning på samme CVR → advarsel, men ikke alvorlig alene; uden navn og mail bruges id", () => {
    const d = afgoerDubletter({ ...tom, andreAabneAnsoegninger: [{ id: "a2", navn: "Pia Hansen", email: "pia@x.dk", trin: "indkaldt" }, { id: "a3", navn: null, email: null, trin: "ny" }] });
    expect(d.alvorlig).toBe(false);
    expect(d.medlem).toBeNull();
    expect(d.advarsler).toEqual(["anden åben ansøgning på samme CVR: Pia Hansen, pia@x.dk (indkaldt)", "anden åben ansøgning på samme CVR: a3 (ny)"]);
  });
});

describe("kontraktGaelder — splitter selv, dagen tæller med", () => {
  it("i dag → gælder; i går → ikke; tom eller ulæselig → ikke", () => {
    expect(kontraktGaelder("2026-09-18", nu)).toBe(true);
    expect(kontraktGaelder("2026-09-17", nu)).toBe(false);
    expect(kontraktGaelder("2027-01-01T00:00:00+00:00", nu)).toBe(true);
    expect(kontraktGaelder(null, nu)).toBe(false);
    expect(kontraktGaelder("i går", nu)).toBe(false);
  });
});
