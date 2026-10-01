import { describe, expect, it } from "vitest";
import { vaertPlan, type VaertPlan, type VaertRaekke, type VaertUdkast } from "@/lib/hjemmebane/vaerter";

/* Værtsfejlen 1/10-2026 (målt i prod 09:00): Admin → Events → et event med
   Morten som vært → tilføj Jonas → Gem → «duplicate key value violates unique
   constraint "event_vaerter_event_user_uidx"». saveVaerter indsatte hele
   listen før den slettede de gamle. vaertPlan beholder de eksisterende
   rådgiver-rækker; testene kører desuden planen mod en lille model af
   tabellen med indekset UNIQUE (event_id, user_id) WHERE user_id IS NOT NULL
   og tjekker, at eventet aldrig står uden værter undervejs. */

type Gammel = Pick<VaertRaekke, "id" | "user_id" | "raekkefoelge"> & { gaest_navn?: string | null };

const raadgiver = (user_id: string): VaertUdkast => ({ user_id, gaest_navn: null, gaest_titel: null, gaest_foto_path: null });
const gaest = (navn: string, titel: string | null = null): VaertUdkast => ({ user_id: null, gaest_navn: navn, gaest_titel: titel, gaest_foto_path: null });

/** Kører planen i saveVaerters rækkefølge (indsæt → opdatér → slet) mod en model med det unikke indeks. */
function koer(gamle: readonly Gammel[], plan: VaertPlan): { raekker: Gammel[]; mindste: number } {
  let raekker: Gammel[] = gamle.map((r) => ({ ...r }));
  let mindste = raekker.length;
  let n = 0;
  const tjek = () => {
    const ids = raekker.filter((r) => r.user_id).map((r) => r.user_id);
    if (new Set(ids).size !== ids.length) throw new Error('duplicate key value violates unique constraint "event_vaerter_event_user_uidx"');
    mindste = Math.min(mindste, raekker.length);
  };
  // Én insert (alle rækker i ét kald, som PostgREST): indekset dømmer hele kaldet.
  raekker = [...raekker, ...plan.indsaet.map((r) => ({ id: `ny-${n++}`, user_id: r.user_id, raekkefoelge: r.raekkefoelge, gaest_navn: r.gaest_navn }))];
  tjek();
  for (const o of plan.opdater) {
    raekker = raekker.map((r) => (r.id === o.id ? { ...r, raekkefoelge: o.raekkefoelge } : r));
    tjek();
  }
  raekker = raekker.filter((r) => !plan.slet.includes(r.id));
  tjek();
  return { raekker, mindste };
}

const visning = (raekker: readonly Gammel[]) =>
  [...raekker].sort((a, b) => a.raekkefoelge - b.raekkefoelge).map((r) => r.user_id ?? `gæst:${r.gaest_navn}`);

describe("vaertPlan — værtsfejlen 1/10", () => {
  it("fejlen fra prod: Morten er vært, Jonas tilføjes — Morten beholdes, kun Jonas indsættes", () => {
    const gamle: Gammel[] = [{ id: "m", user_id: "morten", raekkefoelge: 0 }];
    const plan = vaertPlan(gamle, [raadgiver("morten"), raadgiver("jonas")]);
    expect(plan).toEqual({
      opdater: [],
      indsaet: [{ user_id: "jonas", gaest_navn: null, gaest_titel: null, gaest_foto_path: null, raekkefoelge: 1 }],
      slet: [],
    });
    const { raekker, mindste } = koer(gamle, plan);
    expect(visning(raekker)).toEqual(["morten", "jonas"]);
    expect(mindste).toBeGreaterThan(0);
  });

  it("den gamle form (alt indsat før sletning) ville ramme indekset — modellen fanger det", () => {
    const gamle: Gammel[] = [{ id: "m", user_id: "morten", raekkefoelge: 0 }];
    const gammelForm: VaertPlan = {
      opdater: [],
      indsaet: [raadgiver("morten"), raadgiver("jonas")].map((v, i) => ({ ...v, raekkefoelge: i })),
      slet: ["m"],
    };
    expect(() => koer(gamle, gammelForm)).toThrow(/event_vaerter_event_user_uidx/);
  });

  it("kun rækkefølgen ændret: ingen insert, ingen sletning — kun raekkefoelge opdateres", () => {
    const gamle: Gammel[] = [
      { id: "m", user_id: "morten", raekkefoelge: 0 },
      { id: "j", user_id: "jonas", raekkefoelge: 1 },
    ];
    const plan = vaertPlan(gamle, [raadgiver("jonas"), raadgiver("morten")]);
    expect(plan).toEqual({ opdater: [{ id: "j", raekkefoelge: 0 }, { id: "m", raekkefoelge: 1 }], indsaet: [], slet: [] });
    expect(visning(koer(gamle, plan).raekker)).toEqual(["jonas", "morten"]);
  });

  it("uændret liste: en tom plan", () => {
    const gamle: Gammel[] = [
      { id: "m", user_id: "morten", raekkefoelge: 0 },
      { id: "j", user_id: "jonas", raekkefoelge: 1 },
    ];
    expect(vaertPlan(gamle, [raadgiver("morten"), raadgiver("jonas")])).toEqual({ opdater: [], indsaet: [], slet: [] });
  });

  it("rådgiver fjernet: rækken slettes, den anden rykker frem", () => {
    const gamle: Gammel[] = [
      { id: "m", user_id: "morten", raekkefoelge: 0 },
      { id: "j", user_id: "jonas", raekkefoelge: 1 },
    ];
    const plan = vaertPlan(gamle, [raadgiver("jonas")]);
    expect(plan).toEqual({ opdater: [{ id: "j", raekkefoelge: 0 }], indsaet: [], slet: ["m"] });
    const { raekker, mindste } = koer(gamle, plan);
    expect(visning(raekker)).toEqual(["jonas"]);
    expect(mindste).toBe(1);
  });

  it("gæst ændret: den nye gæsterække indsættes først, den gamle slettes til sidst; rådgiveren røres ikke", () => {
    const gamle: Gammel[] = [
      { id: "m", user_id: "morten", raekkefoelge: 0 },
      { id: "g", user_id: null, raekkefoelge: 1, gaest_navn: "Mette Hansen" },
    ];
    const plan = vaertPlan(gamle, [raadgiver("morten"), gaest("  Mette Hansen-Berg ", " CFO ")]);
    expect(plan).toEqual({
      opdater: [],
      indsaet: [{ user_id: null, gaest_navn: "Mette Hansen-Berg", gaest_titel: "CFO", gaest_foto_path: null, raekkefoelge: 1 }],
      slet: ["g"],
    });
    const { raekker, mindste } = koer(gamle, plan);
    expect(visning(raekker)).toEqual(["morten", "gæst:Mette Hansen-Berg"]);
    expect(mindste).toBe(2);
  });

  it("samme rådgiver to gange i udkastet: tæller én gang (første plads) og rammer ikke indekset", () => {
    const plan = vaertPlan([], [raadgiver("jonas"), gaest("Mette"), raadgiver("jonas")]);
    expect(plan.indsaet.map((r) => [r.user_id ?? r.gaest_navn, r.raekkefoelge])).toEqual([["jonas", 0], ["Mette", 1]]);
    expect(() => koer([], plan)).not.toThrow();
    // Også når rådgiveren allerede står på eventet.
    const gamle: Gammel[] = [{ id: "j", user_id: "jonas", raekkefoelge: 0 }];
    const plan2 = vaertPlan(gamle, [raadgiver("morten"), raadgiver("jonas"), raadgiver("jonas")]);
    expect(plan2).toEqual({
      opdater: [{ id: "j", raekkefoelge: 1 }],
      indsaet: [{ user_id: "morten", gaest_navn: null, gaest_titel: null, gaest_foto_path: null, raekkefoelge: 0 }],
      slet: [],
    });
    expect(visning(koer(gamle, plan2).raekker)).toEqual(["morten", "jonas"]);
  });

  it("tom liste: alle gamle rækker slettes, intet indsættes", () => {
    const gamle: Gammel[] = [
      { id: "m", user_id: "morten", raekkefoelge: 0 },
      { id: "g", user_id: null, raekkefoelge: 1, gaest_navn: "Mette" },
    ];
    expect(vaertPlan(gamle, [])).toEqual({ opdater: [], indsaet: [], slet: ["m", "g"] });
    expect(vaertPlan([], [])).toEqual({ opdater: [], indsaet: [], slet: [] });
  });

  it("en rådgiver-række indsættes uden gæstefelter, selv hvis udkastet bærer dem", () => {
    const plan = vaertPlan([], [{ user_id: "jonas", gaest_navn: "x", gaest_titel: "y", gaest_foto_path: "z" }]);
    expect(plan.indsaet).toEqual([{ user_id: "jonas", gaest_navn: null, gaest_titel: null, gaest_foto_path: null, raekkefoelge: 0 }]);
  });
});
