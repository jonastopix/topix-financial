/**
 * ansoegningDubletter — ren dom (ingen Deno, ingen Supabase): hvad rådgiveren
 * skal vide om en ny ansøgning, FØR nogen trykker «tal med dem» (Jonas 18/9,
 * flow-gennemgangen §4-5). Opslagene laves af ansoegningMotor.findDubletter;
 * her dømmes kun.
 *
 *   - Virksomheden findes i companies på CVR eller på kontaktmailen →
 *     «findes allerede som medlem/kunde» (ALVORLIG: et rent «tal med dem»
 *     bliver «tvivl»). Er kontrakten gældende, siges det; er den udløbet eller
 *     tom, siges det også — det afgør om dag 0-mailen ville ramme dem.
 *   - En anden ÅBEN, indsendt ansøgning på samme CVR → «anden ansøgning på
 *     samme CVR» (ikke alvorlig i sig selv, men synlig).
 * Testet i src/lib/__tests__/ansoegningDubletter.test.ts.
 */

export interface Virksomhedsfund {
  id: string;
  name: string;
  status: string | null;
  contract_end_date: string | null;
}

export interface AndenAnsoegning {
  id: string;
  navn: string | null;
  email: string | null;
  trin: string;
}

export interface DubletInput {
  virksomhederPaaCvr: Virksomhedsfund[];
  virksomhederPaaMail: Virksomhedsfund[];
  andreAabneAnsoegninger: AndenAnsoegning[];
  nu: Date;
}

export interface DubletDom {
  /** Sætninger til grundlaget/klokken/mailen — tom når intet er fundet. */
  advarsler: string[];
  /** Virksomheden findes allerede (CVR eller mail) — «tal med dem» må ikke stå alene. */
  alvorlig: boolean;
  /** Det første fund på CVR (ellers mail) — til deep-link i mailen. */
  medlem: Virksomhedsfund | null;
}

/** Er kontraktens slutdato i dag eller senere? Splitter selv (aldrig new Date på en dato-streng). */
export function kontraktGaelder(contractEndDate: string | null, nu: Date): boolean {
  const m = (contractEndDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const slut = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return nu.getTime() <= slut;
}

function beskriv(v: Virksomhedsfund, via: "CVR" | "mail", nu: Date): string {
  const kontrakt = kontraktGaelder(v.contract_end_date, nu)
    ? `medlemskab til ${v.contract_end_date}`
    : v.contract_end_date
      ? `kontrakt udløbet ${v.contract_end_date}`
      : "ingen kontraktdato";
  return `findes allerede som virksomheden «${v.name}» (${via}, ${v.status ?? "status ukendt"}, ${kontrakt})`;
}

export function afgoerDubletter(i: DubletInput): DubletDom {
  const advarsler: string[] = [];
  const set = new Set<string>();
  let medlem: Virksomhedsfund | null = null;
  for (const v of i.virksomhederPaaCvr) {
    if (set.has(v.id)) continue;
    set.add(v.id);
    advarsler.push(beskriv(v, "CVR", i.nu));
    medlem = medlem ?? v;
  }
  for (const v of i.virksomhederPaaMail) {
    if (set.has(v.id)) continue;
    set.add(v.id);
    advarsler.push(beskriv(v, "mail", i.nu));
    medlem = medlem ?? v;
  }
  const alvorlig = medlem !== null;
  for (const a of i.andreAabneAnsoegninger) {
    const hvem = [a.navn, a.email].filter(Boolean).join(", ") || a.id;
    advarsler.push(`anden åben ansøgning på samme CVR: ${hvem} (${a.trin})`);
  }
  return { advarsler, alvorlig, medlem };
}
