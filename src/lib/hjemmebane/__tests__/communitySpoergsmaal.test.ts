import { describe, expect, it } from "vitest";
import {
  delFeed,
  erSpoergsmaal,
  erUbesvaret,
  filtrerStroem,
  harSvaretTekst,
  raadgiverIdsAf,
  taelUbesvarede,
  ubesvaredeChipTekst,
  visMarkerKnap,
  type SpoergsmaalTraad,
} from "../communitySpoergsmaal";

/* Dommene bag rådgivernes «Spørgsmål» og filtret «Ubesvarede» (2/10-2026). */

const t = (over: Partial<SpoergsmaalTraad> & { id: string }): SpoergsmaalTraad => ({
  status: "aktiv",
  forfatter_id: "m1",
  antal_svar: 0,
  ...over,
});

const RAADGIVERE = new Set(["r1", "r2"]);

describe("erSpoergsmaal", () => {
  it("sat = markeret; null, undefined og tom streng = ikke", () => {
    expect(erSpoergsmaal({ spoergsmaal_markeret_at: "2026-10-02T07:30:00Z" })).toBe(true);
    expect(erSpoergsmaal({ spoergsmaal_markeret_at: null })).toBe(false);
    expect(erSpoergsmaal({})).toBe(false);
    expect(erSpoergsmaal({ spoergsmaal_markeret_at: "" })).toBe(false);
  });
});

describe("delFeed — regel 1 og 2", () => {
  it("det markerede opslag tages ud af strømmen og står som spørgsmålet; resten beholder feedets orden", () => {
    const feed = [t({ id: "q", forfatter_id: "r1", spoergsmaal_markeret_at: "2026-10-02T07:30:00Z" }), t({ id: "a" }), t({ id: "b" })];
    const d = delFeed(feed, "m9");
    expect(d.spoergsmaal?.id).toBe("q");
    expect(d.stroem.map((x) => x.id)).toEqual(["a", "b"]);
    expect(d.foldet).toBe(false);
  });

  it("FØR migrationen (ingen kolonne) er der intet spørgsmål, og strømmen er hele feedet", () => {
    const feed = [t({ id: "a" }), t({ id: "b" })];
    const d = delFeed(feed, "m9");
    expect(d.spoergsmaal).toBeNull();
    expect(d.stroem.map((x) => x.id)).toEqual(["a", "b"]);
    expect(d.foldet).toBe(false);
  });

  it("et SKJULT markeret opslag er ikke spørgsmålet (rådgiveren ser det i strømmen som før)", () => {
    const feed = [t({ id: "q", status: "skjult", forfatter_id: "r1", spoergsmaal_markeret_at: "2026-10-02T07:30:00Z" }), t({ id: "a" })];
    const d = delFeed(feed, "r1");
    expect(d.spoergsmaal).toBeNull();
    expect(d.stroem.map((x) => x.id)).toEqual(["q", "a"]);
  });

  it("flere markerede (mod forventning): den senest markerede vinder, de andre bliver i strømmen", () => {
    const feed = [
      t({ id: "gammel", forfatter_id: "r1", spoergsmaal_markeret_at: "2026-10-01T07:30:00Z" }),
      t({ id: "ny", forfatter_id: "r2", spoergsmaal_markeret_at: "2026-10-02T07:30:00Z" }),
    ];
    const d = delFeed(feed, "m9");
    expect(d.spoergsmaal?.id).toBe("ny");
    expect(d.stroem.map((x) => x.id)).toEqual(["gammel"]);
  });

  it("foldet = læseren har svaret OG er ikke forfatteren; forfatteren ser altid udfoldet", () => {
    const q = t({ id: "q", forfatter_id: "r1", spoergsmaal_markeret_at: "2026-10-02T07:30:00Z", jeg_har_svaret: true });
    expect(delFeed([q], "m9").foldet).toBe(true);
    expect(delFeed([q], "r1").foldet).toBe(false);
    expect(delFeed([{ ...q, jeg_har_svaret: false }], "m9").foldet).toBe(false);
    expect(delFeed([{ ...q, jeg_har_svaret: undefined }], "m9").foldet).toBe(false);
    expect(delFeed([q], null).foldet).toBe(true);
  });
});

describe("erUbesvaret — regel 3", () => {
  it("et medlems aktive opslag uden svar er ubesvaret", () => {
    expect(erUbesvaret(t({ id: "a" }), RAADGIVERE)).toBe(true);
  });
  it("et opslag med ét svar er ikke", () => {
    expect(erUbesvaret(t({ id: "a", antal_svar: 1 }), RAADGIVERE)).toBe(false);
  });
  it("en rådgivers opslag er aldrig ubesvaret her", () => {
    expect(erUbesvaret(t({ id: "a", forfatter_id: "r1" }), RAADGIVERE)).toBe(false);
  });
  it("et skjult opslag er ikke", () => {
    expect(erUbesvaret(t({ id: "a", status: "skjult" }), RAADGIVERE)).toBe(false);
  });
  it("fail-soft: kendes ingen rådgivere, tæller alle opslag uden svar (hellere ét for mange end et medlems opslag skjult)", () => {
    expect(erUbesvaret(t({ id: "a", forfatter_id: "r1" }), new Set())).toBe(true);
  });
});

describe("filtrerStroem og taelUbesvarede", () => {
  const stroem = [t({ id: "a" }), t({ id: "b", antal_svar: 3 }), t({ id: "c", forfatter_id: "r1" }), t({ id: "d", status: "skjult" })];
  it("«alle» er strømmen uændret (en kopi)", () => {
    const ud = filtrerStroem(stroem, "alle", RAADGIVERE);
    expect(ud.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(ud).not.toBe(stroem);
  });
  it("«ubesvarede» er kun medlemmernes aktive opslag uden svar, i samme orden", () => {
    expect(filtrerStroem(stroem, "ubesvarede", RAADGIVERE).map((x) => x.id)).toEqual(["a"]);
    expect(taelUbesvarede(stroem, RAADGIVERE)).toBe(1);
  });
});

describe("raadgiverIdsAf", () => {
  it("is_advisor-rækkerne; tom mængde uden data", () => {
    expect([...raadgiverIdsAf([{ user_id: "r1", is_advisor: true }, { user_id: "m1", is_advisor: false }])]).toEqual(["r1"]);
    expect(raadgiverIdsAf(undefined).size).toBe(0);
    expect(raadgiverIdsAf(null).size).toBe(0);
  });
});

describe("ordene", () => {
  it("chippen bærer tallet kun over nul", () => {
    expect(ubesvaredeChipTekst(0)).toBe("Ubesvarede");
    expect(ubesvaredeChipTekst(3)).toBe("Ubesvarede (3)");
  });
  it("«N har svaret» tæller PERSONER (antal_svarere), ikke svar", () => {
    expect(harSvaretTekst({ antal_svar: 0, antal_svarere: 0 })).toBe("Ingen har svaret endnu");
    expect(harSvaretTekst({ antal_svar: 3, antal_svarere: 1 })).toBe("1 har svaret");
    expect(harSvaretTekst({ antal_svar: 9, antal_svarere: 6 })).toBe("6 har svaret");
    // Kun forfatterens egne svar: ingen ANDRE har svaret.
    expect(harSvaretTekst({ antal_svar: 2, antal_svarere: 0 })).toBe("Ingen har svaret endnu");
  });
  it("uden antal_svarere (før migrationen) siges «N svar» — aldrig «har svaret» af et svartal", () => {
    expect(harSvaretTekst({ antal_svar: 9 })).toBe("9 svar");
    expect(harSvaretTekst({ antal_svar: 1 })).toBe("1 svar");
    expect(harSvaretTekst({ antal_svar: 0 })).toBe("Ingen svar endnu");
  });
});

describe("visMarkerKnap — trådsiden", () => {
  it("kun rådgivere; eget opslag eller det markerede; kun aktivt", () => {
    expect(visMarkerKnap({ erRaadgiver: false, erForfatter: true, erMarkeret: true, status: "aktiv" })).toBe(false);
    expect(visMarkerKnap({ erRaadgiver: true, erForfatter: true, erMarkeret: false, status: "aktiv" })).toBe(true);
    expect(visMarkerKnap({ erRaadgiver: true, erForfatter: false, erMarkeret: true, status: "aktiv" })).toBe(true);
    expect(visMarkerKnap({ erRaadgiver: true, erForfatter: false, erMarkeret: false, status: "aktiv" })).toBe(false);
    expect(visMarkerKnap({ erRaadgiver: true, erForfatter: true, erMarkeret: false, status: "skjult" })).toBe(false);
  });
});
