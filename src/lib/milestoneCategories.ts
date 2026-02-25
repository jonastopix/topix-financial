import { TrendingUp, Coins, Clock, Users, BarChart3, Target, type LucideIcon } from "lucide-react";

export type MilestoneCategory = "vaekst" | "profit" | "timer" | "medarbejdere" | "db" | "other";

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  badgeClass: string; // tailwind classes for the badge
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
  timer: {
    label: "Timer",
    icon: Clock,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  medarbejdere: {
    label: "Medarbejdere",
    icon: Users,
    badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  db: {
    label: "Dækningsbidrag",
    icon: BarChart3,
    badgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
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
