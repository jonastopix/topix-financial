import { describe, expect, it } from "vitest";
import {
  erUbesvaret,
  iRummetSiden,
  KONSOL_POLL_MS,
  KONSOL_SVAR_MAKS,
  konsolFejlArt,
  konsolPosition,
  konsolSti,
  laesSvar,
  leveringTekst,
  nulRaekkerGrund,
  posTekst,
  sorterKoe,
} from "@/lib/webinarMotorAdmin/konsol";
import { I_RUMMET_SEK } from "@/lib/webinarMotor/puls";
import { positionDom } from "@/lib/webinarMotor/ur";

describe("konsol — sortering", () => {
  it("nyeste øverst; samme tidspunkt sorteres stabilt på id", () => {
    const ud = sorterKoe([
      { id: "b", stillet_at: "2026-11-03T10:05:00Z" },
      { id: "a", stillet_at: "2026-11-03T10:07:00Z" },
      { id: "d", stillet_at: "2026-11-03T10:05:00Z" },
      { id: "c", stillet_at: "2026-11-03T10:05:00Z" },
    ]);
    expect(ud.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("ændrer ikke inputtet", () => {
    const ind = [{ id: "x", stillet_at: "2026-11-03T10:00:00Z" }, { id: "y", stillet_at: "2026-11-03T10:01:00Z" }];
    sorterKoe(ind);
    expect(ind[0].id).toBe("x");
  });
});

describe("konsol — ubesvaret", () => {
  it("kun status «ny» er ubesvaret", () => {
    expect(erUbesvaret({ status: "ny" })).toBe(true);
    for (const s of ["besvaret", "afvist", "auto"]) expect(erUbesvaret({ status: s })).toBe(false);
  });
});

describe("konsol — svarets validering (trim, 1–1000)", () => {
  it("trimmer", () => expect(laesSvar("  Hej Anne  ")).toEqual({ ok: true, svar: "Hej Anne" }));
  it("tom og kun mellemrum afvises", () => {
    expect(laesSvar("")).toEqual({ ok: false, fejl: "tom" });
    expect(laesSvar("   \n ")).toEqual({ ok: false, fejl: "tom" });
    expect(laesSvar(null)).toEqual({ ok: false, fejl: "tom" });
  });
  it("præcis 1000 tegn efter trim er ok; 1001 afvises", () => {
    expect(KONSOL_SVAR_MAKS).toBe(1000);
    expect(laesSvar(` ${"a".repeat(1000)} `).ok).toBe(true);
    expect(laesSvar("a".repeat(1001))).toEqual({ ok: false, fejl: "for_lang" });
  });
  it("ét tegn er ok", () => expect(laesSvar("a")).toEqual({ ok: true, svar: "a" }));
});

describe("konsol — tekster og stier", () => {
  it("positionen: null = før start, ellers tidskoden", () => {
    expect(posTekst(null)).toBe("før start");
    expect(posTekst(125.5)).toBe("2:05");
  });
  it("leveringen siger aldrig, at et svar går på mail, når det ikke er sket", () => {
    expect(leveringTekst({ status: "ny", leveret: null, leveret_at: null })).toBe("Ubesvaret");
    expect(leveringTekst({ status: "besvaret", leveret: null, leveret_at: null })).not.toMatch(/mail/i);
    expect(leveringTekst({ status: "besvaret", leveret: "live", leveret_at: "2026-11-03T10:12:00Z" })).toBe("Set i rummet kl. 11.12");
  });
  it("konsollens sti", () => expect(konsolSti("abc")).toBe("/webinar/motor/session/abc"));
  it("køen hentes hvert 10. sekund", () => expect(KONSOL_POLL_MS).toBe(10_000));
});

describe("konsol — serverens ur", () => {
  const ur = { starterMs: Date.parse("2026-11-03T10:00:00Z"), varighedSek: 3600, introSek: 0, lobbyMin: 15, exitrumMin: 15, status: "planlagt" };
  it("positionDom på klientens ur + forskydningen", () => {
    const klient = Date.parse("2026-11-03T09:59:50Z");
    expect(konsolPosition(ur, klient, 0).rum).toBe("lobby");
    expect(konsolPosition(ur, klient, 20_000)).toEqual(positionDom(ur, klient + 20_000));
    expect(konsolPosition(ur, klient, 20_000).rum).toBe("afspilning");
  });
  it("«i rummet» = puls inden for pulsens eget vindue", () => {
    const nu = Date.parse("2026-11-03T10:10:00Z");
    expect(iRummetSiden(nu)).toBe(new Date(nu - I_RUMMET_SEK * 1000).toISOString());
  });
});

describe("konsol — fejl og 0 rækker", () => {
  it("manglende tabel/kolonne = migration; alt andet = fejl", () => {
    for (const code of ["PGRST205", "42P01", "42703", "PGRST204"]) expect(konsolFejlArt({ code })).toBe("migration");
    expect(konsolFejlArt({ code: "42501" })).toBe("fejl");
    expect(konsolFejlArt(null)).toBe("fejl");
  });
  it("0 rækker: står den stadig «ny», mangler retten (migrationen); ellers svarede en anden", () => {
    expect(nulRaekkerGrund("ny")).toBe("kraever_migration");
    expect(nulRaekkerGrund("besvaret")).toBe("besvaret_imens");
    expect(nulRaekkerGrund(null)).toBe("forsvundet");
  });
});
