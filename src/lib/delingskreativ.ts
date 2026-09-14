/**
 * src/lib/delingskreativ.ts
 *
 * Delingskreativens motor — ren: ingen React, ingen supabase, ingen DOM.
 *
 * Kilden er designet i docs/delingskreativ/Boardroom Delingskreativ v2.dc.html
 * (i repoet fra #865) og opmålingen i recon-kreativ-design.md (14/9 2026).
 * Første skridt (Jonas 14/9): ÉN kreativ på skærmen — 3a «Tre på række» i
 * mørk kvadrat (v2:38-67) — så vi kan se om oversættelsen rammer designet.
 * De øvrige kombinationer (lys, liggende, 3b, 3c) findes kun som typer;
 * hentMaal() svarer null for dem, og fladen siger det.
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

/** Måltabellen for 3a «Tre på række». Ét objekt per udgave×format; kun mørk kvadrat findes endnu. */
export interface TrePaaRaekkeMaal {
  canvas: { bredde: number; hoejde: number; baggrund: string };
  /** v2:39 — abs left/right/top, column, gap */
  topblok: { venstre: number; hoejre: number; top: number; gap: number };
  /** v2:40 «Optaget {{ dateLabel }}» */
  label: Skrift;
  /** v2:41 «Optaget i<br>The Boardroom» */
  overskrift: Skrift;
  /** v2:43 — abs left/right/top, align flex-start, gap */
  raekke: { venstre: number; hoejre: number; top: number; gap: number };
  /** v2:44-49 */
  medlem: {
    bredde: number;
    gap: number;
    ring: { diameter: number; kant: number; farve: string };
    slot: { diameter: number };
    tekstGap: number;
    nytMedlem: Skrift;
    navn: Skrift;
    virksomhed: Skrift;
  };
  /** v2:52-62 — to ens kolonner */
  raadgiver: {
    bredde: number;
    paddingTop: number;
    gap: number;
    portraet: number;
    tekstGap: number;
    label: Skrift;
    navn: Skrift;
  };
  /** v2:65 — abs left/right/bottom, space-between */
  bund: { venstre: number; hoejre: number; bund: number };
  /** v2:66 */
  logokort: {
    bredde: number;
    hoejde: number;
    radius: number;
    padding: number;
    baggrund: string;
    kant: string;
    slot: { bredde: number; hoejde: number };
  };
  /** v2:67 — ordmærket, bredde i px, højde auto (260×90-fil) */
  ordmaerke: { bredde: number; fil: string };
}

export const TRE_PAA_RAEKKE_MOERK_KVADRAT: TrePaaRaekkeMaal = {
  canvas: { bredde: 1080, hoejde: 1080, baggrund: FARVER.navyGreen },
  topblok: { venstre: 80, hoejre: 80, top: 84, gap: 20 },
  label: { familie: "manrope", vaegt: 700, stoerrelse: 20, linjehoejde: 1, spatiering: 0.26, versaler: true, farve: FARVER.ocean },
  overskrift: { familie: "parkinsans", vaegt: 600, stoerrelse: 98, linjehoejde: 1, spatiering: -0.02, farve: FARVER.hvid },
  raekke: { venstre: 80, hoejre: 80, top: 376, gap: 34 },
  medlem: {
    bredde: 340,
    gap: 18,
    ring: { diameter: 340, kant: 5, farve: FARVER.ocean },
    slot: { diameter: 310 },
    tekstGap: 5,
    nytMedlem: { familie: "manrope", vaegt: 700, stoerrelse: 15, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.ocean },
    navn: { familie: "manrope", vaegt: 700, stoerrelse: 34, linjehoejde: 1.1, farve: FARVER.hvid, nowrap: true },
    virksomhed: { familie: "manrope", vaegt: 500, stoerrelse: 21, linjehoejde: 1.3, farve: FARVER.ocean40, nowrap: true },
  },
  raadgiver: {
    bredde: 270,
    paddingTop: 34,
    gap: 18,
    portraet: 270,
    tekstGap: 5,
    label: { familie: "manrope", vaegt: 700, stoerrelse: 14, linjehoejde: 1, spatiering: 0.22, versaler: true, farve: FARVER.ocean40 },
    navn: { familie: "manrope", vaegt: 700, stoerrelse: 28, linjehoejde: 1.1, farve: FARVER.hvid, nowrap: true },
  },
  bund: { venstre: 80, hoejre: 80, bund: 72 },
  logokort: {
    bredde: 236,
    hoejde: 92,
    radius: 16,
    padding: 16,
    baggrund: FARVER.hvid,
    kant: "transparent",
    slot: { bredde: 204, hoejde: 60 },
  },
  ordmaerke: { bredde: 136, fil: "/topix-shell.png" },
};

/** Måltabellen for en kombination — null for dem der ikke er bygget endnu. */
export function hentMaal(layout: Layout, udgave: Udgave, format: Format): TrePaaRaekkeMaal | null {
  if (layout === "tre_paa_raekke" && udgave === "moerk" && format === "kvadrat") return TRE_PAA_RAEKKE_MOERK_KVADRAT;
  return null;
}

/** Ordene i 3a, ordret fra v2 (:40, :41, :47, :55). */
export const TEKSTER = {
  optaget: "Optaget",
  overskrift: ["Optaget i", "The Boardroom"] as const,
  nytMedlem: "Nyt medlem",
  raadgiver: "Rådgiver",
  /** image-slot placeholder-attributterne (v2:45, :66) */
  pladsholderPortraet: "Medlemmets portræt",
  pladsholderLogo: "Firmalogo",
} as const;

/** Rådgiverne i designets rækkefølge (v2:53-62: Morten først). Filerne ligger i public/ (kopieret fra docs/delingskreativ/assets/). */
export const RAADGIVERE: ReadonlyArray<{ navn: string; fil: string }> = [
  { navn: "Morten Larsen", fil: "/morten-hi.png" },
  { navn: "Jonas Herlev", fil: "/jonas-hi.png" },
];

/** Designets prøvetekster (v2:348 data-props defaults). */
export const PROEVETEKSTER = {
  memberName: "Anne Kirkegaard",
  companyName: "Lazzaweb A/S",
  dateLabel: "september 2026",
} as const;

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
] as const;

/** «september 2026»-formen (v2:348): måned med lille, mellemrum, år. Egen tabel, ikke Intl, så testen er ens overalt. */
export function dateLabel(nu: Date): string {
  return `${MAANEDER[nu.getMonth()]} ${nu.getFullYear()}`;
}
