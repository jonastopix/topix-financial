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
import { afgoerOvergang, LUKKEAARSAGER, MENNESKE_HANDLINGER, type Afslagsgrund, type Handling, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";
import { pauseTil } from "@/lib/rykkerkoe";

export type MenneskeHandling = Exclude<Handling["art"], "book" | "aflys_booking" | "svarer_ikke" | "udloeb" | "ikke_nu" | "betalte_ikke">;
/**
 * Knapperne i fladen — «tilbud» (indtastet link) er IKKE en af dem (Jonas 18/9 aften): e-underskriften
 * (SendTilUnderskrift) er den eneste vej til en aftale; den laver aftalen, sætter prisen, sender mailen og
 * flytter trinnet i ét. Den gamle vej sprang prisen over, og fejlen viste sig først ved betalingen.
 * Motorens «tilbud» findes stadig — send-til-underskrift kalder den med aftalens link.
 */
export type FladeHandling = Exclude<MenneskeHandling, "tilbud">;

export interface Knap {
  handling: FladeHandling;
  tekst: string;
  /** De to beslutningsknapper er «store»; reserven er små tekstknapper. */
  stor: boolean;
  /** Farligt (rust): afvis/afslag/luk. */
  farlig: boolean;
  /** Åbner en bekræftelsesdialog — det kan ikke fortrydes. */
  bekraeft: boolean;
  /** Kræver en lukkeårsag (luk) — dialogen viser valget. */
  kraeverAarsag: boolean;
  /** Kræver et prisniveau (underskrevet på papir) — forudfyldt STANDARD_PRISNIVEAU_OERE, kan skiftes. Ingen aftale uden pris. */
  kraeverPris: boolean;
  /** Kræver en dato (saet_pause) — dialogen viser datovælgeren, standard tre måneder frem. */
  kraeverDato: boolean;
  /** Afvis/afslag: dialogen spørger om grunden (niche → venteliste + afslagsmail, for tidligt → afslagsmail, andet → intet). */
  kraeverAfslagsgrund: boolean;
  /** Én linje til dialogen/tooltippen: hvad sker der. */
  forklaring: string;
}

const KNAPPE: Record<FladeHandling, Omit<Knap, "handling">> = {
  tal_med_dem: { tekst: "Indkald til samtale", stor: true, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Jonas inviterer til en afklaringssamtale — indkaldelsen sendes i dag i sendevinduet, rykkere dag 2, 7 og 11 — uden svar lukkes den «svarer ikke» dag 14." },
  afvis: { tekst: "Afvis", stor: true, farlig: true, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: true, forklaring: "Ansøgningen lukkes som «afslag efter ansøgningen». Ansøgeren får ingen mail fra køen — afslaget skriver I selv. Kan genåbnes, men ikke fortrydes uden spor." },
  afslag: { tekst: "Afslut", stor: true, farlig: true, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: true, forklaring: "Ansøgningen lukkes som «afslag efter samtalen». Ingen mail fra køen — afslaget skriver I selv." },
  afholdt: { tekst: "Markér samtalen som afholdt", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Køen gør det selv når samtalen er slut — kun hvis I tog den før tid." },
  underskrevet: { tekst: "Underskrevet på papir", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverPris: true, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Kun til de sjældne papirtilfælde — e-underskriften er vejen. Prisen sættes her (forudfyldt 50.000, kan skiftes). Virksomheden oprettes med ansøgningens id, betalingslinket og dag 0-mailen sendes — det eksisterende betalingsforløb (30 dage, faktura dag 31) overtager. Kan ikke fortrydes." },
  luk: { tekst: "Luk", stor: false, farlig: true, bekraeft: true, kraeverAarsag: true, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Lukkes med den valgte årsag; alle planlagte rykkere annulleres." },
  genaabn: { tekst: "Genåbn", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Tilbage til trinnet før lukningen (aldrig til booket eller aftalegrundlag sendt); trappen startes forfra." },
  saet_pause: { tekst: "Sæt på pause", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: true, kraeverAfslagsgrund: false, forklaring: "Alle planlagte rykkere annulleres; ansøgningen står ikke som ventende før datoen, hvor I får en klokke. Kan sættes og flyttes fra ethvert åbent trin." },
  // 18/9 aften (hul i Jonas' prøve): en pause kunne ikke tages af igen — kun flyttes. Samme dom som ansøgerens «Tag den op igen» og køens pause_slut.
  genoptag: { tekst: "Genoptag nu", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Pausen tages af med det samme; ansøgningen står på samme trin. Ingen mail går af sig selv — I tager næste skridt (indkald, book eller send aftalegrundlaget igen)." },
};

/** Rækkefølgen knapperne står i. */
const RAEKKEFOELGE: readonly FladeHandling[] = ["tal_med_dem", "afvis", "afslag", "afholdt", "underskrevet", "genaabn", "genoptag", "saet_pause", "luk"];

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
    const h: Handling = art === "luk" ? { art: "luk", aarsag: "andet" } : art === "saet_pause" ? { art: "saet_pause", til: "2100-01-01" } : ({ art } as Handling);
    const dom = afgoerOvergang(k.trin, h, { paaPause: k.paaPause, lukketFraTrin: k.lukketFraTrin });
    if (dom.ok === false) continue;
    const knap = { handling: art, ...KNAPPE[art] };
    // Med en pause i forvejen hedder knappen det den gør: flytter datoen.
    if (art === "saet_pause" && k.paaPause) knap.tekst = "Flyt pausen";
    ud.push(knap);
  }
  return ud.sort((a, b) => Number(b.stor) - Number(a.stor));
}

/** Lukkeårsagerne rådgiveren kan vælge i «Luk»-dialogen (afslagene har egne knapper; udloebet/svarer_ikke er køens). */
export const LUKKEAARSAGER_TIL_VALG: readonly Lukkeaarsag[] = LUKKEAARSAGER.filter((l) => l === "trak_sig" || l === "dublet" || l === "andet");

/** Bekræftelsens overskrift: «Afvis {navn}?» */
export function bekraeftOverskrift(knap: Knap, virksomhedsnavn: string): string {
  return `${knap.tekst} — ${virksomhedsnavn}?`;
}

/** Afslagsgrundene som rådgiveren vælger dem — og hvad de giver. */
export const AFSLAGSGRUND_ORD: Record<Afslagsgrund, { tekst: string; giver: string }> = {
  niche: { tekst: "Nichen er optaget", giver: "sættes på venteliste til en konkret virksomheds plads; afslagsmailen siger nummeret i køen" },
  for_tidligt: { tekst: "For tidligt", giver: "afslagsmailen sendes med grunden" },
  andet: { tekst: "Andet", giver: "ingen mail — afslaget skriver I selv" },
};

/** Standarddatoen i datovælgeren: tre måneder frem, som ikke_nu (rykkerkoe.pauseTil). */
export function standardPauseTil(nu: Date): string {
  return pauseTil(nu);
}

/** En pause-dato skal være efter i dag (dansk dato) — samme regel som edge functionen. */
export function erGyldigPauseDato(dato: string, nu: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dato) && dato > nu.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

