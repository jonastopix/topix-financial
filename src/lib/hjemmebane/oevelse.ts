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
import { AREAS } from "@/lib/hjemmebane/adminContentApi";
import { lektionerForModul, lektionsSti, type LektionRaekke } from "@/lib/hjemmebane/lektionerForModul";

/** Områderne, der HAR en side i Akademiet (AREAS.akademi) — kun de kan være
    et «Tilbage»-mål. Et modul kan bæres af en lektion i et område uden
    flade (talks, quick_wins …), og et link derhen ville ende i 404 /
    gaten i ElementView (rådets fund 10, 2/10). */
const AKADEMI_OMRAADER: ReadonlySet<string> = new Set(AREAS.filter((a) => a.akademi).map((a) => a.key));

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
/** En dryp-låst øvelse: kort uden knap og uden status (rådets fund 5, 2/10). */
export const OEVELSE_LAAST_TEKST = "Låses op med lektionen";
/** Knappen, før medlemmets egen række er hentet (hverken «Lav øvelsen» eller
    «Se dine svar» er sandt endnu — en udfyldt øvelse må ikke se ustartet ud). */
export const OEVELSE_KNAP_UAFGJORT = "Åbn øvelsen";

/** Et modul er en øvelse, når det er et kendt handout-modul og ikke retningen. */
export function erOevelse(modul: string | null | undefined): modul is HandoutModule {
  if (!modul) return false;
  return modul !== RETNING_MODUL && Object.prototype.hasOwnProperty.call(handoutConfigs, modul);
}

/** Afsenderen: den lektion, medlemmet kom fra — bæres i URL'en som
    `fra=<area>/<slug>` og VALIDERES mod kataloget i oevelseTilbage (aldrig
    en fri URL; rådets fund 4, 2/10). */
export interface OevelseAfsender {
  area: string;
  slug: string;
}

export function afsenderNoegle(fra: OevelseAfsender): string {
  return `${fra.area}/${fra.slug}`;
}

/** Vejen ind i udfyldningen — den eksisterende editor på /handouts?module=<m>
    (HandoutsView åbner detaljen direkte og sender medlemmet tilbage til
    lektionen; se oevelseTilbage). Med afsender: `&fra=<area>/<slug>`, så
    «Tilbage» fører til den lektion, medlemmet kom fra (samlingen giver
    ingen — der falder tilbage-linket på den første lektion). Parametret
    overlever reload og bogmærke: HandoutsView rydder det ikke for medlemmet. */
export function oevelseSti(modul: HandoutModule, fra?: OevelseAfsender | null): string {
  const sti = `/handouts?module=${modul}`;
  return fra ? `${sti}&fra=${encodeURIComponent(afsenderNoegle(fra))}` : sti;
}

/** `?module=` som modul: kun et kendt handout-modul — alt andet er null
    (medlemmet uden gyldigt modul sendes til Akademiet). */
export function modulFraParam(param: string | null | undefined): HandoutModule | null {
  if (!param) return null;
  return (moduleOrder as readonly string[]).includes(param) ? (param as HandoutModule) : null;
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

/** Om en samlings øvelse er låst op: ulåst, hvis BARE ÉN lektion i
    samlingen, der bærer modulet, er dryp-ulåst — ikke om nogen lektion i
    samlingen er det (rådets fund 5: en samling med én ulåst lektion låste
    før alle sine øvelser op). */
export function oevelseUlaastISamling(
  elementer: readonly { item: { handout_module: string | null }; drip: { unlocked: boolean } }[],
  modul: HandoutModule,
): boolean {
  return elementer.some((e) => e.item.handout_module === modul && e.drip.unlocked);
}

/** Hvor «Tilbage» fører hen fra udfyldningen, når medlemmet kom fra
    Akademiet: den lektion, afsenderen (`fra`) peger på, HVIS den står blandt
    modulets lektioner i et Akademi-område (valideret — aldrig en fri URL);
    ellers den første lektion, der bærer modulet (forløbsrækkefølge,
    lektionerForModul) — ellers Akademiets forside. Aldrig /handouts.
    Lektioner i områder uden Akademi-side (AREAS.akademi = false) tæller
    ikke — de har ingen flade at vende tilbage til. */
export function oevelseTilbage(
  lektioner: readonly Pick<LektionRaekke, "area" | "slug" | "title">[],
  fra?: string | null,
): { to: string; label: string } {
  const iAkademiet = lektioner.filter((l) => AKADEMI_OMRAADER.has(l.area));
  const afsender = fra ? iAkademiet.find((l) => afsenderNoegle(l) === fra) : undefined;
  const maal = afsender ?? iAkademiet[0];
  if (maal) return { to: lektionsSti(maal), label: maal.title };
  return { to: "/akademiet", label: "Akademiet" };
}

/** Samme dom fra et helt katalog: stien til den lektion, der bærer modulet
    (forsidens løftestangs-punkt, nextStep (h)). Kataloget er fladens eget
    (useAkademiData, published og uden skjulte områder). */
export function oevelseLektionSti(katalog: readonly LektionRaekke[], modul: string): string {
  return oevelseTilbage(lektionerForModul(katalog, modul)).to;
}
