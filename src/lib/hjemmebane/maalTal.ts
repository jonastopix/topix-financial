/**
 * src/lib/hjemmebane/maalTal.ts — MOTOREN bag det nye «Dine mål» (/milestones).
 *
 * Jonas 1/10-2026 kl. 21:04: ja til designet — ét kort pr. mål (højst tre),
 * målet som én sætning, TALLET som det store («1,58 mio. kr. pr. august
 * (godkendt)»), en bane fra udgangspunkt til mål med en streg for «hvor I
 * burde være nu», status «På sporet / Bagud / Foran» UDLEDT AF TALLENE
 * (aldrig tastet), frist-nedtælling, ÉT næste skridt pr. mål, guidet
 * oprettelse i tre trin og en 12-måneders tidslinje. «Nået» er fortsat KUN et
 * menneskes klik (status = 'completed', milepaelDom.erMarkeretNaaet) — et tal,
 * der når måltallet, giver «Måltallet er nået», aldrig et lukket mål.
 *
 * Designet og regnestykkerne: docs/dine-maal-design.md. Datamodellen:
 * migration 20261001190000_maal_tal.sql (art, maal_noegle, udgangspunkt,
 * udgangspunkt_dato på milestones).
 *
 * REN: ingen React, ingen Supabase, ingen Date.now — tiden gives ind som `nu`.
 * Tallene læses af de SAMME målte, afsluttede måneder som Boardroom Score
 * (boardroomScore/soejler.ts: maalteAfsluttede, aeldsteFriskeMaaned,
 * resultatAf, likviditet) og omkostningsnoegler.ts — ingen lokale lister.
 * Skridtenes grupper kommer fra planen.ts (grupperSkridt). Datoer er danske
 * (hverdage.ts: kbhDato, laegMaanederTilDato).
 */
import {
  aeldsteFriskeMaaned,
  FRISKHED_MAANEDER,
  likviditet,
  maalteAfsluttede,
  naesteMaaned,
  resultatAf,
  VINDUE_MAANEDER,
  type ScoreMaaned,
} from "@/lib/boardroomScore";
import { CANONICAL } from "@/lib/omkostningsnoegler";
import { kbhDato, laegDageTilDato, laegMaanederTilDato } from "@/lib/hverdage";
import { MAANEDSNAVNE } from "@/lib/maanedsnoegle";
import { grupperSkridt } from "./planen";
import { erUdloebetForslag } from "./forsidePlan";
import { danskDato } from "./skridtForslag";

// ── Ordforrådet (står ORDRET i migrationens CHECK'e — kildeværn maalTal.guard) ──

export const MAAL_ARTER = ["tal", "begivenhed"] as const;
export type MaalArt = (typeof MAAL_ARTER)[number];

export const MAAL_NOEGLER = ["omsaetning_aarstakt", "resultat_aarstakt", "likviditet_mdr", "db_grad", "andet_tal"] as const;
export type MaalNoegle = (typeof MAAL_NOEGLER)[number];

/** Et felt fra databasen er en observation: læs det, dømt mod ordforrådet. Ukendt → null. */
export function laesArt(v: unknown): MaalArt | null {
  return typeof v === "string" && (MAAL_ARTER as readonly string[]).includes(v) ? (v as MaalArt) : null;
}
export function laesNoegle(v: unknown): MaalNoegle | null {
  return typeof v === "string" && (MAAL_NOEGLER as readonly string[]).includes(v) ? (v as MaalNoegle) : null;
}

/** Hvor mange målte måneder årstakten og dækningsgraden kræver — samme vindue som Score (VINDUE_MAANEDER = 3). */
export const TAL_MAANEDER = VINDUE_MAANEDER;
/** Gennemsnitlig månedslængde i dage (365,25 / 12) — til «kræver X pr. måned». */
export const DAGE_PR_MAANED = 365.25 / 12;
/** Sporets tærskler (andel af vejen): foran ≥ forventet + 0,15; på sporet ≥ forventet − 0,10; ellers bagud. */
export const FORAN_MARGIN = 0.15;
export const BAGUD_MARGIN = 0.1;
/** Guidens foreslåede frist: 12 måneder frem (designpapiret §2: 3–12 mdr.). */
export const FORESLAAET_FRIST_MAANEDER = 12;
/** Tidslinjens længde og kvartalsmarkørernes afstand. */
export const TIDSLINJE_MAANEDER = 12;
export const KVARTAL_MAANEDER = 3;
/** Fristen højst så langt frem (rådets fund 15, 1/10 aften): 36 måneder fra dansk i dag. */
export const MAKS_FRIST_MAANEDER = 36;
/** Dækningsgradens gyldige måltal (procent). */
export const DB_GRAD_MIN = 0;
export const DB_GRAD_MAKS = 100;

// ── Ordene ét sted ─────────────────────────────────────────────────────────

export type SporStatus = "foran" | "paa_sporet" | "bagud" | "naaet_i_tal" | "kan_ikke_afgoeres";
export type SporGrund =
  | "gammelt_maal"
  | "begivenhed"
  | "intet_tal"
  | "intet_udgangspunkt"
  | "intet_maaltal"
  | "ingen_frist"
  | "udgangspunkt_er_maal"
  | "frist_foer_start";

export const MAAL_ORD = {
  noegle: {
    omsaetning_aarstakt: "Omsætning (årstakt)",
    resultat_aarstakt: "Resultat før skat (årstakt)",
    likviditet_mdr: "Likviditet (måneders drift i banken)",
    db_grad: "Dækningsgrad",
    andet_tal: "Et andet tal",
  } satisfies Record<MaalNoegle, string>,
  art: { tal: "Et tal", begivenhed: "En begivenhed" } satisfies Record<MaalArt, string>,
  status: {
    foran: "Foran",
    paa_sporet: "På sporet",
    bagud: "Bagud",
    naaet_i_tal: "Måltallet er nået",
    kan_ikke_afgoeres: "Kan ikke afgøres endnu",
  } satisfies Record<SporStatus, string>,
  grund: {
    gammelt_maal: "Målet har intet tal og ingen art endnu.",
    begivenhed: "Et begivenhedsmål følges på skridtene.",
    intet_tal: "Tallet kan ikke læses endnu.",
    intet_udgangspunkt: "Målet har intet udgangspunkt.",
    intet_maaltal: "Målet har intet måltal.",
    ingen_frist: "Målet har ingen frist.",
    udgangspunkt_er_maal: "Udgangspunktet er det samme som måltallet.",
    frist_foer_start: "Fristen ligger før udgangspunktets dato.",
  } satisfies Record<SporGrund, string>,
  goerSkarpt: "Gør målet skarpt",
  godkendt: "godkendt",
  ingenFrist: "Ingen frist",
  forFaaMaaneder: (har: number) => `For få godkendte måneder — tallet kræver ${TAL_MAANEDER}, der er ${har}.`,
  forGammelt: (key: string) => `Det seneste tal er fra ${maanedTekst(key)} — ældre end ${FRISKHED_MAANEDER} måneder. Godkend de seneste måneder.`,
  ingenOmsaetning: "Omsætningen i perioden er nul eller negativ — dækningsgraden kan ikke regnes.",
  ikkeSammenhaengende: "De seneste tre måneder hænger ikke sammen — tallet kræver tre godkendte måneder i træk.",
  tastTallet: "Tast tallet — det læses ikke af regnskabet.",
  maaltalNaaetSpoergsmaal: "Måltallet er nået. Overvej at markere målet som nået.",
  /** «foreslået af …» under det næste skridt — læst af company_actions.source_type (en observation, dømt mod ordforrådet). */
  skridtKilde: {
    medlem: "jer selv",
    raadgiver: "din rådgiver",
    ai: "AI",
  } satisfies Record<SkridtKilde, string>,
  /** Guidens trin 1: begivenhedskortet. */
  begivenhedKort: { titel: "Noget der skal ske", tekst: "Fx «ansat den første» eller «ny butik åbnet» — fremdriften er skridtene." },
  /** Guidens titelforslag (foreslaaTitel) — kan rettes af medlemmet. */
  titelForslag: {
    omsaetning_aarstakt: (maaltal: string) => `Omsætning på ${maaltal} i årstakt`,
    resultat_aarstakt: (maaltal: string) => `Resultat før skat på ${maaltal} i årstakt`,
    likviditet_mdr: (maaltal: string) => `${maaltal} drift i banken`,
    db_grad: (maaltal: string) => `Dækningsgrad på ${maaltal}`,
    andet_tal: (maaltal: string) => `${maaltal}`,
  } satisfies Record<MaalNoegle, (maaltal: string) => string>,
} as const;

// ── Skridtets kilde ────────────────────────────────────────────────────────

/** Hvem foreslog skridtet — tre ord i fladen («foreslået af jer selv / din rådgiver / AI»). */
export type SkridtKilde = "medlem" | "raadgiver" | "ai";

/**
 * company_actions.source_type → kilde. Ordforrådet er det, functions skriver
 * (målt i supabase/functions 1/10-2026): 'manual' = medlemmets eget
 * (skridt-tilfoej; planen.MEDLEMMETS_EGET_KILDE), 'advisor' = foreslaa-opgave
 * som rådgiver, 'ai_weekly' · 'agent' · 'reflection' · 'deterministic_template'
 * · 'ai_extraction' = maskinen. Et ukendt eller manglende ord giver null —
 * fladen skriver så intet «foreslået af».
 */
export function skridtKilde(sourceType: unknown): SkridtKilde | null {
  if (typeof sourceType !== "string") return null;
  if (sourceType === "manual") return "medlem";
  if (sourceType === "advisor") return "raadgiver";
  if (["ai_weekly", "agent", "reflection", "deterministic_template", "ai_extraction"].includes(sourceType)) return "ai";
  return null;
}

// ── Tal-dommen ─────────────────────────────────────────────────────────────

export type Enhed = "kr" | "mdr" | "pct" | "egen";

export type TalDom =
  | {
      status: "ok";
      vaerdi: number;
      /** Seneste målte måned bag tallet («YYYY-MM»); null for andet_tal (tastet). */
      prMaaned: string | null;
      /** Antal måneder bag tallet (0 = tastet). */
      grundlag: number;
      /** Regnestykket i ord. */
      forklaring: string;
      enhed: Enhed;
    }
  | { status: "mangler"; grund: string };

const tal = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** «2026-08» → «august 2026». */
export function maanedTekst(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${MAANEDSNAVNE[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * Perioden i ord for SAMMENHÆNGENDE måneder (nuvaerendeTal kræver dem):
 * «juli – september 2026»; over et årsskifte «november 2025 – januar 2026».
 */
export function periodeTekst(keys: readonly string[]): string {
  if (keys.length === 0) return "";
  if (keys.length === 1) return maanedTekst(keys[0]);
  const foerste = keys[0];
  const sidste = keys[keys.length - 1];
  if (foerste.slice(0, 4) === sidste.slice(0, 4)) {
    const navn = MAANEDSNAVNE[Number(foerste.slice(5, 7)) - 1] ?? foerste.slice(5, 7);
    return `${navn} – ${maanedTekst(sidste)}`;
  }
  return `${maanedTekst(foerste)} – ${maanedTekst(sidste)}`;
}

/** Hænger nøglerne sammen som kalendermåneder (hver er måneden efter den forrige)? Samme mønster som Score's vækst. */
export function erSammenhaengende(keys: readonly string[]): boolean {
  for (let i = 1; i < keys.length; i++) if (naesteMaaned(keys[i - 1]) !== keys[i]) return false;
  return true;
}

export function enhedFor(noegle: MaalNoegle): Enhed {
  return noegle === "likviditet_mdr" ? "mdr" : noegle === "db_grad" ? "pct" : noegle === "andet_tal" ? "egen" : "kr";
}

/**
 * Det nuværende tal for en nøgle — læst af de målte, afsluttede måneder
 * (Score's maalteAfsluttede: data_basis 'measured', måneden afsluttet i dansk
 * tid; estimater er ikke måneder). Regnestykkerne:
 *
 *   omsaetning_aarstakt = (Σ revenue over de seneste 3 målte måneder med omsætning ÷ 3) × 12
 *   resultat_aarstakt   = (Σ resultat over de seneste 3 målte måneder med resultat ÷ 3) × 12,
 *                         resultat = ebt, ellers ebtRegnet(gross_profit, …) (Score's resultatAf)
 *   likviditet_mdr      = Score's likviditetssøjle: bank ÷ gennemsnitligt kontantforbrug
 *                         (vareforbrug + drift + finans over ≤ 3 måneder; aldrig afskrivninger)
 *   db_grad             = 100 × Σ gross_profit ÷ Σ revenue over de seneste 3 målte måneder med
 *                         begge tal — husets definition (financialUtils.calcDbMargin:
 *                         dækningsbidrag ÷ omsætning; CANONICAL.daekningsbidrag/omsaetning),
 *                         vægtet som Score's indtjening (Σ/Σ, ikke gennemsnit af procenter)
 *   andet_tal           = rækkens eget current_value (tastet)
 *
 * Under 3 målte måneder: «mangler» med grunden «for få godkendte måneder»
 * (likviditeten følger Score og kræver kun én måned med omkostninger).
 * SAMMENHÆNG (rådets fund 2, 1/10 aften): årstakten og dækningsgraden kræver,
 * at de tre seneste måneder med tallet er TRE SAMMENHÆNGENDE kalendermåneder
 * (Score's vækst-mønster, naesteMaaned) — ellers «mangler» med grunden «de
 * seneste tre måneder hænger ikke sammen». Eks.: juni, juli, september (august
 * mangler) gav før «gennemsnittet af juni – september × 12», som lod tre
 * måneder ligne et kvartal; januar 2025 + august + september 2026 ligeså.
 * Friskhed: den seneste måned bag tallet skal være ≥ aeldsteFriskeMaaned(nu)
 * (Score's regel, 6 måneder op til seneste passerede frist) — ellers «mangler».
 */
export function nuvaerendeTal(noegle: MaalNoegle, maaneder: readonly ScoreMaaned[], nu: Date, tastet: number | null = null): TalDom {
  if (noegle === "andet_tal") {
    const v = tal(tastet);
    if (v === null) return { status: "mangler", grund: MAAL_ORD.tastTallet };
    return { status: "ok", vaerdi: v, prMaaned: null, grundlag: 0, forklaring: "Tastet af jer.", enhed: "egen" };
  }

  if (noegle === "likviditet_mdr") {
    const dom = likviditet({ maaneder, kontraktStart: null, harBudgetForAaret: false, harMaal: false }, nu);
    if (dom.status !== "ok") return { status: "mangler", grund: dom.grund };
    const d = dom.detaljer;
    return {
      status: "ok",
      vaerdi: d.runwayMaaneder,
      prMaaned: d.bankKey,
      grundlag: d.omkostningsMaaneder,
      forklaring: `Banken i ${maanedTekst(d.bankKey)} delt med det gennemsnitlige kontantforbrug over ${d.omkostningsMaaneder} ${d.omkostningsMaaneder === 1 ? "måned" : "måneder"}.`,
      enhed: "mdr",
    };
  }

  const alle = maalteAfsluttede(maaneder, nu);

  if (noegle === "db_grad") {
    const rows = alle
      .map((m) => ({ key: m.key, oms: tal(m.metrics[CANONICAL.omsaetning]), db: tal(m.metrics[CANONICAL.daekningsbidrag]) }))
      .filter((r): r is { key: string; oms: number; db: number } => r.oms !== null && r.db !== null)
      .slice(-TAL_MAANEDER);
    if (rows.length < TAL_MAANEDER) return { status: "mangler", grund: MAAL_ORD.forFaaMaaneder(rows.length) };
    const seneste = rows[rows.length - 1].key;
    if (seneste < aeldsteFriskeMaaned(nu)) return { status: "mangler", grund: MAAL_ORD.forGammelt(seneste) };
    if (!erSammenhaengende(rows.map((r) => r.key))) return { status: "mangler", grund: MAAL_ORD.ikkeSammenhaengende };
    const oms = rows.reduce((s, r) => s + r.oms, 0);
    const db = rows.reduce((s, r) => s + r.db, 0);
    if (oms <= 0) return { status: "mangler", grund: MAAL_ORD.ingenOmsaetning };
    const keys = rows.map((r) => r.key);
    return {
      status: "ok",
      vaerdi: (100 * db) / oms,
      prMaaned: seneste,
      grundlag: rows.length,
      forklaring: `Dækningsbidraget delt med omsætningen for ${periodeTekst(keys)}.`,
      enhed: "pct",
    };
  }

  // Årstakterne: omsætning eller resultat.
  const vaerdiAf = (m: ScoreMaaned): number | null => (noegle === "omsaetning_aarstakt" ? tal(m.metrics[CANONICAL.omsaetning]) : resultatAf(m));
  const rows = alle
    .map((m) => ({ key: m.key, v: vaerdiAf(m) }))
    .filter((r): r is { key: string; v: number } => r.v !== null)
    .slice(-TAL_MAANEDER);
  if (rows.length < TAL_MAANEDER) return { status: "mangler", grund: MAAL_ORD.forFaaMaaneder(rows.length) };
  const seneste = rows[rows.length - 1].key;
  if (seneste < aeldsteFriskeMaaned(nu)) return { status: "mangler", grund: MAAL_ORD.forGammelt(seneste) };
  if (!erSammenhaengende(rows.map((r) => r.key))) return { status: "mangler", grund: MAAL_ORD.ikkeSammenhaengende };
  const sum = rows.reduce((s, r) => s + r.v, 0);
  const keys = rows.map((r) => r.key);
  return {
    status: "ok",
    vaerdi: (sum / rows.length) * 12,
    prMaaned: seneste,
    grundlag: rows.length,
    forklaring: `Gennemsnittet af ${periodeTekst(keys)} gange 12.`,
    enhed: "kr",
  };
}

// ── Tal i ord ──────────────────────────────────────────────────────────────

const DA = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("da-DK", opts);

/** «1,58 mio. kr.» · «620.000 kr.» · «4,2 mdr.» · «42 %» · «12 kunder». */
export function vaerdiTekst(v: number, enhed: Enhed, egenEnhed: string | null = null): string {
  if (enhed === "kr") {
    if (Math.abs(v) >= 1_000_000) return `${DA({ maximumSignificantDigits: 3 }).format(v / 1_000_000)} mio. kr.`;
    return `${DA({ maximumFractionDigits: 0 }).format(Math.round(v / 1000) * 1000)} kr.`;
  }
  if (enhed === "mdr") return `${DA({ maximumFractionDigits: 1 }).format(v)} mdr.`;
  if (enhed === "pct") return `${DA({ maximumFractionDigits: 1 }).format(v)} %`;
  const n = DA({ maximumFractionDigits: 2 }).format(v);
  return egenEnhed && egenEnhed.trim() ? `${n} ${egenEnhed.trim()}` : n;
}

/** «pr. august (godkendt)» — året med, når måneden ikke er fra samme år som `nu` (dansk tid). */
export function prTekst(prMaaned: string | null, nu: Date): string | null {
  if (!prMaaned || !/^\d{4}-\d{2}$/.test(prMaaned)) return null;
  const aarNu = kbhDato(nu).slice(0, 4);
  const navn = MAANEDSNAVNE[Number(prMaaned.slice(5, 7)) - 1];
  const md = prMaaned.slice(0, 4) === aarNu ? navn : `${navn} ${prMaaned.slice(0, 4)}`;
  return `pr. ${md} (${MAAL_ORD.godkendt})`;
}

// ── Datoer ─────────────────────────────────────────────────────────────────

const ISO_DATO = /^(\d{4})-(\d{2})-(\d{2})/;

/** «YYYY-MM-DD…» → «YYYY-MM-DD», ellers null. */
function datoAf(v: string | null | undefined): string | null {
  const m = typeof v === "string" ? ISO_DATO.exec(v.trim()) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Hele kalenderdage fra a til b (b − a); begge «YYYY-MM-DD». Ren kalender, ingen zone. */
export function dageMellem(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Sidste kalenderdag i en måned: «2026-08» → «2026-08-31»; «2028-02» → «2028-02-29». Ugyldig nøgle → null. */
export function sidsteDagIMaaned(key: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const aar = Number(m[1]);
  const md = Number(m[2]);
  if (md < 1 || md > 12) return null;
  // Date.UTC(år, md, 0) = dag 0 i måneden EFTER = sidste dag i måneden (md er 1-baseret her, 0-baseret i Date.UTC).
  const dag = new Date(Date.UTC(aar, md, 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${String(dag).padStart(2, "0")}`;
}

/**
 * Datoen BAG tallet (rådets fund 1, 1/10 aften): et læst tal står for sin
 * seneste måned — sidste dag i prMaaned (dansk kalenderdato). Et tastet tal
 * (andet_tal, prMaaned null) står for i dag.
 */
export function talDato(talDom: TalDom | null, nu: Date): string {
  if (talDom?.status === "ok" && talDom.prMaaned) {
    const d = sidsteDagIMaaned(talDom.prMaaned);
    if (d) return d;
  }
  return kbhDato(nu);
}

/** Sporets startdato: udgangspunkt_dato, ellers created_at som DANSK dato (et stempel 22:30Z den 30/9 er 1/10 i Danmark om sommeren). */
export function startDato(m: Pick<MaalMedTal, "udgangspunkt_dato" | "created_at">): string | null {
  const u = datoAf(m.udgangspunkt_dato);
  if (u) return u;
  if (!m.created_at) return null;
  const t = new Date(m.created_at);
  return Number.isNaN(t.getTime()) ? null : kbhDato(t);
}

/**
 * Fristen i ord set fra dansk «i dag»:
 *   ingen frist → «Ingen frist»; frist i dag → «i dag»; i morgen → «i morgen»;
 *   passeret → «overskredet for N dage siden» (1: «i går»);
 *   ≥ 2 hele kalendermåneder (laegMaanederTilDato(i dag, n) ≤ frist) → «om n mdr.»;
 *   ≥ 14 dage → «om ⌊dage/7⌋ uger»; ellers «om N dage».
 */
export function fristTekst(deadline: string | null | undefined, nu: Date): string {
  const frist = datoAf(deadline);
  if (!frist) return MAAL_ORD.ingenFrist;
  const idag = kbhDato(nu);
  const dage = dageMellem(idag, frist);
  if (dage === 0) return "i dag";
  if (dage === 1) return "i morgen";
  if (dage === -1) return "overskredet i går";
  if (dage < 0) return `overskredet for ${-dage} dage siden`;
  let mdr = 0;
  while (laegMaanederTilDato(idag, mdr + 1) <= frist) mdr++;
  if (mdr >= 2) return `om ${mdr} mdr.`;
  if (dage >= 14) return `om ${Math.floor(dage / 7)} uger`;
  return `om ${dage} dage`;
}

// ── Sporet ─────────────────────────────────────────────────────────────────

/** Det af milestones-rækken motoren læser (nye kolonner fra 20261001190000). */
export interface MaalMedTal {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  created_at: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  art: string | null;
  maal_noegle: string | null;
  udgangspunkt: number | null;
  udgangspunkt_dato: string | null;
  /** Skive 3 (migration 20261002100000): bekræftelsen. undefined = kolonnen ikke læst (fail-soft, tæller som i dag); null = ubekræftet. */
  bekraeftet_at?: string | null;
  /** milestones.source — hvem skrev målet (maalBekraeft.maalKilde). Valgfri. */
  source?: string | null;
}

export interface SporDom {
  status: SporStatus;
  /** Kun ved kan_ikke_afgoeres. */
  grund: SporGrund | null;
  /** (tal − udgangspunkt) ÷ (mål − udgangspunkt) — RÅ (kan være < 0 eller > 1); null uden tal. */
  andelAfVejen: number | null;
  /** (tallets dato − start) ÷ (frist − start) i dage, klippet til 0–1; null uden start/frist. */
  forventetAndel: number | null;
  /** Datoen forventetAndel er regnet på: sidste dag i tallets måned (læst tal), ellers i dag (tastet/intet tal). */
  forventetPr: string;
  /** Kalenderdage til fristen (negativ = overskredet); null uden frist. */
  dageTilbage: number | null;
  /** (mål − tal) ÷ resterende måneder; null uden tal/mål/frist, når fristen er nået, eller når måltallet er nået. */
  kraeverPrMaaned: number | null;
  /** Målet er at SÆNKE tallet (måltal < udgangspunkt); null uden begge. */
  saenk: boolean | null;
}

/**
 * Sporet for ét mål. Regnestykket (dage er danske kalenderdage):
 *   start          = udgangspunkt_dato ?? dansk dato af created_at;  slut = deadline
 *   taltDato       = sidste dag i tallets måned (prMaaned) for et LÆST tal; i dag for
 *                    et tastet tal (andet_tal) og uden tal (talDato)
 *   forventetAndel = clamp((taltDato − start) ÷ (slut − start), 0, 1)
 *   HVORFOR (rådets fund 1, 1/10 aften): tallet og forventningen skal gælde SAMME
 *   dag. Et læst tal er «pr. august» — at holde det op mod hvor langt vi burde være
 *   I DAG, straffer et mål for, at september ikke er godkendt endnu.
 *   Eksempel: mål oprettet 1/10-2026 (udgangspunkt = årstakten pr. august, 1,2 mio.),
 *   frist 1/1-2027 (92 dage), i dag 31/10, tallet stadig pr. august (september
 *   godkendes først ~20/11):
 *     med i dag:     forventet = (31/10 − 1/10) ÷ 92 = 30/92 ≈ 0,33; andel 0 → BAGUD (forkert)
 *     med taltDato:  forventet = clamp((31/8 − 1/10) ÷ 92) = clamp(−31/92) = 0; andel 0 → PÅ SPORET
 *   andelAfVejen   = (tal − udgangspunkt) ÷ (måltal − udgangspunkt)
 *                    — samme formel for et mål, der SÆNKER et tal: tæller og nævner
 *                    er begge negative, når tallet bevæger sig rigtigt (fra 60 mod 30:
 *                    tal 45 → (45−60)/(30−60) = 0,5).
 *   status:
 *     kan_ikke_afgoeres  uden tal, uden udgangspunkt, uden måltal, uden frist,
 *                        når udgangspunkt = måltal, eller slut ≤ start
 *     naaet_i_tal        andelAfVejen ≥ 1 (tallet har nået måltallet i målets retning)
 *     foran              andelAfVejen ≥ forventetAndel + 0,15
 *     paa_sporet         andelAfVejen ≥ forventetAndel − 0,10
 *     bagud              ellers
 *   kraeverPrMaaned = (måltal − tal) ÷ (dageTilbage ÷ 30,4375) — null når dageTilbage ≤ 0.
 * «Nået» er ALDRIG dette; naaet_i_tal er et signal til mennesket.
 */
export function sporet(maal: MaalMedTal, talDom: TalDom | null, nu: Date): SporDom {
  const idag = kbhDato(nu);
  const frist = datoAf(maal.deadline);
  const start = startDato(maal);
  const maaltal = tal(maal.target_value);
  const udg = tal(maal.udgangspunkt);
  const v = talDom?.status === "ok" ? talDom.vaerdi : null;
  const dageTilbage = frist ? dageMellem(idag, frist) : null;

  const forventetPr = talDato(talDom, nu);
  let forventetAndel: number | null = null;
  if (frist && start) {
    const laengde = dageMellem(start, frist);
    if (laengde > 0) forventetAndel = Math.min(1, Math.max(0, dageMellem(start, forventetPr) / laengde));
  }

  const saenk = maaltal !== null && udg !== null && maaltal !== udg ? maaltal < udg : null;
  const andelAfVejen = v !== null && maaltal !== null && udg !== null && maaltal !== udg ? (v - udg) / (maaltal - udg) : null;

  const naaet = andelAfVejen !== null && andelAfVejen >= 1;
  const kraeverPrMaaned =
    v !== null && maaltal !== null && dageTilbage !== null && dageTilbage > 0 && !naaet ? (maaltal - v) / (dageTilbage / DAGE_PR_MAANED) : null;

  const ud = (status: SporStatus, grund: SporGrund | null): SporDom => ({ status, grund, andelAfVejen, forventetAndel, forventetPr, dageTilbage, kraeverPrMaaned, saenk });

  const art = laesArt(maal.art);
  if (art === null) return ud("kan_ikke_afgoeres", "gammelt_maal");
  if (art === "begivenhed") return ud("kan_ikke_afgoeres", "begivenhed");
  if (v === null) return ud("kan_ikke_afgoeres", "intet_tal");
  if (udg === null) return ud("kan_ikke_afgoeres", "intet_udgangspunkt");
  if (maaltal === null) return ud("kan_ikke_afgoeres", "intet_maaltal");
  if (!frist) return ud("kan_ikke_afgoeres", "ingen_frist");
  if (udg === maaltal) return ud("kan_ikke_afgoeres", "udgangspunkt_er_maal");
  if (forventetAndel === null || andelAfVejen === null) return ud("kan_ikke_afgoeres", "frist_foer_start");
  if (naaet) return ud("naaet_i_tal", null);
  if (andelAfVejen >= forventetAndel + FORAN_MARGIN) return ud("foran", null);
  if (andelAfVejen >= forventetAndel - BAGUD_MARGIN) return ud("paa_sporet", null);
  return ud("bagud", null);
}

// ── Næste skridt ───────────────────────────────────────────────────────────

/** Det af company_actions-rækken motoren læser. */
export interface SkridtTilMaal {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  maal_id: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  /** Forslagets udløb (company_actions.expires_at) — et udløbet forslag er ikke et næste skridt. */
  expires_at?: string | null;
  /** company_actions.source_type — hvem foreslog skridtet (skridtKilde). Valgfri: ældre kaldere læser den ikke. */
  source_type?: string | null;
}

export interface NaesteSkridtDom {
  /** Det ene skridt fladen viser — null uden åbne skridt. */
  skridt: {
    id: string;
    titel: string;
    /** 'active' kan markeres «Gjort»; 'proposed' venter på medlemmets svar. */
    status: "active" | "proposed";
    frist: string | null;
    /** Aktivt skridt med frist før i dag (dansk dato). */
    forfalden: boolean;
    /** «foreslået af …» i ord (MAAL_ORD.skridtKilde); null når kilden er ukendt. */
    foreslaaetAf: string | null;
  } | null;
  /** Åbne skridt (aktive + ventende) ud over det viste. */
  oevrigeAabne: number;
  gjorte: number;
}

/**
 * Det ene skridt under et mål (designet: ÉT næste skridt pr. mål med «Gjort»):
 *   1. det aktive skridt med den nærmeste frist (også en forfalden — den er nærmest);
 *      lige frister: ældste created_at; aktive uden frist (CHECK'en forbyder dem,
 *      men data er en observation) efter dem med frist;
 *   2. ellers det NYESTE ventende forslag (højeste created_at; uden stempel: det
 *      seneste i listen);
 *   3. ellers null.
 * Grupperne er planen.ts' (grupperSkridt: proposed → venter, active → aktive,
 * done → gjorte) — samme statusregler som «Din plan» og Planen.
 * UDLØBNE FORSLAG (rådets fund 6): et forslag med expires_at før `nu` er ikke
 * åbent — samme dom som forsiden (forsidePlan.erUdloebetForslag), sorteret fra
 * FØR grupperingen, så det hverken vises eller tæller i oevrigeAabne.
 */
export function naesteSkridt(maalId: string, skridt: readonly SkridtTilMaal[], nu: Date): NaesteSkridtDom {
  const egne = skridt.filter((s) => s.maal_id === maalId && !erUdloebetForslag({ status: s.status, expires_at: s.expires_at ?? null }, nu));
  const g = grupperSkridt(egne);
  const idag = kbhDato(nu);
  const stempel = (s: SkridtTilMaal) => s.created_at ?? "";

  const aktive = g.aktive
    .map((s, i) => ({ s: s as SkridtTilMaal, i }))
    .sort((a, b) => {
      const fa = datoAf(a.s.due_date);
      const fb = datoAf(b.s.due_date);
      if (fa !== fb) {
        if (fa === null) return 1;
        if (fb === null) return -1;
        return fa < fb ? -1 : 1;
      }
      const ca = stempel(a.s);
      const cb = stempel(b.s);
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.i - b.i;
    });
  const venter = g.venter
    .map((s, i) => ({ s: s as SkridtTilMaal, i }))
    .sort((a, b) => {
      const ca = stempel(a.s);
      const cb = stempel(b.s);
      if (ca !== cb) return ca > cb ? -1 : 1;
      return b.i - a.i;
    });

  const aabne = aktive.length + venter.length;
  const gjorte = g.gjorte.length;
  const valgt = aktive[0]?.s ?? venter[0]?.s ?? null;
  if (!valgt) return { skridt: null, oevrigeAabne: 0, gjorte };
  const frist = datoAf(valgt.due_date);
  const status = valgt.status === "active" ? "active" : "proposed";
  const kilde = skridtKilde(valgt.source_type);
  return {
    skridt: {
      id: valgt.id,
      titel: valgt.title,
      status,
      frist,
      forfalden: status === "active" && frist !== null && frist < idag,
      foreslaaetAf: kilde ? MAAL_ORD.skridtKilde[kilde] : null,
    },
    oevrigeAabne: aabne - 1,
    gjorte,
  };
}

// ── Kortet ─────────────────────────────────────────────────────────────────

export interface MaalKort {
  id: string;
  titel: string;
  /** milestones.status (active · parked · completed). */
  status: string;
  art: MaalArt | null;
  noegle: MaalNoegle | null;
  /** Mål fra før designet (art = null): kortets ENESTE handling er «Gør målet skarpt». */
  goerSkarpt: boolean;
  /** Tal-målets tal; null for begivenhedsmål og gamle mål. */
  tal: TalDom | null;
  /** Det store tal i ord: «1,58 mio. kr.»; null uden tal. */
  talTekst: string | null;
  /** «pr. august (godkendt)»; null for tastede tal og uden tal. */
  prTekst: string | null;
  maaltalTekst: string | null;
  udgangspunktTekst: string | null;
  sporet: SporDom;
  /** Statusordet («På sporet» …) — fra MAAL_ORD, aldrig tastet. */
  statusOrd: string;
  /** Grunden i ord, når status er kan_ikke_afgoeres; ellers null. */
  grundTekst: string | null;
  frist: string | null;
  /** «om 6 mdr.» · «i morgen» · «overskredet for 3 dage siden» · «Ingen frist». */
  fristTekst: string;
  /** «20. nov. 2026»; null uden frist. */
  fristDato: string | null;
  naeste: NaesteSkridtDom;
}

function enhedForMaal(art: MaalArt | null, noegle: MaalNoegle | null): Enhed {
  if (art !== "tal") return "egen";
  return enhedFor(noegle ?? "andet_tal");
}

/**
 * Alt ét kort skal tegne. Et tal-mål uden nøgle læses som andet_tal (tastet) —
 * CHECK'en tillader NULL, og et tal uden kilde er et tastet tal.
 */
export function maalKort(maal: MaalMedTal, skridt: readonly SkridtTilMaal[], maaneder: readonly ScoreMaaned[] | null, nu: Date): MaalKort {
  const art = laesArt(maal.art);
  const noegle = art === "tal" ? (laesNoegle(maal.maal_noegle) ?? "andet_tal") : null;
  let talDom: TalDom | null = null;
  if (art === "tal" && noegle) {
    talDom =
      noegle !== "andet_tal" && maaneder === null
        ? { status: "mangler", grund: MAAL_ORD.grund.intet_tal }
        : nuvaerendeTal(noegle, maaneder ?? [], nu, tal(maal.current_value));
  }
  const enhed = enhedForMaal(art, noegle);
  const s = sporet(maal, talDom, nu);
  const maaltal = tal(maal.target_value);
  const udg = tal(maal.udgangspunkt);
  const frist = datoAf(maal.deadline);
  return {
    id: maal.id,
    titel: maal.title,
    status: maal.status,
    art,
    noegle,
    goerSkarpt: art === null,
    tal: talDom,
    talTekst: talDom?.status === "ok" ? vaerdiTekst(talDom.vaerdi, enhed, maal.unit) : null,
    prTekst: talDom?.status === "ok" ? prTekst(talDom.prMaaned, nu) : null,
    maaltalTekst: art === "tal" && maaltal !== null ? vaerdiTekst(maaltal, enhed, maal.unit) : null,
    udgangspunktTekst: art === "tal" && udg !== null ? vaerdiTekst(udg, enhed, maal.unit) : null,
    sporet: s,
    statusOrd: MAAL_ORD.status[s.status],
    grundTekst: s.grund ? MAAL_ORD.grund[s.grund] : null,
    frist,
    fristTekst: fristTekst(frist, nu),
    fristDato: frist ? danskDato(frist) : null,
    naeste: naesteSkridt(maal.id, skridt, nu),
  };
}

// ── Guiden ─────────────────────────────────────────────────────────────────

export interface NytMaalForslag {
  noegle: MaalNoegle;
  enhed: Enhed;
  /** Udgangspunktet = det nuværende tal (mangler for andet_tal: det tastes). */
  udgangspunkt: TalDom;
  /** I dag (dansk dato) — sporet regnes herfra. */
  udgangspunktDato: string;
  /** I dag + 12 måneder (dansk dato, dagen klippet til månedens længde). */
  foreslaaetFrist: string;
  /** «Det kræver X pr. måned» for måltallet og fristen (foreslået, hvis ingen er givet); null uden måltal/udgangspunkt. */
  kraeverPrMaaned: number | null;
}

/** (måltal − fra) ÷ (dage fra i dag til fristen ÷ 30,4375); null når fristen ikke ligger efter i dag. */
export function kraeverPrMaanedFor(fra: number, maaltal: number, idag: string, frist: string): number | null {
  const dage = dageMellem(idag, frist);
  if (dage <= 0) return null;
  return (maaltal - fra) / (dage / DAGE_PR_MAANED);
}

export function nytMaalForslag(
  noegle: MaalNoegle,
  maaneder: readonly ScoreMaaned[],
  nu: Date,
  valg: { maaltal?: number | null; frist?: string | null; tastet?: number | null } = {},
): NytMaalForslag {
  const idag = kbhDato(nu);
  const udgangspunkt = nuvaerendeTal(noegle, maaneder, nu, valg.tastet ?? null);
  const foreslaaetFrist = laegMaanederTilDato(idag, FORESLAAET_FRIST_MAANEDER);
  const frist = datoAf(valg.frist) ?? foreslaaetFrist;
  const maaltal = tal(valg.maaltal);
  return {
    noegle,
    enhed: enhedFor(noegle),
    udgangspunkt,
    udgangspunktDato: idag,
    foreslaaetFrist,
    kraeverPrMaaned: udgangspunkt.status === "ok" && maaltal !== null ? kraeverPrMaanedFor(udgangspunkt.vaerdi, maaltal, idag, frist) : null,
  };
}

/**
 * Guidens titelforslag (fladen 1/10-2026: «titlen foreslås af motoren men kan
 * rettes»): én sætning af nøglen og måltallet i ord — «Omsætning på 2 mio. kr.
 * i årstakt», «4 mdr. drift i banken», «Dækningsgrad på 40 %»; andet_tal
 * «12 kunder» (måltal + enhed). Uden måltal: null (intet at foreslå). Et
 * begivenhedsmål har intet forslag — sætningen ER målet, og medlemmet skriver den.
 */
export function foreslaaTitel(noegle: MaalNoegle, maaltal: number | null | undefined, egenEnhed: string | null = null): string | null {
  const v = tal(maaltal);
  if (v === null) return null;
  const ord = vaerdiTekst(v, enhedFor(noegle), egenEnhed);
  if (noegle === "andet_tal" && !(egenEnhed ?? "").trim()) return null;
  return MAAL_ORD.titelForslag[noegle](ord);
}

/** Indholdet af et nyt mål, som guiden sender til skrivevejen (hooks/dineMaalGrundlag.ts). */
export interface NytMaalInput {
  titel: string;
  art: MaalArt;
  noegle?: MaalNoegle | null;
  maaltal?: number | null;
  udgangspunkt?: number | null;
  /** Kun for andet_tal: enheden («kunder», «ansatte»). */
  enhed?: string | null;
  frist: string;
}

export type NytMaalDom =
  | {
      ok: true;
      felter: {
        title: string;
        art: MaalArt;
        maal_noegle: MaalNoegle | null;
        target_value: number;
        udgangspunkt: number;
        udgangspunkt_dato: string;
        /** Kun andet_tal (udgangspunktet er det første tastede tal) og begivenhed (0). Husnøgler: udeladt. */
        current_value?: number;
        /** KUN andet_tal (enheden er brugerens ord). Husnøgler og begivenhed sætter den aldrig (fund 5). */
        unit?: string;
        deadline: string;
      };
    }
  | { ok: false; grund: string };

export const TITEL_MAX = 120;

/**
 * Dommen over guidens input (fail-closed; grunden er dansk og vises ordret):
 *   titel 1–120 tegn · frist en rigtig dato EFTER i dag (dansk) og højst
 *     36 måneder frem (laegMaanederTilDato(i dag, 36), inklusive — fund 15) ·
 *   tal-mål: nøgle og måltal (tal); måltal ≠ udgangspunkt;
 *     db_grad: måltal 0–100 (inklusive); likviditet_mdr: måltal ≥ 0;
 *     HUSNØGLER (alt undtagen andet_tal): udgangspunktet er det NUVÆRENDE TAL
 *       (`nuvaerende` = nuvaerendeTal for nøglen, regnet af kalderen af de
 *       godkendte måneder) — klienten kan ikke opfinde det: mangler tallet, afvises
 *       målet; et medsendt udgangspunkt, der afviger (mere end 1e-9 relativt),
 *       afvises; uden medsendt bruges tallet. Enheden gemmes ALDRIG (unit
 *       udledes af nøglen ved læsning — fund 5; et ord i unit fik gamle læsere
 *       til at vise «X af Y kr.» med forkert fremdrift);
 *     andet_tal: udgangspunktet tastes og kræver en enhed; udgangspunktet gemmes
 *       som current_value (det tastede tal starter dér);
 *   begivenhed: måltal = 1, udgangspunkt = 0 (designpapiret §2: «tal = 1,
 *     fremdriften er skridtene»), ingen nøgle (CHECK milestones_art_noegle_check).
 * udgangspunkt_dato = i dag (dansk).
 */
export type MaalFristDom = { ok: true; dato: string } | { ok: false; grund: string };

/**
 * Dommen over et måls frist alene (rådets fund 5, 1/10 aften): en rigtig dato
 * EFTER i dag (dansk) og højst MAKS_FRIST_MAANEDER frem (inklusive). ÉN dom —
 * guiden (doemNytMaal) og «Redigér» (RedigerMaalDialog) dømmer den samme, så en
 * frist kan hverken tømmes, lægges i fortiden eller mere end 36 måneder frem ad
 * nogen vej.
 */
export function doemMaalFrist(fristRaa: string | null | undefined, nu: Date): MaalFristDom {
  const frist = datoAf(fristRaa);
  const idag = kbhDato(nu);
  if (!frist || laegDageTilDato(frist, 0) !== frist) return { ok: false, grund: "Vælg en frist" };
  if (frist <= idag) return { ok: false, grund: "Fristen skal ligge efter i dag" };
  const senest = laegMaanederTilDato(idag, MAKS_FRIST_MAANEDER);
  if (frist > senest) return { ok: false, grund: `Fristen kan højst ligge ${MAKS_FRIST_MAANEDER} måneder frem (senest ${danskDato(senest)})` };
  return { ok: true, dato: frist };
}

export function doemNytMaal(input: NytMaalInput, nu: Date, nuvaerende: TalDom | null = null): NytMaalDom {
  const titel = (input.titel ?? "").trim();
  if (!titel) return { ok: false, grund: "Skriv målet som én sætning" };
  if (titel.length > TITEL_MAX) return { ok: false, grund: `Målet er for langt (højst ${TITEL_MAX} tegn)` };
  const art = laesArt(input.art);
  if (!art) return { ok: false, grund: "Vælg om målet er et tal eller en begivenhed" };
  const fristDom = doemMaalFrist(input.frist, nu);
  if (fristDom.ok === false) return fristDom;
  const frist = fristDom.dato;
  const idag = kbhDato(nu);

  if (art === "begivenhed") {
    if (input.noegle != null) return { ok: false, grund: "Et begivenhedsmål har intet tal at følge" };
    return {
      ok: true,
      felter: { title: titel, art, maal_noegle: null, target_value: 1, udgangspunkt: 0, udgangspunkt_dato: idag, current_value: 0, deadline: frist },
    };
  }
  const noegle = laesNoegle(input.noegle);
  if (!noegle) return { ok: false, grund: "Vælg hvilket tal målet handler om" };
  const maaltal = tal(input.maaltal);
  if (maaltal === null) return { ok: false, grund: "Skriv måltallet" };
  if (noegle === "db_grad" && (maaltal < DB_GRAD_MIN || maaltal > DB_GRAD_MAKS)) return { ok: false, grund: `Dækningsgraden skal ligge mellem ${DB_GRAD_MIN} og ${DB_GRAD_MAKS} %` };
  if (noegle === "likviditet_mdr" && maaltal < 0) return { ok: false, grund: "Likviditeten kan ikke være under 0 måneder" };
  // Runde 2, fund 9: en omsætning under 0 kr. findes ikke (resultatet må være negativt).
  if (noegle === "omsaetning_aarstakt" && maaltal < 0) return { ok: false, grund: "Omsætningen kan ikke være under 0 kr." };

  if (noegle === "andet_tal") {
    const udg = tal(input.udgangspunkt);
    if (udg === null) return { ok: false, grund: "Udgangspunktet mangler" };
    if (udg === maaltal) return { ok: false, grund: "Måltallet er det samme som udgangspunktet" };
    const unit = (input.enhed ?? "").trim();
    if (!unit) return { ok: false, grund: "Skriv hvad tallet tæller (fx kunder)" };
    return {
      ok: true,
      felter: { title: titel, art, maal_noegle: noegle, target_value: maaltal, udgangspunkt: udg, udgangspunkt_dato: idag, current_value: udg, unit, deadline: frist },
    };
  }

  // Husnøgle: udgangspunktet ER det nuværende tal — aldrig klientens eget.
  if (!nuvaerende || nuvaerende.status !== "ok" || nuvaerende.enhed !== enhedFor(noegle)) {
    return { ok: false, grund: nuvaerende?.status === "mangler" ? nuvaerende.grund : MAAL_ORD.grund.intet_tal };
  }
  const udg = nuvaerende.vaerdi;
  const medsendt = tal(input.udgangspunkt);
  if (input.udgangspunkt != null && (medsendt === null || Math.abs(medsendt - udg) > 1e-9 * Math.max(1, Math.abs(udg)))) {
    return { ok: false, grund: "Udgangspunktet skal være det nuværende tal — det læses af de godkendte måneder" };
  }
  if (udg === maaltal) return { ok: false, grund: "Måltallet er det samme som udgangspunktet" };
  return {
    ok: true,
    felter: { title: titel, art, maal_noegle: noegle, target_value: maaltal, udgangspunkt: udg, udgangspunkt_dato: idag, deadline: frist },
  };
}

/**
 * «Gør målet skarpt» (rådets fund 4): et mål fra før designet har ofte et
 * måltal, et nuværende tal og en enhed. De NULSTILLES ikke — guiden får dem
 * som FORSLAG: måltal = target_value; udgangspunkt = current_value (kun et
 * forslag for et tastet tal — husnøglernes udgangspunkt er altid det læste
 * tal, doemNytMaal); enhed = unit. current_value bevares i databasen
 * (goerMaalSkarpt skriver den aldrig).
 */
export interface SkarptForslag {
  maaltal: number | null;
  udgangspunkt: number | null;
  enhed: string | null;
}
export function skarptForslag(maal: Pick<MaalMedTal, "target_value" | "current_value" | "unit">): SkarptForslag {
  const enhed = typeof maal.unit === "string" && maal.unit.trim() ? maal.unit.trim() : null;
  return { maaltal: tal(maal.target_value), udgangspunkt: tal(maal.current_value), enhed };
}

/**
 * Må en GAMMEL læser (HbMaalRaekke, MilestoneDialoger, useMilestones'
 * saetNuvaerendeVaerdi) vise og skrive «X af Y enhed»? Kun for mål fra før
 * designet (art NULL) med måltal og enhed (rådets fund 5). Et tal-mål læses
 * af motoren (andelen af vejen fra udgangspunktet — ikke current ÷ target),
 * og et begivenhedsmål følges på skridtene.
 */
export function gammelTalvisning(m: { art?: string | null; target_value: number | null; unit: string | null }): boolean {
  return (m.art ?? null) === null && !!m.target_value && !!m.unit;
}

// ── Tidslinjen ─────────────────────────────────────────────────────────────

export type TidslinjeArt = "start" | "kvartal" | "skridt_gjort" | "maal_frist" | "slut";

export interface TidslinjePunkt {
  dato: string;
  art: TidslinjeArt;
  titel: string;
  maalId: string | null;
  /** Kun maal_frist: målet er markeret nået. */
  naaet?: boolean;
}

export interface TidslinjeDom {
  start: string;
  slut: string;
  /** Hvor «i dag» ligger på linjen, 0–1. */
  nuAndel: number;
  punkter: TidslinjePunkt[];
}

/**
 * Tidslinjens start. VALGT: medlemskabets start (companies.contract_start_date,
 * som Score-grundlaget allerede henter — ingen ekstra kald), rullet frem i hele
 * år, så linjen viser det INDEVÆRENDE medlemsår: 12-måneders-rytmen i
 * designpapiret §3 (intro-session = måned 0, kvartalstjek måned 3/6/9,
 * årsbrevet i måned 11–12) tæller fra medlemskabet, ikke fra et mål.
 * Uden kontraktstart: det tidligste ikke-parkerede måls start (startDato) —
 * rullet frem i hele år PÅ SAMME MÅDE (rådets fund 11: ellers viste et mål fra
 * for 14 måneder siden en linje, der sluttede før i dag); uden mål: i dag.
 *   start = anker + 12·k måneder, k = største heltal ≥ 0 med start ≤ i dag
 *   (et måls start i fremtiden → i dag; en kontraktstart i fremtiden står, som før).
 */
export function tidslinjeStart(kontraktStart: string | null, maal: readonly MaalMedTal[], nu: Date): string {
  const idag = kbhDato(nu);
  const rulFrem = (anker: string): string => {
    let s = anker;
    for (let k = 1; k < 100; k++) {
      const naeste = laegMaanederTilDato(anker, TIDSLINJE_MAANEDER * k);
      if (naeste > idag) break;
      s = naeste;
    }
    return s;
  };
  const kontrakt = datoAf(kontraktStart);
  if (kontrakt) return rulFrem(kontrakt);
  const starter = maal
    .filter((m) => m.status !== "parked")
    .map(startDato)
    .filter((d): d is string => d !== null)
    .sort();
  if (!starter[0]) return idag;
  return starter[0] > idag ? idag : rulFrem(starter[0]);
}

/**
 * Punkterne for 12 måneder fra `start` (inklusive begge ender):
 *   start · kvartalsmarkører ved +3, +6, +9 mdr. · slut (+12) ·
 *   gjorte skridt (closed_at som dansk dato) — kun skridt under et af målene ·
 *   målenes frister (ikke parkerede, ikke ubekræftede — skive 3; nåede mærkes naaet).
 * Sorteret efter dato; samme dato: start/kvartal/slut før skridt før frister.
 */
export function tidslinje(maal: readonly MaalMedTal[], skridt: readonly SkridtTilMaal[], start: string, nu: Date): TidslinjeDom {
  const s = datoAf(start) ?? kbhDato(nu);
  const slut = laegMaanederTilDato(s, TIDSLINJE_MAANEDER);
  const inden = (d: string) => d >= s && d <= slut;
  const punkter: TidslinjePunkt[] = [{ dato: s, art: "start", titel: "Start", maalId: null }];
  for (let i = KVARTAL_MAANEDER; i < TIDSLINJE_MAANEDER; i += KVARTAL_MAANEDER) {
    punkter.push({ dato: laegMaanederTilDato(s, i), art: "kvartal", titel: `Måned ${i}`, maalId: null });
  }
  punkter.push({ dato: slut, art: "slut", titel: "Måned 12", maalId: null });

  const maalIds = new Set(maal.map((m) => m.id));
  for (const sk of skridt) {
    if (sk.status !== "done" || !sk.maal_id || !maalIds.has(sk.maal_id) || !sk.closed_at) continue;
    const t = new Date(sk.closed_at);
    if (Number.isNaN(t.getTime())) continue;
    const d = kbhDato(t);
    if (inden(d)) punkter.push({ dato: d, art: "skridt_gjort", titel: sk.title, maalId: sk.maal_id });
  }
  for (const m of maal) {
    if (m.status === "parked") continue;
    // Skive 3 (runde 2, fund 4): et UBEKRÆFTET mål (bekraeftet_at null — kolonnen læst) står IKKE på
    // Rejsen. VALGT «vis ikke» frem for «mærk»: Rejsen er «de næste 12 måneder» for virksomhedens EGNE
    // mål — et forslag, medlemmet ikke har sagt ja til, har ingen frist, der er lovet; det tæller heller
    // ikke som kort, i Score eller i forsidens fokus, og én regel («ubekræftede tæller ikke») er lettere
    // at holde end et mærke, der kun findes ét sted. undefined (modellen slået fra) = som i dag. Samme
    // dom som maalBekraeft.erBekraeftet — inlinet, fordi maalBekraeft importerer herfra (ingen cyklus).
    if (m.bekraeftet_at === null) continue;
    const d = datoAf(m.deadline);
    if (d && inden(d)) punkter.push({ dato: d, art: "maal_frist", titel: m.title, maalId: m.id, naaet: m.status === "completed" });
  }
  const orden: Record<TidslinjeArt, number> = { start: 0, kvartal: 0, slut: 0, skridt_gjort: 1, maal_frist: 2 };
  punkter.sort((a, b) => (a.dato !== b.dato ? (a.dato < b.dato ? -1 : 1) : orden[a.art] - orden[b.art]));

  const laengde = dageMellem(s, slut);
  const nuAndel = laengde > 0 ? Math.min(1, Math.max(0, dageMellem(s, kbhDato(nu)) / laengde)) : 0;
  return { start: s, slut, nuAndel, punkter };
}
