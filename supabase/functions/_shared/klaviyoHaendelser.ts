/**
 * De tre hændelser platformen sender til Klaviyo (udkast 19/9-2026) — lag 2.
 *
 * DE MÅ ALDRIG STOPPE EN ANSØGNING ELLER EN BETALING. Hver afsendelse er
 * fail-soft hele vejen: mangler nøglen, sker der intet (og det er ikke en
 * fejl); fejler Klaviyo, logges det og kalderen går videre; fejler selve
 * logningen, går kalderen ALLIGEVEL videre. Der findes ingen sti herfra, hvor
 * en exception kan nå ud til en ansøger eller en Stripe-webhook.
 *
 * Huset har ingen baggrundskø (`waitUntil` bruges ingen steder, målt 19/9), så
 * kaldet er synkront med `TIMEOUT_MS` = 3 s som loft. Det er prisen, og den er
 * bevidst: en mistet hændelse er værre end tre sekunder, men en tabt betaling
 * er værre end begge dele.
 *
 * DUBLETTER LØSES AF KLAVIYO, IKKE AF OS. Hver hændelse bærer VORES eget id som
 * `unique_id`, og Klaviyo dokumenterer: gentages den for samme profil og
 * metric, «only the first processed event will be recorded». Derfor kan
 * stripe-webhookens gensendelser og en genindsendt ansøgning kalde frit — uden
 * at vi selv skal føre en huskeliste. Uden `unique_id` ville Klaviyo falde
 * tilbage på tid med sekundpræcision, og to hændelser i samme sekund ville
 * blive til én.
 */
import { kald, type KlaviyoSpor } from "./klaviyo.ts";

/** Metric-navnene i Klaviyo. Ændres de, skifter hændelserne navn i alle flows. */
export const HAENDELSE = {
  paabegyndt: "Ansoegning paabegyndt",
  sendt: "Ansoegning sendt",
  medlem: "Blev medlem",
  // Fremmøde (19/9): TO navne, ikke tre. 75 %-grænsen ligger bevidst IKKE i
  // navnet — den er vores dom, den er flyttet én gang før, og i et metric-navn
  // ville den være støbt fast hos Klaviyo. Tallet sendes som `set_procent`.
  // Se _shared/webinarHaendelser.ts.
  deltog: "Deltog i webinar",
  moedteIkke: "Moedte ikke op",
} as const;
export type Haendelsesnavn = (typeof HAENDELSE)[keyof typeof HAENDELSE];

export interface HaendelseInput {
  metric: Haendelsesnavn;
  email: string;
  /** VORES id. Klaviyos dubletnøgle sammen med profil + metric. */
  uniktId: string;
  egenskaber?: Record<string, unknown>;
  /** Hvornår hændelsen SKETE hos os — ikke hvornår vi nåede at sende den. */
  tid?: Date;
}

/**
 * Kroppen, præcis som Klaviyo dokumenterer den. Ren funktion — hele formen kan
 * prøves uden at røre netværket, og en ændring i Klaviyos skema bliver en rød
 * prøve i stedet for en tavs 400'er.
 *
 * `null` og `undefined` i egenskaberne udelades: et tomt felt i Klaviyo bliver
 * til et segment, der matcher «har ingen branche», og det er ikke det samme
 * som «vi ved det ikke».
 */
export function byggHaendelse(i: HaendelseInput): Record<string, unknown> {
  const egenskaber: Record<string, unknown> = {};
  for (const [n, v] of Object.entries(i.egenskaber ?? {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    egenskaber[n] = v;
  }
  return {
    data: {
      type: "event",
      attributes: {
        properties: egenskaber,
        time: (i.tid ?? new Date()).toISOString(),
        unique_id: i.uniktId,
        metric: { data: { type: "metric", attributes: { name: i.metric } } },
        profile: { data: { type: "profile", attributes: { email: i.email.trim().toLowerCase() } } },
      },
    },
  };
}

/** Så lidt af Supabase-klienten som sporet behøver — så filen kan prøves uden en rigtig. */
export interface SporSkriver {
  from(tabel: string): { insert(raekke: unknown): PromiseLike<{ error: { message: string } | null }> };
}

export interface Afsendelse {
  sendt: boolean;
  spor: KlaviyoSpor;
}

/**
 * Send én hændelse og skriv sporet. KASTER ALDRIG.
 *
 * Sporet skrives OGSÅ når nøglen mangler og når Klaviyo afviser — det er hele
 * pointen: når lag 3's agent senere skriver til Klaviyo, skal alt kunne læses
 * bagud, også det der ikke blev til noget.
 */
/** Kan mailen bære en Klaviyo-profil? Profilen findes på mailen; uden den er der ingen modtager. */
export function brugbarMail(email: string | null | undefined): string | null {
  const m = typeof email === "string" ? email.trim().toLowerCase() : "";
  return m !== "" && m.includes("@") ? m : null;
}

/** Skriv sporet. KASTER ALDRIG — en fejlet logning må ikke vælte kalderen. */
async function skrivSpor(
  skriver: SporSkriver | null,
  i: HaendelseInput,
  spor: KlaviyoSpor,
  krop: unknown,
): Promise<void> {
  if (!skriver) return;
  try {
    const { error } = await skriver.from("klaviyo_haendelser").insert({
      metric: i.metric,
      email: (typeof i.email === "string" ? i.email : "").trim().toLowerCase(),
      unikt_id: i.uniktId,
      udfald: spor.udfald,
      status: spor.status,
      varighed_ms: spor.varighed_ms,
      sendt: krop,
      svar: spor.svar,
      grund: spor.grund,
    });
    if (error) console.error(`[klaviyo] sporet kunne ikke skrives for ${i.metric}/${i.uniktId}:`, error.message);
  } catch (e) {
    console.error(`[klaviyo] sporet kastede for ${i.metric}/${i.uniktId}:`, e);
  }
}

export async function sendHaendelse(
  skriver: SporSkriver | null,
  noegle: string | null | undefined,
  i: HaendelseInput,
  valg: Parameters<typeof kald>[2] = {},
): Promise<Afsendelse> {
  // UDEN MAIL SENDES DER INTET — MEN DER LOGGES (19/9 kl. 22.30).
  // Før returnerede kaldet i tavshed, og nul rækker kunne betyde både «intet
  // skete» og «intet KUNNE ske». De to har helt forskellige årsager, og det
  // kostede en kodelæsning at skelne dem. Rækken bærer hvad vi VILLE have
  // sendt, så det er læsbart bagud hvad der manglede.
  const mail = brugbarMail(i.email);
  if (mail === null) {
    const spor: KlaviyoSpor = {
      udfald: "ingen_mail",
      metode: "POST",
      sti: "/events/",
      status: null,
      svar: null,
      grund: "ingen mailadresse — Klaviyos profil findes på mailen, så der er ingen modtager",
      varighed_ms: 0,
    };
    await skrivSpor(skriver, i, spor, { ikke_sendt: "ingen_mail", metric: i.metric, unique_id: i.uniktId });
    console.error(`[klaviyo] ${i.metric}/${i.uniktId} ikke sendt: ingen mailadresse`);
    return { sendt: false, spor };
  }

  const krop = byggHaendelse({ ...i, email: mail });
  const svar = await kald(noegle, "/events/", { ...valg, metode: "POST", krop });
  await skrivSpor(skriver, i, svar.spor, krop);
  if (!svar.ok && svar.spor.udfald !== "ingen_noegle") {
    console.error(`[klaviyo] ${i.metric} ikke sendt (${svar.spor.udfald}): ${svar.spor.grund ?? ""}`);
  }
  return { sendt: svar.ok, spor: svar.spor };
}

// ── De tre, med deres egenskaber ───────────────────────────────────────────

/** «Ansoegning paabegyndt» — fra ansoegning-gem «opret». Unikt id: ansøgningens id. */
export function paabegyndt(ansoegningId: string, email: string, kilde: string | null, tid?: Date): HaendelseInput {
  return { metric: HAENDELSE.paabegyndt, email, uniktId: ansoegningId, egenskaber: { kilde }, tid };
}

/**
 * «Ansoegning sendt» — fra registrerIndsendelse. Unikt id: ansøgningens id.
 * SAMME id som «paabegyndt», men en anden metric — og Klaviyos dubletnøgle er
 * (profil, metric, unique_id), så de to støder ikke sammen.
 */
export function sendt(
  ansoegningId: string,
  email: string,
  e: { kilde: string | null; branche: string | null; omsaetningsinterval: string | null; antal_ansatte: number | null },
  tid?: Date,
): HaendelseInput {
  return { metric: HAENDELSE.sendt, email, uniktId: ansoegningId, egenskaber: { ...e }, tid };
}

/**
 * «Blev medlem» — fra stripe-webhook, når kontrakten skrives. Unikt id:
 * virksomhedens id + periodens slutdato. Så giver en gensendelse af samme
 * betaling det SAMME id (Klaviyo tæller det én gang), mens en fornyelse næste
 * år giver et nyt — og det ER en ny hændelse.
 */
export function blevMedlem(companyId: string, periodeSlut: string, email: string, prisniveauOere: number | null, tid?: Date): HaendelseInput {
  return {
    metric: HAENDELSE.medlem,
    email,
    uniktId: `${companyId}:${periodeSlut}`,
    egenskaber: { prisniveau_kr: prisniveauOere === null ? null : Math.round(prisniveauOere / 100) },
    tid,
  };
}
