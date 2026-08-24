import { describe, expect, it } from "vitest";
import * as motor from "../opgaveEngine";
import * as deno from "../../../supabase/functions/_shared/opgaveEngine.ts";
import type { Opgave, OpgaveStatus, SlutUdfald } from "../opgaveEngine";

// Paritetsværn — Deno-spejlet i supabase/functions/_shared/opgaveEngine.ts
// skal dømme identisk med motoren (src/lib/opgaveEngine.ts) for enhver
// overgang skrivevejen kan møde. Fejler denne blok, er de to filer drevet
// fra hinanden og skal re-synkroniseres. Samme mønster som
// membershipTier.test.ts:113-131 og opgaveUdloeb.paritet.test.ts.
//
// Sammenligningen går gennem JSON.stringify, så Date-felter sammenlignes
// på tidspunkt og ok/grund-varianterne felt for felt.

const NU = new Date("2026-08-24T21:00:00Z");

const ALLE_STATUSSER: OpgaveStatus[] = [
  "proposed", "active", "done", "not_done", "dropped", "dismissed", "expired", "open", "parked",
];
const ALLE_UDFALD: SlutUdfald[] = ["done", "not_done", "dropped", "dismissed", "expired"];

function opgave(felter: Partial<Opgave> = {}): Opgave {
  return {
    id: "op-1",
    company_id: "co-1",
    user_id: "u-1",
    title: "Ring til banken",
    context: "Kreditfaciliteten udløber",
    priority: "high",
    source_type: "ai_weekly",
    source_id: null,
    status: "proposed",
    week_key: "2026-W35",
    generated_at: new Date("2026-08-24T06:00:00Z"),
    created_at: new Date("2026-08-24T06:00:00Z"),
    updated_at: new Date("2026-08-24T06:00:00Z"),
    completed_at: null,
    dismissed_at: null,
    due_date: null,
    accepted_at: null,
    deferral_count: 0,
    expires_at: new Date("2026-09-07T06:00:00Z"),
    closed_at: null,
    proposed_by: null,
    ...felter,
  };
}

/** Kør samme kald mod begge implementeringer og kræv identisk resultat.
    Returnerer motorens resultat så testen også kan assertere retningen. */
function paritet<T>(koer: (impl: typeof motor) => T): T {
  const fraMotor = koer(motor);
  const fraDeno = koer(deno as unknown as typeof motor);
  expect(JSON.parse(JSON.stringify(fraDeno))).toEqual(JSON.parse(JSON.stringify(fraMotor)));
  return fraMotor;
}

describe("opgaveEngine-spejl — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("lovligeOvergange er identisk for alle ni statusser", () => {
    for (const status of ALLE_STATUSSER) {
      paritet((impl) => impl.lovligeOvergange(status));
    }
  });

  describe("accepter (B1/B3/B6)", () => {
    it("fra proposed med dato i morgen: ok, active + accepted_at + due_date", () => {
      const res = paritet((impl) => impl.accepter(opgave(), new Date("2026-08-25T00:00:00Z"), NU));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.opgave.status).toBe("active");
    });

    it("dato PRÆCIS i dag er lovlig (kalenderdag, ikke tidspunkt)", () => {
      const res = paritet((impl) => impl.accepter(opgave(), new Date("2026-08-24T00:00:00Z"), NU));
      expect(res.ok).toBe(true);
    });

    it("dato i går afvises med grund", () => {
      const res = paritet((impl) => impl.accepter(opgave(), new Date("2026-08-23T00:00:00Z"), NU));
      expect(res.ok).toBe(false);
    });

    it("afvises fra enhver anden status end proposed", () => {
      for (const status of ALLE_STATUSSER.filter((s) => s !== "proposed")) {
        const res = paritet((impl) =>
          impl.accepter(opgave({ status }), new Date("2026-08-25T00:00:00Z"), NU));
        expect(res.ok).toBe(false);
      }
    });
  });

  describe("udskyd (B7/B11)", () => {
    const forfalden = () => opgave({ status: "active", due_date: new Date("2026-08-20T00:00:00Z"), accepted_at: NU });

    it("ikke forfalden endnu: afvises (frist i dag tæller ikke som forfalden)", () => {
      const res = paritet((impl) =>
        impl.udskyd(opgave({ status: "active", due_date: new Date("2026-08-24T00:00:00Z") }), NU));
      expect(res.ok).toBe(false);
    });

    it("første udskydelse: nu+14, medsendt dato IGNORERES", () => {
      const res = paritet((impl) => impl.udskyd(forfalden(), NU, new Date("2027-01-01T00:00:00Z")));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.opgave.deferral_count).toBe(1);
        expect(res.opgave.due_date?.toISOString().slice(0, 10)).toBe("2026-09-07");
      }
    });

    it("anden udskydelse uden dato: afvises", () => {
      const res = paritet((impl) => impl.udskyd(opgave({ ...forfalden(), deferral_count: 1 }), NU));
      expect(res.ok).toBe(false);
    });

    it("anden udskydelse med valgt fremtidig dato: ok", () => {
      const res = paritet((impl) =>
        impl.udskyd(opgave({ ...forfalden(), deferral_count: 1 }), NU, new Date("2026-09-15T00:00:00Z")));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.opgave.deferral_count).toBe(2);
    });

    it("anden udskydelse med dato i fortiden: afvises", () => {
      const res = paritet((impl) =>
        impl.udskyd(opgave({ ...forfalden(), deferral_count: 1 }), NU, new Date("2026-08-01T00:00:00Z")));
      expect(res.ok).toBe(false);
    });

    it("tredje udskydelse: afvises — opgaven skal lukkes", () => {
      const res = paritet((impl) =>
        impl.udskyd(opgave({ ...forfalden(), deferral_count: 2 }), NU, new Date("2026-09-15T00:00:00Z")));
      expect(res.ok).toBe(false);
    });

    it("afvises fra proposed og fra active uden due_date", () => {
      expect(paritet((impl) => impl.udskyd(opgave(), NU)).ok).toBe(false);
      expect(paritet((impl) => impl.udskyd(opgave({ status: "active", due_date: null }), NU)).ok).toBe(false);
    });
  });

  describe("luk — fuld lovlighedsmatrix (alle 9 statusser × alle 5 udfald)", () => {
    it("dømmer identisk i alle 45 kombinationer", () => {
      for (const status of ALLE_STATUSSER) {
        for (const udfald of ALLE_UDFALD) {
          const res = paritet((impl) => impl.luk(opgave({ status }), udfald, NU));
          // Retningen (én gang, mod motoren): dismissed/expired kun fra
          // proposed, done/not_done/dropped kun fra active.
          const forventetLovlig =
            (status === "proposed" && (udfald === "dismissed" || udfald === "expired")) ||
            (status === "active" && (udfald === "done" || udfald === "not_done" || udfald === "dropped"));
          expect(res.ok).toBe(forventetLovlig);
          if (res.ok) expect(res.opgave.closed_at?.toISOString()).toBe(NU.toISOString());
        }
      }
    });
  });

  describe("erForfalden (B2) og erUdloebet (B8)", () => {
    it("grænsetilfælde dømmes identisk", () => {
      const tilfaelde: Array<Partial<Opgave>> = [
        { status: "active", due_date: new Date("2026-08-23T00:00:00Z") }, // i går → forfalden
        { status: "active", due_date: new Date("2026-08-24T00:00:00Z") }, // i dag → ikke forfalden
        { status: "active", due_date: null },
        { status: "proposed", due_date: new Date("2026-08-01T00:00:00Z") }, // forkert status
        { status: "proposed", expires_at: new Date("2026-08-24T20:59:59Z") }, // sekundet før nu → udløbet
        { status: "proposed", expires_at: new Date("2026-08-24T21:00:00Z") }, // præcis nu → ikke udløbet
        { status: "proposed", expires_at: null },
        { status: "active", expires_at: new Date("2026-08-01T00:00:00Z") }, // forkert status
      ];
      for (const felter of tilfaelde) {
        paritet((impl) => impl.erForfalden(opgave(felter), NU));
        paritet((impl) => impl.erUdloebet(opgave(felter), NU));
      }
    });
  });

  it("mutationsfunktionerne muterer aldrig input (begge implementeringer)", () => {
    for (const impl of [motor, deno as unknown as typeof motor]) {
      const foer = opgave();
      const kopi = JSON.parse(JSON.stringify(foer));
      impl.accepter(foer, new Date("2026-08-25T00:00:00Z"), NU);
      impl.udskyd(foer, NU);
      impl.luk(foer, "dismissed", NU);
      expect(JSON.parse(JSON.stringify(foer))).toEqual(kopi);
    }
  });
});
