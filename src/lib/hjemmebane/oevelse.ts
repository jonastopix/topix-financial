/**
 * src/lib/hjemmebane/oevelse.ts
 *
 * Handoutet som lektionens ØVELSE (1/10-2026 nat; Jonas 1/10 22:29–22:50:
 * «Handouts hører til Akademiet. … Vi skal passe på med ikke at forvirre
 * medlemmerne for meget med for mange områder … Enkelthed er et nøgleord.»).
 * Medlemmets menu har intet «Handouts»-punkt længere; handoutet nås fra den
 * lektion (ElementView) eller den samling (KursusView), der bærer modulet
 * (content_items.handout_module — koblingen fra kort 56, lektionerForModul).
 *
 * REN dom uden supabase-kald: fladerne giver medlemmets egen handouts-række
 * ind (getOwnHandout) og får ord og sti ud. Tabellen `handouts` røres ikke —
 * øvelsen ER handoutet, kun ordet og vejen ind er nye; udfyldningen sker
 * stadig i HbHandoutDetail på /handouts?module=<m> (ruten lever for gamle
 * links og mails, men står ikke i nogen medlemsmenu).
 *
 * MODULET `overordnet` ER IKKE EN ØVELSE: «Målsætning 12 mdr.» bor i Dine
 * mål («Jeres retning», /milestones — PR #1225). En lektion, der bærer det
 * (Start her's «Din målsætning»), henviser derhen i stedet (RETNING_*).
 * Dommen er erOevelse; ingen flade må vise overordnet som handout/øvelse
 * for et medlem (værn: handoutsIAkademiet.guard.test.ts).
 */

import { handoutConfigs, moduleOrder, type HandoutConfig, type HandoutModule } from "@/lib/handoutConfig";
import { calcHandoutProgress } from "@/lib/handoutUtils";
import { lektionerForModul, lektionsSti, type LektionRaekke } from "@/lib/hjemmebane/lektionerForModul";

/** Modulet, der er flyttet til Dine mål — aldrig en øvelse i Akademiet. */
export const RETNING_MODUL: HandoutModule = "overordnet";
export const RETNING_STI = "/milestones";
/** Ordene på en lektion, der bærer RETNING_MODUL (Start her: «Din målsætning»). */
export const RETNING_TEKST = {
  eyebrow: "Dine mål",
  titel: "Skriv jeres retning i Dine mål",
  brod: "Målsætningen for de næste 12 måneder bor ikke i Akademiet længere — den er jeres retning, og den skriver I under Dine mål.",
  knap: "Gå til Dine mål",
} as const;

/** Ordene på en øvelse — ét sted, så begge flader (lektion og samling) siger det samme. */
export const OEVELSE_EYEBROW = "Øvelse";

/** Et modul er en øvelse, når det er et kendt handout-modul og ikke retningen. */
export function erOevelse(modul: string | null | undefined): modul is HandoutModule {
  if (!modul) return false;
  return modul !== RETNING_MODUL && Object.prototype.hasOwnProperty.call(handoutConfigs, modul);
}

/** Vejen ind i udfyldningen — den eksisterende editor på /handouts?module=<m>
    (HandoutsView åbner detaljen direkte og sender medlemmet tilbage til
    lektionen; se oevelseTilbage). */
export function oevelseSti(modul: HandoutModule): string {
  return `/handouts?module=${modul}`;
}

export type OevelseTilstand = "ikke_startet" | "i_gang" | "udfyldt";

export interface OevelseRaekke {
  status: string | null;
  responses: unknown;
  checklist: unknown;
  levers: unknown;
}

export interface OevelseDom {
  tilstand: OevelseTilstand;
  /** 0–100, calcHandoutProgress — kun vist når øvelsen er i gang. */
  procent: number;
  /** «Ikke startet» · «I gang · 40 %» · «Udfyldt». */
  statusTekst: string;
  /** «Lav øvelsen» · «Fortsæt» · «Se dine svar». */
  knapTekst: string;
}

/** Status og knap af medlemmets egen række (null = ingen række endnu).
    `completed` vinder over procenten (medlemmet har selv markeret); en
    række med status in_progress er «i gang», også på 0 % — den findes. */
export function oevelseDom(raekke: OevelseRaekke | null | undefined, config: HandoutConfig): OevelseDom {
  if (!raekke || raekke.status === "not_started" || raekke.status == null) {
    return { tilstand: "ikke_startet", procent: 0, statusTekst: "Ikke startet", knapTekst: "Lav øvelsen" };
  }
  const procent = calcHandoutProgress(
    config,
    (raekke.responses as Record<string, string>) || {},
    (raekke.checklist as Record<string, boolean>) || {},
    (raekke.levers as string[]) || [],
  );
  if (raekke.status === "completed") {
    return { tilstand: "udfyldt", procent, statusTekst: "Udfyldt", knapTekst: "Se dine svar" };
  }
  return { tilstand: "i_gang", procent, statusTekst: `I gang · ${procent} %`, knapTekst: "Fortsæt" };
}

/** Samlingens øvelser: de moduler, samlingens elementer bærer — unikke, i
    moduleOrders rækkefølge (ikke elementernes, så to lektioner med samme
    modul giver én øvelse, og rækkefølgen er stabil). Retningen udelades. */
export function oevelserForSamling(
  elementer: readonly { item: { handout_module: string | null } }[],
): HandoutModule[] {
  const set = new Set(elementer.map((e) => e.item.handout_module).filter(erOevelse));
  return moduleOrder.filter((m) => set.has(m));
}

/** Hvor «Tilbage» fører hen fra udfyldningen, når medlemmet kom fra
    Akademiet: den første lektion, der bærer modulet (forløbsrækkefølge,
    lektionerForModul) — ellers Akademiets forside. Aldrig /handouts. */
export function oevelseTilbage(
  lektioner: readonly Pick<LektionRaekke, "area" | "slug" | "title">[],
): { to: string; label: string } {
  const foerste = lektioner[0];
  if (foerste) return { to: lektionsSti(foerste), label: foerste.title };
  return { to: "/akademiet", label: "Akademiet" };
}

/** Samme dom fra et helt katalog: stien til den lektion, der bærer modulet
    (forsidens løftestangs-punkt, nextStep (h)). Kataloget er fladens eget
    (useAkademiData, published og uden skjulte områder). */
export function oevelseLektionSti(katalog: readonly LektionRaekke[], modul: string): string {
  return oevelseTilbage(lektionerForModul(katalog, modul)).to;
}
