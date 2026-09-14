/**
 * Listen over kreativer (Jonas 14/9): galleriet og fuldskærmen læser KUN
 * herfra. Et nyt layout eller en ny udgave er én post her — ingen ny kode
 * i galleriet. Første skridt var én post (3a mørk kvadrat); nu står alle
 * tolv: tre layouts × mørk/lys × kvadrat/liggende, i designets rækkefølge
 * (v2: 3a, 3b, 3c; mørk før lys; kvadrat før liggende).
 *
 * Ren flade: ingen motor, ingen data. Målene kommer fra delingskreativ.ts
 * gennem komponenten selv; listen kender kun format (til skaleringen) og
 * hvilken komponent der tegner.
 */

import type { ComponentType } from "react";
import { FORMATER, type Format, type Layout, type Udgave } from "@/lib/delingskreativ";
import { KreativOptagelsen } from "./KreativOptagelsen";
import { KreativOptagetI } from "./KreativOptagetI";
import { KreativTrePaaRaekke } from "./KreativTrePaaRaekke";
import type { KreativProps } from "./kreativProps";

export interface KreativPost {
  /** Stabil nøgle, fx "3a-moerk-kvadrat" */
  id: string;
  titel: string;
  layout: Layout;
  udgave: Udgave;
  format: Format;
  komponent: ComponentType<KreativProps>;
}

const LAYOUTS: ReadonlyArray<{ kode: string; navn: string; layout: Layout; komponent: ComponentType<KreativProps> }> = [
  { kode: "3a", navn: "Tre på række", layout: "tre_paa_raekke", komponent: KreativTrePaaRaekke },
  { kode: "3b", navn: "Optagelsen", layout: "optagelsen", komponent: KreativOptagelsen },
  { kode: "3c", navn: "Optaget i", layout: "optaget_i", komponent: KreativOptagetI },
];
const UDGAVER: ReadonlyArray<{ udgave: Udgave; navn: string }> = [
  { udgave: "moerk", navn: "mørk" },
  { udgave: "lys", navn: "lys" },
];
const FORMATNAVNE: ReadonlyArray<Format> = ["kvadrat", "liggende"];

export const KREATIVER: ReadonlyArray<KreativPost> = LAYOUTS.flatMap((l) =>
  UDGAVER.flatMap((u) =>
    FORMATNAVNE.map((format) => ({
      id: `${l.kode}-${u.udgave}-${format}`,
      titel: `${l.navn} — ${u.navn} ${format}`,
      layout: l.layout,
      udgave: u.udgave,
      format,
      komponent: l.komponent,
    })),
  ),
);

export const kreativMaal = (post: KreativPost) => FORMATER[post.format];
