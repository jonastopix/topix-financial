/**
 * chatStroem — ÉN dom om, hvilke beskeder der står i chatstrømmen og tæller
 * i samtalelisten (ulæst-tal og uddrag). Ren funktion, ingen React, ingen
 * Supabase. Testet i __tests__/chatStroem.test.ts; fladen låst af
 * __tests__/chatStroem.guard.test.ts.
 *
 * HVORFOR (mangellisten «Systembeskeder ud af chatstrømmen», Jonas 22/9:
 * «gør det»): målt 4/9 var 44 % af beskederne systembeskeder i samme strøm
 * som samtalen. Klokken og forsiden er nu stedet for begivenheder. Ikke en
 * ny model — et filter, i begge paner (CompanyChatPane, MemberChatPane) og
 * i det, der tæller ulæste (samtalelisten, sidebarens og mobilens badge), så
 * et tal aldrig peger på noget, chatten ikke viser.
 *
 * REGLEN: en systembesked forsvinder KUN fra chatten, hvis begivenheden
 * bevisligt står et andet sted, brugeren ser. Målt i koden 29/9-2026:
 *
 *   system · opgave_forslag  (foreslaa-opgave:245-253) → SKJULT. Forslaget er
 *     en company_actions-række med status 'proposed', og den står på
 *     medlemmets forside under «Dine skridt» (BoardroomView:1711,
 *     forsidePlan.ts:110 `forslag`) og på rådgiverens virksomhedsside i
 *     Planen (useVirksomhed.ts:286, VirksomhedPlanen). Chatlinjen var kun
 *     sporet af forslaget (foreslaa-opgave:236-244 selv).
 *
 * Alt andet BLIVER, fordi det IKKE når klokken eller forsiden i dag:
 *
 *   system · milestone  (useMilestones.fejr → chatActivity) — rådgiverens
 *     klokke læser kun advisor_notifications (useAdvisorNotifications), og
 *     milepælens klokkerække (send-slack-report-notification:181,
 *     milestone_completed) skrives til `notifications` for rådgiveren, som
 *     HbKlokke ikke læser for rådgivere. Medlemmets klokke får ingen række.
 *   system · agent  (run-company-agent write_chat_message) — klokkerækken
 *     (agent_insight) skrives kun når agenten OGSÅ kalder notify_advisor og
 *     der er en rådgiver; medlemmet får ingen klokkerække. Beskeden bærer
 *     desuden «Var dette nyttigt?»-knapperne, som kun findes i chatten.
 *   system uden kendt kontekst (ældre rækker, fremtidige skrivere) — ukendt
 *     er synligt: intet forsvinder, fordi dommen ikke kender det.
 *   ai — ingen kode skriver typen længere (C2, 31/8: rapportkortet er væk),
 *     og intet i koden skelner «medlemmet bad selv om analysen». Rækkerne der
 *     ligger, er ældre; uden en måling af, hvem der bad, bliver de.
 *   user, welcome, reflection-nudge, legat-momentum-reminder — samtale eller
 *     rådgiverens/platformens egen stemme til medlemmet; aldrig skjult.
 *
 * Nye skjulte typer tilføjes KUN her, med hvor begivenheden ellers ses.
 */

/** Det mindste af en besked dommen har brug for — matcher chatShared.Message. */
export interface StroemBesked {
  message_type?: string | null;
  context_type?: string | null;
}

/**
 * Systembeskeder, hvis begivenhed bevisligt ses uden for chatten.
 * Nøgle = context_type. Værdien er STEDET (dokumentation, læses af testen).
 */
export const SKJULTE_SYSTEM_KONTEKSTER: Readonly<Record<string, string>> = {
  opgave_forslag: "forsiden: «Dine skridt» (medlem) og Planen på virksomhedssiden (rådgiver)",
};

/** Sandt når beskeden står i chatstrømmen og tæller i liste, ulæst og uddrag. */
export function visesIChatstroem(besked: StroemBesked): boolean {
  if (besked.message_type !== "system") return true; // user, ai, welcome, nudge, ukendt: synligt
  const kontekst = besked.context_type;
  if (!kontekst) return true;
  return !Object.prototype.hasOwnProperty.call(SKJULTE_SYSTEM_KONTEKSTER, kontekst);
}

/** Beskederne i strømmen, i den rækkefølge de kom. */
export function chatStroem<T extends StroemBesked>(beskeder: readonly T[]): T[] {
  return beskeder.filter(visesIChatstroem);
}

/**
 * Samtalelistens uddrag: den nyeste synlige besked. `nyesteFoerst` er
 * beskederne i faldende tid (som panernes hentning). undefined når intet er
 * synligt — listen viser da intet uddrag frem for en skjult systemlinje.
 */
export function uddragsBesked<T extends StroemBesked>(nyesteFoerst: readonly T[]): T | undefined {
  return nyesteFoerst.find(visesIChatstroem);
}

/**
 * Samtalelistens ulæst-tal: menneskebeskeder fra andre end læseren, uden
 * read_at, der står i strømmen. (Definitionen var allerede kun 'user' i
 * begge paner; filteret gør, at et tal aldrig peger på en skjult linje.)
 */
export function taelUlaesteIListen<T extends StroemBesked & { sender_id: string; read_at?: string | null }>(
  beskeder: readonly T[],
  laeserId: string,
): number {
  return beskeder.filter(
    (m) => m.sender_id !== laeserId && !m.read_at && m.message_type === "user" && visesIChatstroem(m),
  ).length;
}

/**
 * Sidebarens og mobilens badge tæller også system og ai som ulæste
 * (mark_messages_read markerer user + system + ai, 20260420223823:26-33).
 * `typer` er den eksisterende dom for hvilke typer der tæller — filteret
 * lægges OVEN PÅ, så et skjult forslag aldrig bliver til et badge-tal.
 */
export function taelUlaesteBadge<T extends StroemBesked & { sender_id: string; read_at?: string | null }>(
  beskeder: readonly T[],
  laeserId: string,
  typer: readonly string[],
): number {
  return beskeder.filter(
    (m) =>
      m.sender_id !== laeserId &&
      !m.read_at &&
      typer.includes(m.message_type ?? "user") &&
      visesIChatstroem(m),
  ).length;
}
