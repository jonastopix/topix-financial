/** Datovalgs-knapperne i medlemmets opgaveflade (accept B6, anden
    udskydelse B11): "Denne uge" / "Næste uge" / "Om en måned" plus en
    kalender som udvej.

    B6 kræver at medlemmet selv vælger datoen — og indvendingen bogført
    i B6 er at hver ekstra handling historisk har kostet næsten al
    adoption. Tre knapper bevarer valget uden at kræve en kalender. Er
    accept-raten lav, er kalender-først den første justering — det er
    den observation B6 beder om.

    Ren datoaritmetik uden imports — testes i
    __tests__/opgaveDato.test.ts. */

/** Nærmeste kommende fredag; er dagen i dag fredag, er det i dag.
    (Frist i dag er lovlig: accepter kræver kun dato >= i dag, og
    forfald indtræder først dagen EFTER fristen, opgaveEngine.ts:182-186.)
    Klokkeslæt på input ignoreres — resultatet er en ren kalenderdag. */
export function denneUgesFredag(nu: Date): Date {
  const ny = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  ny.setDate(ny.getDate() + ((5 - ny.getDay() + 7) % 7));
  return ny;
}

/** Fredagen ugen efter denneUgesFredag. */
export function naesteUgesFredag(nu: Date): Date {
  const ny = denneUgesFredag(nu);
  ny.setDate(ny.getDate() + 7);
  return ny;
}

/** Samme ugedag om fire uger (+28 dage) — "om en måned" uden
    månedslængde-akrobatik. */
export function omEnMaaned(nu: Date): Date {
  const ny = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  ny.setDate(ny.getDate() + 28);
  return ny;
}

/** Lokal kalenderdag som "YYYY-MM-DD" — formen opgave-accepter og
    opgave-udskyd forventer. toISOString ville skride en dag omkring
    midnat i UTC-forskudte tidszoner. */
export function tilDatoStreng(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dag}`;
}
