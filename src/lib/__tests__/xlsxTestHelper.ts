import * as fs from "fs";
import * as XLSX from "xlsx";
import type { Matrix } from "@/lib/importEngine";

/** XLSX-ark → Matrix (test-hjælper — motoren arbejder på matricer, ikke
    filer). raw: true bevarer native tal; tomme celler bliver null. */
export function laesArkTilMatrix(filsti: string, arkNavn: string): Matrix {
  const workbook = XLSX.read(fs.readFileSync(filsti), { type: "buffer" });
  const ark = workbook.Sheets[arkNavn];
  if (!ark) throw new Error(`Arket "${arkNavn}" findes ikke i ${filsti}`);
  return XLSX.utils.sheet_to_json(ark, { header: 1, raw: true, defval: null }) as Matrix;
}
