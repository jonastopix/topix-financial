import { describe, expect, it } from "vitest";
import {
  aabenMaaned,
  erGodkendtTilTiden,
  flytMaaned,
  foersteTaellendeMaaned,
  frist,
  fristDato,
  hverdageTil,
  naesteMaaned,
  senesteMaanedMedPasseretFrist,
  streakDom,
  tidligsteGodkendelse,
} from "@/lib/boardroomScore/streak";
import type { ScoreMaaned } from "@/lib/boardroomScore/typer";
import { erHelligdag, paaskedag } from "@/lib/hverdage";

/* Tal-streaken (docs/boardroom-score.md §4): målt række + første godkendelse
   (hukommelsen maaned_foerste_godkendelse, ellers created_at — den tidligste)
   ≤ udgangen af den 10. i måneden efter — rykket til næste hverdag, når den
   10. ikke er en. Baglæns fra seneste passerede frist; den åbne måned lægger
   til, bryder aldrig; den første tællende måned fryser bagud. */

const m = (key: string, godkendt: string | null, basis: "measured" | "estimated" = "measured"): ScoreMaaned => ({
  key,
  basis,
  foersteGodkendtAt: godkendt,
  metrics: {},
});

/** 30/9-2026 kl. 12:00 dansk tid (onsdag). */
const NU = new Date("2026-09-30T10:00:00Z");

describe("månedsregning", () => {
  it("naesteMaaned og flytMaaned krydser årsskiftet", () => {
    expect(naesteMaaned("2026-12")).toBe("2027-01");
    expect(flytMaaned("2026-01", -1)).toBe("2025-12");
    expect(flytMaaned("2026-03", -12)).toBe("2025-03");
    expect(flytMaaned("2026-11", 3)).toBe("2027-02");
  });
  it("kaster på en ugyldig nøgle — nøglen er vores egen", () => {
    expect(() => naesteMaaned("2026-9")).toThrow();
  });
});

describe("frist — udgangen af den 10. i måneden efter, dansk tid, rykket til hverdag", () => {
  it("10/9-2026 er en torsdag: frist(2026-08) = 10/9 23:59:59,999 CEST", () => {
    expect(fristDato("2026-08")).toBe("2026-09-10");
    expect(frist("2026-08").toISOString()).toBe("2026-09-10T21:59:59.999Z");
  });
  it("10/10-2026 er en lørdag → mandag 12/10", () => {
    expect(fristDato("2026-09")).toBe("2026-10-12");
    expect(frist("2026-09").toISOString()).toBe("2026-10-12T21:59:59.999Z");
  });
  it("10/1-2026 er en lørdag → mandag 12/1 (vintertid, CET)", () => {
    expect(fristDato("2025-12")).toBe("2026-01-12");
    expect(frist("2025-12").toISOString()).toBe("2026-01-12T22:59:59.999Z");
  });
  it("en helligdag rykker også: 10/4-2023 er 2. påskedag → tirsdag 11/4", () => {
    expect(paaskedag(2023)).toBe("2023-04-09");
    expect(erHelligdag("2023-04-10")).toBe(true);
    expect(fristDato("2023-03")).toBe("2023-04-11");
  });
  it("rykker aldrig den anden vej — en hverdag den 10. står", () => {
    expect(fristDato("2026-10")).toBe("2026-11-10"); // tirsdag
  });
});

describe("seneste passerede frist og den åbne måned", () => {
  it("30/9: august er passeret (10/9), september er åben", () => {
    expect(senesteMaanedMedPasseretFrist(NU)).toBe("2026-08");
    expect(aabenMaaned(NU)).toBe("2026-09");
  });
  it("5/10: september er stadig åben (frist 12/10) — august er seneste passerede", () => {
    const nu = new Date("2026-10-05T10:00:00Z");
    expect(senesteMaanedMedPasseretFrist(nu)).toBe("2026-08");
    expect(aabenMaaned(nu)).toBe("2026-09");
  });
  it("13/10 kl. 00:00 dansk: september er passeret, oktober åben", () => {
    const nu = new Date("2026-10-12T22:00:00Z");
    expect(senesteMaanedMedPasseretFrist(nu)).toBe("2026-09");
    expect(aabenMaaned(nu)).toBe("2026-10");
  });
  it("præcis på fristens sidste millisekund er den IKKE passeret", () => {
    expect(senesteMaanedMedPasseretFrist(new Date("2026-10-12T21:59:59.999Z"))).toBe("2026-08");
    expect(senesteMaanedMedPasseretFrist(new Date("2026-10-12T22:00:00.000Z"))).toBe("2026-09");
  });
});

describe("erGodkendtTilTiden", () => {
  it("målt og created_at ≤ frist", () => {
    expect(erGodkendtTilTiden(m("2026-08", "2026-09-10T21:59:59.999Z"))).toBe(true);
    expect(erGodkendtTilTiden(m("2026-08", "2026-09-10T22:00:00.000Z"))).toBe(false);
  });
  it("et estimat tæller aldrig, heller ikke med tidlig dato", () => {
    expect(erGodkendtTilTiden(m("2026-08", "2026-09-01T00:00:00Z", "estimated"))).toBe(false);
  });
  it("ukendt godkendelsestidspunkt = ikke til tiden (vi påstår intet)", () => {
    expect(erGodkendtTilTiden(m("2026-08", null))).toBe(false);
    expect(erGodkendtTilTiden(m("2026-08", "ikke en dato"))).toBe(false);
    expect(erGodkendtTilTiden(undefined)).toBe(false);
  });
});

describe("tidligsteGodkendelse — hukommelsen mod rækkens created_at (rådets fund 1)", () => {
  it("den tidligste vinder, uanset rækkefølge", () => {
    expect(tidligsteGodkendelse("2026-09-05T09:00:00Z", "2026-09-20T09:00:00Z")).toBe("2026-09-05T09:00:00.000Z");
    expect(tidligsteGodkendelse("2026-09-20T09:00:00Z", "2026-09-05T09:00:00Z")).toBe("2026-09-05T09:00:00.000Z");
  });
  it("mangler den ene, gælder den anden; mangler begge → null; ugyldig = mangler", () => {
    expect(tidligsteGodkendelse(null, "2026-09-05T09:00:00Z")).toBe("2026-09-05T09:00:00.000Z");
    expect(tidligsteGodkendelse("2026-09-05T09:00:00Z", undefined)).toBe("2026-09-05T09:00:00.000Z");
    expect(tidligsteGodkendelse(null, null)).toBeNull();
    expect(tidligsteGodkendelse("ikke en dato", null)).toBeNull();
  });
  it("ERSTATTET EFTER FRISTEN: august godkendt 5/9 (hukommelsen), rapporten erstattet 20/9 (ny række, created_at = now) → stadig rettidig", () => {
    const foerste = tidligsteGodkendelse("2026-09-05T09:00:00Z", "2026-09-20T14:00:00Z");
    expect(erGodkendtTilTiden(m("2026-08", foerste))).toBe(true);
    // Uden hukommelsen ville den samme række være for sen — det var fejlen.
    expect(erGodkendtTilTiden(m("2026-08", "2026-09-20T14:00:00Z"))).toBe(false);
    // Og streaken holder.
    expect(streakDom([m("2026-07", "2026-08-05T09:00:00Z"), m("2026-08", foerste)], "2026-07-01", NU).laengde).toBe(2);
  });
  it("en måned, der første gang blev målt FOR SENT og siden erstattet, er stadig for sen — hukommelsen giver ingen nåde", () => {
    const foerste = tidligsteGodkendelse("2026-09-15T09:00:00Z", "2026-09-25T09:00:00Z");
    expect(erGodkendtTilTiden(m("2026-08", foerste))).toBe(false);
  });
});

describe("foersteTaellendeMaaned — den første HELE måned som medlem", () => {
  it("kontraktstart 15/6 → juli; den 1/6 → juni (måneden er hel — rådets fund 6)", () => {
    expect(foersteTaellendeMaaned("2026-06-15")).toBe("2026-07");
    expect(foersteTaellendeMaaned("2026-06-01")).toBe("2026-06");
    expect(foersteTaellendeMaaned("2026-06-30")).toBe("2026-07");
  });
  it("uden kontraktstart: måneden efter den tidligste første godkendelse (rådets fund 2)", () => {
    const rows = [m("2026-05", "2026-06-20T09:00:00Z"), m("2026-06", "2026-07-05T09:00:00Z"), m("2026-04", "2026-07-01T09:00:00Z")];
    expect(foersteTaellendeMaaned(null, rows)).toBe("2026-07");
    // Dansk tid: 30/6 kl. 23:30 dansk = 21:30Z — juni, ikke juli.
    expect(foersteTaellendeMaaned(null, [m("2026-05", "2026-06-30T21:30:00Z")])).toBe("2026-07");
    expect(foersteTaellendeMaaned(null, [m("2026-05", "2026-06-30T22:30:00Z")])).toBe("2026-08");
  });
  it("uden kontraktstart: estimater og ukendte tidspunkter tæller ikke; ingen godkendelse → null", () => {
    expect(foersteTaellendeMaaned(null, [m("2026-05", "2026-06-05T09:00:00Z", "estimated"), m("2026-06", null)])).toBeNull();
    expect(foersteTaellendeMaaned(null)).toBeNull();
    expect(foersteTaellendeMaaned("")).toBeNull();
  });
  it("kontraktstart vinder over godkendelserne", () => {
    expect(foersteTaellendeMaaned("2026-08-01", [m("2026-01", "2026-02-05T09:00:00Z")])).toBe("2026-08");
  });
});

describe("hverdageTil", () => {
  it("fra onsdag 30/9 til mandag 12/10: 1, 2, 5, 6, 7, 8, 9, 12 = 8 hverdage", () => {
    expect(hverdageTil("2026-10-12", NU)).toBe(8);
  });
  it("0 når fristen er i dag eller passeret", () => {
    expect(hverdageTil("2026-09-30", NU)).toBe(0);
    expect(hverdageTil("2026-09-01", NU)).toBe(0);
  });
});

describe("streakDom", () => {
  const tilTiden = (key: string) => m(key, `${naesteMaaned(key)}-05T09:00:00Z`);
  /** Kontraktstart langt tilbage, så testene her måler streaken, ikke den første tællende måned. */
  const START = "2025-01-01";

  it("fire måneder i træk til tiden → 4, aktiv, næste frist er septembers 12/10 om 8 hverdage", () => {
    const d = streakDom(["2026-05", "2026-06", "2026-07", "2026-08"].map(tilTiden), START, NU);
    expect(d.laengde).toBe(4);
    expect(d.status).toBe("aktiv");
    expect(d.bedste).toBe(4);
    expect(d.aabenMaanedGodkendt).toBe(false);
    expect(d.naesteFrist).toEqual({ key: "2026-09", tidspunkt: frist("2026-09"), hverdageTil: 8 });
  });

  it("den åbne måned lægger til, når den allerede er godkendt — og næste frist bliver oktobers", () => {
    const d = streakDom([...["2026-06", "2026-07", "2026-08"].map(tilTiden), m("2026-09", "2026-09-30T08:00:00Z")], START, NU);
    expect(d.laengde).toBe(4);
    expect(d.aabenMaanedGodkendt).toBe(true);
    expect(d.naesteFrist.key).toBe("2026-10");
  });

  it("den åbne måned bryder aldrig: ikke godkendt endnu = stadig aktiv", () => {
    const d = streakDom(["2026-07", "2026-08"].map(tilTiden), START, NU);
    expect(d.status).toBe("aktiv");
    expect(d.laengde).toBe(2);
  });

  it("august godkendt for sent (15/9) → flammen er ude, bedste husker de tre før", () => {
    const d = streakDom([...["2026-05", "2026-06", "2026-07"].map(tilTiden), m("2026-08", "2026-09-15T09:00:00Z")], START, NU);
    expect(d.laengde).toBe(0);
    expect(d.status).toBe("brudt");
    expect(d.bedste).toBe(3);
  });

  it("et hul bryder: august til tiden, juli mangler, juni til tiden → 1", () => {
    const d = streakDom([tilTiden("2026-06"), tilTiden("2026-08")], START, NU);
    expect(d.laengde).toBe(1);
    expect(d.bedste).toBe(1);
  });

  it("gen-godkendelse er ligegyldig: kun created_at læses (committed_at gives ikke ind)", () => {
    const d = streakDom([m("2026-08", "2026-09-03T09:00:00Z")], START, NU);
    expect(d.laengde).toBe(1);
  });

  it("kontraktstart fryser bagud: måneder før første hele måned tæller ikke og bryder ikke", () => {
    const d = streakDom(["2026-07", "2026-08"].map(tilTiden), "2026-06-15", NU);
    expect(d.laengde).toBe(2);
    expect(d.status).toBe("aktiv");
    // Og en for sen måned FØR starten er heller ikke et brud.
    const d2 = streakDom([m("2026-05", "2026-07-20T00:00:00Z"), ...["2026-07", "2026-08"].map(tilTiden)], "2026-06-15", NU);
    expect(d2.laengde).toBe(2);
  });

  it("uden kontraktstart fryser den tidligste godkendelse bagud: første måned godkendt for sent tæller ikke imod", () => {
    // Medlem uden kontraktstart: juni godkendt først 20/7 (for sen — men det var den første godkendelse, så
    // første tællende måned er AUGUST, måneden efter godkendelsen). Juni bryder ikke; juli tæller ikke.
    const d = streakDom([m("2026-06", "2026-07-20T09:00:00Z"), tilTiden("2026-07"), tilTiden("2026-08")], null, NU);
    expect(d.laengde).toBe(1);
    expect(d.status).toBe("aktiv");
    // Godkendes juni i stedet 30/6 (før måneden er omme), er juli første tællende måned → 2.
    const d2 = streakDom([m("2026-06", "2026-06-30T09:00:00Z"), tilTiden("2026-07"), tilTiden("2026-08")], null, NU);
    expect(d2.laengde).toBe(2);
  });

  it("nyt medlem uden tællende måneder: 0, status «ingen» — der er intet at bryde", () => {
    const d = streakDom([], "2026-09-20", NU);
    expect(d).toMatchObject({ laengde: 0, status: "ingen", bedste: 0 });
  });

  it("estimater (årsregnskabet /12) tæller hverken med eller imod", () => {
    const d = streakDom([m("2026-08", "2026-09-01T00:00:00Z", "estimated"), tilTiden("2026-07")], START, NU);
    expect(d.laengde).toBe(0); // august er ikke målt → brudt
    expect(d.status).toBe("brudt");
  });

  it("bedste kan være længere end den aktuelle", () => {
    const rows = [...["2025-10", "2025-11", "2025-12", "2026-01", "2026-02"].map(tilTiden), m("2026-03", "2026-05-01T00:00:00Z"), ...["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map(tilTiden)];
    const d = streakDom(rows, START, NU);
    expect(d.laengde).toBe(5);
    expect(d.bedste).toBe(5);
    const d2 = streakDom(rows.filter((r) => r.key !== "2026-08"), START, NU);
    expect(d2.laengde).toBe(0);
    expect(d2.bedste).toBe(5);
  });
});
