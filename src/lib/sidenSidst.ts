/**
 * src/lib/sidenSidst.ts
 *
 * «SIDEN SIDST» — hvad der er sket mens rådgiveren ikke kiggede. Rene
 * funktioner, testet (src/lib/__tests__/sidenSidst.test.ts): loftet,
 * sproget og sammenlægningen af navne. Datakilden er RPC'en
 * get_siden_sidst(siden) (migration 20260909100000) — et TIDSFILTER,
 * ingen dom: tærsklerne for hvad der er galt bor i motorerne og i pulsen
 * ovenover; her tælles kun hvad der har flyttet sig.
 *
 * BESLUTTET af Jonas 8/9: pr. rådgiver, SYV DAGES LOFT. Kommer du hver
 * dag, ser du gårsdagen; har du været væk en uge, ser du ugen; har du
 * været væk en måned, ser du syv dage — resten er ikke nyt længere, det
 * er tilstand, og tilstanden står i pulsen.
 *
 * STEMPLET (hooks/sidenSidst.ts, tabel forside_sidst_set): sættes ved
 * ÅBNING af forsiden, men det `siden` listen er regnet af holdes i
 * sessionen (sessionStorage), så listen ikke forsvinder anden gang man
 * kigger samme dag — man læser stadig «siden i går», til fanen lukkes.
 *
 * FEM SLAGS, alle med: rapporter (committede målte tal), beskeder (fra
 * medlemmer), svar (på forslag), betalinger (træk og perioder),
 * medlemmer (nye rækker i company_members). Nye medlemmer sker sjældent,
 * men når det sker, er det en ny kunde — den vigtigste linje af dem alle.
 * Rækkefølgen på fladen er tallets størrelse, størst først.
 */

export const SIDEN_SIDST_LOFT_DAGE = 7;
/** Navne der nævnes før «og N andre». */
export const NAVNE_MAKS = 3;

export type SidenSidstSlags = "rapporter" | "beskeder" | "svar" | "betalinger" | "medlemmer";

export interface SidenSidstRaekke {
  slags: SidenSidstSlags | string;
  antal: number;
  navne: string[];
}

const MS_PER_DOEGN = 86_400_000;

/** Det tidspunkt listen regnes fra: stemplet, dog aldrig længere tilbage
    end SIDEN_SIDST_LOFT_DAGE. Uden stempel (første gang): loftet. Et
    stempel i fremtiden (ur-skævhed) læses som nu. */
export function sidenAf(sidstSetAt: string | Date | null | undefined, nu: Date): Date {
  const loft = nu.getTime() - SIDEN_SIDST_LOFT_DAGE * MS_PER_DOEGN;
  if (sidstSetAt == null) return new Date(loft);
  const t = sidstSetAt instanceof Date ? sidstSetAt.getTime() : new Date(sidstSetAt).getTime();
  if (Number.isNaN(t)) return new Date(loft);
  return new Date(Math.min(Math.max(t, loft), nu.getTime()));
}

/** Hele kalenderdage fra `siden` til nu, på læserens dag. */
function kalenderdageSiden(siden: Date, nu: Date): number {
  const a = new Date(siden.getFullYear(), siden.getMonth(), siden.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

/** «siden i går», «siden i morges», «de seneste 5 dage», «den seneste uge». */
export function sidenTekst(siden: Date, nu: Date): string {
  const dage = kalenderdageSiden(siden, nu);
  if (dage <= 0) return "siden i morges";
  if (dage === 1) return "siden i går";
  if (dage >= SIDEN_SIDST_LOFT_DAGE) return "den seneste uge";
  return `de seneste ${dage} dage`;
}

const TALORD = ["nul", "en", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni", "ti", "elleve", "tolv"];

/** «Tre», «Elleve», «14» — talord op til tolv, som Jonas' eksempel («Tre rapporter kom ind»). */
export function talord(n: number, stort = true): string {
  const ord = n >= 0 && n < TALORD.length ? TALORD[n] : String(n);
  return stort ? ord.charAt(0).toUpperCase() + ord.slice(1) : ord;
}

/** «Doggybed, PHILBERT og Floren» · «Doggybed, PHILBERT, Floren og to andre». */
export function samlNavne(navne: readonly string[], maks = NAVNE_MAKS): string {
  const rene = navne.map((n) => n.trim()).filter(Boolean);
  if (rene.length === 0) return "";
  if (rene.length === 1) return rene[0];
  if (rene.length <= maks) return `${rene.slice(0, -1).join(", ")} og ${rene[rene.length - 1]}`;
  const rest = rene.length - maks;
  return `${rene.slice(0, maks).join(", ")} og ${talord(rest, false)} ${rest === 1 ? "anden" : "andre"}`;
}

/** Hvad der skete: ental som hel sætning (køn: «Et forslag», «En besked»),
    flertal med talord foran. */
const ORD: Record<SidenSidstSlags, [string, string]> = {
  rapporter: ["En rapport kom ind", "rapporter kom ind"],
  beskeder: ["En ny besked", "nye beskeder"],
  svar: ["Et forslag besvaret", "forslag besvaret"],
  betalinger: ["En betaling", "betalinger"],
  medlemmer: ["Et nyt medlem", "nye medlemmer"],
};

export interface SidenSidstLinje {
  slags: string;
  antal: number;
  /** «Tre rapporter kom ind · Doggybed, PHILBERT og Floren» */
  tekst: string;
}

/** Linjerne, størst først; ukendte slags springes over; nul-rækker ligeså.
    Navnene kommer allerede afskåret fra SQL (højst seks) — «og N andre»
    regnes af antallet af NAVNE, ikke af antallet af hændelser: tre
    beskeder fra Doggybed er én virksomhed. */
export function sidenSidstLinjer(raekker: readonly SidenSidstRaekke[]): SidenSidstLinje[] {
  const ud: SidenSidstLinje[] = [];
  for (const r of raekker) {
    if (!(r.slags in ORD) || r.antal <= 0) continue;
    const [ental, flertal] = ORD[r.slags as SidenSidstSlags];
    const navne = samlNavne(r.navne);
    const hoved = r.antal === 1 ? ental : `${talord(r.antal)} ${flertal}`;
    ud.push({ slags: r.slags, antal: r.antal, tekst: `${hoved}${navne ? ` · ${navne}` : ""}` });
  }
  return ud.sort((a, b) => b.antal - a.antal);
}

/** Den tomme tilstand — sand og rolig, ikke en fejl. */
export function intetNytTekst(siden: Date, nu: Date): string {
  return `Intet nyt ${sidenTekst(siden, nu)}.`;
}
