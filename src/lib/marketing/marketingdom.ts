/**
 * dom — ÉN dør ind til lag 6. Læses af et menneske, bruges af en maskine.
 *
 * Måling (`maalingsdom`), minde (`minde`) og grænse (`doemBudget`) hører
 * sammen: ingen af dem må bruges uden de to andre. Et tal uden sit niveau er
 * en konklusion, der ikke bærer; et niveau uden mindet foreslår det, der blev
 * prøvet i sidste måned; og et minde uden grænsen tillader tre ændringer på en
 * uge, hvorefter ingen kan sige hvad der virkede. Derfor samles de her, og
 * derfor er `doemMarketing` den eneste indgang lag 4 og 5 skal kende.
 *
 * `somTekst` er ikke en rapport — det er den SAMME dom, skrevet ud. Maskinen
 * læser felterne, mennesket læser teksten, og de kan ikke komme til at sige
 * noget forskelligt, fordi der kun er ét sted, tallene kommer fra.
 *
 * REKKEFØLGEN I TEKSTEN ER EN DEL AF DOMMEN: forbeholdene står ØVERST. En
 * advarsel under tabellen bliver læst efter beslutningen er truffet.
 *
 * Ren dom. Ingen IO. Lag 5 henter, lag 4 handler.
 */
import { doemMaaling, VINDUER_TIMER, type MaalingsInput, type Maalingsdom, type Niveau } from "./maalingsdom";
import { doemBudget, doemMinde, erProevetFoer, type Aendring, type Aendringsbudget, type SessionTid, type Sporraekke } from "./minde";

export interface Marketingdom {
  niveau: Niveau;
  maaling: Maalingsdom;
  minde: Aendring[];
  budget: Aendringsbudget;
  /** Alt der skal stå FØR et tal. Måling og minde samlet, i den rækkefølge. */
  advarsler: string[];
  /** Må der overhovedet anbefales noget nu? Det korte svar. */
  maaAnbefales: boolean;
}

/**
 * Hele dommen. Sessionerne udledes af deltagerne — de er de samme sessioner,
 * målingen tæller, og to kilder til «hvor mange webinarer» ville før eller
 * siden være uenige.
 */
export function doemMarketing(ind: MaalingsInput, spor: readonly Sporraekke[], nu: Date = new Date()): Marketingdom {
  const maaling = doemMaaling(ind, nu);
  const sessioner = new Map<string, SessionTid>();
  for (const d of ind.deltagere) {
    if (typeof d.session_id === "string" && d.session_id !== "" && !sessioner.has(d.session_id)) {
      sessioner.set(d.session_id, { session_id: d.session_id, session_tid: d.session_tid });
    }
  }
  const minde = doemMinde(spor, [...sessioner.values()]);
  const budget = doemBudget(minde, maaling.niveau.niveau);
  return {
    niveau: maaling.niveau.niveau,
    maaling,
    minde,
    budget,
    advarsler: [...maaling.advarsler, budget.saetning],
    maaAnbefales: maaling.niveau.niveau !== "observation" && budget.tilbage > 0,
  };
}

/**
 * Er forslaget nyt, og må det overhovedet stilles nu? Ét svar, så lag 4 ikke
 * skal huske at spørge om begge dele.
 */
export function maaForeslaas(felter: readonly string[], d: Marketingdom): { ja: boolean; grund: string } {
  if (d.budget.tilbage === 0) return { ja: false, grund: d.budget.saetning };
  const foer = erProevetFoer(felter, d.minde);
  if (foer !== null) {
    return { ja: false, grund: `Det er prøvet før: «${foer.hvad}» ${foer.dato}. ${foer.saetning}` };
  }
  return { ja: true, grund: `Der må ændres én ting, og ${felter.join(" + ")} er ikke prøvet før.` };
}

/** Dommen som læsbar tekst. Forbeholdene FØRST, tallene bagefter. */
export function somTekst(d: Marketingdom): string {
  const l: string[] = [];
  for (const a of d.advarsler) l.push(`⚠︎ ${a}`);
  l.push("");
  l.push(`NIVEAU: ${d.niveau} · ${d.maaling.sessioner} ${d.maaling.sessioner === 1 ? "webinar" : "webinarer"}`);
  l.push("");
  l.push("MAILENE");
  for (const m of d.maaling.mails) {
    l.push(`  ${m.trin}. ${m.mail_navn} — ${m.modtaget} modtog`);
    l.push(`     åbnede:     ${m.aabnet.saetning}`);
    l.push(`     klikkede:   ${m.klikket.saetning}`);
    const v = VINDUER_TIMER[1];
    l.push(`     ansøgte ${v}t: ${m.ansoegteInden[v].saetning}`);
    l.push(`     blev medlem: ${m.blevMedlem.saetning}`);
  }
  if (d.maaling.mails.length === 0) l.push("  (ingen udsendelser målt endnu)");
  l.push("");
  l.push("HVORNÅR DE ANSØGER");
  l.push(`  ${d.maaling.tid.saetning}`);
  if (d.maaling.tid.antal > 0 && d.maaling.tid.medianTimer !== null) {
    l.push(`  kvartiler: ${Math.round(d.maaling.tid.p25Timer ?? 0)} / ${Math.round(d.maaling.tid.medianTimer)} / ${Math.round(d.maaling.tid.p75Timer ?? 0)} timer`);
  }
  l.push("");
  l.push("HVILKEN MAIL GIK FORUD");
  for (const f of d.maaling.forud) l.push(`  ${f.mail_navn}: ${f.antal}`);
  if (d.maaling.forud.length === 0) l.push("  (ingen ansøgninger at føre tilbage endnu)");
  if (d.maaling.forud.length > 0) l.push(`  NB: ${d.maaling.forud[0].forbehold}`);
  l.push("");
  l.push("PRØVET FØR");
  for (const a of d.minde) l.push(`  ${a.saetning}`);
  if (d.minde.length === 0) l.push("  (intet ændret endnu)");
  return l.join("\n");
}
