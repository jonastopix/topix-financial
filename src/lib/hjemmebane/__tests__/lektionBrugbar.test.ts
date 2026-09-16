import { describe, expect, it } from "vitest";
import {
  BRUGBAR_SPOERGSMAAL,
  brugbarLinje,
  brugbarPatch,
  optaelBrugbarPrLektion,
  patchBrugbarIRaekker,
  skalSpoergeOmBrugbar,
  udelukFraBrugbar,
  type BrugbarOptaelling,
  type BrugbarRaekke,
  type UdelukMedlem,
} from "../lektionBrugbar";
// erKunde er ren (raadgiverensKunder.ts: ingen I/O, ingen Supabase) — bruges kun
// til at vise at companyErKunde's fire kilde-cases lander som fail-open siger.
import { erKunde } from "@/lib/raadgiverensKunder";

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

describe("udelukFraBrugbar — rådgiverne og ikke-kunders medlemmer, PR. BRUGER (16/9)", () => {
  const medlem = (userId: string, companyErKunde: boolean): UdelukMedlem => ({ userId, companyErKunde });

  it("ingen rådgivere, alle kunder → tomt sæt", () => {
    expect(udelukFraBrugbar([], [medlem("u1", true), medlem("u2", true)])).toEqual(new Set());
  });

  it("rådgiver-id'er er i sættet — også en rådgiver uden company_members-række (står ikke i medlemmer)", () => {
    expect(udelukFraBrugbar(["morten"], [medlem("u1", true)])).toEqual(new Set(["morten"]));
    expect(udelukFraBrugbar(new Set(["morten", "jonas"]), [])).toEqual(new Set(["morten", "jonas"]));
  });

  it("et medlem af en ikke-kunde (companyErKunde false) er i sættet; et medlem af en kunde er ikke", () => {
    expect(udelukFraBrugbar([], [medlem("topix", false), medlem("kunde", true)])).toEqual(new Set(["topix"]));
  });

  it("companyErKunde kommer fra erKunde (fail-open) — true, null og undefined er alle kunde, kun false udelukker", () => {
    const raa = [
      { userId: "a", er_kunde: true },
      { userId: "b", er_kunde: null },
      { userId: "c", er_kunde: undefined },
      { userId: "d", er_kunde: false },
    ];
    const medlemmer = raa.map((r) => medlem(r.userId, erKunde(r)));
    expect(udelukFraBrugbar([], medlemmer)).toEqual(new Set(["d"]));
  });

  it("en rådgiver der OGSÅ er medlem af en kunde er i sættet — rådgiverlisten vinder", () => {
    expect(udelukFraBrugbar(["jonas"], [medlem("jonas", true)])).toEqual(new Set(["jonas"]));
  });

  it("PR. BRUGER: et medlem af både en kunde og en ikke-kunde tæller med — udelukkes kun hvis ALLE medlemskaber er ikke-kunder", () => {
    expect(udelukFraBrugbar([], [medlem("dobbelt", false), medlem("dobbelt", true)])).toEqual(new Set());
    expect(udelukFraBrugbar([], [medlem("dobbelt", true), medlem("dobbelt", false)])).toEqual(new Set());
    expect(udelukFraBrugbar([], [medlem("kunTopix", false), medlem("kunTopix", false)])).toEqual(new Set(["kunTopix"]));
  });

  it("dubletter: samme user_id flere gange står én gang i sættet", () => {
    const ud = udelukFraBrugbar(["r", "r"], [medlem("x", false), medlem("x", false)]);
    expect([...ud].sort()).toEqual(["r", "x"]);
  });

  it("tomme rådgiver-id'er (filter(Boolean)-reglen) kommer ikke med", () => {
    expect(udelukFraBrugbar(["", "r"], [])).toEqual(new Set(["r"]));
  });

  it("rører ikke input", () => {
    const raadgivere = ["r"];
    const medlemmer = [medlem("x", false), medlem("y", true)];
    const kopi = JSON.parse(JSON.stringify({ raadgivere, medlemmer }));
    udelukFraBrugbar(raadgivere, medlemmer);
    expect({ raadgivere, medlemmer }).toEqual(kopi);
  });

  it("sammensat med optaelBrugbarPrLektion: en ikke-kundes gennemførte lektion er ikke i tallet, rådgiverens heller ikke, og invarianten holder", () => {
    const udeluk = udelukFraBrugbar(["raadgiver"], [medlem("topix", false), medlem("kunde", true), medlem("dobbelt", false), medlem("dobbelt", true)]);
    const ud = optaelBrugbarPrLektion(
      [
        raekke({ user_id: "kunde", content_item_id: "L1", acknowledged_at: ACK, brugbar: true }),
        raekke({ user_id: "dobbelt", content_item_id: "L1", acknowledged_at: ACK, brugbar: false }),
        raekke({ user_id: "topix", content_item_id: "L1", acknowledged_at: ACK, brugbar: true }),
        raekke({ user_id: "raadgiver", content_item_id: "L1", acknowledged_at: ACK, brugbar: true }),
        raekke({ user_id: "topix", content_item_id: "L2", acknowledged_at: ACK, brugbar: true }),
      ],
      udeluk,
    );
    expect(ud).toEqual({ L1: { gennemfoert: 2, ja: 1, nej: 1, ubesvaret: 0 } });
    expect(ud.L2).toBeUndefined();
    forventInvariant(ud);
  });
});
