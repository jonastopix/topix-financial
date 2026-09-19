import { describe, expect, it } from "vitest";
import {
  afholdteSessioner,
  andel,
  brokOgPct,
  dageOrd,
  medlemsMails,
  tidTilAnsoegning,
  tragt,
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
  type AnsoegerMail,
  type Tilmelding,
} from "@/lib/webinar/dashboard";

/**
 * Ansøgeren. `trin` og `virksomhed_slutdato` er de to felter husets
 * blevMedlem dømmer på — «medlem» kræver BEGGE: underskrevet OG en slutdato
 * (altså betalt). A() laver en ansøger der ikke blev medlem; M() en der gjorde.
 */
const A = (email: string, indsendt_at: string | null = "2026-09-18T10:00:00.000Z"): AnsoegerMail =>
  ({ email, indsendt_at, trin: "ny", virksomhed_slutdato: null });
const M = (email: string, indsendt_at = "2026-09-18T10:00:00.000Z"): AnsoegerMail =>
  ({ email, indsendt_at, trin: "underskrevet", virksomhed_slutdato: "2027-09-18" });

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
      [A("a@x.dk"), A("z@x.dk")],
    );
    expect(k).toMatchObject({ tilmeldte: 3, ansoegte: 1, ansoegereIAlt: 2, ansoegereDerVarTilmeldt: 1 });
    expect(k.andelAfTilmeldte).toBeCloseTo(1 / 3);
    expect(k.andelAfAnsoegere).toBe(0.5);
  });

  it("en kladde er ikke en ansøgning", () => {
    const mails = ansoegerMails([A("a@x.dk", null), A("b@x.dk")]);
    expect([...mails]).toEqual(["b@x.dk"]);
  });

  it("mails normaliseres til små bogstaver — begge sider har CHECK lower", () => {
    expect([...ansoegerMails([A("  A@X.dk ")])]).toEqual(["a@x.dk"]);
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
      ansoegninger: [A("c@x.dk", "2026-09-16T10:00:00.000Z")],
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

// ── Jonas' fire + mine tre (19/9, efter at han havde set siden) ────────────

describe("pct — små tal må ikke blive til «0 %» der ligner en fejl", () => {
  it("1 ud af 594 er 0,2 %, ikke 0 %", () => {
    expect(pct(andel(1, 594))).toBe("0,2 %");
  });

  it("nul ER nul, og det skal stå som nul", () => {
    expect(pct(0)).toBe("0 %");
    expect(pct(andel(0, 594))).toBe("0 %");
  });

  it("under det en decimal kan vise, siger «<0,1 %» — aldrig «0,0 %»", () => {
    expect(pct(andel(1, 5000))).toBe("<0,1 %");
    expect(pct(0.0004)).toBe("<0,1 %");
  });

  it("fra 1 % og op rundes til heltal som før", () => {
    expect(pct(0.0149)).toBe("1 %");
    expect(pct(0.324)).toBe("32 %");
    expect(pct(1)).toBe("100 %");
  });

  it("ingen nævner er «–», ikke «0 %» — de to betyder ikke det samme", () => {
    expect(pct(null)).toBe("–");
    expect(pct(andel(0, 0))).toBe("–");
  });
});

describe("brokOgPct — brøken og procenten sammen", () => {
  it("skriver «29 af 91 · 32 %»", () => {
    expect(brokOgPct(29, 91)).toBe("29 af 91 · 32 %");
  });

  it("små tal beholder decimalen", () => {
    expect(brokOgPct(1, 594)).toBe("1 af 594 · 0,2 %");
  });

  it("nul nævner giver bare tallet — «0 af 0 · –» ville være støj", () => {
    expect(brokOgPct(0, 0)).toBe("0");
  });
});

describe("medlemsMails — husets dom, ikke en ny", () => {
  it("kræver BEGGE dele: underskrevet OG en slutdato", () => {
    expect([...medlemsMails([M("m@x.dk"), A("a@x.dk")])]).toEqual(["m@x.dk"]);
    // Underskrevet uden slutdato = underskrevet, men ikke betalt.
    expect([...medlemsMails([{ email: "u@x.dk", indsendt_at: "2026-09-18T10:00:00.000Z", trin: "underskrevet", virksomhed_slutdato: null }])]).toEqual([]);
    // Slutdato uden underskrift kan ikke forekomme, men må heller ikke tælle.
    expect([...medlemsMails([{ email: "v@x.dk", indsendt_at: "2026-09-18T10:00:00.000Z", trin: "afholdt", virksomhed_slutdato: "2027-01-01" }])]).toEqual([]);
  });

  it("en kladde er aldrig medlem", () => {
    expect([...medlemsMails([{ ...M("k@x.dk"), indsendt_at: null }])]).toEqual([]);
  });
});

describe("afholdteSessioner — ansøgte og blev medlem pr. session", () => {
  const raekker = [
    R({ email: "a@x.dk", session_tid: T15, set_procent: 90 }),
    R({ email: "b@x.dk", session_tid: T15, set_procent: 40 }),
    R({ email: "c@x.dk", session_tid: T15, state: "Missed" }),
    R({ email: "d@x.dk", session_tid: T15 }),
  ];

  it("procenten af de TILMELDTE der ansøgte, og af de ANSØGTE der blev medlem", () => {
    const s = afholdteSessioner(raekker, NU, new Set(["a@x.dk", "b@x.dk"]), new Set(["a@x.dk"]))[0];
    expect(s.ansoegte).toBe(2);
    expect(s.ansoegerAndel).toBe(0.5); // 2 af 4 tilmeldte
    expect(s.blevMedlem).toBe(1);
    expect(s.medlemAfAnsoegteAndel).toBe(0.5); // 1 af 2 ANSØGTE, ikke af 4
  });

  it("uden ansøgere er medlemsandelen null, ikke 0 — der er intet at tage procent af", () => {
    const s = afholdteSessioner(raekker, NU)[0];
    expect(s.ansoegte).toBe(0);
    expect(s.ansoegerAndel).toBe(0);
    expect(s.blevMedlem).toBe(0);
    expect(s.medlemAfAnsoegteAndel).toBeNull();
  });

  it("en ansøger der ikke var på sessionen, tælles ikke med på den", () => {
    const s = afholdteSessioner(raekker, NU, new Set(["fremmed@x.dk"]))[0];
    expect(s.ansoegte).toBe(0);
  });
});

describe("tragt — tilmeldte → mødte op → så færdigt → ansøgte → blev medlem", () => {
  const raekker = [
    R({ email: "a@x.dk", session_tid: T15, set_procent: 90 }),
    R({ email: "b@x.dk", session_tid: T15, set_procent: 90 }),
    R({ email: "c@x.dk", session_tid: T15, set_procent: 40 }),
    R({ email: "d@x.dk", session_tid: T15, state: "Missed" }),
    R({ email: "e@x.dk", session_tid: T22 }),
  ];

  it("fem led, hvert med andel af leddet før OG af udgangspunktet", () => {
    const t = tragt(raekker, new Set(["a@x.dk", "c@x.dk"]), new Set(["a@x.dk"]), NU);
    expect(t.trin.map((x) => [x.navn, x.antal])).toEqual([
      ["Tilmeldte", 4], ["Mødte op", 3], ["Så det færdigt", 2], ["Ansøgte", 2], ["Blev medlem", 1],
    ]);
    expect(t.trin[0].andelAfFoer).toBeNull();
    expect(t.trin[1].andelAfFoer).toBe(0.75);
    expect(t.trin[4].andelAfFoer).toBe(0.5);
    expect(t.trin[4].andelAfStart).toBe(0.25);
    expect(t.grundlag).toBe(4);
  });

  it("de KOMMENDE står uden for tragten — ellers ville de se ud som frafald", () => {
    const t = tragt(raekker, new Set(), new Set(), NU);
    expect(t.grundlag).toBe(4);
    expect(t.kommendeUdenfor).toBe(1);
  });

  it("hvert led er en delmængde af det før — andelen kan aldrig overstige 1", () => {
    const t = tragt(raekker, new Set(["a@x.dk", "c@x.dk"]), new Set(["a@x.dk"]), NU);
    for (const x of t.trin) if (x.andelAfFoer !== null) expect(x.andelAfFoer).toBeLessThanOrEqual(1);
  });

  it("uden afholdte webinarer er tragten tom, men gyldig — ingen NaN", () => {
    const t = tragt([R({ email: "e@x.dk", session_tid: T22 })], new Set(), new Set(), NU);
    expect(t.grundlag).toBe(0);
    expect(t.kommendeUdenfor).toBe(1);
    for (const x of t.trin) { expect(x.antal).toBe(0); expect(x.andelAfStart).toBeNull(); }
  });
});

describe("tidTilAnsoegning — hvornår I skal skrive til folk", () => {
  const reg = (email: string, dag: string) => R({ email, registreret_at: `2026-09-${dag}T09:00:00.000Z`, session_tid: T22 });

  it("gennemsnit, median og yderpunkter i dage", () => {
    const t = tidTilAnsoegning(
      [reg("a@x.dk", "01"), reg("b@x.dk", "01"), reg("c@x.dk", "01")],
      [A("a@x.dk", "2026-09-03T09:00:00.000Z"), A("b@x.dk", "2026-09-05T09:00:00.000Z"), A("c@x.dk", "2026-09-11T09:00:00.000Z")],
    );
    expect(t.antal).toBe(3);
    expect(t.medianDage).toBe(4);
    expect(t.gennemsnitDage).toBe(5.3);
    expect(t.hurtigsteDage).toBe(2);
    expect(t.langsomsteDage).toBe(10);
  });

  it("regner fra personens FØRSTE tilmelding", () => {
    const t = tidTilAnsoegning(
      [reg("a@x.dk", "10"), { ...reg("a@x.dk", "01"), ewebinar_id: "r2" }],
      [A("a@x.dk", "2026-09-11T09:00:00.000Z")],
    );
    expect(t.antal).toBe(1);
    expect(t.gennemsnitDage).toBe(10);
  });

  it("den der ansøgte FØR tilmeldingen er ikke en ventetid — tælles for sig", () => {
    const t = tidTilAnsoegning([reg("a@x.dk", "10")], [A("a@x.dk", "2026-09-02T09:00:00.000Z")]);
    expect(t.antal).toBe(0);
    expect(t.ansoegteFoerTilmelding).toBe(1);
    expect(t.gennemsnitDage).toBeNull();
  });

  it("en tilmelding uden tidspunkt kan ikke måles og siges det", () => {
    const t = tidTilAnsoegning([R({ email: "a@x.dk", registreret_at: null })], [A("a@x.dk")]);
    expect(t.antal).toBe(0);
    expect(t.udenTidspunkt).toBe(1);
  });

  it("en ansøger uden tilmelding tæller hverken med eller som umålelig", () => {
    const t = tidTilAnsoegning([reg("a@x.dk", "01")], [A("fremmed@x.dk")]);
    expect(t.antal).toBe(0);
    expect(t.udenTidspunkt).toBe(0);
    expect(t.ansoegteFoerTilmelding).toBe(0);
  });

  it("nul ansøgninger giver nuller og null, ikke NaN", () => {
    expect(tidTilAnsoegning([reg("a@x.dk", "01")], [])).toMatchObject({ antal: 0, gennemsnitDage: null, medianDage: null });
  });
});

describe("dageOrd — læsbar tid", () => {
  it("entalsformen, decimalen og det korte ophold", () => {
    expect(dageOrd(1)).toBe("1 dag");
    expect(dageOrd(3.5)).toBe("3,5 dage");
    expect(dageOrd(12)).toBe("12 dage");
    expect(dageOrd(0.4)).toBe("under en dag");
    expect(dageOrd(null)).toBe("–");
  });
});
