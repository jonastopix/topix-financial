/**
 * src/lib/medFrist.ts
 *
 * Et opslag, der aldrig svarer, må ikke blive en evig venten (30/9-2026,
 * mangellisten m28-invitationsopslag-haenger): Auth.tsx satte opslaget af
 * invitationen til «venter» og tegnede en spinner, til lookup_invite_company_info
 * svarede — uden frist. Et hængende netværk, et blokeret domæne eller en
 * forbindelse, der aldrig lukker, gav en side med en spinner for evigt.
 *
 * medFrist lader arbejdet løbe, men afgør senest efter `fristMs`: svarer
 * arbejdet først, er det svaret; ellers er det `vedUdeblevet`. Et svar, der
 * kommer EFTER fristen, ignoreres — kalderen har allerede afgjort sagen, og
 * en sen ændring midt i en udfyldt formular er værre end ingen.
 *
 * Kaster arbejdet, kaster medFrist det samme (kalderens egen fejlgren gælder).
 * Tager en thenable (PromiseLike), fordi supabase-js' forespørgsler er det.
 * Ingen IO, ingen React — testet i __tests__/medFrist.test.ts.
 */
export function medFrist<T, U>(arbejde: PromiseLike<T>, fristMs: number, vedUdeblevet: U): Promise<T | U> {
  return new Promise<T | U>((resolve, reject) => {
    let afgjort = false;
    const ur = setTimeout(() => {
      if (afgjort) return;
      afgjort = true;
      resolve(vedUdeblevet);
    }, fristMs);
    Promise.resolve(arbejde).then(
      (svar) => {
        if (afgjort) return;
        afgjort = true;
        clearTimeout(ur);
        resolve(svar);
      },
      (fejl: unknown) => {
        if (afgjort) return;
        afgjort = true;
        clearTimeout(ur);
        reject(fejl);
      },
    );
  });
}
