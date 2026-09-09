/**
 * src/lib/hjemmebane/rapporteringTekst.ts
 *
 * Rapporteringssidens ord til en der aldrig har uploadet — rene
 * funktioner, testet i __tests__/rapporteringTekst.test.ts.
 *
 * FUNDET (recon-den-tomme-platform §3, 7/9): siden forklarede HVAD man
 * skal uploade («Saldobalance eller resultatopgørelse — PDF, Excel eller
 * CSV») men ikke HVOR man henter det, og intet om hvor mange måneder.
 * e-conomic, Dinero og Billy stod kun i FEJLBESKEDER efter en mislykket
 * upload (reportUploadEngine.getFriendlyErrorMessage) og i det gamle
 * FileUploadZones foldbare «Sådan eksporterer du», som Hjemmebane-zonen
 * ikke tog med.
 *
 * JONAS 9/9, ordret: «De kan godt rapportere fra FØR medlemsstart. Det
 * vil vi faktisk gerne opfordre dem til, så vi kan få et grundigt
 * grundlag at komme i gang med.» Målt: de der kom i gang, gjorde det
 * inden for tre uger (Livja 0 dage, YKRG 4) — det kan kun være historik.
 * De seks der aldrig uploadede, ventede formentlig på «næste måned».
 *
 * HVOR MANGE MÅNEDER — TRE. Huset har ikke ét tal, men fire forudsætninger:
 * trends kræver «mindst to måneders tal» (NoegletalView:659); M/M-signaler
 * kræver to perioder (virksomhedsSignaler.momErGyldig); friskhed er tre
 * kalendermåneder (isFiguresFresh); budgetsimulatoren og årsbaselinen
 * bygges af ÉN rapport (auto-create-baseline-budget, ×12). Tre måneder
 * giver trends med margin, fylder friskhedsvinduet, og er en bøn et
 * menneske kan efterkomme på en aften — tolv er årsrapportens sag og har
 * sin egen blok. «Gerne mere» står der, så tre ikke læses som et loft.
 *
 * NY MOD VANT (punkt 4): den der aldrig har uploadet (ingen rækker i
 * financial_reports) får introduktionen og vejledningen foldet UD; den
 * der har uploadet før, får den korte linje og vejledningen foldet
 * sammen. Signalet er listens egen længde — fokusTom (tre tilstande)
 * ville kræve facts og anerkendelseslinje for at svare på et spørgsmål
 * med ét bit. Mens listen hentes, regnes man som vant, så en der har
 * uploadet tolv gange ikke ser introduktionen blinke.
 *
 * TONEN er husets: roligt, ét skridt, ingen tolv trin. Vejledningen er
 * én linje pr. system, taget fra FileUploadZone.tsx:693-712 og
 * ReportReviewDialog.tsx:813-826 — de to steder ordene allerede stod.
 */

export const HISTORIK_MAANEDER = 3;

export interface UploadZoneTekst {
  overskrift: string;
  linje: string;
}

/** Zonens to linjer. Ny: bed om historik. Vant: som hidtil. */
export function uploadZoneTekst(foersteGang: boolean): UploadZoneTekst {
  if (foersteGang) {
    return {
      overskrift: "Upload dine tal — start med historikken",
      linje:
        `Saldobalance eller resultatopgørelse fra dit regnskabsprogram, som PDF, Excel eller CSV. ` +
        `Tag de seneste ${HISTORIK_MAANEDER} måneder med, gerne mere — også fra før du blev medlem. Klik eller træk hertil.`,
    };
  }
  return {
    overskrift: "Upload din månedsrapport",
    linje: "Saldobalance eller resultatopgørelse — PDF, Excel eller CSV. Klik eller træk hertil.",
  };
}

/** Den tomme liste. Ny: sig hvad der skal til. Vant (fx årsfilter uden
    rækker): kort. */
export function tomListeTekst(foersteGang: boolean): string {
  if (foersteGang) {
    return `Ingen rapporter endnu. Upload de seneste ${HISTORIK_MAANEDER} måneder ovenfor — også fra før medlemskabet — så har vi et grundlag at starte fra.`;
  }
  return "Ingen rapporter i denne visning.";
}

export interface EksportVej {
  system: string;
  vej: string;
}

/** «Sådan henter du den» — én linje pr. system. Ordene fra FileUploadZone
    og ReportReviewDialog, hvor de allerede stod (efter fejlen). */
export const EKSPORT_VEJE: readonly EksportVej[] = [
  { system: "e-conomic", vej: "Regnskab → Rapporter → Balance (eller Saldobalance) → Excel" },
  { system: "Dinero", vej: "Rapporter → Resultatopgørelse → CSV eller PDF" },
  { system: "Billy", vej: "Rapporter → Resultatopgørelse → Excel" },
  { system: "Andre", vej: "Resultatopgørelse eller saldobalance som PDF eller Excel — kan vi ikke læse den, indtaster du de vigtigste tal selv" },
];

/** Foldet ud for den nye, sammen for den vante. */
export function vejledningAaben(foersteGang: boolean): boolean {
  return foersteGang;
}
