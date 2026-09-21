import { describe, expect, it } from "vitest";
import {
  AFSLAGSGRUND_ORD,
  dageSomTekst,
  FOELGE_INGEN_MAIL,
  FOELGE_MAIL_NU,
  foelgeLinje,
  knapperFor,
  LUKKEAARSAG_VALG_ORD,
  LUKKEAARSAGER_TIL_VALG,
  ordeneGaarIkkeIgen,
  valgOrd,
} from "@/lib/ansoegninger/ansoegningHandlinger";
import { AFSLAGSGRUNDE, afgoerOvergang, erLukBegrundelseGyldig, LUKKEAARSAGER, lukKraeverBegrundelse, TRIN, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";
import { afslagsMailTekst, grundTekst, koeNummer, koeNummerForNy } from "@/lib/afslagsTilbud";
import { LUKKEAARSAG_ORD } from "@/lib/ansoegninger/ansoegningVisning";
import { afslagsMailTekst as afslagsMailTekstDeno } from "../../../supabase/functions/_shared/afslagsTilbud.ts";
import { bygRykkerMail, type MailKontekst } from "../../../supabase/functions/_shared/ansoegningRykkerMails.ts";
import type { VentepladsRaekke } from "@/lib/ventelisteDom";

/**
 * «Giv afslag» og «Luk uden svar» (Jonas 21/9-2026, udkast-afslag-luk) — én prøve pr. beslutning:
 *   1. knapperne side om side, samme vægt, navngivet efter følgen
 *   2. forhåndsvisningen er mailbyggerens output — samme kode, alle tre grunde, med og uden kø
 *   3. linjen om mail/ingen mail udledes af dommen
 *   4. ordene: intet valg går igen; «andet» hedder «Ikke det rigtige lige nu»; luk med «Andet» kræver begrundelse
 *   5. den nye lukkeårsag: lukket, ingen trappe, kendt overalt
 */

const K = (afslag: MailKontekst["afslag"], fornavn: string | null = "Lisbeth"): MailKontekst => ({
  fornavn, virksomhedsnavn: "Nordic Byg ApS", bookingUrl: "https://c/x", statusUrl: "https://s", ikkeNuUrl: "https://s&handling=ikke_nu",
  samtaleStart: null, aftaleUrl: null, token: "abc", manglerSvar: null, afslag,
});
const AFHOLDT = { trin: "afholdt" as Trin, paaPause: false, lukketFraTrin: null };
const ctx = { paaPause: false, lukketFraTrin: null };

describe("1. knapperne fra «afholdt»: «Giv afslag» og «Luk uden svar» side om side, samme vægt", () => {
  it("de to store knapper er afslag og luk — begge farlige, begge med dialog", () => {
    const store = knapperFor(AFHOLDT).filter((k) => k.stor);
    expect(store.map((k) => [k.handling, k.tekst])).toEqual([["afslag", "Giv afslag"], ["luk", "Luk uden svar"]]);
    expect(store.every((k) => k.farlig && k.bekraeft)).toBe(true);
    expect(store.find((k) => k.handling === "luk")!.kraeverAarsag).toBe(true);
    expect(store.find((k) => k.handling === "afslag")!.kraeverAfslagsgrund).toBe(true);
  });
  it("reserven fra «afholdt» er kun «Sæt på pause» — «Kom ikke» står i RAEKKEFOELGE, men ikke i MENNESKE_HANDLINGER, så knapperFor viser den aldrig (fund 21/9: no-show kommer kun fra Calendly-webhooken)", () => {
    expect(knapperFor(AFHOLDT).filter((k) => !k.stor).map((k) => k.handling)).toEqual(["saet_pause"]);
  });
});

describe("2. forhåndsvisningen er mailens — samme kode (afslagsMailTekst) som ansoegningRykkerMails sender med", () => {
  const koer = [[], [{ nummer: 1 }], [{ nummer: 3 }], [{ nummer: 1 }, { nummer: 4 }]] as const;
  for (const grund of AFSLAGSGRUNDE) {
    for (const efterSamtale of [true, false]) {
      for (const ventepladser of koer) {
        it(`${grund} · ${efterSamtale ? "efter samtale" : "efter ansøgning"} · ${ventepladser.length} plads(er): emne og afsnit er identiske`, () => {
          const afslag = { grundTekst: grundTekst(grund), ventepladser: [...ventepladser], efterSamtale };
          const mail = bygRykkerMail("ansoegning-afslag", K(afslag))!;
          const vist = afslagsMailTekst({ fornavn: "Lisbeth", virksomhedsnavn: "Nordic Byg ApS", afslag });
          expect(vist.emne).toBe(mail.emne);
          // Tekstudgaven begynder med afsnittene i rækkefølge — så viser dialogen præcis det, mailen siger.
          expect(mail.tekst.startsWith(vist.afsnit.join("\n"))).toBe(true);
          // Spejlet i _shared svarer det samme.
          expect(afslagsMailTekstDeno({ fornavn: "Lisbeth", virksomhedsnavn: "Nordic Byg ApS", afslag })).toEqual(vist);
        });
      }
    }
  }
  it("uden fornavn: «Hej,» — og «tak for snakken» kun efter samtale; køsætningen kun med pladser", () => {
    const uden = afslagsMailTekst({ fornavn: null, virksomhedsnavn: "X ApS", afslag: { grundTekst: grundTekst("andet"), ventepladser: [], efterSamtale: false } });
    expect(uden.afsnit[0]).toBe("Hej,");
    expect(uden.afsnit[1]).toBe("Tak for din ansøgning for X ApS. Vi må sige nej denne gang. Vi har vurderet, at The Boardroom ikke er det rigtige for jer lige nu.");
    expect(uden.afsnit).toHaveLength(3);
    const med = afslagsMailTekst({ fornavn: "Bo", virksomhedsnavn: "X ApS", afslag: { grundTekst: grundTekst("niche"), ventepladser: [{ nummer: 2 }], efterSamtale: true } });
    expect(med.afsnit[1]).toContain("— og tak for snakken. Vi må sige nej denne gang. Vi har allerede et medlem");
    expect(med.afsnit[2]).toBe("Men vi vil gerne have jer med, når der bliver plads: I står nummer 2 i køen til pladsen i jeres niche. Bliver pladsen ledig, skriver vi til dig — så har du syv dage til at sige ja, før den går videre til den næste.");
    expect(med.emne).toBe("Vores svar på din ansøgning — og din plads i køen");
  });
  it("koeNummerForNy er det nummer, koeNummer/sorterKoe giver den nye plads — bagest efter de ventende (0, 1 og 3 foran); en «tilbudt» plads tæller ikke", () => {
    const raekke = (n: number, afvistAt: string, status: VentepladsRaekke["status"] = "venter"): VentepladsRaekke => ({ id: `p${n}`, ansoegning_id: `a${n}`, company_id: "c", status, sat_at: `2026-09-1${n}T10:00:00Z`, afvist_at: afvistAt });
    for (const foran of [0, 1, 3]) {
      const ventende = Array.from({ length: foran }, (_, i) => raekke(i + 1, `2026-09-1${i + 1}T09:00:00Z`));
      const tilbudt = raekke(8, "2026-09-10T09:00:00Z", "tilbudt");
      const ny = { ...raekke(9, "2026-09-21T12:00:00Z"), ansoegning_id: "ny" };
      expect(koeNummer([...ventende, tilbudt, ny], "ny")).toBe(koeNummerForNy(foran));
      expect(koeNummerForNy(foran)).toBe(foran + 1);
    }
  });
});

describe("3. linjen om mail eller ingen mail udledes af dommen — aldrig skrevet ved knappen", () => {
  it("fra «afholdt»: afslag → «de får en mail nu» for alle tre grunde; luk → «ingen mail» for alle valgbare årsager", () => {
    for (const grund of AFSLAGSGRUNDE) expect(foelgeLinje(AFHOLDT, "afslag", { grund })).toBe(FOELGE_MAIL_NU);
    expect(foelgeLinje(AFHOLDT, "afslag")).toBe(FOELGE_MAIL_NU);
    for (const aarsag of LUKKEAARSAGER_TIL_VALG) expect(foelgeLinje(AFHOLDT, "luk", { aarsag })).toBe(FOELGE_INGEN_MAIL);
    expect(FOELGE_MAIL_NU).toBe("de får en mail nu");
    expect(FOELGE_INGEN_MAIL).toBe("ingen mail");
  });
  it("«Kom ikke» → ingen mail nu, rykkere dag 2, 7 og 11; pause → ingen mail; genoptag → ingen mail", () => {
    expect(foelgeLinje(AFHOLDT, "ikke_moedt")).toBe("ingen mail nu — rykkere dag 2, 7 og 11");
    expect(foelgeLinje(AFHOLDT, "saet_pause")).toBe(FOELGE_INGEN_MAIL);
    expect(foelgeLinje({ ...AFHOLDT, paaPause: true }, "genoptag")).toBe(FOELGE_INGEN_MAIL);
    expect(dageSomTekst([2, 7, 11])).toBe("2, 7 og 11");
    expect(dageSomTekst([2])).toBe("2");
  });
  it("fra «ny»: indkaldelsen og afvisningen giver en mail nu; fra «booket»: «afholdt» giver ingen (rykkeren går til os, ikke til ansøgeren)", () => {
    const NY = { trin: "ny" as Trin, paaPause: false, lukketFraTrin: null };
    expect(foelgeLinje(NY, "tal_med_dem")).toBe(FOELGE_MAIL_NU);
    expect(foelgeLinje(NY, "afvis", { grund: "andet" })).toBe(FOELGE_MAIL_NU);
    expect(foelgeLinje({ ...NY, trin: "booket" }, "afholdt")).toBe(FOELGE_INGEN_MAIL);
  });
  it("genåbning: til «indkaldt» sendes en ny indkaldelse; til «afholdt» intet — og «underskrevet» udleder ingen linje (betalingsforløbet)", () => {
    expect(foelgeLinje({ trin: "lukket", paaPause: false, lukketFraTrin: "indkaldt" }, "genaabn")).toBe(FOELGE_MAIL_NU);
    expect(foelgeLinje({ trin: "lukket", paaPause: false, lukketFraTrin: "afholdt" }, "genaabn")).toBe(FOELGE_INGEN_MAIL);
    expect(foelgeLinje({ trin: "aftalegrundlag_sendt", paaPause: false, lukketFraTrin: null }, "underskrevet")).toBeNull();
    // Ikke tilladt fra trinnet → ingen linje.
    expect(foelgeLinje(AFHOLDT, "tal_med_dem")).toBeNull();
  });
});

describe("4. ordene i de to dialoger", () => {
  it("afslagsgrundene: «Nichen er optaget» · «For tidligt» · «Ikke det rigtige lige nu» — værdierne er uændrede", () => {
    expect(AFSLAGSGRUNDE).toEqual(["niche", "for_tidligt", "andet"]);
    expect(AFSLAGSGRUNDE.map((g) => AFSLAGSGRUND_ORD[g])).toEqual(["Nichen er optaget", "For tidligt", "Ikke det rigtige lige nu"]);
  });
  it("lukkeårsagerne til valg: «Trak sig» · «Dublet» · «Gensidigt ikke et match» · «Andet» — husets ord med stort", () => {
    expect([...LUKKEAARSAGER_TIL_VALG]).toEqual(["trak_sig", "dublet", "gensidigt_ikke_match", "andet"]);
    expect(LUKKEAARSAGER_TIL_VALG.map((l) => LUKKEAARSAG_VALG_ORD[l])).toEqual(["Trak sig", "Dublet", "Gensidigt ikke et match", "Andet"]);
    for (const l of LUKKEAARSAGER) expect(LUKKEAARSAG_VALG_ORD[l]).toBe(valgOrd(LUKKEAARSAG_ORD[l]));
    expect(valgOrd("ærlig")).toBe("Ærlig");
    expect(valgOrd("")).toBe("");
  });
  it("intet valg går igen i de to dialoger — og værnet fælder et gengangerord", () => {
    const afslag = AFSLAGSGRUNDE.map((g) => AFSLAGSGRUND_ORD[g]);
    const luk = LUKKEAARSAGER_TIL_VALG.map((l) => LUKKEAARSAG_VALG_ORD[l]);
    expect(ordeneGaarIkkeIgen(afslag, luk)).toBe(true);
    expect(ordeneGaarIkkeIgen([...afslag, "Andet"], luk)).toBe(false);
    expect(ordeneGaarIkkeIgen(afslag, [...luk, "for tidligt "])).toBe(false);
  });
  it("«Andet» som lukkeårsag kræver en begrundelse — ingen anden gør", () => {
    expect(lukKraeverBegrundelse("andet")).toBe(true);
    for (const l of LUKKEAARSAGER.filter((x) => x !== "andet")) expect(lukKraeverBegrundelse(l)).toBe(false);
    expect(erLukBegrundelseGyldig("andet", null)).toBe(false);
    expect(erLukBegrundelseGyldig("andet", "   ")).toBe(false);
    expect(erLukBegrundelseGyldig("andet", "Vi aftalte at vente til foråret.")).toBe(true);
    expect(erLukBegrundelseGyldig("gensidigt_ikke_match", null)).toBe(true);
    expect(erLukBegrundelseGyldig("trak_sig", "")).toBe(true);
  });
});

describe("5. den nye lukkeårsag «gensidigt_ikke_match»", () => {
  it("luk med gensidigt_ikke_match fra ethvert åbent trin → lukket, alle trapper annulleres, INGEN trappe startes", () => {
    for (const fra of TRIN.filter((t) => t !== "lukket" && t !== "underskrevet")) {
      const dom = afgoerOvergang(fra, { art: "luk", aarsag: "gensidigt_ikke_match" }, ctx);
      expect(dom.ok && dom.overgang).toMatchObject({ til: "lukket", lukkeaarsag: "gensidigt_ikke_match", annuller: "alle", start: null, beslutning: true });
    }
    expect(afgoerOvergang("lukket", { art: "luk", aarsag: "gensidigt_ikke_match" }, ctx).ok).toBe(false);
  });
  it("årsagen står i LUKKEAARSAGER (før «andet»), har et ord, og genåbnes til trinnet før lukningen", () => {
    expect(LUKKEAARSAGER).toContain("gensidigt_ikke_match");
    expect(LUKKEAARSAGER.indexOf("gensidigt_ikke_match")).toBe(LUKKEAARSAGER.indexOf("andet") - 1);
    expect(LUKKEAARSAG_ORD.gensidigt_ikke_match).toBe("gensidigt ikke et match");
    const g = afgoerOvergang("lukket", { art: "genaabn" }, { paaPause: false, lukketFraTrin: "afholdt" });
    expect(g.ok && g.overgang.til).toBe("afholdt");
  });
  it("hver lukkeårsag har et ord i begge ordbøger", () => {
    for (const l of LUKKEAARSAGER as readonly Lukkeaarsag[]) {
      expect(typeof LUKKEAARSAG_ORD[l]).toBe("string");
      expect(LUKKEAARSAG_VALG_ORD[l].length).toBeGreaterThan(0);
    }
  });
});
