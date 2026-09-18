/**
 * src/lib/hjemmebane/klokke.ts — klokken i Hjemmebane, de rene dele
 * (#171 medlemmet, #6 rådgiveren — 10/9-2026). Testet i __tests__/klokke.test.ts.
 *
 * HVORFOR: notifications (medlem) og advisor_notifications (rådgiver) blev
 * skrevet, men ingen Hjemmebane-side viste dem — klokkerne fandtes kun i den
 * gamle skal (NotificationCenter, AdvisorNotifications). Og mail-motoren
 * (send-notification-email) springer kun notifikationer over hvor seen_at er
 * sat; seen_at sættes kun når klokken åbnes. Uden klokke: alt mailes.
 *
 * TÆLLINGEN opfindes ikke: medlemmets «uset» er useNotifications' regel
 * (seen_at NULL og prioritet important/action_required — info-beskeder
 * tæller ikke i pillen), rådgiverens «ulæst» er AdvisorNotifications' (read_at
 * NULL). Én klokke, ét tal pr. rolle. Ingen pille når tallet er 0 — en
 * klokke uden tal er støj; en klokke med et tal er en opgave.
 *
 * DRIFT (afgjort): vagtens driftsbeskeder (type 'drift') står i SAMME liste
 * som resten, mærket «Drift». Vagten holder selv én åben besked pr. titel,
 * og forsidens Driften-linje er stedet for den løbende tilstand — en anden
 * tæller ville være en anden dom for det samme.
 */

import { renTekst } from "./richtext";

export type Prioritet = "info" | "important" | "action_required";

export interface MedlemsNotifikation {
  id: string;
  title: string;
  body: string | null;
  priority: Prioritet;
  deep_link: string | null;
  seen_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface RaadgiverNotifikation {
  id: string;
  type: string;
  title: string;
  body: string | null;
  company_id: string | null;
  member_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  read_at: string | null;
  created_at: string;
}

/** Medlemmets pille: uset OG vigtig — samme regel som useNotifications.unseenCount. */
export function erUset(n: Pick<MedlemsNotifikation, "seen_at" | "priority">): boolean {
  return !n.seen_at && (n.priority === "important" || n.priority === "action_required");
}

export const taelUsete = (liste: readonly Pick<MedlemsNotifikation, "seen_at" | "priority">[]): number =>
  liste.filter(erUset).length;

/** Rådgiverens pille: ulæst — samme regel som AdvisorNotifications.unreadCount. */
export const erUlaest = (n: Pick<RaadgiverNotifikation, "read_at">): boolean => !n.read_at;

export const taelUlaeste = (liste: readonly Pick<RaadgiverNotifikation, "read_at">[]): number =>
  liste.filter(erUlaest).length;

/** Pillens tekst: tallet, loft «99+». null når 0 — ingen pille. */
export function pilleTekst(antal: number): string | null {
  if (antal <= 0) return null;
  return antal > 99 ? "99+" : String(antal);
}

export const erDrift = (n: Pick<RaadgiverNotifikation, "type">): boolean => n.type === "drift";

/** Linjens tekst er ren tekst (14/9): klokken viste «<p>Hej Jonas, </p><p>Jo,
    …» ordret, fordi chat-uddraget var Tiptap-HTML. Kilden (send-slack-chat-
    notification) er rettet, men rækkerne der allerede ligger i databasen,
    bærer stadig tags — så klokken renser selv, med husets richtext-håndtering.
    Tom tekst bliver null, så linjen ikke får en tom underlinje. */
export function klokkeTekst(body: string | null | undefined): string | null {
  const t = renTekst(body);
  return t === "" ? null : t;
}

/** Driftsbeskedens body er «Cron-vagten (vagt_cron) kl. 19:00. Tallene: {…30
    nøgler…}» (vagt_cron, migration 20260910170000). Tallene hører ikke hjemme
    i klokken — de står i rækken og i cron_vagt_log, og forsidens Driften-linje
    oversætter dem. Her beholdes kun tiden; JSON'en udelades. En body uden
    «Tallene:» går uændret igennem. */
export function driftTekst(body: string | null | undefined): string | null {
  const hel = klokkeTekst(body);
  if (!hel) return null;
  const i = hel.indexOf("Tallene:");
  if (i < 0) return hel;
  const foer = hel.slice(0, i).trim().replace(/[.\s]+$/, "");
  return foer ? `${foer}. Tallene står i cron_vagt_log.` : "Tallene står i cron_vagt_log.";
}

/** Driftsbeskedens titel bærer dommen: «Driften: 3 cron-jobs svarede ikke 200
    den seneste time ({"200": 40, "500": 3}; 2 timeouts)». Svarkoderne står
    som rå JSON i titlen; her skrives de som forsidens linje gør det
    (cronVagt.ts koderTekst): «3 × 500», 200 udelades. Kan JSON'en ikke
    læses, står titlen som den er — aldrig en fejl i klokken. */
export function driftTitel(title: string): string {
  return title.replace(/\{[^{}]*\}/g, (json) => {
    try {
      const koder = JSON.parse(json) as Record<string, unknown>;
      const dele = Object.entries(koder)
        .filter(([k, n]) => k !== "200" && typeof n === "number")
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([k, n]) => `${n} × ${k === "intet_svar" ? "intet svar" : k}`);
      return dele.length ? dele.join(", ") : "alle 200";
    } catch {
      return json;
    }
  });
}

/** Én linje i udfoldningen — fælles form for begge roller. */
export interface KlokkeLinje {
  id: string;
  titel: string;
  tekst: string | null;
  tid: string;
  /** Vises som ny (prik + mørk tekst) til den er læst. */
  ny: boolean;
  /** Hvor klikket fører hen; null = ingen vej (kun markér læst). */
  til: string | null;
  maerke: "Drift" | "Kræver handling" | null;
}

export const KLOKKE_LOFT = 10;

/** Nyeste først, højst KLOKKE_LOFT. */
export function nyesteFoerst<T extends { created_at: string }>(liste: readonly T[], loft = KLOKKE_LOFT): T[] {
  return [...liste].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, loft);
}

export function medlemsLinje(n: MedlemsNotifikation): KlokkeLinje {
  return {
    id: n.id,
    titel: n.title,
    tekst: klokkeTekst(n.body),
    tid: n.created_at,
    ny: !n.read_at,
    til: n.deep_link,
    maerke: n.priority === "action_required" && !n.read_at ? "Kræver handling" : null,
  };
}

/** Indbakken — kun som fald-tilbage (se chatSti). */
export const CHAT_STI = "/chat";

/** Chatbeskedens vej (16/9, mangellisten «En chatbesked i klokken åbner
    indbakken, ikke samtalen»; Jonas' prioritet 1). Set på skærm 11/9: klik
    førte til /chat — indbakken.
    HVAD RÆKKEN BÆRER (send-slack-chat-notification, den eneste skriver med
    reference_type 'chat'): company_id = samtalens virksomhed (altid — uden
    virksomhed skrives ingen række), member_id = afsenderen, reference_id =
    BESKEDENS id. Samtalens id står ikke på rækken, og advisor_notifications
    har intet deep_link. Den gamle klokke slog messages.conversation_id op i
    databasen; det er ikke en ren funktion.
    NØGLEN ER VIRKSOMHEDEN: indbakken (CompanyChatPane) holder én samtale pr.
    virksomhed — den dedupliserer sin liste på company_id, og virksomheds-
    sidens Blok 4 er nøglet på samme id («Målt 4/9: højst én samtale pr.
    virksomhed»). Så ?companyId= vælger præcis den samtale rådgiveren selv
    ville klikke på i listen, og ?messageId= ruller til beskeden når den er
    hentet. Sandt for alle rækker, gamle som nye — uden writer-ændring.
    FALD-TILBAGE: uden company_id (rækker fra før writeren skrev virksomheden,
    eller en fremmed skriver) kan samtalen ikke findes → indbakken. */
export function chatSti(n: Pick<RaadgiverNotifikation, "company_id" | "reference_id">): string {
  if (!n.company_id) return CHAT_STI; // ingen virksomhed → ingen samtale at pege på
  const besked = n.reference_id ? `&messageId=${n.reference_id}` : "";
  return `${CHAT_STI}?companyId=${n.company_id}${besked}`;
}

/** Rådgiverens vej fra en besked — Hjemmebanes ruter, ikke det gamle /members.
    Virksomhedssiden er /virksomhed/:companyId (App.tsx, ental) — /virksomheder
    er LISTEN, og /virksomheder/{id} ramte NotFound (rettet 11/9, låst med
    kildeværn i __tests__/klokke.test.ts).
    Rapport: virksomhedssiden med rapporten foldet ud (?reportId, blok 6).
    Træk: virksomhedssiden rullet til «Aftalen» (?section=aftale), hvor
    «Betaling» med det fejlede træk står.
    Handout: virksomhedssiden uden opslag (den gamle klokke slog modulet op i
    databasen — det er ikke en ren funktion).
    Chat (16/9, Jonas' prioritet 1): SAMTALEN, ikke indbakken — chatSti.
    Community (16/9): et nyt opslag fra et medlem (notify-community-opslag,
    reference_type 'community_traad') fører til tråden, /community/{id} —
    uden reference_id til feedet. Ruten er MemberRoute; rådgivere passerer. */
export function raadgiverSti(n: Pick<RaadgiverNotifikation, "type" | "reference_type" | "reference_id" | "company_id">): string | null {
  if (n.type === "drift") return "/";
  const virksomhed = n.company_id ? `/virksomhed/${n.company_id}` : null;
  switch (n.reference_type) {
    case "report":
      return virksomhed ? (n.reference_id ? `${virksomhed}?reportId=${n.reference_id}` : virksomhed) : "/virksomheder";
    case "traek":
      return virksomhed ? `${virksomhed}?section=aftale` : "/virksomheder";
    case "handout":
      return virksomhed ?? "/virksomheder";
    case "chat":
      return chatSti(n);
    case "feedback":
      return `/admin/feedback${n.reference_id ? `?feedbackId=${n.reference_id}` : ""}`;
    // Ansøgningsmotoren (18/9): klokkerne ansoegning_* peger på ansøgningens egen side — der er ingen virksomhed før underskrift.
    case "ansoegning":
      return n.reference_id ? `/ansoegninger/${n.reference_id}` : "/ansoegninger";
    case "community_traad":
      return n.reference_id ? `/community/${n.reference_id}` : "/community";
    default:
      return virksomhed;
  }
}

export function raadgiverLinje(n: RaadgiverNotifikation): KlokkeLinje {
  const drift = erDrift(n);
  return {
    id: n.id,
    titel: drift ? driftTitel(n.title) : n.title,
    tekst: drift ? driftTekst(n.body) : klokkeTekst(n.body),
    tid: n.created_at,
    ny: erUlaest(n),
    til: raadgiverSti(n),
    maerke: drift ? "Drift" : null,
  };
}

export const KLOKKE_TOM = "Intet nyt.";
export const KLOKKE_LABEL = "Notifikationer";
