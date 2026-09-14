/**
 * Listen over kreativer (Jonas 14/9): galleriet og fuldskærmen læser KUN
 * herfra. Et nyt layout eller en ny udgave er én post her — ingen ny kode
 * i galleriet. Lige nu findes kun 3a mørk kvadrat; det er med vilje: formen
 * skal være rigtig, før de øvrige elleve bygges.
 *
 * Ren flade: ingen motor, ingen data. Målene kommer fra delingskreativ.ts
 * gennem komponenten selv; listen kender kun format (til skaleringen) og
 * hvilken komponent der tegner.
 */

import type { ComponentType } from "react";
import { FORMATER, type Format, type Layout, type Udgave } from "@/lib/delingskreativ";
import { KreativTrePaaRaekke, type KreativTrePaaRaekkeProps } from "./KreativTrePaaRaekke";

export interface KreativPost {
  /** Stabil nøgle, fx "3a-moerk-kvadrat" */
  id: string;
  titel: string;
  layout: Layout;
  udgave: Udgave;
  format: Format;
  komponent: ComponentType<KreativTrePaaRaekkeProps>;
}

export const KREATIVER: ReadonlyArray<KreativPost> = [
  { id: "3a-moerk-kvadrat", titel: "Tre på række — mørk kvadrat", layout: "tre_paa_raekke", udgave: "moerk", format: "kvadrat", komponent: KreativTrePaaRaekke },
];

export const kreativMaal = (post: KreativPost) => FORMATER[post.format];
