import { describe, expect, it } from "vitest";
import { raadgiverOpslag } from "@/lib/hjemmebane/ansigter";
import {
  daListe,
  flyt,
  GAESTEVAERT_MAERKE,
  grupperVaerter,
  tilUdkast,
  VAERT_DUBLET_FEJL,
  VAERT_UDEN_NAVN_FEJL,
  vaerterForEvent,
  vaerterTekst,
  validerVaerter,
  type VaertRaekke,
} from "@/lib/hjemmebane/vaerter";

/* Værterne (forside PR 4b, 17/9 — Jonas: «ofte er det både Morten og
   Jonas … somme tider gæsteværter»): rækkefølge, rådgivere via opslaget,
   gæster med navn/titel/foto, teksten, formularens dom. */

const raadgivere = raadgiverOpslag([
  { user_id: "morten", full_name: "Morten Munk", avatar_url: "https://x/m.jpg" },
  { user_id: "jonas", full_name: "Jonas Herlev", avatar_url: null },
]);
const r = (over: Partial<VaertRaekke> & { id: string }): VaertRaekke => ({
  event_id: "e1", user_id: null, gaest_navn: null, gaest_titel: null, gaest_foto_path: null, raekkefoelge: 0, ...over,
});

describe("vaerterForEvent — rækkefølge, opslag, gæster", () => {
  it("rådgivere i rækkefølge med fornavn og portræt; gæst med fuldt navn, titel og foto-sti", () => {
    const rows = [
      r({ id: "c", user_id: "jonas", raekkefoelge: 1 }),
      r({ id: "a", user_id: "morten", raekkefoelge: 0 }),
      r({ id: "g", gaest_navn: " Mette Hansen ", gaest_titel: "CFO, Nordic ApS", gaest_foto_path: "vaerter/e1/mette.jpg", raekkefoelge: 2 }),
      r({ id: "x", event_id: "e2", user_id: "morten" }),
    ];
    const v = vaerterForEvent(rows, "e1", raadgivere);
    expect(v.map((x) => [x.fornavn, x.gaest, x.avatarUrl, x.fotoPath, x.titel])).toEqual([
      ["Morten", false, "https://x/m.jpg", null, null],
      ["Jonas", false, null, null, null],
      ["Mette", true, null, "vaerter/e1/mette.jpg", "CFO, Nordic ApS"],
    ]);
    expect(v[2].navn).toBe("Mette Hansen");
  });
  it("en rådgiver der ikke findes blandt rådgiverne udelades — aldrig et gæt; gæst uden navn udelades", () => {
    const v = vaerterForEvent([r({ id: "a", user_id: "forladt" }), r({ id: "b", gaest_navn: "  " }), r({ id: "c", user_id: "morten" })], "e1", raadgivere);
    expect(v.map((x) => x.userId)).toEqual(["morten"]);
  });
  it("grupperVaerter samler pr. event", () => {
    const m = grupperVaerter([r({ id: "a" }), r({ id: "b", event_id: "e2" }), r({ id: "c" })]);
    expect([...m.keys()]).toEqual(["e1", "e2"]);
    expect(m.get("e1")?.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("vaerterTekst — «Morten og Jonas» / «… og gæstevært Mette Hansen»", () => {
  it("teksterne", () => {
    const rows = [r({ id: "a", user_id: "morten", raekkefoelge: 0 }), r({ id: "b", user_id: "jonas", raekkefoelge: 1 }), r({ id: "g", gaest_navn: "Mette Hansen", raekkefoelge: 2 })];
    expect(vaerterTekst(vaerterForEvent(rows.slice(0, 1), "e1", raadgivere))).toBe("Morten");
    expect(vaerterTekst(vaerterForEvent(rows.slice(0, 2), "e1", raadgivere))).toBe("Morten og Jonas");
    expect(vaerterTekst(vaerterForEvent(rows, "e1", raadgivere))).toBe("Morten, Jonas og gæstevært Mette Hansen");
    expect(vaerterTekst([])).toBeNull();
    expect(GAESTEVAERT_MAERKE).toBe("Gæstevært");
  });
  it("daListe", () => {
    expect(daListe([])).toBe("");
    expect(daListe(["a"])).toBe("a");
    expect(daListe(["a", "b"])).toBe("a og b");
    expect(daListe(["a", "b", "c", "d"])).toBe("a, b, c og d");
  });
});

describe("validerVaerter / flyt / tilUdkast — formularens dom", () => {
  it("gæst uden navn og rådgiver to gange afvises; ellers null", () => {
    expect(validerVaerter([{ user_id: null, gaest_navn: " ", gaest_titel: null, gaest_foto_path: null }])).toBe(VAERT_UDEN_NAVN_FEJL);
    expect(validerVaerter([{ user_id: "m", gaest_navn: null, gaest_titel: null, gaest_foto_path: null }, { user_id: "m", gaest_navn: null, gaest_titel: null, gaest_foto_path: null }])).toBe(VAERT_DUBLET_FEJL);
    expect(validerVaerter([{ user_id: "m", gaest_navn: null, gaest_titel: null, gaest_foto_path: null }, { user_id: null, gaest_navn: "Mette", gaest_titel: null, gaest_foto_path: null }])).toBeNull();
    expect(validerVaerter([])).toBeNull();
  });
  it("flyt bytter naboer og gør intet ved kanten", () => {
    expect(flyt(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(flyt(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(flyt(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(flyt(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
  it("tilUdkast dropper id/event_id", () => {
    expect(tilUdkast(r({ id: "a", user_id: "morten" }))).toEqual({ user_id: "morten", gaest_navn: null, gaest_titel: null, gaest_foto_path: null });
  });
});
