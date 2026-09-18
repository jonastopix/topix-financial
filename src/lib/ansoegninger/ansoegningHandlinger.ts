/**
 * ansoegningHandlinger — hvilke knapper rådgiveren ser på en ansøgning, og
 * hvad hver kræver. Ren: fladen gætter ikke; den spørger afgoerOvergang
 * (src/lib/ansoegningTrin.ts, spejl af motorens) om hver menneskehandling
 * er tilladt fra trinnet, og viser kun dem der er.
 *
 * DE TO BESLUTNINGER (Jonas 18/9): (1) efter ansøgningen — «Indkald til
 * samtale» eller «Afvis» med årsag; (2) efter samtalen — «Send
 * aftalegrundlag» eller «Afslut» (afslag). Alt andet kører selv; de øvrige
 * knapper (marker afholdt, underskrevet på papir, luk, genåbn) står som
 * reserve nederst, aldrig som de store.
 *
 * BEKRÆFTELSE på det der ikke kan fortrydes: afvis, afslag, luk og
 * underskrevet (starter betalingsforløbet og opretter virksomheden).
 * Indkaldelse og tilbud sender en mail, men kan lukkes igen — ingen dialog,
 * tilbud kræver dog linket til aftalegrundlaget FØR knappen kan trykkes.
 */
import { afgoerOvergang, LUKKEAARSAGER, MENNESKE_HANDLINGER, type Handling, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";

export type MenneskeHandling = Exclude<Handling["art"], "book" | "aflys_booking" | "svarer_ikke" | "udloeb" | "ikke_nu">;

export interface Knap {
  handling: MenneskeHandling;
  tekst: string;
  /** De to beslutningsknapper er «store»; reserven er små tekstknapper. */
  stor: boolean;
  /** Farligt (rust): afvis/afslag/luk. */
  farlig: boolean;
  /** Åbner en bekræftelsesdialog — det kan ikke fortrydes. */
  bekraeft: boolean;
  /** Kræver en lukkeårsag (luk) — dialogen viser valget. */
  kraeverAarsag: boolean;
  /** Kræver et link til aftalegrundlaget (tilbud). */
  kraeverAftaleUrl: boolean;
  /** Én linje til dialogen/tooltippen: hvad sker der. */
  forklaring: string;
}

const KNAPPE: Record<MenneskeHandling, Omit<Knap, "handling">> = {
  tal_med_dem: { tekst: "Indkald til samtale", stor: true, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverAftaleUrl: false, forklaring: "Jonas inviterer til en afklaringssamtale — indkaldelsen sendes i dag i sendevinduet, rykkere dag 2, 4, 7 og 11." },
  afvis: { tekst: "Afvis", stor: true, farlig: true, bekraeft: true, kraeverAarsag: false, kraeverAftaleUrl: false, forklaring: "Ansøgningen lukkes som «afslag efter ansøgningen». Ansøgeren får ingen mail fra køen — afslaget skriver I selv. Kan genåbnes, men ikke fortrydes uden spor." },
  tilbud: { tekst: "Send aftalegrundlag", stor: true, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverAftaleUrl: true, forklaring: "Aftalegrundlaget sendes i dag i sendevinduet med link; rykkere dag 2, 5, 9 og 14, udløber dag 21." },
  afslag: { tekst: "Afslut", stor: true, farlig: true, bekraeft: true, kraeverAarsag: false, kraeverAftaleUrl: false, forklaring: "Ansøgningen lukkes som «afslag efter samtalen». Ingen mail fra køen — afslaget skriver I selv." },
  afholdt: { tekst: "Markér samtalen som afholdt", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverAftaleUrl: false, forklaring: "Køen gør det selv når samtalen er slut — kun hvis I tog den før tid." },
  underskrevet: { tekst: "Underskrevet på papir", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverAftaleUrl: false, forklaring: "Virksomheden oprettes med ansøgningens id, betalingslinket og dag 0-mailen sendes — det eksisterende betalingsforløb (30 dage, faktura dag 31) overtager. Kan ikke fortrydes." },
  luk: { tekst: "Luk", stor: false, farlig: true, bekraeft: true, kraeverAarsag: true, kraeverAftaleUrl: false, forklaring: "Lukkes med den valgte årsag; alle planlagte rykkere annulleres." },
  genaabn: { tekst: "Genåbn", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverAftaleUrl: false, forklaring: "Tilbage til trinnet før lukningen (aldrig til booket eller aftalegrundlag sendt); trappen startes forfra." },
};

/** Rækkefølgen knapperne står i. */
const RAEKKEFOELGE: readonly MenneskeHandling[] = ["tal_med_dem", "afvis", "tilbud", "afslag", "afholdt", "underskrevet", "genaabn", "luk"];

export interface KnapKontekst {
  trin: Trin;
  paaPause: boolean;
  lukketFraTrin: Trin | null;
}

/** De knapper afgoerOvergang tillader fra trinnet — i fast rækkefølge, store først. */
export function knapperFor(k: KnapKontekst): Knap[] {
  const ud: Knap[] = [];
  for (const art of RAEKKEFOELGE) {
    if (!MENNESKE_HANDLINGER.includes(art)) continue;
    const h: Handling = art === "luk" ? { art: "luk", aarsag: "andet" } : ({ art } as Handling);
    const dom = afgoerOvergang(k.trin, h, { paaPause: k.paaPause, lukketFraTrin: k.lukketFraTrin });
    if (dom.ok === false) continue;
    ud.push({ handling: art, ...KNAPPE[art] });
  }
  return ud.sort((a, b) => Number(b.stor) - Number(a.stor));
}

/** Lukkeårsagerne rådgiveren kan vælge i «Luk»-dialogen (afslagene har egne knapper; udloebet/svarer_ikke er køens). */
export const LUKKEAARSAGER_TIL_VALG: readonly Lukkeaarsag[] = LUKKEAARSAGER.filter((l) => l === "trak_sig" || l === "dublet" || l === "andet");

/** Bekræftelsens overskrift: «Afvis {navn}?» */
export function bekraeftOverskrift(knap: Knap, virksomhedsnavn: string): string {
  return `${knap.tekst} — ${virksomhedsnavn}?`;
}

/** Er linket et https-link (edge functionen afviser andet)? */
export function erGyldigtAftaleLink(url: string): boolean {
  return /^https:\/\/\S+$/.test(url.trim());
}
