import { describe, expect, it } from "vitest";
import { bekraeftOrd, dageMedTider, dagOrd, samtaleOrd, startDag, tidOrd } from "@/lib/ansoegning/samtaleValg";

describe("samtaleValg — tidsvælgerens ord", () => {
  it("tider og dage i dansk tid, med husets punktum", () => {
    expect(tidOrd("2026-09-21T07:00:00.000Z")).toBe("09.00");
    expect(tidOrd("2026-11-02T08:30:00.000Z")).toBe("09.30"); // vintertid
    expect(dagOrd("2026-09-21")).toBe("mandag 21. september");
    expect(samtaleOrd("2026-09-21T07:00:00.000Z")).toBe("mandag den 21. september kl. 09.00");
    expect(samtaleOrd(null)).toBe("");
    expect(samtaleOrd("x")).toBe("");
  });
  it("dageMedTider grupperer pr. dansk dato i rækkefølge", () => {
    const d = dageMedTider(["2026-09-22T07:00:00.000Z", "2026-09-21T07:30:00.000Z", "2026-09-21T07:00:00.000Z"]);
    expect(d.map((x) => x.label)).toEqual(["mandag 21. september", "tirsdag 22. september"]);
    expect(d[0].tider.map((t) => t.tid)).toEqual(["09.00", "09.30"]);
    expect(startDag(d, null)).toBe("2026-09-21");
    expect(startDag(d, "2026-09-22T07:00:00.000Z")).toBe("2026-09-22");
    expect(startDag([], null)).toBeNull();
  });
  it("bekræftknappen siger hvad der sker", () => {
    expect(bekraeftOrd("book", null)).toBe("Vælg et tidspunkt");
    expect(bekraeftOrd("flyt", null)).toBe("Vælg en ny tid");
    expect(bekraeftOrd("book", "2026-09-21T07:00:00.000Z")).toBe("Book mandag den 21. september kl. 09.00");
    expect(bekraeftOrd("flyt", "2026-09-21T07:00:00.000Z")).toBe("Flyt til mandag den 21. september kl. 09.00");
  });
});
