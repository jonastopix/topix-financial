/**
 * ansoegningHandlinger — hvilke knapper rådgiveren ser på en ansøgning, og
 * hvad hver kræver. Ren: fladen gætter ikke; den spørger afgoerOvergang
 * (src/lib/ansoegningTrin.ts, spejl af motorens) om hver menneskehandling
 * er tilladt fra trinnet, og viser kun dem der er.
 *
 * DE TO BESLUTNINGER (Jonas 18/9): (1) efter ansøgningen — «Indkald til
 * samtale» eller «Afvis» med årsag; (2) efter samtalen — «Giv afslag» eller
 * «Luk uden svar» (Jonas 21/9: side om side, samme vægt, navngivet efter
 * FØLGEN for ansøgeren). Alt andet kører selv; de øvrige knapper (marker
 * afholdt, underskrevet på papir, genåbn) står som reserve nederst.
 *
 * MAIL ELLER IKKE MAIL UDLEDES — ALDRIG SKREVET I HÅNDEN (Jonas 21/9, efter
 * recon-afholdt-og-afslut §3.2: dialogen sagde «ingen mail — afslaget skriver
 * I selv» ved «Andet», mens koden sendte den). foelgeLinje spørger dommen:
 * starter overgangen en trappe med en dag 0-mail til ansøgeren, hedder linjen
 * «de får en mail nu»; starter den ingen trappe (eller kun klokker/rykkere
 * til os), hedder den «ingen mail». Knappernes forklaringer og ordene for
 * grunde og årsager nævner IKKE mail — kildeværnet afslagLuk.guard fælder
 * det. Undtagelsen er «underskrevet på papir»: dens dag 0-mail ligger i
 * betalingsforløbet (uden for trapperne), så linjen udelades dér.
 *
 * BEKRÆFTELSE på det der ikke kan fortrydes: afvis, afslag, luk og
 * underskrevet (starter betalingsforløbet og opretter virksomheden).
 * Indkaldelse og tilbud sender en mail, men kan lukkes igen — ingen dialog,
 * tilbud kræver dog linket til aftalegrundlaget FØR knappen kan trykkes.
 */
import { afgoerOvergang, LUKKEAARSAGER, MENNESKE_HANDLINGER, type Afslagsgrund, type Handling, type Lukkeaarsag, type Trin } from "@/lib/ansoegningTrin";
import { pauseTil, svarMailTrin, TRAPPER } from "@/lib/rykkerkoe";
import { LUKKEAARSAG_ORD } from "@/lib/ansoegninger/ansoegningVisning";

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
  /** Afvis/afslag: dialogen spørger om grunden og viser mailen, ansøgeren får, ordret. */
  kraeverAfslagsgrund: boolean;
  /** Én linje til dialogen/tooltippen: hvad sker der — UDEN ord om mail (foelgeLinje siger det). */
  forklaring: string;
}

const KNAPPE: Record<FladeHandling, Omit<Knap, "handling">> = {
  tal_med_dem: { tekst: "Indkald til samtale", stor: true, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Jonas inviterer til en afklaringssamtale — indkaldelsen sendes med det samme, rykkere dag 2, 7 og 11 — uden svar lukkes den «svarer ikke» dag 14." },
  afvis: { tekst: "Afvis", stor: true, farlig: true, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: true, forklaring: "Ansøgningen lukkes som «afslag efter ansøgningen» med den valgte grund. Kan genåbnes, men ikke fortrydes uden spor." },
  // 21/9 (Jonas): «Giv afslag» og «Luk uden svar» side om side — navnene siger følgen for ansøgeren; linjen under knappen udledes (foelgeLinje).
  afslag: { tekst: "Giv afslag", stor: true, farlig: true, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: true, forklaring: "Ansøgningen lukkes som «afslag efter samtalen» med den valgte grund. Kan genåbnes, men ikke fortrydes uden spor." },
  // «Kom ikke» (20/9, recon §5.4): samtalen blev markeret afholdt ved sluttid, men ingen dukkede op. Tilbage til indkaldelsen med rykkerne dag 2/7/11 — ingen ny dag 0-indkaldelse.
  // 21/9: forklaringen siger rykker 1's FAKTISKE tekst (ansoegningRykkerMails.ts) — den lovede før «vælg en ny tid», som ikke står i mailen.
  ikke_moedt: { tekst: "Kom ikke", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Ansøgeren dukkede ikke op. Tilbage til «indkaldt»: rykkerne dag 2, 7 og 11 kører igen — rykker 1 spørger «Har du fundet et tidspunkt til vores snak?» med linket til kalenderen — og dag 14 lukkes den «svarer ikke». Ingen ny indkaldelse sendes." },
  afholdt: { tekst: "Markér samtalen som afholdt", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Køen gør det selv når samtalen er slut — kun hvis I tog den før tid." },
  underskrevet: { tekst: "Underskrevet på papir", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverPris: true, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Kun til de sjældne papirtilfælde — e-underskriften er vejen. Prisen sættes her (forudfyldt 50.000, kan skiftes). Virksomheden oprettes med ansøgningens id, betalingslinket og dag 0-mailen sendes — det eksisterende betalingsforløb (30 dage, faktura dag 31) overtager. Kan ikke fortrydes." },
  // stor: KUN på «afholdt» (knapperFor) — dér står den side om side med «Giv afslag»; på de andre trin er den reserve som før.
  luk: { tekst: "Luk uden svar", stor: false, farlig: true, bekraeft: true, kraeverAarsag: true, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Lukkes med den valgte årsag; alle planlagte rykkere annulleres. Ved «Andet» skal du skrive en begrundelse." },
  genaabn: { tekst: "Genåbn", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Tilbage til trinnet før lukningen (aldrig til booket eller aftalegrundlag sendt); trappen startes forfra." },
  saet_pause: { tekst: "Sæt på pause", stor: false, farlig: false, bekraeft: true, kraeverAarsag: false, kraeverPris: false, kraeverDato: true, kraeverAfslagsgrund: false, forklaring: "Alle planlagte rykkere annulleres; ansøgningen står ikke som ventende før datoen, hvor I får en klokke. Kan sættes og flyttes fra ethvert åbent trin." },
  // 18/9 aften (hul i Jonas' prøve): en pause kunne ikke tages af igen — kun flyttes. Samme dom som ansøgerens «Tag den op igen» og køens pause_slut.
  genoptag: { tekst: "Genoptag nu", stor: false, farlig: false, bekraeft: false, kraeverAarsag: false, kraeverPris: false, kraeverDato: false, kraeverAfslagsgrund: false, forklaring: "Pausen tages af med det samme; ansøgningen står på samme trin. Intet går af sig selv — I tager næste skridt (indkald, book eller send aftalegrundlaget igen)." },
};

/** Rækkefølgen knapperne står i. */
const RAEKKEFOELGE: readonly FladeHandling[] = ["tal_med_dem", "afvis", "afslag", "ikke_moedt", "afholdt", "underskrevet", "genaabn", "genoptag", "saet_pause", "luk"];

export interface KnapKontekst {
  trin: Trin;
  paaPause: boolean;
  lukketFraTrin: Trin | null;
}

/** Fladens handling som dommens Handling — med de valg, dialogen kender (grund, årsag). Uden valg: en gyldig pladsholder, så tilladelsen kan spørges. */
export function tilHandling(art: FladeHandling, valg: { grund?: Afslagsgrund; aarsag?: Lukkeaarsag } = {}): Handling {
  if (art === "luk") return { art: "luk", aarsag: valg.aarsag ?? "andet" };
  if (art === "saet_pause") return { art: "saet_pause", til: "2100-01-01" };
  if (art === "afvis" || art === "afslag") return { art, ...(valg.grund ? { grund: valg.grund } : {}) } as Handling;
  return { art } as Handling;
}

/** De knapper afgoerOvergang tillader fra trinnet — i fast rækkefølge, store først. */
export function knapperFor(k: KnapKontekst): Knap[] {
  const ud: Knap[] = [];
  for (const art of RAEKKEFOELGE) {
    if (!MENNESKE_HANDLINGER.includes(art)) continue;
    const dom = afgoerOvergang(k.trin, tilHandling(art), { paaPause: k.paaPause, lukketFraTrin: k.lukketFraTrin });
    if (dom.ok === false) continue;
    const knap = { handling: art, ...KNAPPE[art] };
    // Med en pause i forvejen hedder knappen det den gør: flytter datoen.
    if (art === "saet_pause" && k.paaPause) knap.tekst = "Flyt pausen";
    // Efter samtalen (Jonas 21/9): «Giv afslag» og «Luk uden svar» side om side, samme vægt.
    if (art === "luk" && k.trin === "afholdt") knap.stor = true;
    ud.push(knap);
  }
  return ud.sort((a, b) => Number(b.stor) - Number(a.stor));
}

// ── Følge-linjen: mail eller ikke mail, UDLEDT af dommen ───────────────────

/** De to ord. De må KUN stå her — kildeværnet afslagLuk.guard læser fladen og fælder enhver anden forekomst. */
export const FOELGE_MAIL_NU = "de får en mail nu";
export const FOELGE_INGEN_MAIL = "ingen mail";

/** Handlinger, hvis mail ikke ligger i en trappe (betalingsforløbets dag 0) — linjen kan ikke udledes og udelades. */
const UDEN_UDLEDT_LINJE: readonly FladeHandling[] = ["underskrevet"];

/** «2, 7 og 11» */
export function dageSomTekst(dage: readonly number[]): string {
  if (dage.length <= 1) return dage.join("");
  return `${dage.slice(0, -1).join(", ")} og ${dage[dage.length - 1]}`;
}

/**
 * Hvad ansøgeren FÅR, hvis knappen trykkes — spurgt dommen, ikke skrevet ved knappen:
 *   overgangen starter ingen trappe, eller kun rækker til os        → «ingen mail»
 *   trappen begynder med en dag 0-mail til ansøgeren (svarMailTrin) → «de får en mail nu»
 *   trappen har mails til ansøgeren, men først senere (fx «kom ikke») → «ingen mail nu — rykkere dag 2, 7 og 11»
 * null = knappen er ikke tilladt fra trinnet, eller linjen kan ikke udledes (UDEN_UDLEDT_LINJE).
 */
export function foelgeLinje(k: KnapKontekst, art: FladeHandling, valg: { grund?: Afslagsgrund; aarsag?: Lukkeaarsag } = {}): string | null {
  if (UDEN_UDLEDT_LINJE.includes(art)) return null;
  const dom = afgoerOvergang(k.trin, tilHandling(art, valg), { paaPause: k.paaPause, lukketFraTrin: k.lukketFraTrin });
  if (dom.ok === false) return null;
  const start = dom.overgang.start;
  if (!start) return FOELGE_INGEN_MAIL;
  const fra = start.fraTrinNr ?? 0;
  const tilAnsoeger = TRAPPER[start.trappe].filter((t) => t.trinNr >= fra && t.handling === "send_mail" && t.modtager === "ansoeger");
  if (tilAnsoeger.length === 0) return FOELGE_INGEN_MAIL;
  if (fra === 0 && svarMailTrin(start.trappe) !== null) return FOELGE_MAIL_NU;
  return `${FOELGE_INGEN_MAIL} nu — rykkere dag ${dageSomTekst(tilAnsoeger.map((t) => t.dag))}`;
}

// ── Ordene i de to dialoger ────────────────────────────────────────────────

/** Lukkeårsagerne rådgiveren kan vælge i «Luk uden svar» (afslagene har egne knapper; udloebet/svarer_ikke/betalte_ikke er køens). Rækkefølgen er LUKKEAARSAGER's. */
export const LUKKEAARSAGER_TIL_VALG: readonly Lukkeaarsag[] = LUKKEAARSAGER.filter((l) => l === "trak_sig" || l === "dublet" || l === "gensidigt_ikke_match" || l === "andet");

/** Første bogstav stort — dialogens valg er sætningsstarter («Trak sig»), prosaens ord er små («· trak sig»). */
export function valgOrd(ord: string): string {
  return ord ? ord.charAt(0).toLocaleUpperCase("da-DK") + ord.slice(1) : ord;
}

/** Ordene i «Luk uden svar»-dialogen: husets ord (LUKKEAARSAG_ORD), med stort — så prosaen og dialogen aldrig siger to ting. */
export const LUKKEAARSAG_VALG_ORD: Record<Lukkeaarsag, string> = Object.fromEntries(
  LUKKEAARSAGER.map((l) => [l, valgOrd(LUKKEAARSAG_ORD[l])]),
) as Record<Lukkeaarsag, string>;

/**
 * Afslagsgrundene som rådgiveren vælger dem (Jonas 21/9). KUN ordet — hvad grunden giver
 * (mailen, køpladsen) står i forhåndsvisningen af selve mailen, bygget af afslagsMailTekst.
 * Værdien «andet» hedder «Ikke det rigtige lige nu», så intet valg går igen i «Luk uden svar».
 */
export const AFSLAGSGRUND_ORD: Record<Afslagsgrund, string> = {
  niche: "Nichen er optaget",
  for_tidligt: "For tidligt",
  andet: "Ikke det rigtige lige nu",
};

/** Intet valg går igen i de to dialoger — samme ord ville betyde to forskellige ting (før: «Andet» i begge). */
export function ordeneGaarIkkeIgen(afslag: readonly string[], luk: readonly string[]): boolean {
  const a = new Set(afslag.map((s) => s.trim().toLocaleLowerCase("da-DK")));
  return luk.every((s) => !a.has(s.trim().toLocaleLowerCase("da-DK")));
}

/** Bekræftelsens overskrift: «Giv afslag — {navn}?» */
export function bekraeftOverskrift(knap: Knap, virksomhedsnavn: string): string {
  return `${knap.tekst} — ${virksomhedsnavn}?`;
}

/** Standarddatoen i datovælgeren: tre måneder frem, som ikke_nu (rykkerkoe.pauseTil). */
export function standardPauseTil(nu: Date): string {
  return pauseTil(nu);
}

/** En pause-dato skal være efter i dag (dansk dato) — samme regel som edge functionen. */
export function erGyldigPauseDato(dato: string, nu: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dato) && dato > nu.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}
