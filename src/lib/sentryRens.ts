/**
 * sentryRens — tokens ud af Sentry (rådets fund 2/10, punkt 7).
 *
 * Tre offentlige sider bærer legitimationen I URL'EN: `/ring-mig-op?t=…`
 * (ringToken: åbner «bed om et opkald» for én tilmelding), `/aftale?token=…`
 * (aftaletoken: åbner underskriften) og `/delt/webinar?t=…` (delingstoken:
 * åbner hele /webinar-billedet). Sentry samler URL'en ind mange steder —
 * `request.url`, transaktionens navn, navigations- og fetch-breadcrumbs,
 * spans' `http.url`/`url`. Et token i Sentry er et token hos en tredjepart.
 *
 * WEBINARMOTOREN (3/10-2026, CTO «RET FØRST» (1)): to veje mere.
 *   • `/w/<slug>?t=…` (og `/w/<slug>/tilmeld`, `/w/<slug>/kalender`) — deltagertokenet.
 *     MÅLT i src/pages/WebinarSide.tsx: rummet fjerner `?t=` med
 *     history.replaceState i en useEffect — EFTER første render, så Sentrys
 *     pageload-transaktion og den første navigations-breadcrumb har allerede
 *     set URL'en med tokenet; `/w/<slug>/kalender` fjerner det ALDRIG (den går
 *     straks videre med window.location.replace til `icsUrl`). Derfor er `/w/…`
 *     en token-sti — og `icsUrl`s mål, `/functions/v1/webinar-rum?handling=ics&t=…`,
 *     også.
 *   • `#wt=…` — deltagertokenet i FRAGMENTET fra exitrummets knap til /ansoeg
 *     (ansoegUrl). useWebinarForudfyld fjerner det ved mount, men igen EFTER første
 *     render. Fragmentet fjernes fra ENHVER streng, uanset sti (`FRAGMENT_MOENSTER`).
 *
 * Derfor går HELE hændelsen gennem `rensSentryHaendelse` i `beforeSend` OG
 * `beforeSendTransaction` (src/main.tsx): hver tekststreng, der indeholder en
 * af de tre stier med en query, får parametrene `t` og `token` fjernet; resten
 * af query'en står. `request.query_string` fjernes helt, når `request.url`
 * peger på en af stierne. Ren funktion, ingen Sentry-import — testet i
 * src/lib/__tests__/sentryRens.test.ts.
 *
 * Kaster aldrig: går vandringen galt, sendes hændelsen med det, der nåede at
 * blive renset (hellere en fejlrapport end ingen). Vandringen er bevidst simpel:
 * strenge, arrays og rene objekter, dybde ≤ 16; en klasse-instans røres ikke.
 */

/** Stierne med et token i query'en. */
export const TOKEN_STIER = ["/ring-mig-op", "/aftale", "/delt/webinar", "/w/<slug>", "/functions/v1/webinar-rum"] as const;
/** Parametrene, der fjernes på de stier. */
export const TOKEN_PARAMETRE = ["t", "token"] as const;

// Stien, efterfulgt af «?» og query'en (til # eller mellemrum/anførselstegn). «/aftaler?…»
// matcher IKKE: efter «/aftale» skal det næste tegn være «?».
// «/w/<slug>» med valgfri understi (tilmeld, kalender) — «/webinar?…» matcher IKKE (kræver «/w/»).
const MOENSTER = /(\/(?:ring-mig-op|aftale|delt\/webinar|w\/[^/?#\s"'<>]+(?:\/[a-z]+)?|functions\/v1\/webinar-rum))\?([^#\s"'<>]*)/g;
const STI_MOENSTER = /\/(?:ring-mig-op|aftale|delt\/webinar|w\/[^/?#\s"'<>]+(?:\/[a-z]+)?|functions\/v1\/webinar-rum)(?:\?|#|$)/;
/** Deltagertokenet i fragmentet (`#wt=…`, ansoegUrl) — fjernes fra enhver streng, uanset sti. */
export const FRAGMENT_MOENSTER = /#wt=[^\s"'<>&]*/g;

/** Én streng: fjern `#wt=…` overalt og t/token fra query'en efter en token-sti. Andet røres ikke. */
export function rensUrl(s: string): string {
  if (typeof s !== "string") return s;
  if (s.indexOf("#wt=") !== -1) s = s.replace(FRAGMENT_MOENSTER, "");
  if (s.indexOf("?") === -1) return s;
  return s.replace(MOENSTER, (_hel, sti: string, query: string) => {
    const dele = query.split("&").filter((d) => {
      if (d === "") return false;
      const navn = decodeURIComponentSikkert(d.split("=")[0]);
      return !(TOKEN_PARAMETRE as readonly string[]).includes(navn);
    });
    return dele.length ? `${sti}?${dele.join("&")}` : sti;
  });
}

function decodeURIComponentSikkert(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

const erTokenSti = (url: unknown): boolean => typeof url === "string" && STI_MOENSTER.test(url);

function vandr(v: unknown, dybde: number, set: WeakSet<object>): unknown {
  if (typeof v === "string") return rensUrl(v);
  if (!v || typeof v !== "object" || dybde > 16) return v;
  if (set.has(v as object)) return v;
  set.add(v as object);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = vandr(v[i], dybde + 1, set);
    return v;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v;
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) o[k] = vandr(o[k], dybde + 1, set);
  return o;
}

/** Hele Sentry-hændelsen (fejl eller transaktion) — muterer og returnerer den. */
export function rensSentryHaendelse<T>(haendelse: T): T {
  try {
    const h = haendelse as unknown as { request?: { url?: unknown; query_string?: unknown } };
    if (h && h.request && erTokenSti(h.request.url)) delete h.request.query_string;
    vandr(haendelse, 0, new WeakSet());
  } catch {
    /* kaster aldrig — se filhovedet */
  }
  return haendelse;
}
