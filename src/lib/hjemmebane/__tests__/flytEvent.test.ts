import { describe, expect, it } from "vitest";
import { erTidsaendring, flytSvarTekst, gemKnapTekst, planlaegGem } from "@/lib/hjemmebane/flytEvent";

/* «Gem» på et event (udkast 18/9): tiden på et PUBLICERET event går gennem
   flyt-event (besked til de tilmeldte); resten, kladder og aflyste gemmes som
   før. Dommen er ren. */

const gemt = { status: "published", starts_at: "2026-10-01T08:00:00.000Z", ends_at: "2026-10-01T09:00:00.000Z" };

describe("erTidsaendring", () => {
  it("samme tidspunkt i anden skrivemåde er IKKE en ændring", () => {
    expect(erTidsaendring(gemt, { starts_at: "2026-10-01T10:00:00+02:00" })).toBe(false);
  });
  it("ny start eller ny slut er en ændring; fjernet slut (null) også", () => {
    expect(erTidsaendring(gemt, { starts_at: "2026-10-02T08:00:00.000Z" })).toBe(true);
    expect(erTidsaendring(gemt, { ends_at: "2026-10-01T10:00:00.000Z" })).toBe(true);
    expect(erTidsaendring(gemt, { ends_at: null })).toBe(true);
  });
  it("titel alene er ingen ændring af tiden", () => {
    expect(erTidsaendring(gemt, { title: "Ny titel" })).toBe(false);
  });
});

describe("planlaegGem — hvad går hvor", () => {
  it("publiceret + ny start: flytningen bærer starten, resten er tom", () => {
    expect(planlaegGem(gemt, { starts_at: "2026-10-02T08:00:00.000Z" })).toEqual({
      flytning: { starts_at: "2026-10-02T08:00:00.000Z" },
      rest: {},
    });
  });
  it("publiceret + ny slut alene: flytningen bærer den GEMTE start og den nye slut", () => {
    expect(planlaegGem(gemt, { ends_at: "2026-10-01T10:00:00.000Z" })).toEqual({
      flytning: { starts_at: gemt.starts_at, ends_at: "2026-10-01T10:00:00.000Z" },
      rest: {},
    });
  });
  it("publiceret + tid OG titel: titlen i resten, tiden i flytningen", () => {
    expect(planlaegGem(gemt, { title: "T", starts_at: "2026-10-02T08:00:00.000Z", capacity: 20 })).toEqual({
      flytning: { starts_at: "2026-10-02T08:00:00.000Z" },
      rest: { title: "T", capacity: 20 },
    });
  });
  it("kladde med ny tid: ingen flytning, hele patchen i resten (ingen tilmeldte at underrette)", () => {
    expect(planlaegGem({ ...gemt, status: "draft" }, { starts_at: "2026-10-02T08:00:00.000Z" })).toEqual({
      flytning: null,
      rest: { starts_at: "2026-10-02T08:00:00.000Z" },
    });
  });
  it("aflyst/afholdt med ny tid: som kladde", () => {
    for (const status of ["cancelled", "completed"]) {
      expect(planlaegGem({ ...gemt, status }, { starts_at: "2026-10-02T08:00:00.000Z" }).flytning).toBeNull();
    }
  });
  it("publiceret, tiden gentaget uændret: ingen flytning, patchen urørt", () => {
    expect(planlaegGem(gemt, { starts_at: gemt.starts_at, title: "T" })).toEqual({ flytning: null, rest: { starts_at: gemt.starts_at, title: "T" } });
  });
  it("tom patch: tom rest, ingen flytning", () => {
    expect(planlaegGem(gemt, {})).toEqual({ flytning: null, rest: {} });
  });
});

describe("gemKnapTekst (21/9: tæller de tilmeldte OG de andre med adgang)", () => {
  const flyt = { flytning: { starts_at: "x" }, rest: {} };
  it("uden flytning: «Gem» — uanset tal", () => {
    expect(gemKnapTekst({ flytning: null, rest: {} }, 5, 3)).toBe("Gem");
  });
  it("med flytning: begge grupper nævnes, ental/flertal hver for sig", () => {
    expect(gemKnapTekst(flyt, 1, 1)).toBe("Gem — 1 tilmeldt og 1 anden får besked om den nye tid");
    expect(gemKnapTekst(flyt, 7, 12)).toBe("Gem — 7 tilmeldte og 12 andre får besked om den nye tid");
    expect(gemKnapTekst(flyt, 0, 4)).toBe("Gem — 0 tilmeldte og 4 andre får besked om den nye tid");
    expect(gemKnapTekst(flyt, 3, 0)).toBe("Gem — 3 tilmeldte og 0 andre får besked om den nye tid");
  });
  it("ingen med adgang overhovedet: «Gem — den nye tid»", () => {
    expect(gemKnapTekst(flyt, 0, 0)).toBe("Gem — den nye tid");
  });
});

describe("flytSvarTekst — beviset på skærmen (21/9): kun den nye function kan levere tallene", () => {
  it("publiceret, svaret har notified_grupper → «Flyttet — … fik besked om den nye tid»", () => {
    expect(flytSvarTekst({ ok: true, moved: true, recipients: 26, grupper: { tilmeldte: 7, andre: 19 }, notified: 26, notified_grupper: { tilmeldte: 7, andre: 19 } }))
      .toBe("Flyttet — 7 tilmeldte og 19 andre fik besked om den nye tid");
    expect(flytSvarTekst({ ok: true, moved: true, notified_grupper: { tilmeldte: 1, andre: 1 } }))
      .toBe("Flyttet — 1 tilmeldt og 1 anden fik besked om den nye tid");
    expect(flytSvarTekst({ ok: true, moved: true, notified_grupper: { tilmeldte: 0, andre: 0 } }))
      .toBe("Flyttet — 0 tilmeldte og 0 andre fik besked om den nye tid");
  });
  it("kladde, svaret har grupper (ingen notified_grupper) → «Flyttet — kladde, ingen besked (… får besked, når den er publiceret og flyttes)»", () => {
    expect(flytSvarTekst({ ok: true, moved: true, notified: 0, status: "draft", grupper: { tilmeldte: 7, andre: 18 } }))
      .toBe("Flyttet — kladde, ingen besked (7 tilmeldte og 18 andre får besked, når den er publiceret og flyttes)");
    expect(flytSvarTekst({ ok: true, moved: true, notified: 0, status: "draft", grupper: { tilmeldte: 1, andre: 1 } }))
      .toBe("Flyttet — kladde, ingen besked (1 tilmeldt og 1 anden får besked, når den er publiceret og flyttes)");
  });
  it("svaret UDEN grupper (den gamle function) → «Flyttet» og intet andet", () => {
    expect(flytSvarTekst({ ok: true, moved: true, recipients: 7, notified: 7 })).toBe("Flyttet");
    expect(flytSvarTekst({ ok: true, moved: true, notified: 0, status: "draft" })).toBe("Flyttet");
  });
  it("notify_error → eventet er flyttet, men beskederne gik ikke — også når tallene findes", () => {
    const t = flytSvarTekst({ ok: true, moved: true, grupper: { tilmeldte: 7, andre: 19 }, notified: 0, notified_grupper: { tilmeldte: 0, andre: 0 }, notify_error: "insert failed" });
    expect(t).toBe("Flyttet — men beskederne gik ikke: insert failed");
    expect(t).toContain("Flyttet");
    expect(t).not.toContain("fik besked");
  });
  it("ingen flytning (null/undefined) eller uændret tid → null: den almindelige «Gemt · tid»", () => {
    expect(flytSvarTekst(null)).toBeNull();
    expect(flytSvarTekst(undefined)).toBeNull();
    expect(flytSvarTekst({ ok: true, unchanged: true, notified: 0 })).toBeNull();
  });
});
