/**
 * webinarMailLoft — hvor mange mails cronen må FORSØGE i én kørsel (29/9-2026).
 *
 * SPEJL af supabase/functions/_shared/webinarMailLoft.ts. Kroppen efter dette
 * filhoved er ORDRET ens (paritetsprøven src/lib/__tests__/webinarMailLoft.paritet.test.ts
 * sammenligner tegn for tegn OG svarene på samme input). Nul imports i begge.
 *
 * Hvorfor et spejl: cronen afgør, hvor mange den sender; fladen skal kunne
 * vise loftet og pausen med samme regnestykke — og prøverne kører i vitest,
 * hvor Deno ikke findes. Grunden til loftet står i Deno-filens hoved.
 */

// ── Konstanterne ─────────────────────────────────────────────────────────────

/**
 * Probationen er ophævet (Mailgun, Nick Schafer, til Jonas 29/9-2026 kl. 22:26):
 * "After reviewing the account in detail, we have removed the sending
 * limitation, and now the account is fully enabled. This means that your
 * emails will no longer be restricted to 100 per hour; other associated
 * restrictions have been removed as well." Før det: "Your account is on
 * probation and domains are limited to 100 messages / hour" (29/9), og loftet
 * var 100 − 10 = 90.
 *
 * 1000 er JONAS' tal (29/9: den skal kunne sende 1000 ad gangen), IKKE en
 * grænse Mailgun har skrevet. Mailguns dokumentation (målt 29/9-2026) angiver
 * INGEN timegrænse for en fuldt aktiveret konto: help.mailgun.com «Why does my
 * account have an hourly sending limitation?» nævner kun 100/time som eksempel
 * på en midlertidig grænse, og documentation.mailgun.com siger blot "Mailgun
 * does have rate limits in place to protect our system" (send-http) og API'et
 * "500 requests every 10 seconds" (rate-limits-and-quotas). Derfor er 1000 et
 * eget sikkerhedsloft, ikke Mailguns.
 *
 * Regnestykket: den første hele hold-mail, «syv_dage» 6/10 kl. 08:00, går til
 * ca. 217. 217 ≤ 1000, så loftet bremser den ikke; hvor mange EN kørsel når,
 * afgør tidsbudgettet (BUDGET_MS i webinar-mail-cron), ikke dette tal. Loftet
 * er stadig en bremse, hvis Mailgun alligevel siger stop: et 403/420/429 i
 * vinduet giver PAUSEN og bruddet i løkken, uændret.
 */
export const MAILGUN_LOFT_PR_TIME = 1000;

/** Vinduet, forsøgene tælles i: de sidste 60 minutter. Grænsen er eksklusiv — præcis 60 min er ude. */
export const LOFT_VINDUE_MS = 60 * 60_000;

/** Efter et stop fra Mailgun venter vi timen ud, regnet fra det nyeste stop. */
export const LOFT_PAUSE_MS = 60 * 60_000;

/**
 * Statuskoderne, hvor Mailgun har sagt STOP (alle tre målt 29/9 kl. 08–10):
 *   403  «Your account is on probation and domains are limited to 100 messages / hour»
 *   420  «recipient limit (26) exceeded»
 *   429  «request limit (101) exceeded»
 * Et 403 kan OGSÅ være en afvist nøgle — og en afvist nøgle bliver ikke god af
 * flere kald i samme kørsel. Derfor stopper den også, uanset hvad Mailgun
 * skrev. MÆRKATEN (loft eller noegle_afvist) afgøres af svarteksten i
 * mailgunAfsendelse.ts (doemMailgunSvar); denne dom læser KUN statuskoden.
 * Teksten står i webinar_mails.svar.
 */
export const STOP_STATUSSER: readonly number[] = [403, 420, 429];

export function erStopStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && STOP_STATUSSER.includes(status);
}

// ── Dommen ───────────────────────────────────────────────────────────────────

/** Så lidt af en række i webinar_mails, som dommen behøver. */
export interface LoftRaekke {
  /** ISO-tidsstempel. */
  forsoegt_at: string;
  udfald: string;
  status: number | null;
}

export interface KoerselsLoft {
  /** Hvor mange kald denne kørsel højst må gøre hos Mailgun. */
  maks: number;
  /** Sat, når Mailgun har sagt stop inden for vinduet: send intet før `til`. */
  pause: null | { grund: string; til: Date };
}

/**
 * Hvor mange mails må denne kørsel FORSØGE?
 *
 *   maks  = max(0, loft − antal forsøg de sidste 60 min)
 *   pause = når en række i vinduet har status 403, 420 eller 429: maks er 0, og
 *           `til` er den NYESTE sådanne rækkes forsoegt_at + 60 min. Mailgun
 *           har sagt stop; vi venter timen ud i stedet for at holde spærringen
 *           i live med nye kald.
 *
 * ALLE FORSØG TÆLLER — ikke kun ok. Et afvist kald er stadig et kald hos
 * Mailgun (request-loftet tæller kald, ikke leverede mails). Også et forsøg,
 * der aldrig nåede Mailgun (ingen_noegle), tæller: det er ét tal, ikke tre
 * regler, og at tælle for MEGET fejler i den sikre retning — vi sender højst
 * nogle mails en kørsel senere. At tælle for LIDT fejler i den farlige: vi
 * rammer loftet igen og forlænger spærringen. Et ulæseligt forsoegt_at tæller
 * som «nu» af samme grund.
 *
 * `seneste` er rækkerne fra webinar_mails inden for vinduet; kalderen må gerne
 * give flere med — dommen afgrænser selv på `nu`. Tiden gives ind.
 */
export function beregnKoerselsLoft(i: { seneste: readonly LoftRaekke[]; loft: number; nu: Date }): KoerselsLoft {
  const nuMs = i.nu.getTime();
  let forsoeg = 0;
  let stopMs: number | null = null;
  let stopStatus: number | null = null;
  for (const r of i.seneste) {
    const ms = Date.parse(r.forsoegt_at);
    const t = Number.isFinite(ms) ? ms : nuMs;
    if (nuMs - t >= LOFT_VINDUE_MS) continue;
    forsoeg++;
    if (erStopStatus(r.status) && (stopMs === null || t > stopMs)) {
      stopMs = t;
      stopStatus = r.status;
    }
  }
  if (stopMs !== null) {
    return {
      maks: 0,
      pause: {
        grund: `Mailgun svarede ${stopStatus} kl. ${new Date(stopMs).toISOString()} — venter timen ud`,
        til: new Date(stopMs + LOFT_PAUSE_MS),
      },
    };
  }
  // Et loft, der ikke er et tal, er nul: fail-closed.
  const loft = Number.isFinite(i.loft) ? Math.floor(i.loft) : 0;
  return { maks: Math.max(0, loft - forsoeg), pause: null };
}
