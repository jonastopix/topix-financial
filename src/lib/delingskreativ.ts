/**
 * src/lib/delingskreativ.ts
 *
 * Delingskreativens motor — ren: ingen React, ingen supabase, ingen DOM.
 *
 * Kilden er designet i docs/delingskreativ/Boardroom Delingskreativ v2.dc.html
 * (i repoet fra #865) og opmålingen i recon-kreativ-design.md (14/9 2026).
 * Første skridt (Jonas 14/9) var ÉN kreativ — 3a «Tre på række» i mørk
 * kvadrat (v2:38-67). Samme dag, efter at siden var set virke: alle tolv
 * kombinationer (tre layouts × mørk/lys × kvadrat/liggende), hver med sine
 * egne tal fra v2 — se måltabellerne nedenfor.
 *
 * Alle mål er px, ordret fra v2 (ingen rem/vw/clamp i designet); kun
 * letter-spacing er em og linjehøjder enhedsløse — som i designets
 * font:-shorthands. Farverne er designets otte hex (tokens/colors.css:2-3);
 * ingen af dem er identisk med husets hb-tokens (recon §2), så de står som
 * egne konstanter og oversættes ikke.
 */

export type Layout = "tre_paa_raekke" | "optagelsen" | "optaget_i";
export type Udgave = "moerk" | "lys";
export type Format = "kvadrat" | "liggende";

/** Designets otte farver, ordret (tokens/colors.css:2-3). */
export const FARVER = {
  navyGreen: "#133332",
  ocean: "#A3D9C4",
  shell: "#E9E9E7",
  hvid: "#FFFFFF",
  navyGreen80: "#3E5A59",
  navyGreen60: "#6A8180",
  ocean40: "#DAF0E7",
  shellDark: "#D6D6D3",
} as const;

/** Formaternes lærred (facit-PNG'erne i docs/delingskreativ/eksport/ bekræfter målene). */
export const FORMATER: Readonly<Record<Format, { bredde: number; hoejde: number }>> = {
  kvadrat: { bredde: 1080, hoejde: 1080 },
  liggende: { bredde: 1200, hoejde: 627 },
};

/** Skriftfamilierne som designet skriver dem (v2 :40-41); huset indlæser begge i index.css:1-2. */
export const SKRIFT_FAMILIE = {
  parkinsans: "'Parkinsans', system-ui, sans-serif",
  manrope: "'Manrope', system-ui, sans-serif",
} as const;

export interface Skrift {
  familie: keyof typeof SKRIFT_FAMILIE;
  vaegt: 400 | 500 | 600 | 700;
  /** px */
  stoerrelse: number;
  /** enhedsløs, som designets «/1», «/1.1», «/1.3» */
  linjehoejde: number;
  /** em; udeladt = designet sætter ingen */
  spatiering?: number;
  versaler?: boolean;
  farve: string;
  nowrap?: boolean;
}

/** Inline-stil for en Skrift — feltnavne som React.CSSProperties, uden at importere React. */
export interface SkriftStil {
  fontFamily: string;
  fontWeight: number;
  fontSize: string;
  lineHeight: number;
  color: string;
  letterSpacing?: string;
  textTransform?: "uppercase";
  whiteSpace?: "nowrap";
}

export function skriftStil(s: Skrift): SkriftStil {
  const stil: SkriftStil = {
    fontFamily: SKRIFT_FAMILIE[s.familie],
    fontWeight: s.vaegt,
    fontSize: `${s.stoerrelse}px`,
    lineHeight: s.linjehoejde,
    color: s.farve,
  };
  if (s.spatiering !== undefined) stil.letterSpacing = `${s.spatiering}em`;
  if (s.versaler) stil.textTransform = "uppercase";
  if (s.nowrap) stil.whiteSpace = "nowrap";
  return stil;
}

// ── Måltabellerne — tolv kombinationer, hver med sine egne tal ─────────────
//
// Tre layouts (3a «Tre på række» v2:32-158, 3b «Optagelsen» v2:161-246, 3c
// «Optaget i» v2:250-341) × mørk/lys × kvadrat/liggende. Tallene er ordret
// fra v2 og recon-kreativ-design.md §1; designet skalerer IKKE proportionalt
// mellem kvadrat og liggende, så hver kombination står med sine egne tal —
// ingen er regnet ud af en anden. Farverne er FARVER-konstanterne (§2):
// mørk udgave tegner på navyGreen, lys udgave på shell.

export type Kombination = `${Udgave}-${Format}`;
export const kombination = (udgave: Udgave, format: Format): Kombination => `${udgave}-${format}`;

/** Alle tolv, i designets rækkefølge (layout, så mørk før lys, kvadrat før liggende). */
export const ALLE_KOMBINATIONER: ReadonlyArray<{ layout: Layout; udgave: Udgave; format: Format }> = (
  ["tre_paa_raekke", "optagelsen", "optaget_i"] as const
).flatMap((layout) =>
  (["moerk", "lys"] as const).flatMap((udgave) => (["kvadrat", "liggende"] as const).map((format) => ({ layout, udgave, format }))),
);

/** Hvidt logokort med en contain-slot — samme form i alle tre layouts (v2:66, :177, :268). */
export interface LogokortMaal {
  bredde: number;
  hoejde: number;
  radius: number;
  padding: number;
  baggrund: string;
  kant: string;
  slot: { bredde: number; hoejde: number };
  /** Tomtilstandens currentColor på det hvide kort. */
  pladsholderFarve: string;
}

/** Ordmærket: bredde i px, højde auto (260×90-fil i public/). */
export interface OrdmaerkeMaal {
  bredde: number;
  fil: string;
}

/** Portrætcirkel med kant (3a, 3c): slot inde i ringen. */
export interface PortraetRingMaal {
  diameter: number;
  kant: number;
  farve: string;
  slot: number;
  /** Tomtilstandens currentColor i cirklen. */
  pladsholderFarve: string;
}

/** De to små, overlappende rådgiverportrætter (3b, 3c). */
export interface RaadgiverStakMaal {
  portraet: number;
  kant: number;
  kantFarve: string;
  /** Andet portræts negative margin-left. */
  overlap: number;
}

export interface TrePaaRaekkeMaal {
  layout: "tre_paa_raekke";
  canvas: { bredde: number; hoejde: number; baggrund: string };
  /** v2:39/:70 — abs left/(right)/top, column, gap. Liggende har ingen højre. */
  topblok: { venstre: number; hoejre: number | null; top: number; gap: number };
  /** «Optaget {{ dateLabel }}» */
  label: Skrift;
  /** «Optaget i<br>The Boardroom» — liggende på én linje (v2:72). */
  overskrift: Skrift;
  overskriftEnLinje: boolean;
  /** v2:43/:75 — abs left/(right)/top, align flex-start, gap */
  raekke: { venstre: number; hoejre: number | null; top: number; gap: number };
  medlem: {
    bredde: number;
    gap: number;
    ring: PortraetRingMaal;
    tekstGap: number;
    nytMedlem: Skrift;
    navn: Skrift;
    virksomhed: Skrift;
  };
  /** to ens kolonner i fuld størrelse */
  raadgiver: {
    bredde: number;
    paddingTop: number;
    gap: number;
    portraet: number;
    tekstGap: number;
    label: Skrift;
    navn: Skrift;
  };
  /** Kvadrat: logokort og ordmærke i én bundrække (v2:65). Liggende: null — de står hver for sig. */
  bundraekke: { venstre: number; hoejre: number; bund: number } | null;
  logokort: LogokortMaal;
  /** Liggende: logokortet absolut nederst til højre (v2:97). */
  logokortAbs: { hoejre: number; bund: number } | null;
  ordmaerke: OrdmaerkeMaal;
  /** Liggende: ordmærket absolut øverst til højre (v2:74). */
  ordmaerkeAbs: { hoejre: number; top: number } | null;
}

export interface OptagelsenMaal {
  layout: "optagelsen";
  canvas: { bredde: number; hoejde: number; baggrund: string };
  /** v2:168/:186 — hairline-ramme inset i px */
  ramme: { inset: number; kant: string };
  /** Kvadrat: alt i én centreret kolonne (v2:169). Liggende: portræt og tekstkolonne i én række (v2:187). */
  indhold: { retning: "kolonne"; paddingTop: number; paddingSide: number } | { retning: "raekke"; paddingSide: number; gap: number };
  /** Liggende: tekstkolonnens gap (v2:192). */
  tekstkolonneGap: number | null;
  label: Skrift;
  /** «Nyt medlem af<br>The Boardroom» */
  overskrift: Skrift;
  overskriftMargenTop: number | null;
  portraet: {
    margenTop: number | null;
    /** hvid cirkel (v2:172/:188) */
    diameter: number;
    baggrund: string;
    slot: number;
    pladsholderFarve: string;
    /** seglet «NYT MEDLEM» (v2:174/:190) */
    segl: { stoerrelse: number; hoejre: number; bund: number; baggrund: string; skrift: Skrift };
  };
  navn: Skrift;
  navnMargenTop: number | null;
  /** Liggende: navn og logokort i én række (v2:195). */
  navnRaekke: { gap: number; margenTop: number } | null;
  logokort: LogokortMaal;
  logokortMargenTop: number | null;
  /** v2:179/:201 — abs left/right/bottom, space-between; gap mellem stak og tekst */
  bund: { venstre: number; hoejre: number; bund: number; gap: number };
  raadgiverstak: RaadgiverStakMaal;
  /** Kvadrat: «Rådgivere<br>Morten Larsen & Jonas Herlev» (v2:181). Liggende: «Rådgivere: …» på én linje (v2:203). */
  raadgiverTekst: Skrift;
  raadgiverTekstToLinjer: boolean;
  ordmaerke: OrdmaerkeMaal;
}

export interface OptagetIMaal {
  layout: "optaget_i";
  canvas: { bredde: number; hoejde: number; baggrund: string };
  /** v2:257/:281 — kvadrat: left/top/right; liggende: left/top + fast bredde */
  topblok: { venstre: number; top: number; hoejre: number | null; bredde: number | null; gap: number };
  /** streg + «Optaget {{ dateLabel }}» (v2:258/:282) */
  oejenbryn: { gap: number; streg: { bredde: number; hoejde: number; farve: string }; label: Skrift };
  /** «Optaget i<br>The Boardroom» */
  overskrift: Skrift;
  /** Kvadrat: i rækkens tekstkolonne (v2:264). Liggende: i topblokken under overskriften (v2:284). */
  navneblok: { gap: number; margenTop: number | null; navn: Skrift; virksomhed: Skrift };
  /** Kvadrat: abs left/right/top, align center, gap (v2:261). Liggende: null. */
  raekke: { venstre: number; hoejre: number; top: number; gap: number } | null;
  /** Kvadrat: tekstkolonnens gap mellem navneblok og logokort (v2:263). */
  tekstkolonneGap: number | null;
  /** Liggende: ring og logokort i en kolonne øverst til højre (v2:289). */
  hoejreKolonne: { hoejre: number; top: number; gap: number } | null;
  ring: PortraetRingMaal;
  logokort: LogokortMaal;
  /** afsenderbjælken nederst (v2:271/:293) */
  bjaelke: { hoejde: number; baggrund: string; paddingSide: number; gap: number };
  raadgiverstak: RaadgiverStakMaal;
  /** Kvadrat: label «Rådgivere» + navne i to linjer (v2:274-275). Liggende: label null, én linje «Rådgivere: …» (v2:295). */
  raadgiverTekst: { gap: number; label: Skrift | null; navne: Skrift };
  ordmaerke: OrdmaerkeMaal;
}

export type KreativMaal = TrePaaRaekkeMaal | OptagelsenMaal | OptagetIMaal;

const M = "manrope" as const;
const P = "parkinsans" as const;
const HVIDT_KORT_MOERK = { baggrund: FARVER.hvid, kant: "transparent", pladsholderFarve: FARVER.navyGreen };
const HVIDT_KORT_LYS = { baggrund: FARVER.hvid, kant: FARVER.shellDark, pladsholderFarve: FARVER.navyGreen };

// ── 3a «Tre på række» (v2:32-158) ─────────────────────────────────────────

export const TRE_PAA_RAEKKE: Readonly<Record<Kombination, TrePaaRaekkeMaal>> = {
  // v2:38-67
  "moerk-kvadrat": {
    layout: "tre_paa_raekke",
    canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.navyGreen },
    topblok: { venstre: 80, hoejre: 80, top: 84, gap: 20 },
    label: { familie: M, vaegt: 700, stoerrelse: 20, linjehoejde: 1, spatiering: 0.26, versaler: true, farve: FARVER.ocean },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 98, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid },
    overskriftEnLinje: false,
    raekke: { venstre: 80, hoejre: 80, top: 376, gap: 34 },
    medlem: {
      bredde: 340,
      gap: 18,
      ring: { diameter: 340, kant: 5, farve: FARVER.ocean, slot: 310, pladsholderFarve: FARVER.ocean40 },
      tekstGap: 5,
      nytMedlem: { familie: M, vaegt: 700, stoerrelse: 15, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.ocean },
      navn: { familie: M, vaegt: 700, stoerrelse: 34, linjehoejde: 1.1, farve: FARVER.hvid, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 21, linjehoejde: 1.3, farve: FARVER.ocean40, nowrap: true },
    },
    raadgiver: {
      bredde: 270,
      paddingTop: 34,
      gap: 18,
      portraet: 270,
      tekstGap: 5,
      label: { familie: M, vaegt: 700, stoerrelse: 14, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.ocean40 },
      navn: { familie: M, vaegt: 700, stoerrelse: 28, linjehoejde: 1.1, farve: FARVER.hvid, nowrap: true },
    },
    bundraekke: { venstre: 80, hoejre: 80, bund: 72 },
    logokort: { bredde: 236, hoejde: 92, radius: 16, padding: 16, slot: { bredde: 204, hoejde: 60 }, ...HVIDT_KORT_MOERK },
    logokortAbs: null,
    ordmaerke: { bredde: 136, fil: "/topix-shell.png" },
    ordmaerkeAbs: null,
  },
  // v2:69-97
  "moerk-liggende": {
    layout: "tre_paa_raekke",
    canvas: { bredde: 1200, hoejde: 627, baggrund: FARVER.navyGreen },
    topblok: { venstre: 68, hoejre: null, top: 56, gap: 14 },
    label: { familie: M, vaegt: 700, stoerrelse: 16, linjehoejde: 1, spatiering: 0.26, versaler: true, farve: FARVER.ocean },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 62, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid, nowrap: true },
    overskriftEnLinje: true,
    raekke: { venstre: 68, hoejre: null, top: 234, gap: 30 },
    medlem: {
      bredde: 250,
      gap: 14,
      ring: { diameter: 250, kant: 4, farve: FARVER.ocean, slot: 226, pladsholderFarve: FARVER.ocean40 },
      tekstGap: 4,
      nytMedlem: { familie: M, vaegt: 700, stoerrelse: 12, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.ocean },
      navn: { familie: M, vaegt: 700, stoerrelse: 26, linjehoejde: 1.1, farve: FARVER.hvid, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 17, linjehoejde: 1.3, farve: FARVER.ocean40, nowrap: true },
    },
    raadgiver: {
      bredde: 210,
      paddingTop: 20,
      gap: 14,
      portraet: 210,
      tekstGap: 5,
      label: { familie: M, vaegt: 700, stoerrelse: 11, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.ocean40 },
      navn: { familie: M, vaegt: 700, stoerrelse: 22, linjehoejde: 1.1, farve: FARVER.hvid, nowrap: true },
    },
    bundraekke: null,
    logokort: { bredde: 206, hoejde: 84, radius: 14, padding: 14, slot: { bredde: 178, hoejde: 56 }, ...HVIDT_KORT_MOERK },
    logokortAbs: { hoejre: 68, bund: 70 },
    ordmaerke: { bredde: 118, fil: "/topix-shell.png" },
    ordmaerkeAbs: { hoejre: 68, top: 60 },
  },
  // v2:99-128
  "lys-kvadrat": {
    layout: "tre_paa_raekke",
    canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.shell },
    topblok: { venstre: 80, hoejre: 80, top: 84, gap: 20 },
    label: { familie: M, vaegt: 700, stoerrelse: 20, linjehoejde: 1, spatiering: 0.26, versaler: true, farve: FARVER.navyGreen },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 98, linjehoejde: 1, spatiering: -0.02, farve: FARVER.navyGreen },
    overskriftEnLinje: false,
    raekke: { venstre: 80, hoejre: 80, top: 376, gap: 34 },
    medlem: {
      bredde: 340,
      gap: 18,
      ring: { diameter: 340, kant: 5, farve: FARVER.navyGreen, slot: 310, pladsholderFarve: FARVER.navyGreen80 },
      tekstGap: 5,
      nytMedlem: { familie: M, vaegt: 700, stoerrelse: 15, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.navyGreen },
      navn: { familie: M, vaegt: 700, stoerrelse: 34, linjehoejde: 1.1, farve: FARVER.navyGreen, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 21, linjehoejde: 1.3, farve: FARVER.navyGreen80, nowrap: true },
    },
    raadgiver: {
      bredde: 270,
      paddingTop: 34,
      gap: 18,
      portraet: 270,
      tekstGap: 5,
      label: { familie: M, vaegt: 700, stoerrelse: 14, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.navyGreen80 },
      navn: { familie: M, vaegt: 700, stoerrelse: 28, linjehoejde: 1.1, farve: FARVER.navyGreen, nowrap: true },
    },
    bundraekke: { venstre: 80, hoejre: 80, bund: 72 },
    logokort: { bredde: 236, hoejde: 92, radius: 16, padding: 16, slot: { bredde: 204, hoejde: 60 }, ...HVIDT_KORT_LYS },
    logokortAbs: null,
    ordmaerke: { bredde: 136, fil: "/topix-navy.png" },
    ordmaerkeAbs: null,
  },
  // v2:130-158
  "lys-liggende": {
    layout: "tre_paa_raekke",
    canvas: { bredde: 1200, hoejde: 627, baggrund: FARVER.shell },
    topblok: { venstre: 68, hoejre: null, top: 56, gap: 14 },
    label: { familie: M, vaegt: 700, stoerrelse: 16, linjehoejde: 1, spatiering: 0.26, versaler: true, farve: FARVER.navyGreen },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 62, linjehoejde: 1, spatiering: -0.02, farve: FARVER.navyGreen, nowrap: true },
    overskriftEnLinje: true,
    raekke: { venstre: 68, hoejre: null, top: 234, gap: 30 },
    medlem: {
      bredde: 250,
      gap: 14,
      ring: { diameter: 250, kant: 4, farve: FARVER.navyGreen, slot: 226, pladsholderFarve: FARVER.navyGreen80 },
      tekstGap: 4,
      nytMedlem: { familie: M, vaegt: 700, stoerrelse: 12, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.navyGreen },
      navn: { familie: M, vaegt: 700, stoerrelse: 26, linjehoejde: 1.1, farve: FARVER.navyGreen, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 17, linjehoejde: 1.3, farve: FARVER.navyGreen80, nowrap: true },
    },
    raadgiver: {
      bredde: 210,
      paddingTop: 20,
      gap: 14,
      portraet: 210,
      tekstGap: 5,
      label: { familie: M, vaegt: 700, stoerrelse: 11, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.navyGreen80 },
      navn: { familie: M, vaegt: 700, stoerrelse: 22, linjehoejde: 1.1, farve: FARVER.navyGreen, nowrap: true },
    },
    bundraekke: null,
    logokort: { bredde: 206, hoejde: 84, radius: 14, padding: 14, slot: { bredde: 178, hoejde: 56 }, ...HVIDT_KORT_LYS },
    logokortAbs: { hoejre: 68, bund: 70 },
    ordmaerke: { bredde: 118, fil: "/topix-navy.png" },
    ordmaerkeAbs: { hoejre: 68, top: 60 },
  },
};

// ── 3b «Optagelsen» (v2:161-246) ──────────────────────────────────────────

const RAMME_MOERK = "rgba(163,217,196,.45)";
const RAMME_LYS = "rgba(19,51,50,.25)";

export const OPTAGELSEN: Readonly<Record<Kombination, OptagelsenMaal>> = {
  // v2:167-183
  "moerk-kvadrat": {
    layout: "optagelsen",
    canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.navyGreen },
    ramme: { inset: 36, kant: RAMME_MOERK },
    indhold: { retning: "kolonne", paddingTop: 96, paddingSide: 64 },
    tekstkolonneGap: null,
    label: { familie: M, vaegt: 700, stoerrelse: 21, linjehoejde: 1, spatiering: 0.3, versaler: true, farve: FARVER.ocean },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 84, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid, nowrap: true },
    overskriftMargenTop: 24,
    portraet: {
      margenTop: 44,
      diameter: 320,
      baggrund: FARVER.hvid,
      slot: 304,
      pladsholderFarve: FARVER.navyGreen,
      segl: { stoerrelse: 76, hoejre: 8, bund: 8, baggrund: FARVER.ocean, skrift: { familie: M, vaegt: 700, stoerrelse: 15, linjehoejde: 1.15, spatiering: 0.04, farve: FARVER.navyGreen } },
    },
    navn: { familie: M, vaegt: 700, stoerrelse: 46, linjehoejde: 1.05, farve: FARVER.hvid, nowrap: true },
    navnMargenTop: 28,
    navnRaekke: null,
    logokort: { bredde: 240, hoejde: 96, radius: 16, padding: 16, slot: { bredde: 208, hoejde: 64 }, ...HVIDT_KORT_MOERK },
    logokortMargenTop: 20,
    bund: { venstre: 96, hoejre: 96, bund: 74, gap: 16 },
    raadgiverstak: { portraet: 62, kant: 3, kantFarve: FARVER.navyGreen, overlap: 16 },
    raadgiverTekst: { familie: M, vaegt: 600, stoerrelse: 19, linjehoejde: 1.35, farve: FARVER.ocean40, nowrap: true },
    raadgiverTekstToLinjer: true,
    ordmaerke: { bredde: 130, fil: "/topix-shell.png" },
  },
  // v2:185-205
  "moerk-liggende": {
    layout: "optagelsen",
    canvas: { bredde: 1200, hoejde: 627, baggrund: FARVER.navyGreen },
    ramme: { inset: 28, kant: RAMME_MOERK },
    indhold: { retning: "raekke", paddingSide: 92, gap: 64 },
    tekstkolonneGap: 16,
    label: { familie: M, vaegt: 700, stoerrelse: 16, linjehoejde: 1, spatiering: 0.3, versaler: true, farve: FARVER.ocean },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 60, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid },
    overskriftMargenTop: null,
    portraet: {
      margenTop: null,
      diameter: 276,
      baggrund: FARVER.hvid,
      slot: 262,
      pladsholderFarve: FARVER.navyGreen,
      segl: { stoerrelse: 66, hoejre: 4, bund: 4, baggrund: FARVER.ocean, skrift: { familie: M, vaegt: 700, stoerrelse: 13, linjehoejde: 1.15, farve: FARVER.navyGreen } },
    },
    navn: { familie: M, vaegt: 700, stoerrelse: 30, linjehoejde: 1.05, farve: FARVER.hvid, nowrap: true },
    navnMargenTop: null,
    navnRaekke: { gap: 26, margenTop: 8 },
    logokort: { bredde: 190, hoejde: 78, radius: 14, padding: 14, slot: { bredde: 162, hoejde: 50 }, ...HVIDT_KORT_MOERK },
    logokortMargenTop: null,
    bund: { venstre: 92, hoejre: 92, bund: 46, gap: 14 },
    raadgiverstak: { portraet: 50, kant: 3, kantFarve: FARVER.navyGreen, overlap: 13 },
    raadgiverTekst: { familie: M, vaegt: 600, stoerrelse: 17, linjehoejde: 1, farve: FARVER.ocean40, nowrap: true },
    raadgiverTekstToLinjer: false,
    ordmaerke: { bredde: 112, fil: "/topix-shell.png" },
  },
  // v2:208-224
  "lys-kvadrat": {
    layout: "optagelsen",
    canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.shell },
    ramme: { inset: 36, kant: RAMME_LYS },
    indhold: { retning: "kolonne", paddingTop: 96, paddingSide: 64 },
    tekstkolonneGap: null,
    label: { familie: M, vaegt: 700, stoerrelse: 21, linjehoejde: 1, spatiering: 0.3, versaler: true, farve: FARVER.navyGreen },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 84, linjehoejde: 1, spatiering: -0.02, farve: FARVER.navyGreen, nowrap: true },
    overskriftMargenTop: 24,
    portraet: {
      margenTop: 44,
      diameter: 320,
      baggrund: FARVER.hvid,
      slot: 304,
      pladsholderFarve: FARVER.navyGreen,
      segl: { stoerrelse: 76, hoejre: 8, bund: 8, baggrund: FARVER.navyGreen, skrift: { familie: M, vaegt: 700, stoerrelse: 15, linjehoejde: 1.15, spatiering: 0.04, farve: FARVER.ocean } },
    },
    navn: { familie: M, vaegt: 700, stoerrelse: 46, linjehoejde: 1.05, farve: FARVER.navyGreen, nowrap: true },
    navnMargenTop: 28,
    navnRaekke: null,
    logokort: { bredde: 240, hoejde: 96, radius: 16, padding: 16, slot: { bredde: 208, hoejde: 64 }, ...HVIDT_KORT_LYS },
    logokortMargenTop: 20,
    bund: { venstre: 96, hoejre: 96, bund: 74, gap: 16 },
    raadgiverstak: { portraet: 62, kant: 3, kantFarve: FARVER.shell, overlap: 16 },
    raadgiverTekst: { familie: M, vaegt: 600, stoerrelse: 19, linjehoejde: 1.35, farve: FARVER.navyGreen80, nowrap: true },
    raadgiverTekstToLinjer: true,
    ordmaerke: { bredde: 130, fil: "/topix-navy.png" },
  },
  // v2:226-246
  "lys-liggende": {
    layout: "optagelsen",
    canvas: { bredde: 1200, hoejde: 627, baggrund: FARVER.shell },
    ramme: { inset: 28, kant: RAMME_LYS },
    indhold: { retning: "raekke", paddingSide: 92, gap: 64 },
    tekstkolonneGap: 16,
    label: { familie: M, vaegt: 700, stoerrelse: 16, linjehoejde: 1, spatiering: 0.3, versaler: true, farve: FARVER.navyGreen },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 60, linjehoejde: 1, spatiering: -0.02, farve: FARVER.navyGreen },
    overskriftMargenTop: null,
    portraet: {
      margenTop: null,
      diameter: 276,
      baggrund: FARVER.hvid,
      slot: 262,
      pladsholderFarve: FARVER.navyGreen,
      segl: { stoerrelse: 66, hoejre: 4, bund: 4, baggrund: FARVER.navyGreen, skrift: { familie: M, vaegt: 700, stoerrelse: 13, linjehoejde: 1.15, farve: FARVER.ocean } },
    },
    navn: { familie: M, vaegt: 700, stoerrelse: 30, linjehoejde: 1.05, farve: FARVER.navyGreen, nowrap: true },
    navnMargenTop: null,
    navnRaekke: { gap: 26, margenTop: 8 },
    logokort: { bredde: 190, hoejde: 78, radius: 14, padding: 14, slot: { bredde: 162, hoejde: 50 }, ...HVIDT_KORT_LYS },
    logokortMargenTop: null,
    bund: { venstre: 92, hoejre: 92, bund: 46, gap: 14 },
    raadgiverstak: { portraet: 50, kant: 3, kantFarve: FARVER.shell, overlap: 13 },
    raadgiverTekst: { familie: M, vaegt: 600, stoerrelse: 17, linjehoejde: 1, farve: FARVER.navyGreen80, nowrap: true },
    raadgiverTekstToLinjer: false,
    ordmaerke: { bredde: 112, fil: "/topix-navy.png" },
  },
};

// ── 3c «Optaget i» (v2:250-341) ───────────────────────────────────────────

export const OPTAGET_I: Readonly<Record<Kombination, OptagetIMaal>> = {
  // v2:256-278
  "moerk-kvadrat": {
    layout: "optaget_i",
    canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.navyGreen },
    topblok: { venstre: 88, top: 88, hoejre: 88, bredde: null, gap: 26 },
    oejenbryn: {
      gap: 18,
      streg: { bredde: 57, hoejde: 6, farve: FARVER.ocean },
      label: { familie: M, vaegt: 700, stoerrelse: 22, linjehoejde: 1, spatiering: 0.2, versaler: true, farve: FARVER.ocean, nowrap: true },
    },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 100, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid },
    navneblok: {
      gap: 6,
      margenTop: null,
      navn: { familie: M, vaegt: 700, stoerrelse: 52, linjehoejde: 1.05, farve: FARVER.hvid, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 28, linjehoejde: 1.3, farve: FARVER.ocean40, nowrap: true },
    },
    raekke: { venstre: 88, hoejre: 88, top: 470, gap: 52 },
    tekstkolonneGap: 22,
    hoejreKolonne: null,
    ring: { diameter: 330, kant: 5, farve: FARVER.ocean, slot: 296, pladsholderFarve: FARVER.ocean40 },
    logokort: { bredde: 272, hoejde: 112, radius: 18, padding: 20, slot: { bredde: 232, hoejde: 72 }, ...HVIDT_KORT_MOERK },
    bjaelke: { hoejde: 168, baggrund: FARVER.ocean, paddingSide: 88, gap: 22 },
    raadgiverstak: { portraet: 78, kant: 3, kantFarve: FARVER.ocean, overlap: 20 },
    raadgiverTekst: {
      gap: 4,
      label: { familie: M, vaegt: 700, stoerrelse: 15, linjehoejde: 1, spatiering: 0.2, versaler: true, farve: FARVER.navyGreen },
      navne: { familie: M, vaegt: 600, stoerrelse: 26, linjehoejde: 1, farve: FARVER.navyGreen, nowrap: true },
    },
    ordmaerke: { bredde: 158, fil: "/topix-navy.png" },
  },
  // v2:280-297
  "moerk-liggende": {
    layout: "optaget_i",
    canvas: { bredde: 1200, hoejde: 627, baggrund: FARVER.navyGreen },
    topblok: { venstre: 72, top: 60, hoejre: null, bredde: 620, gap: 20 },
    oejenbryn: {
      gap: 14,
      streg: { bredde: 44, hoejde: 4, farve: FARVER.ocean },
      label: { familie: M, vaegt: 700, stoerrelse: 17, linjehoejde: 1, spatiering: 0.2, versaler: true, farve: FARVER.ocean, nowrap: true },
    },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 68, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid },
    navneblok: {
      gap: 4,
      margenTop: 8,
      navn: { familie: M, vaegt: 700, stoerrelse: 34, linjehoejde: 1.05, farve: FARVER.hvid, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 20, linjehoejde: 1.3, farve: FARVER.ocean40, nowrap: true },
    },
    raekke: null,
    tekstkolonneGap: null,
    hoejreKolonne: { hoejre: 72, top: 58, gap: 24 },
    ring: { diameter: 268, kant: 4, farve: FARVER.ocean, slot: 242, pladsholderFarve: FARVER.ocean40 },
    logokort: { bredde: 236, hoejde: 92, radius: 16, padding: 16, slot: { bredde: 204, hoejde: 60 }, ...HVIDT_KORT_MOERK },
    bjaelke: { hoejde: 112, baggrund: FARVER.ocean, paddingSide: 72, gap: 16 },
    raadgiverstak: { portraet: 58, kant: 3, kantFarve: FARVER.ocean, overlap: 15 },
    raadgiverTekst: {
      gap: 0,
      label: null,
      navne: { familie: M, vaegt: 600, stoerrelse: 20, linjehoejde: 1, farve: FARVER.navyGreen, nowrap: true },
    },
    ordmaerke: { bredde: 124, fil: "/topix-navy.png" },
  },
  // v2:300-322
  "lys-kvadrat": {
    layout: "optaget_i",
    canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.shell },
    topblok: { venstre: 88, top: 88, hoejre: 88, bredde: null, gap: 26 },
    oejenbryn: {
      gap: 18,
      streg: { bredde: 57, hoejde: 6, farve: FARVER.ocean },
      label: { familie: M, vaegt: 700, stoerrelse: 22, linjehoejde: 1, spatiering: 0.2, versaler: true, farve: FARVER.navyGreen, nowrap: true },
    },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 100, linjehoejde: 1, spatiering: -0.02, farve: FARVER.navyGreen },
    navneblok: {
      gap: 6,
      margenTop: null,
      navn: { familie: M, vaegt: 700, stoerrelse: 52, linjehoejde: 1.05, farve: FARVER.navyGreen, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 28, linjehoejde: 1.3, farve: FARVER.navyGreen80, nowrap: true },
    },
    raekke: { venstre: 88, hoejre: 88, top: 470, gap: 52 },
    tekstkolonneGap: 22,
    hoejreKolonne: null,
    ring: { diameter: 330, kant: 5, farve: FARVER.navyGreen, slot: 296, pladsholderFarve: FARVER.navyGreen80 },
    logokort: { bredde: 272, hoejde: 112, radius: 18, padding: 20, slot: { bredde: 232, hoejde: 72 }, ...HVIDT_KORT_LYS },
    bjaelke: { hoejde: 168, baggrund: FARVER.navyGreen, paddingSide: 88, gap: 22 },
    raadgiverstak: { portraet: 78, kant: 3, kantFarve: FARVER.navyGreen, overlap: 20 },
    raadgiverTekst: {
      gap: 4,
      label: { familie: M, vaegt: 700, stoerrelse: 15, linjehoejde: 1, spatiering: 0.2, versaler: true, farve: FARVER.ocean },
      navne: { familie: M, vaegt: 600, stoerrelse: 26, linjehoejde: 1, farve: FARVER.shell, nowrap: true },
    },
    ordmaerke: { bredde: 158, fil: "/topix-shell.png" },
  },
  // v2:324-341
  "lys-liggende": {
    layout: "optaget_i",
    canvas: { bredde: 1200, hoejde: 627, baggrund: FARVER.shell },
    topblok: { venstre: 72, top: 60, hoejre: null, bredde: 620, gap: 20 },
    oejenbryn: {
      gap: 14,
      streg: { bredde: 44, hoejde: 4, farve: FARVER.ocean },
      label: { familie: M, vaegt: 700, stoerrelse: 17, linjehoejde: 1, spatiering: 0.2, versaler: true, farve: FARVER.navyGreen, nowrap: true },
    },
    overskrift: { familie: P, vaegt: 600, stoerrelse: 68, linjehoejde: 1, spatiering: -0.02, farve: FARVER.navyGreen },
    navneblok: {
      gap: 4,
      margenTop: 8,
      navn: { familie: M, vaegt: 700, stoerrelse: 34, linjehoejde: 1.05, farve: FARVER.navyGreen, nowrap: true },
      virksomhed: { familie: M, vaegt: 500, stoerrelse: 20, linjehoejde: 1.3, farve: FARVER.navyGreen80, nowrap: true },
    },
    raekke: null,
    tekstkolonneGap: null,
    hoejreKolonne: { hoejre: 72, top: 58, gap: 24 },
    ring: { diameter: 268, kant: 4, farve: FARVER.navyGreen, slot: 242, pladsholderFarve: FARVER.navyGreen80 },
    logokort: { bredde: 236, hoejde: 92, radius: 16, padding: 16, slot: { bredde: 204, hoejde: 60 }, ...HVIDT_KORT_LYS },
    bjaelke: { hoejde: 112, baggrund: FARVER.navyGreen, paddingSide: 72, gap: 16 },
    raadgiverstak: { portraet: 58, kant: 3, kantFarve: FARVER.navyGreen, overlap: 15 },
    raadgiverTekst: {
      gap: 0,
      label: null,
      navne: { familie: M, vaegt: 600, stoerrelse: 20, linjehoejde: 1, farve: FARVER.shell, nowrap: true },
    },
    ordmaerke: { bredde: 124, fil: "/topix-shell.png" },
  },
};

/** Bevaret navn fra første skridt (#866) — samme objekt som TRE_PAA_RAEKKE["moerk-kvadrat"]. */
export const TRE_PAA_RAEKKE_MOERK_KVADRAT: TrePaaRaekkeMaal = TRE_PAA_RAEKKE["moerk-kvadrat"];

/** Måltabellen for en kombination. Alle tolv findes (14/9). */
export function hentMaal(layout: Layout, udgave: Udgave, format: Format): KreativMaal {
  const k = kombination(udgave, format);
  if (layout === "tre_paa_raekke") return TRE_PAA_RAEKKE[k];
  if (layout === "optagelsen") return OPTAGELSEN[k];
  return OPTAGET_I[k];
}

/** Ordene, ordret fra v2 (3a :40, :41, :47, :55 · 3b :171, :174, :181, :203 · 3c :274-275, :295). */
export const TEKSTER = {
  optaget: "Optaget",
  overskrift: ["Optaget i", "The Boardroom"] as const,
  /** 3b's overskrift (v2:171) */
  nytMedlemAf: ["Nyt medlem af", "The Boardroom"] as const,
  nytMedlem: "Nyt medlem",
  /** 3b's segl i cirklen (v2:174), to linjer */
  segl: ["NYT", "MEDLEM"] as const,
  raadgiver: "Rådgiver",
  raadgivere: "Rådgivere",
  /** image-slot placeholder-attributterne (v2:45, :66) */
  pladsholderPortraet: "Medlemmets portræt",
  pladsholderLogo: "Firmalogo",
} as const;

/** Rådgiverne i designets rækkefølge (v2:53-62: Morten først). Filerne ligger i public/ (kopieret fra docs/delingskreativ/assets/). */
export const RAADGIVERE: ReadonlyArray<{ navn: string; fil: string }> = [
  { navn: "Morten Larsen", fil: "/morten-hi.png" },
  { navn: "Jonas Herlev", fil: "/jonas-hi.png" },
];

/** «Morten Larsen & Jonas Herlev» (v2:181, :203, :275, :295). */
export const RAADGIVER_NAVNE = RAADGIVERE.map((r) => r.navn).join(" & ");

/** Designets prøvetekster (v2:348 data-props defaults). */
export const PROEVETEKSTER = {
  memberName: "Anne Kirkegaard",
  companyName: "Lazzaweb A/S",
  dateLabel: "september 2026",
} as const;

/**
 * Det en kreativ tegnes af (14/9): navn, virksomhed, dato og to billeder.
 * Billed-URL'er er enten profilens/virksomhedens (avatar_url, logo_url)
 * eller en object-URL fra en fil hun har lagt ind i browseren. Kreativens
 * navn og virksomhed er HENDES rettelser — de gemmes aldrig tilbage i
 * profiles eller companies (Jonas 14/9: «det er hendes kreativ, ikke en
 * profilredigering»).
 */
export interface KreativData {
  memberName: string;
  companyName: string;
  dateLabel: string;
  portraetUrl?: string | null;
  logoUrl?: string | null;
}

export type KreativDel = "navn" | "virksomhed" | "portraet" | "logo";

export interface KreativMangel {
  del: KreativDel;
  /** Kort: hvad mangler, og hvad gør hun. */
  tekst: string;
}

/** Det der mangler før kreativen er hel — i kreativens egen rækkefølge (portræt, navn, virksomhed, logo). */
export function manglendeDele(data: KreativData): KreativMangel[] {
  const m: KreativMangel[] = [];
  if (!data.portraetUrl) m.push({ del: "portraet", tekst: "Portrættet mangler — læg et billede i feltet «Portræt», eller upload et profilbillede under Konto." });
  if (!data.memberName.trim()) m.push({ del: "navn", tekst: "Navnet mangler — skriv det i feltet «Navn»." });
  if (!data.companyName.trim()) m.push({ del: "virksomhed", tekst: "Virksomhedens navn mangler — skriv det i feltet «Virksomhed»." });
  if (!data.logoUrl) m.push({ del: "logo", tekst: "Logoet mangler — læg det i feltet «Logo», eller upload det under Indstillinger." });
  return m;
}

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
] as const;

/** «september 2026»-formen (v2:348): måned med lille, mellemrum, år. Egen tabel, ikke Intl, så testen er ens overalt. */
export function dateLabel(nu: Date): string {
  return `${MAANEDER[nu.getMonth()]} ${nu.getFullYear()}`;
}
