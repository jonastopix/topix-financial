import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for eksterne links af brugerskrevne værdier (22/9-2026). To
 * domme, hver bevist på en kopi med fejlen indsat:
 *
 *   1. HREF'EN GÅR GENNEM SKEMAKONTROLLEN. EksterntLink bygger sit href af
 *      eksterntHref og TEGNER INTET LINK, når den svarer null. Et href
 *      bygget af den rå værdi — `href={vaerdi}` eller `href={`https://${…}`}`
 *      — fælder dommen. Og linket bærer target="_blank" MED
 *      rel="noopener noreferrer": uden dem får en fremmed side fat i
 *      window.opener og ser, hvor brugeren kom fra.
 *   2. INGEN GÅR UDEN OM. De skærme, der viser en brugerskrevet adresse
 *      (ansøgningens detaljevisning, medlemsprofilen), bygger aldrig selv et
 *      href af feltet — de bruger EksterntLink eller eksterntHref.
 *
 * Hvorfor et kildeværn og ikke bare prøver på hjælperen: hjælperen kan være
 * nok så rigtig, hvis kaldestedet sætter feltet direkte i href'en. Det er
 * netop dén fejl, der ikke kan ses i en enhedsprøve.
 *
 * LÆST RÅT, HVOR DET GÆLDER. `udenKommentarer` sletter alt efter to skråstreger
 * — og både dommens egen linje «startsWith("//")» og et forbudt
 * «href={`https://…`}» bærer netop to skråstreger. Rensningen åd værnets bevis
 * to gange under bygningen. Derfor: POSITIVE krav på den rensede tekst (en
 * kommentar må ikke opfylde en dom), NEGATIVE krav på den rå.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const LINK = "src/components/hjemmebane/EksterntLink.tsx";
const DOM = "src/lib/eksterntLink.ts";
const ANSOEGNING = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const PROFIL = "src/components/hjemmebane/members/MemberProfileView.tsx";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const hrefGaarGennemSkemakontrollen = (link: string, dom: string): boolean => {
  // KOMPONENTEN læses uden kommentarer (en kommentar må ikke kunne opfylde en dom).
  // HJÆLPEREN læses RÅT: rensningen sletter alt efter to skråstreger, og netop
  // «if (s.startsWith("//"))» er en af de linjer, der skal bevises. Lærdommen
  // «udenKommentarer æder URL'er» — her åd den værnets eget bevis, første gang.
  const v = udenKommentarer(link), d = dom;
  return (
    // Komponenten: href'en ER svaret fra hjælperen, og null tegner ingen <a>.
    v.includes('import { eksterntHref } from "@/lib/eksterntLink";') &&
    v.includes("const href = eksterntHref(vaerdi);") &&
    v.includes("if (href === null) return <>{vaerdi}</>;") &&
    /href=\{href\}/.test(v) &&
    (v.match(/href=\{/g) ?? []).length === 1 &&
    // Aldrig et href bygget af den rå værdi eller af en streng her.
    !/href=\{vaerdi\}/.test(v) &&
    !/href=\{`/.test(v) &&
    !/href="/.test(v) &&
    v.includes('target="_blank"') &&
    v.includes('rel="noopener noreferrer"') &&
    // Hjælperen: hvidt skema, ikke en sort liste — og den svarer kun http(s).
    d.includes("export function eksterntHref(") &&
    d.includes("if (ETHVERT_SKEMA.test(s)) return null;") &&
    /^const ETHVERT_SKEMA = \/\^\[a-z\]\[a-z0-9\+\.-\]\*:\/i;$/m.test(d) &&
    d.includes('if (u.protocol !== "http:" && u.protocol !== "https:") return null;') &&
    d.includes('if (u.hostname === "") return null;') &&
    d.includes('if (s.startsWith("//")) return null;')
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenGaarUdenOm = (ansoegning: string, profil: string): boolean => {
  // De POSITIVE krav læses uden kommentarer: en kommentar må ikke kunne opfylde
  // en dom. De NEGATIVE læses RÅT — et forbudt href bærer typisk «https://», og
  // rensningen ville spise resten af linjen og dermed beviset (samme lærdom som
  // i dom 1; den kostede to kørsler her).
  const a = udenKommentarer(ansoegning), p = udenKommentarer(profil);
  const aRaa = ansoegning, pRaa = profil;
  return (
    a.includes('import { EksterntLink } from "@/components/hjemmebane/EksterntLink";') &&
    a.includes("<EksterntLink vaerdi={a.hjemmeside} />") &&
    // Ansøgningsvisningen bygger ALDRIG selv et href af hjemmesiden. Den har ét
    // andet <a> — aftalegrundlagets `a.aftale_url` — og det er VORES egen adresse,
    // bygget af send-til-underskrift, ikke en streng en fremmed har skrevet.
    // Derfor er dommen om FELTET, ikke om «href» som ord.
    !/href=\{a\.hjemmeside/.test(aRaa) &&
    !/href=\{`[^`]*\$\{a\.hjemmeside/.test(aRaa) &&
    // Profilen går gennem hjælperen og aldrig uden om.
    p.includes('import { eksterntHref } from "@/lib/eksterntLink";') &&
    p.includes("eksterntHref(profile.website)") &&
    p.includes("eksterntHref(profile.linkedin_url)") &&
    !/href=\{profile\./.test(pRaa)
  );
};

describe("eksterntLink.guard — et href af en brugerskrevet værdi", () => {
  it("1. href'en er skemakontrollens svar, og null tegner ingen <a>", () => {
    expect(hrefGaarGennemSkemakontrollen(laes(LINK), laes(DOM))).toBe(true);
  });
  it("2. ansøgningsvisningen og medlemsprofilen går ikke uden om", () => {
    expect(ingenGaarUdenOm(laes(ANSOEGNING), laes(PROFIL))).toBe(true);
  });
});

describe("eksterntLink.guard — dommene fanger fejlen på en kopi", () => {
  const link = laes(LINK), dom = laes(DOM), ansoegning = laes(ANSOEGNING), profil = laes(PROFIL);

  it("ET HREF UDEN SKEMAKONTROL fælder dom 1", () => {
    // Præcis fejlen værnet findes for: den rå værdi sat direkte i href'en.
    const raat = link.split("href={href}").join("href={vaerdi}");
    expect(raat).not.toBe(link);
    expect(hrefGaarGennemSkemakontrollen(raat, dom)).toBe(false);
    // Og den næsten-rigtige: https:// klistret på uden at spørge om skemaet.
    const klistret = link
      .split("const href = eksterntHref(vaerdi);").join("const href = `https://${vaerdi}`;")
      .split("href={href}").join("href={`https://${vaerdi}`}");
    expect(hrefGaarGennemSkemakontrollen(klistret, dom)).toBe(false);
  });

  it("et link, der tegnes ALLIGEVEL når hjælperen siger null, fælder dom 1", () => {
    expect(hrefGaarGennemSkemakontrollen(link.split("if (href === null) return <>{vaerdi}</>;").join(""), dom)).toBe(false);
  });

  it("target uden rel, eller rel uden noopener, fælder dom 1", () => {
    expect(hrefGaarGennemSkemakontrollen(link.split('rel="noopener noreferrer"').join(""), dom)).toBe(false);
    expect(hrefGaarGennemSkemakontrollen(link.split('rel="noopener noreferrer"').join('rel="noreferrer"'), dom)).toBe(false);
    expect(hrefGaarGennemSkemakontrollen(link.split('target="_blank"').join(""), dom)).toBe(false);
  });

  it("skemakontrollen fjernet i hjælperen fælder dom 1", () => {
    expect(hrefGaarGennemSkemakontrollen(link, dom.split("if (ETHVERT_SKEMA.test(s)) return null;").join(""))).toBe(false);
    // En SORT liste i stedet for det hvide skema: «javascript» alene er ikke nok.
    expect(hrefGaarGennemSkemakontrollen(link, dom.split("const ETHVERT_SKEMA = /^[a-z][a-z0-9+.-]*:/i;").join("const ETHVERT_SKEMA = /^javascript:/i;"))).toBe(false);
    expect(hrefGaarGennemSkemakontrollen(link, dom.split('if (u.hostname === "") return null;').join(""))).toBe(false);
    expect(hrefGaarGennemSkemakontrollen(link, dom.split('if (s.startsWith("//")) return null;').join(""))).toBe(false);
  });

  it("et kaldested, der bygger sit eget href, fælder dom 2", () => {
    expect(ingenGaarUdenOm(`${ansoegning}\nconst x = <a href={a.hjemmeside}>{a.hjemmeside}</a>;\n`, profil)).toBe(false);
    // Almindelig streng, ikke en skabelon: den indsatte fejl bærer selv backticks.
    const klistret = '\nconst z = <a href={`https://${a.hjemmeside}`}>web</a>;\n';
    expect(ingenGaarUdenOm(ansoegning + klistret, profil)).toBe(false);
    // Men aftalegrundlagets eget link må blive stående — det er ikke en fremmeds tekst.
    expect(ingenGaarUdenOm(ansoegning, profil)).toBe(true);
    expect(ingenGaarUdenOm(ansoegning.split("<EksterntLink vaerdi={a.hjemmeside} />").join("{a.hjemmeside}"), profil)).toBe(false);
    expect(ingenGaarUdenOm(ansoegning, `${profil}\nconst y = <a href={profile.website}>web</a>;\n`)).toBe(false);
  });
});
