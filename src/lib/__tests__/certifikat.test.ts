/**
 * «Dit certifikat» — dommen (29/9-2026, HANDOFF §3, §10, §11).
 *
 * Tiden gives ind som `nu` (UTC-instanter, så prøven er den samme i enhver
 * tidszone: 10:00Z = 12:00 dansk sommertid). Datoerne er HANDOFF §11's ORDRET:
 * start 22.10.2025 set 29.9.2026 → låst, «Åbner 15. oktober 2026», «klar om
 * 16 dage»; start 6.10.2025 → åben, perioden «oktober 2025 – oktober 2026».
 */
import { describe, expect, it } from "vitest";
import { certifikatDom, certifikatMenu, laesDanskDato, type CertifikatDom } from "@/lib/certifikat/dom";
import { skrivHentning, taelHentninger, HENTNINGER_TABEL, type HentningsKlient } from "@/lib/certifikat/hentninger";
import { formatDay } from "@/components/hjemmebane/certifikat/format";

/** 29. september 2026 kl. 12:00 dansk tid (CEST = UTC+2). */
const NU = new Date("2026-09-29T10:00:00Z");
const FULD = { isAdvisor: false, membershipTier: "full" as const, eligible: true };

const synlig = (dom: CertifikatDom) => {
  if (dom.synlig === false) throw new Error(`skjult: ${dom.grund}`);
  return dom.status;
};

describe("laesDanskDato — DATE-strengen læses som dansk kalenderdag, aldrig som UTC-midnat", () => {
  it("«2025-10-22» er 22. oktober 2025 lokalt — samme tal som new Date(2025, 9, 22)", () => {
    const d = laesDanskDato("2025-10-22")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2025, 9, 22, 0]);
    expect(d.getTime()).toBe(new Date(2025, 9, 22).getTime());
  });
  it("er IKKE new Date(«2025-10-22»): den er UTC-midnat og kan vise 21. i en anden tidszone", () => {
    // I en tidszone vest for UTC giver den rå parsing 21. — vores læsning gør det aldrig.
    const raa = new Date("2025-10-22");
    expect(raa.getUTCDate()).toBe(22);
    expect(laesDanskDato("2025-10-22")!.getDate()).toBe(22);
    // Dagen er den samme uanset offset: prøven regner selv, hvad UTC-midnat bliver lokalt.
    const lokalOffsetMin = new Date(2025, 9, 22).getTimezoneOffset();
    if (lokalOffsetMin > 0) expect(raa.getDate()).toBe(21);
  });
  it("afviser tomt, null, tidsstempler og umulige datoer", () => {
    for (const s of ["", "   ", null, undefined, "2025-10-22T00:00:00+00:00", "2025-10", "22-10-2025", "2025-13-01", "2025-00-10", "2025-02-31", "2025-04-31", "abc"]) {
      expect(laesDanskDato(s)).toBeNull();
    }
  });
  it("skudår: 29. februar 2024 findes, 29. februar 2025 gør ikke", () => {
    expect(laesDanskDato("2024-02-29")!.getDate()).toBe(29);
    expect(laesDanskDato("2025-02-29")).toBeNull();
  });
});

describe("certifikatDom — HANDOFF §11's datoer, ordret", () => {
  it("start 22.10.2025, set 29.9.2026: LÅST — «Åbner 15. oktober 2026», «klar om 16 dage»", () => {
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2025-10-22" }, NU));
    expect(s.state).toBe("locked");
    expect(formatDay(s.unlockDate)).toBe("15. oktober 2026");
    expect(s.daysUntilUnlock).toBe(16);
    expect(formatDay(s.twelveMonthDate)).toBe("22. oktober 2026");
    expect(s.currentMonth).toBe(12);
    expect(s.period).toBe("oktober 2025 – oktober 2026");
  });
  it("start 6.10.2025, set 29.9.2026: ÅBEN — perioden «oktober 2025 – oktober 2026», 0 dage", () => {
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2025-10-06" }, NU));
    expect(s.state).toBe("open");
    expect(s.period).toBe("oktober 2025 – oktober 2026");
    expect(s.daysUntilUnlock).toBe(0);
    expect(formatDay(s.unlockDate)).toBe("29. september 2026");
  });
  it("åbent forbliver åbent efter 12-månedersdatoen (medlemmet kan hente igen)", () => {
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2024-10-06" }, NU));
    expect(s.state).toBe("open");
    expect(s.progress).toBe(1);
    expect(s.currentMonth).toBe(12);
  });
});

describe("certifikatDom — dansk midnat afgør dagen, ikke UTC", () => {
  // Start 22.10.2025 → åbner 15.10.2026. 14/10 kl. 23:59 dansk = 21:59Z; 15/10 kl. 00:00 dansk = 22:00Z.
  it("kl. 23:59 dansk den 14. oktober: stadig låst, 1 dag", () => {
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2025-10-22" }, new Date("2026-10-14T21:59:00Z")));
    expect(s.state).toBe("locked");
    expect(s.daysUntilUnlock).toBe(1);
  });
  it("kl. 00:00 dansk den 15. oktober: åben — selv om det stadig er den 14. i UTC", () => {
    const nu = new Date("2026-10-14T22:00:00Z");
    expect(nu.getUTCDate()).toBe(14);
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2025-10-22" }, nu));
    expect(s.state).toBe("open");
    expect(s.daysUntilUnlock).toBe(0);
  });
});

describe("certifikatDom — månedens sidste dage (29., 30., 31.)", () => {
  it("31. januar 2025 + 12 måneder = 31. januar 2026; åbner 24. januar", () => {
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2025-01-31" }, NU));
    expect(formatDay(s.twelveMonthDate)).toBe("31. januar 2026");
    expect(formatDay(s.unlockDate)).toBe("24. januar 2026");
  });
  it("29. februar 2024 + 12 måneder = 28. februar 2025 (dagen holdes inden for måneden)", () => {
    const s = synlig(certifikatDom({ ...FULD, kontraktStart: "2024-02-29" }, NU));
    expect(formatDay(s.twelveMonthDate)).toBe("28. februar 2025");
    expect(s.period).toBe("februar 2024 – februar 2025");
  });
  it("30. april 2025 og 31. oktober 2025 rammer samme dag året efter", () => {
    expect(formatDay(synlig(certifikatDom({ ...FULD, kontraktStart: "2025-04-30" }, NU)).twelveMonthDate)).toBe("30. april 2026");
    const okt = synlig(certifikatDom({ ...FULD, kontraktStart: "2025-10-31" }, NU));
    expect(formatDay(okt.twelveMonthDate)).toBe("31. oktober 2026");
    expect(formatDay(okt.unlockDate)).toBe("24. oktober 2026");
    expect(okt.state).toBe("locked");
    expect(okt.daysUntilUnlock).toBe(25);
  });
});

describe("certifikatDom — hvem ser området (HANDOFF §3)", () => {
  it("rådgiveren ser intet — uanset flag og dato", () => {
    expect(certifikatDom({ isAdvisor: true, membershipTier: "full", eligible: true, kontraktStart: "2025-10-06" }, NU)).toEqual({ synlig: false, grund: "raadgiver" });
  });
  it("abonnent, udløbet og uden tier ser intet", () => {
    for (const tier of ["subscriber", "expired", null] as const) {
      expect(certifikatDom({ isAdvisor: false, membershipTier: tier, eligible: true, kontraktStart: "2025-10-06" }, NU)).toEqual({ synlig: false, grund: "ikke_fuldt_medlem" });
    }
  });
  it("uden flaget: intet — også når datoen ville have åbnet", () => {
    expect(certifikatDom({ ...FULD, eligible: false, kontraktStart: "2025-10-06" }, NU)).toEqual({ synlig: false, grund: "ikke_berettiget" });
  });
  it("NULL i contract_start_date: intet — ingen gættet dato (HANDOFF §10)", () => {
    for (const s of [null, undefined, ""]) expect(certifikatDom({ ...FULD, kontraktStart: s }, NU)).toEqual({ synlig: false, grund: "ingen_startdato" });
  });
  it("en dato, der ikke er «YYYY-MM-DD»: intet, med sin egen grund", () => {
    expect(certifikatDom({ ...FULD, kontraktStart: "2025-10-22T00:00:00+00:00" }, NU)).toEqual({ synlig: false, grund: "ugyldig_startdato" });
  });
});

describe("certifikatMenu — tre tilstande, og intet punkt når skjult", () => {
  it("åbent uden hentninger = «ny»; åbent med hentninger = «aaben»; låst = «laast»", () => {
    const aaben = certifikatDom({ ...FULD, kontraktStart: "2025-10-06" }, NU);
    const laast = certifikatDom({ ...FULD, kontraktStart: "2025-10-22" }, NU);
    expect(certifikatMenu(aaben, 0)).toBe("ny");
    expect(certifikatMenu(aaben, 1)).toBe("aaben");
    expect(certifikatMenu(aaben, 7)).toBe("aaben");
    expect(certifikatMenu(laast, 0)).toBe("laast");
    expect(certifikatMenu(laast, 3)).toBe("laast");
  });
  it("skjult = null, uanset hentninger", () => {
    const skjult = certifikatDom({ ...FULD, eligible: false, kontraktStart: "2025-10-06" }, NU);
    expect(certifikatMenu(skjult, 0)).toBeNull();
    expect(certifikatMenu(skjult, 5)).toBeNull();
  });
});

/** En falsk klient, der husker, hvad der blev bedt om. */
function falskKlient(svar: { count?: number | null; error?: { message: string } | null }) {
  const kald: Array<{ tabel: string; op: string; arg: unknown }> = [];
  const klient: HentningsKlient = {
    from: (tabel: string) => ({
      select: (kolonner: string, opts: unknown) => {
        kald.push({ tabel, op: "select", arg: [kolonner, opts] });
        return { eq: (k: string, v: unknown) => { kald.push({ tabel, op: "eq", arg: [k, v] }); return Promise.resolve({ count: svar.count ?? null, error: svar.error ?? null }); } };
      },
      insert: (raekke: unknown) => { kald.push({ tabel, op: "insert", arg: raekke }); return Promise.resolve({ error: svar.error ?? null }); },
    }),
  };
  return { klient, kald };
}

describe("hentninger — sporet i certificate_downloads", () => {
  it("tæller egne rækker med count=exact, head — og svarer med tallet", async () => {
    const { klient, kald } = falskKlient({ count: 3 });
    expect(await taelHentninger(klient, "u1")).toBe(3);
    expect(kald).toEqual([
      { tabel: HENTNINGER_TABEL, op: "select", arg: ["id", { count: "exact", head: true }] },
      { tabel: HENTNINGER_TABEL, op: "eq", arg: ["user_id", "u1"] },
    ]);
    expect(HENTNINGER_TABEL).toBe("certificate_downloads");
  });
  it("null-count læses som 0; en fejl KASTER (tom og fejlet må ikke ligne hinanden)", async () => {
    expect(await taelHentninger(falskKlient({ count: null }).klient, "u1")).toBe(0);
    await expect(taelHentninger(falskKlient({ error: { message: "42P01" } }).klient, "u1")).rejects.toThrow(/42P01/);
  });
  it("skriver præcis én række: user_id, design, format", async () => {
    const { klient, kald } = falskKlient({});
    await skrivHentning(klient, { userId: "u1", design: "raadgivere-lys", format: "pdf" });
    expect(kald).toEqual([{ tabel: HENTNINGER_TABEL, op: "insert", arg: { user_id: "u1", design: "raadgivere-lys", format: "pdf" } }]);
  });
  it("en afvist skrivning kaster med databasens besked", async () => {
    await expect(skrivHentning(falskKlient({ error: { message: "new row violates row-level security" } }).klient, { userId: "u1", design: "portraet", format: "png" })).rejects.toThrow(/row-level security/);
  });
});
