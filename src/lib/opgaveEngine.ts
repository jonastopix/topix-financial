/** Opgave-motoren (opgave-model fase 1, motor-først jf.
    docs/opgave-model-design.md §5): ren TypeScript — ingen side-effekter,
    ingen supabase-import, ingen React. Implementerer B1/B2/B6/B7/B8/B10/B11
    og tilstandsskemaet i §7; reglerne kommer derfra, ikke herfra.
    Alle datoer ind og ud som Date. "Nu" er altid en eksplicit parameter —
    aldrig new Date() inde i motoren. Mutationsfunktioner muterer aldrig
    input og kaster aldrig: de returnerer et diskrimineret resultat. */

/** §7: de syv besluttede tilstande plus overgangsværdierne open/parked,
    som fjernes i spor 2 efter datamigreringen af de 70 eksisterende rækker. */
export type OpgaveStatus =
  | "proposed"
  | "active"
  | "done"
  | "not_done"
  | "dropped"
  | "dismissed"
  | "expired"
  | "open"
  | "parked";

/** De fem sluttilstande — luk() accepterer kun disse som udfald. */
export type SlutUdfald = "done" | "not_done" | "dropped" | "dismissed" | "expired";

/** CHECK-constrainten på company_actions.source_type efter
    20260822220000_opgave_model_kolonner.sql. */
export type OpgaveSourceType =
  | "ai_weekly"
  | "milestone"
  | "handout"
  | "manual"
  | "agent"
  | "advisor"
  | "reflection";

/** company_actions-rækken som motoren ser den: samtlige kolonner efter
    opgave-model-migrationen, med alle tidsfelter som Date.
    user_id er medlemmet der ejer opgaven; proposed_by er den der foreslog
    (NULL = system/AI) — to forskellige mennesker, to kolonner (§7). */
export interface Opgave {
  id: string;
  company_id: string;
  user_id: string;
  title: string;
  context: string | null;
  priority: string;
  source_type: OpgaveSourceType;
  source_id: string | null;
  status: OpgaveStatus;
  week_key: string | null;
  generated_at: Date | null;
  created_at: Date;
  updated_at: Date;
  /** Overflødiggjort af closed_at, men bliver liggende urørt (§7). */
  completed_at: Date | null;
  /** Overflødiggjort af closed_at, men bliver liggende urørt (§7). */
  dismissed_at: Date | null;
  due_date: Date | null;
  accepted_at: Date | null;
  deferral_count: number;
  expires_at: Date | null;
  closed_at: Date | null;
  proposed_by: string | null;
}

export type OpgaveResultat = { ok: true; opgave: Opgave } | { ok: false; grund: string };

/** due_date er en date-kolonne — forfald regnes derfor i hele kalenderdage
    i lokal tid: en opgave med frist i dag er ikke forfalden endnu. */
function dagVaerdi(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

function laegDageTil(d: Date, dage: number): Date {
  const ny = new Date(d.getTime());
  ny.setDate(ny.getDate() + dage);
  return ny;
}

const OVERGANGE: Record<OpgaveStatus, OpgaveStatus[]> = {
  proposed: ["active", "dismissed", "expired"],
  // active -> active er udskydelsen (B11).
  active: ["done", "not_done", "dropped", "active"],
  done: [],
  not_done: [],
  dropped: [],
  dismissed: [],
  expired: [],
  // Overgangsværdier: motoren tager ikke stilling til dem før
  // datamigreringen i spor 2 har oversat dem.
  open: [],
  parked: [],
};

export function lovligeOvergange(status: OpgaveStatus): OpgaveStatus[] {
  return [...(OVERGANGE[status] ?? [])];
}

/** B10: udløbsfrist pr. kilde. Kilder uden egen frist falder tilbage på
    14 dage — samme levetid som ugefokus. */
const UDLOEBSDAGE: Partial<Record<OpgaveSourceType, number>> = {
  advisor: 30,
  reflection: 21,
  ai_weekly: 14,
  agent: 14,
};

export function beregnUdloeb(sourceType: OpgaveSourceType, oprettet: Date): Date {
  return laegDageTil(oprettet, UDLOEBSDAGE[sourceType] ?? 14);
}

/** B1/B6: accept er to handlinger — sig ja, og vælg hvornår. Kun lovligt
    fra proposed; datoen skal være i dag eller senere. */
export function accepter(opgave: Opgave, dueDate: Date, nu: Date): OpgaveResultat {
  if (opgave.status !== "proposed") {
    return { ok: false, grund: `kan ikke acceptere fra status '${opgave.status}' — kun fra 'proposed' (B1)` };
  }
  if (dagVaerdi(dueDate) < dagVaerdi(nu)) {
    return { ok: false, grund: "due date ligger i fortiden (B3/B6)" };
  }
  return {
    ok: true,
    opgave: { ...opgave, status: "active", accepted_at: new Date(nu.getTime()), due_date: new Date(dueDate.getTime()) },
  };
}

/** B7/B11: "ikke endnu" er aftagende. Kun fra active og kun når fristen
    er passeret. Første udskydelse: 14 dage fra det øjeblik medlemmet
    svarer ("nu"), nyDato ignoreres — regnet fra due_date kunne den nye
    frist lande i fortiden. Anden: medlemmet vælger selv datoen. Tredje:
    ulovlig — opgaven skal lukkes. */
export function udskyd(opgave: Opgave, nu: Date, nyDato?: Date): OpgaveResultat {
  if (opgave.status !== "active") {
    return { ok: false, grund: `kun aktive opgaver kan udskydes (status er '${opgave.status}')` };
  }
  if (opgave.due_date == null) {
    return { ok: false, grund: "aktiv opgave uden due_date — bryder B3" };
  }
  if (!erForfalden(opgave, nu)) {
    return { ok: false, grund: "opgaven er ikke forfalden endnu — udskydelse sker ved forfald (B2)" };
  }
  if (opgave.deferral_count >= 2) {
    return { ok: false, grund: "tredje udskydelse er ikke tilladt — opgaven skal lukkes (B7)" };
  }

  let nyDueDate: Date;
  if (opgave.deferral_count === 0) {
    nyDueDate = laegDageTil(nu, 14);
  } else {
    if (nyDato == null) {
      return { ok: false, grund: "anden udskydelse kræver en valgt dato (B11)" };
    }
    if (dagVaerdi(nyDato) < dagVaerdi(nu)) {
      return { ok: false, grund: "ny dato ligger i fortiden (B3)" };
    }
    nyDueDate = new Date(nyDato.getTime());
  }

  return {
    ok: true,
    opgave: { ...opgave, status: "active", due_date: nyDueDate, deferral_count: opgave.deferral_count + 1 },
  };
}

/** Lukker opgaven med et af de fem udfald og stempler closed_at.
    Lovligheden afgøres af lovligeOvergange — done/not_done/dropped kræver
    active, dismissed/expired kræver proposed. */
export function luk(opgave: Opgave, udfald: SlutUdfald, nu: Date): OpgaveResultat {
  if (!lovligeOvergange(opgave.status).includes(udfald)) {
    return { ok: false, grund: `overgangen '${opgave.status}' -> '${udfald}' er ikke lovlig` };
  }
  return { ok: true, opgave: { ...opgave, status: udfald, closed_at: new Date(nu.getTime()) } };
}

/** B2: aktiv opgave hvis kalenderdag er passeret. Frist i dag = ikke
    forfalden endnu. */
export function erForfalden(opgave: Opgave, nu: Date): boolean {
  return opgave.status === "active" && opgave.due_date != null && dagVaerdi(nu) > dagVaerdi(opgave.due_date);
}

/** B8: forslag hvis expires_at-tidspunkt er passeret. expires_at er en
    timestamptz, så her sammenlignes på tidspunkt, ikke kalenderdag. */
export function erUdloebet(opgave: Opgave, nu: Date): boolean {
  return opgave.status === "proposed" && opgave.expires_at != null && nu.getTime() > opgave.expires_at.getTime();
}

export interface Tilstandssammenfatning {
  antalAktive: number;
  antalForfaldne: number;
  /** Forslag der stadig venter på svar (proposed, ikke udløbet endnu). */
  antalUbesvaredeForslag: number;
  /** Forslag der aldrig blev besvaret: status expired plus proposed hvor
      expires_at er passeret men cron endnu ikke har lukket rækken. */
  antalUdloebneForslag: number;
  /** created_at for det ældste forslag der stadig venter på svar. */
  aeldsteUbesvaredeForslag: Date | null;
  lukkede: Record<SlutUdfald, number>;
}

/** Sammenfatning til tilstandslaget i fase 2: hvad skylder virksomheden
    lige nu, og hvordan er det hidtil endt. */
export function opgoerTilstand(opgaver: Opgave[], nu: Date): Tilstandssammenfatning {
  const sammenfatning: Tilstandssammenfatning = {
    antalAktive: 0,
    antalForfaldne: 0,
    antalUbesvaredeForslag: 0,
    antalUdloebneForslag: 0,
    aeldsteUbesvaredeForslag: null,
    lukkede: { done: 0, not_done: 0, dropped: 0, dismissed: 0, expired: 0 },
  };

  for (const opgave of opgaver) {
    if (opgave.status === "active") {
      sammenfatning.antalAktive += 1;
      if (erForfalden(opgave, nu)) sammenfatning.antalForfaldne += 1;
    } else if (opgave.status === "proposed") {
      if (erUdloebet(opgave, nu)) {
        sammenfatning.antalUdloebneForslag += 1;
      } else {
        sammenfatning.antalUbesvaredeForslag += 1;
        if (
          sammenfatning.aeldsteUbesvaredeForslag == null ||
          opgave.created_at.getTime() < sammenfatning.aeldsteUbesvaredeForslag.getTime()
        ) {
          sammenfatning.aeldsteUbesvaredeForslag = new Date(opgave.created_at.getTime());
        }
      }
    } else if (opgave.status in sammenfatning.lukkede) {
      sammenfatning.lukkede[opgave.status as SlutUdfald] += 1;
      if (opgave.status === "expired") sammenfatning.antalUdloebneForslag += 1;
    }
    // open/parked tælles bevidst ikke med — de oversættes i spor 2.
  }

  return sammenfatning;
}
