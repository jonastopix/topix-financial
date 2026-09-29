import type React from "react";
import type { CertificateProps, DesignId } from "./types";
import { MorkKlassiker } from "./designs/MorkKlassiker";
import { LegatSegl } from "./designs/LegatSegl";
import { RaadgivereMork } from "./designs/RaadgivereMork";
import { RaadgivereLys } from "./designs/RaadgivereLys";
import { Portraet } from "./designs/Portraet";

export interface DesignDef {
  id: DesignId;
  /** Kortets titel i "Vælg design". */
  label: string;
  /** Kortets undertekst. */
  subtitle: string;
  /** Designet kan kun vælges, når medlemmet har et portræt. */
  requiresPortrait: boolean;
  Component: React.ComponentType<CertificateProps>;
}

/** Rækkefølgen her er rækkefølgen i "Vælg design". Første er standardvalg. */
export const DESIGNS: DesignDef[] = [
  { id: "mork-klassiker", label: "Mørk klassiker", subtitle: "Segl · uden portræt", requiresPortrait: false, Component: MorkKlassiker },
  { id: "legat-segl", label: "Legat med segl", subtitle: "Stort segl · uden portræt", requiresPortrait: false, Component: LegatSegl },
  { id: "raadgivere-mork", label: "Med rådgiverne · mørk", subtitle: "Dig, Morten og Jonas", requiresPortrait: true, Component: RaadgivereMork },
  { id: "raadgivere-lys", label: "Med rådgiverne · lys", subtitle: "Dig, Morten og Jonas", requiresPortrait: true, Component: RaadgivereLys },
  { id: "portraet", label: "Dit portræt", subtitle: "Kun dig · med segl", requiresPortrait: true, Component: Portraet },
];

export function getDesign(id: DesignId): DesignDef {
  return DESIGNS.find((d) => d.id === id) ?? DESIGNS[0]!;
}
