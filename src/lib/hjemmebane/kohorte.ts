/**
 * src/lib/hjemmebane/kohorte.ts
 *
 * Kohortelinjen på rådgiverens forside (Jonas 16/9, godkendt): «Nye
 * medlemmer (30 dage): N af M kom igen efter dag 1» — med navnene på dem
 * der ikke er kommet igen. Ren dom, ingen React, ingen Supabase — testet i
 * __tests__/kohorte.test.ts; hentningen bor i src/hooks/kohorte.ts og
 * fladen i RaadgiverForsideView (højre spalte, efter «Siden sidst»).
 *
 * REGLEN er nulpunktets (OVERLEVERING DEL 2 «16. september (nat)» §7,
 * målt 16/9 00:57 dansk; recon-kohorte-og-online.md §1), ordret fra SQL'en:
 *
 *   with start as (select cm.company_id, min(cm.created_at) as start_at
 *                  from public.company_members cm group by cm.company_id),
 *   kohorte as (select c.id, c.name, s.start_at,
 *                      (s.start_at at time zone 'Europe/Copenhagen')::date as start_dato
 *               from public.companies c join start s on s.company_id = c.id
 *               where c.er_kunde = true and c.is_legat = false and s.start_at >= …)
 *   … exists (select 1 from public.user_login_log l join medlemmer m on m.user_id = l.user_id
 *             where m.company_id = k.company_id
 *               and (l.logged_in_at at time zone 'Europe/Copenhagen')::date > k.start_dato …)
 *
 * Oversat:
 *   START     = første company_members.created_at pr. virksomhed — lib/ikkeIGang's
 *               anker («MEDLEMSKABET BEGYNDER ved første company_members-række»).
 *   KOHORTEN  = virksomheder med start inden for de sidste KOHORTE_DAGE døgn,
 *               erKunde (raadgiverensKunder, fail-open — nulpunktets SQL sagde
 *               strengt `= true`; fladen følger husets tællere) og ikke is_legat,
 *               og hvis STARTDAG (dansk dato) er FØR i dag. Startet i dag: de
 *               har ikke kunnet komme igen endnu — tælles i udeladtIDag, så M
 *               ikke snyder. Uden medlemmer: ingen start, ikke med.
 *   KOM IGEN  = mindst ét login (user_login_log.logged_in_at) af et af
 *               virksomhedens medlemmer på en DANSK dato efter startdagen.
 *               Dansk dato = samme nøgle som lib/maanedsnoegle (sv-SE i
 *               Europe/Copenhagen) — aldrig browserens lokale tid alene. Kl.
 *               00:30 dansk dagen efter (22:30 UTC samme dag i sommertid) er
 *               «dagen efter». Antallet af logins er ubrugeligt (reloads,
 *               sidstOnline.ts) — kun datoen bruges.
 *
 * ikkeKommetIgen er virksomhedsnavnene, ældste start først — dem rådgiveren
 * skal ringe til først.
 */

import { TZ } from "@/lib/maanedsnoegle";
import { erKunde } from "@/lib/raadgiverensKunder";

export const KOHORTE_DAGE = 30;
export const KOHORTE_VINDUE_MS = KOHORTE_DAGE * 24 * 60 * 60 * 1000;
export const KOHORTE_OVERSKRIFT = "Nye medlemmer (30 dage)";
export const INGEN_NYE_TEKST = "Ingen nye medlemmer de sidste 30 dage.";
/** Højst så mange navne på linjen; resten er «… og N mere». */
export const NAVNE_LOFT = 5;

/** "YYYY-MM-DD" for et tidspunkt set fra Danmark (samme form som maanedsNoegleKbh). */
export function dagsNoegleKbh(t: Date): string {
  return t.toLocaleDateString("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
}

export interface KohorteVirksomhed {
  id: string;
  name: string;
  is_legat: boolean | null;
  er_kunde?: boolean | null;
}

export interface KohorteMedlem {
  company_id: string;
  user_id: string;
  created_at: string;
}

export interface KohorteLogin {
  user_id: string;
  logged_in_at: string;
}

/** Én virksomhed på linjen: id til linket, navn til teksten. */
export interface KohorteVirksomhedRef {
  id: string;
  navn: string;
}

export interface KohorteInput {
  virksomheder: readonly KohorteVirksomhed[];
  /** ALLE virksomhedens rækker — ankeret er den første, ikke den seneste. */
  medlemmer: readonly KohorteMedlem[];
  logins: readonly KohorteLogin[];
  nu: Date;
}

export interface Kohortelinje {
  /** Kohorten: nye kunder med startdag før i dag. */
  m: number;
  /** Heraf kommet igen på en dansk dato efter startdagen. */
  n: number;
  /** Virksomhedsnavne, ældste start først. */
  ikkeKommetIgen: string[];
  /** (17/9, PR 3) samme virksomheder med id — så navnene kan linke til
      /virksomhed/{id}. Samme orden som ikkeKommetIgen. */
  ikkeKommetIgenVirksomheder: KohorteVirksomhedRef[];
  /** Nye der startede i dag (dansk dato) — ikke i M, fordi de ikke har kunnet komme igen endnu. */
  udeladtIDag: number;
}

function somDato(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function kohorteLinje(input: KohorteInput): Kohortelinje {
  const { virksomheder, medlemmer, logins, nu } = input;
  const idag = dagsNoegleKbh(nu);
  const vinduesStart = nu.getTime() - KOHORTE_VINDUE_MS;

  // Start pr. virksomhed = første company_members-række; medlemmerne pr. virksomhed.
  const start = new Map<string, Date>();
  const brugere = new Map<string, Set<string>>();
  for (const m of medlemmer) {
    const t = somDato(m.created_at);
    if (!t) continue;
    const eks = start.get(m.company_id);
    if (!eks || t.getTime() < eks.getTime()) start.set(m.company_id, t);
    let s = brugere.get(m.company_id);
    if (!s) brugere.set(m.company_id, (s = new Set()));
    s.add(m.user_id);
  }

  // Login-dage pr. bruger (dansk dato).
  const loginDage = new Map<string, Set<string>>();
  for (const l of logins) {
    const t = somDato(l.logged_in_at);
    if (!t) continue;
    let s = loginDage.get(l.user_id);
    if (!s) loginDage.set(l.user_id, (s = new Set()));
    s.add(dagsNoegleKbh(t));
  }

  let m = 0;
  let n = 0;
  let udeladtIDag = 0;
  const ikke: { id: string; navn: string; start: number }[] = [];

  for (const v of virksomheder) {
    if (v.is_legat === true) continue;
    if (!erKunde(v)) continue;
    const s = start.get(v.id);
    if (!s) continue; // uden medlemmer: ingen start
    if (s.getTime() < vinduesStart || s.getTime() > nu.getTime()) continue;
    const startdag = dagsNoegleKbh(s);
    if (startdag >= idag) {
      udeladtIDag += 1;
      continue;
    }
    m += 1;
    const ids = brugere.get(v.id) ?? new Set<string>();
    let komIgen = false;
    for (const id of ids) {
      const dage = loginDage.get(id);
      if (!dage) continue;
      for (const dag of dage) {
        if (dag > startdag) { komIgen = true; break; }
      }
      if (komIgen) break;
    }
    if (komIgen) n += 1;
    else ikke.push({ id: v.id, navn: v.name, start: s.getTime() });
  }

  ikke.sort((a, b) => a.start - b.start);
  return {
    m,
    n,
    ikkeKommetIgen: ikke.map((x) => x.navn),
    ikkeKommetIgenVirksomheder: ikke.map((x) => ({ id: x.id, navn: x.navn })),
    udeladtIDag,
  };
}

/** «3 af 5 kom igen efter dag 1» — eller den rolige tomme. */
export function kohorteTekst(l: Pick<Kohortelinje, "m" | "n">): string {
  if (l.m === 0) return INGEN_NYE_TEKST;
  return `${l.n} af ${l.m} kom igen efter dag 1`;
}

/** «(+ 2 startet i dag)» — null når ingen. */
export function startetIDagTekst(antal: number): string | null {
  return antal > 0 ? `(+ ${antal} startet i dag)` : null;
}

/** «Ikke kommet igen: A, B, C» — højst NAVNE_LOFT navne, ellers «… og N mere». null når ingen. */
export function ikkeKommetIgenTekst(navne: readonly string[]): string | null {
  if (navne.length === 0) return null;
  const viste = navne.slice(0, NAVNE_LOFT);
  const flere = navne.length - viste.length;
  return `Ikke kommet igen: ${viste.join(", ")}${flere > 0 ? ` … og ${flere} mere` : ""}`;
}

/** Samme linje i DELE (17/9, PR 3), så fladen kan tegne hvert navn som et
    link: præfikset, de viste virksomheder (højst NAVNE_LOFT) og antallet
    bag «… og N mere». Kommaerne er fladens, ikke linkenes. null når ingen.
    Kontrakt (låst i testen): ikkeKommetIgenDeleTekst(dele) === ikkeKommetIgenTekst(navne). */
export const IKKE_KOMMET_IGEN_PRAEFIKS = "Ikke kommet igen: ";
export interface IkkeKommetIgenDele {
  viste: KohorteVirksomhedRef[];
  flere: number;
}
export function ikkeKommetIgenDele(virksomheder: readonly KohorteVirksomhedRef[]): IkkeKommetIgenDele | null {
  if (virksomheder.length === 0) return null;
  const viste = virksomheder.slice(0, NAVNE_LOFT);
  return { viste, flere: virksomheder.length - viste.length };
}
/** «… og N mere» — tom når alle vises. */
export function ikkeKommetIgenHale(flere: number): string {
  return flere > 0 ? ` … og ${flere} mere` : "";
}
export function ikkeKommetIgenDeleTekst(dele: IkkeKommetIgenDele | null): string | null {
  if (!dele) return null;
  return `${IKKE_KOMMET_IGEN_PRAEFIKS}${dele.viste.map((v) => v.navn).join(", ")}${ikkeKommetIgenHale(dele.flere)}`;
}
