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

// ── Kilden → vejen (14/9, mangellistens nr. 8) ────────────────────────────
//
// Serveren stempler hver upload med et kildefingeraftryk
// (_shared/sourceFingerprint.ts detectSourceSystem: "economic" | "dinero" |
// "combined_dk" | "unknown"), gemt i
// raw_extracted_data.routing_trace.source_fingerprint.source_system
// (extract-financial-data:480). Før 14/9 blev det kun brugt i toasten lige
// efter uploaden; kortet sagde HVORFOR (rapportFejlgrund) men ikke HVAD man
// skal gøre. Her kobles kilden til den vej der ALLEREDE står i EKSPORT_VEJE
// — én kilde til vejene, så kortet, siden («Sådan henter du den») og
// historik-mailen (onboardingRytme.EKSPORT_VEJE_TEKST, paritetstestet)
// siger det samme.
//
// INGEN GÆT: «unknown», null og tomt (ældre rækker uden fingeraftryk) →
// «Andre». «combined_dk» er et strukturelt aftryk (Balance + Nummer/Navn +
// periodekolonne, sourceFingerprint.ts:138-158), ikke et program —
// serverens KILDENAVNE kalder det «dit regnskabssystem»
// (extract-financial-data:872-876); her følger vi serveren: «Andre».
// Billy står i EKSPORT_VEJE men har intet fingeraftryk, så ingen kilde
// fører dertil.
//
// HVILKEN FIL (punkt 2, målt 14/9): e-conomics saldobalance som Excel er
// det stærkeste spor — fingeraftrykket er HIGH på to faste rækker (CVR i
// række 2, «Saldobalance for perioden» i række 4; sourceFingerprint.ts:
// 103-117, det første tjek i XLSX-grenen), og TO skabeloner dækker den:
// dkEconomicSaldobalanceXlsxV1 (score 88 efter fire hårde gates, først i
// registret, templateRegistry.ts:157-158) for varianten uden subtotaler,
// og dkCombinedBalancePnlV1 (85/92, «DK Combined Balance/P&L
// (Saldobalance)») for varianten med. Resultatopgørelsen som Excel har ét
// fingeraftryk (HIGH) og én skabelon med additiv score (maks ~90), der
// falder til 0 hvis ordet «aktiver» står i filen
// (dkEconomicResultatopgoerelseXlsxV1.ts:315-320).

/** Serverens kildenavne (SourceSystem) — kun de to der er et program. */
const KILDE_TIL_SYSTEM: Readonly<Record<string, string>> = {
  economic: "e-conomic",
  dinero: "Dinero",
};

/** «e-conomic» / «Dinero» — null når kilden ikke er et kendt program (aldrig et gæt). */
export function kildeNavn(kilde: string | null | undefined): string | null {
  return KILDE_TIL_SYSTEM[(kilde ?? "").trim().toLowerCase()] ?? null;
}

/** Kilden → dens linje i EKSPORT_VEJE (samme objekt). Ukendt kilde → «Andre». */
export function eksportVejForKilde(kilde: string | null | undefined): EksportVej {
  const system = kildeNavn(kilde) ?? "Andre";
  return (
    EKSPORT_VEJE.find((v) => v.system === system) ??
    EKSPORT_VEJE.find((v) => v.system === "Andre") ??
    EKSPORT_VEJE[EKSPORT_VEJE.length - 1]
  );
}

/**
 * Kortets næste skridt når en upload strander: hvilken fil, og hvor den
 * hentes — vejen ordret fra EKSPORT_VEJE. e-conomic peger på saldobalancen
 * som Excel (belægget i filhovedet ovenfor); Dinero på sin linje; ukendt
 * kilde nævner intet program.
 */
export function naesteSkridtTekst(kilde: string | null | undefined): string {
  const vej = eksportVejForKilde(kilde);
  if (vej.system === "e-conomic") {
    return `Den fil vi læser sikrest fra e-conomic, er saldobalancen som Excel: ${vej.vej}.`;
  }
  if (vej.system === "Andre") {
    return `Vi kan ikke se, hvilket regnskabsprogram filen kommer fra. ${vej.vej}.`;
  }
  return `Sådan henter du en fil vi kan læse fra ${vej.system}: ${vej.vej}.`;
}
