import type { Celle, Matrix } from "@/lib/importEngine";

/** CSV → Matrix (test-hjælper — motoren arbejder på matricer, ikke filer).
    Skilletegn er komma medmindre andet angives (robusthed-fixture 04 er
    semikolonsepareret); citationstegn omkring felter med skilletegn, "" =
    escaped quote, tomme felter → null. Deles af importEngine- og
    importGitterModel-testene. */
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
