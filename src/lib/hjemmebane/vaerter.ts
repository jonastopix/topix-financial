/**
 * src/lib/hjemmebane/vaerter.ts — værterne på et event
 * (medlemmets forside PR 4b, 17/9-2026 — Jonas ordret: «Ja events har vært
 * på. Og vi skal gerne kunne sætte flere værter på. Ofte er det både Morten
 * og Jonas. Og somme tider har vi gæster med. Altså gæsteværter. De er ikke
 * på platformen, men kunne være dejligt at markere når der kommer en
 * gæstevært.»)
 *
 * REN dom: ingen React, ingen Supabase. Kilden er tabellen event_vaerter
 * (migration 20260918130000) — én række pr. vært i rækkefølge: enten en
 * rådgiver på platformen (user_id → navn/portræt fra get_all_advisor_profiles
 * via ansigter.RaadgiverOpslag, PR 4) eller en gæstevært (gaest_navn, valgfri
 * titel og foto-sti i content-assets).
 *
 * VALG:
 *   - En rådgiver-vært hvis user_id ikke findes blandt rådgiverne (forladt
 *     platformen, mistet rollen) VISES IKKE — aldrig et gæt, aldrig et tomt
 *     navn. Gæster vises altid (de har navnet med sig).
 *   - Teksten: rådgivere med FORNAVN (som pushets «Fra Morten»), gæster med
 *     fuldt navn og mærket «gæstevært» foran: «Morten og Jonas»,
 *     «Morten, Jonas og gæstevært Mette Hansen». Dansk opremsning: a, b og c.
 *   - Admin-udkastet valideres her (validerVaerter), så formularen og
 *     databasens CHECK siger det samme: gæst uden navn er ugyldig, samme
 *     rådgiver højst én gang.
 * Testet i __tests__/vaerter.test.ts; kildeværn src/lib/__tests__/eventVaerter.guard.test.ts.
 */
import { fornavn, type RaadgiverOpslag } from "./ansigter";

/** Rækken som klienten læser den (event_vaerter). */
export interface VaertRaekke {
  id: string;
  event_id: string;
  user_id: string | null;
  gaest_navn: string | null;
  gaest_titel: string | null;
  gaest_foto_path: string | null;
  raekkefoelge: number;
}

/** Admin-udkastet — det formularen redigerer og gemmer (uden id/event_id). */
export interface VaertUdkast {
  user_id: string | null;
  gaest_navn: string | null;
  gaest_titel: string | null;
  gaest_foto_path: string | null;
}

/** Det fladen viser. */
export interface VaertVisning {
  key: string;
  userId: string | null;
  navn: string;
  fornavn: string;
  /** Rådgiverens portræt (profiles.avatar_url via RPC'en); gæster har fotoPath i stedet. */
  avatarUrl: string | null;
  /** Gæstens foto — en sti i content-assets, signeres af fladen. */
  fotoPath: string | null;
  gaest: boolean;
  titel: string | null;
}

export const GAESTEVAERT_MAERKE = "Gæstevært";
export const GAESTEVAERT_PRAEFIKS = "gæstevært";
export const VAERT_UDEN_NAVN_FEJL = "Gæsteværten mangler et navn";
export const VAERT_DUBLET_FEJL = "Samme rådgiver står to gange";

/** Rækkerne pr. event — til flader der viser flere events (forsidens «Kommende»). */
export function grupperVaerter(rows: readonly VaertRaekke[]): Map<string, VaertRaekke[]> {
  const m = new Map<string, VaertRaekke[]>();
  for (const r of rows) {
    const liste = m.get(r.event_id) ?? [];
    liste.push(r);
    m.set(r.event_id, liste);
  }
  return m;
}

/** Værterne for ét event i rækkefølge, opløst til visning. Ukendte rådgivere udelades. */
export function vaerterForEvent(rows: readonly VaertRaekke[], eventId: string, raadgivere: RaadgiverOpslag): VaertVisning[] {
  const egne = rows
    .filter((r) => r.event_id === eventId)
    .sort((a, b) => a.raekkefoelge - b.raekkefoelge || a.id.localeCompare(b.id));
  const ud: VaertVisning[] = [];
  for (const r of egne) {
    if (r.user_id) {
      const p = raadgivere.get(r.user_id);
      const navn = p?.full_name ?? null;
      const fn = fornavn(navn);
      if (!p || !navn || !fn) continue;
      ud.push({ key: r.id, userId: r.user_id, navn, fornavn: fn, avatarUrl: p.avatar_url, fotoPath: null, gaest: false, titel: null });
    } else {
      const navn = (r.gaest_navn ?? "").trim();
      const fn = fornavn(navn);
      if (!navn || !fn) continue;
      ud.push({ key: r.id, userId: null, navn, fornavn: fn, avatarUrl: null, fotoPath: r.gaest_foto_path?.trim() || null, gaest: true, titel: r.gaest_titel?.trim() || null });
    }
  }
  return ud;
}

/** Dansk opremsning: «a», «a og b», «a, b og c». */
export function daListe(dele: readonly string[]): string {
  if (dele.length === 0) return "";
  if (dele.length === 1) return dele[0];
  return `${dele.slice(0, -1).join(", ")} og ${dele[dele.length - 1]}`;
}

/** «Morten og Jonas» / «Morten, Jonas og gæstevært Mette Hansen» — null uden værter. */
export function vaerterTekst(vaerter: readonly VaertVisning[]): string | null {
  if (vaerter.length === 0) return null;
  return daListe(vaerter.map((v) => (v.gaest ? `${GAESTEVAERT_PRAEFIKS} ${v.navn}` : v.fornavn)));
}

/** Formularens dom — samme regler som databasens CHECK og unique index. Null = i orden. */
export function validerVaerter(udkast: readonly VaertUdkast[]): string | null {
  const set = new Set<string>();
  for (const v of udkast) {
    if (v.user_id) {
      if (set.has(v.user_id)) return VAERT_DUBLET_FEJL;
      set.add(v.user_id);
    } else if (!(v.gaest_navn ?? "").trim()) {
      return VAERT_UDEN_NAVN_FEJL;
    }
  }
  return null;
}

/** Flyt element `fra` ét trin op (-1) eller ned (+1); uden for kanten → uændret kopi. */
export function flyt<T>(liste: readonly T[], fra: number, retning: -1 | 1): T[] {
  const til = fra + retning;
  const ud = [...liste];
  if (fra < 0 || fra >= ud.length || til < 0 || til >= ud.length) return ud;
  [ud[fra], ud[til]] = [ud[til], ud[fra]];
  return ud;
}

/** Fra række til udkast (admin-formularen starter med det gemte). */
export function tilUdkast(r: VaertRaekke): VaertUdkast {
  return { user_id: r.user_id, gaest_navn: r.gaest_navn, gaest_titel: r.gaest_titel, gaest_foto_path: r.gaest_foto_path };
}
