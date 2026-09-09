import { describe, expect, it } from "vitest";
import {
  afgoerRytme,
  EKSPORT_VEJE_TEKST,
  HISTORIK_FRA_DAG,
  HISTORIK_TIL_DAG,
  historikTekst,
  INTRO_PAAMINDELSE_FRA_DAG,
  introPaamindelseModen,
  introPaamindelseTekst,
  KOM_I_GANG_TIL_DAG,
  komIGangTekst,
  RYTME_LABEL,
  type RytmeInput,
  type RytmeTekst,
} from "@/lib/onboardingRytme";
import { EKSPORT_VEJE, HISTORIK_MAANEDER } from "@/lib/hjemmebane/rapporteringTekst";
import { byggTjekliste, TJEKLISTE_RAEKKEFOELGE } from "@/lib/onboardingTjekliste";

const NU = new Date(2026, 8, 9, 9, 0);
const start = (d: number) => new Date(2026, 8, 9 - d, 14).toISOString();
const ny = (d: number, over: Partial<RytmeInput> = {}): RytmeInput => ({
  medlemSiden: start(d),
  erLegat: false,
  antalUploads: 0,
  harMaaltRapport: false,
  alleredeSendt: [],
  ...over,
});

describe("afgoerRytme — A «Sådan kommer du i gang» (dag 0–1)", () => {
  it("dag 0 og dag 1 uden upload → kom_i_gang", () => {
    expect(afgoerRytme(ny(0), NU)).toEqual({ dage: 0, sendes: "kom_i_gang", grund: null });
    expect(afgoerRytme(ny(1), NU)).toEqual({ dage: 1, sendes: "kom_i_gang", grund: null });
    expect(KOM_I_GANG_TIL_DAG).toBe(1);
  });

  it("SIKRINGEN: fra dag 2 til dag 400 sendes A ALDRIG — første kørsel må ikke ramme de 25 gamle medlemmer", () => {
    for (let d = 2; d <= 400; d++) {
      const dom = afgoerRytme(ny(d), NU);
      expect(dom.sendes, `dag ${d}`).not.toBe("kom_i_gang");
    }
  });

  it("har de allerede uploadet, springes A over — de har gjort det mailen beder om", () => {
    expect(afgoerRytme(ny(0, { antalUploads: 1 }), NU)).toEqual({ dage: 0, sendes: null, grund: "har_uploadet" });
    expect(afgoerRytme(ny(1, { harMaaltRapport: true }), NU)).toEqual({ dage: 1, sendes: null, grund: "har_uploadet" });
  });

  it("stemplet er email_send_log-rækken: allerede sendt → ikke igen (dag 1 efter dag 0)", () => {
    expect(afgoerRytme(ny(1, { alleredeSendt: [RYTME_LABEL.kom_i_gang] }), NU)).toEqual({ dage: 1, sendes: null, grund: "allerede_sendt" });
  });

  it("legat får hverken A eller C — de har egen velkomst", () => {
    expect(afgoerRytme(ny(0, { erLegat: true }), NU).grund).toBe("legat");
    expect(afgoerRytme(ny(14, { erLegat: true }), NU).grund).toBe("legat");
  });

  it("uden start: ingen_start", () => {
    expect(afgoerRytme(ny(0, { medlemSiden: null }), NU)).toEqual({ dage: null, sendes: null, grund: "ingen_start" });
  });
});

describe("afgoerRytme — C «Historikken først» (dag 14–20, kun uden upload)", () => {
  it("dag 14 og dag 20 uden upload → historik; dag 13 og 21 ikke", () => {
    expect(afgoerRytme(ny(14), NU).sendes).toBe("historik");
    expect(afgoerRytme(ny(20), NU).sendes).toBe("historik");
    expect(afgoerRytme(ny(13), NU)).toEqual({ dage: 13, sendes: null, grund: "uden_for_vindue" });
    expect(afgoerRytme(ny(21), NU)).toEqual({ dage: 21, sendes: null, grund: "uden_for_vindue" });
    expect([HISTORIK_FRA_DAG, HISTORIK_TIL_DAG]).toEqual([14, 20]);
  });

  it("har de uploadet (også uden godkendelse), er der ingen historik-mail", () => {
    expect(afgoerRytme(ny(14, { antalUploads: 1 }), NU).grund).toBe("har_uploadet");
  });

  it("sendt én gang → ikke igen inden for vinduet", () => {
    expect(afgoerRytme(ny(16, { alleredeSendt: [RYTME_LABEL.historik] }), NU).grund).toBe("allerede_sendt");
    // A's stempel spærrer ikke C.
    expect(afgoerRytme(ny(16, { alleredeSendt: [RYTME_LABEL.kom_i_gang] }), NU).sendes).toBe("historik");
  });

  it("højst én mail pr. dag: vinduerne overlapper ikke", () => {
    for (let d = 0; d <= 30; d++) {
      const dom = afgoerRytme(ny(d), NU);
      const iA = d <= KOM_I_GANG_TIL_DAG;
      const iC = d >= HISTORIK_FRA_DAG && d <= HISTORIK_TIL_DAG;
      expect(dom.sendes).toBe(iA ? "kom_i_gang" : iC ? "historik" : null);
    }
  });
});

describe("introPaamindelseModen — B er dag 10, ikke dag 2 (Jonas 9/9)", () => {
  it("dag 2 og dag 9 er for tidligt; dag 10 og frem er modent", () => {
    expect(INTRO_PAAMINDELSE_FRA_DAG).toBe(10);
    expect(introPaamindelseModen(start(2), NU)).toBe(false);
    expect(introPaamindelseModen(start(9), NU)).toBe(false);
    expect(introPaamindelseModen(start(10), NU)).toBe(true);
    expect(introPaamindelseModen(start(45), NU)).toBe(true);
    expect(introPaamindelseModen(null, NU)).toBe(false);
  });
});

describe("teksterne — systemets stemme", () => {
  const alle: RytmeTekst[] = [komIGangTekst("Mette", true), komIGangTekst(null, false), historikTekst("Ib"), introPaamindelseTekst(null)];
  const fladt = (t: RytmeTekst) => [t.emne, t.overskrift, ...t.afsnit, ...t.punkter, t.knap.tekst, ...t.efterKnap].join(" ");

  it("ingen «jeg», «mig», «vi glæder os» og ingen underskrift — det er The Boardroom der taler, ikke et menneske", () => {
    for (const t of alle) {
      const s = fladt(t);
      expect(s).not.toMatch(/\bjeg\b/i);
      expect(s).not.toMatch(/\bmig\b/i);
      expect(s).not.toMatch(/glæder (os|mig)/i);
      expect(s).not.toMatch(/(venlig hilsen|mvh|kh)\b/i);
      expect(s).not.toMatch(/!/);
    }
  });

  it("A: tjeklistens punkter i tjeklistens rækkefølge, med og uden video", () => {
    const tjekliste = byggTjekliste({
      har_velkomstvideo: true, velkomstvideo_set_at: null, ask_me_about: null, website: null, industry_label: null,
      cvr_number: null, antal_rapporter: 0, antal_godkendte: 0, antal_udfyldte_handouts: 0, last_member_message_at: null,
    });
    const medVideo = komIGangTekst("Mette", true).punkter;
    expect(medVideo).toHaveLength(TJEKLISTE_RAEKKEFOELGE.length);
    tjekliste.punkter.forEach((p, i) => expect(medVideo[i].startsWith(p.titel)).toBe(true));
    const udenVideo = komIGangTekst("Mette", false).punkter;
    expect(udenVideo).toHaveLength(TJEKLISTE_RAEKKEFOELGE.length - 1);
    expect(udenVideo[0].startsWith("Din profil")).toBe(true);
  });

  it("A: historikken (3 måneder, også fra før medlemskabet) og løftet om Jonas eller Morten", () => {
    const s = fladt(komIGangTekst("Mette", false));
    expect(s).toContain(`de seneste ${HISTORIK_MAANEDER} måneder, gerne mere`);
    expect(s).toContain("også fra før du blev medlem");
    expect(s).toContain("Jonas eller Morten skriver til dig i chatten");
    expect(komIGangTekst("Mette", false).overskrift).toBe("Hej Mette,");
    expect(komIGangTekst("  ", false).overskrift).toBe("Hej,");
  });

  it("C: eksportvejene er ordret dem på /rapportering", () => {
    expect(EKSPORT_VEJE_TEKST).toEqual(EKSPORT_VEJE.map((v) => `${v.system}: ${v.vej}`));
    const c = historikTekst(null);
    expect(c.punkter).toEqual(EKSPORT_VEJE_TEKST);
    expect(c.knap.sti).toBe("/rapportering");
    expect(fladt(c)).toContain(`de seneste ${HISTORIK_MAANEDER} måneder`);
  });

  it("B: Morten i tredje person, ingen «med mig til gode»", () => {
    const b = introPaamindelseTekst("Ib");
    expect(b.emne).toBe("Din sparring med Morten er inkluderet");
    expect(fladt(b)).toContain("sparring med Morten");
    expect(fladt(b)).not.toContain("til gode");
    expect(b.knap.sti).toBe("/book-session");
  });
});
