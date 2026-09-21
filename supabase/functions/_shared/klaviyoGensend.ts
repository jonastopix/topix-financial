/**
 * klaviyoGensend — dommen over, hvilke fejlede Klaviyo-hændelser der sendes
 * igen (21/9-2026, recon-klaviyo-gensend.md + recon-gensender-foer-bygning.md).
 *
 * BAGGRUND: sporet `klaviyo_haendelser` bærer én række pr. FORSØG, og
 * delindekset `klaviyo_haendelser_udfald_idx where udfald <> 'ok'` var bygget
 * til en gensender, der ikke fandtes. Tirsdag 22/9 kl. 09 kører webinaret, og
 * eWebinar POSTer «WebinarFinished» for ~300 på få minutter, når det slutter;
 * ét 5xx fra Klaviyo i det minut
 * kostede den person hele efter-flowet — med kvittering, uden nogen læser.
 *
 * DEN GEMTE KROP SENDES UÆNDRET (`klaviyo_haendelser.sendt`): samme
 * unique_id, samme time, samme frisk. Klaviyo kasserer en dublet med samme
 * unique_id for samme profil og metric («only the first processed event will
 * be recorded», klaviyo.ts:24–27), så en gensendelse af noget, der faktisk
 * nåede frem, er harmløs. Intet backfill-flag — kroppen er den, der blev sendt.
 *
 * HVERT FORSØG ER EN NY RÆKKE. Ingen unikhedsregel, ingen opdatering af gamle
 * rækker (migration 20260919200000:15–19; klaviyo.guard dom 6). Sporet skal
 * vise hvert forsøg.
 *
 * REGLERNE (besluttet 21/9), hver med sin prøve i src/lib/__tests__/klaviyoGensend.test.ts:
 *   1. Grupperingen er (metric, email, unikt_id). Én ok-række gør gruppen færdig.
 *   2. Udfald: GENSENDES = timeout · fejl · loft · ingen_noegle · noegle_afvist.
 *      OPGIVES STRAKS = ugyldig (Klaviyo afviste kroppen; samme krop igen giver
 *      samme svar). IGNORERES HELT = ingen_mail, og rækker hvis `sendt` har
 *      nøglen ikke_sendt (der findes ingen krop at sende).
 *   3. Vindue: kun grupper, hvis FØRSTE forsøg er under VINDUE_TIMER (24 t)
 *      gammelt. Ældre grupper røres ikke — flowene reagerer alligevel kun på
 *      hændelser med `frisk`, og den er regnet ved første forsøg.
 *   4. Afstand: næste forsøg først, når sidste forsøg er mindst
 *      FOERSTE_AFSTAND_MIN · 2^(forsøg − 1) minutter gammelt. Se regnestykket
 *      ved konstanterne.
 *   5. Højst MAKS_FORSOEG forsøg i alt (det første + 5 gensendelser). Derefter
 *      er gruppen opgivet.
 *   6. Alarm (princip 1 — en klokke i browseren er ikke et signal): en gruppe,
 *      der er OPGIVET (forsøgene brugt, eller ugyldig), og en gruppe, hvis
 *      seneste udfald er ingen_noegle eller noegle_afvist (KONFIGURATION — det
 *      løser gensendelsen ikke), giver en mail til raadgiverModtager(nu) og en
 *      drift-klokke. Højst én mail pr. time: nøglen bærer dansk dato og time
 *      (alarmNoegle). Mailen lister de grupper, der har ÆNDRET sig inden for
 *      ALARM_VINDUE_MIN — ikke alt, der er opgivet i vinduet på 24 t.
 *
 * REN OG DENO-FRI: rækkerne og `nu` gives ind; her læses hverken database,
 * miljø eller ur. Tiden gives ind — den gættes ikke (tæller og nævner over
 * samme periode). Functionen klaviyo-gensend-cron er den eneste kalder.
 */
import { kbhDele } from "./hverdage.ts";

// ── Konstanterne ─────────────────────────────────────────────────────────────

/** Udfald, der sendes igen. Fejlen lå hos netværket, Klaviyo eller vores nøgle — ikke i kroppen. */
export const GENSEND_UDFALD = ["timeout", "fejl", "loft", "ingen_noegle", "noegle_afvist"] as const;
/** Udfald, der opgives straks: Klaviyo læste kroppen og afviste den. Samme krop igen giver samme svar. */
export const OPGIV_UDFALD = ["ugyldig"] as const;
/** Udfald, der er en KONFIGURATIONSFEJL hos os — de gensendes, men de gør det ikke selv: alarm. */
export const KONFIGURATION_UDFALD = ["ingen_noegle", "noegle_afvist"] as const;
/** Udfald, der ignoreres helt — der findes ingen krop at sende. */
export const IGNORER_UDFALD = ["ingen_mail"] as const;

/** Kun grupper, hvis FØRSTE forsøg er yngre end dette, røres. */
export const VINDUE_TIMER = 24;

/**
 * Højst seks forsøg i alt: det første + fem gensendelser.
 *
 * AFSTANDEN før forsøg nr. n+1, når n forsøg er gjort, er
 *   FOERSTE_AFSTAND_MIN · 2^(n − 1) minutter:
 *     n = 1 →  5 min     (5 · 2^0)
 *     n = 2 → 10 min     (5 · 2^1)
 *     n = 3 → 20 min     (5 · 2^2)
 *     n = 4 → 40 min     (5 · 2^3)
 *     n = 5 → 80 min     (5 · 2^4)
 *     n = 6 → opgivet    (MAKS_FORSOEG nået)
 *   I alt 5 + 10 + 20 + 40 + 80 = 155 minutter (TRAPPE_MINUTTER) fra første
 *   fejl til sidste forsøg — under tre timer, så tirsdagens storm efter
 *   webinaret kl. 09 er afgjort samme formiddag. Cronen kører hvert 5. minut, så det første
 *   gensendeforsøg ligger 5–10 minutter efter fejlen.
 */
export const MAKS_FORSOEG = 6;
export const FOERSTE_AFSTAND_MIN = 5;
export const TRAPPE_MINUTTER = 155;

/**
 * Alarmen tager KUN grupper, hvis sidste forsøg ligger inden for de sidste
 * ALARM_VINDUE_MIN minutter (grænsen er eksklusiv: præcis 60 min er ude).
 *
 * REGNESTYKKET: mailens nøgle er dansk dato og TIME, så et 60-minutters vindue
 * kan spænde over højst to timenøgler (fx 09:50 → 10:49 rammer «T09» og «T10»).
 * En ændring i en gruppe (sidste forsøg) giver derfor højst TO mails — én pr.
 * timenøgle, vinduet når. En opgivet gruppe alarmerer 1–2 gange og falder
 * derefter ud af alarmen, ikke hver time i de 24 timer, den står i sporet.
 * Tørkørslens svar viser stadig opgivet/konfiguration i fuld længde — det er
 * kun alarmen, der afgrænses.
 */
export const ALARM_VINDUE_MIN = 60;

/** Idempotensnøglens præfiks — resten er dansk dato og time («…:2026-09-22T09»). */
export const ALARM_NOEGLE_PRAEFIKS = "klaviyo-gensend-alarm:";
/** template_name i email_send_log og label hos Lovable. */
export const ALARM_MAIL_LABEL = "klaviyo-gensend-alarm";
/** Klokkens type — vagtens driftsbesked, som meta-annoncer-cron (klokke.ts viser 'drift' med mærket «Drift»). */
export const ALARM_KLOKKE_TYPE = "drift";

const MINUT_MS = 60_000;
const TIME_MS = 3_600_000;

/** Minutter, sidste forsøg skal være gammelt, før forsøg nr. (forsoeg + 1) må gå: 5 · 2^(forsoeg − 1). */
export function afstandMinutter(forsoeg: number): number {
  const n = Math.max(1, Math.floor(forsoeg));
  return FOERSTE_AFSTAND_MIN * 2 ** (n - 1);
}

// ── Typerne ──────────────────────────────────────────────────────────────────

/** Så meget af en række i klaviyo_haendelser, som dommen behøver. */
export interface GensendRaekke {
  id: string;
  /** ISO-tidsstempel (sendt_at). */
  sendt_at: string;
  metric: string;
  email: string;
  unikt_id: string;
  udfald: string;
  /** Kroppen, præcis som den blev sendt (jsonb). */
  sendt: unknown;
}

/** En gruppe = alle forsøg på samme (metric, email, unikt_id), ældst først. */
export interface Gruppe {
  metric: string;
  email: string;
  unikt_id: string;
  /** Antal forsøg gjort — rækker i gruppen. */
  forsoeg: number;
  foerste_at: string;
  sidste_at: string;
  sidste_udfald: string;
  /** Rækken, hvis krop sendes igen: det FØRSTE forsøg — originalen. */
  kilde_id: string;
  krop: unknown;
}

export interface Opgivet extends Gruppe {
  grund: "ugyldig" | "forsoeg_opbrugt";
}

export interface Udvalg {
  /** Sendes igen nu — afstanden er gået, forsøg er tilbage. */
  gensend: Gruppe[];
  /** Opgivet: alarm. Sendes ikke. */
  opgivet: Opgivet[];
  /** Seneste udfald er en konfigurationsfejl hos os: alarm. Står OGSÅ i gensend, hvis afstanden er gået. */
  konfiguration: Gruppe[];
  /** Det, der ikke blev til noget, med grund — så en tørkørsel siger HVORFOR. */
  ignoreret: {
    /** Gruppen har en ok-række — færdig. */
    ok: number;
    /** Afstanden er ikke gået endnu. */
    venter: number;
    /** Første forsøg er VINDUE_TIMER eller ældre. */
    for_gammel: number;
    /** Rækker (ikke grupper) med udfald ingen_mail. */
    ingen_mail: number;
    /** Rækker (ikke grupper), hvis krop bærer nøglen ikke_sendt. */
    ikke_sendt: number;
    /** Rækker med ubrugeligt sendt_at, eller grupper med et udfald, dommen ikke kender. */
    ubrugelig: number;
  };
  /** Grupper dømt (efter rækkefiltrene). */
  grupper: number;
}

// ── Dommen ───────────────────────────────────────────────────────────────────

function harNoeglenIkkeSendt(krop: unknown): boolean {
  return typeof krop === "object" && krop !== null && !Array.isArray(krop) && "ikke_sendt" in (krop as Record<string, unknown>);
}

function er<T extends readonly string[]>(liste: T, udfald: string): boolean {
  return (liste as readonly string[]).includes(udfald);
}

/**
 * Dommen. Ren: rækker og `nu` ind, udvalget ud. Rækkefølgen i `gensend` er
 * ældste første forsøg først, så en kørsel på budget tager de ældste først.
 */
export function vaelgGensendelser(raekker: readonly GensendRaekke[], nu: Date): Udvalg {
  const ud: Udvalg = {
    gensend: [],
    opgivet: [],
    konfiguration: [],
    ignoreret: { ok: 0, venter: 0, for_gammel: 0, ingen_mail: 0, ikke_sendt: 0, ubrugelig: 0 },
    grupper: 0,
  };
  const nuMs = nu.getTime();

  // Rækkefiltrene (regel 2, «ignoreres helt») — FØR grupperingen, så en
  // ingen_mail-række aldrig tæller som et forsøg på nogen gruppe.
  const grupper = new Map<string, (GensendRaekke & { ms: number })[]>();
  for (const r of raekker) {
    if (er(IGNORER_UDFALD, r.udfald)) { ud.ignoreret.ingen_mail++; continue; }
    if (harNoeglenIkkeSendt(r.sendt)) { ud.ignoreret.ikke_sendt++; continue; }
    const ms = Date.parse(r.sendt_at);
    if (!Number.isFinite(ms)) { ud.ignoreret.ubrugelig++; continue; }
    const noegle = `${r.metric}\u0000${r.email}\u0000${r.unikt_id}`;
    const liste = grupper.get(noegle) ?? [];
    liste.push({ ...r, ms });
    grupper.set(noegle, liste);
  }
  ud.grupper = grupper.size;

  const kandidater: { gruppe: Gruppe; venter: boolean }[] = [];
  for (const liste of grupper.values()) {
    liste.sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // Regel 1: én ok-række afslutter gruppen — uanset hvornår i rækken den ligger.
    if (liste.some((r) => r.udfald === "ok")) { ud.ignoreret.ok++; continue; }
    const foerste = liste[0];
    const sidste = liste[liste.length - 1];
    // Regel 3: vinduet måles på det FØRSTE forsøg. Grænsen er eksklusiv: præcis 24 t er for gammelt.
    if (nuMs - foerste.ms >= VINDUE_TIMER * TIME_MS) { ud.ignoreret.for_gammel++; continue; }

    const gruppe: Gruppe = {
      metric: foerste.metric,
      email: foerste.email,
      unikt_id: foerste.unikt_id,
      forsoeg: liste.length,
      foerste_at: foerste.sendt_at,
      sidste_at: sidste.sendt_at,
      sidste_udfald: sidste.udfald,
      kilde_id: foerste.id,
      krop: foerste.sendt,
    };

    // Regel 2, «opgives straks»: Klaviyo afviste kroppen. Alarm, ingen gensendelse.
    if (er(OPGIV_UDFALD, sidste.udfald)) { ud.opgivet.push({ ...gruppe, grund: "ugyldig" }); continue; }
    if (!er(GENSEND_UDFALD, sidste.udfald)) { ud.ignoreret.ubrugelig++; continue; }
    // Regel 5: forsøgene er brugt. Alarm, ingen gensendelse.
    if (liste.length >= MAKS_FORSOEG) { ud.opgivet.push({ ...gruppe, grund: "forsoeg_opbrugt" }); continue; }
    // Regel 6: konfigurationsfejl hos os — alarm, OG gensendelse (nøglen kan være rettet i mellemtiden).
    if (er(KONFIGURATION_UDFALD, sidste.udfald)) ud.konfiguration.push(gruppe);
    // Regel 4: afstanden måles på det SIDSTE forsøg. Grænsen er inklusiv: præcis 5 min er nok.
    const venter = nuMs - sidste.ms < afstandMinutter(liste.length) * MINUT_MS;
    kandidater.push({ gruppe, venter });
  }

  kandidater.sort((a, b) => Date.parse(a.gruppe.foerste_at) - Date.parse(b.gruppe.foerste_at));
  for (const k of kandidater) {
    if (k.venter) ud.ignoreret.venter++;
    else ud.gensend.push(k.gruppe);
  }
  return ud;
}

// ── Alarmen (regel 6) ────────────────────────────────────────────────────────

const to = (n: number) => String(n).padStart(2, "0");

/** «2026-09-22T09» — dansk dato og time for et tidspunkt. Én mail pr. time. */
export function danskDatoOgTime(nu: Date): string {
  const p = kbhDele(nu);
  return `${p.aar}-${to(p.maaned)}-${to(p.dag)}T${to(p.time)}`;
}

/** Idempotensnøglen for alarmmailen — og klokkens dedup går på titlen, som bærer samme dato og time. */
export function alarmNoegle(nu: Date): string {
  return `${ALARM_NOEGLE_PRAEFIKS}${danskDatoOgTime(nu)}`;
}

export interface AlarmGruppe {
  metric: string;
  email: string;
  udfald: string;
  forsoeg: number;
  /** «opgivet: forsoeg_opbrugt» · «opgivet: ugyldig» · «konfiguration». */
  art: string;
}

/**
 * Grupperne, alarmen skal liste — opgivet først, så konfiguration; ingen gruppe
 * to gange; KUN dem, hvis sidste forsøg ligger inden for ALARM_VINDUE_MIN (se
 * regnestykket ved konstanten). `nu` gives ind — tiden gættes ikke.
 */
export function alarmGrupper(u: Pick<Udvalg, "opgivet" | "konfiguration">, nu: Date): AlarmGruppe[] {
  const set = new Set<string>();
  const ud: AlarmGruppe[] = [];
  const nuMs = nu.getTime();
  const laeg = (g: Gruppe, art: string) => {
    const sidsteMs = Date.parse(g.sidste_at);
    if (!Number.isFinite(sidsteMs) || nuMs - sidsteMs >= ALARM_VINDUE_MIN * MINUT_MS) return;
    const n = `${g.metric}\u0000${g.email}\u0000${g.unikt_id}`;
    if (set.has(n)) return;
    set.add(n);
    ud.push({ metric: g.metric, email: g.email, udfald: g.sidste_udfald, forsoeg: g.forsoeg, art });
  };
  for (const g of u.opgivet) laeg(g, `opgivet: ${g.grund}`);
  for (const g of u.konfiguration) laeg(g, "konfiguration");
  return ud;
}

export interface AlarmTekst {
  emne: string;
  /** Klokkens titel — bærer dansk dato og time, så dedup giver én klokke pr. time. */
  titel: string;
  afsnit: string[];
  blokke: { overskrift: string; tekst: string }[];
  /** Ren tekst-udgaven af mailen. */
  tekst: string;
}

const UDFALD_ORD: Record<string, string> = {
  timeout: "Klaviyo svarede ikke inden for 3 s",
  fejl: "Klaviyo svarede med en fejl (5xx eller netværk)",
  loft: "Klaviyo afviste med 429 (loft)",
  ingen_noegle: "KLAVIYO_API_KEY mangler eller er ikke en privat nøgle (pk_)",
  noegle_afvist: "Klaviyo afviste nøglen (401/403)",
  ugyldig: "Klaviyo afviste kroppen (400/422)",
};

/** Teksterne til mail og klokke. Ren; rammen (indgangsMailHtml) lægges på i functionen. */
export function alarmTekst(grupper: readonly AlarmGruppe[], nu: Date): AlarmTekst {
  const tid = danskDatoOgTime(nu);
  const [dato, time] = tid.split("T");
  const n = grupper.length;
  const hvad = n === 1 ? "1 Klaviyo-hændelse" : `${n} Klaviyo-hændelser`;
  const emne = `${hvad} kunne ikke sendes — gensenderen har brug for et menneske`;
  const titel = `Klaviyo: ${hvad} kunne ikke sendes (${dato} kl. ${time})`;
  const opgivne = grupper.filter((g) => g.art.startsWith("opgivet")).length;
  const konfiguration = grupper.filter((g) => g.art === "konfiguration").length;
  const afsnit = [
    `Gensenderen (klaviyo-gensend-cron) har ${opgivne === 1 ? "opgivet 1 hændelse" : `opgivet ${opgivne} hændelser`}` +
      (konfiguration > 0 ? ` og ser ${konfiguration === 1 ? "1 hændelse" : `${konfiguration} hændelser`}, der fejler på nøglen` : "") +
      ". Personerne er ikke kommet ind i Klaviyo-flowene.",
    "Opgivet = seks forsøg uden svar, eller Klaviyo afviste kroppen. Nøglefejl = KLAVIYO_API_KEY mangler, er forkert eller afvist — det retter ingen gensendelse; ret secret'en i Lovable, så tager næste kørsel dem.",
  ];
  const blokke = grupper.map((g) => ({
    overskrift: `${g.metric} · ${g.email}`,
    tekst: `${g.art} · ${g.forsoeg} forsøg · seneste udfald: ${g.udfald} — ${UDFALD_ORD[g.udfald] ?? g.udfald}`,
  }));
  const tekst = [
    ...afsnit,
    "",
    ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`),
    "",
    "Sporet: klaviyo_haendelser (udfald <> 'ok', de sidste 24 timer). Gensend i hånden: SELECT public.kald_edge('klaviyo-gensend-cron', '{\"dry_run\": false}'::jsonb, 60000);",
  ].join("\n");
  return { emne, titel, afsnit, blokke, tekst };
}
