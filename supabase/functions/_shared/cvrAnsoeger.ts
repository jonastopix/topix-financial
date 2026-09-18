/**
 * supabase/functions/_shared/cvrAnsoeger.ts
 *
 * Det ansøgningsformularen viser TILBAGE fra CVR — «Nordic Byg ApS,
 * stiftet 2019, 10–19 ansatte. Rigtigt?» — tolket rent af DataCVR's rå
 * body. Ingen Deno, ingen fetch; vitest importerer filen direkte
 * (src/lib/ansoegning/__tests__/cvrAnsoeger.test.ts).
 *
 * HVORFOR EN EGEN LÆSER: tolkDataCvrSvar (cvrOpslag.ts) bærer med vilje
 * kun CvrSvar's syv felter, fordi de lander i companies.application_context
 * .raw_cvr_data — og dens test låser at «intet andet felt kommer med».
 * Formularen skal bruge fire mere (ansatte, selskabsform, status,
 * hjemmeside), som IKKE må ende i raw_cvr_data. Derfor to læsere af samme
 * rå svar (hentDataCvrRaa i virksomhedsOprettelse.ts), aldrig én udvidet.
 *
 * FELTNAVNENE er DataCVR's egne, læst i deres dokumentation 18/9
 * (datacvrapi.dk/cvr-api-dokumentation, eksempelsvar): `employees` er et
 * INTERVAL som tekst («10-19», «10000+»), `companydesc` «Aktieselskab»,
 * `companystatus` «Aktiv», `website` «www.novonordisk.com», `startdate`
 * «1989-01-09». IKKE målt med et rigtigt kald fra vores nøgle endnu —
 * README §4 beder om ét opslag fra dashboardet før deploy. owners[] og
 * alle personfelter røres aldrig.
 */
import { type CvrVisning, normaliserHjemmeside, stiftetAarAf } from "./ansoegningSkema.ts";

function erObjekt(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function tekstEllerNull(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/**
 * DataCVR's 200-body → det der vises. null når body ikke er et objekt
 * eller mangler et navn — så er der intet at bekræfte, og formularen
 * behandler det som «ikke fundet».
 */
export function tolkCvrTilAnsoeger(body: unknown): CvrVisning | null {
  if (!erObjekt(body)) return null;
  const navn = tekstEllerNull(body.name);
  if (!navn) return null;
  const web = tekstEllerNull(body.website);
  return {
    navn,
    stiftet_aar: stiftetAarAf(tekstEllerNull(body.startdate)),
    antal_ansatte: tekstEllerNull(body.employees),
    selskabsform: tekstEllerNull(body.companydesc),
    branche: tekstEllerNull(body.industrydesc),
    status: tekstEllerNull(body.companystatus),
    hjemmeside: web ? normaliserHjemmeside(web) : null,
  };
}

/** Registret siger «Aktiv» eller intet — alt andet («Ophørt», «Under konkurs» …) er ikke aktivt. */
export function erAktiv(v: CvrVisning): boolean {
  return v.status === null || v.status.toLowerCase() === "aktiv";
}
