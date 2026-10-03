import { HB_INPUT } from "@/components/hjemmebane/hbFormKlasser";
import { cn } from "@/lib/utils";

/**
 * Seerens flade (skive 2, 30/9-2026) — hjemmebanens sprog (docs/hjemmebane-designsprog.md):
 * papir, Fraunces i font-medium til overskrifter, Manrope til brødtekst,
 * evergreen er handlingen, rust kun eyebrow. MOBIL FØRST: felter i 16 px
 * (text-base) — under 16 px zoomer iOS Safari ind, når feltet får fokus.
 */
export const RAMME = "theme-hjemmebane min-h-screen-safe bg-hb-paper font-body text-hb-ink antialiased";
export const INDHOLD = "mx-auto w-full max-w-3xl px-4 py-8 md:py-12";
export const EYEBROW = "text-xs font-medium uppercase tracking-[0.14em] text-hb-rust";
export const H1 = "font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl";
export const H2 = "font-editorial text-2xl font-medium leading-tight text-hb-ink";
export const BROED = "text-base leading-relaxed text-hb-ink-soft";
export const FELT = cn(HB_INPUT, "text-base");
export const LABEL = "mb-1.5 block text-sm font-medium text-hb-ink";
export const FEJL = "mt-1.5 text-sm text-hb-rust";
/** Fyldt, stor handling — 48 px høj, så en tommelfinger rammer (WCAG 2.5.5). */
export const STOR_KNAP = "h-12 px-7 text-base";
