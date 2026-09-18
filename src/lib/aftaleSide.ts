/**
 * src/lib/aftaleSide.ts — rene domme for underskriftssiden /aftale
 * (UDKAST 18/9). Ingen React, ingen Supabase; siden (src/pages/Aftale.tsx)
 * kalder dem og tegner. Testet i src/lib/__tests__/aftaleSide.test.ts.
 *
 *   afgoerKnap        kan «Underskriv» trykkes? (navn, kryds, kode, kode bestilt)
 *   tolkFejl          funktionens fejlsvar → den sætning medlemmet skal se
 *   kodeHjaelp        linjen under kodefeltet (hvor koden er sendt hen, hvor længe)
 */
import { KODE_CIFRE, afgoerNavn, rensKode } from "@/lib/underskriftDom";

export interface KnapInput {
  navn: string;
  accepteret: boolean;
  kode: string;
  kodeBestilt: boolean;
  arbejder: boolean;
}

export type Knapdom = { ok: true } | { ok: false; grund: "arbejder" | "kode_ikke_bestilt" | "navn" | "kryds" | "kode" };

/** Rækkefølgen er den rækkefølge feltet står på siden: navn → kryds → kode. */
export function afgoerKnap(i: KnapInput): Knapdom {
  if (i.arbejder) return { ok: false, grund: "arbejder" };
  if (!afgoerNavn(i.navn).ok) return { ok: false, grund: "navn" };
  if (!i.accepteret) return { ok: false, grund: "kryds" };
  if (!i.kodeBestilt) return { ok: false, grund: "kode_ikke_bestilt" };
  if (rensKode(i.kode) === null) return { ok: false, grund: "kode" };
  return { ok: true };
}

export interface FunktionsFejl {
  status: number | null;
  body: Record<string, unknown> | null;
}

/** Fejlsvar fra aftale-underskrift → en sætning. Aldrig teknisk tekst til medlemmet. */
export function tolkFejl(f: FunktionsFejl): string {
  const kode = typeof f.body?.error === "string" ? f.body.error : null;
  const tal = (k: string) => (typeof f.body?.[k] === "number" ? (f.body[k] as number) : null);
  switch (kode) {
    case "kode_forkert": {
      const n = tal("forsoeg_tilbage");
      return n === 1 ? "Koden er forkert. Du har ét forsøg tilbage." : `Koden er forkert. Du har ${n ?? "få"} forsøg tilbage.`;
    }
    case "kode_laast":
      return "Koden er låst efter for mange forsøg. Bestil en ny kode og prøv igen.";
    case "kode_ugyldig":
      return "Koden gælder ikke længere. Bestil en ny kode.";
    case "kode_format":
      return `Koden er ${KODE_CIFRE} cifre.`;
    case "kryds_mangler":
      return "Sæt kryds ved at du har læst aftalegrundlaget og accepterer det.";
    case "navn_ugyldigt":
      return "Skriv dit fulde navn — det er din underskrift.";
    case "vent": {
      const s = tal("vent_sekunder");
      return `Vi har lige sendt en kode. Vent ${s ?? "et øjeblik"} sekunder, før du bestiller en ny.`;
    }
    case "kode_mail_fejlede":
      return "Koden kunne ikke sendes. Prøv igen om lidt, eller skriv til os.";
    case "kan_ikke_underskrives":
      return "Aftalen kan ikke underskrives længere. Genindlæs siden for at se hvorfor.";
    case "allerede_underskrevet":
      return "Aftalen er allerede underskrevet.";
    case "aftryk_afviger":
      return "Dokumentet kunne ikke bekræftes. Skriv til os — der er ikke skrevet under.";
    default:
      return f.status === 403 ? "Linket kendes ikke." : "Der gik noget galt. Prøv igen, eller skriv til os.";
  }
}

/** Linjen under kodefeltet. */
export function kodeHjaelp(emailHint: string, gyldigMinutter: number, kodeBestilt: boolean): string {
  return kodeBestilt
    ? `Vi har sendt en ${KODE_CIFRE}-cifret kode til ${emailHint}. Den gælder i ${gyldigMinutter} minutter.`
    : `Vi sender en ${KODE_CIFRE}-cifret kode til ${emailHint}, når du trykker «Send kode».`;
}
