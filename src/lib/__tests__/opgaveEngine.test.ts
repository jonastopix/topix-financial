import { describe, expect, it } from "vitest";
import {
  accepter,
  beregnUdloeb,
  erForfalden,
  erUdloebet,
  lovligeOvergange,
  luk,
  opgoerTilstand,
  udskyd,
  type Opgave,
  type OpgaveResultat,
} from "@/lib/opgaveEngine";

/** Lokal-tids-konstruktion så kalenderdags-logikken testes uafhængigt af
    kørselsmiljøets tidszone. */
const d = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

function opgave(overrides: Partial<Opgave> = {}): Opgave {
  return {
    id: "a1",
    company_id: "c1",
    user_id: "u1",
    title: "Ring til banken",
    context: null,
    priority: "medium",
    source_type: "advisor",
    source_id: null,
    status: "proposed",
    week_key: null,
    generated_at: null,
    created_at: d(2026, 8, 1),
    updated_at: d(2026, 8, 1),
    completed_at: null,
    dismissed_at: null,
    due_date: null,
    accepted_at: null,
    deferral_count: 0,
    expires_at: null,
    closed_at: null,
    proposed_by: null,
    ...overrides,
  };
}

/** tsconfig'ens strict:false narrower ikke på boolean-literal-diskriminanter
    (samme begrænsning som dokumenteret i handoutEngine) — derfor cast. */
type Afvist = { ok: false; grund: string };

function forventOk(resultat: OpgaveResultat): Opgave {
  if (!resultat.ok) throw new Error(`forventede ok, fik: ${(resultat as Afvist).grund}`);
  return resultat.opgave;
}

function forventAfvist(resultat: OpgaveResultat): string {
  if (resultat.ok) throw new Error("forventede afvisning, fik ok");
  return (resultat as Afvist).grund;
}

describe("lovligeOvergange", () => {
  it("proposed kan gå til active, dismissed og expired", () => {
    expect(lovligeOvergange("proposed").sort()).toEqual(["active", "dismissed", "expired"]);
  });

  it("active kan gå til done, not_done, dropped og active (udskydelse)", () => {
    expect(lovligeOvergange("active").sort()).toEqual(["active", "done", "dropped", "not_done"].sort());
  });

  it("sluttilstande har ingen lovlige overgange", () => {
    for (const status of ["done", "not_done", "dropped", "dismissed", "expired"] as const) {
      expect(lovligeOvergange(status)).toEqual([]);
    }
  });

  it("overgangsværdierne open og parked har ingen lovlige overgange", () => {
    expect(lovligeOvergange("open")).toEqual([]);
    expect(lovligeOvergange("parked")).toEqual([]);
  });
});

describe("beregnUdloeb (B10)", () => {
  const oprettet = d(2026, 8, 1);

  it("advisor lever 30 dage", () => {
    expect(beregnUdloeb("advisor", oprettet).getTime()).toBe(d(2026, 8, 31).getTime());
  });

  it("reflection lever 21 dage", () => {
    expect(beregnUdloeb("reflection", oprettet).getTime()).toBe(d(2026, 8, 22).getTime());
  });

  it("ai_weekly lever 14 dage", () => {
    expect(beregnUdloeb("ai_weekly", oprettet).getTime()).toBe(d(2026, 8, 15).getTime());
  });

  it("agent lever 14 dage", () => {
    expect(beregnUdloeb("agent", oprettet).getTime()).toBe(d(2026, 8, 15).getTime());
  });

  it("øvrige kilder falder tilbage på 14 dage", () => {
    expect(beregnUdloeb("manual", oprettet).getTime()).toBe(d(2026, 8, 15).getTime());
    expect(beregnUdloeb("handout", oprettet).getTime()).toBe(d(2026, 8, 15).getTime());
  });
});

describe("accepter (B1/B6)", () => {
  const nu = d(2026, 8, 22);

  it("accepterer et forslag og sætter status, accepted_at og due_date", () => {
    const forslag = opgave();
    const resultat = forventOk(accepter(forslag, d(2026, 9, 1), nu));
    expect(resultat.status).toBe("active");
    expect(resultat.accepted_at?.getTime()).toBe(nu.getTime());
    expect(resultat.due_date?.getTime()).toBe(d(2026, 9, 1).getTime());
  });

  it("muterer ikke input-opgaven", () => {
    const forslag = opgave();
    forventOk(accepter(forslag, d(2026, 9, 1), nu));
    expect(forslag.status).toBe("proposed");
    expect(forslag.due_date).toBeNull();
    expect(forslag.accepted_at).toBeNull();
  });

  it("tillader due date i dag", () => {
    const resultat = forventOk(accepter(opgave(), d(2026, 8, 22, 8), d(2026, 8, 22, 20)));
    expect(resultat.status).toBe("active");
  });

  it("afviser due date i fortiden", () => {
    const grund = forventAfvist(accepter(opgave(), d(2026, 8, 21), nu));
    expect(grund).toContain("fortiden");
  });

  it("afviser accept fra active", () => {
    const aktiv = opgave({ status: "active", due_date: d(2026, 9, 1) });
    forventAfvist(accepter(aktiv, d(2026, 9, 10), nu));
  });

  it("afviser accept fra en sluttilstand", () => {
    forventAfvist(accepter(opgave({ status: "dismissed" }), d(2026, 9, 1), nu));
  });
});

describe("udskyd (B7/B11)", () => {
  const forfalden = () => opgave({ status: "active", due_date: d(2026, 8, 10), accepted_at: d(2026, 8, 1) });
  const nu = d(2026, 8, 22);

  it("første udskydelse flytter fristen 14 dage frem automatisk og ignorerer nyDato", () => {
    const resultat = forventOk(udskyd(forfalden(), nu, d(2026, 12, 24)));
    expect(resultat.due_date?.getTime()).toBe(d(2026, 9, 5).getTime());
    expect(resultat.deferral_count).toBe(1);
    expect(resultat.status).toBe("active");
  });

  it("første udskydelse regnes fra nu — en længe overskredet frist lander ikke i fortiden", () => {
    const laengeOverskredet = opgave({ status: "active", due_date: d(2026, 6, 1), accepted_at: d(2026, 5, 1) });
    const resultat = forventOk(udskyd(laengeOverskredet, nu));
    expect(resultat.due_date?.getTime()).toBe(d(2026, 9, 5).getTime());
    expect(erForfalden(resultat, nu)).toBe(false);
  });

  it("anden udskydelse bruger medlemmets valgte dato", () => {
    const resultat = forventOk(udskyd({ ...forfalden(), deferral_count: 1 }, nu, d(2026, 9, 15)));
    expect(resultat.due_date?.getTime()).toBe(d(2026, 9, 15).getTime());
    expect(resultat.deferral_count).toBe(2);
  });

  it("anden udskydelse uden valgt dato afvises", () => {
    const grund = forventAfvist(udskyd({ ...forfalden(), deferral_count: 1 }, nu));
    expect(grund).toContain("B11");
  });

  it("anden udskydelse med dato i fortiden afvises", () => {
    forventAfvist(udskyd({ ...forfalden(), deferral_count: 1 }, nu, d(2026, 8, 20)));
  });

  it("tredje udskydelse afvises — opgaven skal lukkes", () => {
    const grund = forventAfvist(udskyd({ ...forfalden(), deferral_count: 2 }, nu, d(2026, 9, 15)));
    expect(grund).toContain("B7");
  });

  it("afvises når opgaven ikke er forfalden endnu", () => {
    const ikkeForfalden = opgave({ status: "active", due_date: d(2026, 9, 1) });
    forventAfvist(udskyd(ikkeForfalden, nu));
  });

  it("afvises fra proposed", () => {
    forventAfvist(udskyd(opgave(), nu));
  });

  it("muterer ikke input-opgaven", () => {
    const original = forfalden();
    forventOk(udskyd(original, nu));
    expect(original.deferral_count).toBe(0);
    expect(original.due_date?.getTime()).toBe(d(2026, 8, 10).getTime());
  });
});

describe("luk", () => {
  const nu = d(2026, 8, 22);

  it("lukker en aktiv opgave som done, not_done eller dropped og stempler closed_at", () => {
    for (const udfald of ["done", "not_done", "dropped"] as const) {
      const aktiv = opgave({ status: "active", due_date: d(2026, 8, 20) });
      const resultat = forventOk(luk(aktiv, udfald, nu));
      expect(resultat.status).toBe(udfald);
      expect(resultat.closed_at?.getTime()).toBe(nu.getTime());
    }
  });

  it("lukker et forslag som dismissed eller expired", () => {
    for (const udfald of ["dismissed", "expired"] as const) {
      const resultat = forventOk(luk(opgave(), udfald, nu));
      expect(resultat.status).toBe(udfald);
      expect(resultat.closed_at?.getTime()).toBe(nu.getTime());
    }
  });

  it("afviser dismissed fra active", () => {
    const aktiv = opgave({ status: "active", due_date: d(2026, 8, 20) });
    forventAfvist(luk(aktiv, "dismissed", nu));
  });

  it("afviser done fra proposed", () => {
    forventAfvist(luk(opgave(), "done", nu));
  });

  it("afviser luk fra en sluttilstand", () => {
    forventAfvist(luk(opgave({ status: "done" }), "dropped", nu));
  });

  it("afviser luk fra overgangsværdien open", () => {
    forventAfvist(luk(opgave({ status: "open" }), "done", nu));
  });
});

describe("erForfalden (B2)", () => {
  const aktiv = opgave({ status: "active", due_date: d(2026, 8, 20) });

  it("frist i dag er ikke forfalden — grænsedatoen hører til opgaven", () => {
    expect(erForfalden(aktiv, d(2026, 8, 20, 23, 59))).toBe(false);
  });

  it("dagen efter fristen er forfalden, uanset klokkeslæt", () => {
    expect(erForfalden(aktiv, d(2026, 8, 21, 0, 1))).toBe(true);
  });

  it("kun aktive opgaver kan være forfaldne", () => {
    expect(erForfalden(opgave({ status: "proposed", due_date: d(2026, 8, 1) }), d(2026, 8, 22))).toBe(false);
    expect(erForfalden(opgave({ status: "done", due_date: d(2026, 8, 1) }), d(2026, 8, 22))).toBe(false);
  });
});

describe("erUdloebet (B8)", () => {
  const udloeb = d(2026, 8, 20, 10, 0);
  const forslag = opgave({ expires_at: udloeb });

  it("præcis på udløbstidspunktet er forslaget ikke udløbet", () => {
    expect(erUdloebet(forslag, new Date(udloeb.getTime()))).toBe(false);
  });

  it("ét øjeblik efter udløbstidspunktet er forslaget udløbet", () => {
    expect(erUdloebet(forslag, new Date(udloeb.getTime() + 1))).toBe(true);
  });

  it("kun forslag kan udløbe", () => {
    const aktiv = opgave({ status: "active", due_date: d(2026, 9, 1), expires_at: udloeb });
    expect(erUdloebet(aktiv, d(2026, 8, 22))).toBe(false);
  });

  it("forslag uden expires_at udløber ikke", () => {
    expect(erUdloebet(opgave(), d(2026, 8, 22))).toBe(false);
  });
});

describe("opgoerTilstand", () => {
  const nu = d(2026, 8, 22);

  it("opgør en blandet liste", () => {
    const liste: Opgave[] = [
      // To aktive, hvoraf én er forfalden.
      opgave({ id: "aktiv", status: "active", due_date: d(2026, 8, 25) }),
      opgave({ id: "forfalden", status: "active", due_date: d(2026, 8, 10) }),
      // To ubesvarede forslag med forskellig alder.
      opgave({ id: "ung", created_at: d(2026, 8, 5), expires_at: d(2026, 9, 1) }),
      opgave({ id: "aeldst", created_at: d(2026, 8, 2), expires_at: d(2026, 9, 1) }),
      // Et forslag hvis frist er passeret, men som cron ikke har lukket endnu.
      opgave({ id: "udloebet-uden-cron", created_at: d(2026, 8, 1), expires_at: d(2026, 8, 15) }),
      // Lukkede i fire af fem udfald.
      opgave({ id: "done", status: "done", closed_at: d(2026, 8, 18) }),
      opgave({ id: "dropped", status: "dropped", closed_at: d(2026, 8, 18) }),
      opgave({ id: "dismissed", status: "dismissed", closed_at: d(2026, 8, 18) }),
      opgave({ id: "expired", status: "expired", closed_at: d(2026, 8, 18) }),
      // Overgangsværdi — skal ikke tælles nogen steder.
      opgave({ id: "gammel-open", status: "open" }),
    ];

    expect(opgoerTilstand(liste, nu)).toEqual({
      antalAktive: 2,
      antalForfaldne: 1,
      antalUbesvaredeForslag: 2,
      antalUdloebneForslag: 2,
      aeldsteUbesvaredeForslag: d(2026, 8, 2),
      lukkede: { done: 1, not_done: 0, dropped: 1, dismissed: 1, expired: 1 },
    });
  });

  it("tom liste giver nul-sammenfatning", () => {
    expect(opgoerTilstand([], nu)).toEqual({
      antalAktive: 0,
      antalForfaldne: 0,
      antalUbesvaredeForslag: 0,
      antalUdloebneForslag: 0,
      aeldsteUbesvaredeForslag: null,
      lukkede: { done: 0, not_done: 0, dropped: 0, dismissed: 0, expired: 0 },
    });
  });
});
