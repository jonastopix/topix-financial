import { describe, expect, it } from "vitest";
import {
  afstandMinutter,
  ALARM_NOEGLE_PRAEFIKS,
  ALARM_VINDUE_MIN,
  alarmGrupper,
  alarmNoegle,
  alarmTekst,
  danskDatoOgTime,
  FOERSTE_AFSTAND_MIN,
  GENSEND_UDFALD,
  type GensendRaekke,
  KONFIGURATION_UDFALD,
  MAKS_FORSOEG,
  OPGIV_UDFALD,
  TRAPPE_MINUTTER,
  vaelgGensendelser,
  VINDUE_TIMER,
} from "../../../supabase/functions/_shared/klaviyoGensend.ts";

/**
 * Gensenderens dom (21/9-2026) — én prøve pr. regel i filhovedet på
 * _shared/klaviyoGensend.ts, inklusive grænserne: 24 t, afstanden 5·2^(n−1),
 * seks forsøg, og at én ok-række afslutter gruppen.
 */

const NU = new Date("2026-09-22T12:00:00Z");
const MIN = 60_000;
const TIME = 3_600_000;

let taeller = 0;
/** En række `minutterSiden` minutter før NU. Kroppen er en rigtig hændelseskrop, så ikke_sendt-reglen ikke rammer. */
function raekke(over: Partial<GensendRaekke> & { minutterSiden: number }): GensendRaekke {
  const { minutterSiden, ...rest } = over;
  taeller++;
  return {
    id: `id-${String(taeller).padStart(4, "0")}`,
    sendt_at: new Date(NU.getTime() - minutterSiden * MIN).toISOString(),
    metric: "Deltog i webinar",
    email: "a@b.dk",
    unikt_id: "reg_1:set",
    udfald: "timeout",
    sendt: { data: { type: "event", attributes: { unique_id: "reg_1:set", time: "2026-09-22T09:00:00.000Z", properties: { frisk: "ja" } } } },
    ...rest,
  };
}

const kun = (u: ReturnType<typeof vaelgGensendelser>) => ({
  gensend: u.gensend.length, opgivet: u.opgivet.length, konfiguration: u.konfiguration.length, ...u.ignoreret, grupper: u.grupper,
});

describe("klaviyoGensend — konstanterne og regnestykket", () => {
  it("afstanden er 5 · 2^(forsøg − 1): 5, 10, 20, 40, 80 — i alt 155 minutter, og højst 6 forsøg", () => {
    expect(FOERSTE_AFSTAND_MIN).toBe(5);
    expect([1, 2, 3, 4, 5].map(afstandMinutter)).toEqual([5, 10, 20, 40, 80]);
    expect([1, 2, 3, 4, 5].map(afstandMinutter).reduce((a, b) => a + b, 0)).toBe(TRAPPE_MINUTTER);
    expect(TRAPPE_MINUTTER).toBe(155);
    expect(MAKS_FORSOEG).toBe(6);
    expect(VINDUE_TIMER).toBe(24);
    // Under 1 regnes som 1 — der findes ikke et nulte forsøg.
    expect(afstandMinutter(0)).toBe(5);
  });

  it("udfaldene står på præcis de besluttede lister", () => {
    expect([...GENSEND_UDFALD]).toEqual(["timeout", "fejl", "loft", "ingen_noegle", "noegle_afvist"]);
    expect([...OPGIV_UDFALD]).toEqual(["ugyldig"]);
    expect([...KONFIGURATION_UDFALD]).toEqual(["ingen_noegle", "noegle_afvist"]);
  });
});

describe("klaviyoGensend — regel 1: grupperingen og ok-rækken", () => {
  it("én ok-række gør gruppen færdig — også når fejlen kom EFTER ok'et", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 30, udfald: "ok" }), raekke({ minutterSiden: 20, udfald: "timeout" })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, opgivet: 0, ok: 1, grupper: 1 });
  });

  it("grupperingen er (metric, email, unikt_id): samme id med anden mail eller anden metric er en anden gruppe", () => {
    const u = vaelgGensendelser([
      raekke({ minutterSiden: 30 }),
      raekke({ minutterSiden: 30, email: "c@d.dk" }),
      raekke({ minutterSiden: 30, metric: "Moedte ikke op" }),
      raekke({ minutterSiden: 30, unikt_id: "reg_2:set" }),
    ], NU);
    expect(u.grupper).toBe(4);
    expect(u.gensend).toHaveLength(4);
  });

  it("kroppen, der sendes igen, er det FØRSTE forsøgs — originalen, med dens id som kilde", () => {
    const foerste = raekke({ minutterSiden: 40, sendt: { data: { type: "event", attributes: { unique_id: "reg_1:set", time: "T0" } } } });
    const andet = raekke({ minutterSiden: 20, sendt: { data: { type: "event", attributes: { unique_id: "reg_1:set", time: "T0" } } } });
    const u = vaelgGensendelser([andet, foerste], NU);
    expect(u.gensend[0].kilde_id).toBe(foerste.id);
    expect(u.gensend[0].krop).toBe(foerste.sendt);
    expect(u.gensend[0].forsoeg).toBe(2);
    expect(u.gensend[0].foerste_at).toBe(foerste.sendt_at);
    expect(u.gensend[0].sidste_at).toBe(andet.sendt_at);
  });
});

describe("klaviyoGensend — regel 2: udfaldene", () => {
  for (const udfald of GENSEND_UDFALD) {
    it(`«${udfald}» gensendes, når afstanden er gået`, () => {
      const u = vaelgGensendelser([raekke({ minutterSiden: 5, udfald })], NU);
      expect(u.gensend).toHaveLength(1);
      expect(u.gensend[0].sidste_udfald).toBe(udfald);
    });
  }

  it("«ugyldig» opgives straks — Klaviyo læste kroppen og afviste den", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 60, udfald: "ugyldig" })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, opgivet: 1 });
    expect(u.opgivet[0].grund).toBe("ugyldig");
  });

  it("«ugyldig» som SENESTE udfald opgiver også en gruppe, der før havde timeout", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 60, udfald: "timeout" }), raekke({ minutterSiden: 50, udfald: "ugyldig" })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, opgivet: 1 });
  });

  it("«ingen_mail» ignoreres helt — den tæller ikke som et forsøg på nogen gruppe", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 60, udfald: "ingen_mail", sendt: { ikke_sendt: "ingen_mail", metric: "x", unique_id: "y" } })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, opgivet: 0, ingen_mail: 1, grupper: 0 });
  });

  it("en række, hvis krop bærer nøglen ikke_sendt, ignoreres — uanset udfald", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 60, udfald: "fejl", sendt: { ikke_sendt: "noget", metric: "x" } })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, ikke_sendt: 1, grupper: 0 });
  });

  it("et udfald, dommen ikke kender, sendes ikke — det tælles som ubrugeligt", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 60, udfald: "noget_nyt" })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, opgivet: 0, ubrugelig: 1 });
  });

  it("en række uden brugbart sendt_at tælles som ubrugelig og danner ingen gruppe", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 0, sendt_at: "ikke en dato" })], NU);
    expect(kun(u)).toMatchObject({ ubrugelig: 1, grupper: 0 });
  });
});

describe("klaviyoGensend — regel 3: vinduet på 24 timer måles på det FØRSTE forsøg", () => {
  it("23 t 59 min gammelt første forsøg er inde; præcis 24 t er ude", () => {
    const inde = vaelgGensendelser([raekke({ minutterSiden: 24 * 60 - 1 })], NU);
    expect(kun(inde)).toMatchObject({ gensend: 1, for_gammel: 0 });
    const ude = vaelgGensendelser([raekke({ minutterSiden: 24 * 60 })], NU);
    expect(kun(ude)).toMatchObject({ gensend: 0, for_gammel: 1 });
  });

  it("et nyt forsøg i vinduet redder ikke en gruppe, hvis første forsøg er for gammelt", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 25 * 60 }), raekke({ minutterSiden: 30 })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, for_gammel: 1 });
  });

  it("for gammel går forud for alarmen: en opgivet gruppe uden for vinduet alarmerer ikke", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 30 * 60, udfald: "ugyldig" })], NU);
    expect(kun(u)).toMatchObject({ opgivet: 0, for_gammel: 1 });
  });
});

describe("klaviyoGensend — regel 4: afstanden 5 · 2^(forsøg − 1) måles på det SIDSTE forsøg", () => {
  const trappe: [number, number][] = [[1, 5], [2, 10], [3, 20], [4, 40], [5, 80]];
  for (const [forsoeg, min] of trappe) {
    it(`efter ${forsoeg} forsøg: ${min - 1} min 59 s er for tidligt, ${min} min er nok`, () => {
      const byg = (sidsteSiden: number) => {
        const rk: GensendRaekke[] = [];
        // De tidligere forsøg ligger langt tilbage (men inden for 24 t), det sidste præcis `sidsteSiden` minutter siden.
        for (let n = 1; n < forsoeg; n++) rk.push(raekke({ minutterSiden: 20 * 60 - n }));
        rk.push(raekke({ minutterSiden: sidsteSiden }));
        return rk;
      };
      const forTidligt = vaelgGensendelser(byg(min - 1 / 60), NU);
      expect(kun(forTidligt)).toMatchObject({ gensend: 0, venter: 1 });
      const nok = vaelgGensendelser(byg(min), NU);
      expect(kun(nok)).toMatchObject({ gensend: 1, venter: 0 });
      expect(nok.gensend[0].forsoeg).toBe(forsoeg);
    });
  }

  it("et sidste forsøg i fremtiden (nu givet ind før det) venter", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: -3 })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, venter: 1 });
  });
});

describe("klaviyoGensend — regel 5: højst seks forsøg", () => {
  const seks = () => [1, 2, 3, 4, 5, 6].map((n) => raekke({ minutterSiden: 300 - n * 30 }));

  it("fem forsøg uden ok: sendes igen (det sjette); seks forsøg uden ok: opgivet", () => {
    const fem = vaelgGensendelser(seks().slice(0, 5), NU);
    expect(kun(fem)).toMatchObject({ gensend: 1, opgivet: 0 });
    const alle = vaelgGensendelser(seks(), NU);
    expect(kun(alle)).toMatchObject({ gensend: 0, opgivet: 1 });
    expect(alle.opgivet[0].grund).toBe("forsoeg_opbrugt");
    expect(alle.opgivet[0].forsoeg).toBe(6);
  });

  it("forsøgene bruges op, uanset hvor lang tid der er gået siden det sidste", () => {
    const u = vaelgGensendelser([...seks(), raekke({ minutterSiden: 1 })], NU);
    expect(kun(u)).toMatchObject({ gensend: 0, opgivet: 1 });
  });
});

describe("klaviyoGensend — regel 6: konfiguration og alarmen", () => {
  for (const udfald of KONFIGURATION_UDFALD) {
    it(`«${udfald}» står i konfiguration OG gensendes, når afstanden er gået`, () => {
      const u = vaelgGensendelser([raekke({ minutterSiden: 6, udfald })], NU);
      expect(kun(u)).toMatchObject({ gensend: 1, konfiguration: 1 });
      const venter = vaelgGensendelser([raekke({ minutterSiden: 1, udfald })], NU);
      expect(kun(venter)).toMatchObject({ gensend: 0, konfiguration: 1, venter: 1 });
    });
  }

  it("en gruppe, hvis seneste udfald IKKE er en nøglefejl, står ikke i konfiguration — heller ikke hvis den var det før", () => {
    const u = vaelgGensendelser([raekke({ minutterSiden: 30, udfald: "ingen_noegle" }), raekke({ minutterSiden: 10, udfald: "timeout" })], NU);
    expect(kun(u)).toMatchObject({ konfiguration: 0, gensend: 1 });
  });

  it("alarmGrupper lister opgivne først, så konfiguration — ingen gruppe to gange", () => {
    // Alle tre med sidste forsøg inden for ALARM_VINDUE_MIN (60 min) — ellers er de ikke alarmens.
    const u = vaelgGensendelser([
      raekke({ minutterSiden: 30, udfald: "ugyldig", unikt_id: "a" }),
      raekke({ minutterSiden: 6, udfald: "noegle_afvist", unikt_id: "b" }),
      ...[1, 2, 3, 4, 5, 6].map((n) => raekke({ minutterSiden: n === 6 ? 45 : 300 - n * 30, udfald: "ingen_noegle", unikt_id: "c" })),
    ], NU);
    const a = alarmGrupper(u, NU);
    expect(a.map((g) => [g.art, g.udfald, g.forsoeg])).toEqual([
      ["opgivet: ugyldig", "ugyldig", 1],
      ["opgivet: forsoeg_opbrugt", "ingen_noegle", 6],
      ["konfiguration", "noegle_afvist", 1],
    ]);
    // Seks forsøg med nøglefejl er opgivet — ikke også konfiguration.
    expect(u.konfiguration.map((g) => g.unikt_id)).toEqual(["b"]);
  });

  it("alarmen tager KUN grupper med sidste forsøg inden for ALARM_VINDUE_MIN: 59 min med, 60 min ude", () => {
    expect(ALARM_VINDUE_MIN).toBe(60);
    const opgivet59 = vaelgGensendelser([raekke({ minutterSiden: 59, udfald: "ugyldig", unikt_id: "a" })], NU);
    expect(alarmGrupper(opgivet59, NU).map((g) => g.art)).toEqual(["opgivet: ugyldig"]);
    const opgivet60 = vaelgGensendelser([raekke({ minutterSiden: 60, udfald: "ugyldig", unikt_id: "a" })], NU);
    expect(opgivet60.opgivet).toHaveLength(1); // tørkørslens svar viser den stadig i fuld længde
    expect(alarmGrupper(opgivet60, NU)).toEqual([]);
    // Konfiguration med seneste forsøg 61 min siden: står i konfiguration (og gensend), men ikke i alarmen.
    const konfig61 = vaelgGensendelser([raekke({ minutterSiden: 61, udfald: "noegle_afvist", unikt_id: "b" })], NU);
    expect(konfig61.konfiguration).toHaveLength(1);
    expect(konfig61.gensend).toHaveLength(1);
    expect(alarmGrupper(konfig61, NU)).toEqual([]);
    // Seks forsøg, det sidste 30 min siden: opgivet OG i alarmen — det er det sidste forsøg, der tæller, ikke det første.
    const opbrugt = vaelgGensendelser([1, 2, 3, 4, 5, 6].map((n) => raekke({ minutterSiden: n === 6 ? 30 : 20 * 60 - n, unikt_id: "c" })), NU);
    expect(alarmGrupper(opbrugt, NU).map((g) => g.art)).toEqual(["opgivet: forsoeg_opbrugt"]);
  });

  it("regnestykket: et 60-minutters vindue spænder over højst to timenøgler — en ændring giver højst to mails", () => {
    // Sidste forsøg 09:50 dansk. Kørsler 09:55 (nøgle T09) og 10:45 (nøgle T10) tager gruppen med; 10:50 gør ikke.
    const sidste = new Date("2026-09-22T07:50:00Z"); // 09:50 CEST
    const rk = [raekke({ minutterSiden: 0, udfald: "ugyldig", sendt_at: sidste.toISOString() })];
    const noegler = new Set<string>();
    for (const min of [5, 30, 55, 59]) {
      const nu = new Date(sidste.getTime() + min * 60_000);
      const u = vaelgGensendelser(rk, nu);
      if (alarmGrupper(u, nu).length > 0) noegler.add(alarmNoegle(nu));
    }
    expect([...noegler]).toEqual([`${ALARM_NOEGLE_PRAEFIKS}2026-09-22T09`, `${ALARM_NOEGLE_PRAEFIKS}2026-09-22T10`]);
    const ude = new Date(sidste.getTime() + 60 * 60_000);
    expect(alarmGrupper(vaelgGensendelser(rk, ude), ude)).toEqual([]);
  });

  it("nøglen bærer dansk dato og time — én mail pr. time, også over døgnskiftet og om vinteren", () => {
    expect(danskDatoOgTime(new Date("2026-09-21T22:30:00Z"))).toBe("2026-09-22T00"); // CEST = UTC+2
    expect(danskDatoOgTime(new Date("2026-09-22T07:04:59Z"))).toBe("2026-09-22T09");
    expect(danskDatoOgTime(new Date("2026-09-22T07:59:59Z"))).toBe("2026-09-22T09");
    expect(danskDatoOgTime(new Date("2026-09-22T08:00:00Z"))).toBe("2026-09-22T10");
    expect(danskDatoOgTime(new Date("2026-12-01T10:00:00Z"))).toBe("2026-12-01T11"); // CET = UTC+1
    expect(alarmNoegle(new Date("2026-09-22T07:04:59Z"))).toBe(`${ALARM_NOEGLE_PRAEFIKS}2026-09-22T09`);
  });

  it("alarmteksten tæller, lister hver gruppe med metric, mail, udfald og forsøg — og titlen bærer dato og time", () => {
    const t = alarmTekst([
      { metric: "Deltog i webinar", email: "a@b.dk", udfald: "timeout", forsoeg: 6, art: "opgivet: forsoeg_opbrugt" },
      { metric: "Moedte ikke op", email: "c@d.dk", udfald: "noegle_afvist", forsoeg: 2, art: "konfiguration" },
    ], new Date("2026-09-22T07:30:00Z"));
    expect(t.emne).toBe("2 Klaviyo-hændelser kunne ikke sendes — gensenderen har brug for et menneske");
    expect(t.titel).toBe("Klaviyo: 2 Klaviyo-hændelser kunne ikke sendes (2026-09-22 kl. 09)");
    expect(t.afsnit[0]).toContain("opgivet 1 hændelse");
    expect(t.afsnit[0]).toContain("1 hændelse, der fejler på nøglen");
    expect(t.blokke).toEqual([
      { overskrift: "Deltog i webinar · a@b.dk", tekst: "opgivet: forsoeg_opbrugt · 6 forsøg · seneste udfald: timeout — Klaviyo svarede ikke inden for 3 s" },
      { overskrift: "Moedte ikke op · c@d.dk", tekst: "konfiguration · 2 forsøg · seneste udfald: noegle_afvist — Klaviyo afviste nøglen (401/403)" },
    ]);
    expect(t.tekst).toContain("Deltog i webinar · a@b.dk: opgivet");
    expect(t.tekst).toContain("kald_edge('klaviyo-gensend-cron'");
    const en = alarmTekst([{ metric: "x", email: "y", udfald: "fejl", forsoeg: 1, art: "opgivet: ugyldig" }], new Date("2026-09-22T07:30:00Z"));
    expect(en.emne).toMatch(/^1 Klaviyo-hændelse kunne/);
  });
});

describe("klaviyoGensend — rækkefølgen og tomme input", () => {
  it("gensend er ordnet efter første forsøg, ældst først — så en kørsel på budget tager de ældste", () => {
    const u = vaelgGensendelser([
      raekke({ minutterSiden: 10, unikt_id: "ung" }),
      raekke({ minutterSiden: 200, unikt_id: "gammel" }),
      raekke({ minutterSiden: 50, unikt_id: "midt" }),
    ], NU);
    expect(u.gensend.map((g) => g.unikt_id)).toEqual(["gammel", "midt", "ung"]);
  });

  it("ingen rækker: intet at gøre, ingen alarm", () => {
    const u = vaelgGensendelser([], NU);
    expect(kun(u)).toEqual({ gensend: 0, opgivet: 0, konfiguration: 0, ok: 0, venter: 0, for_gammel: 0, ingen_mail: 0, ikke_sendt: 0, ubrugelig: 0, grupper: 0 });
    expect(alarmGrupper(u, NU)).toEqual([]);
  });
});
