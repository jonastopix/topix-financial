import { describe, expect, it } from "vitest";
import {
  foreslaaWebinarKobling,
  koblingLinje,
  koblingsVisning,
  KOBLING_MAKS_DAGE,
  loftTekst,
  navneMatch,
  normaliserNavn,
  normaliserTelefon,
  type KoblingAnsoegning,
  type KoblingTilmelding,
} from "@/lib/webinar/kobling";
import * as webDash from "@/lib/webinar/dashboard";
import * as denoDash from "../../../../supabase/functions/_shared/webinarDashboard.ts";
import * as webPris from "@/lib/webinar/annoncepriser";
import * as denoPris from "../../../../supabase/functions/_shared/annoncepriser.ts";
import { bygDeltSvar, findForbudteNoegler, koblingerTalt } from "../../../../supabase/functions/_shared/webinarDelingSvar.ts";

/**
 * Webinarkoblingen (udkast 1/10-2026 — Jonas «forslag + klik»). Sagen bag:
 * ansøgningen på lh@greensolar.dk, tilmeldingen under en privat gmail 8/9 til
 * sessionen 22/9. Navnene her er OPFUNDNE — ingen persondata i testen.
 */

const OPRETTET = "2026-09-25T10:00:00.000Z";
const ANS: KoblingAnsoegning = { email: "lone@firma.dk", navn: "Lone Havndrup Hansen", telefon: "+45 20 30 40 50", created_at: OPRETTET };

const T = (t: Partial<KoblingTilmelding> & { id: string }): KoblingTilmelding => ({
  email: "privat@gmail.com",
  navn: null,
  telefon: null,
  registreret_at: "2026-09-08T12:00:00.000Z",
  created_at: "2026-09-08T12:00:01.000Z",
  session_tid: "2026-09-22T09:00:00.000Z",
  ...t,
});

describe("normaliseringen", () => {
  it("navn: små bogstaver, trim, flere mellemrum → ét, æøå bevaret", () => {
    expect(normaliserNavn("  Søren   ÆRØ  Østergård ")).toBe("søren ærø østergård");
    expect(normaliserNavn("   ")).toBeNull();
    expect(normaliserNavn(null)).toBeNull();
    // NFD (o + kombinerende streg findes ikke for ø, men å kan skrives som a + ring) → NFC.
    expect(normaliserNavn("Åse Ålund")).toBe("åse ålund");
  });
  it("telefon: cifre, +45/0045 fjernet, sidste 8 cifre; under 8 cifre er intet nummer", () => {
    expect(normaliserTelefon("+45 20 30 40 50")).toBe("20304050");
    expect(normaliserTelefon("0045 20304050")).toBe("20304050");
    expect(normaliserTelefon("4520304050")).toBe("20304050");
    expect(normaliserTelefon("20-30-40-50")).toBe("20304050");
    expect(normaliserTelefon("45 20 30")).toBeNull();
    expect(normaliserTelefon(null)).toBeNull();
    // Otte cifre, der begynder med 45, er et dansk nummer — ikke en landekode.
    expect(normaliserTelefon("45203040")).toBe("45203040");
  });
  it("navnedommen: fuldt · fornavn+efternavn · et fornavn alene er intet", () => {
    expect(navneMatch("Lone Havndrup Hansen", "lone  havndrup HANSEN")).toBe("fuldt");
    expect(navneMatch("Lone Havndrup Hansen", "Lone Hansen")).toBe("for_efter");
    expect(navneMatch("Lone Hansen", "Lone Jensen")).toBeNull();
    expect(navneMatch("Lone", "Lone")).toBeNull();
    expect(navneMatch("Lone Hansen", null)).toBeNull();
    expect(navneMatch("Søren Østergård", "søren østergård")).toBe("fuldt");
    expect(navneMatch("Søren Østergård", "Soren Ostergard")).toBeNull();
  });
});

describe("foreslaaWebinarKobling", () => {
  it("navn: fuldt navn under en anden mail foreslås, med grunden i ord", () => {
    const f = foreslaaWebinarKobling(ANS, [T({ id: "t1", navn: "Lone Havndrup Hansen" })]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ styrke: 1, navn: "fuldt", telefon: false });
    expect(f[0].grund).toBe("Samme fulde navn — men en anden mail og intet telefonnummer at holde op imod");
  });
  it("navn: fornavn + efternavn er nok", () => {
    const f = foreslaaWebinarKobling(ANS, [T({ id: "t1", navn: "Lone Hansen" })]);
    expect(f[0]).toMatchObject({ navn: "for_efter", styrke: 1 });
    expect(f[0].grund).toMatch(/^Samme fornavn og efternavn/);
  });
  it("telefon: samme nummer i en anden form", () => {
    const f = foreslaaWebinarKobling(ANS, [T({ id: "t1", navn: "L. H.", telefon: "0045 2030 4050" })]);
    expect(f[0]).toMatchObject({ styrke: 2, navn: null, telefon: true, grund: "Samme telefonnummer — men en anden mail" });
  });
  it("ingen match: andet navn, intet nummer → intet forslag", () => {
    expect(foreslaaWebinarKobling(ANS, [T({ id: "t1", navn: "Mette Jensen" }), T({ id: "t2", navn: null })])).toEqual([]);
  });
  it("samme mail er tragtens egen kobling — aldrig et forslag", () => {
    expect(foreslaaWebinarKobling(ANS, [T({ id: "t1", email: "lone@firma.dk", navn: "Lone Havndrup Hansen" })])).toEqual([]);
    expect(foreslaaWebinarKobling({ ...ANS, email: " LONE@firma.dk " }, [T({ id: "t1", email: "lone@firma.dk", navn: "Lone Havndrup Hansen" })])).toEqual([]);
  });
  it("vinduet: kun FØR oprettelsen, højst 90 dage før — grænserne prøvet fra begge sider", () => {
    const op = Date.parse(OPRETTET);
    const iso = (ms: number) => new Date(ms).toISOString();
    const DAG = 24 * 60 * 60 * 1000;
    const med = (id: string, ms: number) => T({ id, navn: "Lone Hansen", registreret_at: iso(ms), created_at: null });
    const f = foreslaaWebinarKobling(ANS, [
      med("efter", op + 1),
      med("samme", op), // samme millisekund er ikke «før»
      med("lige-foer", op - 1),
      med("praecis-90", op - KOBLING_MAKS_DAGE * DAG),
      med("over-90", op - KOBLING_MAKS_DAGE * DAG - 1),
    ]);
    expect(f.map((x) => x.tilmelding.id).sort()).toEqual(["lige-foer", "praecis-90"]);
    expect(KOBLING_MAKS_DAGE).toBe(90);
  });
  it("tilmeldingens tid: registreret_at, ellers rækkens created_at, ellers ikke med", () => {
    const f = foreslaaWebinarKobling(ANS, [
      T({ id: "kun-created", navn: "Lone Hansen", registreret_at: null, created_at: "2026-09-01T00:00:00.000Z" }),
      T({ id: "ingen-tid", navn: "Lone Hansen", registreret_at: null, created_at: null }),
      // registreret_at vinder over created_at (importen skriver rækken senere end tilmeldingen).
      T({ id: "import", navn: "Lone Hansen", registreret_at: "2026-09-02T00:00:00.000Z", created_at: "2026-09-30T00:00:00.000Z" }),
    ]);
    expect(f.map((x) => x.tilmelding.id).sort()).toEqual(["import", "kun-created"]);
  });
  it("ugyldig oprettelse → intet (vi kan ikke sige, hvad der kom før)", () => {
    expect(foreslaaWebinarKobling({ ...ANS, created_at: "ikke en dato" }, [T({ id: "t1", navn: "Lone Hansen" })])).toEqual([]);
  });
  it("rangering: navn+telefon > telefon > navn; fuldt navn før fornavn+efternavn; seneste før ældre", () => {
    const f = foreslaaWebinarKobling(ANS, [
      T({ id: "navn-for-efter", navn: "Lone Hansen", registreret_at: "2026-09-20T00:00:00.000Z" }),
      T({ id: "navn-fuldt-gl", navn: "Lone Havndrup Hansen", registreret_at: "2026-08-01T00:00:00.000Z" }),
      T({ id: "navn-fuldt-ny", navn: "Lone Havndrup Hansen", registreret_at: "2026-09-10T00:00:00.000Z" }),
      T({ id: "telefon", navn: "Anden Person", telefon: "20304050" }),
      T({ id: "begge", navn: "Lone Hansen", telefon: "+4520304050" }),
    ]);
    expect(f.map((x) => x.tilmelding.id)).toEqual(["begge", "telefon", "navn-fuldt-ny", "navn-fuldt-gl", "navn-for-efter"]);
    expect(f[0]).toMatchObject({ styrke: 3, grund: "Samme fornavn og efternavn og samme telefonnummer — men en anden mail" });
  });
  it("æøå: et navn med æøå matcher kun sig selv, ikke en afskrift uden", () => {
    const a = { ...ANS, navn: "Søren Ærø Østergård", telefon: null };
    expect(foreslaaWebinarKobling(a, [T({ id: "ja", navn: "søren østergård" })])).toHaveLength(1);
    expect(foreslaaWebinarKobling(a, [T({ id: "nej", navn: "Soren Ostergard" })])).toHaveLength(0);
  });
  it("uden telefon på ansøgningen: navnet bærer alene", () => {
    const f = foreslaaWebinarKobling({ ...ANS, telefon: null }, [T({ id: "t1", navn: "Lone Hansen", telefon: "20304050" })]);
    expect(f[0]).toMatchObject({ styrke: 1, telefon: false });
  });
});

describe("foreslaaWebinarKobling — de optagne (rådets M2: én ansøgning pr. tilmelding)", () => {
  const kandidater = [T({ id: "optaget", navn: "Lone Havndrup Hansen" }), T({ id: "fri", navn: "Lone Hansen", registreret_at: "2026-09-01T12:00:00.000Z" })];
  it("en tilmelding koblet til en ANDEN ansøgning foreslås aldrig — heller ikke det stærkeste match", () => {
    expect(foreslaaWebinarKobling(ANS, kandidater).map((f) => f.tilmelding.id)).toEqual(["optaget", "fri"]);
    expect(foreslaaWebinarKobling(ANS, kandidater, new Set(["optaget"])).map((f) => f.tilmelding.id)).toEqual(["fri"]);
    expect(foreslaaWebinarKobling(ANS, kandidater, new Set(["optaget", "fri"]))).toEqual([]);
  });
  it("et ukendt id i mængden ændrer intet", () => {
    expect(foreslaaWebinarKobling(ANS, kandidater, new Set(["noget-andet"]))).toEqual(foreslaaWebinarKobling(ANS, kandidater));
  });
});

describe("koblingsVisning og ordene", () => {
  const f = foreslaaWebinarKobling(ANS, [T({ id: "t1", navn: "Lone Hansen" })]);
  it("koblet vinder altid; mail-match viser intet forslag; ellers forslag eller intet", () => {
    expect(koblingsVisning(true, 3, f).art).toBe("koblet");
    expect(koblingsVisning(false, 1, f).art).toBe("mail_match");
    expect(koblingsVisning(false, 0, f)).toEqual({ art: "forslag", forslag: f });
    expect(koblingsVisning(false, 0, []).art).toBe("intet");
  });
  it("loftet i ord, med tusindtalspunktum", () => {
    expect(loftTekst(5000)).toBe("Kun de 5.000 nyeste tilmeldinger i vinduet er gennemset — en ældre tilmelding kan mangle blandt forslagene.");
    expect(loftTekst(800)).toContain("Kun de 800 nyeste");
  });
  it("koblingLinje", () => {
    expect(koblingLinje("22/9", "Jonas Herlev")).toBe("Koblet til webinaret 22/9 af Jonas Herlev");
    expect(koblingLinje(null, null)).toBe("Koblet til webinaret");
  });
});

// ── Tragten tæller koblingen (dashboard.ts: medWebinarKobling) ─────────────

const UDEN_SPOR = {
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
  fbclid: null, origin: null, first_origin: null, referrer: null, first_referrer: null,
  widget_source: null, by: null, land: null, enhed: null, tidszone: null,
};
const SESSION = "2026-09-22T09:00:00.000Z";
const NU = new Date("2026-10-01T08:00:00.000Z");
const tilm = (email: string): webDash.Tilmelding => ({
  ewebinar_id: `id-${email}`, email, navn: null, webinar_id: "w1", webinar_titel: "Tallene", session_tid: SESSION,
  session_type: "Scheduled", registreret_at: "2026-09-08T12:00:00.000Z", state: "Missed", sidste_action: "MissedWebinar",
  attended: null, subscribed: null, set_procent: null, set_procent_kilde: null, join_link: null, kalender_link: null, replay_link: null, ...UDEN_SPOR,
});
const medlem = (email: string, webinar_email?: string | null): webDash.AnsoegerMail => ({
  email, indsendt_at: "2026-09-25T10:05:00.000Z", trin: "underskrevet", virksomhed_slutdato: "2027-09-25",
  ...(webinar_email === undefined ? {} : { webinar_email }),
});

describe("medWebinarKobling — en bekræftet kobling tæller som et mail-match", () => {
  const tilmeldinger = [tilm("privat@gmail.com"), tilm("anden@x.dk")];
  const led = (d: webDash.WebinarDashboard, navn: string) => d.tragt.trin.find((t) => t.navn === navn)?.antal;

  it("uden kobling tæller hun ikke; med kobling tæller hun som ansøgt og medlem", () => {
    const uden = webDash.webinarDashboard({ tilmeldinger, ansoegninger: [medlem("lone@firma.dk")], sporKolonnerFindes: true }, NU);
    const med = webDash.webinarDashboard({ tilmeldinger, ansoegninger: [medlem("lone@firma.dk", "privat@gmail.com")], sporKolonnerFindes: true }, NU);
    expect(led(uden, "Blev medlem")).toBe(0);
    expect(led(med, "Blev medlem")).toBe(1);
    expect(uden.kobling.ansoegte).toBe(0);
    expect(med.kobling.ansoegte).toBe(1);
    // Én ansøgning er stadig én ansøger — koblingen ERSTATTER, lægger ikke til.
    expect(med.kobling.ansoegereIAlt).toBe(1);
    expect(med.afholdte[0].ansoegte).toBe(1);
  });
  it("null/tom/udeladt kobling ændrer intet; mailen normaliseres", () => {
    const a = [medlem("lone@firma.dk", null), medlem("b@x.dk", "  "), medlem("c@x.dk")];
    expect(webDash.medWebinarKobling(a).map((x) => x.email)).toEqual(["lone@firma.dk", "b@x.dk", "c@x.dk"]);
    expect(webDash.medWebinarKobling([medlem("lone@firma.dk", " Privat@Gmail.com ")])[0].email).toBe("privat@gmail.com");
  });
  it("PARITET: spejlet på serveren svarer ens (webinar-delt)", () => {
    const ind = { tilmeldinger, ansoegninger: [medlem("lone@firma.dk", "privat@gmail.com"), medlem("anden@x.dk")], sporKolonnerFindes: true };
    expect(denoDash.webinarDashboard(ind as never, NU)).toEqual(webDash.webinarDashboard(ind, NU));
    const p = { ...ind, dage: [], annoncer: [], tilstand: "mangler" as const };
    expect(denoPris.annoncepriser(p as never, NU)).toEqual(webPris.annoncepriser(p, NU));
  });
});

describe("hvorfor UNIQUE (tilmelding_id) — to ansøgninger på samme tilmelding tælles som én", () => {
  it("tragtens mailsæt slår dem sammen: to medlemmer koblet til samme tilmelding giver 1, ikke 2", () => {
    const tilmeldinger = [tilm("privat@gmail.com")];
    const d = webDash.webinarDashboard({
      tilmeldinger,
      ansoegninger: [medlem("lone@firma.dk", "privat@gmail.com"), medlem("anden@firma.dk", "privat@gmail.com")],
      sporKolonnerFindes: true,
    }, NU);
    // Det er netop fejlen, databasen (UNIQUE) og dommen (optagne) forhindrer.
    expect(d.tragt.trin.find((t) => t.navn === "Blev medlem")?.antal).toBe(1);
  });
});

describe("webinar-delt: beviset for udrulningen er `koblinger_talt` — et tal, ingen mails (rådets M3)", () => {
  const ind = {
    tilmeldinger: [tilm("privat@gmail.com"), tilm("anden@x.dk")],
    ansoegninger: [medlem("lone@firma.dk", "privat@gmail.com"), medlem("b@x.dk", "  "), medlem("c@x.dk", null), medlem("d@x.dk")],
    sporKolonnerFindes: true, dage: [], annoncer: [], tilstand: "mangler" as const, hentning: null, valg: "daekning" as const,
  };
  const svar = bygDeltSvar(ind as never, NU);
  it("feltet findes og tæller kun de ikke-tomme koblinger", () => {
    expect(svar.koblinger_talt).toBe(1);
    expect(koblingerTalt([])).toBe(0);
    expect(bygDeltSvar({ ...ind, ansoegninger: [medlem("c@x.dk")] } as never, NU).koblinger_talt).toBe(0);
  });
  it("svaret bærer ingen mails — heller ikke koblingens — og går rent gennem findForbudteNoegler", () => {
    expect(findForbudteNoegler(svar)).toEqual([]);
    const json = JSON.stringify(svar);
    expect(json).not.toMatch(/@/);
    expect(json).not.toContain("webinar_email");
    expect(typeof svar.koblinger_talt).toBe("number");
  });
});
