import { describe, expect, it } from "vitest";
import {
  HAENDELSER,
  beskrivBrowser,
  formaterDanskTid,
  haendelseTekst,
  sporLinje,
  sporTilLinjer,
  type Sporraekke,
} from "@/lib/revisionsspor";

// Revisionssporet skal kunne læses af et menneske (Jonas 18/9, punkt 2) —
// og tidspunktet skal ALTID bære tidszonen.

describe("formaterDanskTid — dansk tid med UTC-offset", () => {
  it("sommertid: UTC+02:00", () => {
    expect(formaterDanskTid("2026-09-18T12:03:12.000Z")).toBe("18. september 2026 kl. 14:03:12 (dansk tid, UTC+02:00)");
  });
  it("vintertid: UTC+01:00", () => {
    expect(formaterDanskTid("2026-12-01T23:30:00.000Z")).toBe("2. december 2026 kl. 00:30:00 (dansk tid, UTC+01:00)");
  });
  it("ulæseligt: «ukendt tidspunkt», aldrig et gæt", () => {
    expect(formaterDanskTid("hest")).toBe("ukendt tidspunkt");
  });
  it("en anden zone navngives og får sit eget offset", () => {
    expect(formaterDanskTid("2026-09-18T12:00:00.000Z", "UTC")).toBe("18. september 2026 kl. 12:00:00 (UTC, UTC+00:00)");
  });
});

describe("beskrivBrowser — groft, læseligt", () => {
  it("Safari på iPhone, Chrome på Mac, Firefox på Windows, Edge, ukendt", () => {
    expect(beskrivBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari på iPhone");
    expect(beskrivBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36")).toBe("Chrome på Mac");
    expect(beskrivBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox på Windows");
    expect(beskrivBrowser("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0")).toBe("Edge på Windows");
    expect(beskrivBrowser(null)).toBe("ukendt browser");
    expect(beskrivBrowser("curl/8.4")).toBe("ukendt browser");
  });
});

describe("haendelseTekst — hver hændelse har en sætning", () => {
  it("alle hændelser giver ikke-tom tekst", () => {
    for (const h of HAENDELSER) expect(haendelseTekst(h, null).length).toBeGreaterThan(5);
  });
  it("underskrevet bærer navn, de tre handlinger og aftrykket", () => {
    const t = haendelseTekst("underskrevet", { navn: "Lisbeth Hansen", aftryk: "abc123" });
    expect(t).toContain("Lisbeth Hansen");
    expect(t).toContain("navn skrevet");
    expect(t).toContain("krydset af");
    expect(t).toContain("kode fra mailen tastet");
    expect(t).toContain("abc123");
  });
  it("forkert kode nævner forsøg tilbage", () => {
    expect(haendelseTekst("kode_forkert", { forsoeg_tilbage: 3 })).toBe("Forkert kode tastet (3 forsøg tilbage)");
  });
});

describe("sporLinje og sporTilLinjer", () => {
  const r = (tidspunkt: string, haendelse: Sporraekke["haendelse"], ip: string | null = "85.1.2.3"): Sporraekke => ({
    tidspunkt, haendelse, ip, user_agent: "Mozilla/5.0 (iPhone) Safari/604.1", detaljer: null,
  });
  it("én linje: tid — hvad · fra IP · browser", () => {
    expect(sporLinje(r("2026-09-18T12:00:00.000Z", "link_aabnet"))).toBe(
      "18. september 2026 kl. 14:00:00 (dansk tid, UTC+02:00) — Linket åbnet, aftalegrundlaget vist · fra 85.1.2.3 · Safari på iPhone",
    );
  });
  it("uden IP og browser: kun tid og hændelse", () => {
    const linje = sporLinje({ ...r("2026-09-18T12:00:00.000Z", "link_sendt", null), user_agent: null, detaljer: { til: "a@b.dk" } });
    expect(linje).toBe("18. september 2026 kl. 14:00:00 (dansk tid, UTC+02:00) — Link til aftalegrundlaget sendt til a@b.dk");
  });
  it("sorteres i tidsorden, stabilt ved ens tidspunkt", () => {
    const linjer = sporTilLinjer([
      r("2026-09-18T12:05:00.000Z", "kode_sendt"),
      r("2026-09-18T12:00:00.000Z", "link_aabnet"),
      r("2026-09-18T12:05:00.000Z", "kode_forkert"),
    ]);
    expect(linjer.map((l) => l.split(" — ")[1].split(" · ")[0])).toEqual([
      "Linket åbnet, aftalegrundlaget vist",
      "Engangskode sendt",
      "Forkert kode tastet",
    ]);
  });
});
