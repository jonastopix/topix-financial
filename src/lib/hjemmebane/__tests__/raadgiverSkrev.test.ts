import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  UDDRAG_LOFT,
  bannerTitel,
  beskedUddrag,
  erKandidat,
  samtaleFilter,
  skalViseBanner,
  staarIChatten,
  type NyBesked,
} from "@/lib/hjemmebane/raadgiverSkrev";

/* «En rådgiver har lige skrevet til dig» (Jonas 1/10): dommen «skal vises?»
   som ren funktion, uddraget, og et kildeværn for, at lytningen aldrig
   markerer læst eller skriver. */

const MIG = "11111111-1111-4111-8111-111111111111";
const RAADGIVER = "99999999-9999-4999-8999-999999999999";
const KOLLEGA = "22222222-2222-4222-8222-222222222222";

const besked = (over: Partial<NyBesked> = {}): NyBesked => ({ id: "m1", sender_id: RAADGIVER, message_type: "user", content: "<p>Hej Anna</p>", ...over });
const vis = (o: { b?: Partial<NyBesked>; raadgiver?: boolean | null; sti?: string } = {}) =>
  skalViseBanner({ besked: besked(o.b), egenId: MIG, afsenderErRaadgiver: o.raadgiver === undefined ? true : o.raadgiver, sti: o.sti ?? "/" });

describe("skalViseBanner — dommen", () => {
  it("rådgiverens besked, medlemmet står ikke i chatten → vises", () => {
    expect(vis()).toBe(true);
    expect(vis({ sti: "/reports" })).toBe(true);
  });
  it("står medlemmet i chatten → intet banner", () => {
    expect(vis({ sti: "/chat" })).toBe(false);
    expect(vis({ sti: "/chat/" })).toBe(false);
    expect(staarIChatten("/chatten-er-ikke-her")).toBe(false);
  });
  it("egen besked → intet banner, uanset rolle", () => {
    expect(vis({ b: { sender_id: MIG } })).toBe(false);
    expect(erKandidat(besked({ sender_id: MIG }), MIG)).toBe(false);
  });
  it("et andet medlem (kollega i samme virksomhed) → intet banner", () => {
    expect(vis({ b: { sender_id: KOLLEGA }, raadgiver: false })).toBe(false);
  });
  it("ukendt afsender (opslaget gav intet) → intet banner (fail-closed)", () => {
    expect(vis({ raadgiver: null })).toBe(false);
  });
  it("system- og AI-beskeder → intet banner, også fra en rådgiver-id", () => {
    expect(vis({ b: { message_type: "system" } })).toBe(false);
    expect(vis({ b: { message_type: "ai" } })).toBe(false);
    expect(vis({ b: { message_type: null } })).toBe(false);
    expect(erKandidat(besked({ message_type: "system" }), MIG)).toBe(false);
  });
});

describe("uddrag og titel", () => {
  it("ren tekst af HTML", () => {
    expect(beskedUddrag("<p>Hej <strong>Anna</strong>&nbsp;—</p><p>tak</p>")).toBe("Hej Anna — tak");
  });
  it(`højst ${UDDRAG_LOFT} tegn, «…» medregnet`, () => {
    const u = beskedUddrag(`<p>${"a".repeat(200)}</p>`);
    expect(u.length).toBe(UDDRAG_LOFT);
    expect(u.endsWith("…")).toBe(true);
    expect(beskedUddrag("a".repeat(UDDRAG_LOFT))).toBe("a".repeat(UDDRAG_LOFT));
  });
  it("tom besked → tomt uddrag", () => {
    expect(beskedUddrag(null)).toBe("");
    expect(beskedUddrag("<p></p>")).toBe("");
  });
  it("titlen: «{navn} har lige skrevet til dig», ellers «Din rådgiver»", () => {
    expect(bannerTitel("Jonas Herlev")).toBe("Jonas Herlev har lige skrevet til dig");
    expect(bannerTitel("  ")).toBe("Din rådgiver har lige skrevet til dig");
    expect(bannerTitel(null)).toBe("Din rådgiver har lige skrevet til dig");
  });
});

describe("samtaleFilter", () => {
  it("medlemmets samtaler → conversation_id=in.(…), sorteret og unik; ingen → null (ingen lytning)", () => {
    expect(samtaleFilter([KOLLEGA, MIG, MIG])).toBe(`conversation_id=in.(${MIG},${KOLLEGA})`);
    expect(samtaleFilter([])).toBeNull();
    expect(samtaleFilter(["ikke-et-id"])).toBeNull();
  });
});

describe("kildeværn — lytningen markerer intet og skriver intet", () => {
  const ROD = process.cwd();
  const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const hook = udenKommentarer(readFileSync(resolve(ROD, "src/hooks/raadgiverSkrev.ts"), "utf8"));
  const skal = udenKommentarer(readFileSync(resolve(ROD, "src/components/hjemmebane/HbMemberShell.tsx"), "utf8"));
  const banner = udenKommentarer(readFileSync(resolve(ROD, "src/components/hjemmebane/HbRaadgiverSkrev.tsx"), "utf8"));
  it("ingen mark_messages_read, read_at, insert/update/upsert/delete i hook og banner", () => {
    for (const k of [hook, banner]) {
      expect(k).not.toMatch(/mark_messages_read|read_at|seen_at|\.insert\(|\.update\(|\.upsert\(|\.delete\(|notifications/);
    }
  });
  it("lytter på INSERT i messages med samtalefilteret, og dommen afgør", () => {
    expect(hook).toMatch(/event: "INSERT", schema: "public", table: "messages", filter/);
    expect(hook).toContain("skalViseBanner(");
    expect(hook).toContain("supabase.removeChannel(kanal)");
  });
  it("skallen gater på RÅ isAdvisor (som hjerteslaget) — hooken før return", () => {
    expect(skal).toContain("useRaadgiverSkrev(!!user && !isAdvisor, user?.id, location.pathname);");
    expect(skal.indexOf("useRaadgiverSkrev(")).toBeLessThan(skal.indexOf("\n  return ("));
    expect(skal).not.toMatch(/viewingAsMember/);
  });
});
