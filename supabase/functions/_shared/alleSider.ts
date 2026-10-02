// Husets paginering uden tavst loft. PostgREST giver højst 1.000 rækker pr.
// forespørgsel (`max-rows`) UDEN fejl, så et `.limit(5000)` eller et opslag
// helt uden grænse klipper stille, når tabellen passerer 1.000 (DEL 4, #929).
// Denne hjælper henter én side ad gangen med `.range(fra, til)` og stopper
// først, når en side er kortere end SIDE. En fejl på en side KASTER — en
// halv liste, der ligner en hel, er værre end en stoppet kørsel.
//
// Kalderen SKAL sortere på en unik kolonne (`.order("id")`) i `byg`: uden
// stabil rækkefølge kan en række blive sprunget over eller hentet to gange
// mellem to sider.
export const SIDE = 1000;

export async function alleSider<T>(
  byg: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  kilde: string,
): Promise<T[]> {
  const ud: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await byg(fra, fra + SIDE - 1);
    if (error) throw new Error(`${kilde}: ${error.message}`);
    const rk = data ?? [];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}
