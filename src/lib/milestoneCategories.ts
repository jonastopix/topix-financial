import {
  TrendingUp, Coins, Clock, Users, BarChart3, Target,
  Package, ShoppingCart, Heart, Megaphone, Scale, Landmark,
  Calculator, ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type MilestoneCategory =
  | "vaekst" | "profit" | "timer" | "medarbejdere" | "db"
  | "produkt" | "salg" | "kunder" | "marketing" | "juridisk" | "funding"
  | "regnskab" | "administration" | "other";

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  /** Pillens klasser — husets palet, ÉN farve for alle (10/9, kort #93).
      Før bar hver kategori sin egen rå Tailwind-farve (emerald/blue/indigo/
      pink/cyan/violet/purple/amber/orange/slate/teal/rose/zinc) — en regnbue
      hvor Hjemmebane bruger få farver med vilje. Ikonet bærer forskellen:
      fjorten kategorier, fjorten forskellige ikoner (låst af test). */
  badgeClass: string;
}

/** Samme pille som HbTag/EstimatMaerke: sage-flade, blæk-tekst. */
export const PILLE = "bg-hb-sage/70 text-hb-ink";
/** «Andet» er den ene der må være stillere end de andre. */
export const PILLE_ANDET = "bg-hb-line/40 text-hb-ink-soft";

export const MILESTONE_CATEGORIES: Record<MilestoneCategory, CategoryConfig> = {
  vaekst: {
    label: "Vækst",
    icon: TrendingUp,
    badgeClass: PILLE,
  },
  profit: {
    label: "Profit",
    icon: Coins,
    badgeClass: PILLE,
  },
  salg: {
    label: "Salg",
    icon: ShoppingCart,
    badgeClass: PILLE,
  },
  kunder: {
    label: "Kunder",
    icon: Heart,
    badgeClass: PILLE,
  },
  produkt: {
    label: "Produkt",
    icon: Package,
    badgeClass: PILLE,
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    badgeClass: PILLE,
  },
  medarbejdere: {
    label: "Medarbejdere",
    icon: Users,
    badgeClass: PILLE,
  },
  timer: {
    label: "Timer",
    icon: Clock,
    badgeClass: PILLE,
  },
  db: {
    label: "Dækningsbidrag",
    icon: BarChart3,
    badgeClass: PILLE,
  },
  juridisk: {
    label: "Juridisk",
    icon: Scale,
    badgeClass: PILLE,
  },
  funding: {
    label: "Funding",
    icon: Landmark,
    badgeClass: PILLE,
  },
  regnskab: {
    label: "Regnskab",
    icon: Calculator,
    badgeClass: PILLE,
  },
  administration: {
    label: "Administration",
    icon: ClipboardList,
    badgeClass: PILLE,
  },
  other: {
    label: "Andet",
    icon: Target,
    badgeClass: PILLE_ANDET,
  },
};

export const CATEGORY_OPTIONS = Object.entries(MILESTONE_CATEGORIES)
  .map(([key, cfg]) => ({
    value: key as MilestoneCategory,
    label: cfg.label,
  }))
  .sort((a, b) => {
    // "Andet" always last
    if (a.value === "other") return 1;
    if (b.value === "other") return -1;
    return a.label.localeCompare(b.label, "da");
  });
