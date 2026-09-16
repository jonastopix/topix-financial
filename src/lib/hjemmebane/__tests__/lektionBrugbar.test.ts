import { describe, expect, it } from "vitest";
import {
  BRUGBAR_SPOERGSMAAL,
  brugbarLinje,
  brugbarPatch,
  optaelBrugbarPrLektion,
  patchBrugbarIRaekker,
  skalSpoergeOmBrugbar,
  type BrugbarOptaelling,
  type BrugbarRaekke,
} from "../lektionBrugbar";

/** Motoren bag «Kunne du bruge den?» (16/9-2026). Ren — lektionBrugbar.ts
    har kun en type-import fra akademiApi, så ingen Supabase-mock er nødvendig. */

const NU = new Date("2026-09-16T10:00:00.000Z");

describe("skalSpoergeOmBrugbar — spørg præcis når tracked, done, ubesvaret og ikke rådgiver", () => {
  it("ikke tracked → aldrig, selv om lektionen er done og ubesvaret", () => {
    expect(skalSpoergeOmBrugbar({ tracked: false, state: "done", brugbar: null, erRaadgiver: false })).toBe(false);
  });

  it("tracked men started / skipped / untouched → nej", () => {
    for (const state of ["started", "skipped", "untouched"] as const) {
      expect(skalSpoergeOmBrugbar({ tracked: true, state, brugbar: null, erRaadgiver: false }), state).toBe(false);
      expect(skalSpoergeOmBrugbar({ tracked: true, state, brugbar: undefined, erRaadgiver: false }), state).toBe(false);
    }
  });

  it("done med brugbar null → ja; med brugbar undefined (feltet mangler) → ja — samme regel som MemberProgress", () => {
    expect(skalSpoergeOmBrugbar({ tracked: true, state: "done", brugbar: null, erRaadgiver: false })).toBe(true);
    expect(skalSpoergeOmBrugbar({ tracked: true, state: "done", brugbar: undefined, erRaadgiver: false })).toBe(true);
  });

  it("done men allerede besvaret (true eller false) → nej", () => {
    expect(skalSpoergeOmBrugbar({ tracked: true, state: "done", brugbar: true, erRaadgiver: false })).toBe(false);
    expect(skalSpoergeOmBrugbar({ tracked: true, state: "done", brugbar: false, erRaadgiver: false })).toBe(false);
  });

  it("rådgiver → aldrig, selv når alt andet siger ja", () => {
    expect(skalSpoergeOmBrugbar({ tracked: true, state: "done", brugbar: null, erRaadgiver: true })).toBe(false);
  });
});

describe("brugbarPatch — de to kolonner sættes sammen", () => {
  it("ja → brugbar true og brugbar_at som ISO-strengen af det faste nu", () => {
    expect(brugbarPatch(true, NU)).toEqual({ brugbar: true, brugbar_at: "2026-09-16T10:00:00.000Z" });
  });

  it("nej → brugbar false, samme stempel", () => {
    expect(brugbarPatch(false, NU)).toEqual({ brugbar: false, brugbar_at: "2026-09-16T10:00:00.000Z" });
  });

  it("patchen har præcis de to nøgler — aldrig acknowledged_at eller andre", () => {
    expect(Object.keys(brugbarPatch(true, NU)).sort()).toEqual(["brugbar", "brugbar_at"]);
  });
});

const ACK = "2026-09-15T08:00:00.000Z";
const raekke = (over: Partial<BrugbarRaekke> & Pick<BrugbarRaekke, "user_id" | "content_item_id">): BrugbarRaekke => over;

/** Invarianten gælder i hver case: ja + nej + ubesvaret = gennemfoert, pr. lektion. */
function forventInvariant(ud: Record<string, BrugbarOptaelling>): void {
  for (const [lektion, tal] of Object.entries(ud)) {
    expect(tal.ja + tal.nej + tal.ubesvaret, lektion).toBe(tal.gennemfoert);
  }
}

describe("optaelBrugbarPrLektion — tallet pr. lektion, kun gennemførte, aldrig de udelukkede", () => {
  it("tom liste → tomt resultat", () => {
    const ud = optaelBrugbarPrLektion([], []);
    expect(ud).toEqual({});
    forventInvariant(ud);
  });

  it("flere lektioner: ja, nej og ubesvaret (null OG manglende felt) tælles hver for sig", () => {
    const ud = optaelBrugbarPrLektion(
      [
        raekke({ user_id: "u1", content_item_id: "L1", acknowledged_at: ACK, brugbar: true }),
        raekke({ user_id: "u2", content_item_id: "L1", acknowledged_at: ACK, brugbar: false }),
        raekke({ user_id: "u3", content_item_id: "L1", acknowledged_at: ACK, brugbar: null }),
        raekke({ user_id: "u4", content_item_id: "L1", acknowledged_at: ACK }), // brugbar mangler = ubesvaret
        raekke({ user_id: "u1", content_item_id: "L2", acknowledged_at: ACK, brugbar: true }),
        raekke({ user_id: "u2", content_item_id: "L2", acknowledged_at: ACK, brugbar: true }),
      ],
      [],
    );
    expect(ud).toEqual({
      L1: { gennemfoert: 4, ja: 1, nej: 1, ubesvaret: 2 },
      L2: { gennemfoert: 2, ja: 2, nej: 0, ubesvaret: 0 },
    });
    forventInvariant(ud);
  });

  it("udelukkede brugere (rådgiverne) tæller ikke — hverken som gennemført eller som svar", () => {
    const ud = optaelBrugbarPrLektion(
      [
        raekke({ user_id: "medlem", content_item_id: "L1", acknowledged_at: ACK, brugbar: false }),
        raekke({ user_id: "raadgiver", content_item_id: "L1", acknowledged_at: ACK, brugbar: true }),
        raekke({ user_id: "raadgiver", content_item_id: "L2", acknowledged_at: ACK, brugbar: true }),
      ],
      new Set(["raadgiver"]),
    );
    expect(ud).toEqual({ L1: { gennemfoert: 1, ja: 0, nej: 1, ubesvaret: 0 } });
    expect(ud.L2).toBeUndefined();
    forventInvariant(ud);
  });

  it("et svar på en række uden acknowledged_at (fortrudt kvittering) tæller hverken som gennemført eller som svar", () => {
    const ud = optaelBrugbarPrLektion(
      [
        raekke({ user_id: "u1", content_item_id: "L1", acknowledged_at: null, brugbar: true }),
        raekke({ user_id: "u2", content_item_id: "L1", brugbar: false }), // acknowledged_at mangler
        raekke({ user_id: "u3", content_item_id: "L1", acknowledged_at: ACK, brugbar: null }),
      ],
      [],
    );
    expect(ud).toEqual({ L1: { gennemfoert: 1, ja: 0, nej: 0, ubesvaret: 1 } });
    forventInvariant(ud);
  });

  it("en lektion hvor alle rækker er ikke-gennemførte optræder slet ikke", () => {
    const ud = optaelBrugbarPrLektion(
      [raekke({ user_id: "u1", content_item_id: "L9", acknowledged_at: null, brugbar: true })],
      [],
    );
    expect(ud).toEqual({});
    forventInvariant(ud);
  });

  it("rører ikke input-rækkerne", () => {
    const rows = [raekke({ user_id: "u1", content_item_id: "L1", acknowledged_at: ACK, brugbar: true })];
    const kopi = JSON.parse(JSON.stringify(rows));
    optaelBrugbarPrLektion(rows, []);
    expect(rows).toEqual(kopi);
  });
});

describe("brugbarLinje — rådgiverens linje pr. lektion, tre grene", () => {
  it("undefined eller gennemfoert 0 → «Ingen har gennemført den endnu»", () => {
    expect(brugbarLinje(undefined)).toBe("Ingen har gennemført den endnu");
    expect(brugbarLinje({ gennemfoert: 0, ja: 0, nej: 0, ubesvaret: 0 })).toBe("Ingen har gennemført den endnu");
  });

  it("gennemført men ingen svar → antallet og «ingen har svaret endnu», også med 1", () => {
    expect(brugbarLinje({ gennemfoert: 1, ja: 0, nej: 0, ubesvaret: 1 })).toBe("1 gennemført · ingen har svaret endnu");
    expect(brugbarLinje({ gennemfoert: 7, ja: 0, nej: 0, ubesvaret: 7 })).toBe("7 gennemført · ingen har svaret endnu");
  });

  it("med svar → «ja af (ja+nej) kunne bruge den · gennemført», også med 1", () => {
    expect(brugbarLinje({ gennemfoert: 1, ja: 1, nej: 0, ubesvaret: 0 })).toBe("1 af 1 kunne bruge den · 1 gennemført");
    expect(brugbarLinje({ gennemfoert: 5, ja: 0, nej: 1, ubesvaret: 4 })).toBe("0 af 1 kunne bruge den · 5 gennemført");
    expect(brugbarLinje({ gennemfoert: 9, ja: 4, nej: 2, ubesvaret: 3 })).toBe("4 af 6 kunne bruge den · 9 gennemført");
  });
});

describe("patchBrugbarIRaekker — den optimistiske cache-patch", () => {
  type Raekke = { content_item_id: string; seen_at: string | null; brugbar?: boolean | null };
  const patch = brugbarPatch(true, NU);
  const rows = (): Raekke[] => [
    { content_item_id: "L1", seen_at: ACK, brugbar: null },
    { content_item_id: "L2", seen_at: null },
  ];

  it("patcher KUN rækken for itemId — de andre felter bevares, de andre rækker er urørte", () => {
    const ud = patchBrugbarIRaekker(rows(), "L1", patch);
    expect(ud[0]).toEqual({ content_item_id: "L1", seen_at: ACK, brugbar: true, brugbar_at: "2026-09-16T10:00:00.000Z" });
    expect(ud[1]).toEqual({ content_item_id: "L2", seen_at: null });
  });

  it("manglende række → listen returneres uændret (samme reference), ingen ny række", () => {
    const input = rows();
    const ud = patchBrugbarIRaekker(input, "L9", patch);
    expect(ud).toBe(input);
    expect(ud).toEqual(rows());
  });

  it("rører ikke input", () => {
    const input = rows();
    const kopi = JSON.parse(JSON.stringify(input));
    patchBrugbarIRaekker(input, "L1", patch);
    expect(input).toEqual(kopi);
  });
});

describe("fladens ord", () => {
  it("BRUGBAR_SPOERGSMAAL er præcis «Kunne du bruge den?»", () => {
    expect(BRUGBAR_SPOERGSMAAL).toBe("Kunne du bruge den?");
  });
});
