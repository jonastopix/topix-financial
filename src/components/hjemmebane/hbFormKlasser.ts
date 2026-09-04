/**
 * Fælles klasser for de standalone Hb-flader uden skal (Auth, ResetPassword,
 * Betal-familien): rammen, eyebrow, overskrift og felter. Huset har ingen
 * HbInput-komponent, så klasserne står ÉT sted og importeres — de blev
 * flyttet hertil fra Auth.tsx (trin 10-12), da ResetPassword skulle bruge
 * de samme, frem for at kopiere dem.
 *
 * Radius og hairline er Hb-tokens; fokus-ringen er evergreen som HbButton.
 *
 * Rammen er min-h-screen-SAFE (dvh med vh-fallback, index.css), ikke
 * Tailwinds min-h-screen: 100vh er på mobil STØRRE end det synlige område,
 * og under rammen lå så bodys mørkegrønne .dark-baggrund som et tomt
 * bundstykke (målt 4/9). Siderne der bruger rammen kalder desuden
 * useHbDokumentGrund, så lærredet bag den er papir — samme to greb som
 * HbMemberShell.
 */
export const HB_RAMME = "theme-hjemmebane min-h-screen-safe bg-hb-paper font-body text-hb-ink antialiased px-4 py-12";
export const HB_EYEBROW = "text-sm font-medium uppercase tracking-widest text-hb-rust";
export const HB_H1 = "font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl";
export const HB_LABEL = "mb-1.5 block text-xs font-medium text-hb-ink-soft";
export const HB_INPUT =
  "w-full rounded-hb border border-hb-line bg-hb-surface px-4 py-3 text-[15px] text-hb-ink placeholder:text-hb-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-hb-evergreen/40";
export const HB_INPUT_LAAST = "bg-hb-paper text-hb-ink-soft cursor-default";
