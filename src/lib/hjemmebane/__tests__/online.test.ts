import { describe, expect, it } from "vitest";
import {
  INGEN_ONLINE_TEKST,
  LEGAT_MAERKE,
  ONLINE_FRISKE_FUNKTION,
  ONLINE_GENHENT_MS,
  ONLINE_HJERTESLAG_MS,
  ONLINE_LOFT,
  ONLINE_MIN_AFSTAND_MS,
  ONLINE_OVERSKRIFT,
  ONLINE_TABEL,
  ONLINE_VINDUE_S,
  onlineChatSti,
  onlineIds,
  onlineLinkEtiket,
  onlineMedlemmer,
  onlineOverskrift,
  onlineTitel,
  onlineUdsnit,
  skalSlaa,
  vinduetHolder,
  type OnlineDomInput,
} from "@/lib/hjemmebane/online";

/* «Online nu» (Jonas 16/9; hjerteslag 30/9): hjerteslagsrækker → personer,
   vinduets regnestykke, og dommen over hvem der vises. */

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const RAADGIVER = "99999999-9999-4999-8999-999999999999";

const dom = (over: Partial<OnlineDomInput> = {}): OnlineDomInput => ({
  ids: [U1],
  profiler: [{ user_id: U1, full_name: "Anna Andersen", avatar_url: "https://x/a.png" }],
  medlemskaber: [{ user_id: U1, company_id: "c1" }],
  virksomheder: [{ id: "c1", name: "Anna ApS", is_legat: false, er_kunde: true }],
  raadgiverIds: [RAADGIVER],
  ...over,
});

describe("onlineIds — hjerteslagsrækker til personer", () => {
  it("ingen rækker → ingen", () => {
    expect(onlineIds([])).toEqual([]);
    expect(onlineIds(null)).toEqual([]);
    expect(onlineIds(undefined)).toEqual([]);
  });
  it("samme bruger to gange → ét id", () => {
    expect(onlineIds([{ user_id: U1 }, { user_id: U1 }])).toEqual([U1]);
  });
  it("id'er der ikke er UUID'er (eller ikke strenge) vises aldrig som et medlem", () => {
    expect(onlineIds([{ user_id: "abc" }, { user_id: null }, { user_id: 7 }, { user_id: U2 }])).toEqual([U2]);
  });
  it("sorteret og unik", () => {
    expect(onlineIds([{ user_id: U3 }, { user_id: U1 }])).toEqual([U1, U3]);
  });
});

describe("vinduet — interval + mindste afstand < vinduet", () => {
  it("husets tal holder: 60 s + 20 s = 80 s < 150 s", () => {
    expect(ONLINE_HJERTESLAG_MS).toBe(60_000);
    expect(ONLINE_MIN_AFSTAND_MS).toBe(20_000);
    expect(ONLINE_VINDUE_S).toBe(150);
    expect(ONLINE_GENHENT_MS).toBe(30_000);
    expect(vinduetHolder({ hjerteslagMs: ONLINE_HJERTESLAG_MS, minAfstandMs: ONLINE_MIN_AFSTAND_MS, vindueS: ONLINE_VINDUE_S })).toBe(true);
  });
  it("genhentningen er kortere end vinduet (ellers står et gammelt svar længere end et medlem er online)", () => {
    expect(ONLINE_GENHENT_MS).toBeLessThan(ONLINE_VINDUE_S * 1000);
  });
  it("MUTATION: interval = vinduet fælder dommen", () => {
    expect(vinduetHolder({ hjerteslagMs: 150_000, minAfstandMs: 0, vindueS: 150 })).toBe(false);
  });
  it("MUTATION: interval + afstand = vinduet (ikke strengt mindre) fælder dommen", () => {
    expect(vinduetHolder({ hjerteslagMs: 130_000, minAfstandMs: 20_000, vindueS: 150 })).toBe(false);
    expect(vinduetHolder({ hjerteslagMs: 129_999, minAfstandMs: 20_000, vindueS: 150 })).toBe(true);
  });
  it("MUTATION: vinduet i sekunder læst som millisekunder fælder dommen", () => {
    expect(vinduetHolder({ hjerteslagMs: ONLINE_HJERTESLAG_MS, minAfstandMs: ONLINE_MIN_AFSTAND_MS, vindueS: ONLINE_VINDUE_S / 1000 })).toBe(false);
  });
  it("MUTATION: interval 0, negativ afstand eller afstand ≥ interval fælder dommen", () => {
    expect(vinduetHolder({ hjerteslagMs: 0, minAfstandMs: 0, vindueS: 150 })).toBe(false);
    expect(vinduetHolder({ hjerteslagMs: 60_000, minAfstandMs: -1, vindueS: 150 })).toBe(false);
    expect(vinduetHolder({ hjerteslagMs: 60_000, minAfstandMs: 60_000, vindueS: 150 })).toBe(false);
  });
});

describe("skalSlaa — hvornår medlemmet slår hjerteslag", () => {
  const NU = 1_000_000;
  it("første slag med synlig fane: ja", () => {
    expect(skalSlaa({ synlig: true, nuMs: NU, sidsteMs: null })).toBe(true);
  });
  it("skjult fane: aldrig — heller ikke det første", () => {
    expect(skalSlaa({ synlig: false, nuMs: NU, sidsteMs: null })).toBe(false);
    expect(skalSlaa({ synlig: false, nuMs: NU, sidsteMs: NU - 10 * ONLINE_HJERTESLAG_MS })).toBe(false);
  });
  it("forrige slag yngre end mindste afstand: nej; præcis mindste afstand: ja", () => {
    expect(skalSlaa({ synlig: true, nuMs: NU, sidsteMs: NU - ONLINE_MIN_AFSTAND_MS + 1 })).toBe(false);
    expect(skalSlaa({ synlig: true, nuMs: NU, sidsteMs: NU - ONLINE_MIN_AFSTAND_MS })).toBe(true);
  });
  it("intervallets slag (60 s efter) går altid igennem med synlig fane", () => {
    expect(skalSlaa({ synlig: true, nuMs: NU, sidsteMs: NU - ONLINE_HJERTESLAG_MS })).toBe(true);
  });
});

describe("onlineMedlemmer — hvem vises", () => {
  it("et kunde-medlem med profil: navn, billede, virksomhed, ikke legat", () => {
    expect(onlineMedlemmer(dom())).toEqual([{ user_id: U1, navn: "Anna Andersen", avatar_url: "https://x/a.png", virksomhed: "Anna ApS", company_id: "c1", legat: false }]);
  });
  it("rådgivere vises ikke — også selv om de er medlemmer af en virksomhed", () => {
    const r = onlineMedlemmer(dom({ ids: [U1, RAADGIVER], medlemskaber: [{ user_id: U1, company_id: "c1" }, { user_id: RAADGIVER, company_id: "c1" }] }));
    expect(r.map((m) => m.user_id)).toEqual([U1]);
  });
  it("ikke-kunder (er_kunde false — vores egen virksomhed) vises ikke; er_kunde null er kunde (fail-open)", () => {
    expect(onlineMedlemmer(dom({ virksomheder: [{ id: "c1", name: "Topix.dk ApS", is_legat: false, er_kunde: false }] }))).toEqual([]);
    expect(onlineMedlemmer(dom({ virksomheder: [{ id: "c1", name: "Uden felt", is_legat: false, er_kunde: null }] }))[0]?.virksomhed).toBe("Uden felt");
  });
  it("legat vises — mærket", () => {
    const r = onlineMedlemmer(dom({ virksomheder: [{ id: "c1", name: "Legat IVS", is_legat: true, er_kunde: true }] }));
    expect(r[0]).toMatchObject({ legat: true, virksomhed: "Legat IVS" });
    expect(onlineTitel(r[0])).toBe(`Anna Andersen · ${LEGAT_MAERKE}`);
  });
  it("uden virksomhed vises med virksomhed null; uden profil med navn null", () => {
    const r = onlineMedlemmer(dom({ ids: [U2], profiler: [], medlemskaber: [] }));
    expect(r).toEqual([{ user_id: U2, navn: null, avatar_url: null, virksomhed: null, company_id: null, legat: false }]);
    expect(onlineTitel(r[0])).toBe("Medlem");
  });
  it("medlem af to virksomheder: første kunde-virksomhed tæller; en ikke-kunde ved siden af udelukker ikke", () => {
    const r = onlineMedlemmer(dom({
      medlemskaber: [{ user_id: U1, company_id: "egen" }, { user_id: U1, company_id: "c1" }],
      virksomheder: [{ id: "egen", name: "Topix.dk ApS", is_legat: false, er_kunde: false }, { id: "c1", name: "Anna ApS", is_legat: false, er_kunde: true }],
    }));
    expect(r[0]?.virksomhed).toBe("Anna ApS");
  });
  it("tomt navn og tom avatar_url bliver null", () => {
    const r = onlineMedlemmer(dom({ profiler: [{ user_id: U1, full_name: "  ", avatar_url: "" }] }));
    expect(r[0]).toMatchObject({ navn: null, avatar_url: null });
  });
  it("sorteret på navn (dansk), ukendte navne sidst", () => {
    const r = onlineMedlemmer(dom({
      ids: [U3, U2, U1],
      profiler: [{ user_id: U1, full_name: "Ørsted", avatar_url: null }, { user_id: U2, full_name: "Anna", avatar_url: null }],
      medlemskaber: [],
    }));
    expect(r.map((m) => m.navn)).toEqual([null, "Anna", "Ørsted"]);
  });
  it("dubletter i ids giver én person", () => {
    expect(onlineMedlemmer(dom({ ids: [U1, U1] }))).toHaveLength(1);
  });
});

describe("ordene og udsnittet", () => {
  it("tabel, funktion, overskrift og tom tekst", () => {
    expect(ONLINE_TABEL).toBe("online_hjerteslag");
    expect(ONLINE_FRISKE_FUNKTION).toBe("online_hjerteslag_friske");
    expect(ONLINE_OVERSKRIFT).toBe("Online nu");
    expect(INGEN_ONLINE_TEKST).toBe("Ingen medlemmer online lige nu.");
    expect(onlineOverskrift(0)).toBe("Online nu");
    expect(onlineOverskrift(3)).toBe("Online nu · 3");
  });
  it("udsnit: højst ONLINE_LOFT, resten er «flere»", () => {
    const liste = Array.from({ length: 15 }, (_, i) => i);
    expect(ONLINE_LOFT).toBe(12);
    expect(onlineUdsnit(liste)).toEqual({ viste: liste.slice(0, 12), flere: 3 });
    expect(onlineUdsnit([1, 2])).toEqual({ viste: [1, 2], flere: 0 });
  });
});

describe("klikbare billeder (Jonas 1/10) — vejen til medlemmets chat", () => {
  it("hver online med virksomhed får /chat?companyId=<første kunde-virksomhed> — samme vej som klokken", () => {
    const r = onlineMedlemmer(dom({
      medlemskaber: [{ user_id: U1, company_id: "egen" }, { user_id: U1, company_id: "c1" }],
      virksomheder: [{ id: "egen", name: "Topix.dk ApS", is_legat: false, er_kunde: false }, { id: "c1", name: "Anna ApS", is_legat: false, er_kunde: true }],
    }));
    expect(r.map(onlineChatSti)).toEqual(["/chat?companyId=c1"]);
  });
  it("uden virksomhed: ingen samtale at pege på → null (billedet står uden link)", () => {
    const r = onlineMedlemmer(dom({ ids: [U2], profiler: [], medlemskaber: [] }));
    expect(onlineChatSti(r[0])).toBeNull();
  });
  it("linkets navn: «Skriv til {navn} ({virksomhed}) — online nu»", () => {
    const [m] = onlineMedlemmer(dom());
    expect(onlineLinkEtiket(m)).toBe("Skriv til Anna Andersen (Anna ApS) — online nu");
    expect(onlineLinkEtiket({ navn: null, virksomhed: null })).toBe("Skriv til Medlem — online nu");
  });
});
