import { describe, expect, it } from "vitest";
import {
  byggOverblik,
  erNytMedlem,
  IKKE_OMFATTET_FRA,
  iUniverset,
  MANGLER_STATUSSER,
  manglerAtBooke,
  sessionStatus,
  type OverbliksKilder,
  type SessionDom,
  type SessionRaekke,
} from "@/lib/medlemsOverblik";

/**
 * Motoren bag forsidens «Mangler at booke» (29/9-2026). Sessionsgrenene (inkl.
 * de to «uden række»-tilfælde), «nyt medlem», sammenkoblingen og universet, og
 * manglerAtBooke. Oprydningen 29/9 fjernede aktiviteten og mærke-dommen — og
 * deres prøver med dem; beviset for, at N og M er uændrede, står i
 * manglerAtBookeUaendret.test.ts.
 */

const NU = new Date("2026-09-29T10:00:00Z");
const MS_DAG = 86_400_000;
const dageFoer = (n: number, fra = NU) => new Date(fra.getTime() - n * MS_DAG).toISOString();
const raekke = (status: string, start: string | null = null, slut: string | null = null, created = dageFoer(3)): SessionRaekke => ({ status, start_tid: start, slut_tid: slut, created_at: created });

describe("sessionStatus — hver gren", () => {
  it("ret null → ikke_brugt, også når en gammel aflyst række findes (host-aflysning har genåbnet retten)", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: null, raekker: [], nu: NU })).toEqual({ raadgiver: "morten", retAt: null, tid: null, status: "ikke_brugt" });
    expect(sessionStatus({ raadgiver: "morten", retAt: undefined, raekker: [raekke("cancelled")], nu: NU }).status).toBe("ikke_brugt");
  });

  it("booking_sent → link_sendt", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(3), raekker: [raekke("booking_sent")], nu: NU }).status).toBe("link_sendt");
  });

  it("booked med slut i fremtiden → booket, med tid; booked uden tid → booket med tid null", () => {
    const d = sessionStatus({ raadgiver: "jonas", retAt: dageFoer(3), raekker: [raekke("booked", "2026-10-02T09:00:00Z", "2026-10-02T09:30:00Z")], nu: NU });
    expect(d).toEqual({ raadgiver: "jonas", retAt: dageFoer(3), status: "booket", tid: { start: "2026-10-02T09:00:00Z", slut: "2026-10-02T09:30:00Z" } });
    expect(sessionStatus({ raadgiver: "jonas", retAt: dageFoer(3), raekker: [raekke("booked")], nu: NU })).toMatchObject({ status: "booket", tid: null });
  });

  it("booked med slut passeret → afholdt (UDLEDT — introSession.erAfholdt); præcis nu er afholdt, et sekund før er booket", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("booked", dageFoer(2), dageFoer(2))], nu: NU }).status).toBe("afholdt");
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("booked", null, NU.toISOString())], nu: NU }).status).toBe("afholdt");
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("booked", null, new Date(NU.getTime() + 1000).toISOString())], nu: NU }).status).toBe("booket");
  });

  it("cancelled med retten stadig sat → aflyst (invitee-aflysning: retten forbliver brugt)", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(10), raekker: [raekke("cancelled", dageFoer(1), dageFoer(1))], nu: NU })).toMatchObject({ status: "aflyst", tid: { start: dageFoer(1) } });
  });

  it("UDEN RÆKKE 1: Mortens ret sat uden række → markeret_uden_booking — uanset dato (årsagen er ikke målt)", () => {
    expect(sessionStatus({ raadgiver: "morten", retAt: "2026-07-01T10:00:00Z", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
    expect(sessionStatus({ raadgiver: "morten", retAt: "2026-09-20T10:00:00Z", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
  });

  it("UDEN RÆKKE 2: Jonas' ret sat FØR 14/9-2026 uden række → ikke_omfattet (de 23 fra 13/9 20:50–20:54 UTC); fra 14/9 → markeret_uden_booking", () => {
    expect(IKKE_OMFATTET_FRA).toBe("2026-09-14T00:00:00Z");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-13T20:52:00Z", raekker: [], nu: NU }).status).toBe("ikke_omfattet");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-13T23:59:59Z", raekker: [], nu: NU }).status).toBe("ikke_omfattet");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-14T00:00:00Z", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
    // En ulæselig ret-dato er ikke «før» — fail-closed til markeret_uden_booking.
    expect(sessionStatus({ raadgiver: "jonas", retAt: "ikke en tid", raekker: [], nu: NU }).status).toBe("markeret_uden_booking");
  });

  it("den NYESTE kendte række vinder; pending/paid/refunded tæller ikke som en inkluderet række", () => {
    const gammel = raekke("cancelled", null, null, dageFoer(30));
    const ny = raekke("booking_sent", null, null, dageFoer(2));
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(2), raekker: [gammel, ny], nu: NU }).status).toBe("link_sendt");
    expect(sessionStatus({ raadgiver: "morten", retAt: dageFoer(2), raekker: [ny, gammel], nu: NU }).status).toBe("link_sendt");
    expect(sessionStatus({ raadgiver: "jonas", retAt: "2026-09-20T10:00:00Z", raekker: [raekke("pending")], nu: NU }).status).toBe("markeret_uden_booking");
  });
});

describe("erNytMedlem — Jonas-sessionen gælder medlemmer fra 14/9-2026", () => {
  it("præcis IKKE_OMFATTET_FRA er nyt, et sekund før er ikke; uden startdato: nej (fail-closed)", () => {
    expect(IKKE_OMFATTET_FRA).toBe("2026-09-14T00:00:00Z");
    expect(erNytMedlem("2026-09-14T00:00:00Z")).toBe(true);
    expect(erNytMedlem("2026-09-13T23:59:59Z")).toBe(false);
    expect(erNytMedlem(null)).toBe(false);
    expect(erNytMedlem("ikke en dato")).toBe(false);
  });
});

const KILDER: OverbliksKilder = {
  companies: [
    { id: "aktiv", name: "Aktiv ApS", status: "active", is_legat: false, er_kunde: true, is_demo: false, intro_session_used_at: dageFoer(20), jonas_session_used_at: "2026-09-13T20:52:00Z" },
    { id: "tom_status", status: null, is_legat: null, er_kunde: null, is_demo: null, intro_session_used_at: null, jonas_session_used_at: null },
    { id: "legat", status: "active", is_legat: true, er_kunde: true, is_demo: false, intro_session_used_at: null, jonas_session_used_at: null },
    { id: "udloebet", status: "expired", is_legat: false, er_kunde: true, is_demo: false, intro_session_used_at: null, jonas_session_used_at: null },
    { id: "os_selv", status: "active", is_legat: false, er_kunde: false, is_demo: false, intro_session_used_at: null, jonas_session_used_at: null },
    { id: "ny", name: null, status: "active", is_legat: false, er_kunde: true, is_demo: false, intro_session_used_at: null, jonas_session_used_at: null },
  ],
  medlemmer: [
    { company_id: "aktiv", user_id: "u1", created_at: dageFoer(200) }, { company_id: "aktiv", user_id: "u2", created_at: dageFoer(100) },
    { company_id: "ny", user_id: "u3", created_at: dageFoer(10) }, { company_id: "legat", user_id: "u4", created_at: dageFoer(50) },
    { company_id: "", user_id: "u5", created_at: dageFoer(1) },
  ],
  bookinger: [
    { company_id: "aktiv", advisor: "morten", status: "booked", start_tid: dageFoer(5), slut_tid: dageFoer(5), created_at: dageFoer(20) },
    { company_id: "aktiv", advisor: "jonas", status: "booking_sent", start_tid: null, slut_tid: null, created_at: dageFoer(2) },
    { company_id: null, advisor: "morten", status: "booked", start_tid: null, slut_tid: null, created_at: dageFoer(2) },
  ],
};

describe("byggOverblik — sammenkoblingen på et fast datasæt", () => {
  it("én række pr. virksomhed i universet: id, navn, første medlem og de to sessioner", () => {
    const o = byggOverblik(KILDER, NU);
    expect([...o.keys()]).toEqual(["aktiv", "tom_status", "ny"]);
    expect(o.get("aktiv")).toEqual({
      companyId: "aktiv",
      navn: "Aktiv ApS",
      medlemSiden: dageFoer(200), // det FØRSTE medlem, uanset rækkefølge
      sessioner: {
        morten: { raadgiver: "morten", status: "afholdt", retAt: dageFoer(20), tid: { start: dageFoer(5), slut: dageFoer(5) } },
        jonas: { raadgiver: "jonas", status: "link_sendt", retAt: "2026-09-13T20:52:00Z", tid: null },
      },
    });
    // Ingen medlemmer → medlemSiden null; ingen ret → ikke_brugt. En booking uden company_id tæller ingen steder.
    expect(o.get("tom_status")!.medlemSiden).toBeNull();
    expect(o.get("tom_status")!.sessioner.morten.status).toBe("ikke_brugt");
    expect(o.get("ny")!.medlemSiden).toBe(dageFoer(10));
  });

  it("navnet: companies.name, samme regel som /virksomheder (name || \"\") — null eller udeladt → tom streng", () => {
    expect([...byggOverblik(KILDER, NU).values()].map((r) => r.navn)).toEqual(["Aktiv ApS", "", ""]);
  });
});

describe("byggOverblik — universet, og demo-virksomheden (29/9)", () => {
  it("iUniverset: aktiv/status-løs kunde, ikke legat, ikke demo", () => {
    expect(iUniverset({ status: "active", is_legat: false, er_kunde: true, is_demo: false })).toBe(true);
    expect(iUniverset({ status: null, is_legat: null, er_kunde: null, is_demo: null })).toBe(true);
    expect(iUniverset({ status: "expired", is_legat: false, er_kunde: true, is_demo: false })).toBe(false);
    expect(iUniverset({ status: "active", is_legat: true, er_kunde: true, is_demo: false })).toBe(false);
    expect(iUniverset({ status: "active", is_legat: false, er_kunde: false, is_demo: false })).toBe(false);
    expect(iUniverset({ status: "active", is_legat: false, er_kunde: true, is_demo: true })).toBe(false);
  });

  it("demo-virksomheden (is_demo) er ude — også for en admin, som RLS ikke skjuler den for", () => {
    const demo = { id: "a0de0000-0000-4000-8000-000000000001", status: "active", is_legat: false, er_kunde: true, is_demo: true, intro_session_used_at: null, jonas_session_used_at: null };
    expect(byggOverblik({ ...KILDER, companies: [...KILDER.companies, demo] }, NU).has(demo.id)).toBe(false);
  });
});

describe("manglerAtBooke — hvem mangler at booke (Jonas 29/9)", () => {
  const ALLE: SessionDom["status"][] = ["ikke_brugt", "link_sendt", "booket", "afholdt", "aflyst", "markeret_uden_booking", "ikke_omfattet"];
  const dom = (raadgiver: "morten" | "jonas", status: SessionDom["status"]): SessionDom => ({ raadgiver, status, tid: null, retAt: null });
  const raekke = (m: SessionDom["status"], j: SessionDom["status"], medlemSiden: string | null) =>
    ({ sessioner: { morten: dom("morten", m), jonas: dom("jonas", j) }, medlemSiden });
  const NY = "2026-09-20T10:00:00Z";      // medlem fra efter IKKE_OMFATTET_FRA
  const GAMMEL = "2026-06-01T10:00:00Z";  // medlem fra før

  it("de tre mangler-statusser er ikke_brugt, link_sendt og aflyst — intet andet", () => {
    expect([...MANGLER_STATUSSER]).toEqual(["ikke_brugt", "link_sendt", "aflyst"]);
  });

  it("MORTEN: mangler ved ikke_brugt, link_sendt og aflyst — for nye OG gamle medlemmer", () => {
    for (const status of ALLE) {
      const forventet = status === "ikke_brugt" || status === "link_sendt" || status === "aflyst";
      expect(manglerAtBooke(raekke(status, "booket", GAMMEL)).morten, `${status} (gammel)`).toBe(forventet);
      expect(manglerAtBooke(raekke(status, "booket", NY)).morten, `${status} (ny)`).toBe(forventet);
      expect(manglerAtBooke(raekke(status, "booket", null)).morten, `${status} (uden startdato)`).toBe(forventet);
    }
  });

  it("MORTEN: booket, afholdt, markeret_uden_booking og ikke_omfattet mangler ikke", () => {
    for (const status of ["booket", "afholdt", "markeret_uden_booking", "ikke_omfattet"] as const) {
      expect(manglerAtBooke(raekke(status, "ikke_brugt", NY)).morten, status).toBe(false);
    }
  });

  it("JONAS, nyt medlem: mangler ved ikke_brugt, link_sendt og aflyst; ikke ved de fire andre", () => {
    for (const status of ALLE) {
      const forventet = status === "ikke_brugt" || status === "link_sendt" || status === "aflyst";
      expect(manglerAtBooke(raekke("booket", status, NY)).jonas, status).toBe(forventet);
    }
  });

  it("JONAS, gammelt medlem eller ukendt startdato: mangler ALDRIG (erNytMedlem er fail-closed)", () => {
    for (const status of ALLE) {
      expect(manglerAtBooke(raekke("booket", status, GAMMEL)).jonas, `${status} (gammel)`).toBe(false);
      expect(manglerAtBooke(raekke("booket", status, null)).jonas, `${status} (uden startdato)`).toBe(false);
    }
  });

  it("grænsen er IKKE_OMFATTET_FRA: præcis dér er man ny, et sekund før er man det ikke", () => {
    expect(manglerAtBooke(raekke("booket", "ikke_brugt", IKKE_OMFATTET_FRA)).jonas).toBe(true);
    expect(manglerAtBooke(raekke("booket", "ikke_brugt", "2026-09-13T23:59:59Z")).jonas).toBe(false);
  });

  it("de to domme er uafhængige", () => {
    expect(manglerAtBooke(raekke("ikke_brugt", "ikke_brugt", NY))).toEqual({ morten: true, jonas: true });
    expect(manglerAtBooke(raekke("afholdt", "ikke_brugt", NY))).toEqual({ morten: false, jonas: true });
    expect(manglerAtBooke(raekke("ikke_brugt", "afholdt", NY))).toEqual({ morten: true, jonas: false });
    expect(manglerAtBooke(raekke("afholdt", "afholdt", NY))).toEqual({ morten: false, jonas: false });
  });
});
