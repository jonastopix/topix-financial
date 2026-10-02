// _shared/tjenestekonti.ts — tjenestekonti i edge-laget (30/9-2026).
//
// En tjenestekonto (public.tjenestekonti, migration 20260930140000) er en
// rådgiverkonto, en maskine bruger til at SE platformen (claude@topix.dk). Den
// kan se alt, en rådgiver ser — klokkerne i advisor_notifications skrives også
// til den — men optræder aldrig som en PERSON: den får ingen mail, og den er
// aldrig afsender af en besked til et medlem. Klientens dom står i
// src/lib/tjenestekonto.ts (erSynligRaadgiver); Deno kan ikke importere derfra,
// og dommen er én linje — derfor her uden paritetstest. Kildeværnet
// tjenestekonto.guard (src/lib/__tests__) fælder en ny rådgiver-fan-out i en
// function, der hverken bruger denne fil eller står på værnets liste.

// deno-lint-ignore no-explicit-any
type Klient = { from: (tabel: string) => any };

/** Hele tabellen → mængden af tjenestekonto-id'er. KASTER ved fejl — kalderen vælger fail-soft eller fail-closed. */
export async function hentTjenestekonti(admin: Klient): Promise<Set<string>> {
  const { data, error } = await admin.from("tjenestekonti").select("user_id");
  if (error) throw new Error(`tjenestekonti: ${error.message}`);
  const ud = new Set<string>();
  for (const r of (data ?? []) as { user_id: string | null }[]) if (r.user_id) ud.add(r.user_id);
  return ud;
}

/** Id'erne uden tjenestekonti — rækkefølgen bevares. */
export function udenTjenestekonti(ids: readonly string[], tjenestekonti: ReadonlySet<string>): string[] {
  return ids.filter((id) => !!id && !tjenestekonti.has(id));
}
