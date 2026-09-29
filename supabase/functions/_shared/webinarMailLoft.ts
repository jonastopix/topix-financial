/**
 * webinarMailLoft — hvor mange mails cronen må FORSØGE i én kørsel (29/9-2026).
 *
 * HVORFOR DEN FINDES (Jonas 29/9, ~/Downloads/recon-webinar-mail-throttle.md):
 * 29/9 kl. 08:09 sendte webinar-mail-cron «fjorten_dage» til 319. Mailgun-
 * kontoen er på probation med 100 mails i timen; ca. 108 gik igennem, og de
 * 211 andre blev forsøgt igen ved HVER af de elleve kørsler i timen — 2.125
 * forsøg — fordi løkken hverken havde en grænse eller et stop, og sporet kun
 * læste udfald = 'ok'. Mailgun svarede 403 («on probation»), 420 («recipient
 * limit (26) exceeded») og 429 («request limit (101) exceeded») og spærrede
 * kontoen.
 *
 * DOMMEN er ét tal og én pause ud af de sidste 60 minutters spor — se
 * beregnKoerselsLoft. Den rører IKKE doemSvar og mærkaterne (mailgunAfsendelse.ts),
 * nåden (webinarMailDom.ts) eller cron-skemaet.
 *
 * REN OG DENO-FRI, spejlet ORDRET i src/lib/webinar/mailLoft.ts
 * (paritetsprøven src/lib/__tests__/webinarMailLoft.paritet.test.ts). Nul
 * imports i begge. Tiden gives ind som `nu` — den gættes ikke.
 */

// ── Konstanterne ─────────────────────────────────────────────────────────────

/**
 * Mailguns probation-loft er 100/time (Mailgun 29/9: "Your account is on
 * probation and domains are limited to 100 messages / hour"). 100 − 10 = 90:
 * margen, fordi Mailguns time ikke nødvendigvis falder sammen med vores
 * 60-minutters vindue. Rettes, når Mailgun oplyser loftet efter godkendelsen.
 */
export const MAILGUN_LOFT_PR_TIME = 90;

/** Vinduet, forsøgene tælles i: de sidste 60 minutter. Grænsen er eksklusiv — præcis 60 min er ude. */
export const LOFT_VINDUE_MS = 60 * 60_000;

/** Efter et stop fra Mailgun venter vi timen ud, regnet fra det nyeste stop. */
export const LOFT_PAUSE_MS = 60 * 60_000;

/**
 * Statuskoderne, hvor Mailgun har sagt STOP (alle tre målt 29/9 kl. 08–10):
 *   403  «Your account is on probation and domains are limited to 100 messages / hour»
 *   420  «recipient limit (26) exceeded»
 *   429  «request limit (101) exceeded»
 * 403 er i doemSvar OGSÅ en afvist nøgle (noegle_afvist) — og en afvist nøgle
 * bliver ikke god af 190 kald mere i samme kørsel. Derfor stopper den også.
 * Dommen læser KUN statuskoden; teksten står i webinar_mails.svar.
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
