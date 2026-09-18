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

const HANDLING_ORD: Record<string, string> = {
  tal_med_dem: "indkaldte til samtale",
  afvis: "afviste ansøgningen",
  book: "bookede samtalen",
  aflys_booking: "aflyste samtalen",
  afholdt: "markerede samtalen som afholdt",
  tilbud: "sendte aftalegrundlaget",
  afslag: "gav afslag efter samtalen",
  underskrevet: "registrerede underskriften — virksomheden er oprettet",
  svarer_ikke: "lukkede: svarede ikke",
  udloeb: "lukkede: aftalegrundlaget udløb",
  ikke_nu: "trykkede «ikke nu» — pause i tre måneder",
  luk: "lukkede ansøgningen",
  genaabn: "genåbnede ansøgningen",
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

const SKABELON_ORD: Record<string, string> = {
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
};

const INTERN_ORD: Record<string, string> = {
  luk_svarer_ikke: "lukkes «svarer ikke»",
  udloeb: "aftalegrundlaget udløber",
  marker_afholdt: "samtalen markeres afholdt",
  pause_slut: "pausen slutter — klokke til jer",
};

export type KoeStatus = "planlagt" | "sendt" | "udfoert" | "annulleret" | "fejlet";

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
      : status === "annulleret" ? `annulleret${h.annulleret_grund ? `: ${h.annulleret_grund}` : ""}`
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
