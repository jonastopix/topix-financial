/**
 * kraevRaekker — «kræv rækker» af et Supabase-svar, ellers kast.
 *
 * Husets kendte fælde (recon-tavse-fejl.md, 7/9): `const { data } = await
 * supabase…` og `res.data || []` gør en FEJL til et TOMT svar. TanStack ser
 * en succes med nul rækker, isError bliver aldrig sand, og fladen siger
 * «der er ikke noget» frem for «det kunne ikke hentes». For rådgiverens
 * forside betød det at et fejlet delkald (company_fornyelse,
 * company_betalingslink, agent_proposals …) tømte dommen for den slags —
 * udløbne kontrakter og ubetalte indgange forsvandt uden spor.
 *
 * Hjælperen tager svaret og et NAVN på kilden, så fejlen siger hvilket
 * kald der fejlede — ikke bare «noget gik galt». Bruges på de delkald hvor
 * tom data ville være en løgn; berigelser der må mangle læses som før.
 */
export class HentningsFejl extends Error {
  readonly kilde: string;
  constructor(kilde: string, aarsag: string) {
    super(`Hentningen af ${kilde} fejlede: ${aarsag}`);
    this.name = "HentningsFejl";
    this.kilde = kilde;
  }
}

type SupabaseSvar<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Returnerer rækkerne (tom liste når data er null uden fejl); kaster HentningsFejl ved fejl. */
export function kraevRaekker<T>(svar: SupabaseSvar<T> | null | undefined, kilde: string): T[] {
  if (!svar) throw new HentningsFejl(kilde, "intet svar");
  if (svar.error) throw new HentningsFejl(kilde, svar.error.message || "ukendt fejl");
  return svar.data ?? [];
}
