/**
 * _shared/alarmPeriode.ts — hvilken måned må et MEDLEM få en alarm for?
 * (16/9-2026, valg B). Ren: ingen Supabase, ingen Deno-API — vitest læser
 * den direkte (src/lib/__tests__/alarmPeriode.test.ts). Måneds-nøglen er
 * husets (maanedsnoegle.ts: dansk tid, samme regel som resolveren og
 * instruks F).
 *
 * JONAS 16/9 (ordret): «Der skal satme ikke sendes så meget. Og slet ikke
 * for gamle rapporter.» Baggrund (recon-mailkoe-alarmer.md §2-§3): Lisbeth
 * Gade godkendte fire historiske måneder 12:29–12:36 og fik «Bankovertræk
 * i Maj 2026» (14:20) og «… Juni 2026» (14:25) på mail; fire mere
 * (februar, marts, juli, august) blev stemplet uden mail i hånden 15:29.
 * detect-financial-alerts kørte pr. godkendt måned uden nogen regel om
 * «kun den seneste» — historik gav en alarm pr. gammel måned.
 *
 * REGLEN: et medlem får KUN en alarm for den SENESTE AFSLUTTEDE måned set
 * fra Danmark (i september: august; den 1/10 kl. 00:00 dansk: september) —
 * og kun i klokken, aldrig som mail (detect-financial-alerts stempler
 * rækken email_sent_at ved skrivning). Rådgiverne ser de rå alarmer for
 * alle måneder som i dag (uændret).
 *
 * FORMEN på period_key er «YYYY-MM» (financial_report_facts; CHECK
 * '^\d{4}-(0[1-9]|1[0-2])$' på manual_report_period_key, 20260310074139:5;
 * to_char(…, 'YYYY-MM') i 20260316122231:121). Alt andet → aldrig alarm
 * (fail-closed: en nøgle vi ikke forstår er ikke «den seneste måned»).
 */
import { afsluttedeMaanederFoer, maanedsNoegleKbh } from "./maanedsnoegle.ts";

export const PERIOD_KEY_FORM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** «YYYY-MM» for den seneste afsluttede måned set fra Danmark: 16/9-2026 → «2026-08»; 5/1-2026 → «2025-12». */
export function senesteAfsluttedeMaaned(nu: Date): string {
  return afsluttedeMaanederFoer(maanedsNoegleKbh(nu), 1)[0];
}

/** Må medlemmet få en alarm for perioden? Kun når den ER den seneste afsluttede måned. */
export function skalMedlemsAlarm(periodKey: string | null | undefined, nu: Date): boolean {
  const noegle = (periodKey ?? "").trim();
  if (!PERIOD_KEY_FORM.test(noegle)) return false;
  return noegle === senesteAfsluttedeMaaned(nu);
}
