import { describe, expect, it } from "vitest";
import {
  afholdteSessioner,
  andel,
  annoncespor,
  annonceAf,
  ansoegerMails,
  ansoegningskobling,
  dagKey,
  datoLang,
  kampagneAf,
  kildeAf,
  naesteWebinar,
  omHvorLaenge,
  pct,
  taelDeltagelse,
  UDEN_ANNONCE,
  UDEN_KAMPAGNE,
  vaertsnavn,
  webinarDashboard,
  type Tilmelding,
} from "@/lib/webinar/dashboard";

/**
 * Webinarfladens dom (udkast 19/9-2026). Tallene er PERSONER; graden
 * («set» ≥ 75 %) er webinarDom's og testes der — her testes grupperingen,
 * tilskrivningen af annoncesporet og koblingen til ansøgningerne.
 *
 * NU er sat til lørdag 19/9-2026 kl. 10.00 dansk tid, så det næste webinar
 * i fixturen er tirsdag 22/9 — Jonas' rigtige situation.
 */
const NU = new Date("2026-09-19T08:00:00.000Z");
const T22 = "2026-09-22T08:00:00.000Z";
const T15 = "2026-09-15T08:00:00.000Z";
const T08 = "2026-09-08T08:00:00.000Z";

/**
 * Fixturen sætter HVERT annoncespor-felt eksplicit til null. Det er med
 * vilje: felterne er valgfrie i fladens egen type (så siden kan bygges før
 * migration 20260919150000), men obligatoriske i webinarDom's WebinarTilmelding
 * når plukket er landet — og en fixture der udelader dem, ville holde op med
 * at kompilere netop den dag. Nul udeladelser, ét udtryk.
 */
const UDEN_SPOR = {
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
  fbclid: null, origin: null, first_origin: null, referrer: null, first_referrer: null,
  widget_source: null, by: null, land: null, enhed: null, tidszone: null,
} as const;

const R = (r: Partial<Tilmelding> & { email: string }): Tilmelding => ({
  ewebinar_id: `id-${r.email}-${r.session_tid ?? "x"}`,
  navn: null,
  webinar_id: "w1",
  webinar_titel: "Sådan får du styr på tallene",
  session_tid: T22,
  session_type: "Scheduled",
  registreret_at: "2026-09-18T09:00:00.000Z",
  state: null,
  sidste_action: null,
  attended: null,
  subscribed: null,
  set_procent: null,
  set_procent_kilde: null,
  ...UDEN_SPOR,
  ...r,
});

describe("andel og pct — nævneren nul er null, aldrig NaN og aldrig «0 %»", () => {
  it("regner og formaterer", () => {
    expect(andel(3, 4)).toBe(0.75);
    expect(pct(0.75)).toBe("75 %");
    expect(pct(null)).toBe("–");
  });

  it("nul og negativ nævner giver null", () => {
    expect(andel(0, 0)).toBeNull();
    expect(andel(5, 0)).toBeNull();
    expect(andel(1, -2)).toBeNull();
  });
});

describe("datoLang, dagKey og omHvorLaenge — dansk tid", () => {
  it("skriver sessionen ud", () => {
    const d = datoLang(T22);
    expect(d).toContain("tirsdag");
    expect(d).toContain("22");
    expect(d).toContain("september");
  });

  it("dagKey er dagen i Europe/Copenhagen, ikke i UTC", () => {
    // 21/9 kl. 23.30 UTC er 22/9 kl. 01.30 dansk tid.
    expect(dagKey("2026-09-21T23:30:00.000Z")).toBe("2026-09-22");
  });

  it("omHvorLaenge tæller dage; i dag og i morgen har egne ord", () => {
    expect(omHvorLaenge(T22, NU)).toBe("om 3 dage");
    expect(omHvorLaenge("2026-09-19T20:00:00.000Z", NU)).toBe("i dag");
    expect(omHvorLaenge("2026-09-20T10:00:00.000Z", NU)).toBe("i morgen");
  });

  it("manglende eller ulæselig tid giver null", () => {
    expect(datoLang(null)).toBeNull();
    expect(dagKey("ikke en dato")).toBeNull();
    expect(omHvorLaenge(null, NU)).toBeNull();
  });
});

describe("taelDeltagelse — personer, ikke rækker; bedste grad vinder", () => {
  it("tæller de fire tal og de to andele", () => {
    const d = taelDeltagelse([
      R({ email: "a@x.dk", session_tid: T15, set_procent: 92 }),
      R({ email: "b@x.dk", session_tid: T15, set_procent: 40 }),
      R({ email: "c@x.dk", session_tid: T15, state: "Missed" }),
      R({ email: "d@x.dk", session_tid: T15 }),
    ], NU);
    expect(d).toMatchObject({ tilmeldte: 4, moedteOp: 2, saaFaerdigt: 1, delvist: 1, moedteIkke: 1, ukendt: 1 });
    expect(d.fremmoedeAndel).toBe(0.5);
    expect(d.gennemfoerselAndel).toBe(0.5);
  });

  it("samme mail to gange er ÉN person, og den bedste grad vinder", () => {
    const d = taelDeltagelse([
      R({ email: "a@x.dk", ewebinar_id: "r1", session_tid: T15, set_procent: 90 }),
      R({ email: "a@x.dk", ewebinar_id: "r2", session_tid: T15, state: "Missed" }),
    ], NU);
    expect(d.tilmeldte).toBe(1);
    expect(d.saaFaerdigt).toBe(1);
    expect(d.moedteIkke).toBe(0);
  });

  it("gennemsnittet vejes kun på dem der HAR et tal — 0 % er ikke et tal", () => {
    const d = taelDeltagelse([
      R({ email: "a@x.dk", session_tid: T15, set_procent: 80 }),
      R({ email: "b@x.dk", session_tid: T15, set_procent: 40 }),
      R({ email: "c@x.dk", session_tid: T15, set_procent: 0 }),
    ], NU);
    expect(d.medProcent).toBe(2);
    expect(d.gennemsnitProcent).toBe(60);
  });

  it("en tom liste giver nuller og null-andele, ikke NaN", () => {
    const d = taelDeltagelse([], NU);
    expect(d.tilmeldte).toBe(0);
    expect(d.fremmoedeAndel).toBeNull();
    expect(d.gennemsnitProcent).toBeNull();
  });
});

describe("naesteWebinar — den nærmeste session efter nu", () => {
  it("finder 22/9 og tæller personerne på præcis den session", () => {
    const n = naesteWebinar([
      R({ email: "a@x.dk", session_tid: T22 }),
      R({ email: "b@x.dk", session_tid: T22 }),
      R({ email: "c@x.dk", session_tid: "2026-09-29T08:00:00.000Z" }),
      R({ email: "d@x.dk", session_tid: T15 }),
    ], NU);
    expect(n?.sessionTid).toBe(T22);
    expect(n?.personer).toBe(2);
    expect(n?.titel).toBe("Sådan får du styr på tallene");
    expect(n?.omHvorLaenge).toBe("om 3 dage");
  });

  it("samme mail to gange til samme session tæller én", () => {
    const n = naesteWebinar([
      R({ email: "a@x.dk", ewebinar_id: "r1", session_tid: T22 }),
      R({ email: "a@x.dk", ewebinar_id: "r2", session_tid: T22 }),
    ], NU);
    expect(n?.personer).toBe(1);
  });

  it("tilmeldinger pr. dag er sorteret ældst først og bygger kun på registreret_at", () => {
    const n = naesteWebinar([
      R({ email: "a@x.dk", registreret_at: "2026-09-18T09:00:00.000Z" }),
      R({ email: "b@x.dk", registreret_at: "2026-09-17T09:00:00.000Z" }),
      R({ email: "c@x.dk", registreret_at: "2026-09-18T20:00:00.000Z" }),
      R({ email: "d@x.dk", registreret_at: null }),
    ], NU);
    expect(n?.prDag).toEqual([{ dag: "2026-09-17", antal: 1 }, { dag: "2026-09-18", antal: 2 }]);
    expect(n?.personer).toBe(4);
  });

  it("uden fremtidig session — og for Replay uden sessionstid — er der intet næste", () => {
    expect(naesteWebinar([R({ email: "a@x.dk", session_tid: T15 })], NU)).toBeNull();
    expect(naesteWebinar([R({ email: "a@x.dk", session_tid: null, session_type: "Replay" })], NU)).toBeNull();
    expect(naesteWebinar([], NU)).toBeNull();
  });
});

describe("afholdteSessioner — sessionen er enheden, nyeste først", () => {
  it("grupperer pr. webinar + sessionstid og udelader de kommende", () => {
    const s = afholdteSessioner([
      R({ email: "a@x.dk", session_tid: T15, set_procent: 90 }),
      R({ email: "b@x.dk", session_tid: T15, state: "Missed" }),
      R({ email: "c@x.dk", session_tid: T08, set_procent: 50 }),
      R({ email: "d@x.dk", session_tid: T22 }),
    ], NU);
    expect(s.map((x) => x.sessionTid)).toEqual([T15, T08]);
    expect(s[0]).toMatchObject({ tilmeldte: 2, moedteOp: 1, saaFaerdigt: 1, moedteIkke: 1, dato: "15/9" });
    expect(s[1]).toMatchObject({ tilmeldte: 1, delvist: 1, saaFaerdigt: 0 });
  });

  it("to webinarer på samme tid er to linjer", () => {
    const s = afholdteSessioner([
      R({ email: "a@x.dk", webinar_id: "w1", session_tid: T15 }),
      R({ email: "b@x.dk", webinar_id: "w2", session_tid: T15 }),
    ], NU);
    expect(s).toHaveLength(2);
  });

  it("rækker uden sessionstid (optagelsen) får deres egen linje, sidst", () => {
    const s = afholdteSessioner([
      R({ email: "a@x.dk", session_tid: T15 }),
      R({ email: "b@x.dk", session_tid: null, session_type: "Replay", set_procent: 88 }),
    ], NU);
    expect(s).toHaveLength(2);
    expect(s[1].sessionTid).toBeNull();
    expect(s[1].dato).toBeNull();
    expect(s[1].sessionType).toBe("Replay");
    expect(s[1].saaFaerdigt).toBe(1);
  });

  it("ingen afholdte sessioner giver en tom liste", () => {
    expect(afholdteSessioner([R({ email: "a@x.dk", session_tid: T22 })], NU)).toEqual([]);
    expect(afholdteSessioner([], NU)).toEqual([]);
  });
});

describe("kildeAf, kampagneAf, annonceAf og vaertsnavn", () => {
  it("oversætter kendte kilder og lader ukendte stå som annoncøren skrev dem", () => {
    expect(kildeAf(R({ email: "a@x.dk", utm_source: "fb" }))).toBe("Facebook");
    expect(kildeAf(R({ email: "a@x.dk", utm_source: "Meta" }))).toBe("Facebook");
    expect(kildeAf(R({ email: "a@x.dk", utm_source: "linkedin" }))).toBe("LinkedIn");
    expect(kildeAf(R({ email: "a@x.dk", utm_source: "podcast-x" }))).toBe("podcast-x");
  });

  it("uden utm_source bruges referrerens værtsnavn, ellers «direkte»", () => {
    expect(kildeAf(R({ email: "a@x.dk", referrer: "https://www.facebook.com/noget" }))).toBe("facebook.com");
    expect(kildeAf(R({ email: "a@x.dk", first_referrer: "https://google.com/" }))).toBe("google.com");
    expect(kildeAf(R({ email: "a@x.dk" }))).toBe("direkte");
    expect(kildeAf(R({ email: "a@x.dk", utm_source: "   " }))).toBe("direkte");
  });

  it("vaertsnavn tåler noget der ikke er en URL", () => {
    expect(vaertsnavn("ikke en url")).toBeNull();
    expect(vaertsnavn(null)).toBeNull();
    expect(vaertsnavn("")).toBeNull();
  });

  it("kampagne og annonce falder tilbage på navngivne ord, aldrig på tom streng", () => {
    expect(kampagneAf(R({ email: "a@x.dk" }))).toBe(UDEN_KAMPAGNE);
    expect(annonceAf(R({ email: "a@x.dk" }))).toBe(UDEN_ANNONCE);
    expect(annonceAf(R({ email: "a@x.dk", utm_term: "regnskab" }))).toBe("regnskab");
    expect(annonceAf(R({ email: "a@x.dk", utm_content: "annonce-3", utm_term: "regnskab" }))).toBe("annonce-3");
  });
});

describe("annoncespor — fra annoncen til deltagelsen til ansøgningen", () => {
  const MAILS = new Set(["a@x.dk"]);
  const raekker = [
    R({ email: "a@x.dk", session_tid: T15, set_procent: 90, utm_source: "fb", utm_medium: "paid", utm_campaign: "sep", utm_content: "annonce-1" }),
    R({ email: "b@x.dk", session_tid: T15, set_procent: 30, utm_source: "fb", utm_medium: "paid", utm_campaign: "sep", utm_content: "annonce-2" }),
    R({ email: "c@x.dk", session_tid: T15, state: "Missed", utm_source: "fb", utm_campaign: "sep", utm_content: "annonce-1" }),
    R({ email: "d@x.dk", session_tid: T15, set_procent: 80 }),
  ];

  it("grupperer pr. kilde med deltagelse OG ansøgere", () => {
    const s = annoncespor(raekker, MAILS, NU, true);
    expect(s.sporFindes).toBe(true);
    expect(s.kilder.map((k) => k.navn)).toEqual(["Facebook", "direkte"]);
    expect(s.kilder[0]).toMatchObject({ tilmeldte: 3, moedteOp: 2, saaFaerdigt: 1, ansoegte: 1 });
    expect(s.kilder[0].ansoegerAndel).toBeCloseTo(1 / 3);
    expect(s.kilder[0].raa).toEqual(["fb", "paid"]);
    expect(s.kilder[1]).toMatchObject({ navn: "direkte", tilmeldte: 1, saaFaerdigt: 1, ansoegte: 0 });
  });

  it("kampagnen bærer annoncerne foldet ind, største først", () => {
    const s = annoncespor(raekker, MAILS, NU, true);
    const sep = s.kampagner.find((k) => k.navn === "sep");
    expect(sep?.tilmeldte).toBe(3);
    expect(sep?.annoncer.map((a) => a.navn)).toEqual(["annonce-1", "annonce-2"]);
    expect(sep?.annoncer[0]).toMatchObject({ tilmeldte: 2, saaFaerdigt: 1, ansoegte: 1 });
  });

  it("personen tilskrives sin FØRSTE tilmelding — annoncen der hentede hende ind", () => {
    const s = annoncespor([
      R({ email: "a@x.dk", ewebinar_id: "r1", session_tid: T08, registreret_at: "2026-09-01T09:00:00.000Z", utm_source: "fb", utm_campaign: "aug" }),
      R({ email: "a@x.dk", ewebinar_id: "r2", session_tid: T15, registreret_at: "2026-09-10T09:00:00.000Z", utm_source: "google", utm_campaign: "sep" }),
    ], new Set(), NU, true);
    expect(s.personer).toBe(1);
    expect(s.kilder.map((k) => k.navn)).toEqual(["Facebook"]);
    expect(s.kampagner.map((k) => k.navn)).toEqual(["aug"]);
    expect(s.flereKilder).toBe(1);
  });

  it("en tilmelding UDEN tid taber mod en med tid, når den første skal findes", () => {
    const s = annoncespor([
      R({ email: "a@x.dk", ewebinar_id: "r1", registreret_at: null, utm_source: "google" }),
      R({ email: "a@x.dk", ewebinar_id: "r2", registreret_at: "2026-09-10T09:00:00.000Z", utm_source: "fb" }),
    ], new Set(), NU, true);
    expect(s.kilder.map((k) => k.navn)).toEqual(["Facebook"]);
  });

  it("uden kolonnerne i basen er sporFindes falsk, selv når rækkerne er der", () => {
    expect(annoncespor(raekker, MAILS, NU, false).sporFindes).toBe(false);
  });

  it("med kolonnerne, men uden ét eneste spor, er sporFindes også falsk", () => {
    const s = annoncespor([R({ email: "a@x.dk" })], new Set(), NU, true);
    expect(s.sporFindes).toBe(false);
    expect(s.kilder.map((k) => k.navn)).toEqual(["direkte"]);
  });

  it("fbclid alene tæller som et spor — Metas klik-id er det hele vejen handler om", () => {
    expect(annoncespor([R({ email: "a@x.dk", fbclid: "IwAR-abc" })], new Set(), NU, true).sporFindes).toBe(true);
  });

  it("nul rækker giver et tomt, gyldigt spor", () => {
    expect(annoncespor([], new Set(), NU, true)).toEqual({ sporFindes: false, kilder: [], kampagner: [], flereKilder: 0, kunFbclid: 0, personer: 0 });
  });
});

describe("ansoegningskobling — mailen er koblingen, og kun indsendte tæller", () => {
  it("regner begge veje", () => {
    const k = ansoegningskobling(
      [R({ email: "a@x.dk" }), R({ email: "b@x.dk" }), R({ email: "c@x.dk" })],
      [
        { email: "a@x.dk", indsendt_at: "2026-09-18T10:00:00.000Z" },
        { email: "z@x.dk", indsendt_at: "2026-09-18T10:00:00.000Z" },
      ],
    );
    expect(k).toMatchObject({ tilmeldte: 3, ansoegte: 1, ansoegereIAlt: 2, ansoegereDerVarTilmeldt: 1 });
    expect(k.andelAfTilmeldte).toBeCloseTo(1 / 3);
    expect(k.andelAfAnsoegere).toBe(0.5);
  });

  it("en kladde er ikke en ansøgning", () => {
    const mails = ansoegerMails([{ email: "a@x.dk", indsendt_at: null }, { email: "b@x.dk", indsendt_at: "2026-09-18T10:00:00.000Z" }]);
    expect([...mails]).toEqual(["b@x.dk"]);
  });

  it("mails normaliseres til små bogstaver — begge sider har CHECK lower", () => {
    expect([...ansoegerMails([{ email: "  A@X.dk ", indsendt_at: "2026-09-18T10:00:00.000Z" }])]).toEqual(["a@x.dk"]);
  });

  it("nul ansøgninger giver nul og null-andele", () => {
    const k = ansoegningskobling([R({ email: "a@x.dk" })], []);
    expect(k.ansoegte).toBe(0);
    expect(k.andelAfTilmeldte).toBe(0);
    expect(k.andelAfAnsoegere).toBeNull();
  });
});

describe("webinarDashboard — hele dommen", () => {
  it("svarer på alle fire spørgsmål i ét kald", () => {
    const d = webinarDashboard({
      tilmeldinger: [
        R({ email: "a@x.dk", session_tid: T22, utm_source: "fb", utm_campaign: "sep" }),
        R({ email: "b@x.dk", session_tid: T22, utm_source: "fb", utm_campaign: "sep" }),
        R({ email: "c@x.dk", session_tid: T15, set_procent: 90, utm_source: "fb", utm_campaign: "aug" }),
        R({ email: "d@x.dk", session_tid: T15, state: "Missed" }),
      ],
      ansoegninger: [{ email: "c@x.dk", indsendt_at: "2026-09-16T10:00:00.000Z" }],
      sporKolonnerFindes: true,
    }, NU);
    expect(d.tom).toBe(false);
    expect(d.personer).toBe(4);
    expect(d.naeste?.personer).toBe(2);
    expect(d.afholdte).toHaveLength(1);
    expect(d.samlet).toMatchObject({ tilmeldte: 2, moedteOp: 1, saaFaerdigt: 1, moedteIkke: 1 });
    expect(d.kobling.ansoegte).toBe(1);
    expect(d.spor.personer).toBe(4);
    expect(d.sporNaeste?.personer).toBe(2);
  });

  it("de kommende tæller IKKE med i «samlet» — ellers ville 330 uafholdte se ud som frafald", () => {
    const d = webinarDashboard({
      tilmeldinger: [R({ email: "a@x.dk", session_tid: T22 }), R({ email: "b@x.dk", session_tid: T22 })],
      ansoegninger: [],
      sporKolonnerFindes: true,
    }, NU);
    expect(d.samlet.tilmeldte).toBe(0);
    expect(d.samlet.moedteIkke).toBe(0);
    expect(d.naeste?.personer).toBe(2);
    expect(d.afholdte).toEqual([]);
  });

  it("NUL DATA er et gyldigt svar — ingen NaN, ingen kast", () => {
    const d = webinarDashboard({ tilmeldinger: [], ansoegninger: [], sporKolonnerFindes: false }, NU);
    expect(d.tom).toBe(true);
    expect(d.personer).toBe(0);
    expect(d.naeste).toBeNull();
    expect(d.sporNaeste).toBeNull();
    expect(d.afholdte).toEqual([]);
    expect(d.samlet.fremmoedeAndel).toBeNull();
    expect(d.spor.sporFindes).toBe(false);
    expect(d.kobling.andelAfAnsoegere).toBeNull();
  });
});
