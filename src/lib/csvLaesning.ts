/**
 * csvLaesning — CSV-tekst → Matrix til import-motoren. Flyttet fra
 * test-hjælperen (csvTestHelper) til produktionskode da importfladen blev
 * koblet på den deterministiske vej: komponenten og testene deler nu
 * præcis samme læsning. Ren logik, ingen I/O.
 */

import type { Celle, Matrix } from "@/lib/importEngine";

const KANDIDATER = [",", ";", "\t"] as const;
export type Skilletegn = (typeof KANDIDATER)[number];

/** CSV → Matrix. Citationstegn omkring felter med skilletegn, "" = escaped
    quote, tomme felter → null. */
export function parseCsvTilMatrix(tekst: string, skille: string = ","): Matrix {
  const matrix: Matrix = [];
  let raekke: Celle[] = [];
  let felt = "";
  let iCitat = false;
  let harCitat = false;

  const lukFelt = () => {
    raekke.push(felt === "" && !harCitat ? null : felt);
    felt = "";
    harCitat = false;
  };
  const lukRaekke = () => {
    lukFelt();
    matrix.push(raekke);
    raekke = [];
  };

  const t = tekst.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (iCitat) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          felt += '"';
          i++;
        } else {
          iCitat = false;
        }
      } else {
        felt += c;
      }
    } else if (c === '"') {
      iCitat = true;
      harCitat = true;
    } else if (c === skille) {
      lukFelt();
    } else if (c === "\n") {
      lukRaekke();
    } else if (c !== "\r") {
      felt += c;
    }
  }
  if (felt !== "" || harCitat || raekke.length > 0) lukRaekke();
  return matrix;
}

/** Skilletegns-detektion: tab, semikolon eller komma — det der giver flest
    kolonner på headerlinjen (første ikke-tomme linje), citations-bevidst.
    Ved lighed vinder komma (CSV-standarden) over semikolon over tab. */
export function detekterSkilletegn(tekst: string): Skilletegn {
  const linje =
    tekst
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .find((l) => l.trim() !== "") ?? "";

  let bedste: Skilletegn = ",";
  let flest = -1;
  for (const kandidat of KANDIDATER) {
    const antal = parseCsvTilMatrix(linje, kandidat)[0]?.length ?? 0;
    if (antal > flest) {
      flest = antal;
      bedste = kandidat;
    }
  }
  return bedste;
}

/** CSV-tekst → Matrix med automatisk skilletegns-detektion. */
export function laesCsvTilMatrix(tekst: string): Matrix {
  return parseCsvTilMatrix(tekst, detekterSkilletegn(tekst));
}
