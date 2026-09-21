/**
 * ansoegningSpor — sporet på en ansøgnings side: hvem gjorde hvad hvornår
 * (ansoegning_beslutninger), og rykkerkøen (planlagte_haendelser) som
 * «planlagt til dato» / «sendt dato» / «annulleret». Ren: rækker ind,
 * læselige linjer ud. Navne på rådgivere slås op af fladen (profiles via
 * get_all_advisor_profiles) og gives ind som opslag.
 */
import type { Trin } from "@/lib/ansoegningTrin";
import { LUKKEAARSAG_ORD, TRIN_ORD, danskTidspunkt } from "./ansoegningVisning";

export interface BeslutningTilSpor {
  handling: string;
  fra_trin: Trin;
  til_trin: Trin;
  lukkeaarsag: string | null;
  truffet_af: string | null;
  truffet_via: string;
  begrundelse: string | null;
  truffet_at: string;
}

/** Beslutningernes ord — nøglerne SKAL være alle HandlingsArt (MENNESKE_ + SYSTEM_HANDLINGER); låst af ansoegningSporOrd.guard. */
export const HANDLING_ORD: Record<string, string> = {
  tal_med_dem: "indkaldte til samtale",
  afvis: "afviste ansøgningen",
  book: "bookede samtalen",
  aflys_booking: "aflyste samtalen",
  afholdt: "markerede samtalen som afholdt",
  // 21/9: sætningen er «{hvem} {hvad}» — et nøgent «kom ikke» ville sige, at RÅDGIVEREN udeblev.
  ikke_moedt: "markerede «kom ikke» — ansøgeren dukkede ikke op",
  tilbud: "sendte aftalegrundlaget",
  afslag: "gav afslag efter samtalen",
  underskrevet: "registrerede underskriften — virksomheden er oprettet",
  svarer_ikke: "lukkede: svarede ikke",
  udloeb: "lukkede: aftalegrundlaget udløb",
  ikke_nu: "trykkede «ikke nu» — pause i tre måneder",
  luk: "lukkede ansøgningen",
  genaabn: "genåbnede ansøgningen",
  saet_pause: "satte ansøgningen på pause",
  genoptag: "tog pausen af — ansøgningen er i gang igen",
  betalte_ikke: "lukkede: betalte ikke — dag 60 efter underskriften",
};

const VIA_ORD: Record<string, string> = {
  raadgiver: "",
  koe: "Rykkerkøen",
  calendly: "Ansøgeren (Calendly)",
  ansoeger_link: "Ansøgeren (sit link)",
  e_signatur: "E-underskriften",
};

export interface Sporlinje {
  tidspunkt: string;
  /** «18. september kl. 10.05» */
  naar: string;
  /** Hvem: rådgiverens navn, eller systemets ord. */
  hvem: string;
  hvad: string;
  detalje: string | null;
}

/** Nyeste først. `navnAf(userId)` slår rådgiverens navn op; ukendt → «En rådgiver». */
export function sporlinjer(beslutninger: readonly BeslutningTilSpor[], navnAf: (userId: string) => string | null): Sporlinje[] {
  return beslutninger
    .slice()
    .sort((a, b) => b.truffet_at.localeCompare(a.truffet_at))
    .map((b) => {
      const hvem = b.truffet_af ? (navnAf(b.truffet_af) ?? "En rådgiver") : (VIA_ORD[b.truffet_via] || "Systemet");
      const hvad = HANDLING_ORD[b.handling] ?? b.handling;
      const dele: string[] = [];
      if (b.lukkeaarsag && b.handling !== "afvis" && b.handling !== "afslag") dele.push(`årsag: ${LUKKEAARSAG_ORD[b.lukkeaarsag as keyof typeof LUKKEAARSAG_ORD] ?? b.lukkeaarsag}`);
      if (b.fra_trin !== b.til_trin) dele.push(`${TRIN_ORD[b.fra_trin].split(" — ")[0]} → ${TRIN_ORD[b.til_trin].split(" — ")[0]}`);
      if (b.begrundelse) dele.push(`«${b.begrundelse}»`);
      return { tidspunkt: b.truffet_at, naar: danskTidspunkt(b.truffet_at), hvem, hvad, detalje: dele.length ? dele.join(" · ") : null };
    });
}

export interface HaendelseTilSpor {
  trappe: string;
  trin_nr: number;
  handling: string;
  skabelon: string | null;
  modtager: string;
  planlagt_til: string;
  status: string;
  udfoert_at: string | null;
  annulleret_grund: string | null;
  fejl: string | null;
}

/** Køens mails — nøglerne SKAL være præcis KOE_SKABELONER (rykkerkoe.ts); låst af ansoegningSporOrd.guard. */
export const SKABELON_ORD: Record<string, string> = {
  "ansoegning-kladde-paamindelse": "påmindelse om kladden",
  "ansoegning-indkaldelse": "indkaldelsen",
  "ansoegning-indkaldt-rykker-1": "rykker 1 om samtalen",
  "ansoegning-indkaldt-rykker-2": "rykker 2 om samtalen",
  "ansoegning-indkaldt-rykker-3": "sidste rykker om samtalen",
  "ansoegning-samtale-i-morgen": "«i morgen»-påmindelsen",
  "ansoegning-samtale-i-dag": "«i dag»-påmindelsen",
  "ansoegning-aftalegrundlag": "aftalegrundlaget",
  "ansoegning-aftalegrundlag-rykker-1": "rykker 1 om aftalegrundlaget",
  "ansoegning-aftalegrundlag-rykker-2": "rykker 2 om aftalegrundlaget",
  "ansoegning-aftalegrundlag-rykker-3": "rykker 3 om aftalegrundlaget",
  "ansoegning-aftalegrundlag-rykker-4": "sidste rykker om aftalegrundlaget",
  "ansoegning-kvittering": "kvitteringen",
  "ansoegning-afslag": "afslagsmailen",
  "ansoegning-venteplads-tilbud": "ventelistens tilbud om pladsen",
  "ansoegning-venteplads-rykker": "rykker om ventepladsen",
  // Rådgiver-rykkerne (20/9): til kontakt@, ikke til ansøgeren — sporet skal kunne sige det.
  "ansoegning-ny-raadgiver-rykker-1": "rykker 1 til rådgiveren om den nye ansøgning",
  "ansoegning-ny-raadgiver-rykker-2": "sidste rykker til rådgiveren om den nye ansøgning",
  "ansoegning-afholdt-raadgiver-rykker": "rykker til rådgiveren efter samtalen",
};

/** Køens interne handlinger — nøglerne SKAL være alle KoeHandling ud over send_mail (TRAPPER); låst af ansoegningSporOrd.guard. */
export const INTERN_ORD: Record<string, string> = {
  luk_svarer_ikke: "lukkes «svarer ikke»",
  udloeb: "aftalegrundlaget udløber",
  marker_afholdt: "samtalen markeres afholdt",
  pause_slut: "pausen slutter — klokke til jer",
  venteplads_udloeb: "pladsen udløber — går videre til den næste i køen",
};

export type KoeStatus = "planlagt" | "sendt" | "udfoert" | "annulleret" | "fejlet";

/** Statusordene på pillen (Jonas 18/9, prøven pkt. 7: rå enum-værdier som «udfoert» så underlige ud). */
export const KOE_STATUS_ORD: Record<KoeStatus, string> = { planlagt: "planlagt", sendt: "sendt", udfoert: "udført", annulleret: "annulleret", fejlet: "fejlede" };

/** Hvorfor blev rækken annulleret — motoren skriver «<handling> (<via>)» (udfoerOvergang), cronen en sætning; det første oversættes. */
export function annulleringsOrd(grund: string | null): string | null {
  if (!grund) return null;
  const m = /^([a-z_]+) \(([a-z_]+)\)$/.exec(grund);
  if (!m) return grund;
  const [, art, via] = m;
  const hvad = HANDLING_ORD[art] ?? art;
  const hvem = via === "raadgiver" ? "en rådgiver" : (VIA_ORD[via] ?? via).toLowerCase();
  return `${hvem} ${hvad}`;
}

/** Mails uden om køen, som de står i email_send_log (template_name) — kvitteringen og køens mails ovenfor, samtalens tre, aftalelinket og mailen til jer. */
export const MAIL_ORD: Record<string, string> = {
  ...SKABELON_ORD,
  "ansoegning-samtale-bekraeftet": "bekræftelsen af samtalen",
  "ansoegning-samtale-flyttet": "den nye tid for samtalen",
  "ansoegning-samtale-aflyst": "aflysningen af samtalen",
  "aftale-link": "aftalegrundlaget (linket til underskrift)",
  "ansoegning-ny-raadgiver": "mailen til jer om den nye ansøgning (kontakt@)",
};
export const MAIL_STATUS_ORD: Record<string, string> = { sent: "sendt", failed: "fejlede", suppressed: "spærret modtager", rate_limited: "udbyderens loft (429)", bounced: "afvist (bounce)", complained: "klage", pending: "afventer" };

export interface Koelinje {
  status: KoeStatus;
  /** «rykker 2 om samtalen» / «lukkes «svarer ikke»» */
  hvad: string;
  /** «planlagt til 22. september kl. 10.00» / «sendt 20. september kl. 10.02» / «annulleret: …» */
  hvornaar: string;
  tidspunkt: string;
}

/** Ordner køen: planlagte først (næste øverst), så sendte/udførte (nyeste øverst), annullerede og fejlede sidst. */
export function koelinjer(haendelser: readonly HaendelseTilSpor[]): Koelinje[] {
  const ord = (h: HaendelseTilSpor) => (h.handling === "send_mail" ? (SKABELON_ORD[h.skabelon ?? ""] ?? h.skabelon ?? "mail") : (INTERN_ORD[h.handling] ?? h.handling));
  const linje = (h: HaendelseTilSpor): Koelinje => {
    const status = h.status as KoeStatus;
    const hvornaar =
      status === "planlagt" ? `planlagt til ${danskTidspunkt(h.planlagt_til)}`
      : status === "sendt" ? `sendt ${danskTidspunkt(h.udfoert_at ?? h.planlagt_til)}`
      : status === "udfoert" ? `udført ${danskTidspunkt(h.udfoert_at ?? h.planlagt_til)}`
      : status === "annulleret" ? `annulleret${h.annulleret_grund ? `: ${annulleringsOrd(h.annulleret_grund)}` : ""}`
      : `fejlede${h.fejl ? `: ${h.fejl}` : ""}`;
    return { status, hvad: ord(h), hvornaar, tidspunkt: h.udfoert_at ?? h.planlagt_til };
  };
  const rang: Record<KoeStatus, number> = { planlagt: 0, sendt: 1, udfoert: 1, annulleret: 2, fejlet: 2 };
  return haendelser
    .map(linje)
    .sort((a, b) => rang[a.status] - rang[b.status] || (a.status === "planlagt" ? a.tidspunkt.localeCompare(b.tidspunkt) : b.tidspunkt.localeCompare(a.tidspunkt)));
}

/** Den næste planlagte række — til listen («næste: rykker 2 · 22. september»). */
export function naesteIKoen(haendelser: readonly HaendelseTilSpor[]): Koelinje | null {
  return koelinjer(haendelser).find((l) => l.status === "planlagt") ?? null;
}
