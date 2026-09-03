/**
 * src/lib/hjemmebane/communityMedlemmer.ts
 *
 * Dommene bag medlemssporet i Community (CommunityMedlemmer.tsx) — rene
 * funktioner, ingen React, ingen Supabase. Testet i
 * __tests__/communityMedlemmer.test.ts.
 *
 * Jonas 3/9: «præsentation af sig selv skal ligge som en sidebar i sig
 * selv inde i Community, så det ikke bare larmer i et langt feed og
 * forsvinder — for så kan man ikke finde tilbage til hinanden.»
 *
 * NETVÆRKET ER PRÆSENTATIONEN (migration 20260810200000: «Et netværk
 * bruges kun, hvis man ved hvem man skal SPØRGE — ikke hvem folk er»).
 * Sporet bygger derfor på Netværkets egne data (get_member_directory via
 * listMemberDirectory) og linker til /medlemmer/{id} — ingen ny
 * datamodel, ingen ny RPC.
 *
 * HVEM: alle medlemmer, ikke rådgivere. 26 er få nok til at «alle» er
 * det rigtige — et udvalg (nyeste, tilfældige) ville gøre det umuligt at
 * finde TILBAGE til én bestemt, og det er hele ærindet. Rådgiverne står
 * under egen hårstreg på /medlemmer og hører ikke til i et spor om at
 * medlemmerne finder hinanden.
 *
 * RÆKKEFØLGE: dem med profiltekst (ask_me_about) først, alfabetisk
 * inden for hver gruppe — man skal kunne se hvem man kan SPØRGE, før
 * man ser hvem der endnu ikke har sagt noget. Ingen skjules: de fleste
 * har ikke udfyldt endnu (tjeklistens «Din profil»), og et skjult
 * medlem kan man ikke finde tilbage til.
 *
 * DIG SELV: den indloggede løftes ud af listen og vises øverst som eget
 * kort — med egen tekst, eller med opfordringen til at udfylde
 * (MemberProfileViews formulering, link til /settings).
 */

import { uddrag } from "./uddrag";

/** Det sporet læser af en MemberProfile — et snit, så testene kan bygge rækker uden hele typen. */
export interface SporMedlem {
  user_id: string;
  full_name: string;
  company_name: string | null;
  industry_label: string | null;
  ask_me_about: string | null;
  working_on: string | null;
  is_advisor: boolean;
}

export interface MedlemsSpor<T extends SporMedlem> {
  /** Den indloggede, når vedkommende står i Netværket (rådgivere gør ikke → null). */
  mig: T | null;
  /** Alle andre medlemmer, profiltekst først, alfabetisk inden for gruppen. */
  andre: T[];
}

/** Teaserens øvre længde: én linje-og-lidt i en 288 px kolonne ved 12 px. */
export const TEASER_MAKS_TEGN = 80;

/** Har medlemmet sagt noget om sig selv — ask_me_about er det bærende felt. */
export function harProfiltekst(m: Pick<SporMedlem, "ask_me_about">): boolean {
  return (m.ask_me_about ?? "").trim() !== "";
}

const sammenlignNavn = (a: SporMedlem, b: SporMedlem): number =>
  a.full_name.localeCompare(b.full_name, "da");

export function ordnMedlemsSpor<T extends SporMedlem>(
  profiler: readonly T[],
  mitUserId: string | null | undefined,
): MedlemsSpor<T> {
  const medlemmer = profiler.filter((p) => !p.is_advisor);
  const mig = mitUserId ? medlemmer.find((p) => p.user_id === mitUserId) ?? null : null;
  const andre = medlemmer
    .filter((p) => p.user_id !== mitUserId)
    .sort((a, b) => {
      const da = harProfiltekst(a) ? 0 : 1;
      const db = harProfiltekst(b) ? 0 : 1;
      return da - db || sammenlignNavn(a, b);
    });
  return { mig, andre };
}

/** «{virksomhed} · {branche}» — samme metalinje som ProfileCard på /medlemmer. */
export function medlemMetaLinje(m: Pick<SporMedlem, "company_name" | "industry_label">): string | null {
  const linje = [m.company_name, m.industry_label].filter(Boolean).join(" · ");
  return linje === "" ? null : linje;
}

/**
 * Rækkens undertekst: hvad man kan spørge om (ask_me_about), ellers hvad
 * vedkommende arbejder med lige nu (working_on) — ÉN sætning, højst
 * TEASER_MAKS_TEGN, aldrig klippet midt i et ord (uddrag-motoren).
 * Null når begge er tomme: rækken bærer så kun navn og virksomhed.
 */
export function medlemTeaser(m: Pick<SporMedlem, "ask_me_about" | "working_on">): string | null {
  const kilde = (m.ask_me_about ?? "").trim() || (m.working_on ?? "").trim();
  if (kilde === "") return null;
  const u = uddrag(kilde, TEASER_MAKS_TEGN, 1);
  return u.tekst === "" ? null : u.tekst;
}
