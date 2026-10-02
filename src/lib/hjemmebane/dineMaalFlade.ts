/**
 * src/lib/hjemmebane/dineMaalFlade.ts — ordene og de små afledninger på det
 * nye «Dine mål» (/milestones, fladen 1/10-2026; Jonas 21:04 ja til designet,
 * 22:37 ja til «Jeres retning»). Motoren (maalTal.ts) regner ALT om tal, spor,
 * frister og skridt; denne fil giver kun det, fladen tegner: hovedets linje og
 * chips, banens andele som tegnbare tal, et begivenhedsmåls skridt-fremdrift,
 * guidens kort og tidslinjens geometri. Komponenterne under
 * components/hjemmebane/milestones/ regner intet selv.
 *
 * REN: ingen React, ingen Supabase, ingen Date.now — tiden gives ind som `nu`.
 */
import { kbhDato } from "@/lib/hverdage";
import { MAANEDSNAVNE } from "@/lib/maanedsnoegle";
import { MAX_AKTIVE_MAAL } from "./maal";
import { dageMellem, MAAL_NOEGLER, MAAL_ORD, type MaalKort, type MaalNoegle, type SporStatus, type TidslinjeDom, type TidslinjePunkt } from "./maalTal";

// ── Hovedet ────────────────────────────────────────────────────────────────

export const DINE_MAAL_EYEBROW = "Dine mål";
export const DINE_MAAL_OVERSKRIFT = "Hvor I er på vej hen";
export const DINE_MAAL_FEJL_TEKST = "Dine mål kunne ikke hentes.";
export const PROEV_IGEN = "Prøv igen";
/** Tal-målene, når Score-grundlaget fejlede eller afventer sin migration (dineMaalGrundlag.tallenFejlede). */
export const TALLENE_FEJLEDE_TEKST = "Tallene bag målene kunne ikke læses lige nu — målene står, men sporet kan ikke afgøres.";
/** Skive 3, rådets fund 6: kvartalstjek-hentningen fejlede — ingen tjek tegnes, og det siges. */
export const KVARTALSTJEK_FEJLEDE_TEKST = "Kvartalstjekkene kunne ikke hentes — de vises igen, når siden kan læse dem.";
export const AFVENTER_MIGRATION_TEKST = "Mål med tal er på vej — indtil da kan målene gøres skarpe, når opdateringen er kørt.";

/** «Dine mål · oktober 2026» — måneden i dansk tid. */
export function eyebrowTekst(nu: Date): string {
  const d = kbhDato(nu);
  const navn = MAANEDSNAVNE[Number(d.slice(5, 7)) - 1] ?? d.slice(5, 7);
  return `${DINE_MAAL_EYEBROW} · ${navn} ${d.slice(0, 4)}`;
}

/** Rådets fund 3 (skive 3): pladserne er databasens — når ubekræftede mål fylder dem, lover linjen ingen plads.
    Runde 2, fund 4: ÉT ord for et ubekræftet mål overalt — «venter på jeres ja» (aldrig «forslagene»: det gamle
    kort hedder «Er det stadig jeres mål?»). */
export const TAG_STILLING_TEKST = "Svar på de mål, der venter på jeres ja, for at få plads til jeres eget";
/** Hovedlinjens første led uden bekræftede mål: med ubekræftede siges det ærligt (runde 2, fund 4). */
export const INGEN_MAAL_TEKST = "Ingen mål endnu";
export const INGEN_BEKRAEFTEDE_MAAL_TEKST = "Ingen bekræftede mål endnu";

/** «· N venter på jeres ja» — de ubekræftede (forslag og gamle mål) i hovedlinjen. */
export const venterPaaJaTekst = (antal: number): string => (antal === 1 ? "1 venter på jeres ja" : `${antal} venter på jeres ja`);

/**
 * «N mål for de næste 12 måneder · M plads ledig» (designet 1/10). N er de
 * BEKRÆFTEDE (dem, der tæller); pladsen er DATABASENS: MAX_AKTIVE_MAAL −
 * (bekræftede + ubekræftede), fordi triggeren tæller alle aktive (rådets fund
 * 3). Med ubekræftede står «· M venter på jeres ja», og er pladserne fyldt af
 * dem, siger linjen «Svar på de mål, der venter på jeres ja …» — aldrig «3
 * pladser ledige», som databasen ville afvise. Uden bekræftede, men med
 * ubekræftede: «Ingen bekræftede mål endnu» (runde 2, fund 4 — «Ingen mål
 * endnu» ville lyve, når tre står og venter).
 *
 * ÉN hovedlinje (2/10-2026; i drift stod to røde linjer oven på hinanden —
 * hovedLinje OG dineMaal.graenseTekst, «5 af 3 aktive mål» — Rallysupport):
 * /milestones tegner KUN denne. Over grænsen (flere BEKRÆFTEDE end tre — mål
 * fra før grænsen) siger den: «5 aktive mål — flere end de 3, der er plads
 * til. Parkér eller markér nogle som nået, så I står med højst 3.» med «· N
 * venter på jeres ja» efter tallet (samme ord som dineMaal.graenseTekst —
 * «Parkér et» var falsk for N > 3: ét parkeret mål giver ikke plads; rådets
 * fund 2/10);
 * aldrig «5 af 3». Fylder de ubekræftede pladserne op (bekræftede < 3), er
 * svaret vejen til plads (TAG_STILLING); er de bekræftede tre, er der «ingen
 * plads ledig», uanset hvor mange der venter.
 */
export function hovedLinje(antalBekraeftede: number, antalUbekraeftede = 0): string {
  const venter = antalUbekraeftede > 0 ? ` · ${venterPaaJaTekst(antalUbekraeftede)}` : "";
  if (antalBekraeftede > MAX_AKTIVE_MAAL) {
    return `${antalBekraeftede} aktive mål${venter} — flere end de ${MAX_AKTIVE_MAAL}, der er plads til. Parkér eller markér nogle som nået, så I står med højst ${MAX_AKTIVE_MAAL}.`;
  }
  const ingen = antalUbekraeftede > 0 ? INGEN_BEKRAEFTEDE_MAAL_TEKST : INGEN_MAAL_TEKST;
  const maal = antalBekraeftede === 0 ? ingen : antalBekraeftede === 1 ? "1 mål for de næste 12 måneder" : `${antalBekraeftede} mål for de næste 12 måneder`;
  const plads = MAX_AKTIVE_MAAL - (antalBekraeftede + antalUbekraeftede);
  if (plads > 0) return `${maal}${venter} · ${plads === 1 ? "1 plads ledig" : `${plads} pladser ledige`}`;
  if (antalBekraeftede < MAX_AKTIVE_MAAL && antalUbekraeftede > 0) return `${maal}${venter} · ${TAG_STILLING_TEKST}`;
  return `${maal}${venter} · ingen plads ledig`;
}

export interface StatusChip {
  status: SporStatus;
  antal: number;
  /** «1 på sporet» · «2 bagud» — motorens ord med lille forbogstav. */
  tekst: string;
}

const CHIP_ORDEN: readonly SporStatus[] = ["bagud", "paa_sporet", "foran", "naaet_i_tal", "kan_ikke_afgoeres"];

/** Chips i hovedet: én pr. status med mindst ét TAL-mål (begivenheder og gamle mål har ingen status at tælle). Bagud først. */
export function statusChips(kort: readonly MaalKort[]): StatusChip[] {
  const antal = new Map<SporStatus, number>();
  for (const k of kort) {
    if (k.art !== "tal") continue;
    antal.set(k.sporet.status, (antal.get(k.sporet.status) ?? 0) + 1);
  }
  return CHIP_ORDEN.filter((s) => (antal.get(s) ?? 0) > 0).map((status) => {
    const n = antal.get(status) ?? 0;
    const ord = MAAL_ORD.status[status];
    return { status, antal: n, tekst: `${n} ${ord.charAt(0).toLowerCase()}${ord.slice(1)}` };
  });
}

/** Chip-tonen: rust for bagud, evergreen for på sporet/foran/nået, dæmpet ellers. Én dom, så alle flader farver ens. */
export type ChipTone = "god" | "advarsel" | "neutral";
export function chipTone(status: SporStatus): ChipTone {
  if (status === "bagud") return "advarsel";
  if (status === "kan_ikke_afgoeres") return "neutral";
  return "god";
}

// ── Banen på kortet ────────────────────────────────────────────────────────

export interface BaneDom {
  /** Den fyldte del, 0–1 (andelAfVejen klippet). */
  fyldt: number;
  /** Stregen «hvor I burde være», 0–1; null når motoren ikke har en forventning. */
  streg: number | null;
  /** Procenter til style (afrundet til én decimal). */
  fyldtPct: number;
  stregPct: number | null;
}

const klip = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => Math.round(v * 1000) / 10;

/** Banen fra motorens spor: fyldt = andelAfVejen klippet til 0–1 (en negativ andel tegnes tom); stregen = forventetAndel. */
export function bane(kort: Pick<MaalKort, "sporet">): BaneDom {
  const fyldt = kort.sporet.andelAfVejen === null ? 0 : klip(kort.sporet.andelAfVejen);
  const streg = kort.sporet.forventetAndel === null ? null : klip(kort.sporet.forventetAndel);
  return { fyldt, streg, fyldtPct: pct(fyldt), stregPct: streg === null ? null : pct(streg) };
}

/** «hvor I burde være pr. august» — stregens forklaring, af motorens forventetPr (dansk dato «YYYY-MM-DD»). */
export function stregTekst(kort: Pick<MaalKort, "sporet">): string {
  const d = kort.sporet.forventetPr;
  const navn = MAANEDSNAVNE[Number(d.slice(5, 7)) - 1] ?? d.slice(5, 7);
  return `hvor I burde være pr. ${navn}`;
}

/** Et begivenhedsmåls fremdrift i skridt (designet: «et begivenhedsmål viser skridt-fremdrift i stedet»). Ingen procent. */
export interface SkridtFremdrift {
  gjorte: number;
  alle: number;
  andel: number;
  tekst: string;
}
export function skridtFremdrift(kort: Pick<MaalKort, "naeste">): SkridtFremdrift {
  const aabne = kort.naeste.oevrigeAabne + (kort.naeste.skridt ? 1 : 0);
  const gjorte = kort.naeste.gjorte;
  const alle = gjorte + aabne;
  const tekst = alle === 0 ? "Ingen skridt endnu" : `${gjorte} af ${alle} skridt gjort`;
  return { gjorte, alle, andel: alle === 0 ? 0 : gjorte / alle, tekst };
}

/** «3 skridt mere · 2 gjort» — linjen under det næste skridt; null når der hverken er flere åbne eller gjorte. */
export function flereSkridtTekst(kort: Pick<MaalKort, "naeste">): string | null {
  const { oevrigeAabne, gjorte } = kort.naeste;
  if (oevrigeAabne === 0 && gjorte === 0) return null;
  const dele: string[] = [];
  if (oevrigeAabne > 0) dele.push(oevrigeAabne === 1 ? "1 skridt mere" : `${oevrigeAabne} skridt mere`);
  if (gjorte > 0) dele.push(gjorte === 1 ? "1 gjort" : `${gjorte} gjort`);
  return dele.join(" · ");
}

/** Det store tals undertekst: «pr. august (godkendt)» (læst) eller «tastet» (andet_tal). */
export const TASTET_TEKST = "tastet";
export function talUndertekst(kort: Pick<MaalKort, "prTekst" | "noegle" | "tal">): string | null {
  if (kort.tal?.status !== "ok") return null;
  return kort.prTekst ?? (kort.noegle === "andet_tal" ? TASTET_TEKST : null);
}

// ── Ordene på kortet ───────────────────────────────────────────────────────

export const KORT_ORD = {
  gjort: "Gjort",
  naesteSkridt: "Næste skridt",
  senest: "senest",
  foreslaaetAf: "foreslået af",
  venterPaaSvar: "venter på jeres svar",
  svarPaaForsiden: "Svar på forsiden",
  foersteSkridt: "Hvad er det første, I gør?",
  tilfoejSkridt: "Tilføj skridt",
  menu: "Flere handlinger",
  rediger: "Redigér",
  parker: "Parkér",
  markerNaaet: "Markér som nået",
  slet: "Slet",
  goerSkarpt: MAAL_ORD.goerSkarpt,
  gammeltMaal: "Målet er fra før tallene — gør det skarpt, så det kan følges.",
  tomPladsTitel: "Plads til ét mål mere",
  tomPladsTekst: "Hvad skal ske i jeres virksomhed det næste år?",
  saetMaal: "Sæt et mål",
  start: "start",
  sporet: "sporet",
  maal: "mål",
} as const;

// ── Tal tastet på dansk ────────────────────────────────────────────────────

/**
 * Ét dansk tal fra et inputfelt (rådets fund 4, 1/10 aften — før læste guiden
 * og «Redigér» «1.500» som 1,5 og «2.000.000» som NaN). Reglerne:
 *   - mellemrum (også hårde) ignoreres; tomt → null; fortegn + eller − foran.
 *   - KOMMA er decimaltegnet; højst ét: «1,5» → 1,5 · «1.500,5» → 1500,5.
 *   - PUNKTUM er tusindtalsadskiller, når hver gruppe efter det er præcis tre
 *     cifre: «1.500» → 1500 · «2.000.000» → 2000000 · «-200.000» → −200000.
 *   - ÉT punktum, der IKKE følges af præcis tre cifre, og intet komma, læses som
 *     decimaltegn (det tvetydige tilfælde — valgt, fordi «1.5» ellers ville
 *     blive afvist eller læst som 15, og ingen skriver et tusindtal med én eller
 *     to cifre): «1.5» → 1,5 · «1.25» → 1,25. «1.500» er altså ALTID 1500 —
 *     skriv «1,5» for halvanden.
 *   - alt andet («abc», «1,5,5», «1.50,5», «1.», «.5») → null.
 *
 * Rådets runde 2 (fund 6): kendte SUFFIKSER bagest fjernes — «kr.», «kr», «%»,
 * «mdr.», «mdr» ignoreres; «mio.»/«mio» ganger med 1.000.000, men KUN når
 * tallet foran er entydigt: uden punktum («2 mio.», «1,5 mio. kr.»). «1.500 mio.»
 * og «1.5 mio.» afvises — punktummet er tusindtal ELLER decimal, og med en
 * million-faktor er fejlen tusind gange større end ellers. Unicode-minus «−»
 * (U+2212) læses som «-». Alt andet, der ikke er et tal («100 kunder», «5 stk»,
 * «ca. 40»), får sin egen grund: TAL_KUN_TALLET — danskTalDom bærer den, danskTal
 * svarer kun med tallet (null ved nej).
 */
export const TAL_KUN_TALLET = "Skriv kun tallet — uden kr., % eller mio.";
export const TAL_MIO_TVETYDIG = "Skriv mio.-tallet med komma — fx «1,5 mio.» — eller skriv hele tallet.";

export interface DanskTalDom {
  /** Tallet; null når teksten ikke er ét tal. */
  vaerdi: number | null;
  /** En egen grund, når vi HAR en (suffiks, tvetydig mio.); null ellers — kalderen bruger sin egen tekst («Skriv måltallet»). */
  grund: string | null;
}

/** Kendte suffikser bagest; faktor 1 = ignoreres, 1e6 = millioner. */
const SUFFIKSER: readonly { moenster: RegExp; faktor: number }[] = [
  { moenster: /\s*kr\.?$/i, faktor: 1 },
  { moenster: /\s*%$/, faktor: 1 },
  { moenster: /\s*mdr\.?$/i, faktor: 1 },
  { moenster: /\s*mio\.?$/i, faktor: 1e6 },
];

/** Selve tallet — reglerne i filhovedet ovenfor; ingen suffikser. */
function rentDanskTal(raa: string): number | null {
  const s = raa.replace(/[\s\u00a0]/g, "");
  if (s === "") return null;
  const m = /^([+-]?)(\d[\d.]*)(?:,(\d+))?$/.exec(s);
  if (!m) return null;
  const [, fortegn, heltalRaa, decimaler] = m;
  const grupper = heltalRaa.split(".");
  let heltal: string;
  let brok: string | undefined = decimaler;
  if (grupper.length === 1) {
    heltal = grupper[0];
  } else if (decimaler === undefined && grupper.length === 2 && grupper[1].length !== 3) {
    // «1.5» — ét punktum uden tre cifre efter: decimaltegn (se filhovedet ovenfor).
    if (grupper[1] === "") return null;
    heltal = grupper[0];
    brok = grupper[1];
  } else {
    if (!grupper.slice(1).every((g) => g.length === 3)) return null;
    heltal = grupper.join("");
  }
  const v = Number(`${fortegn}${heltal}${brok === undefined ? "" : `.${brok}`}`);
  return Number.isFinite(v) ? v : null;
}

export function danskTalDom(raa: string): DanskTalDom {
  // Unicode-minus → ASCII; hårdt mellemrum som blødt.
  let s = raa.replace(/\u2212/g, "-").replace(/\u00a0/g, " ").trim();
  if (s === "") return { vaerdi: null, grund: null };
  let faktor = 1;
  let fundet = true;
  while (fundet) {
    fundet = false;
    for (const suf of SUFFIKSER) {
      const m = suf.moenster.exec(s);
      if (!m) continue;
      if (suf.faktor !== 1 && faktor !== 1) return { vaerdi: null, grund: TAL_KUN_TALLET }; // «2 mio. mio.»
      faktor *= suf.faktor;
      s = s.slice(0, m.index).trim();
      fundet = true;
      break;
    }
  }
  if (s === "") return { vaerdi: null, grund: TAL_KUN_TALLET }; // kun et suffiks («kr.»)
  const v = rentDanskTal(s);
  if (v === null) {
    // Bogstaver eller andre tegn end cifre, punktum, komma, fortegn og mellemrum → vores egen grund.
    return { vaerdi: null, grund: /[^\d\s.,+-]/.test(s) ? TAL_KUN_TALLET : null };
  }
  if (faktor !== 1 && s.includes(".")) return { vaerdi: null, grund: TAL_MIO_TVETYDIG };
  const ud = v * faktor;
  return Number.isFinite(ud) ? { vaerdi: ud, grund: null } : { vaerdi: null, grund: null };
}

/** Tallet alene — null ved nej (dommen med grund: danskTalDom). */
export function danskTal(raa: string): number | null {
  return danskTalDom(raa).vaerdi;
}

/**
 * Et tal TIL et inputfelt — den danske form, danskTal læser tilbage uændret:
 * komma som decimaltegn, INGEN gruppering (rådets runde 2, fund 1: «String(2.125)»
 * gav «2.125», som danskTal læste som 2125 — et uberørt felt ændrede tallet
 * ×1000 ved Gem). Rundturen danskTal(danskTalTilFelt(v)) === v er prøvet.
 * null/NaN/∞ → tomt felt. Et tal, String() skriver med eksponent («1e21»,
 * «1e-7»), skrives ud i cifre.
 */
export function danskTalTilFelt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  let s = String(v);
  if (/e/i.test(s)) s = v.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
  return s.replace(".", ",");
}

// ── Guiden ─────────────────────────────────────────────────────────────────

/** Guidens valg i trin 1: de fem nøgler og begivenheden. */
export type GuideValg = MaalNoegle | "begivenhed";

export interface GuideKort {
  valg: GuideValg;
  titel: string;
  /** Kortets lille forklaring. */
  tekst: string;
}

export const GUIDE_ORD = {
  trin1: "Hvad vil I nå?",
  trin2: "Hvor meget og hvornår?",
  trin3: "Det første skridt",
  nuvaerende: "Nu",
  mangler: "mangler",
  tastes: "tastes af jer",
  maaltal: "Måltal",
  udgangspunkt: "Udgangspunkt",
  enhed: "Hvad tæller tallet?",
  frist: "Frist",
  fristHjaelp: "Foreslået: om 12 måneder. Højst 36 måneder frem.",
  titel: "Målet som én sætning",
  titelHjaelp: "Foreslået af tallet — ret den, så den lyder som jer.",
  kraever: "Det kræver ca.",
  prMaaned: "pr. måned",
  kraeverNed: "Tallet skal ned med ca.",
  springOver: "Spring over",
  tilbage: "Tilbage",
  videre: "Videre",
  gem: "Sæt målet",
  gemSkarpt: "Gør målet skarpt",
  gemmer: "Gemmer…",
  skridtTitel: "Skridtet",
  skridtFrist: "Frist for skridtet",
  skridtHjaelp: "Senest målets frist.",
  /** Fund 1: målet er oprettet, kun skridtet udestår. */
  maaletErSat: "Målet er sat — kun skridtet mangler.",
} as const;

const NOEGLE_TEKST: Record<MaalNoegle, string> = {
  omsaetning_aarstakt: "De seneste tre måneders omsætning gange 12.",
  resultat_aarstakt: "De seneste tre måneders resultat før skat gange 12.",
  likviditet_mdr: "Hvor mange måneders drift banken kan bære.",
  db_grad: "Dækningsbidrag delt med omsætning.",
  andet_tal: "Et tal I selv følger — kunder, ansatte, ordrer.",
};

/** Kortene i trin 1, i husets rækkefølge: de fire læste nøgler, så «et andet tal», så begivenheden. */
export function guideKort(): GuideKort[] {
  const noegler = MAAL_NOEGLER.map((n) => ({ valg: n as GuideValg, titel: MAAL_ORD.noegle[n], tekst: NOEGLE_TEKST[n] }));
  const begivenhed: GuideKort = { valg: "begivenhed", titel: MAAL_ORD.begivenhedKort.titel, tekst: MAAL_ORD.begivenhedKort.tekst };
  return [...noegler, begivenhed];
}

/** «Det kræver ca. 83.000 kr. pr. måned» — eller «Tallet skal ned med ca. …» for et mål, der sænker tallet. null uden tal. */
export function kraeverTekst(kraeverPrMaaned: number | null, tekst: (v: number) => string): string | null {
  if (kraeverPrMaaned === null || !Number.isFinite(kraeverPrMaaned)) return null;
  if (kraeverPrMaaned === 0) return null;
  if (kraeverPrMaaned < 0) return `${GUIDE_ORD.kraeverNed} ${tekst(-kraeverPrMaaned)} ${GUIDE_ORD.prMaaned}`;
  return `${GUIDE_ORD.kraever} ${tekst(kraeverPrMaaned)} ${GUIDE_ORD.prMaaned}`;
}

// ── Rejsen (tidslinjen) ────────────────────────────────────────────────────

export const REJSEN_ORD = {
  eyebrow: "Rejsen",
  titel: "De næste 12 måneder",
  idag: "i dag",
  forklaring: {
    skridt_gjort: "skridt gjort",
    maal_frist: "måls frist",
    naaet: "nået",
    kvartal: "kvartal",
  },
  tom: "Tidslinjen fyldes, efterhånden som I gør skridt og sætter frister.",
} as const;

export interface TidslinjeMarkoer {
  punkt: TidslinjePunkt;
  /** 0–1 langs linjen. */
  x: number;
  /** «12. nov.» */
  dato: string;
}

export interface TidslinjeTegning {
  nuX: number;
  /** Start, kvartaler og slut — aksens mærker. */
  akse: TidslinjeMarkoer[];
  skridt: TidslinjeMarkoer[];
  frister: TidslinjeMarkoer[];
  /** Ingen skridt og ingen frister på linjen. */
  tom: boolean;
}

const kortDato = (d: string): string => {
  const md = Number(d.slice(5, 7));
  return `${Number(d.slice(8, 10))}. ${(MAANEDSNAVNE[md - 1] ?? "").slice(0, 3)}.`;
};

/** Punkterne som positioner 0–1: x = (dato − start) ÷ (slut − start) i kalenderdage. */
export function tidslinjeTegning(t: TidslinjeDom): TidslinjeTegning {
  const laengde = Math.max(1, dageMellem(t.start, t.slut));
  const til = (p: TidslinjePunkt): TidslinjeMarkoer => ({ punkt: p, x: klip(dageMellem(t.start, p.dato) / laengde), dato: kortDato(p.dato) });
  const akse = t.punkter.filter((p) => p.art === "start" || p.art === "kvartal" || p.art === "slut").map(til);
  const skridt = t.punkter.filter((p) => p.art === "skridt_gjort").map(til);
  const frister = t.punkter.filter((p) => p.art === "maal_frist").map(til);
  return { nuX: klip(t.nuAndel), akse, skridt, frister, tom: skridt.length === 0 && frister.length === 0 };
}
