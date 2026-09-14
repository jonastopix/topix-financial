/**
 * Det alle tre kreativ-komponenter tager — samme props, så listen i
 * kreativer.tsx kan pege på hvilken som helst af dem, og galleriet og
 * fuldskærmen ikke skal vide hvilket layout de tegner.
 */
import type { Format, Udgave } from "@/lib/delingskreativ";

export interface KreativProps {
  udgave: Udgave;
  format: Format;
  memberName: string;
  companyName: string;
  dateLabel: string;
  portraetUrl?: string | null;
  logoUrl?: string | null;
  /** Forhåndsvisning: true (pladsholder i tomme felter). Den kreativ der hentes: false. */
  visTomtilstand?: boolean;
}
