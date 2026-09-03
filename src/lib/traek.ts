/**
 * src/lib/traek.ts
 *
 * Det fejlede månedstræk som rådgiveren ser det på /members (3/9,
 * recon-traekflade). Datakilden er public.company_traek (#572): ét spor
 * pr. Stripe-faktura, `status = 'fejlet'` så længe trækket ikke er betalt
 * — betales det senere, opdaterer webhooken samme række til 'betalt', så
 * «der findes en fejlet række» ER dommen, ingen egen tæller.
 *
 * Rene funktioner (kun date-fns til datoformat), testet i
 * __tests__/traek.test.ts. Fladen viser; intet her rører tier eller adgang
 * — den grønne «til {måned}»-badge siger stadig at KONTRAKTEN løber, og
 * denne badge siger at et TRÆK er fejlet. De to står sammen med vilje.
 */
import { format } from "date-fns";
import { da } from "date-fns/locale";

/** De kolonner fladen læser fra company_traek (status = 'fejlet'). */
export interface FejletTraek {
  company_id: string;
  stripe_invoice_id: string;
  beloeb_oere: number;
  fejlet_at: string | null;
  forsoeg: number | null;
  naeste_forsoeg_at: string | null;
  fejl_kode: string | null;
  fejl_decline_code: string | null;
  fejl_besked: string | null;
  hosted_invoice_url: string | null;
  faktura_nummer: string | null;
  periode_start: string | null;
}

/** «13. sep.» — kort dansk dato til badge og detaljer. Null ved ugyldig/manglende. */
export function kortDato(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "d. MMM", { locale: da });
}

/** «13. sep. 2026 kl. 08:35» — til den udfoldede række. */
export function datoOgTid(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "d. MMM yyyy 'kl.' HH:mm", { locale: da });
}

/** 437500 → «4.375 kr.» — beløbet er inkl. moms (company_traek.beloeb_oere). */
export function beloebKr(oere: number): string {
  return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(oere / 100))} kr.`;
}

/**
 * Grupperer fejlede træk pr. virksomhed, nyeste først (fejlet_at faldende;
 * rækker uden fejlet_at sidst). Én virksomhed kan have flere åbne fejlede
 * fakturaer (to måneder i træk) — badgen viser den nyeste, den udfoldede
 * række viser alle.
 */
export function fejledeTraekPrVirksomhed(rows: readonly FejletTraek[]): Map<string, FejletTraek[]> {
  const sorteret = [...rows].sort((a, b) => {
    const ta = a.fejlet_at ? new Date(a.fejlet_at).getTime() : -Infinity;
    const tb = b.fejlet_at ? new Date(b.fejlet_at).getTime() : -Infinity;
    return tb - ta;
  });
  const map = new Map<string, FejletTraek[]>();
  for (const r of sorteret) {
    const liste = map.get(r.company_id) ?? [];
    liste.push(r);
    map.set(r.company_id, liste);
  }
  return map;
}

/**
 * Badgens tekst: hvad der ER sket, og hvornår Stripe prøver igen hvis
 * det er kendt. «Træk fejlede 13. sep. · prøver igen 17. sep.» Uden
 * næste forsøg: «Træk fejlede 13. sep. · ingen flere forsøg» — for det
 * er også noget der er sket: Stripe har givet op, og et menneske skal
 * tage fat. Flere fejlede: «2 træk fejlede …» med den nyeste dato.
 */
export function traekBadgeTekst(fejlede: readonly FejletTraek[]): string | null {
  if (fejlede.length === 0) return null;
  const nyeste = fejlede[0];
  const hvornaar = kortDato(nyeste.fejlet_at);
  const hoved = fejlede.length === 1 ? "Træk fejlede" : `${fejlede.length} træk fejlede`;
  const foerste = hvornaar ? `${hoved} ${hvornaar}` : hoved;
  const naeste = kortDato(nyeste.naeste_forsoeg_at);
  return naeste ? `${foerste} · prøver igen ${naeste}` : `${foerste} · ingen flere forsøg`;
}

/** «Stripe: Your card has insufficient funds. (insufficient_funds)» — eller kode alene, eller null. */
export function stripeSagde(t: Pick<FejletTraek, "fejl_besked" | "fejl_decline_code" | "fejl_kode">): string | null {
  const besked = (t.fejl_besked ?? "").trim();
  const kode = (t.fejl_decline_code ?? t.fejl_kode ?? "").trim();
  if (besked && kode) return `${besked} (${kode})`;
  if (besked) return besked;
  if (kode) return kode;
  return null;
}
