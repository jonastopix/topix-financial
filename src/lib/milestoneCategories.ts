import {
  TrendingUp, Coins, Clock, Users, BarChart3, Target,
  Package, ShoppingCart, Heart, Megaphone, Scale, Landmark,
  Calculator,
  type LucideIcon,
} from "lucide-react";

export type MilestoneCategory =
  | "vaekst" | "profit" | "timer" | "medarbejdere" | "db"
  | "produkt" | "salg" | "kunder" | "marketing" | "juridisk" | "funding"
  | "other";

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
}

export const MILESTONE_CATEGORIES: Record<MilestoneCategory, CategoryConfig> = {
  vaekst: {
    label: "Vækst",
    icon: TrendingUp,
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  profit: {
    label: "Profit",
    icon: Coins,
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  salg: {
    label: "Salg",
    icon: ShoppingCart,
    badgeClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  },
  kunder: {
    label: "Kunder",
    icon: Heart,
    badgeClass: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  },
  produkt: {
    label: "Produkt",
    icon: Package,
    badgeClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  medarbejdere: {
    label: "Medarbejdere",
    icon: Users,
    badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  timer: {
    label: "Timer",
    icon: Clock,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  db: {
    label: "Dækningsbidrag",
    icon: BarChart3,
    badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  juridisk: {
    label: "Juridisk",
    icon: Scale,
    badgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  },
  funding: {
    label: "Funding",
    icon: Landmark,
    badgeClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
  other: {
    label: "Andet",
    icon: Target,
    badgeClass: "bg-muted text-muted-foreground",
  },
};

export const CATEGORY_OPTIONS = Object.entries(MILESTONE_CATEGORIES).map(([key, cfg]) => ({
  value: key as MilestoneCategory,
  label: cfg.label,
}));
