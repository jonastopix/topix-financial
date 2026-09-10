/**
 * _shared/reviewPaamindelse.ts — hvem skal have «{periode} — gennemgå dine
 * tal» når måneden er omme (10/9-2026, de-tyve nr. 10). REN; testet i
 * src/lib/__tests__/reviewPaamindelse.test.ts.
 *
 * extract-financial-data skriver notifikationen ÉN gang, ved parsingen, og
 * kun når resolveren siger eligible. En rapport uploadet i sin egen måned er
 * i regel 6 («ikke afsluttet») i det øjeblik — så den fik aldrig beskeden,
 * heller ikke da måneden var omme. Cron'en report-review-cron spørger
 * resolveren igen for parsede rapporter uden facts, og skriver den samme
 * besked (samme type, prioritet, tekst og dedup_key) for dem der nu kan
 * godkendes. Dedup gør en gentagelse harmløs.
 */
import { erMaanedAfsluttet } from "./maanedsnoegle.ts";

export interface ReviewKandidat {
  report_id: string;
  user_id: string | null;
  company_id: string | null;
  file_name: string | null;
  /** Resolverens svar. */
  eligible: boolean;
  state: string | null;
  period_key: string | null;
  period_label: string | null;
}

export type ReviewDom =
  | { skal: true; grund: "klar" }
  | { skal: false; grund: "ingen_bruger" | "ikke_afsluttet" | "ikke_eligible" | "blokeret" };

/** Dommen pr. kandidat: bruger, måned omme (dansk tid), resolveren eligible, ikke blokeret. */
export function afgoerReviewPaamindelse(k: ReviewKandidat, nu: Date): ReviewDom {
  if (!k.user_id) return { skal: false, grund: "ingen_bruger" };
  if (!erMaanedAfsluttet(k.period_key, nu)) return { skal: false, grund: "ikke_afsluttet" };
  if (!k.eligible) return { skal: false, grund: "ikke_eligible" };
  if (k.state === "blocked") return { skal: false, grund: "blokeret" };
  return { skal: true, grund: "klar" };
}

/** Samme besked som parsingen skriver (extract-financial-data:1808-1822) — ordret, samme dedup. */
export function reviewBesked(k: Pick<ReviewKandidat, "report_id" | "period_label" | "company_id">) {
  return {
    type: "report_review_ready",
    priority: "action_required" as const,
    title: k.period_label ? `${k.period_label} — gennemgå dine tal` : "Din rapport er klar til gennemsyn",
    body: k.period_label
      ? `Vi har trukket tallene ud fra din ${k.period_label}-rapport. Gennemgå og godkend dem — det tager under 1 minut. Herefter aktiveres din AI-analyse.`
      : "Vi har behandlet din rapport. Gennemgå tallene og godkend dem for at aktivere din AI-analyse.",
    reference_type: "report",
    reference_id: k.report_id,
    deep_link: `/reports?reportId=${k.report_id}`,
    company_id: k.company_id ?? undefined,
    dedup_key: `report_review_ready:${k.report_id}`,
  };
}
