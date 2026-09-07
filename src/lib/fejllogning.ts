/**
 * Global fejllogning for TanStack Query — gør fejl SYNLIGE, ikke mere.
 *
 * MÅLT 7/9 (recon-tavse-fejl.md): App.tsx havde `new QueryClient()` uden
 * QueryCache/MutationCache, og Sentry.captureException blev kaldt ét
 * sted i hele src/ (ErrorBoundary). En query-fejl kastes aldrig ud i
 * React-træet, så INGEN query- eller mutationsfejl var nogensinde logget
 * — sendt-loggens `.order("sent_at")` fejlede med 400 i et halvt år
 * uden et spor nogen steder.
 *
 * HVAD DEN GØR: QueryCache.onError og MutationCache.onError (App.tsx)
 * kalder logQueryFejl / logMutationFejl, som skriver til konsollen med
 * husets præfiks-form (`console.error("[X] …", err)`) og sender fejlen
 * til Sentry i SAMME form som ErrorBoundary (Sentry.captureException),
 * med nøglen som tag og extra, så fejlen kan findes.
 *
 * HVAD DEN IKKE GØR: ingen throwOnError, ingen ændret retry, ingen
 * toasts. Brugeren ser præcis det samme som før. Det er en anden
 * beslutning.
 *
 * Sentry er kun `enabled` i PROD (main.tsx:24); i udvikling er konsollen
 * den eneste kanal — derfor begge.
 *
 * HVORNÅR DEN FYRER: QueryCache.onError fyrer én gang pr. fetch der
 * ender i fejl — altså EFTER TanStacks standard-genforsøg (3 forsøg med
 * 1 s, 2 s, 4 s ventetid, ca. 7 s), og igen ved hver ny fetch (remount,
 * vinduesfokus, invalidering). MutationCache.onError fyrer én gang pr.
 * fejlet mutation (mutationer genforsøges ikke). Sentrys browser-SDK
 * dedupliker identiske fejl i træk.
 *
 * bygFejlkontekst er ren (ingen I/O) og testet; de to log-funktioner er
 * tynde og kaldes kun fra App.tsx (låst af fejllogning.guard-testen).
 */
import * as Sentry from "@sentry/react";

export type Fejlkilde = "query" | "mutation";

export interface Fejlkontekst {
  /** Konsollens præfiks i husets form: «[QueryCache]» / «[MutationCache]». */
  praefiks: string;
  /** Nøglen som læsbar streng — «["admin-email-log","all","all",0]» — eller «(uden nøgle)». */
  noegle: string;
  /** Sentry-tags: filtrerbare, korte (Sentry klipper tags ved 200 tegn). */
  tags: { kilde: Fejlkilde; noegle: string };
  /** Sentry-extra: hele nøglen som JSON og fejlens besked. */
  extra: { noegle: unknown; besked: string };
}

/** Fejlens besked uden at antage at det er en Error — Supabase giver
    ofte et objekt { message, code, details }. */
export function fejlbesked(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
}

/** Nøglen som kort streng til tag og præfiks. JSON, klippet til 200 tegn. */
export function beskrivNoegle(noegle: unknown): string {
  if (noegle == null) return "(uden nøgle)";
  let s: string;
  try {
    s = JSON.stringify(noegle);
  } catch {
    s = String(noegle);
  }
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

export function bygFejlkontekst(kilde: Fejlkilde, noegle: unknown, error: unknown): Fejlkontekst {
  const kort = beskrivNoegle(noegle);
  return {
    praefiks: kilde === "query" ? "[QueryCache]" : "[MutationCache]",
    noegle: kort,
    tags: { kilde, noegle: kort },
    extra: { noegle: noegle ?? null, besked: fejlbesked(error) },
  };
}

function log(kilde: Fejlkilde, noegle: unknown, error: unknown): void {
  const k = bygFejlkontekst(kilde, noegle, error);
  // Konsollen — husets form: præfiks i klammer, så tekst, så fejlobjektet.
  console.error(`${k.praefiks} ${kilde === "query" ? "queryFn" : "mutationFn"} fejlede for ${k.noegle}:`, error);
  // Sentry — samme kald som ErrorBoundary, med kontekst så den kan findes.
  Sentry.captureException(error, { tags: k.tags, extra: k.extra });
}

export function logQueryFejl(error: unknown, queryKey: unknown): void {
  log("query", queryKey, error);
}

export function logMutationFejl(error: unknown, mutationKey: unknown): void {
  log("mutation", mutationKey, error);
}
